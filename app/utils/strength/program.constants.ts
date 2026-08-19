/**
 * **The published numbers of the linear-progression programs**, each with its
 * provenance beside it — including, and especially, the ones that are convention
 * rather than evidence.
 *
 * Everything here is data. The engine (`program-engine.ts`) applies whatever the
 * definition says and knows none of these numbers; that split is why the engine
 * can be tested without asserting any of them.
 *
 * ## Read this before quoting any number below as a fact
 *
 * The research refused to launder three things, and neither does this file:
 *
 * 1. **"Three fails then cut 10 %" has no trial of any kind**, and neither does
 *    any other cut percentage in this family. The two controlled trials of a
 *    planned load reduction in trained lifters found **no benefit**, and one
 *    found a **strength cost**. Every percentage in this file is therefore
 *    labelled {@link PROVENANCE.convention} — it is what the program publishes,
 *    reproduced so the app behaves like the program, and it is **not
 *    physiology**.
 * 2. **The 5×5 → 3×5 → 1×5 "volume ladder" is not StrongLifts' rule.** It
 *    appears in none of the failure article, the plateau article or the app's
 *    progression settings — see {@link STRONGLIFTS_VOLUME_LADDER}. It is not
 *    encoded as a progression rule anywhere in this module.
 * 3. **The training max has no evidence base.** It is adopted as a documented
 *    product convention because 5/3/1 and nSuns prescribe every weight as a
 *    percentage of it — see {@link FIVE_THREE_ONE_TRAINING_MAX_PCT_OPTIONS}.
 *
 * Sources: stronglifts.com and support.stronglifts.com (retrieved 2026-08-13),
 * Rippetoe, *Starting Strength* / startingstrength.com, Johnny Pain's GreySkull
 * LP (primary is a paid e-book — secondary only), Madcow's mirrored 5×5 page,
 * Wendler, *5/3/1*, and the nSuns spreadsheet notes. Full quotations live in
 * `docs/wayfinder/out-of-the-box/strength-module-brief.md` §A.
 */
import {
	type Increment,
	type LiftProgressionRule,
	type ProgramDefinition,
} from './program-rules.ts'

/**
 * How much weight a published number carries. Kept as a vocabulary rather than
 * prose so a surface can *show* it: "program convention, no trial" is a sentence
 * an athlete is entitled to read next to a 10 % drop in their squat.
 */
export const PROVENANCE = {
	/** Quoted verbatim from the program's own primary source. */
	primary: 'primary',
	/** The primary source is paywalled or lost; this is the secondary consensus,
	 * reverse-engineered and labelled as such on the surface. */
	secondary: 'secondary',
	/** What the program publishes and the app reproduces. **No trial supports
	 * it.** Not physiology, and never presented as such. */
	convention: 'convention',
	/** Repeated everywhere and traceable to nothing. Not implemented. */
	folklore: 'folklore',
	/** The sources disagree and the app reports the disagreement rather than
	 * picking a winner. */
	disputed: 'disputed',
} as const
export type Provenance = (typeof PROVENANCE)[keyof typeof PROVENANCE]

/** For turning a published pound figure into this app's kilos. */
export const LB_TO_KG = 0.45359237

// ——— Reading a logged weight against the one that was prescribed ——————————

/**
 * **How close a logged weight has to be to the prescribed one to count as the
 * same weight.** ±0.5 kg, and the two bounds it sits between are what make it
 * defensible rather than a feeling:
 *
 * - **It must be at least the smallest real change a rack can make.** The
 *   finest microplate in common use is 0.25 kg, and a bar takes them in pairs,
 *   so 0.5 kg is one rung on the finest-grained gym there is. Anything tighter
 *   turns two racks' rounding of the same percentage into a failed session.
 * - **It must be strictly smaller than the smallest published increment in this
 *   family**, which is Starting Strength's post-stall 1.25 kg upper-body jump
 *   ({@link STARTING_STRENGTH_UPPER_INCREMENT_AFTER_STALL_KG}). A tolerance at
 *   or above an increment would swallow a whole jump: last session's weight
 *   would count as this session's, and the program would credit a session that
 *   never moved.
 *
 * An **exact match was rejected**: a percentage-derived load, a rack that
 * rounds, and float arithmetic all put the same intended weight on the bar with
 * different digits after the point, and grading that as a miss would be the
 * mirror image of the bug this exists to fix.
 *
 * The comparison is **at or above**, never equal: an athlete who put more on the
 * bar than was asked made the weight. See `gradeSession` in `program-rules.ts`.
 */
export const PRESCRIBED_LOAD_TOLERANCE_KG = 0.5

/**
 * **The rung the app rounds a prescribed weight to when it has no idea what the
 * athlete's gym owns.**
 *
 * A prescribed working weight has to be a weight somebody can actually load —
 * 10 % off 22.5 kg is 20.25 kg, and no bar on earth makes that. Where a
 * `PlateInventory` exists the rounding is the plate solver's
 * (`roundToLoadable`), which answers against the plates this gym really has and
 * refuses honestly where the load has no kilos at all. Where **no gym has been
 * described** there is nothing to solve against, and inventing an inventory
 * would be a claim about somebody's rack.
 *
 * So the fallback is a stated step rather than a guessed rack: **2.5 kg**, which
 * is a pair of 1.25 kg plates — the smallest change the overwhelming majority of
 * gyms can make — and is also StrongLifts' own published increment
 * ({@link STRONGLIFTS_INCREMENT_KG}). It is a default, said out loud here, and
 * any inventory on file beats it.
 */
export const DEFAULT_LOADABLE_STEP_KG = 2.5

/**
 * The fallback rounding itself: the nearest multiple of
 * {@link DEFAULT_LOADABLE_STEP_KG}, **ties going to the lighter weight** — the
 * same tie-break the plate solver uses, because rounding a lifter *up* into a
 * weight they never asked for is how a prescription becomes a demand.
 */
export function roundToDefaultStepKg(kg: number): number {
	const steps = Math.ceil(kg / DEFAULT_LOADABLE_STEP_KG - 0.5)
	return Math.max(0, steps) * DEFAULT_LOADABLE_STEP_KG
}

/**
 * **One weight, rendered the same way everywhere.**
 *
 * The overview said `20.3 kg`, the grid said `20.25 kg` and the plate note said
 * `20 kg` — three numbers for one prescription, on one screen. The house rule is
 * therefore stated once and imported: integers bare, otherwise **up to two
 * decimals with trailing zeros trimmed**.
 *
 * Two decimals rather than one, because 1.25 kg is a real increment in this
 * family (Starting Strength's post-stall upper-body jump) and `toFixed(1)`
 * renders it as `1.3` — a weight nobody lifted, which is the same class of
 * defect as the one this module exists to prevent.
 */
export { formatKg } from '../strength-log.ts'

// ——— StrongLifts 5×5 ——————————————————————————————————————————————————————

/**
 * The app's default increment: **a flat 5 lb / 2.5 kg per workout, for every
 * lift**. `primary` — *"if you did 5x5 200lb Squats last workout, and you didn't
 * miss any reps, then the weight will increase to 205lb."*
 *
 * The smaller press increment every article recommends is published as **a
 * setting the lifter changes**, not as the app's behaviour, so it is not seeded
 * as a default here.
 */
export const STRONGLIFTS_INCREMENT_KG = 2.5

/**
 * The deadlift's own increment — `primary`. It *"can progress by 10lb. Once this
 * becomes hard, switch to 5lb increments."* Two axes at once, with
 * {@link STRONGLIFTS_DEADLIFT_SET_COUNT}: this single lift is the reason the
 * progression rule is keyed by lift and not by program.
 */
export const STRONGLIFTS_DEADLIFT_INCREMENT_KG = 5
/** The deadlift's increment after a stall — the published *"switch to 5lb"*. */
export const STRONGLIFTS_DEADLIFT_REDUCED_INCREMENT_KG = 2.5

export const STRONGLIFTS_SET_COUNT = 5
export const STRONGLIFTS_REPS_PER_SET = 5
/** *"one heavy set of 5 reps after you warm up"* — `primary`. */
export const STRONGLIFTS_DEADLIFT_SET_COUNT = 1

/**
 * Three consecutive failed sessions before the Stall Response — `primary` as a
 * count, `convention` as a rule: *"if you fail to complete all sets on an
 * exercise for three sessions in a row"*.
 *
 * Two published counters exist and they are **not the same predicate**: the
 * failure article counts *repeats of the same weight*, the app counts
 * *consecutive sessions where all sets were not completed*. The engine
 * implements the app's, because it is mechanical and survives an out-of-order
 * log.
 */
export const STRONGLIFTS_STALLS_BEFORE_RESPONSE = 3

/**
 * The Stall Cut: **−10 %**, scoped to the exercise — `convention`. Published by
 * both StrongLifts sources (*"Reduce the weight by about 10%"*), supported by
 * **no trial**. See this file's header.
 */
export const STRONGLIFTS_STALL_CUT_PCT = 10

/** *"empty bar"* — 45 lb / **20 kg** — squat, bench, overhead press. `primary`,
 * and a fixed absolute weight, which is exactly why the program needs no 1RM. */
export const STRONGLIFTS_EMPTY_BAR_START_KG = 20
/**
 * Row and deadlift start at **65–95 lb / 30–40 kg** — `primary` as a *range*.
 * The seed takes the low end and says so on the surface rather than presenting a
 * midpoint as the published figure.
 */
export const STRONGLIFTS_PULL_START_KG = 30

/** *"a weight that you could lift for 10 reps"* — the experienced lifter's
 * seeding instruction, `primary`. A rep count, not a weight: it resolves against
 * a `repMax` anchor and needs no 1RM. */
export const STRONGLIFTS_EXPERIENCED_SEED_REP_MAX_REPS = 10

/**
 * **The 5×5 → 3×5 → 1×5 ladder, recorded as absent.**
 *
 * The single most-repeated StrongLifts rule in secondary write-ups appears in
 * **none** of the failure article, the plateau article, or the app's progression
 * settings; `web.archive.org` was unreachable, so an older edition could not be
 * checked. It is `folklore` — plausibly an artefact of an edition nobody can now
 * read.
 *
 * It is therefore **not** a progression rule in this module and must never be
 * seeded as one. Were it ever wanted, it would be an **athlete-authored optional
 * variant** carrying this note, and never a default.
 */
export const STRONGLIFTS_VOLUME_LADDER = {
	status: PROVENANCE.folklore,
	note: 'The 5×5 → 3×5 → 1×5 ladder is in none of StrongLifts’ own published rules. Unverified; not implemented as the program’s rule.',
} as const

/** What StrongLifts *does* publish for a plateau: reduce squat frequency, add
 * variations, raise bench volume, move to 5×5 Intermediate. **No duration and no
 * strength standard** — the program says it ends and never says when, and the
 * app must not claim otherwise. */
export const STRONGLIFTS_EXIT_SEQUENCE = [
	'Reduce squat frequency from 3×/wk to 2×/wk',
	'Add lift variations (pause squats and similar)',
	'Raise bench volume to 3×/wk with variations',
	'Move to StrongLifts 5×5 Intermediate',
] as const

// ——— Starting Strength ————————————————————————————————————————————————————

export const STARTING_STRENGTH_SET_COUNT = 3
export const STARTING_STRENGTH_REPS_PER_SET = 5
export const STARTING_STRENGTH_DEADLIFT_SET_COUNT = 1

/** *"if you've been going up 10 lbs you start going up 5 lbs"* — `primary`. The
 * reset does **two things at once**, which is why the increment is per-lift
 * state and not a constant. */
export const STARTING_STRENGTH_LOWER_INCREMENT_KG = 5
export const STARTING_STRENGTH_LOWER_INCREMENT_AFTER_STALL_KG = 2.5
export const STARTING_STRENGTH_UPPER_INCREMENT_KG = 2.5
export const STARTING_STRENGTH_UPPER_INCREMENT_AFTER_STALL_KG = 1.25

/** Reset ~10 % — `convention`. */
export const STARTING_STRENGTH_STALL_CUT_PCT = 10
/** The press resets **8–10 %** — `convention`, published as a range; the low end
 * is taken and stated. */
export const STARTING_STRENGTH_PRESS_STALL_CUT_PCT = 8

/**
 * How many misses precede the reset is **not published** for Starting Strength.
 * `convention`: the family's three is used, and the surface says it is the
 * family's number rather than the program's.
 */
export const STARTING_STRENGTH_STALLS_BEFORE_RESPONSE = 3

// ——— GreySkull LP —————————————————————————————————————————————————————————

/** `2×5` then a final `5+` taken to as many reps as possible. The AMRAP set
 * *is* the rule, which is why the predicate is `minRepsOnAmrapSet`. */
export const GREYSKULL_FIXED_SET_COUNT = 2
export const GREYSKULL_REPS_PER_SET = 5
/** Hit ≥ 5 on the `5+` set → add weight. `secondary`. */
export const GREYSKULL_MIN_AMRAP_REPS = 5

export const GREYSKULL_UPPER_INCREMENT_KG = 1.25
export const GREYSKULL_LOWER_INCREMENT_KG = 2.5

/**
 * **The double increment — reverse-engineered, and labelled everywhere it is
 * shown.** An AMRAP set reaching **≥ 10 reps** adds **twice** the usual
 * increment. This is what makes GreySkull structurally different: the increment
 * is a function of the logged rep count.
 *
 * `secondary` — the primary source is a paid e-book and the 10-rep threshold
 * could only be established from secondary write-ups.
 */
export const GREYSKULL_DOUBLE_INCREMENT_AT_REPS = 10
export const GREYSKULL_DOUBLE_INCREMENT_FACTOR = 2

/** Fall short of 5 on the final set → cut that lift ~10 %. `convention`. */
export const GREYSKULL_STALL_CUT_PCT = 10
/** **1** — the response is immediate; there is no repeat-then-cut ladder here. */
export const GREYSKULL_STALLS_BEFORE_RESPONSE = 1

// ——— The percentage families (vocabulary complete, seeded in a later slice) ——

/** *"weekly increases of 2.5% of your top set of 5 on Monday"* — `primary`. A
 * percentage of the lifter's own last top set: a fourth load basis, distinct
 * from both an absolute delta and a percentage of a training max. */
export const MADCOW_WEEKLY_INCREASE_PCT = 2.5
/** *"Jumps can be somewhere between 10-15% per set based on your top set"*;
 * StrongLifts' rendering of the same ramp calls it a 12.5 % set interval.
 * `primary`, as a range. */
export const MADCOW_RAMP_SET_INTERVAL_PCT = 12.5
/**
 * *"reset several weeks back and rebuild"* — `primary` as an instruction,
 * `convention` as a number: **"several" is not a number**, and four weeks is the
 * app's choice, not Madcow's. Also the family's only **program-scoped** rule: it
 * fires when the *majority* of lifts are stalling.
 */
export const MADCOW_ROLLBACK_SESSIONS_BACK = 4

/**
 * The training max is **85 % or 90 %** of an actual-or-estimated 1RM — `primary`
 * as the two published options, and **`convention` as a construct: the training
 * max has no evidence base at all.** It is adopted because every 5/3/1 and nSuns
 * prescription is a percentage of it, and it is stored with its
 * `workingFraction` visible so that "85 % of a 90 % TM is 76.5 % of the true
 * 1RM" is a visible collision rather than a laundered one.
 */
export const FIVE_THREE_ONE_TRAINING_MAX_PCT_OPTIONS = [85, 90] as const
export const FIVE_THREE_ONE_DEFAULT_TRAINING_MAX_PCT = 90
/** *"If you get fewer than 3 reps, use that number to estimate your 1 Rep Max,
 * and reset your TM based on that for your next cycle."* — `primary`, and the
 * whole reason the Anchor Re-estimate response exists. */
export const FIVE_THREE_ONE_MIN_AMRAP_REPS = 3
export const FIVE_THREE_ONE_WEEKS_PER_CYCLE = 3
/** Per cycle: press and bench +5 lb, squat and deadlift +10 lb, on the **TM**. */
export const FIVE_THREE_ONE_UPPER_TM_INCREMENT_KG = 2.5
export const FIVE_THREE_ONE_LOWER_TM_INCREMENT_KG = 5
/** The fourth week (40/50/60 % × 5/5/5) is **`disputed`**: thefitness.wiki calls
 * it *"outdated and no longer used"*, every online calculator still shows it.
 * The surface reports the disagreement rather than picking. */
export const FIVE_THREE_ONE_FOURTH_WEEK = {
	status: PROVENANCE.disputed,
	note: 'Whether 5/3/1 has a fourth light week is edition-dependent: later editions drop it, most calculators still show it. The app reports the disagreement rather than picking.',
} as const

/**
 * nSuns' training-max table, verbatim: *"0-1 reps: 0 lb / 2-3 reps: 5 lb / 4-5
 * reps: 5 to 10 lb / 6+ reps: 10 to 15 lb"*.
 *
 * **Two of the four rows publish a range, so the rule is not deterministic as
 * published.** The seed takes the **low end** of each range and the surface says
 * so — `primary` for the two fixed rows, `convention` for the choice on the
 * other two.
 */
export const NSUNS_TRAINING_MAX_TABLE_LOW_END_KG = [
	{ minReps: 0, deltaKg: 0 },
	{ minReps: 2, deltaKg: 2.5 },
	{ minReps: 4, deltaKg: 2.5 },
	{ minReps: 6, deltaKg: 5 },
] as const

// ——— The three programs this slice encodes ————————————————————————————————

/**
 * The lifts a program progresses, as slugs. The engine's progression key is the
 * pair `(exerciseId, equipment)`, and `exerciseId` is a database row — so each
 * builder below takes the ids it needs and this module stays free of Prisma.
 */
export type StrongLiftsLiftSlug =
	| 'squat'
	| 'benchPress'
	| 'barbellRow'
	| 'overheadPress'
	| 'deadlift'

type LiftIds = Partial<Record<StrongLiftsLiftSlug, string>> &
	Record<string, string | undefined>

function absolute(deltaKg: number): Increment {
	return { kind: 'absolute', deltaKg }
}

/**
 * **StrongLifts 5×5, Basic** — the reference implementation.
 *
 * Workout A is squat · bench · row; Workout B is squat · overhead press ·
 * deadlift `1×5`. Three sessions a week alternating A and B, so the true cycle
 * is **ABA · BAB — two weeks, six sessions** — which is why the cursor stores
 * *which of A/B is next* rather than a weekday.
 */
export function strongLifts5x5Basic(ids: LiftIds): ProgramDefinition {
	const fiveByFive = (
		exerciseId: string,
		dayIds: string[],
		startKg: number,
	): LiftProgressionRule => ({
		exerciseId,
		equipment: null,
		dayIds,
		setCount: STRONGLIFTS_SET_COUNT,
		repsPerSet: STRONGLIFTS_REPS_PER_SET,
		setWeightSources: Array.from({ length: STRONGLIFTS_SET_COUNT }, () => ({
			kind: 'workingWeight' as const,
		})),
		trigger: { kind: 'perSession', everyNSessions: 1 },
		successPredicate: { kind: 'allRepsAllSets' },
		increment: absolute(STRONGLIFTS_INCREMENT_KG),
		stallsBeforeResponse: STRONGLIFTS_STALLS_BEFORE_RESPONSE,
		stallResponse: { kind: 'stallCut', pct: STRONGLIFTS_STALL_CUT_PCT },
		incrementAdjustmentOnStall: { kind: 'unchanged' },
		defaultStartKg: startKg,
		startSeedRepMaxReps: STRONGLIFTS_EXPERIENCED_SEED_REP_MAX_REPS,
	})

	const rules: LiftProgressionRule[] = []
	if (ids.squat) {
		rules.push(
			fiveByFive(ids.squat, ['A', 'B'], STRONGLIFTS_EMPTY_BAR_START_KG),
		)
	}
	if (ids.benchPress) {
		rules.push(
			fiveByFive(ids.benchPress, ['A'], STRONGLIFTS_EMPTY_BAR_START_KG),
		)
	}
	if (ids.barbellRow) {
		rules.push(fiveByFive(ids.barbellRow, ['A'], STRONGLIFTS_PULL_START_KG))
	}
	if (ids.overheadPress) {
		rules.push(
			fiveByFive(ids.overheadPress, ['B'], STRONGLIFTS_EMPTY_BAR_START_KG),
		)
	}
	if (ids.deadlift) {
		rules.push({
			// The exception, in full: one axis is the set count, the other is the
			// jump, and the stall shrinks the jump exactly as published.
			...fiveByFive(ids.deadlift, ['B'], STRONGLIFTS_PULL_START_KG),
			setCount: STRONGLIFTS_DEADLIFT_SET_COUNT,
			setWeightSources: [{ kind: 'workingWeight' }],
			increment: absolute(STRONGLIFTS_DEADLIFT_INCREMENT_KG),
			incrementAdjustmentOnStall: {
				kind: 'stepDown',
				toDeltaKg: STRONGLIFTS_DEADLIFT_REDUCED_INCREMENT_KG,
			},
		})
	}

	return {
		id: 'prog_stronglifts_5x5_basic',
		key: 'stronglifts-5x5',
		variantId: 'basic',
		name: 'StrongLifts 5×5',
		cursorKind: 'alternatingDays',
		initialCursor: { kind: 'alternatingDays', nextDayId: 'A' },
		dayIds: ['A', 'B'],
		liftRules: rules,
		provenanceNote:
			'Increments and the three-session −10 % Stall Cut are StrongLifts’ own published defaults. The percentage is program convention and is supported by no trial. The 5×5 → 3×5 → 1×5 ladder is not StrongLifts’ rule and is not implemented. Row and deadlift start at the low end of the published 30–40 kg range.',
	}
}

/**
 * **Starting Strength, phase 1** — squat `3×5`, bench **or** press alternating
 * between sessions, deadlift `1×5`.
 *
 * Its remedy is the one that does two things at once: cut the weight **and**
 * shrink the increment, permanently.
 */
export function startingStrengthPhaseOne(ids: LiftIds): ProgramDefinition {
	const rule = (
		exerciseId: string,
		dayIds: string[],
		opts: {
			setCount: number
			incrementKg: number
			afterStallKg: number
			cutPct: number
		},
	): LiftProgressionRule => ({
		exerciseId,
		equipment: null,
		dayIds,
		setCount: opts.setCount,
		repsPerSet: STARTING_STRENGTH_REPS_PER_SET,
		setWeightSources: Array.from({ length: opts.setCount }, () => ({
			kind: 'workingWeight' as const,
		})),
		trigger: { kind: 'perSession', everyNSessions: 1 },
		successPredicate: { kind: 'allRepsAllSets' },
		increment: absolute(opts.incrementKg),
		stallsBeforeResponse: STARTING_STRENGTH_STALLS_BEFORE_RESPONSE,
		stallResponse: { kind: 'stallCut', pct: opts.cutPct },
		incrementAdjustmentOnStall: {
			kind: 'stepDown',
			toDeltaKg: opts.afterStallKg,
		},
		defaultStartKg: null,
		startSeedRepMaxReps: null,
	})

	const lower = {
		setCount: STARTING_STRENGTH_SET_COUNT,
		incrementKg: STARTING_STRENGTH_LOWER_INCREMENT_KG,
		afterStallKg: STARTING_STRENGTH_LOWER_INCREMENT_AFTER_STALL_KG,
		cutPct: STARTING_STRENGTH_STALL_CUT_PCT,
	}
	const rules: LiftProgressionRule[] = []
	if (ids.squat) rules.push(rule(ids.squat, ['A', 'B'], lower))
	if (ids.benchPress) {
		rules.push(
			rule(ids.benchPress, ['A'], {
				setCount: STARTING_STRENGTH_SET_COUNT,
				incrementKg: STARTING_STRENGTH_UPPER_INCREMENT_KG,
				afterStallKg: STARTING_STRENGTH_UPPER_INCREMENT_AFTER_STALL_KG,
				cutPct: STARTING_STRENGTH_STALL_CUT_PCT,
			}),
		)
	}
	if (ids.overheadPress) {
		rules.push(
			rule(ids.overheadPress, ['B'], {
				setCount: STARTING_STRENGTH_SET_COUNT,
				incrementKg: STARTING_STRENGTH_UPPER_INCREMENT_KG,
				afterStallKg: STARTING_STRENGTH_UPPER_INCREMENT_AFTER_STALL_KG,
				// The press is the one lift with its own published cut.
				cutPct: STARTING_STRENGTH_PRESS_STALL_CUT_PCT,
			}),
		)
	}
	if (ids.deadlift) {
		rules.push(
			rule(ids.deadlift, ['A', 'B'], {
				...lower,
				setCount: STARTING_STRENGTH_DEADLIFT_SET_COUNT,
			}),
		)
	}

	return {
		id: 'prog_starting_strength_phase1',
		key: 'starting-strength',
		variantId: 'phase-1',
		name: 'Starting Strength',
		cursorKind: 'alternatingDays',
		initialCursor: { kind: 'alternatingDays', nextDayId: 'A' },
		dayIds: ['A', 'B'],
		liftRules: rules,
		provenanceNote:
			'The reset cuts ~10 % (the press 8–10 %, low end taken) and reduces the increment — both published, and the percentages are program convention with no trial behind them. How many misses precede a reset is not published; the family’s three is used.',
	}
}

/**
 * **GreySkull LP** — `2×5` plus a final `5+`, where the AMRAP set is the rule.
 *
 * Ships labelled: the ≥ 10-rep double increment and the A/B day composition are
 * **reverse-engineered from secondary sources**, because the primary is a paid
 * e-book.
 */
export function greySkullLp(ids: LiftIds): ProgramDefinition {
	const setCount = GREYSKULL_FIXED_SET_COUNT + 1
	const rule = (
		exerciseId: string,
		dayIds: string[],
		incrementKg: number,
	): LiftProgressionRule => ({
		exerciseId,
		equipment: null,
		dayIds,
		setCount,
		repsPerSet: GREYSKULL_REPS_PER_SET,
		setWeightSources: Array.from({ length: setCount }, () => ({
			kind: 'workingWeight' as const,
		})),
		trigger: { kind: 'perSession', everyNSessions: 1 },
		successPredicate: {
			kind: 'minRepsOnAmrapSet',
			minReps: GREYSKULL_MIN_AMRAP_REPS,
		},
		increment: {
			kind: 'multipliedOnAmrap',
			baseDeltaKg: incrementKg,
			atOrAboveReps: GREYSKULL_DOUBLE_INCREMENT_AT_REPS,
			factor: GREYSKULL_DOUBLE_INCREMENT_FACTOR,
		},
		stallsBeforeResponse: GREYSKULL_STALLS_BEFORE_RESPONSE,
		stallResponse: { kind: 'stallCut', pct: GREYSKULL_STALL_CUT_PCT },
		incrementAdjustmentOnStall: { kind: 'unchanged' },
		defaultStartKg: null,
		startSeedRepMaxReps: null,
	})

	const rules: LiftProgressionRule[] = []
	if (ids.squat)
		rules.push(rule(ids.squat, ['A'], GREYSKULL_LOWER_INCREMENT_KG))
	if (ids.benchPress) {
		rules.push(rule(ids.benchPress, ['A'], GREYSKULL_UPPER_INCREMENT_KG))
	}
	if (ids.deadlift) {
		rules.push(rule(ids.deadlift, ['B'], GREYSKULL_LOWER_INCREMENT_KG))
	}
	if (ids.overheadPress) {
		rules.push(rule(ids.overheadPress, ['B'], GREYSKULL_UPPER_INCREMENT_KG))
	}

	return {
		id: 'prog_greyskull_lp_base',
		key: 'greyskull-lp',
		variantId: 'base',
		name: 'GreySkull LP',
		cursorKind: 'alternatingDays',
		initialCursor: { kind: 'alternatingDays', nextDayId: 'A' },
		dayIds: ['A', 'B'],
		liftRules: rules,
		provenanceNote:
			'GreySkull’s primary source is a paid e-book. The ≥ 10-rep double increment, the day composition and the ~10 % cut are reverse-engineered from secondary sources, and the cut percentage has no trial behind it.',
	}
}
