/**
 * **The per-lift rule vocabulary** — what a strength program says, as closed
 * unions, plus the small evaluators that read them.
 *
 * Everything in this file is pure: no clock, no query, no `prisma`, no random
 * source, and nothing here mutates its arguments. Two imports: `zod`, which
 * parses the JSON columns `StrengthProgramLiftRule` stores these unions in — the
 * schema's own note says the vocabularies are pinned as tuples and validated *at
 * the parse seam*, not by a CHECK inside a JSON string — and the one published
 * figure this module compares against, `PRESCRIBED_LOAD_TOLERANCE_KG`, which
 * lives with the other stated numbers rather than as a literal in a predicate.
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
import { PRESCRIBED_LOAD_TOLERANCE_KG } from './program.constants.ts'

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
	/**
	 * **The row this set was read off**, carried so that anything needing to go
	 * back to it goes back to *it* — never to a row that happens to share its
	 * number.
	 *
	 * The re-estimated 5/3/1 training max found its source row with
	 * `reps === reps && effectiveKg === weightKg` and then took that row's load
	 * kind, RIR, `toFailure` and date from it, so a 42.5 kg-per-hand set standing
	 * at the same 85 kg effective as the barbell set the engine actually graded
	 * could supply the provenance for it. It is the same defect `allRepsAllSets`
	 * already fixed by carrying the set instead of looking a kind back up by
	 * `weightKg === atKg`. **Carry the row, not its number.**
	 *
	 * Optional because the pure engine never needs it and every unit test that
	 * hand-builds a set would otherwise have to invent one; `null` means the
	 * caller cannot name a row, and a reader that needs one must then refuse
	 * rather than guess at which row it was.
	 */
	setLogId?: string | null
	exerciseId: string
	/** The other half of the progression key — barbell and dumbbell bench are
	 * the same movement with separate progressions. */
	equipment: string | null
	orderIndex: number
	role: ProgramSetRole
	outcome: ProgramSetOutcome
	reps: number | null
	weightKg: number | null
	/**
	 * **Where that kilo came from** — the `LoadValue` kind the set was logged
	 * under (`'external'`, `'bodyweight'`, `'stackLevel'`, …), or `null` where the
	 * caller does not know.
	 *
	 * **It is graded on**, and the comment that once stood here saying it was not
	 * is the whole history of this bug. `weightKg` alone is not a claim about the
	 * bar: an `assisted` kilo means *less* work as it grows, a `perSide` kilo is
	 * half the work, and a `bodyweight` kilo is the athlete. Comparing any of
	 * those to a kilo-priced prescription reads one number as another, and the app
	 * did it four times — most recently narrating *"Back Squat 74 kg → 77.5 kg"*
	 * about a 25 kg prescription and an empty bar. So {@link gradeSession} asks
	 * {@link loadKindComparability} first, and an incomparable kind is
	 * `unverifiable`.
	 *
	 * `null` is *the caller does not know*, not *the kind is wrong*: a row whose
	 * `load` column will not parse costs a qualifying clause, never a fold, and
	 * grading falls back to the kilo exactly as it did before.
	 */
	loadKind?: string | null
	/**
	 * **The stored kilo does not follow from the load that explains it** — the
	 * reader that produced this set checked `effectiveKg` against
	 * `effectiveLoadKg(load, bodyweightKg)` and the two disagreed.
	 *
	 * Set by the seam that read the row (`readStoredSetLoad`), never derived here:
	 * this module has no `load` column and no bodyweight, and a second
	 * classification of what a stored kilo means is the shape of this whole family
	 * of bugs. A set marked so is {@link unreadableLoad} — the kilo is refused with
	 * its own reason, the session is `unverifiable`, and nothing moves.
	 */
	kiloContradictsLoad?: boolean
}

// ——— Whether a logged kilo is the same kind of number as the prescription ——

/**
 * **The eight members of the `LoadValue` union**, restated here as a flat tuple
 * for the same reason as {@link PROGRAM_SET_ROLES}: this module's stated import
 * list is `zod` plus its own constants, and `strength-log.ts` is a different
 * layer. The tuple is checked against `LOAD_VALUE_KINDS` **in the test**, so a
 * ninth member added there fails a test here rather than passing silently.
 */
export const PROGRAM_LOAD_VALUE_KINDS = [
	'external',
	'perSide',
	'bodyweight',
	'bodyweightPlus',
	'assisted',
	'stackLevel',
	'band',
	'unloaded',
] as const
export type ProgramLoadValueKind = (typeof PROGRAM_LOAD_VALUE_KINDS)[number]

/**
 * **Why a logged number cannot be read against a kilo priced on a bar.** Four
 * reasons, because the four are four different sentences and the athlete has to
 * be told which one applies (ADR 0056 §3 is the authority on what each number
 * means):
 *
 * - `bodyweightDerived` — the kilo is the athlete, plus anything hung off them.
 *   Real, in the log, and not on the bar.
 * - `assistInverted` — the assisted machine's number is **sign-inverted**: more
 *   number is *less* work. Comparing it to a bar weight gets the direction of
 *   progress backwards, which is worse than getting the magnitude wrong.
 * - `perHand` — a 32 kg dumbbell in each hand is 64 kg of work. The number in
 *   the athlete's head, the number in the column and the number on a bar are
 *   three different numbers.
 * - `notAWeight` — an ordinal (a stack level), a force curve (a band) or no
 *   load at all. There is no honest kilo to compare, and there never will be.
 */
export const INCOMPARABLE_LOAD_REASONS = [
	'bodyweightDerived',
	'assistInverted',
	'perHand',
	'notAWeight',
] as const
export type IncomparableLoadReason = (typeof INCOMPARABLE_LOAD_REASONS)[number]

/**
 * The reasons a graded set cannot be read against a kilo, which is the four
 * above plus the plain absence: `noKiloLogged` is *the set carries no number at
 * all* and does not need a kind to say so.
 */
export type UnreadableLoadReason =
	| IncomparableLoadReason
	| 'noKiloLogged'
	/**
	 * The set carries a kilo and it **cannot be believed**: it is not the kilo the
	 * `load` column beside it explains. Its own reason rather than `noKiloLogged`,
	 * because *"this set recorded no kilos"* is false about a row that recorded
	 * 300 kg — and the sentence the athlete is shown has to be about the
	 * contradiction, which is the only thing that can be fixed.
	 */
	| 'kiloContradictsLoad'

/**
 * **Is this load kind's number commensurable with a kilo on a bar?**
 *
 * Exactly one of the eight members is: `external`. Everything else either means
 * a different quantity (`perSide`, `bodyweight`, `bodyweightPlus`), means it in
 * the opposite direction (`assisted`) or is not a mass at all (`stackLevel`,
 * `band`, `unloaded`).
 *
 * `unstated` is the third answer and not a synonym for either: the caller did
 * not say what kind the set was logged under, so this module has nothing to
 * refuse on and the kilo is read as it always was.
 */
export type LoadKindComparability =
	| { kind: 'comparable' }
	| { kind: 'incomparable'; reason: IncomparableLoadReason }
	| { kind: 'unstated' }

/**
 * The classification, per member, with **no default branch**: the `never`
 * assignment at the end of the switch is a compile error the moment
 * {@link PROGRAM_LOAD_VALUE_KINDS} grows, so a ninth load kind cannot arrive as
 * "comparable" by omission. Defaulting into comparable is precisely how this
 * bug survived four rounds of fixes.
 */
export function loadKindComparability(
	kind: string | null | undefined,
): LoadKindComparability {
	if (kind == null || kind === '') return { kind: 'unstated' }
	if (!isProgramLoadValueKind(kind)) {
		// A kind this module has never heard of. **Fail closed**: an unrecognised
		// number is not evidence about a bar, and guessing that it is is the defect.
		return { kind: 'incomparable', reason: 'notAWeight' }
	}
	switch (kind) {
		// A weight on the bar, bar included. The one comparable member.
		case 'external':
			return { kind: 'comparable' }
		case 'perSide':
			return { kind: 'incomparable', reason: 'perHand' }
		case 'bodyweight':
		case 'bodyweightPlus':
			return { kind: 'incomparable', reason: 'bodyweightDerived' }
		case 'assisted':
			return { kind: 'incomparable', reason: 'assistInverted' }
		case 'stackLevel':
		case 'band':
		case 'unloaded':
			return { kind: 'incomparable', reason: 'notAWeight' }
		default: {
			const unhandled: never = kind
			throw new Error(`Unclassified load kind: ${String(unhandled)}`)
		}
	}
}

function isProgramLoadValueKind(kind: string): kind is ProgramLoadValueKind {
	return (PROGRAM_LOAD_VALUE_KINDS as readonly string[]).includes(kind)
}

/**
 * **The partitions a logged kilo may be *ranked* within** — the same eight-member
 * classification asked a second question. {@link loadKindComparability} answers
 * *"is this number a weight on the bar"*; this answers *"which other numbers may
 * it be compared to"*, which is what a top set, a heaviest-ever and a progress
 * curve need before they order anything.
 *
 * Three, and the reason each is its own pile is {@link INCOMPARABLE_LOAD_REASONS}'
 * own four sentences:
 *
 * - **`bar`** — `external`. The only pile comparable to anything outside itself.
 * - **`perHand`** — `perSide`. A resolved kilo is the honest total, but it is not
 *   a bar weight and it progresses against other per-hand sets.
 * - **`bodyweightDerived`** — `bodyweight` and `bodyweightPlus` together: both
 *   include the athlete, both grow with what is hung off them, so an unweighted
 *   dip and a dip-belt dip belong on one curve and neither belongs on the bar's.
 *
 * `assisted`, `band`, `unloaded` and `stackLevel` are **not members**: an assist
 * is sign-inverted, a band and an unloaded hold are not masses, and a stack level
 * is an ordinal whose reading is in levels. `null` says so, and a reading that
 * gets `null` states an absence rather than inventing a pile.
 */
export const KILO_LOAD_BASES = ['bar', 'perHand', 'bodyweightDerived'] as const
export type KiloLoadBasis = (typeof KILO_LOAD_BASES)[number]

/**
 * Which pile this load kind's kilo may be ranked in, or `null` for none.
 *
 * **Derived from {@link loadKindComparability}, never a second classification** —
 * the records strip and the per-exercise history both partition with this, and
 * the whole shape of this bug was two surfaces each deciding for itself what a
 * stored kilo meant.
 *
 * `unstated` **fails closed here**, and that is not in tension with
 * {@link unreadableLoad} keeping it open: the two readings can say different
 * things. Grading a session can carry a qualifying clause — *"read as logged,
 * because this row's load column would not parse"* — where a *ranking* cannot. A
 * "heaviest ever" is one number and a curve is one axis; neither has anywhere to
 * put the clause, so an unclassifiable row is left out of the ordering instead of
 * silently joining the bar's pile.
 */
export function kiloLoadBasis(
	kind: string | null | undefined,
): KiloLoadBasis | null {
	const comparability = loadKindComparability(kind)
	switch (comparability.kind) {
		case 'comparable':
			return 'bar'
		case 'incomparable':
			switch (comparability.reason) {
				case 'perHand':
					return 'perHand'
				case 'bodyweightDerived':
					return 'bodyweightDerived'
				// An assist grows as the work shrinks, and an ordinal, a band and an
				// unloaded hold are not kilos at all. No pile, and no maximum.
				case 'assistInverted':
				case 'notAWeight':
					return null
			}
		case 'unstated':
			return null
	}
}

/**
 * **How the athlete's own equipment names each kind**, so a sentence can say
 * which one was logged. A `Record` over the union rather than a lookup with a
 * fallback: a ninth member fails to compile here too.
 */
export const LOAD_KIND_LABELS: Record<ProgramLoadValueKind, string> = {
	external: 'a weight on the bar',
	perSide: 'a per-hand load',
	bodyweight: 'a bodyweight load',
	bodyweightPlus: 'a bodyweight-plus-added-weight load',
	assisted: 'an assisted load',
	stackLevel: 'a machine stack level',
	band: 'a band',
	unloaded: 'an unloaded hold',
}

/** The label for a stored kind, or `null` where the kind is unstated or is not
 * one this module knows. */
export function loadKindLabel(kind: string | null | undefined): string | null {
	if (kind == null || !isProgramLoadValueKind(kind)) return null
	return LOAD_KIND_LABELS[kind]
}

/**
 * **What is unreadable about this set's load**, or `null` where it can be read.
 *
 * One value, consulted by both the verdict and the sentence — {@link
 * SessionVerdict} carries it rather than recomputing it, because the fourth
 * round of this bug was a caveat that reached the *prose* and never the
 * *decision*: the sentence said *"not a weight on the bar"* while the fold wrote
 * `{weightKg: 74, succeeded: true}` and moved the lift 25 → 77.5 kg.
 *
 * ## Why `unstated` passes here, on purpose
 *
 * An `unstated` kind — no `loadKind` on the set, or a `load` column that would not
 * parse — is **readable**, and the kilo is graded exactly as it was before this
 * classification existed. That is a decision, not an omission, and it is the one
 * place in the strength track where *"defaults into comparable"* is the right
 * answer:
 *
 * - `unstated` is *the caller did not say*, which is a fact about the **row**, not
 *   about the bar. Failing closed would make every hand-written, imported or
 *   pre-`LoadValue` row permanently `unverifiable` — a program that quietly stops
 *   progressing, which is the failure mode this module exists to prevent, pointed
 *   the other way.
 * - It is **unreachable from a parsed `LoadValue`**: the union has no unlabelled
 *   member, so every set logged through the runner states its kind. `unstated`
 *   only ever describes a row nobody can classify, and those are exactly the rows
 *   the athlete cannot fix retroactively.
 * - Nothing downstream is licensed by it. The 1RM estimator and every *ranking*
 *   reading ({@link kiloLoadBasis}) fail closed on `unstated` because a single
 *   number has nowhere to hang a qualifying clause; a graded session does, and
 *   `program-engine.ts` prints it. **An unparseable row costs a qualifying
 *   clause, not a fold.**
 *
 * So: open here, closed in every reading that orders numbers, and the difference
 * is which of them can say *why*. Do not "fix" this into a refusal without an ADR
 * — there is a test pinning the reason.
 */
export function unreadableLoad(set: {
	weightKg: number | null
	loadKind?: string | null
	kiloContradictsLoad?: boolean
}): { loggedLoadKind: string | null; reason: UnreadableLoadReason } | null {
	// **Asked first, and it is not a kind question.** A kilo that does not follow
	// from its own load column is unreadable whatever kind that column names — an
	// `external` 300 kg beside `{"kind":"external","kg":30}` is the most readable
	// kind there is and the least believable number.
	if (set.kiloContradictsLoad === true) {
		return {
			loggedLoadKind: set.loadKind ?? null,
			reason: 'kiloContradictsLoad',
		}
	}
	const comparability = loadKindComparability(set.loadKind)
	if (comparability.kind === 'incomparable') {
		return {
			loggedLoadKind: set.loadKind ?? null,
			reason: comparability.reason,
		}
	}
	if (set.weightKg == null) {
		return { loggedLoadKind: set.loadKind ?? null, reason: 'noKiloLogged' }
	}
	return null
}

/**
 * **Is this load's kilo the athlete rather than the implement?**
 *
 * Kept as its own question because one sentence still needs it: where the
 * *prescription* has no kilo either, a bodyweight lift progresses against itself
 * and reaches `made` with a real number quoted, and that number has to say whose
 * bodyweight it is. Derived from {@link loadKindComparability} so there is one
 * classification and not two.
 */
export function loadKindIsBodyweightDerived(
	kind: string | null | undefined,
): boolean {
	const comparability = loadKindComparability(kind)
	return (
		comparability.kind === 'incomparable' &&
		comparability.reason === 'bodyweightDerived'
	)
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
 * (Madcow's ramp ends on it).
 *
 * A set whose load cannot be read is not a candidate: not one with no kilo at
 * all, and not one whose kilo is a different quantity either. A bodyweight set
 * bakes in the athlete's 74 kg and would otherwise be nominated as the *heaviest
 * set* of a ramp topping out at 60 kg — and then Madcow's `+2.5 % of your top
 * set` would price next week off it.
 */
export function topSet(sets: LoggedWorkSet[]): LoggedWorkSet | null {
	let best: LoggedWorkSet | null = null
	for (const set of sets) {
		if (unreadableLoad(set) != null) continue
		if (best == null || set.weightKg! >= best.weightKg!) best = set
	}
	return best
}

/**
 * **Does this lift's rule prescribe its last set as an AMRAP?** — a fact about
 * the *program*, not about how the athlete felt.
 *
 * GreySkull's `5+`, 5/3/1's `+` set and nSuns' `1+` are printed as *as many reps
 * as possible*, and the three rule shapes that read that set are the three
 * members here: the predicate that grades it, and the two increments that size
 * the next jump from its rep count.
 *
 * It exists so the 1RM estimator can be told the last set was **taken to failure
 * on purpose** — which is a plan, and what that flag means — without anybody
 * inferring maximal effort from a missed set.
 */
export function prescribesAmrapLastSet(rule: LiftProgressionRule): boolean {
	return (
		rule.successPredicate.kind === 'minRepsOnAmrapSet' ||
		rule.increment.kind === 'byAmrapReps' ||
		rule.increment.kind === 'multipliedOnAmrap'
	)
}

/** The **AMRAP set** — the last qualifying set. GreySkull's `5+`, 5/3/1's `+`
 * set and nSuns' `1+` are all the final set of the lift. */
export function amrapSet(sets: LoggedWorkSet[]): LoggedWorkSet | null {
	return sets.length === 0 ? null : sets[sets.length - 1]!
}

/**
 * **What this session actually says about this lift** — the answer to *"did it
 * make the weight"*, on **both** axes.
 *
 * The reason this is a union and not a boolean: a success predicate that reads
 * only the rep count credits a session that never happened. Five sets of five at
 * **20 kg** against a **62.5 kg** prescription is 25 of 25 reps, and the app used
 * to answer *"every rep of every set at 62.5 kg"* and put 65 kg on the bar. The
 * weight lifted is half the claim, so it is half the verdict.
 *
 * The five members are the five honest answers, and none of them collapses into
 * another:
 *
 * - `notLogged` — nothing to grade. Not a failure: a skipped lift must not
 *   increment a Stall Count.
 * - `made` — the reps *and* the load. `atKg` is the weight that was **actually
 *   lifted**, and it is the only number the outcome sentence may quote.
 * - `missedReps` — the athlete was at the weight and did not finish the reps.
 *   This is the miss the Stall Count counts.
 * - `liftedLighter` — the athlete worked, but not at the weight that was asked
 *   for. See {@link gradeSession} for why that is neither of the two above.
 * - `unverifiable` — the prescription **is** priced in kilos and the log carries
 *   no number that *is* that kilo — either none at all, or one measuring
 *   something else — so neither axis of the claim can be read. See below.
 *
 * ## `loadStated: false` versus `unverifiable`, which is the whole of FAIL A
 *
 * `loadStated: false` on a `made` says the load axis could not be read **and did
 * not need to be**: the prescription has no kilo either, so the reps genuinely
 * are the whole of what can be read. A lift prescribed as a machine stack level
 * and logged as one progresses against itself, and that is ADR 0056 §3 and ADR
 * 0008's Unavailable Metric.
 *
 * It is **only** that. Where the prescription is priced — *90 kg, 5×5* — a log
 * with no honest kilo in it is neither a success nor a miss: the app cannot tell
 * whether 90 kg was on the bar, and the only honest answer is `unverifiable`,
 * which moves nothing. The app once credited five sets at stack level 3 as
 * *"90 kg → 92.5 kg"*, and 90 kg appeared nowhere in the log.
 */
export type SessionVerdict =
	| { kind: 'notLogged' }
	| {
			kind: 'made'
			atKg: number | null
			loadStated: boolean
			/** The `LoadValue` kind `atKg` was read off, so the sentence can say what
			 * that kilo is a kilo of. See {@link loadKindIsBodyweightDerived}. */
			loggedLoadKind: string | null
	  }
	| { kind: 'missedReps'; atKg: number | null }
	| {
			kind: 'liftedLighter'
			/** The **lightest** graded set that came in under its own prescription —
			 * the weight that most clearly is not the one that was asked for. */
			loggedKg: number
			prescribedKg: number
			/** How many graded sets came in light, out of how many were graded at
			 * all. A session whose first set was 40 kg and whose other four were at
			 * 82.5 kg is not *"a session logged at 40 kg"*, and these two numbers are
			 * what let the sentence say which it was. */
			lighterSetCount: number
			gradedSetCount: number
			/** The `LoadValue` kind `loggedKg` was read off. A barbell squat logged as
			 * **Bodyweight** comes in "lighter" at the athlete's own 74 kg, and the
			 * sentence has to say that is what the number is. */
			loggedLoadKind: string | null
	  }
	| {
			/**
			 * **A kilo-priced prescription logged with a number that is not that
			 * kilo.** Not a success, not a miss: unreadable. Nothing may move on it —
			 * not the weight, not the Stall Count, and above all not `weightHistory`,
			 * which is the one piece of state no set log can re-derive.
			 *
			 * Two ways in, one answer. Either the log carries **no kilo** (a stack
			 * level, a band), or it carries a kilo that is **a different quantity**
			 * (bodyweight, assisted, per-hand) — see {@link loadKindComparability}.
			 * The app graded the second class as if it were the first's opposite:
			 * *"Overhead Press 64 kg → 67.5 kg / Every rep of every set at 64 kg"*
			 * off an assisted machine set at −10 kg.
			 */
			kind: 'unverifiable'
			/** The kilo this session was priced at and cannot be checked against. */
			prescribedKg: number
			/** How many graded sets cannot be read against that kilo, out of how many
			 * were graded — so the sentence can say *all five* or *two of five*. */
			unreadableSetCount: number
			gradedSetCount: number
			/** **Which load kind was logged, and why its number is not that kilo.**
			 * The verdict's own field, so the state and the sentence are decided by
			 * one value. The fourth disguise of this bug was a caveat that reached only
			 * the prose. */
			loggedLoadKind: string | null
			reason: UnreadableLoadReason
	  }

/** The prescribed kilo for a set index, with the last entry standing in for any
 * set beyond the list — the same fallback `nextSession` uses when a rule states
 * fewer weight sources than sets. `null` is *the engine could not price this
 * set*, which is a stated absence and never a zero. */
function prescribedForIndex(
	prescribedKg: ReadonlyArray<number | null>,
	index: number,
): number | null {
	if (prescribedKg.length === 0) return null
	return prescribedKg[Math.min(index, prescribedKg.length - 1)] ?? null
}

/**
 * Was this set lifted at the weight it was prescribed at?
 *
 * `'not-comparable'` where either side has no honest kilo — an unpriced
 * prescription, or a set logged against a stack level. It is deliberately not
 * `'lighter'`: an absence is not evidence of a lighter weight, and treating it
 * as one would fail a machine-stack lift for having no kilos.
 */
export function compareLoggedLoad(
	loggedKg: number | null,
	prescribedKg: number | null,
): 'at-or-above' | 'lighter' | 'not-comparable' {
	if (loggedKg == null || prescribedKg == null) return 'not-comparable'
	return loggedKg >= prescribedKg - PRESCRIBED_LOAD_TOLERANCE_KG
		? 'at-or-above'
		: 'lighter'
}

/**
 * Grade one lift's session against its rule **and the weights it was prescribed
 * at**.
 *
 * `prescribedKg` is indexed by set: it is what `nextSession` resolved and what
 * the grid stamped, so the engine grades the athlete against the number they
 * were actually shown.
 *
 * ## Which sets carry the load claim, per predicate
 *
 * - `allRepsAllSets` — every qualifying set, each against its own index. A
 *   StrongLifts session is 25 reps *at one weight*, and one back-off set inside
 *   it means the session was not that.
 * - `allRepsOnTopSet` — the top set, against the heaviest weight prescribed.
 *   Madcow's ramp exists to reach one set, and the lighter rungs cannot fail it.
 * - `minRepsOnAmrapSet` — the last set, against the weight that set was priced
 *   at. GreySkull's `5+` and 5/3/1's `+` are the rule and nothing else is.
 *
 * ## Why lighter-than-prescribed is its own answer
 *
 * It is **not a success**: the athlete did not make the prescribed weight, and
 * saying they did is the fabrication. It is **not a miss** either: nothing was
 * attempted at the prescribed weight and failed, so there is no evidence a Stall
 * Response is the remedy — an athlete backing off deliberately, or correcting a
 * weight the program had wrong, would otherwise be cut 10 % for it. So the
 * weight repeats, the Stall Count is left exactly where it stood, and the
 * athlete is **told** which weight was read and which one was asked for. Silence
 * either way would be the app deciding something it cannot know.
 *
 * A **heavier** session is a success, graded at the weight actually lifted.
 *
 * ## Why an unreadable load against a priced prescription is its own answer
 *
 * A stack level is an ordinal and {@link compareLoggedLoad} refuses to compare
 * it, so the lighter check cannot fire on it. That refusal used to fall straight
 * through into `made` with `loadStated: false` — and the app credited five sets
 * at *stack level 3* as having made a **90 kg** prescription. The load axis was
 * not *absent from the claim*; it was **unreadable**, and those are different
 * statements. `unverifiable` is the second one, and nothing moves on it.
 *
 * **The trigger is comparability, not the presence of a number.** A kilo that
 * measures something else is exactly as unreadable as no kilo, and the four
 * rounds of this bug were four disguises of the same defect: five bodyweight sets
 * against a 25 kg barbell prescription were credited as *"74 kg → 77.5 kg"*, and
 * an assisted press at −10 kg as *"every rep of every set at 64 kg"*. So every
 * one of the eight `LoadValue` members is classified by
 * {@link loadKindComparability}, exhaustively, and only `external` compares.
 *
 * Reps are graded after the load, because a rep count against a weight nobody
 * prescribed — or a weight nobody can confirm — answers a question nobody asked.
 */
export function gradeSession(
	rule: {
		setCount: number
		repsPerSet: number
		successPredicate: SuccessPredicate
	},
	sets: LoggedWorkSet[],
	prescribedKg: ReadonlyArray<number | null>,
): SessionVerdict {
	if (sets.length === 0) return { kind: 'notLogged' }
	const predicate = rule.successPredicate

	if (predicate.kind === 'allRepsAllSets') {
		// A missing set is not a completed set. 24 of 25 fails, and so does 20 of
		// 25 logged as four perfect sets.
		const graded = sets.map((set, index) => ({
			set,
			prescribed: prescribedForIndex(prescribedKg, index),
		}))
		// **Read before anything else.** A set whose load cannot be read against its
		// prescription cannot be called light either — an assisted 64 kg is not a
		// lighter 90 kg, it is not a 90 kg claim at all — and it cannot be called a
		// miss, because a Stall Cut taken off unreadable evidence is the same
		// fabrication pointing downwards. So this precedes both the lighter check
		// and the rep count.
		const unreadable = graded.flatMap(({ set, prescribed }) => {
			if (prescribed == null) return []
			const why = unreadableLoad(set)
			return why == null ? [] : [why]
		})
		if (unreadable.length > 0) {
			return unverifiableVerdict(
				unreadable.length,
				sets.length,
				prescribedKg,
				unreadable[0]!,
			)
		}
		const lighter = graded.filter(
			({ set, prescribed }) =>
				compareLoggedLoad(set.weightKg, prescribed) === 'lighter',
		)
		if (lighter.length > 0) {
			// The lightest of them, with its own prescription beside it: quoting the
			// first light set makes a five-set session read as if all of it was light.
			const lightest = lighter.reduce((worst, candidate) =>
				candidate.set.weightKg! < worst.set.weightKg! ? candidate : worst,
			)
			return {
				kind: 'liftedLighter',
				loggedKg: lightest.set.weightKg!,
				prescribedKg: lightest.prescribed!,
				lighterSetCount: lighter.length,
				gradedSetCount: sets.length,
				loggedLoadKind: lightest.set.loadKind ?? null,
			}
		}
		// The session's own weight is the **lightest** set it completed: that is
		// the weight every one of its sets was at or above, and it is the only kilo
		// a "5×5 at X" sentence may name.
		//
		// Carried as the **set**, not as the number. Looking the kind back up by
		// `weightKg === atKg` names the first set that happens to share the number,
		// and where two kinds coincide — a 74 kg bar and a 74 kg bodyweight set — that
		// is a kilo labelled as the wrong quantity, which is this bug in miniature.
		const lightest = sets.reduce<LoggedWorkSet | null>(
			(best, set) =>
				set.weightKg == null || (best != null && best.weightKg! <= set.weightKg)
					? best
					: set,
			null,
		)
		const atKg = lightest?.weightKg ?? null
		if (sets.length < rule.setCount) return { kind: 'missedReps', atKg }
		return sets.every((set) => (set.reps ?? 0) >= rule.repsPerSet)
			? {
					kind: 'made',
					atKg,
					loadStated: lightest != null,
					// The kind of the set the quoted kilo was read off, so a sentence that
					// names it can say what it is a kilo of — and where there is no kilo to
					// quote, the kind of the work itself, so *"level 6 → 7 progresses
					// against itself"* can still name the stack.
					loggedLoadKind: (lightest ?? sets[0])?.loadKind ?? null,
				}
			: { kind: 'missedReps', atKg }
	}

	const [graded, prescribed] =
		predicate.kind === 'allRepsOnTopSet'
			? ([topSet(sets), heaviestPrescribed(prescribedKg)] as const)
			: ([
					amrapSet(sets),
					prescribedForIndex(prescribedKg, sets.length - 1),
				] as const)
	if (graded == null) {
		// Only `topSet` can refuse: every set of this lift was logged as something
		// that is not a weight on the bar. That is not a missed session — it used to
		// be graded as one, and a stall counted off it — it is a session nobody can
		// read.
		const why = sets.map(unreadableLoad).find((entry) => entry != null)
		if (prescribed != null && why != null) {
			return unverifiableVerdict(sets.length, sets.length, prescribedKg, why)
		}
		return { kind: 'missedReps', atKg: null }
	}

	// The one graded set carries the whole claim in these families, so its load is
	// the whole of what has to be readable — and it is read before the reps.
	const unreadableGraded = unreadableLoad(graded)
	if (prescribed != null && unreadableGraded != null) {
		return unverifiableVerdict(1, 1, prescribedKg, unreadableGraded)
	}

	if (compareLoggedLoad(graded.weightKg, prescribed) === 'lighter') {
		return {
			kind: 'liftedLighter',
			loggedKg: graded.weightKg!,
			prescribedKg: prescribed!,
			// One set carries the whole claim in these families, so the sentence has
			// nothing to over-claim about.
			lighterSetCount: 1,
			gradedSetCount: 1,
			loggedLoadKind: graded.loadKind ?? null,
		}
	}
	const minReps =
		predicate.kind === 'minRepsOnAmrapSet' ? predicate.minReps : rule.repsPerSet
	return (graded.reps ?? 0) >= minReps
		? {
				kind: 'made',
				atKg: graded.weightKg,
				loadStated: graded.weightKg != null,
				loggedLoadKind: graded.loadKind ?? null,
			}
		: { kind: 'missedReps', atKg: graded.weightKg }
}

/** The `unverifiable` verdict, quoting the heaviest kilo the session was priced
 * at — the number the athlete was actually shown and the one the sentence has to
 * name to be about anything at all. */
function unverifiableVerdict(
	unreadableSetCount: number,
	gradedSetCount: number,
	prescribedKg: ReadonlyArray<number | null>,
	why: { loggedLoadKind: string | null; reason: UnreadableLoadReason },
): Extract<SessionVerdict, { kind: 'unverifiable' }> {
	return {
		kind: 'unverifiable',
		prescribedKg: heaviestPrescribed(prescribedKg)!,
		unreadableSetCount,
		gradedSetCount,
		loggedLoadKind: why.loggedLoadKind,
		reason: why.reason,
	}
}

/** The heaviest weight this lift was priced at — what a top-set predicate is
 * graded against, because the ramp's whole point is the set at the end of it. */
function heaviestPrescribed(
	prescribedKg: ReadonlyArray<number | null>,
): number | null {
	const stated = prescribedKg.filter((kg): kg is number => kg != null)
	return stated.length > 0 ? Math.max(...stated) : null
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
