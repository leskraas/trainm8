/**
 * **The exercise database** (Slice 6) — the rows the picker offers, and the
 * **Load Semantics** that make the load input say `per hand` on a dumbbell
 * press and `total` on a goblet squat.
 *
 * ## Two layers, and why
 *
 * 1. **A vendored snapshot** of `free-exercise-db` (Unlicense) in
 *    `exercise-corpus.free-exercise-db.ts` — 704 curated rows, so an athlete
 *    does not hit *"my exercise isn't here"* in week one. It carries name,
 *    muscles, equipment and compound/isolation, and **nothing else**: no open
 *    dataset carries movement pattern, laterality or load semantics.
 * 2. **An authored overlay**, below, for the lifts that matter — every lift the
 *    StrongLifts, Starting Strength, GreySkull, Madcow, 5/3/1 and nSuns
 *    programs progress, plus the assistance work those programs name. These
 *    rows state a **movement pattern**, whether the movement is **unilateral**,
 *    their **variants** and each variant's Load Semantics.
 *
 * Everywhere else those three facets stay **null**. A null is a stated absence;
 * a guess would be a fabrication, and the picker filter reads better with
 * twelve honest patterns on the rows that have one than with 700 invented ones.
 *
 * ## The progression key is `(exerciseId, equipment)`
 *
 * An **Exercise Variant** is the equipment realization, and the pair
 * `(exerciseId, equipment)` is what a `ProgramLiftState` progresses — so
 * barbell bench and dumbbell bench progress separately without the picker
 * growing a second row for every implement. An **alias** is search-only and
 * never a second identity: nothing may be logged against one.
 *
 * **The shipped rows keep their ids.** `ex_bb_bench` and `ex_db_bench` were
 * seeded as two `Exercise` rows in `20260519130231`, and both already carry
 * history and program-rule references. Merging them into one movement with two
 * variants would orphan a logged set, which no seed may do; instead they are
 * linked by a `variationGroupId` — discovery only, never identity — and each
 * gets the variant its own equipment means. New movements authored here are
 * free to carry several variants from the start, and do.
 *
 * @see exercise-corpus.free-exercise-db.ts for the snapshot and its licence.
 * @see exercise-seed.server.ts for the writer.
 */
import { FREE_EXERCISE_DB_ROWS } from './exercise-corpus.free-exercise-db.ts'
import {
	type EquipmentId,
	type ExerciseAngle,
	type LoadValueKind,
	type MovementPattern,
} from './strength-log.ts'
import { type MuscleGroup } from './workout-schema.ts'

/** The facts a corpus row carries from its source, and no more. */
export type CorpusExercise = {
	id: string
	name: string
	primaryMuscle: MuscleGroup
	/** `null` where the source named muscles this vocabulary cannot carry —
	 * distinct from `[]`, which says the source named none. */
	secondaryMuscles: MuscleGroup[] | null
	equipment: EquipmentId
	isCompound: boolean
}

/**
 * One equipment realization and its **Load Semantics**. The first variant of an
 * exercise is its default: a picker with no equipment choice still resolves to
 * exactly one row.
 */
export type CorpusVariant = {
	equipment: EquipmentId
	/** `null` where the movement has no angle — a positive statement. */
	angle?: ExerciseAngle
	/** What the picker shows, stored rather than composed at read time. */
	displayName: string
	loadKind: LoadValueKind
	/** What the empty implement weighs. Null where there is no bar to be empty,
	 * and null rather than an average where the bar is not standardised (an EZ
	 * bar and a trap bar both vary by several kilos between gyms). */
	barKg?: number
	perSideMultiplier?: 1 | 2
	isFixed?: boolean
	isAssisting?: boolean
	useBodyweightForBar?: boolean
}

/** A corpus row as the seed writes it. */
export type SeedExercise = CorpusExercise & {
	/** Authored here or null — no dataset carries it. */
	movementPattern: MovementPattern | null
	/** Authored here or null, for the same reason: `null` says *nobody stated
	 * whether this movement is worked one side at a time*, which is not the same
	 * sentence as `false` (ADR 0061). */
	unilateral: boolean | null
	/** Discovery only, never identity. */
	variationGroupId: string | null
	/** Search-only. Never a second identity. */
	aliases: string[]
	/** At least one; the first is the default. */
	variants: CorpusVariant[]
}

/** An authored row: the same shape, with a pattern and a laterality that are
 * actually stated. Both are required here and nullable everywhere else, so the
 * type itself keeps "authored" and "defaulted" apart. */
type AuthoredExercise = SeedExercise & {
	movementPattern: MovementPattern
	unilateral: boolean
}

/**
 * The **stable id of a variant**, so re-running the seed refreshes the row
 * rather than duplicating it.
 *
 * The default variant's id is `var_` + the exercise's id — the scheme migration
 * `20260814120000` used to backfill one default variant per existing exercise,
 * restated here because this seed must land on those very rows.
 */
export function exerciseVariantId(
	exerciseId: string,
	variant: CorpusVariant,
	isDefault: boolean,
): string {
	if (isDefault) return `var_${exerciseId}`
	const angle = variant.angle ? `_${variant.angle}` : ''
	return `var_${exerciseId}_${variant.equipment}${angle}`
}

/**
 * **Load Semantics derived from an equipment string** — the fallback for the
 * 670-odd rows nobody has authored, and a restatement of the same derivation
 * migration `20260814120000` used, with two refinements it could not make in
 * SQL: a band has no kilos and an assisting machine's number subtracts, so
 * neither is `external`.
 *
 * This is a **derivation, not a measurement**. It is right about the shape of
 * the number the athlete types and says nothing about the movement.
 */
export function defaultVariantFor(row: CorpusExercise): CorpusVariant {
	const base = { equipment: row.equipment, displayName: row.name }
	switch (row.equipment) {
		case 'barbell':
			// The 20 kg Olympic bar is what "barbell" means absent any other
			// statement; the athlete's own bar overrides it in their inventory.
			return { ...base, loadKind: 'external', barKg: 20, perSideMultiplier: 2 }
		case 'dumbbell':
			return {
				...base,
				loadKind: 'perSide',
				perSideMultiplier: 2,
				isFixed: true,
			}
		case 'bodyweight':
			return {
				...base,
				loadKind: 'bodyweight',
				perSideMultiplier: 1,
				useBodyweightForBar: true,
			}
		case 'band':
			return { ...base, loadKind: 'band', perSideMultiplier: 1 }
		case 'assisted-machine':
			return {
				...base,
				loadKind: 'assisted',
				perSideMultiplier: 1,
				isAssisting: true,
				useBodyweightForBar: true,
			}
		default:
			return { ...base, loadKind: 'external', perSideMultiplier: 1 }
	}
}

/** A 20 kg Olympic barbell variant — the default realization of a barbell lift. */
function barbell(displayName: string): CorpusVariant {
	return {
		equipment: 'barbell',
		displayName,
		loadKind: 'external',
		barKg: 20,
		perSideMultiplier: 2,
	}
}

/** A fixed-dumbbell variant. `perSide`, because 32 on a dumbbell press is 64 kg
 * of load and storing 32 as the load would halve the athlete's history. */
function dumbbell(displayName: string, angle?: ExerciseAngle): CorpusVariant {
	return {
		equipment: 'dumbbell',
		angle,
		displayName,
		loadKind: 'perSide',
		perSideMultiplier: 2,
		isFixed: true,
	}
}

/** A bodyweight variant: the "bar" is the athlete, so an added-load set is the
 * same calculator with no second code path. */
function bodyweight(displayName: string): CorpusVariant {
	return {
		equipment: 'bodyweight',
		displayName,
		loadKind: 'bodyweight',
		perSideMultiplier: 1,
		useBodyweightForBar: true,
	}
}

/** The assisted pull-up/dip machine: a positive number that means *less* work. */
function assisted(displayName: string): CorpusVariant {
	return {
		equipment: 'assisted-machine',
		displayName,
		loadKind: 'assisted',
		perSideMultiplier: 1,
		isAssisting: true,
		useBodyweightForBar: true,
	}
}

/** A single-stack or plate-loaded machine, marked in real kilos. */
function machine(
	displayName: string,
	equipment: EquipmentId = 'machine',
): CorpusVariant {
	return {
		equipment,
		displayName,
		loadKind: 'external',
		perSideMultiplier: 1,
	}
}

/**
 * **The authored lifts** — every lift the six programs in `program.constants.ts`
 * and the deferred percentage families progress, plus the assistance work they
 * name by name.
 *
 * The ids are the ones already in the database: `ex_bb_*` / `ex_db_*` / `ex_bw_*`
 * from the `20260519130231` seed, and `ex_fedb_*` where the movement arrived
 * with the snapshot. Nothing here mints a second id for a movement that has one.
 */
export const AUTHORED_LIFTS: AuthoredExercise[] = [
	// ── The squat pattern ───────────────────────────────────────────────────
	{
		id: 'ex_bb_back_squat',
		name: 'Back Squat',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes', 'hamstrings', 'lower-back'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'squat',
		unilateral: false,
		variationGroupId: 'grp_squat',
		aliases: ['squat', 'low-bar squat', 'high-bar squat', 'BS'],
		variants: [
			barbell('Back Squat (Barbell)'),
			machine('Back Squat (Smith Machine)', 'smith-machine'),
		],
	},
	{
		id: 'ex_bb_front_squat',
		name: 'Front Squat',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes', 'abs'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'squat',
		unilateral: false,
		variationGroupId: 'grp_squat',
		aliases: ['FS'],
		variants: [barbell('Front Squat (Barbell)')],
	},
	{
		id: 'ex_db_goblet_squat',
		name: 'Goblet Squat',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes', 'abs'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'squat',
		unilateral: false,
		variationGroupId: 'grp_squat',
		aliases: [],
		// One bell held at the chest: the number is the **total**, not per hand.
		// This is the movement the `perSide` default is wrong about.
		variants: [
			{
				equipment: 'dumbbell',
				displayName: 'Goblet Squat (Dumbbell)',
				loadKind: 'external',
				perSideMultiplier: 1,
				isFixed: true,
			},
			{
				equipment: 'kettlebell',
				displayName: 'Goblet Squat (Kettlebell)',
				loadKind: 'external',
				perSideMultiplier: 1,
				isFixed: true,
			},
		],
	},
	{
		id: 'ex_bw_squat',
		name: 'Bodyweight Squat',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes'],
		equipment: 'bodyweight',
		isCompound: true,
		movementPattern: 'squat',
		unilateral: false,
		variationGroupId: 'grp_squat',
		aliases: ['air squat'],
		variants: [bodyweight('Bodyweight Squat')],
	},
	{
		id: 'ex_mc_leg_press',
		name: 'Leg Press',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes', 'hamstrings'],
		equipment: 'machine',
		isCompound: true,
		movementPattern: 'squat',
		unilateral: false,
		variationGroupId: 'grp_squat',
		aliases: [],
		variants: [machine('Leg Press (Machine)')],
	},

	// ── The hinge ───────────────────────────────────────────────────────────
	{
		id: 'ex_bb_deadlift',
		name: 'Deadlift',
		primaryMuscle: 'hamstrings',
		secondaryMuscles: ['glutes', 'lower-back', 'back', 'forearms'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'hinge',
		unilateral: false,
		variationGroupId: 'grp_deadlift',
		aliases: ['DL', 'conventional deadlift'],
		variants: [
			barbell('Deadlift (Barbell)'),
			// A trap bar is not standardised — 25 kg is the common one and several
			// others exist, so the bar weight stays null rather than guessed.
			{
				equipment: 'trap-bar',
				displayName: 'Deadlift (Trap Bar)',
				loadKind: 'external',
				perSideMultiplier: 2,
			},
		],
	},
	{
		id: 'ex_bb_sumo_dl',
		name: 'Sumo Deadlift',
		primaryMuscle: 'glutes',
		secondaryMuscles: ['hamstrings', 'quads', 'lower-back', 'back'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'hinge',
		unilateral: false,
		variationGroupId: 'grp_deadlift',
		aliases: ['sumo'],
		variants: [barbell('Sumo Deadlift (Barbell)')],
	},
	{
		id: 'ex_bb_rdl',
		name: 'Romanian Deadlift',
		primaryMuscle: 'hamstrings',
		secondaryMuscles: ['glutes', 'lower-back'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'hinge',
		unilateral: false,
		variationGroupId: 'grp_rdl',
		aliases: ['RDL', 'stiff-leg deadlift'],
		variants: [barbell('Romanian Deadlift (Barbell)')],
	},
	{
		id: 'ex_db_rdl',
		name: 'Dumbbell RDL',
		primaryMuscle: 'hamstrings',
		secondaryMuscles: ['glutes', 'lower-back'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'hinge',
		unilateral: false,
		variationGroupId: 'grp_rdl',
		aliases: ['dumbbell romanian deadlift'],
		variants: [dumbbell('Romanian Deadlift (Dumbbell)')],
	},
	{
		id: 'ex_bb_good_morning',
		name: 'Good Morning',
		primaryMuscle: 'hamstrings',
		secondaryMuscles: ['glutes', 'lower-back'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'hinge',
		unilateral: false,
		variationGroupId: 'grp_rdl',
		aliases: [],
		variants: [barbell('Good Morning (Barbell)')],
	},
	{
		id: 'ex_fedb_power_clean',
		name: 'Power Clean',
		primaryMuscle: 'hamstrings',
		secondaryMuscles: ['glutes', 'quads', 'lower-back', 'shoulders', 'calves'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'hinge',
		unilateral: false,
		variationGroupId: 'grp_clean',
		aliases: ['clean', 'PC'],
		variants: [barbell('Power Clean (Barbell)')],
	},
	{
		id: 'ex_bb_hip_thrust',
		name: 'Hip Thrust',
		primaryMuscle: 'glutes',
		secondaryMuscles: ['hamstrings'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'hip-extension',
		unilateral: false,
		variationGroupId: 'grp_hip_thrust',
		aliases: ['barbell hip thrust'],
		variants: [barbell('Hip Thrust (Barbell)')],
	},

	// ── The lunge ───────────────────────────────────────────────────────────
	{
		id: 'ex_bb_lunge',
		name: 'Barbell Lunge',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes', 'hamstrings'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'lunge',
		unilateral: true,
		variationGroupId: 'grp_lunge',
		aliases: [],
		variants: [barbell('Lunge (Barbell)')],
	},
	{
		id: 'ex_db_lunge',
		name: 'Dumbbell Lunge',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes', 'hamstrings'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'lunge',
		unilateral: true,
		variationGroupId: 'grp_lunge',
		aliases: [],
		variants: [dumbbell('Lunge (Dumbbell)')],
	},
	{
		id: 'ex_db_split_squat',
		name: 'Dumbbell Split Squat',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'lunge',
		unilateral: true,
		variationGroupId: 'grp_lunge',
		aliases: ['split squat'],
		variants: [dumbbell('Split Squat (Dumbbell)')],
	},
	{
		id: 'ex_db_rfe_split_squat',
		name: 'Rear-foot-elevated split squat',
		primaryMuscle: 'quads',
		secondaryMuscles: ['glutes'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'lunge',
		unilateral: true,
		variationGroupId: 'grp_lunge',
		aliases: ['bulgarian split squat', 'RFE split squat'],
		variants: [dumbbell('Rear-foot-elevated split squat (Dumbbell)')],
	},
	{
		id: 'ex_db_step_up',
		name: 'Dumbbell Step Up',
		primaryMuscle: 'glutes',
		secondaryMuscles: ['quads', 'hamstrings'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'lunge',
		unilateral: true,
		variationGroupId: 'grp_lunge',
		aliases: ['step-up'],
		variants: [dumbbell('Step Up (Dumbbell)')],
	},

	// ── Horizontal push ─────────────────────────────────────────────────────
	{
		id: 'ex_bb_bench',
		name: 'Bench Press',
		primaryMuscle: 'chest',
		secondaryMuscles: ['triceps', 'shoulders'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'horizontal-push',
		unilateral: false,
		variationGroupId: 'grp_bench',
		aliases: ['bench', 'flat bench', 'BP'],
		variants: [
			{ ...barbell('Bench Press (Barbell)'), angle: 'flat' },
			machine('Bench Press (Smith Machine)', 'smith-machine'),
		],
	},
	{
		id: 'ex_db_bench',
		name: 'Dumbbell Bench Press',
		primaryMuscle: 'chest',
		secondaryMuscles: ['triceps', 'shoulders'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'horizontal-push',
		unilateral: false,
		variationGroupId: 'grp_bench',
		aliases: ['DB bench'],
		variants: [dumbbell('Bench Press (Dumbbell)', 'flat')],
	},
	{
		id: 'ex_bb_incline_bench',
		name: 'Incline Bench Press',
		primaryMuscle: 'chest',
		secondaryMuscles: ['shoulders', 'triceps'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'horizontal-push',
		unilateral: false,
		variationGroupId: 'grp_bench',
		aliases: ['incline bench'],
		variants: [
			{ ...barbell('Incline Bench Press (Barbell)'), angle: 'incline' },
		],
	},
	{
		id: 'ex_db_incline_bench',
		name: 'Dumbbell Incline Press',
		primaryMuscle: 'chest',
		secondaryMuscles: ['shoulders', 'triceps'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'horizontal-push',
		unilateral: false,
		variationGroupId: 'grp_bench',
		aliases: ['incline dumbbell press'],
		variants: [dumbbell('Incline Bench Press (Dumbbell)', 'incline')],
	},
	{
		id: 'ex_fedb_close_grip_barbell_bench_press',
		name: 'Close-Grip Barbell Bench Press',
		primaryMuscle: 'triceps',
		secondaryMuscles: ['chest', 'shoulders'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'horizontal-push',
		unilateral: false,
		variationGroupId: 'grp_bench',
		aliases: ['CGBP', 'close grip bench'],
		variants: [
			{ ...barbell('Close-Grip Bench Press (Barbell)'), angle: 'flat' },
		],
	},
	{
		id: 'ex_bw_pushup',
		name: 'Push-up',
		primaryMuscle: 'chest',
		secondaryMuscles: ['triceps', 'shoulders', 'abs'],
		equipment: 'bodyweight',
		isCompound: true,
		movementPattern: 'horizontal-push',
		unilateral: false,
		variationGroupId: 'grp_bench',
		aliases: ['pushup', 'press-up'],
		variants: [bodyweight('Push-up')],
	},

	// ── Vertical push ───────────────────────────────────────────────────────
	{
		id: 'ex_bb_ohp',
		name: 'Overhead Press',
		primaryMuscle: 'shoulders',
		secondaryMuscles: ['triceps', 'abs'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'vertical-push',
		unilateral: false,
		variationGroupId: 'grp_overhead_press',
		aliases: ['OHP', 'military press', 'press', 'shoulder press'],
		variants: [barbell('Overhead Press (Barbell)')],
	},
	{
		id: 'ex_db_ohp',
		name: 'Dumbbell Overhead Press',
		primaryMuscle: 'shoulders',
		secondaryMuscles: ['triceps'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'vertical-push',
		unilateral: false,
		variationGroupId: 'grp_overhead_press',
		aliases: ['DB shoulder press'],
		variants: [dumbbell('Overhead Press (Dumbbell)')],
	},
	{
		id: 'ex_bw_dip',
		name: 'Dip',
		primaryMuscle: 'triceps',
		secondaryMuscles: ['chest', 'shoulders'],
		equipment: 'bodyweight',
		isCompound: true,
		movementPattern: 'vertical-push',
		unilateral: false,
		variationGroupId: 'grp_dip',
		aliases: ['dips', 'parallel bar dip'],
		variants: [bodyweight('Dip'), assisted('Dip (Assisted Machine)')],
	},

	// ── Horizontal pull ─────────────────────────────────────────────────────
	{
		id: 'ex_bb_row',
		name: 'Barbell Row',
		primaryMuscle: 'back',
		secondaryMuscles: ['biceps', 'lower-back', 'forearms'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'horizontal-pull',
		unilateral: false,
		variationGroupId: 'grp_row',
		aliases: ['bent-over row', 'BOR', 'row'],
		variants: [barbell('Barbell Row')],
	},
	{
		id: 'ex_bb_pendlay_row',
		name: 'Pendlay Row',
		primaryMuscle: 'back',
		secondaryMuscles: ['biceps', 'lower-back'],
		equipment: 'barbell',
		isCompound: true,
		movementPattern: 'horizontal-pull',
		unilateral: false,
		variationGroupId: 'grp_row',
		aliases: [],
		variants: [barbell('Pendlay Row (Barbell)')],
	},
	{
		id: 'ex_db_row',
		name: 'Dumbbell Row',
		primaryMuscle: 'back',
		secondaryMuscles: ['biceps', 'forearms'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'horizontal-pull',
		unilateral: true,
		variationGroupId: 'grp_row',
		aliases: ['one-arm row', 'DB row'],
		// One bell, one arm at a time: the number is that bell, not a pair.
		variants: [
			{
				equipment: 'dumbbell',
				displayName: 'Row (Dumbbell)',
				loadKind: 'external',
				perSideMultiplier: 1,
				isFixed: true,
			},
		],
	},
	{
		id: 'ex_mc_seated_row',
		name: 'Seated Cable Row',
		primaryMuscle: 'back',
		secondaryMuscles: ['biceps', 'forearms'],
		equipment: 'machine',
		isCompound: true,
		movementPattern: 'horizontal-pull',
		unilateral: false,
		variationGroupId: 'grp_row',
		aliases: ['cable row'],
		variants: [machine('Seated Row (Cable)')],
	},
	{
		id: 'ex_bw_inverted_row',
		name: 'Inverted Row',
		primaryMuscle: 'back',
		secondaryMuscles: ['biceps'],
		equipment: 'bodyweight',
		isCompound: true,
		movementPattern: 'horizontal-pull',
		unilateral: false,
		variationGroupId: 'grp_row',
		aliases: ['bodyweight row'],
		variants: [bodyweight('Inverted Row')],
	},

	// ── Vertical pull ───────────────────────────────────────────────────────
	{
		id: 'ex_bw_pullup',
		name: 'Pull-up',
		primaryMuscle: 'back',
		secondaryMuscles: ['biceps', 'forearms'],
		equipment: 'bodyweight',
		isCompound: true,
		movementPattern: 'vertical-pull',
		unilateral: false,
		variationGroupId: 'grp_pullup',
		aliases: ['pullup', 'pull ups'],
		variants: [bodyweight('Pull-up'), assisted('Pull-up (Assisted Machine)')],
	},
	{
		id: 'ex_bw_chinup',
		name: 'Chin-up',
		primaryMuscle: 'biceps',
		secondaryMuscles: ['back', 'forearms'],
		equipment: 'bodyweight',
		isCompound: true,
		movementPattern: 'vertical-pull',
		unilateral: false,
		variationGroupId: 'grp_pullup',
		aliases: ['chinup', 'chins'],
		variants: [bodyweight('Chin-up'), assisted('Chin-up (Assisted Machine)')],
	},
	{
		id: 'ex_mc_lat_pulldown',
		name: 'Lat Pulldown',
		primaryMuscle: 'back',
		secondaryMuscles: ['biceps', 'forearms'],
		equipment: 'machine',
		isCompound: true,
		movementPattern: 'vertical-pull',
		unilateral: false,
		variationGroupId: 'grp_pullup',
		aliases: ['pulldown'],
		variants: [machine('Lat Pulldown (Cable)', 'cable')],
	},

	// ── The assistance work the programs name ───────────────────────────────
	{
		id: 'ex_fedb_barbell_curl',
		name: 'Barbell Curl',
		primaryMuscle: 'biceps',
		secondaryMuscles: ['forearms'],
		equipment: 'barbell',
		isCompound: false,
		movementPattern: 'isolation',
		unilateral: false,
		variationGroupId: 'grp_curl',
		aliases: ['bb curl'],
		variants: [
			barbell('Curl (Barbell)'),
			// An EZ bar is not standardised, so its bar weight stays null.
			{
				equipment: 'ez-bar',
				displayName: 'Curl (EZ Bar)',
				loadKind: 'external',
				perSideMultiplier: 2,
			},
		],
	},
	{
		id: 'ex_db_bicep_curl',
		name: 'Bicep Curl',
		primaryMuscle: 'biceps',
		secondaryMuscles: ['forearms'],
		equipment: 'dumbbell',
		isCompound: false,
		movementPattern: 'isolation',
		unilateral: false,
		variationGroupId: 'grp_curl',
		aliases: ['dumbbell curl'],
		variants: [dumbbell('Curl (Dumbbell)')],
	},
	{
		id: 'ex_mc_tricep_pushdown',
		name: 'Tricep Pushdown',
		primaryMuscle: 'triceps',
		secondaryMuscles: [],
		equipment: 'cable',
		isCompound: false,
		movementPattern: 'isolation',
		unilateral: false,
		variationGroupId: null,
		aliases: ['pushdown', 'triceps pressdown'],
		variants: [machine('Tricep Pushdown (Cable)', 'cable')],
	},
	{
		id: 'ex_db_lateral_raise',
		name: 'Lateral Raise',
		primaryMuscle: 'shoulders',
		secondaryMuscles: [],
		equipment: 'dumbbell',
		isCompound: false,
		movementPattern: 'isolation',
		unilateral: false,
		variationGroupId: null,
		aliases: ['side raise'],
		variants: [dumbbell('Lateral Raise (Dumbbell)')],
	},
	{
		id: 'ex_mc_leg_curl',
		name: 'Leg Curl',
		primaryMuscle: 'hamstrings',
		secondaryMuscles: ['calves'],
		equipment: 'machine',
		isCompound: false,
		movementPattern: 'isolation',
		unilateral: false,
		variationGroupId: null,
		aliases: ['hamstring curl'],
		variants: [machine('Leg Curl (Machine)')],
	},
	{
		id: 'ex_mc_leg_ext',
		name: 'Leg Extension',
		primaryMuscle: 'quads',
		secondaryMuscles: [],
		equipment: 'machine',
		isCompound: false,
		movementPattern: 'isolation',
		unilateral: false,
		variationGroupId: null,
		aliases: ['knee extension'],
		variants: [machine('Leg Extension (Machine)')],
	},
	{
		id: 'ex_bw_plank',
		name: 'Plank',
		primaryMuscle: 'abs',
		secondaryMuscles: ['lower-back'],
		equipment: 'bodyweight',
		isCompound: false,
		movementPattern: 'core',
		unilateral: false,
		variationGroupId: null,
		aliases: ['front plank'],
		variants: [bodyweight('Plank')],
	},
	{
		id: 'ex_db_suitcase_carry',
		name: 'Suitcase carry',
		primaryMuscle: 'obliques',
		secondaryMuscles: ['forearms'],
		equipment: 'dumbbell',
		isCompound: true,
		movementPattern: 'carry',
		unilateral: true,
		variationGroupId: null,
		aliases: [],
		// One bell, one side: the number is that bell.
		variants: [
			{
				equipment: 'dumbbell',
				displayName: 'Suitcase Carry (Dumbbell)',
				loadKind: 'external',
				perSideMultiplier: 1,
				isFixed: true,
			},
		],
	},
	{
		id: 'ex_mc_pallof_press',
		name: 'Pallof press',
		primaryMuscle: 'obliques',
		secondaryMuscles: ['abs'],
		equipment: 'cable',
		isCompound: false,
		movementPattern: 'rotation',
		unilateral: true,
		variationGroupId: null,
		aliases: [],
		variants: [machine('Pallof Press (Cable)', 'cable')],
	},
	{
		id: 'ex_mc_calf_raise',
		name: 'Seated Calf Raise',
		primaryMuscle: 'calves',
		secondaryMuscles: [],
		equipment: 'machine',
		isCompound: false,
		movementPattern: 'isolation',
		unilateral: false,
		variationGroupId: 'grp_calf_raise',
		aliases: [],
		variants: [machine('Seated Calf Raise (Machine)')],
	},
]

const AUTHORED_IDS = new Set(AUTHORED_LIFTS.map((lift) => lift.id))

/**
 * **The corpus the seed writes**: the authored lifts first, then every snapshot
 * row nobody has authored, with a derived default variant and honest nulls on
 * the three facets no dataset carries.
 */
export const EXERCISE_CORPUS: SeedExercise[] = [
	...AUTHORED_LIFTS,
	...FREE_EXERCISE_DB_ROWS.filter((row) => !AUTHORED_IDS.has(row.id)).map(
		(row): SeedExercise => ({
			...row,
			movementPattern: null,
			// Not `false`. The snapshot carries no laterality, so the honest row
			// says it does not know rather than asserting a bilateral movement
			// (ADR 0061) — the same treatment the pattern above already had.
			unilateral: null,
			variationGroupId: null,
			aliases: [],
			variants: [defaultVariantFor(row)],
		}),
	),
]
