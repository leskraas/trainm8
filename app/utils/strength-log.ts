/**
 * **The strength performance side** — what was actually lifted, per set.
 *
 * Everything in this file is pure: no clock, no query, no `prisma`. The server
 * half is `strength-log.server.ts`.
 *
 * Two things it exists to keep honest.
 *
 * **A kilo is not a kilo.** `weightKg: Float` — what `ExerciseSet` carries for
 * the prescription — is silently wrong on five equipment classes: an assisted
 * machine's number *subtracts*, a dumbbell's is per hand, a bodyweight movement's
 * load is the athlete, a machine stack's "7" is an ordinal with no mass behind
 * it, and a band has no kilos at all (`strength-tracker-surfaces.md` §5). So the
 * stored shape is a {@link LoadValue} union and the kilo is a *derived function*
 * that is allowed to refuse — {@link effectiveLoadKg} returns `null` for a stack
 * level and a band, which is the Unavailable Metric principle one level down.
 *
 * **"Failed" means three different things** (§3.4), and one flag lies about all
 * of them. Missing the target is `reps < prescribedReps` and needs no column —
 * a flag there is redundant state that can disagree with the numbers. Going to
 * failure on purpose is a *plan*, so it is `toFailure`. Racking it is neither,
 * so it is `outcome: 'abandoned'` and every aggregate excludes it.
 */
import { z } from 'zod'

// ——— The set's role in the exercise ——————————————————————————————————————

/**
 * What a set *is* within its exercise. Warm-up is not one flag among many: it
 * changes what the set means to every downstream number (excluded from records
 * and from hard-set counts, included in session duration), so it has to be
 * stored rather than inferred from the load being lighter.
 *
 * Three members, not wger's nine. `dropSegment` and `myoMini` are deliberately
 * absent — they are *segments of one set*, not sets, and modelling them as roles
 * would let a drop set count as three hard sets. They arrive with the segment
 * list, not before it.
 */
export const SET_ROLES = ['warmup', 'working', 'backoff'] as const
export type SetRole = (typeof SET_ROLES)[number]

/**
 * **Where the generated warm-up ramp's rows live in the index space.**
 *
 * A logged set is keyed `(sessionId, stepId, orderIndex)` and the prescribed
 * working sets own `0…n-1`, so the ramp — which nobody authored and which the
 * runner generates fresh from the resolved work weight — needs its own band or it
 * would collide with set one on the way in.
 *
 * A reserved band rather than negative indexes, because `orderIndex` is also what
 * `ExerciseSet.orderIndex` is matched against, and a negative there would read as
 * a position rather than as a category. A working set list long enough to reach
 * this number is not a session.
 */
export const WARMUP_ORDER_INDEX_BASE = 1000

/** Whether a stored `orderIndex` names a rung of the generated ramp rather than a
 * prescribed set. Asked of the index and not of `role`, because an athlete may
 * mark a *prescribed* row as a warm-up and that row keeps its place in the grid. */
export function isWarmupRampIndex(orderIndex: number): boolean {
	return orderIndex >= WARMUP_ORDER_INDEX_BASE
}

/**
 * How the set ended. `completed` covers "did it", including doing fewer reps
 * than prescribed — the shortfall is visible in the numbers. `abandoned` is
 * racked it, form broke, tweaked something: not a rep count at all, and the one
 * value every aggregate has to drop rather than average in.
 */
export const SET_OUTCOMES = ['completed', 'abandoned'] as const
export type SetOutcome = (typeof SET_OUTCOMES)[number]

// ——— What the number on the bar means ————————————————————————————————————

/**
 * The **Load Value** — what was actually on the bar, as the athlete's equipment
 * defines it. The performed-side sibling of the prescription's `LoadTarget`, and
 * a different union on purpose: a `LoadTarget` may be a *reference* (`85 % 1RM`,
 * `8RM`) that resolves per athlete, while a Load Value is always a concrete
 * thing that happened.
 *
 * `sides` is fixed at 2 rather than free: `perSide` exists for the dumbbell and
 * double-kettlebell case, and a single goblet squat is `external` — same
 * equipment, different multiplier, and the *exercise* decides which.
 */
export const LoadValueSchema = z.discriminatedUnion('kind', [
	/** Barbell total including the bar; a machine marked in real kg. */
	z.object({ kind: z.literal('external'), kg: z.number().positive() }),
	/** Per hand. `32` on a dumbbell press is 64 kg of load. */
	z.object({
		kind: z.literal('perSide'),
		kg: z.number().positive(),
		sides: z.literal(2),
	}),
	/** Bodyweight only — the load is the athlete, at the time. */
	z.object({ kind: z.literal('bodyweight') }),
	/** Weighted dip/pull-up. Storing the 20 alone makes it look like a curl. */
	z.object({
		kind: z.literal('bodyweightPlus'),
		addedKg: z.number().positive(),
	}),
	/**
	 * The assisted pull-up/dip machine. A positive number that means *less*
	 * work — the sign is a property of the equipment, not of the number, which is
	 * why it gets its own member instead of a negative `addedKg`.
	 */
	z.object({ kind: z.literal('assisted'), assistKg: z.number().positive() }),
	/**
	 * A machine stack level. An **ordinal**: stack plates are not standardised,
	 * so "7" here and "7" on the next machine are not the same load and neither
	 * is a mass. Progression *within* the exercise is real (6 → 7 means more);
	 * cross-exercise comparison is not available and never will be.
	 */
	z.object({
		kind: z.literal('stackLevel'),
		level: z.number().int().positive(),
		label: z.string().max(40).optional(),
	}),
	/** A named band. A non-linear force curve; any kg conversion is fabricated. */
	z.object({ kind: z.literal('band'), band: z.string().min(1).max(40) }),
	/** A jump, an unloaded hold. No external load and no bodyweight claim. */
	z.object({ kind: z.literal('unloaded') }),
])
export type LoadValue = z.infer<typeof LoadValueSchema>

/**
 * The kilos this set actually loaded, or `null` where no honest kilo exists.
 *
 * **Derived, never a stored source of truth** — but see `effectiveKg` on
 * `ExerciseSetLog`, which *bakes* this at log time. The bake is not a cache: a
 * bodyweight-derived load depends on the athlete's bodyweight *then*, and
 * recomputing it later would silently rewrite a two-year-old weighted-dip
 * record after a 6 kg change. Same resolve-and-bake as the resolved intensity
 * ranges on a Step.
 *
 * Refuses in three places, each for a stated reason rather than by omission:
 * a stack level is an ordinal, a band is a force curve, and a bodyweight-derived
 * load with no recorded bodyweight has nothing to add to.
 */
export function effectiveLoadKg(
	load: LoadValue,
	bodyweightKg: number | null,
): number | null {
	switch (load.kind) {
		case 'external':
			return load.kg
		case 'perSide':
			return load.kg * load.sides
		case 'bodyweight':
			return bodyweightKg
		case 'bodyweightPlus':
			return bodyweightKg == null ? null : bodyweightKg + load.addedKg
		case 'assisted': {
			if (bodyweightKg == null) return null
			const effective = bodyweightKg - load.assistKg
			// An assist heavier than the athlete is not a lighter set, it is a
			// number that cannot be true. Refuse rather than report ≤ 0 kg.
			return effective > 0 ? effective : null
		}
		case 'stackLevel':
		case 'band':
		case 'unloaded':
			return null
	}
}

/**
 * **A stored set log's load, read rather than trusted.**
 *
 * Two columns describe one fact: `load` says what was on the bar in its own
 * semantics, and `effectiveKg` is the kilo {@link effectiveLoadKg} baked from it
 * at log time. {@link effectiveLoadKg} is a **pure function of `(load,
 * bodyweightKg)` on every branch**, so the pair is checkable on read — and until
 * this existed nothing checked it. A hand-written row saying
 * `{"kind":"external","kg":30}` beside `effectiveKg: 300` was believed all the way
 * down: *"Set used: 300 kg × 3"*, a stored `estimatedOneRm` of 330 kg, and a
 * prescription of *"3 × 8 @ 80 % 1RM · 264 kg"*. `saveLoggedSet` cannot produce
 * that pair, but it is the only app writer, the tests write rows with bare
 * `prisma.exerciseSetLog.create`, and every future writer inherits the exposure.
 *
 * Three answers, and the third is the point:
 *
 * - `readable` — the `load` column parses and the stored kilo is the kilo that
 *   load explains. The **stored** number is handed back, never the recomputed
 *   one: ADR 0056 §3 is binding, the bake is the record of what happened, and a
 *   recomputation here is a *check* and not a correction.
 * - `uncheckable` — **an input to the check is missing**, so there is nothing to
 *   check the kilo against and it is read exactly as it was before this function
 *   existed. Two ways in: the `load` column will not parse, or the load is
 *   bodyweight-derived and no `bodyweightKg` is stored beside it. This is
 *   `unreadableLoad`'s own stated decision for an unclassifiable row — an
 *   unparseable row costs a qualifying clause, not a fold — and failing closed
 *   here would freeze every imported and pre-`LoadValue` row. It is also the only
 *   honest answer for a missing witness: the alternative is checking against
 *   *today's* bodyweight, which is the error this whole function exists to refuse.
 * - `contradicted` — the load parses and the kilo does **not** follow from it.
 *   The kilo is refused, with the sentence that says why. It is not silently
 *   dropped and it is not repaired.
 *
 * **Why the recomputation is not written back.** A bodyweight-derived row's
 * `bodyweightKg` is stored beside it precisely so this check can use the
 * bodyweight *then*; an athlete who has since gained 10 kg must still see the
 * two-year-old row's own kilo. And a row that fails the check must fail it
 * honestly rather than be rewritten into agreement — rewriting is how the bake
 * stops being a record.
 */
export type StoredSetLoad =
	| { kind: 'readable'; load: LoadValue; effectiveKg: number | null }
	| {
			kind: 'uncheckable'
			/** The load, where **it** is readable and only the check is not — a
			 * bodyweight-derived row with no bodyweight stored beside it. `null` only
			 * when the `load` column itself will not parse. Carried either way,
			 * because a reader that loses the kind loses the one thing it can still
			 * say truthfully about the row. */
			load: LoadValue | null
			effectiveKg: number | null
			explanation: string
	  }
	| {
			kind: 'contradicted'
			/** The load the row states — the half of the pair that is still readable,
			 * and the half a surface may keep showing. */
			load: LoadValue
			/** What the row stored, quoted so a refusal can name the number it
			 * refuses rather than describing it in the abstract. */
			recordedEffectiveKg: number | null
			/** What that load explains, given the bodyweight stored beside it. The
			 * check's own reading, and it is never written anywhere. */
			explainedEffectiveKg: number | null
			explanation: string
	  }

/** How close two stored kilos have to be to be the same kilo. Float noise only:
 * `42.5 * 2` is exact, but a baked `74 + 0.1`-style sum is not, and a mismatch
 * this small is arithmetic rather than a contradiction. */
const KILO_AGREEMENT_TOLERANCE = 1e-6

/**
 * Read one stored set log's load pair. **Parse, don't trust, at the seam** — the
 * same idiom the `load` column already gets, extended to the number standing
 * beside it. See {@link StoredSetLoad} for what each answer licenses.
 *
 * `bodyweightKg` is the row's **own** stored bodyweight, never the athlete's
 * profile weight now. Passing today's weight would make every honest
 * bodyweight-derived row fail the moment the athlete's weight changed, which is
 * the recompute-and-believe error wearing a check's clothes.
 */
export function readStoredSetLoad(row: {
	load: string
	effectiveKg: number | null
	bodyweightKg: number | null
}): StoredSetLoad {
	const load = parseStoredLoadValue(row.load)
	if (!load) {
		return {
			kind: 'uncheckable',
			load: null,
			effectiveKg: row.effectiveKg,
			explanation:
				'This set’s load cannot be read, so the kilo stored beside it cannot be checked against anything. It is read as logged.',
		}
	}
	// **The witness has to be present for the check to mean anything.** A
	// bodyweight-derived kilo is a function of the bodyweight *then*, which is why
	// that number is stored beside it; where it is missing — a hand-written row, an
	// import, a kind changed after the fact — there is no bodyweight to check
	// against, and reaching for the athlete's weight *now* would fail every honest
	// row the moment they gained a kilo. So the pair is left alone and said to be
	// uncheckable. (That a row can be missing its witness at all is a gap on the
	// **write** side: nothing constrains the column.)
	if (dependsOnBodyweight(load) && row.bodyweightKg == null) {
		return {
			kind: 'uncheckable',
			load,
			effectiveKg: row.effectiveKg,
			explanation: `This set is recorded as ${loadValueText(load)} with no bodyweight stored beside it, so the kilo it was baked from cannot be checked. It is read as logged.`,
		}
	}
	const explained = effectiveLoadKg(load, row.bodyweightKg)
	if (kilosAgree(row.effectiveKg, explained)) {
		// The **stored** kilo, not `explained`. They are equal here by definition,
		// and handing back the recomputed one would make this function a corrector
		// the day they stop being equal.
		return { kind: 'readable', load, effectiveKg: row.effectiveKg }
	}
	return {
		kind: 'contradicted',
		load,
		recordedEffectiveKg: row.effectiveKg,
		explainedEffectiveKg: explained,
		explanation: `This set is recorded as ${loadValueText(load)}, which is ${
			explained == null ? 'no honest kilo at all' : `${formatKg(explained)} kg`
		}, but the kilo stored beside it says ${
			row.effectiveKg == null ? 'nothing' : `${formatKg(row.effectiveKg)} kg`
		}. Both cannot be true, so the stored kilo is not used — it is not a weight this app can stand behind, and nothing is derived from it.`,
	}
}

/** A stored `load` column parsed back into its union, or `null` when the row
 * predates a vocabulary or was written by hand. The one parse, so the server
 * seams do not each keep their own. */
export function parseStoredLoadValue(raw: string): LoadValue | null {
	try {
		const parsed = LoadValueSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/** Whether this load's kilo is a function of the athlete's bodyweight — the three
 * kinds whose bake needs a witness stored beside it. */
function dependsOnBodyweight(load: LoadValue): boolean {
	return (
		load.kind === 'bodyweight' ||
		load.kind === 'bodyweightPlus' ||
		load.kind === 'assisted'
	)
}

function kilosAgree(stored: number | null, explained: number | null): boolean {
	if (stored == null || explained == null) return stored === explained
	return Math.abs(stored - explained) <= KILO_AGREEMENT_TOLERANCE
}

/**
 * The Load Value as the grid shows it — short enough to sit in a table cell
 * next to a rep count, and never a sentence. The prescription gets the Token
 * Sentence (ADR 0027); the log gets columns.
 */
export function loadValueText(load: LoadValue): string {
	switch (load.kind) {
		case 'external':
			return `${formatKg(load.kg)} kg`
		case 'perSide':
			// Written the way a lifter says it, so the per-hand meaning is on the
			// face of the value rather than in a tooltip.
			return `${load.sides} × ${formatKg(load.kg)} kg`
		case 'bodyweight':
			return 'bodyweight'
		case 'bodyweightPlus':
			return `bodyweight + ${formatKg(load.addedKg)} kg`
		case 'assisted':
			return `assisted − ${formatKg(load.assistKg)} kg`
		case 'stackLevel':
			return load.label ?? `level ${load.level}`
		case 'band':
			return `${load.band} band`
		case 'unloaded':
			return 'no load'
	}
}

/**
 * The house rule for rendering a stored kilo: integers bare, otherwise up to two
 * decimals with trailing zeros trimmed. Two, not one, because 1.25 kg plate
 * pairs are real and the plate solver works in them — rendering 61.25 kg as
 * `61.3` states a weight the athlete did not lift and contradicts the plate
 * line. This module is the lowest layer that owns a kilo, so it owns the rule;
 * every other surface imports it rather than keeping its own copy.
 */
export function formatKg(kg: number): string {
	return Number.isInteger(kg) ? String(kg) : String(Number(kg.toFixed(2)))
}

// ——— A logged set ————————————————————————————————————————————————————————

/** One performed set, as the pure layer sees it. */
export type LoggedSet = {
	orderIndex: number
	role: SetRole
	outcome: SetOutcome
	load: LoadValue
	reps: number | null
	/** The other side of a unilateral set. 10 left and 8 right is one set with
	 * two rep counts, and collapsing it to "9" invents a rep nobody did. */
	repsLeft: number | null
	durationSec: number | null
	rir: number | null
	toFailure: boolean
}

/**
 * Did this set come up short of what it was told to do?
 *
 * **Derived from the numbers, never stored.** A separate `failed` column can
 * disagree with the rep count it is describing, and then two fields answer one
 * question — which is the shape ADR 0042 forbids. An abandoned set is not
 * "missed": it has no rep count to compare, so it answers `false` here and is
 * excluded from aggregates by its outcome instead.
 */
export function isMissedSet(set: {
	outcome: SetOutcome
	reps: number | null
	prescribedReps: number | null
}): boolean {
	if (set.outcome !== 'completed') return false
	if (set.prescribedReps == null || set.reps == null) return false
	return set.reps < set.prescribedReps
}

/**
 * **Does this set say what was performed?** A weight with no count is not a set.
 *
 * The defect it closes: `20` typed into the kg field with the reps field left
 * blank saved a `completed` / `working` row with `reps: NULL`, which minted
 * *"Heaviest ever: 20 kg"* off a set nobody performed and — because a null rep
 * count reads as zero reps in the program engine's success predicate — counted as
 * a **miss**, so an accidental tap silently stalled the program and would
 * eventually cut the athlete's working weight.
 *
 * The requirement is a **count**, not reps. All five of `ExerciseSet`'s
 * termination kinds land on one or the other — `reps`, `amrap`, `toRir` and
 * `velocityLoss` end with a rep count, `timed` with a duration — so a timed hold
 * and an unloaded carry stay fully loggable, and the other side of a unilateral
 * set counts as a count of its own.
 *
 * Two exemptions, each for its own reason.
 *
 * **An abandoned set** is the honest record of a rack-and-walk-away, and of an
 * accidental tap: ADR 0056 §6's distinction is that a miss came up short of a
 * count while an abandoned set has no count to compare, so requiring one of it
 * would leave the athlete no way to say *"that did not happen"*.
 *
 * **A warm-up**, for the same reason it sets no record and never reaches a
 * success predicate: a generated rung's reps are the ramp's own prescription, and
 * demanding a typed number on every rung of a heavy day is how a logger becomes a
 * chore.
 */
export function statesWhatWasPerformed(set: {
	role: SetRole
	outcome: SetOutcome
	reps: number | null
	repsLeft: number | null
	durationSec: number | null
}): boolean {
	if (set.outcome !== 'completed') return true
	if (set.role === 'warmup') return true
	return [set.reps, set.repsLeft, set.durationSec].some(
		(count) => count != null && count > 0,
	)
}

/** Sets that may feed a record, a rep-max reading or a hard-set count: worked,
 * finished, and not a warm-up. The one gate every strength aggregate shares. */
export function countsTowardWork(set: {
	role: SetRole
	outcome: SetOutcome
}): boolean {
	return set.role === 'working' && set.outcome === 'completed'
}

// ——— The ghost ————————————————————————————————————————————————————————————

/**
 * A **Set Ghost** — what the athlete did on *this exercise* last time, in *this*
 * set's position. Text on the surface, never a prefilled input: the observed
 * failure mode is athletes logging the ghost by accident and never noticing, so
 * filling it stays an explicit tap.
 */
export type SetGhost = {
	load: LoadValue
	reps: number | null
	durationSec: number | null
	/** True when this row is beyond where the previous session ended and is
	 * borrowing the last row's ghost. Shown as "beyond last time", so a ramp
	 * that grew from four sets to five does not silently claim a fifth set. */
	extrapolated: boolean
}

/**
 * Match the previous session's sets onto this session's rows **positionally** —
 * set 3's ghost is last time's set 3, never the nearest weight. Positional is
 * what makes a ramp (60/80/100) show the right ghost per row; nearest-weight
 * would show 100 kg against the warm-up.
 *
 * When this session has more rows than last time had sets, the extra rows carry
 * the last set's ghost flagged `extrapolated` rather than nothing: an empty
 * ghost on set 5 of 5 reads as "new territory" when it only means "you did four
 * last time". Warm-ups are dropped from the previous session first, so adding a
 * warm-up does not shift every working row's ghost by one.
 */
export function ghostsForRows(
	previous: LoggedSet[],
	rowCount: number,
): Array<SetGhost | null> {
	const source = previous
		.filter((s) => s.role !== 'warmup' && s.outcome === 'completed')
		.sort((a, b) => a.orderIndex - b.orderIndex)
	if (source.length === 0) return Array.from({ length: rowCount }, () => null)
	return Array.from({ length: rowCount }, (_, index) => {
		const beyond = index >= source.length
		const set = beyond ? source[source.length - 1]! : source[index]!
		return {
			load: set.load,
			reps: set.reps,
			durationSec: set.durationSec,
			extrapolated: beyond,
		}
	})
}

// ——— ADR 0046 §4's Strength Summary Count ————————————————————————————————

/**
 * The **Strength Summary Count** — sessions completed against sessions planned,
 * in strength's own currency. ADR 0046 §4 mandated this figure and nothing ever
 * built it, because until `ExerciseSetLog` existed a "completed" gym session
 * meant only that somebody had typed an RPE.
 *
 * Deliberately a count and **not** a second Adherence Band: a band's thresholds
 * are asymmetric on a stated principle about volume overshoot (ADR 0019 §5), and
 * this repo has no source for that asymmetry on a session count. Cut points
 * invented here would be a fabricated metric wearing a trusted vocabulary.
 *
 * Returns `null`, which the surface renders "—", when nothing is materialized.
 * `0 of 0` would read as a completed week; a Summary Count is derived from
 * *existing* sessions, so with none there is nothing to count.
 */
export type StrengthSummaryCount = {
	/** Sessions with at least one logged working set. */
	completed: number
	/** Strength sessions materialized in the window. */
	planned: number
}

export function strengthSummaryCount(
	sessions: Array<{ loggedWorkingSets: number }>,
): StrengthSummaryCount | null {
	if (sessions.length === 0) return null
	return {
		completed: sessions.filter((s) => s.loggedWorkingSets > 0).length,
		planned: sessions.length,
	}
}

/**
 * The count as one phrase. The caveat sits on the number and the reasoning waits
 * behind a tap, so this is "2 of 3 lifting sessions logged" and not a paragraph
 * explaining what counts as logged.
 */
export function strengthSummaryCountLabel(
	count: StrengthSummaryCount | null,
): string {
	if (!count) return 'No lifting sessions this week'
	return `${count.completed} of ${count.planned} lifting ${
		count.planned === 1 ? 'session' : 'sessions'
	} logged`
}

// ——— The vocabularies the strength schema pins ———————————————————————————
//
// Every one of these is an `as const` tuple with a hand-written CHECK beside it
// in `20260814120000_strength_anchors_programs_and_variants`. No Prisma enums
// and no triggers — the repo's stated reason is that a trigger is invisible in
// `schema.prisma` and lost to the next table rebuild.
//
// They live here, beside `SET_ROLES` and `SET_OUTCOMES`, because this is the pure
// strength module: zero imports beyond zod, no clock, no query. The rule modules
// that consume them (exercise anchors, the 1RM estimator, the program engine, the
// plate calculator) import from here rather than restating a member list.

/**
 * **What an Exercise Threshold measured.** Three constructs, and `repMax` is a
 * *peer* of the other two rather than a derivative: rendering `@ 8RM` by
 * converting an observed 8RM up to a 1RM and back down is a round trip through a
 * ±10 % transform, twice, and `@ 8RM` is already a complete instruction.
 *
 * The **training max** is deliberately absent. It is authored state on a
 * `ProgramLiftState` whose whole cycle is wrong if it is wrong, while a 1RM
 * computed for a chart is a display artefact that may be recomputed freely. One
 * field serving both is ADR 0021's carve-out being violated.
 */
export const ANCHOR_CONSTRUCTS = ['oneRm', 'estimatedOneRm', 'repMax'] as const
export type AnchorConstruct = (typeof ANCHOR_CONSTRUCTS)[number]

/**
 * **The rep↔load equations the app will name on an axis**, so a number an
 * athlete compares against another app is reconstructible.
 *
 * Epley/Welday (`RepWt × (1 + reps/30)`) is the default: near-unbiased at ≤ 10
 * reps (+0.5 ± 10.2 %) and what every other app uses. **Berger is deliberately
 * absent** — systematically −17 %, and precise enough to look stable while being
 * wrong. Brzycki, Lander and Adams are offered only for parity with other apps
 * and are gated to ≤ 10 reps like everything else.
 */
export const ESTIMATOR_NAMES = [
	'epley',
	'brzycki',
	'mayhew',
	'wathen',
	'lombardi',
	'lander',
	'adams',
] as const
export type EstimatorName = (typeof ESTIMATOR_NAMES)[number]

/**
 * **How an Exercise Threshold was arrived at** — the second provenance axis, the
 * same split as a **Threshold Event**'s `construct` × `protocol` (ADR 0054).
 *
 * `athlete-stated` is the one member that forces `confidence` to NULL: the app
 * does not grade a figure somebody stated about themselves. `provider` is here
 * and is never something the app adopts on its own.
 */
export const ANCHOR_PROTOCOLS = [
	/** A maximal single actually performed. */
	'tested',
	...ESTIMATOR_NAMES,
	/** A rep max the athlete actually hit at exactly those reps — not a fit. */
	'rep-max-observed',
	/** The athlete typed it. Stores `confidence: null`, always. */
	'athlete-stated',
	/** A connected account's own number, confirmed by the athlete. */
	'provider',
] as const
export type AnchorProtocol = (typeof ANCHOR_PROTOCOLS)[number]

/**
 * The ordinal grade an *estimated* anchor carries — the vocabulary ADR 0033
 * already fixed for **Detection Confidence** and **Load Confidence**, never a
 * bespoke 0–1 score.
 *
 * It grades on **recency** and **reps** only. Maximality in strength is not a
 * weak signal, it is an **absent** one: a set of 8 at RIR 4 and a set of 8 at
 * RIR 0 are byte-identical in anything an app can collect.
 */
export const ANCHOR_CONFIDENCE_GRADES = ['high', 'medium', 'low'] as const
export type AnchorConfidence = (typeof ANCHOR_CONFIDENCE_GRADES)[number]

/**
 * **When a Program's increment fires.** Three members because three families
 * index differently, and none of them is "every session" alone — StrongLifts'
 * own app exposes an every-*N*-workouts setting.
 */
export const PROGRESSION_TRIGGER_KINDS = [
	'perSession',
	'perWeek',
	'perCycle',
] as const
export type ProgressionTriggerKind = (typeof PROGRESSION_TRIGGER_KINDS)[number]

/** **What counts as having made the weight.** Three published predicates. */
export const SUCCESS_PREDICATE_KINDS = [
	/** StrongLifts: 25 of 25 reps, over qualifying working sets only. */
	'allRepsAllSets',
	/** Madcow, Texas Method: the top set is the test. */
	'allRepsOnTopSet',
	/** GreySkull, 5/3/1, nSuns: the final AMRAP set clears a floor. */
	'minRepsOnAmrapSet',
] as const
export type SuccessPredicateKind = (typeof SUCCESS_PREDICATE_KINDS)[number]

/**
 * **The four irreducible load bases an increment can be written against.**
 * Collapsing any of them into `deltaKg` loses a program outright.
 */
export const INCREMENT_KINDS = [
	'absolute',
	/** Madcow: +2.5 % of the last top set. */
	'pctOfLastTopSet',
	/** nSuns: a table keyed by the AMRAP set's rep count. */
	'byAmrapReps',
	/** GreySkull: ≥ 10 reps on the AMRAP doubles the usual jump. */
	'multipliedOnAmrap',
] as const
export type IncrementKind = (typeof INCREMENT_KINDS)[number]

/**
 * **The three structurally different remedies for repeated failure** — the
 * **Stall Response**. Named this because `deload` is ADR 0047's planned week and
 * `backoff` is already a **Set Role**; see CONTEXT.md's glossary.
 */
export const STALL_RESPONSE_KINDS = [
	/** Reduce this lift's working weight by a percent. StrongLifts, GreySkull. */
	'stallCut',
	/** Reset to a weight this lift actually used before. Madcow. */
	'weightRollback',
	/** Re-derive the anchor from a logged set and reset the training max. 5/3/1. */
	'anchorReEstimate',
] as const
export type StallResponseKind = (typeof STALL_RESPONSE_KINDS)[number]

/**
 * **What a Stall Response does to the increment itself.** Starting Strength
 * shrinks it (10 lb → 5 lb) at the same moment it cuts the weight — that is two
 * things at once, and the program publishes both.
 */
export const INCREMENT_ADJUSTMENT_KINDS = [
	'unchanged',
	'halve',
	'stepDown',
] as const
export type IncrementAdjustmentKind =
	(typeof INCREMENT_ADJUSTMENT_KINDS)[number]

/**
 * **Where a single set's weight comes from.** One number per lift per session is
 * authored; every other set in the session is a function of it — Madcow's ramp,
 * its 1×8 back-off *"the weight from the 3rd set"*, Texas Method's Wednesday at
 * ~80 % of Monday, and the warm-up ramp are all derivations.
 */
export const SET_WEIGHT_SOURCE_KINDS = [
	'workingWeight',
	'pctOfTrainingMax',
	'pctOfRepMax',
	'pctOfTopSet',
	'sameAsSet',
	'pctOfAnotherDay',
] as const
export type SetWeightSourceKind = (typeof SET_WEIGHT_SOURCE_KINDS)[number]

/**
 * **How a Program knows what is next** — and it is **stored**, never counted
 * from the session log. A skipped, back-filled or duplicated session must not
 * desync a whole program.
 */
export const PROGRAM_CURSOR_KINDS = [
	/** StrongLifts' ABA·BAB. */
	'alternatingDays',
	/** 5/3/1's position in a cycle of weeks. */
	'weekInCycle',
	/** Texas Method's volume → recovery → intensity week. */
	'weeklyRoles',
] as const
export type ProgramCursorKind = (typeof PROGRAM_CURSOR_KINDS)[number]

/**
 * A **Program Instance**'s lifecycle. `ended` rather than deleted: stopping a
 * program must never lose the sets logged under it.
 */
export const PROGRAM_INSTANCE_STATUSES = ['active', 'paused', 'ended'] as const
export type ProgramInstanceStatus = (typeof PROGRAM_INSTANCE_STATUSES)[number]

/** What a lift's session did, as the post-session outcome line reports it. */
export const LIFT_OUTCOME_KINDS = [
	'incremented',
	'repeated',
	'stalled',
] as const
export type LiftOutcomeKind = (typeof LIFT_OUTCOME_KINDS)[number]

/**
 * **The eight members of the Load Value union, as a flat tuple** — what an
 * **Exercise Variant**'s Load Semantics declares this movement takes. Derived
 * from {@link LoadValueSchema} by hand rather than by mapping its options, so
 * the migration's CHECK has a literal list to be compared against.
 */
export const LOAD_VALUE_KINDS = [
	'external',
	'perSide',
	'bodyweight',
	'bodyweightPlus',
	'assisted',
	'stackLevel',
	'band',
	'unloaded',
] as const
export type LoadValueKind = (typeof LOAD_VALUE_KINDS)[number]

/**
 * **The movement-pattern filter axis.** Twelve biomechanical patterns, because
 * the picker is filtered on a 390 px screen and a flat list of 900 rows is
 * unusable there. FIT's 53-member `exerciseCategory` is a finer *taxonomy* and
 * deliberately not this axis: 53 chips do not fit on a phone, and half of its
 * members (`warm_up`, `cardio`, `unknown`) are not patterns at all.
 *
 * Authored here because **no open dataset carries it** — not
 * `free-exercise-db`, not wger — which is also why the exercise database is a
 * seed rather than a runtime dependency.
 */
export const MOVEMENT_PATTERNS = [
	'squat',
	'hinge',
	'lunge',
	'horizontal-push',
	'vertical-push',
	'horizontal-pull',
	'vertical-pull',
	'hip-extension',
	'carry',
	'rotation',
	'core',
	'isolation',
] as const
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number]

/**
 * **The equipment discriminator half of an Exercise Variant's identity.** The
 * progression key is the pair `(exerciseId, equipment)`, so barbell bench and
 * dumbbell bench progress separately without exploding the picker.
 */
export const EQUIPMENT_IDS = [
	'barbell',
	'dumbbell',
	'kettlebell',
	'machine',
	'cable',
	'smith-machine',
	'trap-bar',
	'ez-bar',
	'bodyweight',
	'assisted-machine',
	'band',
	'medicine-ball',
	'sled',
	'suspension',
	'other',
] as const
export type EquipmentId = (typeof EQUIPMENT_IDS)[number]

/** The bench/press angle, where a movement has one. NULL means it has none. */
export const EXERCISE_ANGLES = ['flat', 'incline', 'decline'] as const
export type ExerciseAngle = (typeof EXERCISE_ANGLES)[number]
