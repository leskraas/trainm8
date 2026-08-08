// The athlete's own recent training, read per Discipline, for the **Season
// Anchor** pre-fill and the **Volume Currency** proposal (ADR 0040 §6, ADR 0043
// §2).
//
// The window is the `ANCHOR_WINDOW_WEEKS` **complete** Training Weeks before the
// current one, in the **Athlete Timezone** — "your last 4 weeks", which is the
// copy the ADR wrote. The week in progress is deliberately excluded: on a Tuesday
// it would drag the average down with two days of a week that still has five to
// run.
//
// This reads history **once, at authoring time**. The value it produces is
// pre-filled and then authored; nothing re-reads it afterwards, so a plan never
// mutates from activities arriving in the background — the failure ADR 0025
// exists to prevent (ADR 0040 §6).

import { addDays, dayBoundsUTC, weekMonday } from '../athlete-calendar.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	type Discipline,
} from '../workout-schema.ts'
import {
	ANCHOR_WINDOW_WEEKS,
	type EnduranceWindow,
	type LoggedVolume,
} from './proposal.ts'

/** What the authoring flow needs to propose a track and default a start week. */
export type AnchorContext = {
	timezone: string
	/** The Monday opening the current Training Week — the Plan Start Week's default. */
	currentWeekKey: string
	/** Every Discipline's logged volume over the pre-fill window. */
	volumes: LoggedVolume[]
	/**
	 * The same window summed across the **endurance** Disciplines, for the **Weekly
	 * Capacity** pre-fill (ADR 0050 §2).
	 *
	 * Beside `volumes` rather than derived from them, because its `weeksTrained` is
	 * the **union** of the Disciplines' weeks: an athlete who ran on Monday and swam
	 * on Thursday trained one week, and summing two per-Discipline counts would say
	 * two. The same walk produces both, so the capacity proposal and the anchor
	 * proposals cannot disagree about what the athlete did.
	 */
	endurance: EnduranceWindow
}

/**
 * Read the pre-fill window.
 *
 * Every Discipline comes back, including the ones with nothing in them, so a
 * caller never has to tell "no entry" apart from "no training".
 */
export async function readAnchorContext(
	athleteId: string,
	now: Date = new Date(),
): Promise<AnchorContext> {
	const timezone = await getAthleteTimezone(athleteId)
	const currentWeekKey = weekMonday(now, timezone)
	const firstWeekKey = addDays(currentWeekKey, -7 * ANCHOR_WINDOW_WEEKS)
	const window = {
		start: dayBoundsUTC(firstWeekKey, timezone).start,
		end: dayBoundsUTC(addDays(currentWeekKey, -1), timezone).end,
	}

	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId: athleteId,
			status: 'completed',
			scheduledAt: { gte: window.start, lte: window.end },
		},
		select: {
			scheduledAt: true,
			// Endurance volume is the **Recording's**: a hand-logged session carries no
			// achieved distance or duration, and prescribing one is not recording it.
			recording: {
				select: { discipline: true, distanceM: true, durationSec: true },
			},
			// Strength has no set-level recording anywhere in the model, so a completed
			// strength session's own sets are the athlete's log of what they lifted —
			// countable from their log, which is what makes the systemic `sets` figure
			// defensible (ADR 0047 §2).
			workout: {
				select: {
					discipline: true,
					blocks: {
						select: {
							repeatCount: true,
							steps: { select: { sets: { select: { id: true } } } },
						},
					},
				},
			},
		},
	})

	const buckets = new Map<Discipline, Bucket>(
		DISCIPLINES.map((discipline) => [discipline, emptyBucket()]),
	)

	for (const session of sessions) {
		const weekKey = weekMonday(session.scheduledAt, timezone)

		if (session.recording) {
			const bucket = buckets.get(session.recording.discipline as Discipline)
			if (!bucket) continue
			bucket.sessions += 1
			bucket.weeks.add(weekKey)
			if (session.recording.distanceM != null) {
				bucket.metres = (bucket.metres ?? 0) + session.recording.distanceM
			}
			bucket.seconds = (bucket.seconds ?? 0) + session.recording.durationSec
			continue
		}

		if (session.workout?.discipline === 'strength') {
			const bucket = buckets.get('strength')!
			bucket.sessions += 1
			bucket.weeks.add(weekKey)
			bucket.sets = (bucket.sets ?? 0) + countSets(session.workout.blocks)
		}
	}

	return {
		timezone,
		currentWeekKey,
		endurance: enduranceWindow(buckets),
		volumes: DISCIPLINES.map((discipline) => {
			const bucket = buckets.get(discipline)!
			return {
				discipline,
				sessions: bucket.sessions,
				weeksTrained: bucket.weeks.size,
				km: bucket.metres == null ? null : bucket.metres / 1000,
				hours: bucket.seconds == null ? null : bucket.seconds / 3600,
				sets: bucket.sets,
			}
		}),
	}
}

type Bucket = {
	sessions: number
	weeks: Set<string>
	/** Null until something records one, so "recorded nothing" stays distinct from 0. */
	metres: number | null
	seconds: number | null
	sets: number | null
}

/**
 * The endurance Disciplines' buckets summed into the one window a **Weekly
 * Capacity** is proposed from (ADR 0050 §2).
 *
 * Two properties worth stating. `weeksTrained` unions the week keys instead of
 * adding the counts, so a week holding a run and a swim counts once — the figure
 * exists to explain a low average, and an inflated one would explain it wrongly.
 * And `hours` stays `null` until something records a duration, so "trained but
 * recorded no duration" never collapses into "trained 0 hours".
 */
function enduranceWindow(buckets: Map<Discipline, Bucket>): EnduranceWindow {
	const weeks = new Set<string>()
	let sessions = 0
	let seconds: number | null = null

	for (const discipline of CARDIO_DISCIPLINES) {
		const bucket = buckets.get(discipline)
		if (!bucket) continue
		sessions += bucket.sessions
		for (const week of bucket.weeks) weeks.add(week)
		if (bucket.seconds != null) seconds = (seconds ?? 0) + bucket.seconds
	}

	return {
		sessions,
		weeksTrained: weeks.size,
		hours: seconds == null ? null : seconds / 3600,
	}
}

function emptyBucket(): Bucket {
	return {
		sessions: 0,
		weeks: new Set(),
		metres: null,
		seconds: null,
		sets: null,
	}
}

/**
 * Total working sets across a workout's blocks: a repeated block's sets count
 * once per repeat, the same reading `sumBlockDurationMin` gives duration.
 */
function countSets(
	blocks: Array<{ repeatCount: number; steps: Array<{ sets: unknown[] }> }>,
): number {
	let total = 0
	for (const block of blocks) {
		for (const step of block.steps) {
			total += step.sets.length * block.repeatCount
		}
	}
	return total
}
