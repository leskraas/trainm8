// The athlete chooses their lifting days (#597, ADR 0104 §4): _Meg → Trening →
// Styrke_ reads the active plan's strength track's **Pinned days**, shows the
// coming weeks as they would be laid (ADR 0084), writes the choice, and takes
// it back from its toast (ADR 0088).
//
// - **Chosen days** are stored on the track (`pinnedDays`, Monday first) and
//   written as `fixed` strength days in the Week Pattern, which the stamp lays
//   first and every other track's mix steps around. Their count becomes the
//   **Strength Frequency** answer on the Athlete Profile.
// - **_La appen velge_** clears the track's days and writes one **lifting
//   slot** per lift, which the stamp lays each week after the mix (§3). It
//   keeps the frequency the plan lifts at.
// - **An existing plan's `fixed` strength days** read as the chosen days and
//   are not moved until the athlete chooses otherwise.
//
// After a write the plan's weeks from the first unbegun one are laid again
// (`relayPlanFrom`), which only replaces the machine's untrained sessions.

import { type Prisma } from '@prisma/client'
import { addDays } from '../athlete-calendar.ts'
import { parseTrainableWeekdays } from '../athlete-schema.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { readStartStrength } from '../first-run/start-strength.server.ts'
import { readFirstUnbegunWeekKey } from '../load/week-begun.server.ts'
import { findActiveOutline } from '../training.server.ts'
import {
	clashesIn,
	placingClashes,
	readDays,
	type ClashReason,
	type PlacedSession,
} from './day-rule.ts'
import { relayPlanFrom } from './open-ended.server.ts'
import {
	pinnedDaysRefusal,
	serializePinnedDays,
	strengthPatternRows,
	strengthPinnedDays,
	withStrengthChoice,
	type PinnedDaysRefusal,
} from './pinned-days.ts'
import { readLaidWeeks, type LaidPatternInput } from './stamp.server.ts'
import { placedSessionOf, type StampWeekPlan } from './stamp.ts'
import {
	patternWeekdaysOf,
	patternWeekdaysOfCalendar,
	type PatternWeekday,
} from './week-pattern.ts'

/** How many coming weeks a change previews. */
export const STRENGTH_DAYS_PREVIEW_WEEKS = 4

/** The strength track's days as _Meg → Trening → Styrke_ reads them. */
export type StrengthDaysState = {
	outlineId: string
	trackId: string
	/** The Pinned days, Monday first, or `null` for _La appen velge_. */
	pinned: PatternWeekday[] | null
	/** How many lifts a week the plan's pattern holds now. */
	count: number
	/** Training Availability, Monday first; `null` where never set. */
	available: PatternWeekday[] | null
	/** The Strength Frequency answer on the profile. */
	answer: number | null
	/**
	 * What the athlete looked at, so a write made against a plan that changed
	 * since is refused rather than applied to something they never saw.
	 */
	version: string
}

/** Why a change to the lifting days was not made. */
export type StrengthDaysRefusal =
	| 'no-plan'
	| 'no-strength-track'
	| 'no-pattern'
	/** No strength session to lift: nothing of theirs, and no stock one. */
	| 'no-session'
	/** The plan changed since the athlete looked. */
	| 'stale'
	| PinnedDaysRefusal

/** The choice: days, or `null` for _La appen velge_. */
export type StrengthDaysChoice = PatternWeekday[] | null

const strengthRowSelect = {
	id: true,
	kind: true,
	weekday: true,
	orderInDay: true,
	workoutId: true,
} as const

/** The active plan's strength track and the pattern its weeks are laid from. */
async function readStrengthTrack(
	userId: string,
	now: Date,
	db: Prisma.TransactionClient = prisma,
) {
	const active = await findActiveOutline(userId, now)
	if (!active) return { ok: false as const, reason: 'no-plan' as const }
	const outlineId = active.outline.id
	const [track, pattern, profile] = await Promise.all([
		db.trainingTrack.findFirst({
			where: { outlineId, discipline: 'strength' },
			select: { id: true, pinnedDays: true },
		}),
		db.weekPattern.findFirst({
			where: { outlineId, days: { some: {} } },
			orderBy: { orderIndex: 'asc' },
			select: { id: true },
		}),
		db.athleteProfile.findUnique({
			where: { userId },
			select: { trainableWeekdays: true, strengthPerWeek: true },
		}),
	])
	if (!track)
		return { ok: false as const, reason: 'no-strength-track' as const }
	const rows = pattern
		? await db.weekPattern
				.findUniqueOrThrow({
					where: { id: pattern.id },
					select: {
						days: {
							where: { trackId: track.id },
							orderBy: [{ kind: 'asc' }, { orderInDay: 'asc' }],
							select: strengthRowSelect,
						},
					},
				})
				.then((found) => found.days)
		: []
	const pinned = strengthPinnedDays(track, rows)
	const available =
		profile?.trainableWeekdays == null
			? null
			: patternWeekdaysOfCalendar(
					parseTrainableWeekdays(profile.trainableWeekdays),
				)
	const state: StrengthDaysState = {
		outlineId,
		trackId: track.id,
		pinned,
		count: rows.length,
		available: available && available.length > 0 ? available : null,
		answer: profile?.strengthPerWeek ?? null,
		version: `${serializePinnedDays(pinned) ?? 'auto'}|${rows.length}`,
	}
	return { ok: true as const, state, patternId: pattern?.id ?? null, rows }
}

/**
 * The active plan's strength track's days, or `null` where there is no plan
 * or no strength track — and then there is nothing to choose days for.
 */
export async function readStrengthDays(
	userId: string,
	now: Date = new Date(),
): Promise<StrengthDaysState | null> {
	const read = await readStrengthTrack(userId, now)
	return read.ok ? read.state : null
}

/** One coming week, before and after a change, as the day rule reads it. */
export type StrengthDaysPreviewWeek = {
	weekKey: string
	weekInPlan: number
	before: { lifting: PatternWeekday[]; hard: PatternWeekday[] }
	after: {
		lifting: PatternWeekday[]
		hard: PatternWeekday[]
		/**
		 * The lifting clashes the week would have (ADR 0104 §1), each with
		 * whether a chosen day takes part — kept as chosen, and said.
		 */
		clashes: Array<{
			reason: ClashReason
			weekday: PatternWeekday
			pinned: boolean
		}>
	}
}

export type StrengthDaysPreview =
	| {
			ok: true
			choice: StrengthDaysChoice
			/** How many lifts a week the choice lays. */
			count: number
			weeks: StrengthDaysPreviewWeek[]
			version: string
	  }
	| { ok: false; reason: StrengthDaysRefusal }

/**
 * The coming weeks as the stamp would lay them with the choice — the plan's
 * own `planStamp` over its own pattern, with the strength track's days
 * swapped — beside how they are laid now. Writes nothing.
 */
export async function previewStrengthDays(
	userId: string,
	choice: StrengthDaysChoice,
	now: Date = new Date(),
): Promise<StrengthDaysPreview> {
	const read = await readStrengthTrack(userId, now)
	if (!read.ok) return read
	const { state } = read
	if (choice) {
		const refusal = pinnedDaysRefusal(choice, state.available)
		if (refusal) return { ok: false, reason: refusal }
	}
	const workoutId = await liftedWorkoutId(userId, read.rows, now)
	if (!workoutId) return { ok: false, reason: 'no-session' }
	const count = choice ? choice.length : Math.max(state.count, 1)

	const timezone = await getAthleteTimezone(userId)
	const from = await readFirstUnbegunWeekKey(userId, now, timezone)
	const weekKeys = Array.from({ length: STRENGTH_DAYS_PREVIEW_WEEKS }, (_, i) =>
		addDays(from, i * 7),
	)
	const swap = (laid: LaidPatternInput) =>
		withStrengthChoice(laid, {
			trackId: state.trackId,
			choice,
			count,
			workoutId,
		})
	const [before, after] = await Promise.all([
		readLaidWeeks(userId, state.outlineId, weekKeys),
		readLaidWeeks(userId, state.outlineId, weekKeys, swap),
	])
	if (!before || !after) return { ok: false, reason: 'no-pattern' }

	const weeks = after.plans.map((plan, index) => {
		const was = before.plans[index]
		const laidAfter = placedWeek(plan, after.input, after.tracks)
		return {
			weekKey: plan.weekKey,
			weekInPlan: plan.weekInPlan,
			before: was
				? dayKinds(placedWeek(was, before.input, before.tracks))
				: { lifting: [], hard: [] },
			after: {
				...dayKinds(laidAfter),
				clashes: liftingClashes(laidAfter, choice),
			},
		}
	})
	return { ok: true, choice, count, weeks, version: state.version }
}

/** A laid week's sessions as the day rule reads them. */
function placedWeek(
	plan: StampWeekPlan,
	input: LaidPatternInput,
	tracks: ReadonlyArray<{ trackId: string; discipline: string }>,
): PlacedSession[] {
	const dayById = new Map(input.days.map((day) => [day.dayId, day]))
	return plan.sessions.map((session) =>
		placedSessionOf(
			session,
			dayById.get(session.dayId),
			tracks.find((track) => track.trackId === session.trackId)
				?.discipline as Parameters<typeof placedSessionOf>[2],
		),
	)
}

function dayKinds(week: readonly PlacedSession[]) {
	const days = readDays(week)
	return {
		lifting: days.filter((day) => day.lifting).map((day) => day.weekday),
		hard: days.filter((day) => day.hard).map((day) => day.weekday),
	}
}

/**
 * The week's clashes that lifting takes part in, each marked pinned where a
 * lift on a chosen day causes it (as the fit check marks them).
 */
function liftingClashes(
	week: readonly PlacedSession[],
	choice: StrengthDaysChoice,
): StrengthDaysPreviewWeek['after']['clashes'] {
	const key = (clash: { reason: string; weekday: number }) =>
		`${clash.weekday}|${clash.reason}`
	const fromPinned = new Set(
		week.flatMap((session, at) =>
			session.kind === 'lifting' && choice?.includes(session.weekday)
				? placingClashes(
						week.filter((_, other) => other !== at),
						session,
					).map(key)
				: [],
		),
	)
	return clashesIn(week)
		.filter((clash) => clash.reason.startsWith('lifting-'))
		.map((clash) => ({ ...clash, pinned: fromPinned.has(key(clash)) }))
}

/**
 * The session the track lifts: the one its pattern rows already copy, or
 * else what the first run would lift — the athlete's latest strength session,
 * or the full-body Stock Workout.
 */
async function liftedWorkoutId(
	userId: string,
	rows: ReadonlyArray<{ workoutId: string | null }>,
	now: Date,
): Promise<string | null> {
	const own = rows.find((row) => row.workoutId != null)?.workoutId
	if (own) return own
	return (await readStartStrength(userId, now))?.workoutId ?? null
}

/** What a write replaced, so its toast can put it back. */
export type StrengthDaysPrevious = {
	days: StrengthDaysChoice
	count: number
	answer: number | null
}

export type StrengthDaysWrite =
	| {
			ok: true
			choice: StrengthDaysChoice
			count: number
			previous: StrengthDaysPrevious
			/** The state's version after the write, for the undo. */
			version: string
	  }
	| { ok: false; reason: StrengthDaysRefusal }

/**
 * Write the choice, if the plan is still what the athlete looked at
 * (`version`), and lay the weeks again. An undo (`restore`) puts back what a
 * write replaced exactly — the days, the number of lifts and the frequency
 * answer — and is held to no rule the earlier state was not.
 */
export async function setStrengthDays(
	userId: string,
	{
		choice,
		version,
		restore,
	}: {
		choice: StrengthDaysChoice
		version: string
		/** An undo: the count and answer to put back with the days. */
		restore?: { count: number; answer: number | null }
	},
	now: Date = new Date(),
): Promise<StrengthDaysWrite> {
	const days = choice ? patternWeekdaysOf(choice) : null
	const result = await prisma.$transaction(
		async (tx): Promise<StrengthDaysWrite & { outlineId?: string }> => {
			const read = await readStrengthTrack(userId, now, tx)
			if (!read.ok) return read
			const { state, rows } = read
			if (state.version !== version) return { ok: false, reason: 'stale' }
			if (!read.patternId) return { ok: false, reason: 'no-pattern' }
			if (days && !restore) {
				const refusal = pinnedDaysRefusal(days, state.available)
				if (refusal) return { ok: false, reason: refusal }
			}
			const workoutId = await liftedWorkoutId(userId, rows, now)
			if (!workoutId) return { ok: false, reason: 'no-session' }
			const count = days
				? days.length
				: (restore?.count ?? Math.max(state.count, 1))

			await tx.weekPatternDay.deleteMany({
				where: { patternId: read.patternId, trackId: state.trackId },
			})
			const others = await tx.weekPatternDay.findMany({
				where: { patternId: read.patternId, weekday: { not: null } },
				select: { weekday: true, orderInDay: true },
			})
			for (const [index, row] of strengthPatternRows(
				days,
				count,
				workoutId,
			).entries()) {
				await tx.weekPatternDay.create({
					data: {
						patternId: read.patternId,
						trackId: state.trackId,
						kind: row.kind,
						weekday: row.weekday,
						workoutId: row.workoutId,
						// A lift comes after the day's endurance session.
						orderInDay:
							row.weekday == null
								? index
								: Math.max(
										-1,
										...others
											.filter((other) => other.weekday === row.weekday)
											.map((other) => other.orderInDay),
									) + 1,
					},
				})
			}
			await tx.trainingTrack.update({
				where: { id: state.trackId },
				data: { pinnedDays: serializePinnedDays(days) },
			})
			// The number of chosen days *is* the Strength Frequency.
			const answer = restore ? restore.answer : days ? days.length : undefined
			if (answer !== undefined) {
				await tx.athleteProfile.upsert({
					where: { userId },
					update: { strengthPerWeek: answer },
					create: { userId, strengthPerWeek: answer },
				})
			}
			return {
				ok: true,
				choice: days,
				count,
				previous: {
					days: state.pinned,
					count: state.count,
					answer: state.answer,
				},
				version: `${serializePinnedDays(days) ?? 'auto'}|${count}`,
				outlineId: state.outlineId,
			}
		},
	)
	if (!result.ok) return result
	const { outlineId, ...written } = result
	if (outlineId) {
		try {
			const timezone = await getAthleteTimezone(userId)
			const from = await readFirstUnbegunWeekKey(userId, now, timezone)
			await relayPlanFrom(userId, outlineId, from, timezone, now)
		} catch (error) {
			console.error('[strength-days] laying weeks after a change failed', error)
		}
	}
	return written
}
