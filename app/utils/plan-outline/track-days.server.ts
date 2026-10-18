// The athlete chooses the days of every other track and Simple Activity
// (#598, ADR 0104 §4) — _Plan → Avansert_, beside the strength track's days in
// _Meg_ (#597, `strength-days.server.ts`), and by the same control:
//
// - **An endurance track** (run, bike, swim): _La appen velge_, the default,
//   or weekday chips limited to **Training Availability**. The chosen days are
//   stored on the track (`pinnedDays`, Monday first), and its Week Pattern
//   rows move onto them: one session a day, the track's week spread over them
//   (`trackRowsOnDays`). Back to _La appen velge_, the track's days are dealt
//   again by the starter pattern's rule around the other tracks
//   (`trackRowsByRule`).
// - **A Simple Activity**: its `fixed` days, which are always the athlete's —
//   _langrenn_ on Saturday. There is no rule to hand them back to: an Activity
//   carries no mix and no volume of its own to deal.
//
// A change shows the coming weeks as the stamp would lay them before it
// writes (ADR 0084), refuses a write made against a plan that changed since,
// lays the weeks again from the first unbegun one (`relayPlanFrom`), and is
// undone from its toast (ADR 0088) by putting back exactly the rows it
// replaced.
//
// And when the athlete takes a day out of their Training Availability in
// _Meg_, every track that pinned it loses it, and they are told which
// (`dropUnavailablePinnedDays`, spec #588 story 19).

import { type Prisma } from '@prisma/client'
import { addDays } from '../athlete-calendar.ts'
import {
	getAthleteTimezone,
	readAvailablePatternDays,
} from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { readFirstUnbegunWeekKey } from '../load/week-begun.server.ts'
import { SIMPLE_ACTIVITY_DISCIPLINE } from '../simple-activity.ts'
import { findActiveOutline } from '../training.server.ts'
import {
	type PlannedDiscipline,
	readPlannedDiscipline,
} from '../planned-discipline.ts'
import { isCardioDiscipline, type CardioDiscipline } from '../workout-schema.ts'
import {
	clashesIn,
	placingClashes,
	readDays,
	type ClashReason,
	type PlacedSession,
} from './day-rule.ts'
import { relayPlanFrom } from './open-ended.server.ts'
import {
	parsePinnedDays,
	pinnedDaysRefusal,
	pinnedDaysWithin,
	serializePinnedDays,
	trackRowsByRule,
	trackRowsOnDays,
	withTrackRows,
	type DayChoiceUnit,
	type PinnedDaysRefusal,
	type TrackPatternRow,
} from './pinned-days.ts'
import { readLaidWeeks, type LaidPatternInput } from './stamp.server.ts'
import { placedWeekOf, type StampWeekPlan } from './stamp.ts'
import { readStrengthDays, setStrengthDays } from './strength-days.server.ts'
import {
	isPatternWeekday,
	PATTERN_WEEKDAYS,
	patternWeekdaysOf,
	type PatternWeekday,
} from './week-pattern.ts'

/** How many coming weeks a change previews, as the strength days do. */
export const TRACK_DAYS_PREVIEW_WEEKS = 4

/** The order the endurance tracks are listed in, before the Activities. */
const LISTED: readonly CardioDiscipline[] = ['run', 'bike', 'swim']

/** A track whose days the athlete chooses here: run, bike or swim. */
function isEnduranceDiscipline(
	discipline: PlannedDiscipline,
): discipline is CardioDiscipline {
	return (
		discipline !== SIMPLE_ACTIVITY_DISCIPLINE && isCardioDiscipline(discipline)
	)
}

/** A day choice: days, Monday first, or `null` for _La appen velge_. */
export type TrackDaysChoice = PatternWeekday[] | null

/** One track or Simple Activity whose days the athlete can choose. */
export type TrackDaysUnit = {
	/** `track:<id>` or `activity:<trackId>:<workoutId>`. */
	key: string
	trackId: string
	/** A Simple Activity's name — its Workout's title (_Langrenn_). */
	title: string | null
	/**
	 * The Pinned days, or `null` for _La appen velge_. A Simple Activity's
	 * days are always its own.
	 */
	pinned: PatternWeekday[] | null
	/** The days its rows are on now, Monday first. */
	days: PatternWeekday[]
	/**
	 * What the athlete looked at, so a write made against a plan that changed
	 * since is refused rather than applied to something they never saw.
	 */
	version: string
} & (
	| { kind: 'track'; discipline: CardioDiscipline; workoutId: null }
	| {
			kind: 'activity'
			discipline: typeof SIMPLE_ACTIVITY_DISCIPLINE
			/** The Simple Activity's own Workout, which each of its days copies. */
			workoutId: string
	  }
)

export type TrackDaysState = {
	outlineId: string
	/** Training Availability, Monday first; `null` where never set. */
	available: PatternWeekday[] | null
	units: TrackDaysUnit[]
}

/** Why a change to a track's days was not made. */
export type TrackDaysRefusal =
	| 'no-plan'
	| 'no-pattern'
	| 'no-unit'
	/** The plan changed since the athlete looked. */
	| 'stale'
	| 'bad-restore'
	| Exclude<PinnedDaysRefusal, 'too-many'>

const rowSelect = {
	id: true,
	trackId: true,
	kind: true,
	weekday: true,
	weight: true,
	orderInDay: true,
	workoutId: true,
	workout: { select: { title: true } },
} as const

type PatternRow = Prisma.WeekPatternDayGetPayload<{ select: typeof rowSelect }>

/** A stored row as a day choice rewrites it; `null` for a lifting slot. */
function choiceRowOf(row: PatternRow): TrackPatternRow | null {
	if (row.weekday == null || !isPatternWeekday(row.weekday)) return null
	if (row.kind !== 'share' && row.kind !== 'fixed') return null
	return {
		kind: row.kind,
		weekday: row.weekday,
		weight: row.kind === 'share' ? (row.weight ?? 1) : null,
		workoutId: row.workoutId,
	}
}

function rowsKey(rows: readonly TrackPatternRow[]): string {
	return [...rows]
		.sort(
			(a, b) =>
				a.weekday - b.weekday ||
				a.kind.localeCompare(b.kind) ||
				(a.workoutId ?? '').localeCompare(b.workoutId ?? ''),
		)
		.map(
			(row) =>
				`${row.kind}:${row.weekday}:${row.weight ?? ''}:${row.workoutId ?? ''}`,
		)
		.join(';')
}

/** The plan, its pattern's rows and the athlete's availability, as one read. */
async function readPlan(
	userId: string,
	outlineId: string,
	db: Prisma.TransactionClient = prisma,
) {
	const outline = await db.planOutline.findFirst({
		where: { id: outlineId, athleteId: userId },
		select: {
			id: true,
			tracks: {
				select: { id: true, discipline: true, pinnedDays: true },
			},
		},
	})
	if (!outline) return null
	const tracks = outline.tracks.flatMap((track) => {
		const discipline = readPlannedDiscipline(track.discipline)
		return discipline ? [{ ...track, discipline }] : []
	})
	const [patterns, available] = await Promise.all([
		// Every pattern with days: the first is the one the weeks are laid
		// from and the one the choice is read off; a choice holds in them all.
		db.weekPattern.findMany({
			where: { outlineId, days: { some: {} } },
			orderBy: { orderIndex: 'asc' },
			select: {
				id: true,
				days: {
					orderBy: [{ weekday: 'asc' }, { orderInDay: 'asc' }],
					select: rowSelect,
				},
			},
		}),
		readAvailablePatternDays(userId, db),
	])
	return {
		outline: { id: outline.id, tracks },
		pattern: patterns[0] ?? null,
		/** The plan's other patterns with days, which a choice rewrites too. */
		elsewhere: patterns.slice(1),
		available,
	}
}

type Plan = NonNullable<Awaited<ReturnType<typeof readPlan>>>

/** Every track and Simple Activity on the plan whose days can be chosen. */
function unitsOf({ outline, pattern }: Plan): TrackDaysUnit[] {
	const rows = pattern?.days ?? []
	const units: TrackDaysUnit[] = []
	// Run, bike, swim, then the Simple Activities.
	const rank = (discipline: PlannedDiscipline) =>
		isEnduranceDiscipline(discipline)
			? LISTED.indexOf(discipline)
			: LISTED.length
	const ordered = [...outline.tracks].sort(
		(a, b) => rank(a.discipline) - rank(b.discipline),
	)
	for (const track of ordered) {
		const own = rows.filter((row) => row.trackId === track.id)
		const { discipline } = track
		if (isEnduranceDiscipline(discipline)) {
			const choiceRows = own.flatMap((row) => choiceRowOf(row) ?? [])
			const pinned = parsePinnedDays(track.pinnedDays)
			units.push({
				key: `track:${track.id}`,
				kind: 'track',
				trackId: track.id,
				workoutId: null,
				discipline,
				title: null,
				pinned,
				days: patternWeekdaysOf(choiceRows.map((row) => row.weekday)),
				version: `${serializePinnedDays(pinned) ?? 'auto'}|${rowsKey(choiceRows)}`,
			})
		} else if (discipline === SIMPLE_ACTIVITY_DISCIPLINE) {
			// One unit per Simple Activity: the rows that copy one Workout.
			const byWorkout = new Map<string, PatternRow[]>()
			for (const row of own) {
				if (row.kind !== 'fixed' || row.workoutId == null) continue
				byWorkout.set(row.workoutId, [
					...(byWorkout.get(row.workoutId) ?? []),
					row,
				])
			}
			for (const [workoutId, activityRows] of byWorkout) {
				const choiceRows = activityRows.flatMap((row) => choiceRowOf(row) ?? [])
				const days = patternWeekdaysOf(choiceRows.map((row) => row.weekday))
				units.push({
					key: `activity:${track.id}:${workoutId}`,
					kind: 'activity',
					trackId: track.id,
					workoutId,
					discipline,
					title: activityRows[0]?.workout?.title ?? null,
					pinned: days,
					days,
					version: `own|${rowsKey(choiceRows)}`,
				})
			}
		}
	}
	return units
}

/**
 * The plan's tracks and Simple Activities whose days the athlete can choose,
 * or `null` where the plan is not theirs or has no Week Pattern yet.
 */
export async function readTrackDays(
	userId: string,
	outlineId: string,
): Promise<TrackDaysState | null> {
	const plan = await readPlan(userId, outlineId)
	if (!plan?.pattern) return null
	const units = unitsOf(plan)
	return units.length === 0
		? null
		: { outlineId, available: plan.available, units }
}

function unitRef(unit: TrackDaysUnit): DayChoiceUnit {
	return unit.workoutId == null
		? { trackId: unit.trackId }
		: { trackId: unit.trackId, workoutId: unit.workoutId }
}

function isUnitRow(unit: TrackDaysUnit) {
	return (row: { trackId: string; workoutId: string | null }) =>
		row.trackId === unit.trackId &&
		(unit.workoutId == null || row.workoutId === unit.workoutId)
}

/**
 * The most hard sessions any one week of a track's mix asks for, which the
 * starter rule keeps a day for each of (ADR 0104 §5).
 */
async function hardSessionsOf(
	db: Prisma.TransactionClient,
	trackId: string,
): Promise<number> {
	const entries = await db.qualitySessionMixEntry.findMany({
		where: { segment: { trackId } },
		select: { sessionsPerWeek: true, segmentId: true },
	})
	const perSegment = new Map<string, number>()
	for (const entry of entries) {
		perSegment.set(
			entry.segmentId,
			(perSegment.get(entry.segmentId) ?? 0) + entry.sessionsPerWeek,
		)
	}
	return Math.max(0, ...perSegment.values())
}

/** The unit's rows with the choice: on the chosen days, or dealt by rule. */
async function rowsFor(
	db: Prisma.TransactionClient,
	plan: Plan,
	unit: TrackDaysUnit,
	choice: TrackDaysChoice,
): Promise<TrackPatternRow[]> {
	const rows = (plan.pattern?.days ?? [])
		.filter(isUnitRow(unit))
		.flatMap((row) => choiceRowOf(row) ?? [])
	if (choice) {
		return unit.kind === 'activity'
			? patternWeekdaysOf(choice).map((weekday) => ({
					kind: 'fixed' as const,
					weekday,
					weight: null,
					workoutId: unit.workoutId,
				}))
			: trackRowsOnDays(rows, choice)
	}
	// _La appen velge_: dealt the days the plan's other tracks and Simple
	// Activities leave, by the starter pattern's rule. Strength lifts beside
	// the endurance week and takes no day from it.
	const strength = new Set(
		plan.outline.tracks
			.filter((track) => track.discipline === 'strength')
			.map((track) => track.id),
	)
	const others = plan.outline.tracks
		.filter((track) => track.id !== unit.trackId && !strength.has(track.id))
		.map((track) => ({
			trackId: track.id,
			discipline: track.discipline,
			days: patternWeekdaysOf(
				(plan.pattern?.days ?? []).flatMap((row) =>
					row.trackId === track.id && row.weekday != null ? [row.weekday] : [],
				),
			),
		}))
		.filter((track) => track.days.length > 0)
	if (unit.kind !== 'track') return rows
	return trackRowsByRule({
		trackId: unit.trackId,
		discipline: unit.discipline,
		rows,
		available: plan.available,
		others,
		hardSessions: await hardSessionsOf(db, unit.trackId),
	})
}

/** Why a choice cannot be made, or `null` when it can. */
function choiceRefusal(
	plan: Plan,
	unit: TrackDaysUnit,
	choice: TrackDaysChoice,
): TrackDaysRefusal | null {
	if (!choice) return unit.kind === 'activity' ? 'no-days' : null
	const refusal = pinnedDaysRefusal(
		choice,
		plan.available,
		PATTERN_WEEKDAYS.length,
	)
	return refusal === 'too-many' ? null : refusal
}

/** One coming week, before and after a change, as the day rule reads it. */
export type TrackDaysPreviewWeek = {
	weekKey: string
	weekInPlan: number
	before: { days: PatternWeekday[]; hard: PatternWeekday[] }
	after: {
		days: PatternWeekday[]
		/** The week's **Hard days**, across every track. */
		hard: PatternWeekday[]
		/**
		 * The clashes the unit's sessions take part in (ADR 0104 §1), each with
		 * whether a chosen day causes it — kept as chosen, and said.
		 */
		clashes: Array<{
			reason: ClashReason
			weekday: PatternWeekday
			pinned: boolean
		}>
	}
}

export type TrackDaysPreview =
	| {
			ok: true
			key: string
			choice: TrackDaysChoice
			weeks: TrackDaysPreviewWeek[]
			version: string
	  }
	| { ok: false; reason: TrackDaysRefusal }

/**
 * The coming weeks as the stamp would lay them with the choice — the plan's
 * own `planStamp` over its own pattern, with the unit's rows swapped — beside
 * how they are laid now. Writes nothing.
 */
export async function previewTrackDays(
	userId: string,
	{
		outlineId,
		key,
		choice,
	}: { outlineId: string; key: string; choice: TrackDaysChoice },
	now: Date = new Date(),
): Promise<TrackDaysPreview> {
	const plan = await readPlan(userId, outlineId)
	if (!plan) return { ok: false, reason: 'no-plan' }
	if (!plan.pattern) return { ok: false, reason: 'no-pattern' }
	const unit = unitsOf(plan).find((each) => each.key === key)
	if (!unit) return { ok: false, reason: 'no-unit' }
	const refusal = choiceRefusal(plan, unit, choice)
	if (refusal) return { ok: false, reason: refusal }
	const rows = await rowsFor(prisma, plan, unit, choice)

	const timezone = await getAthleteTimezone(userId)
	const from = await readFirstUnbegunWeekKey(userId, now, timezone)
	const weekKeys = Array.from({ length: TRACK_DAYS_PREVIEW_WEEKS }, (_, i) =>
		addDays(from, i * 7),
	)
	const pinnedChoice = unit.kind === 'track' && choice != null
	const swap = (laid: LaidPatternInput) =>
		withTrackRows(laid, unitRef(unit), rows)
	const [before, after] = await Promise.all([
		readLaidWeeks(userId, outlineId, weekKeys),
		readLaidWeeks(userId, outlineId, weekKeys, swap, {
			pinned:
				unit.kind === 'track'
					? new Map([[unit.trackId, pinnedChoice]])
					: undefined,
		}),
	])
	if (!before || !after) return { ok: false, reason: 'no-pattern' }

	const weeks = after.plans.map((laidAfter, index) => {
		const was = before.plans[index]
		const afterWeek = placedWeekOf(laidAfter.sessions, after.input.days)
		const unitAfter = unitSessions(laidAfter, after.input, unit)
		return {
			weekKey: laidAfter.weekKey,
			weekInPlan: laidAfter.weekInPlan,
			before: was
				? {
						days: unitDays(unitSessions(was, before.input, unit)),
						hard: hardDays(placedWeekOf(was.sessions, before.input.days)),
					}
				: { days: [], hard: [] },
			after: {
				days: unitDays(unitAfter),
				hard: hardDays(afterWeek),
				clashes: unitClashes(
					afterWeek,
					laidAfter.sessions.map((session) => unitAfter.includes(session)),
					unit.kind === 'activity' || pinnedChoice,
				),
			},
		}
	})
	return { ok: true, key, choice, weeks, version: unit.version }
}

function unitSessions(
	plan: StampWeekPlan,
	input: LaidPatternInput,
	unit: TrackDaysUnit,
) {
	const dayById = new Map(input.days.map((day) => [day.dayId, day]))
	return plan.sessions.filter(
		(session) =>
			session.trackId === unit.trackId &&
			(unit.workoutId == null ||
				dayById.get(session.dayId)?.workoutId === unit.workoutId),
	)
}

function unitDays(sessions: ReadonlyArray<{ weekday: PatternWeekday }>) {
	return patternWeekdaysOf(sessions.map((session) => session.weekday))
}

function hardDays(week: readonly PlacedSession[]): PatternWeekday[] {
	return readDays(week)
		.filter((day) => day.hard)
		.map((day) => day.weekday)
}

/**
 * The week's clashes the unit's sessions take part in, each marked pinned
 * where the athlete chose the day (as the fit check marks them).
 */
function unitClashes(
	week: readonly PlacedSession[],
	isUnit: readonly boolean[],
	pinned: boolean,
): TrackDaysPreviewWeek['after']['clashes'] {
	const key = (clash: { reason: string; weekday: number }) =>
		`${clash.weekday}|${clash.reason}`
	const involved = new Set(
		week.flatMap((session, at) =>
			isUnit[at]
				? placingClashes(
						week.filter((_, other) => other !== at),
						session,
					).map(key)
				: [],
		),
	)
	return clashesIn(week)
		.filter((clash) => involved.has(key(clash)))
		.map((clash) => ({ ...clash, pinned }))
}

/** What a write replaced, so its toast can put it back exactly. */
export type TrackDaysPrevious = {
	pinned: TrackDaysChoice
	rows: TrackPatternRow[]
	/**
	 * The rows it replaced in each of the plan's other Week Patterns that
	 * hold the unit (a choice holds in every pattern, spec #588).
	 */
	elsewhere?: Array<{ patternId: string; rows: TrackPatternRow[] }>
}

export type TrackDaysWrite =
	| {
			ok: true
			key: string
			choice: TrackDaysChoice
			previous: TrackDaysPrevious
			/** The unit's version after the write, for the undo. */
			version: string
	  }
	| { ok: false; reason: TrackDaysRefusal }

/**
 * Write the choice, if the plan is still what the athlete looked at
 * (`version`), and lay the weeks again. An undo (`restore`) puts back the
 * rows and the Pinned days a write replaced, as they were.
 */
export async function setTrackDays(
	userId: string,
	{
		outlineId,
		key,
		choice,
		version,
		restore,
	}: {
		outlineId: string
		key: string
		choice: TrackDaysChoice
		version: string
		/** An undo: the rows to put back with the days. */
		restore?: TrackDaysPrevious
	},
	now: Date = new Date(),
	{ relay = true }: { relay?: boolean } = {},
): Promise<TrackDaysWrite> {
	const days = choice ? patternWeekdaysOf(choice) : null
	const result = await prisma.$transaction(
		async (tx): Promise<TrackDaysWrite> => {
			const plan = await readPlan(userId, outlineId, tx)
			if (!plan) return { ok: false, reason: 'no-plan' }
			if (!plan.pattern) return { ok: false, reason: 'no-pattern' }
			const units = unitsOf(plan)
			const unit = units.find((each) => each.key === key)
			if (!unit) return { ok: false, reason: 'no-unit' }
			if (unit.version !== version) return { ok: false, reason: 'stale' }
			if (!restore) {
				const refusal = choiceRefusal(plan, unit, days)
				if (refusal) return { ok: false, reason: refusal }
			}
			const rows = restore
				? await checkedRestore(tx, userId, unit, restore.rows)
				: await rowsFor(tx, plan, unit, days)
			if (!rows) return { ok: false, reason: 'bad-restore' }

			// The choice holds in every pattern that holds the unit, so a week
			// stamped from any of them keeps the athlete's days. An undo puts
			// back what each had; one it carries nothing for is chosen again.
			// Every pattern's rows are settled before anything is written.
			const others: Array<{
				pattern: (typeof plan.elsewhere)[number]
				rows: TrackPatternRow[]
			}> = []
			for (const other of plan.elsewhere) {
				if (!other.days.some(isUnitRow(unit))) continue
				const back = restore?.elsewhere?.find(
					(entry) => entry.patternId === other.id,
				)
				const otherRows = back
					? await checkedRestore(tx, userId, unit, back.rows)
					: await rowsFor(
							tx,
							{ ...plan, pattern: other },
							unit,
							restore ? restore.pinned : days,
						)
				if (!otherRows) return { ok: false, reason: 'bad-restore' }
				others.push({ pattern: other, rows: otherRows })
			}

			const strength = new Set(
				plan.outline.tracks
					.filter((track) => track.discipline === 'strength')
					.map((track) => track.id),
			)
			const previous = await replaceUnitRows(
				tx,
				plan.pattern,
				unit,
				rows,
				strength,
			)
			const elsewhere: Array<{ patternId: string; rows: TrackPatternRow[] }> =
				[]
			for (const other of others) {
				elsewhere.push({
					patternId: other.pattern.id,
					rows: await replaceUnitRows(
						tx,
						other.pattern,
						unit,
						other.rows,
						strength,
					),
				})
			}
			const pinned = unit.kind === 'track' ? (restore?.pinned ?? days) : null
			if (unit.kind === 'track') {
				await tx.trainingTrack.update({
					where: { id: unit.trackId },
					data: { pinnedDays: serializePinnedDays(pinned) },
				})
			}
			return {
				ok: true,
				key,
				choice:
					unit.kind === 'track'
						? pinned
						: patternWeekdaysOf(rows.map((row) => row.weekday)),
				previous: { pinned: unit.pinned, rows: previous, elsewhere },
				version:
					unit.kind === 'track'
						? `${serializePinnedDays(pinned) ?? 'auto'}|${rowsKey(rows)}`
						: `own|${rowsKey(rows)}`,
			}
		},
	)
	if (result.ok && relay) await relayFrom(userId, outlineId, now)
	return result
}

/**
 * Put `rows` in place of the unit's rows in one pattern, numbering each day
 * they touch again, and return the rows they replaced.
 */
async function replaceUnitRows(
	tx: Prisma.TransactionClient,
	pattern: NonNullable<Plan['pattern']>,
	unit: TrackDaysUnit,
	rows: readonly TrackPatternRow[],
	strength: ReadonlySet<string>,
): Promise<TrackPatternRow[]> {
	const replaced = pattern.days.filter(isUnitRow(unit))
	await tx.weekPatternDay.deleteMany({
		where: { id: { in: replaced.map((row) => row.id) } },
	})
	for (const [index, row] of rows.entries()) {
		await tx.weekPatternDay.create({
			data: {
				patternId: pattern.id,
				trackId: unit.trackId,
				kind: row.kind,
				weekday: row.weekday,
				weight: row.kind === 'share' ? (row.weight ?? 1) : null,
				workoutId: row.workoutId,
				// Numbered for real below, with the day's other sessions.
				orderInDay: 100 + index,
			},
		})
	}
	for (const weekday of new Set(rows.map((row) => row.weekday))) {
		await renumberWeekday(tx, pattern.id, weekday, strength)
	}
	return replaced.flatMap((row) => choiceRowOf(row) ?? [])
}

/** Lay the plan's weeks again from the first unbegun one. */
async function relayFrom(userId: string, outlineId: string, now: Date) {
	try {
		const timezone = await getAthleteTimezone(userId)
		const from = await readFirstUnbegunWeekKey(userId, now, timezone)
		await relayPlanFrom(userId, outlineId, from, timezone, now)
	} catch (error) {
		console.error('[track-days] laying weeks after a change failed', error)
	}
}

/**
 * Rows an undo sends back, held to what the unit could hold: real weekdays,
 * a share's weight, and only the athlete's own Workouts of the track's
 * Discipline — a Simple Activity's own one. `null` where any is not.
 */
async function checkedRestore(
	tx: Prisma.TransactionClient,
	userId: string,
	unit: TrackDaysUnit,
	rows: readonly TrackPatternRow[],
): Promise<TrackPatternRow[] | null> {
	if (rows.length === 0) return null
	for (const row of rows) {
		if (!isPatternWeekday(row.weekday)) return null
		if (row.kind === 'share' && !(row.weight != null && row.weight > 0)) {
			return null
		}
		if (unit.kind === 'activity') {
			if (row.kind !== 'fixed' || row.workoutId !== unit.workoutId) return null
		} else if (row.kind === 'fixed' && row.workoutId == null) {
			return null
		}
	}
	const workoutIds = [
		...new Set(rows.flatMap((row) => (row.workoutId ? [row.workoutId] : []))),
	]
	const owned = await tx.workout.count({
		where: {
			id: { in: workoutIds },
			ownerId: userId,
			discipline: unit.discipline,
		},
	})
	return owned === workoutIds.length ? [...rows] : null
}

/**
 * Number one weekday's pattern rows again: the endurance sessions and Simple
 * Activities first, in the order they had, and a lift after them, as a lift
 * always comes after the day's endurance session.
 */
async function renumberWeekday(
	tx: Prisma.TransactionClient,
	patternId: string,
	weekday: number,
	strength: ReadonlySet<string>,
) {
	const rows = await tx.weekPatternDay.findMany({
		where: { patternId, weekday },
		orderBy: { orderInDay: 'asc' },
		select: { id: true, trackId: true },
	})
	const ordered = [
		...rows.filter((row) => !strength.has(row.trackId)),
		...rows.filter((row) => strength.has(row.trackId)),
	]
	// Out of the way first, so no two rows share a position mid-way.
	for (const [index, row] of ordered.entries()) {
		await tx.weekPatternDay.update({
			where: { id: row.id },
			data: { orderInDay: 1000 + index },
		})
	}
	for (const [index, row] of ordered.entries()) {
		await tx.weekPatternDay.update({
			where: { id: row.id },
			data: { orderInDay: index },
		})
	}
}

/** A track that lost days when Training Availability changed. */
export type DroppedPinnedDays = {
	discipline: PlannedDiscipline
	/** A Simple Activity's name, where it was one. */
	title: string | null
	lost: PatternWeekday[]
	/** What it keeps; `null` where it went back to _La appen velge_. */
	kept: PatternWeekday[] | null
}

/**
 * Drop the days the athlete no longer trains on from every track of the
 * active plan that pinned them (spec #588 story 19), lay the weeks again,
 * and say which tracks lost which days. A track left with none goes back to
 * _La appen velge_. A Simple Activity keeps its other days; one left with
 * none stays where it is, and is said, since only the athlete can name its
 * new day. Call it after the new availability is stored.
 */
export async function dropUnavailablePinnedDays(
	userId: string,
	now: Date = new Date(),
): Promise<DroppedPinnedDays[]> {
	const active = await findActiveOutline(userId, now)
	if (!active) return []
	const outlineId = active.outline.id
	const dropped: DroppedPinnedDays[] = []

	const strength = await readStrengthDays(userId, now)
	if (strength?.pinned && strength.available) {
		const { kept, lost } = pinnedDaysWithin(strength.pinned, strength.available)
		if (lost.length > 0) {
			const written = await setStrengthDays(
				userId,
				{ choice: kept, version: strength.version },
				now,
			)
			if (written.ok) {
				dropped.push({ discipline: 'strength', title: null, lost, kept })
			}
		}
	}

	const plan = await readPlan(userId, outlineId)
	if (!plan?.pattern || !plan.available) return dropped
	let changed = false
	for (const unit of unitsOf(plan)) {
		if (!unit.pinned) continue
		const { kept, lost } = pinnedDaysWithin(unit.pinned, plan.available)
		if (lost.length === 0) continue
		if (unit.kind === 'activity' && !kept) {
			dropped.push({
				discipline: unit.discipline,
				title: unit.title,
				lost,
				kept,
			})
			continue
		}
		const written = await setTrackDays(
			userId,
			{ outlineId, key: unit.key, choice: kept, version: unit.version },
			now,
			{ relay: false },
		)
		if (!written.ok) continue
		changed = true
		dropped.push({ discipline: unit.discipline, title: unit.title, lost, kept })
	}
	if (changed) await relayFrom(userId, outlineId, now)
	return dropped
}
