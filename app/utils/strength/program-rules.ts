/**
 * **The per-lift rule vocabulary** — what a strength program says, as closed
 * unions, plus the small evaluators that read them.
 *
 * Everything in this file is pure: no clock, no query, no `prisma`, no random
 * source, and nothing here mutates its arguments. The only import is `zod`,
 * which parses the JSON columns `StrengthProgramLiftRule` stores these unions
 * in — the schema's own note says the vocabularies are pinned as tuples and
 * validated *at the parse seam*, not by a CHECK inside a JSON string.
 *
 * ## Why the rule is keyed by lift and not by program
 *
 * StrongLifts' own deadlift breaks its program's rule on **two axes at once**:
 * `1×5` rather than `5×5`, and a bigger jump (10 lb, dropping to 5 lb once it
 * gets hard). A program-level progression rule is provably wrong on day one, so
 * there is deliberately no program-level `deltaKg`, no program-level set count
 * and no program-level failure remedy anywhere in this module.
 *
 * ## Why there are four increments and three stall responses
 *
 * Each member exists because collapsing it loses a program (see
 * `docs/wayfinder/out-of-the-box/strength-module-brief.md` §A.3.2, which reads
 * seven programs down these columns and finds seven distinct positions):
 *
 * - a **Stall Cut** needs only the current weight;
 * - a **Weight Rollback** needs a weight this lift *actually used before*, which
 *   has no closed form and so needs the stored weight history;
 * - an **Anchor Re-estimate** needs a 1RM read off a logged set — an entirely
 *   different dependency, injected rather than imported (see the engine).
 *
 * A single `deloadPct: number` expresses one of those three and launders the
 * other two.
 *
 * ## Vocabulary
 *
 * **Stall Response**, **Stall Cut**, **Weight Rollback**, **Anchor
 * Re-estimate** and **Stall Count** are the terms. The word *deload* is ADR
 * 0047's planned week and does not appear in this module.
 */
import { z } from 'zod'

// ——— The set as the engine reads it ——————————————————————————————————————

/**
 * A set's role, mirroring `SET_ROLES` in `strength-log.ts`. Restated rather than
 * imported so this module keeps its stated import list (`zod` only); the two are
 * structurally compatible on purpose and a set log row is assignable here.
 */
export const PROGRAM_SET_ROLES = ['warmup', 'working', 'backoff'] as const
export type ProgramSetRole = (typeof PROGRAM_SET_ROLES)[number]

/** Mirrors `SET_OUTCOMES` in `strength-log.ts`, for the same reason. */
export const PROGRAM_SET_OUTCOMES = ['completed', 'abandoned'] as const
export type ProgramSetOutcome = (typeof PROGRAM_SET_OUTCOMES)[number]

/**
 * One logged set, as the progression engine sees it.
 *
 * The **kilo arrives already resolved**. `strength-log.ts`'s `effectiveLoadKg`
 * owns the "a kilo is not a kilo" problem (a dumbbell is per hand, an assisted
 * machine subtracts, a stack level is an ordinal) and it is allowed to refuse.
 * The engine therefore takes `weightKg: number | null` and treats `null` as
 * *this set has no honest kilo*: it can still satisfy a rep predicate, but it
 * can never become a top-set weight or a history entry.
 */
export type LoggedWorkSet = {
	exerciseId: string
	/** The other half of the progression key — barbell and dumbbell bench are
	 * the same movement with separate progressions. */
	equipment: string | null
	orderIndex: number
	role: ProgramSetRole
	outcome: ProgramSetOutcome
	reps: number | null
	weightKg: number | null
}

/**
 * The one gate every strength aggregate shares, restated for this module:
 * worked, finished, and not a warm-up. A back-off set is neither, and an
 * abandoned set is dropped rather than counted as a miss — it has no rep count
 * to compare.
 */
export function countsTowardProgression(set: {
	role: ProgramSetRole
	outcome: ProgramSetOutcome
}): boolean {
	return set.role === 'working' && set.outcome === 'completed'
}

// ——— The rule ————————————————————————————————————————————————————————————

/**
 * When the increment fires **at all** — and never "week 7". Progression in this
 * family is outcome-indexed: the trigger counts sessions, weeks or cycles the
 * athlete actually completed, and the calendar contributes nothing.
 */
export const ProgressionTriggerSchema = z.discriminatedUnion('kind', [
	/** StrongLifts, Starting Strength, GreySkull. `everyNSessions: 1` is the app
	 * default; *"add 2.5lb every three workouts instead"* is published as a
	 * supported setting, which is why the frequency is a number and not a flag. */
	z.object({
		kind: z.literal('perSession'),
		everyNSessions: z.number().int().positive(),
	}),
	/** Madcow, Texas Method, nSuns. */
	z.object({ kind: z.literal('perWeek') }),
	/** 5/3/1. */
	z.object({
		kind: z.literal('perCycle'),
		weeksPerCycle: z.number().int().positive(),
	}),
])
export type ProgressionTrigger = z.infer<typeof ProgressionTriggerSchema>

/**
 * What counts as having made the weight, evaluated over
 * {@link countsTowardProgression}-qualified sets only.
 *
 * `allRepsAllSets` is the whole point of StrongLifts: *"Add weight if you
 * completed five reps on all sets of this exercise."* 24 of 25 is not a partial
 * success, and there is no fractional member here to make it one.
 */
export const SuccessPredicateSchema = z.discriminatedUnion('kind', [
	/** StrongLifts, Starting Strength — 25 of 25. */
	z.object({ kind: z.literal('allRepsAllSets') }),
	/** Madcow, Texas Method — the ramp exists to reach one set. */
	z.object({ kind: z.literal('allRepsOnTopSet') }),
	/** GreySkull, 5/3/1, nSuns — the AMRAP set *is* the rule. */
	z.object({
		kind: z.literal('minRepsOnAmrapSet'),
		minReps: z.number().int().positive(),
	}),
])
export type SuccessPredicate = z.infer<typeof SuccessPredicateSchema>

/**
 * The four irreducible load bases. There is deliberately no shared `deltaKg`:
 * two of these four are functions of the logged rep count, and one is a
 * percentage of a number the athlete just lifted.
 */
export const IncrementSchema = z.discriminatedUnion('kind', [
	/** StrongLifts, Starting Strength, GreySkull, PPL. */
	z.object({ kind: z.literal('absolute'), deltaKg: z.number() }),
	/** Madcow: *"weekly increases of 2.5% of your top set of 5 on Monday"*. */
	z.object({ kind: z.literal('pctOfLastTopSet'), pct: z.number() }),
	/** nSuns: the jump is a lookup on the `1+` set's rep count. */
	z.object({
		kind: z.literal('byAmrapReps'),
		table: z
			.array(
				z.object({
					minReps: z.number().int().nonnegative(),
					deltaKg: z.number(),
				}),
			)
			.min(1),
	}),
	/** GreySkull: ≥ 10 reps on the `5+` set adds **double**. The threshold is
	 * reverse-engineered from secondary sources — see `program.constants.ts`. */
	z.object({
		kind: z.literal('multipliedOnAmrap'),
		baseDeltaKg: z.number(),
		atOrAboveReps: z.number().int().positive(),
		factor: z.number().positive(),
	}),
])
export type Increment = z.infer<typeof IncrementSchema>

/**
 * The **Stall Response** — three structurally different remedies, with three
 * different dependencies. Named this way because ADR 0047 owns `deload` for the
 * planned week, `backoff` is already a `SET_ROLE`, and `reset` alone is
 * ambiguous between two of the three.
 */
export const StallResponseSchema = z.discriminatedUnion('kind', [
	/** **Stall Cut** — StrongLifts, Starting Strength, GreySkull. Needs only the
	 * current weight. The percentage is program convention, not physiology. */
	z.object({ kind: z.literal('stallCut'), pct: z.number().positive() }),
	/** **Weight Rollback** — Madcow's *"reset several weeks back and rebuild"*.
	 * Needs the lift's own weight history; a past weight has no closed form. */
	z.object({
		kind: z.literal('weightRollback'),
		sessionsBack: z.number().int().positive(),
	}),
	/** **Anchor Re-estimate** — 5/3/1's *"use that number to estimate your 1 Rep
	 * Max, and reset your TM"*, and nSuns. Needs an estimator, which this module
	 * takes as an injected function rather than importing. */
	z.object({
		kind: z.literal('anchorReEstimate'),
		estimator: z.string().min(1),
		trainingMaxPct: z.number().positive(),
	}),
])
export type StallResponse = z.infer<typeof StallResponseSchema>

/**
 * Starting Strength's reset does **two things at once**: it cuts the weight and
 * it shrinks the increment going forward — *"if you've been going up 10 lbs you
 * start going up 5 lbs"*. So the increment is per-lift **state**, not a
 * constant, and this union is how a Stall Response reaches it.
 */
export const IncrementAdjustmentOnStallSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('unchanged') }),
	z.object({ kind: z.literal('halve') }),
	z.object({ kind: z.literal('stepDown'), toDeltaKg: z.number().positive() }),
])
export type IncrementAdjustmentOnStall = z.infer<
	typeof IncrementAdjustmentOnStallSchema
>

/**
 * Where a *set's* weight comes from. One number per lift per session is
 * authored; the rest is a function — Madcow's ramp, its 1×8 back-off *"the
 * weight from the 3rd set"*, Texas Method's Wednesday at ~80 % of Monday's.
 */
export const SetWeightSourceSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('workingWeight') }),
	z.object({ kind: z.literal('pctOfTrainingMax'), pct: z.number().positive() }),
	z.object({
		kind: z.literal('pctOfRepMax'),
		reps: z.number().int().positive(),
		pct: z.number().positive(),
	}),
	z.object({ kind: z.literal('pctOfTopSet'), pct: z.number().positive() }),
	z.object({
		kind: z.literal('sameAsSet'),
		setIndex: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal('pctOfAnotherDay'),
		dayId: z.string().min(1),
		pct: z.number().positive(),
	}),
])
export type SetWeightSource = z.infer<typeof SetWeightSourceSchema>

/**
 * The cursor. **Stored, never counted from the session log** — counting gives
 * the wrong answer the first time a session is skipped, duplicated or
 * back-filled, which is exactly what real logs do.
 *
 * `nextDayId` is a string rather than `'A' | 'B'`: StrongLifts alternates two
 * days, GreySkull rotates three, and the day's identity is whatever the
 * program's own `StrengthProgramDay.dayId` says. The set of legal values is the
 * program definition's day list, checked by {@link advanceCursor}.
 */
export const ProgramCursorSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('alternatingDays'),
		nextDayId: z.string().min(1),
	}),
	z.object({
		kind: z.literal('weekInCycle'),
		weekIndex: z.number().int().nonnegative(),
		weeksPerCycle: z.number().int().positive(),
		nextDayId: z.string().min(1),
	}),
	z.object({
		kind: z.literal('weeklyRoles'),
		nextRole: z.enum(['volume', 'recovery', 'intensity']),
	}),
])
export type ProgramCursor = z.infer<typeof ProgramCursorSchema>

export const PROGRAM_CURSOR_KINDS = [
	'alternatingDays',
	'weekInCycle',
	'weeklyRoles',
] as const
export type ProgramCursorKind = (typeof PROGRAM_CURSOR_KINDS)[number]

/**
 * One row of the per-lift rule table, as authored on the **Program
 * Definition** — immutable once seeded. `setCount`/`repsPerSet` are what the
 * *engine* reads (it cannot query the Catalogue `Workout` that renders the day);
 * the seed writes the two to agree.
 */
export type LiftProgressionRule = {
	exerciseId: string
	equipment: string | null
	/** The `dayId`s this lift appears on. StrongLifts' squat is on both A and B;
	 * its bench is on A only. */
	dayIds: string[]
	setCount: number
	repsPerSet: number
	setWeightSources: SetWeightSource[]
	trigger: ProgressionTrigger
	successPredicate: SuccessPredicate
	increment: Increment
	/** How many consecutive failures precede the Stall Response. 3 for
	 * StrongLifts; **1** for GreySkull and 5/3/1, where it is immediate. */
	stallsBeforeResponse: number
	stallResponse: StallResponse
	incrementAdjustmentOnStall: IncrementAdjustmentOnStall
	/** The program's own published start, pre-offered so the athlete answers one
	 * question per lift and is never asked again. */
	defaultStartKg: number | null
	/** The program's other seeding instruction — *"a weight you could lift for 10
	 * reps"*. A rep count, not a weight: it needs no anchor. */
	startSeedRepMaxReps: number | null
}

/**
 * A **Program Definition** as the pure engine reads it. Assembled by the server
 * from `StrengthProgram` + `StrengthProgramDay` + `StrengthProgramLiftRule`;
 * nothing here knows those tables exist.
 */
export type ProgramDefinition = {
	id: string
	key: string
	variantId: string
	name: string
	cursorKind: ProgramCursorKind
	initialCursor: ProgramCursor
	/** Ordered day ids — the cursor's alphabet and the week's boundary. */
	dayIds: string[]
	liftRules: LiftProgressionRule[]
	/** Said out loud on the surface rather than smoothed over: GreySkull's
	 * ≥ 10-rep double increment is reverse-engineered, nSuns publishes ranges,
	 * 5/3/1's fourth week is edition-dependent. */
	provenanceNote: string | null
}

// ——— Reading the rule ————————————————————————————————————————————————————

/** Float noise, not plate rounding. `100 * 1.025` is `102.49999999999999`, and
 * a kilo with fifteen decimals in it is a bug on every surface that shows it.
 * **Loadability is a separate concern**: the engine emits the arithmetic next
 * weight and the plate layer says what the gym can make of it. */
export function normaliseKg(kg: number): number {
	return Math.round(kg * 1e4) / 1e4
}

/** The qualifying sets of one lift, in the order they were logged. */
export function progressionSets(
	logged: LoggedWorkSet[],
	lift: { exerciseId: string; equipment: string | null },
): LoggedWorkSet[] {
	return logged
		.filter(
			(set) =>
				set.exerciseId === lift.exerciseId &&
				set.equipment === lift.equipment &&
				countsTowardProgression(set),
		)
		.sort((a, b) => a.orderIndex - b.orderIndex)
}

/**
 * The **top set** — the heaviest qualifying set, ties going to the later one
 * (Madcow's ramp ends on it). Sets with no honest kilo cannot be a top set.
 */
export function topSet(sets: LoggedWorkSet[]): LoggedWorkSet | null {
	let best: LoggedWorkSet | null = null
	for (const set of sets) {
		if (set.weightKg == null) continue
		if (best == null || set.weightKg >= best.weightKg!) best = set
	}
	return best
}

/** The **AMRAP set** — the last qualifying set. GreySkull's `5+`, 5/3/1's `+`
 * set and nSuns' `1+` are all the final set of the lift. */
export function amrapSet(sets: LoggedWorkSet[]): LoggedWorkSet | null {
	return sets.length === 0 ? null : sets[sets.length - 1]!
}

/**
 * Did this lift make the weight this session?
 *
 * Returns `null` for *"this lift was not logged"*, which is a third answer and
 * not a failure: a skipped lift must not increment a Stall Count.
 */
export function evaluateSuccessPredicate(
	predicate: SuccessPredicate,
	rule: { setCount: number; repsPerSet: number },
	sets: LoggedWorkSet[],
): boolean | null {
	if (sets.length === 0) return null
	switch (predicate.kind) {
		case 'allRepsAllSets': {
			// A missing set is not a completed set. 24 of 25 fails, and so does
			// 20 of 25 logged as four perfect sets.
			if (sets.length < rule.setCount) return false
			return sets.every((set) => (set.reps ?? 0) >= rule.repsPerSet)
		}
		case 'allRepsOnTopSet': {
			const top = topSet(sets)
			if (top == null) return false
			return (top.reps ?? 0) >= rule.repsPerSet
		}
		case 'minRepsOnAmrapSet': {
			const last = amrapSet(sets)
			if (last == null) return false
			return (last.reps ?? 0) >= predicate.minReps
		}
	}
}

/**
 * The next weight after a success, from the increment's own basis.
 *
 * Refuses — `null` — where the basis is not present in what was logged, rather
 * than falling back to a different basis. Madcow's `+2.5 %` with no readable top
 * set is *"we cannot say"*, not *"+2.5 % of something else"*.
 */
export function incrementedWeightKg(
	increment: Increment,
	currentKg: number,
	sets: LoggedWorkSet[],
): number | null {
	switch (increment.kind) {
		case 'absolute':
			return normaliseKg(currentKg + increment.deltaKg)
		case 'pctOfLastTopSet': {
			const top = topSet(sets)
			if (top?.weightKg == null) return null
			return normaliseKg(top.weightKg * (1 + increment.pct / 100))
		}
		case 'byAmrapReps': {
			const last = amrapSet(sets)
			const reps = last?.reps
			if (reps == null) return null
			const row = increment.table
				.filter((entry) => reps >= entry.minReps)
				.sort((a, b) => b.minReps - a.minReps)[0]
			// Below the table's lowest row the published answer is "increase by 0",
			// which is a repeat and not a refusal.
			return normaliseKg(currentKg + (row?.deltaKg ?? 0))
		}
		case 'multipliedOnAmrap': {
			const last = amrapSet(sets)
			const reps = last?.reps
			if (reps == null) return null
			const delta =
				reps >= increment.atOrAboveReps
					? increment.baseDeltaKg * increment.factor
					: increment.baseDeltaKg
			return normaliseKg(currentKg + delta)
		}
	}
}

/** The increment after a Stall Response fired. `halve` and `stepDown` only mean
 * anything on an absolute increment; on the other three bases the adjustment is
 * a no-op and says so rather than inventing a halved percentage. */
export function adjustedIncrement(
	increment: Increment,
	adjustment: IncrementAdjustmentOnStall,
): Increment {
	if (adjustment.kind === 'unchanged') return increment
	if (increment.kind !== 'absolute') return increment
	if (adjustment.kind === 'halve') {
		return { kind: 'absolute', deltaKg: normaliseKg(increment.deltaKg / 2) }
	}
	return { kind: 'absolute', deltaKg: adjustment.toDeltaKg }
}

/**
 * Advance the cursor **one session**, from the day just performed.
 *
 * The day list is the program's; the next day is the next entry, wrapping. A
 * week boundary is *"the last day in the list was just performed"*, which is the
 * only week boundary a per-session call can know without reading a calendar —
 * and reading a calendar is exactly what this family of programs does not do.
 */
export function advanceCursor(
	cursor: ProgramCursor,
	dayIds: string[],
	performedDayId: string | null,
): { cursor: ProgramCursor; weekCompleted: boolean; cycleCompleted: boolean } {
	if (cursor.kind === 'weeklyRoles') {
		const order = ['volume', 'recovery', 'intensity'] as const
		const index = order.indexOf(cursor.nextRole)
		const next = order[(index + 1) % order.length]!
		return {
			cursor: { kind: 'weeklyRoles', nextRole: next },
			weekCompleted: next === 'volume',
			cycleCompleted: false,
		}
	}

	const from = performedDayId ?? cursor.nextDayId
	const index = dayIds.indexOf(from)
	// A day the definition does not know is left where it is rather than
	// silently resetting somebody's program to day one.
	if (index === -1) {
		return { cursor, weekCompleted: false, cycleCompleted: false }
	}
	const nextIndex = (index + 1) % dayIds.length
	const weekCompleted = nextIndex === 0

	if (cursor.kind === 'alternatingDays') {
		return {
			cursor: { kind: 'alternatingDays', nextDayId: dayIds[nextIndex]! },
			weekCompleted,
			cycleCompleted: false,
		}
	}

	const weekIndex = weekCompleted
		? (cursor.weekIndex + 1) % cursor.weeksPerCycle
		: cursor.weekIndex
	return {
		cursor: {
			kind: 'weekInCycle',
			weekIndex,
			weeksPerCycle: cursor.weeksPerCycle,
			nextDayId: dayIds[nextIndex]!,
		},
		weekCompleted,
		cycleCompleted: weekCompleted && weekIndex === 0,
	}
}

/** The day the cursor says is next, or `null` for a cursor that names a role
 * rather than a day. */
export function cursorDayId(cursor: ProgramCursor): string | null {
	return cursor.kind === 'weeklyRoles' ? null : cursor.nextDayId
}

/** Is this lift on this day? A lift the day does not contain is left alone —
 * not failed, not incremented, and not counted as a stall. */
export function liftIsOnDay(
	rule: LiftProgressionRule,
	dayId: string | null,
): boolean {
	if (dayId == null) return true
	return rule.dayIds.includes(dayId)
}
