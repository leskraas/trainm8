/**
 * The **Performance Result** writer (#464, ADR 0007 as amended): the athlete's
 * own race and time-trial results, typed on Meg.
 *
 * **A typed result is never `verified`.** The schema reserves `verified` for an
 * effort whose telemetry the app itself read, so a hand-typed figure never
 * masquerades as a measured one; this writer has no telemetry and always
 * writes `false`.
 *
 * **Only the six Race Anchor distances, run only.** A result is the datum a
 * `racePace` target resolves against, and rung 1 matches distance exactly, so
 * the form offers the anchors rather than free metres (a 4.8 km parkrun is not
 * a 5k). Every `racePace` row in the corpus is a run.
 *
 * **One result per distance and day.** A second result at the same anchor on
 * the same day is the athlete correcting a typo, so it replaces the first
 * rather than leaving two rows the resolver has to choose between.
 *
 * **The athlete's own day.** A result is a calendar day, anchored at UTC
 * midnight as an Event date is, and "in the future" is judged against today in
 * the athlete's timezone — a race finished just after local midnight is not
 * refused because the server is still on yesterday.
 */
import { localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import {
	isCalendarDay,
	isPlausibleFinishTime,
	type PerformanceSource,
} from './performance-result-entry.ts'
import { raceAnchorForDistance } from './performance-result.server.ts'
import { RACE_ANCHOR_DISTANCE_M, type RaceAnchor } from './workout-schema.ts'

export type PerformanceResultInput = {
	anchor: RaceAnchor
	timeSec: number
	/** The day of the result, `YYYY-MM-DD`, in the athlete's calendar. */
	date: string
	source: PerformanceSource
}

export type PerformanceResultRefusal =
	| 'bad-date'
	| 'future'
	| 'implausible'
	| 'no-profile'

export type PerformanceResultRow = {
	id: string
	anchor: RaceAnchor | null
	distanceM: number
	timeSec: number
	occurredAt: Date
	source: string
	verified: boolean
}

/** Every read of the athlete's typed results goes through this one filter, so
 * the list and the count agree with the resolver: run results only. */
const runResultsOf = (userId: string) => ({
	athleteProfile: { userId },
	discipline: 'run',
})

/** The athlete's local calendar day today, `YYYY-MM-DD` (UTC without a
 * profile), for the form's default and limit. */
export async function performanceResultToday(
	userId: string,
	now: Date = new Date(),
): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return localDate(now, profile?.timezone ?? 'UTC')
}

export async function addPerformanceResult(
	userId: string,
	input: PerformanceResultInput,
	now: Date = new Date(),
): Promise<
	| { ok: true; replaced: boolean }
	| { ok: false; reason: PerformanceResultRefusal }
> {
	if (!isCalendarDay(input.date)) return { ok: false, reason: 'bad-date' }
	if (!isPlausibleFinishTime(input.anchor, input.timeSec)) {
		return { ok: false, reason: 'implausible' }
	}
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { id: true, timezone: true },
	})
	if (!profile) return { ok: false, reason: 'no-profile' }
	// Same-shape `YYYY-MM-DD` strings compare as days.
	if (input.date > localDate(now, profile.timezone)) {
		return { ok: false, reason: 'future' }
	}
	const sameDay = {
		athleteProfileId: profile.id,
		discipline: 'run',
		distanceM: RACE_ANCHOR_DISTANCE_M[input.anchor],
		occurredAt: new Date(`${input.date}T00:00:00Z`),
	}
	const [{ count }] = await prisma.$transaction([
		prisma.performanceResult.deleteMany({ where: sameDay }),
		prisma.performanceResult.create({
			data: {
				...sameDay,
				timeSec: input.timeSec,
				source: input.source,
				verified: false,
			},
		}),
	])
	return { ok: true, replaced: count > 0 }
}

/** The athlete's run results, newest first (the newest typed first on a tie). */
export async function listPerformanceResults(
	userId: string,
): Promise<PerformanceResultRow[]> {
	const rows = await prisma.performanceResult.findMany({
		where: runResultsOf(userId),
		orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
		select: {
			id: true,
			distanceM: true,
			timeSec: true,
			occurredAt: true,
			source: true,
			verified: true,
		},
	})
	return rows.map((row) => ({
		...row,
		anchor: raceAnchorForDistance(row.distanceM),
	}))
}

/** How many run results the athlete has, for the Meg row. */
export async function countPerformanceResults(userId: string): Promise<number> {
	return prisma.performanceResult.count({ where: runResultsOf(userId) })
}

/** Delete one of the athlete's own results; false when it is not theirs. */
export async function deletePerformanceResult(
	userId: string,
	id: string,
): Promise<boolean> {
	const { count } = await prisma.performanceResult.deleteMany({
		where: { id, athleteProfile: { userId } },
	})
	return count === 1
}
