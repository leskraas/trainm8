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
	isPatternWeekday,
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
	const [track, profile] = await Promise.all([
		db.trainingTrack.findFirst({
			where: { outlineId, discipline: 'strength' },
			select: { id: true, pinnedDays: true },
		}),
		db.athleteProfile.findUnique({
			where: { userId },
			select: { trainableWeekdays: true, strengthPerWeek: true },
		}),
	])
	if (!track)
		return { ok: false as const, reason: 'no-strength-track' as const }
	// Every pattern with days, with the track's rows in each: the first is
	// the one the weeks are laid from and the choice is read off; a choice
	// holds in every one that lifts.
	const [pattern, ...others] = await db.weekPattern.findMany({
		where: { outlineId, days: { some: {} } },
		orderBy: { orderIndex: 'asc' },
		select: {
			id: true,
			days: {
				where: { trackId: track.id },
				orderBy: [{ kind: 'asc' }, { orderInDay: 'asc' }],
				select: strengthRowSelect,
			},
		},
	})
	const rows = pattern?.days ?? []
	const elsewhere = others.filter((other) => other.days.length > 0)
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
	return {
		ok: true as const,
		state,
		patternId: pattern?.id ?? null,
		rows,
		elsewhere,
	}
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

/** A strength block's **Strength Frequency**, as a write found it. */
export type StrengthBlockFrequency = {
	segmentId: string
	sessionsPerWeek: number | null
}

/** What a write replaced, so its toast can put it back. */
export type StrengthDaysPrevious = {
	days: StrengthDaysChoice
	count: number
	answer: number | null
	/** The track's strength blocks' frequencies, which chosen days set. */
	frequencies: StrengthBlockFrequency[]
	/** The track's rows the write replaced in the plan's other patterns. */
	elsewhere: Array<{ patternId: string; rows: StrengthRow[] }>
}

/** One strength row of a Week Pattern, as a write found it. */
export type StrengthRow = {
	kind: 'fixed' | 'lifting'
	weekday: PatternWeekday | null
	workoutId: string | null
}

/** A stored row as a write puts it back; nothing for a row of no kind here. */
function strengthRowOf(row: {
	kind: string
	weekday: number | null
	workoutId: string | null
}): StrengthRow[] {
	if (row.kind === 'lifting') {
		return [{ kind: 'lifting', weekday: null, workoutId: row.workoutId }]
	}
	if (
		row.kind === 'fixed' &&
		row.weekday != null &&
		isPatternWeekday(row.weekday)
	) {
		return [{ kind: 'fixed', weekday: row.weekday, workoutId: row.workoutId }]
	}
	return []
}

/**
 * Rows an undo sends back, held to what a strength track could hold: a
 * fixed row on a real weekday, a lifting slot on none, and only the
 * athlete's own strength sessions. `null` where any is not.
 */
async function checkedStrengthRestore(
	tx: Prisma.TransactionClient,
	userId: string,
	rows: readonly StrengthRow[],
): Promise<StrengthRow[] | null> {
	for (const row of rows) {
		if (
			row.kind === 'fixed' &&
			(row.weekday == null || !isPatternWeekday(row.weekday))
		) {
			return null
		}
		if (row.kind === 'lifting' && row.weekday != null) return null
	}
	const workoutIds = [
		...new Set(rows.flatMap((row) => (row.workoutId ? [row.workoutId] : []))),
	]
	const owned = await tx.workout.count({
		where: { id: { in: workoutIds }, ownerId: userId, discipline: 'strength' },
	})
	return owned === workoutIds.length ? [...rows] : null
}

/**
 * Put `rows` in place of the strength track's rows in one pattern: a lift
 * after the day's endurance session, the slots in their own order.
 */
async function writeStrengthRows(
	tx: Prisma.TransactionClient,
	patternId: string,
	trackId: string,
	rows: readonly StrengthRow[],
) {
	await tx.weekPatternDay.deleteMany({ where: { patternId, trackId } })
	const others = await tx.weekPatternDay.findMany({
		where: { patternId, weekday: { not: null } },
		select: { weekday: true, orderInDay: true },
	})
	for (const [index, row] of rows.entries()) {
		await tx.weekPatternDay.create({
			data: {
				patternId,
				trackId,
				kind: row.kind,
				weekday: row.weekday,
				workoutId: row.workoutId,
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
		/**
		 * An undo: the count, the answer and the blocks' frequencies to put
		 * back with the days.
		 */
		restore?: {
			count: number
			answer: number | null
			frequencies?: readonly StrengthBlockFrequency[]
			elsewhere?: ReadonlyArray<{
				patternId: string
				rows: readonly StrengthRow[]
			}>
		}
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

			// The choice holds in every other pattern that lifts, so a week
			// stamped from any of them lifts on the athlete's days; an undo puts
			// back what each had. Every pattern's rows are settled before
			// anything is written.
			const others: Array<{ patternId: string; rows: StrengthRow[] }> = []
			for (const other of read.elsewhere) {
				const back = restore?.elsewhere?.find(
					(entry) => entry.patternId === other.id,
				)
				const rows = back
					? await checkedStrengthRestore(tx, userId, back.rows)
					: strengthPatternRows(
							days,
							days ? days.length : other.days.length,
							other.days.find((row) => row.workoutId != null)?.workoutId ??
								workoutId,
						)
				if (!rows) return { ok: false, reason: 'stale' }
				others.push({ patternId: other.id, rows })
			}

			await writeStrengthRows(
				tx,
				read.patternId,
				state.trackId,
				strengthPatternRows(days, count, workoutId),
			)
			for (const other of others) {
				await writeStrengthRows(tx, other.patternId, state.trackId, other.rows)
			}
			await tx.trainingTrack.update({
				where: { id: state.trackId },
				data: { pinnedDays: serializePinnedDays(days) },
			})
			// The number of chosen days *is* the Strength Frequency: the
			// profile's answer and every strength block of the track (story 20),
			// so the two never disagree. An undo puts back what each said.
			const answer = restore ? restore.answer : days ? days.length : undefined
			if (answer !== undefined) {
				await tx.athleteProfile.upsert({
					where: { userId },
					update: { strengthPerWeek: answer },
					create: { userId, strengthPerWeek: answer },
				})
			}
			const frequencies = await tx.trainingTrackSegment.findMany({
				where: { trackId: state.trackId, kind: 'strength' },
				orderBy: { id: 'asc' },
				select: { id: true, sessionsPerWeek: true },
			})
			if (restore) {
				const own = new Set(frequencies.map((segment) => segment.id))
				for (const back of restore.frequencies ?? []) {
					if (!own.has(back.segmentId)) continue
					await tx.trainingTrackSegment.update({
						where: { id: back.segmentId },
						data: { sessionsPerWeek: back.sessionsPerWeek },
					})
				}
			} else if (days) {
				await tx.trainingTrackSegment.updateMany({
					where: { trackId: state.trackId, kind: 'strength' },
					data: { sessionsPerWeek: days.length },
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
					frequencies: frequencies.map((segment) => ({
						segmentId: segment.id,
						sessionsPerWeek: segment.sessionsPerWeek,
					})),
					elsewhere: read.elsewhere.map((other) => ({
						patternId: other.id,
						rows: other.days.flatMap(strengthRowOf),
					})),
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
