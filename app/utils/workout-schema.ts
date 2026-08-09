import { z } from 'zod'

// The display labels for these enums live in `app/utils/labels.ts` (#281), the
// single enum→label seam; re-exported here so existing importers are unchanged.
export {
	DISCIPLINE_LABELS,
	INTENT_LABELS,
	STEP_KIND_LABELS,
	INTENSITY_KIND_LABELS,
} from './labels.ts'

export const DISCIPLINES = ['run', 'swim', 'bike', 'strength'] as const
export type Discipline = (typeof DISCIPLINES)[number]

export const CARDIO_DISCIPLINES = ['run', 'swim', 'bike'] as const
export type CardioDiscipline = (typeof CARDIO_DISCIPLINES)[number]

/**
 * Whether a Discipline is an endurance one — the narrowing every caller needs
 * that a `readonly` tuple's `includes` will not do for a wider `Discipline`.
 *
 * One home, because the answer decides real behaviour in more than one place: a
 * **Training Track**'s progression walk and its **Season Span** (ADR 0043 §1),
 * and which segments a new **Plan Outline** lays down (ADR 0047 §6).
 */
export function isCardioDiscipline(
	discipline: Discipline,
): discipline is CardioDiscipline {
	return (CARDIO_DISCIPLINES as readonly Discipline[]).includes(discipline)
}

export const MUSCLE_GROUPS = [
	'chest',
	'back',
	'shoulders',
	'biceps',
	'triceps',
	'forearms',
	'abs',
	'obliques',
	'lower-back',
	'glutes',
	'quads',
	'hamstrings',
	'calves',
	'hip-flexors',
	'full-body',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const WORKOUT_INTENTS = [
	'recovery',
	'endurance',
	'tempo',
	'threshold',
	'vo2max',
	'anaerobic',
	'neuromuscular',
	'race',
	'test',
	'technique',
	'strength-max',
	'strength-hypertrophy',
	'strength-power',
	'strength-endurance',
	'mobility',
] as const
export type WorkoutIntent = (typeof WORKOUT_INTENTS)[number]

/**
 * The enumerated race distances a **Portable Anchor** may name (`racePace`).
 * An enumerated set rather than a free distance, so `3.7k pace` cannot appear
 * in a plan and every anchor has a resolvable **Performance Result** shape.
 */
export const RACE_ANCHORS = [
	'1500m',
	'3k',
	'5k',
	'10k',
	'hm',
	'marathon',
] as const
export type RaceAnchor = (typeof RACE_ANCHORS)[number]

/** The metres each race anchor names. A stored **Performance Result** matches an
 * anchor by this distance; nothing rounds, so a 4.8 km parkrun is not a 5k. */
export const RACE_ANCHOR_DISTANCE_M: Record<RaceAnchor, number> = {
	'1500m': 1500,
	'3k': 3000,
	'5k': 5000,
	'10k': 10000,
	hm: 21097,
	marathon: 42195,
}

// IntensityTarget discriminated union — authored form stored as JSON on WorkoutStep
export const IntensityTargetSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('zoneLabel'), label: z.string().min(1) }),
	z.object({
		kind: z.literal('rpe'),
		min: z.number().min(1).max(10),
		max: z.number().min(1).max(10).optional(),
	}),
	z.object({
		kind: z.literal('hrBpm'),
		min: z.number().int().min(40),
		max: z.number().int().min(40).optional(),
	}),
	z.object({
		kind: z.literal('hrPct'),
		ref: z.enum(['max', 'lthr']),
		minPct: z.number().min(1).max(200),
		maxPct: z.number().min(1).max(200).optional(),
	}),
	z.object({
		kind: z.literal('power'),
		minW: z.number().int().positive(),
		maxW: z.number().int().positive().optional(),
	}),
	z.object({
		kind: z.literal('powerPct'),
		// Which **Threshold** the percentage is of. Optional rather than
		// defaulted: every stored row and every shipped literal predates this
		// field and meant `ftp`, so absent reads as `ftp` and no call site moves.
		// It exists because the percentage was silently %FTP while the interval
		// literature anchors on **MAP** and the critical-power literature on
		// **CP** — three different numbers for one athlete (ADR 0007, #449).
		ref: z.enum(['ftp', 'map', 'cp']).optional(),
		minPct: z.number().min(1).max(300),
		maxPct: z.number().min(1).max(300).optional(),
	}),
	z.object({
		kind: z.literal('pace'),
		minSecPerKm: z.number().int().positive(),
		maxSecPerKm: z.number().int().positive().optional(),
	}),
	/**
	 * The exact pace-channel analogue of `powerPct` — %-of-threshold works for
	 * power and heart rate but not for pace, which is where it is most useful
	 * (ADR 0007, #449). Resolves against `thresholdPaceSecPerKm`.
	 *
	 * **The percentage is of threshold _speed_, not of the seconds-per-km
	 * number.** `95 % T-pace` is *slower* than threshold and `102 % T-pace` is
	 * *faster* — which is how every source that uses the notation writes it
	 * (Bakken's floating threshold runs 96 % / 88 %, Daniels' T-ladder climbs
	 * 94 → 102 %). So `minPct` is the easy edge and `maxPct` the hard edge, the
	 * same direction as `powerPct` and `hrPct`, and resolution divides rather
	 * than multiplies.
	 */
	z.object({
		kind: z.literal('pacePct'),
		minPct: z.number().min(1).max(200),
		maxPct: z.number().min(1).max(200).optional(),
	}),
	/**
	 * Blood lactate — the Norwegian sub-threshold tradition's defining anchor,
	 * and the thing that makes a session lactate-guided rather than a pace
	 * session with a Norwegian name (research: `workout-taxonomy.md` §3).
	 *
	 * **Authored, with pace (or bpm, or watts) as a _derived facet_.** It is a
	 * measured, internal target: lactate sets the pace, pace does not set the
	 * lactate. One `kind` per step means there is one stored value and no second
	 * authored number that can drift from it; the concrete channel range is
	 * resolved from the athlete's own **Zone Recipe** at read time and rendered
	 * with `≈` because it is a translation, not arithmetic.
	 */
	z.object({
		kind: z.literal('lactate'),
		minMmol: z.number().positive().max(30),
		maxMmol: z.number().positive().max(30).optional(),
	}),
	/**
	 * A named race pace — Canova's whole system, and the right authoring and
	 * display vocabulary for a target that must mean the same thing for every
	 * athlete (research: `portable-intensity-anchors.md`).
	 *
	 * Resolves against the athlete's own **Performance Result** for that
	 * distance; with none on record it degrades to the bare authored form
	 * (`105 % marathon pace`, no range facet) — exactly what `powerPct` does
	 * without an FTP. Like `pacePct`, the percentage is of race _speed_: `105 %
	 * MP` is faster than marathon pace. Both bounds are optional, because
	 * `@ 5k pace` with no percentage is the common case.
	 */
	z.object({
		kind: z.literal('racePace'),
		event: z.enum(RACE_ANCHORS),
		minPct: z.number().min(1).max(200).optional(),
		maxPct: z.number().min(1).max(200).optional(),
	}),
])
export type IntensityTarget = z.infer<typeof IntensityTargetSchema>

/** The **Threshold** a `powerPct` target is a percentage of. Absent means
 * `ftp`, the meaning the field silently carried before it had a name. */
export function powerPctRef(target: {
	ref?: 'ftp' | 'map' | 'cp'
}): 'ftp' | 'map' | 'cp' {
	return target.ref ?? 'ftp'
}

export const STEP_KINDS = ['cardio', 'strength', 'rest'] as const
export type StepKind = (typeof STEP_KINDS)[number]

/**
 * The **Load Target** — what is on the bar — as a discriminated union, the
 * strength-channel analogue of {@link IntensityTargetSchema} (ADR 0007).
 *
 * `weightKg XOR pct1RM` covered two of the five things a coach writes.
 * `repMax` is what makes Rønnestad's `10RM → 4RM` authorable at all: a rep-max
 * reference is self-calibrating, which is exactly why the protocol is written
 * that way and why it cannot be restated as a percentage. `% 1RM` travels only
 * above ~85 % — endurance runners manage 39.9 ± 17.6 reps at 70 % where
 * weightlifters manage 17.9 ± 2.8 — so it is one member here, not the axis.
 */
export const LoadTargetSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('absolute'), kg: z.number().positive() }),
	z.object({
		kind: z.literal('pct1RM'),
		minPct: z.number().positive().max(200),
		maxPct: z.number().positive().max(200).optional(),
	}),
	// "@ 8RM" — the heaviest load allowing eight reps, whoever is lifting.
	z.object({ kind: z.literal('repMax'), reps: z.number().int().positive() }),
	z.object({
		kind: z.literal('bodyweight'),
		addedKg: z.number().optional(),
	}),
	z.object({
		kind: z.literal('pctBodyweight'),
		pct: z.number().positive().max(500),
	}),
	z.object({
		kind: z.literal('velocity'),
		minMs: z.number().positive(),
		maxMs: z.number().positive().optional(),
	}),
])
export type LoadTarget = z.infer<typeof LoadTargetSchema>

/**
 * The authored **Effort Cap** — how close to failure the set may go. A separate
 * axis from load, and they routinely co-occur: "4 reps at 85 % 1RM, stopping if
 * RIR falls below 2" states both. `rpe` here is Zourdos' RIR-anchored strength
 * scale (10 = 0 RIR), not the cardio session RPE.
 */
export const EffortCapSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('rir'),
		min: z.number().min(0).max(10),
		max: z.number().min(0).max(10).optional(),
	}),
	z.object({
		kind: z.literal('rpe'),
		min: z.number().min(1).max(10),
		max: z.number().min(1).max(10).optional(),
	}),
])
export type EffortCap = z.infer<typeof EffortCapSchema>

/**
 * The set-termination rule, which is what `ExerciseSet.kind` has always been —
 * now with the two conditional endings the literature uses. A `toRir` or
 * `velocityLoss` set has no authored rep count by construction: it ends when a
 * condition is met, and inventing a rep count for it would be a fabricated
 * number.
 */
export const EXERCISE_SET_KINDS = [
	'reps',
	'timed',
	'amrap',
	'toRir',
	'velocityLoss',
] as const
export type ExerciseSetKind = (typeof EXERCISE_SET_KINDS)[number]

/** The three kinds the session editor can author today. The other two arrive
 * with the Catalogue and are read-only until an editor control exists. */
export const EDITABLE_EXERCISE_SET_KINDS = ['reps', 'timed', 'amrap'] as const

// ExerciseSet schema — kind discriminates which quantity fields are required
const ExerciseSetBaseFields = {
	orderIndex: z.number().int().min(0),
	// The authored load, and the legacy pair it replaces. `load` is the general
	// form; `weightKg`/`pct1RM` stay accepted so every shipped editor payload and
	// every stored row keeps validating unchanged.
	load: LoadTargetSchema.optional(),
	weightKg: z.number().positive().optional(),
	pct1RM: z.number().positive().max(200).optional(),
	effortCap: EffortCapSchema.optional(),
	// Eccentric-pause-concentric, e.g. "3-0-3"; "X" means maximal intent.
	tempo: z
		.string()
		.regex(
			/^[0-9X]+-[0-9X]+-[0-9X]+$/,
			'Tempo reads as eccentric-pause-concentric, e.g. "3-0-3"',
		)
		.optional(),
}

type LoadFields = { load?: LoadTarget; weightKg?: number; pct1RM?: number }

const weightXorPct = (s: LoadFields) =>
	!(s.weightKg != null && s.pct1RM != null)

/** One statement of load per set. `load` is the union that replaces the pair,
 * so a set stating both would have two answers to the same question. */
const loadXorLegacy = (s: LoadFields) =>
	!(s.load != null && (s.weightKg != null || s.pct1RM != null))

function withLoadRules<T extends z.ZodTypeAny>(schema: T) {
	return schema
		.refine(weightXorPct, {
			message: 'A set cannot have both weightKg and pct1RM',
			path: ['weightKg'],
		})
		.refine(loadXorLegacy, {
			message: 'A set states its load once — use `load`, not weightKg/pct1RM',
			path: ['load'],
		})
}

export const RepsSetSchema = withLoadRules(
	z.object({
		...ExerciseSetBaseFields,
		kind: z.literal('reps'),
		reps: z.number().int().positive('Reps must be a positive integer'),
	}),
)

export const TimedSetSchema = withLoadRules(
	z.object({
		...ExerciseSetBaseFields,
		kind: z.literal('timed'),
		durationSec: z
			.number()
			.int()
			.positive('Duration must be a positive integer'),
	}),
)

export const AmrapSetSchema = withLoadRules(
	z.object({
		...ExerciseSetBaseFields,
		kind: z.literal('amrap'),
	}),
)

export const ToRirSetSchema = withLoadRules(
	z.object({
		...ExerciseSetBaseFields,
		kind: z.literal('toRir'),
		terminationRir: z.number().min(0).max(10),
	}),
)

export const VelocityLossSetSchema = withLoadRules(
	z.object({
		...ExerciseSetBaseFields,
		kind: z.literal('velocityLoss'),
		velocityLossPct: z.number().positive().max(100),
	}),
)

export const ExerciseSetSchema = z.union([
	RepsSetSchema,
	TimedSetSchema,
	AmrapSetSchema,
	ToRirSetSchema,
	VelocityLossSetSchema,
])
export type ExerciseSet = z.infer<typeof ExerciseSetSchema>

/**
 * The **Step Parameters** every cardio step may carry beside its quantity.
 * These are not quantities and do not compete with one: a hill session is
 * `6 min @ 8 %`, and a torque interval is `6 min @ 80–90 % FTP · 50–60 rpm`.
 * Grade is signed — a descent is a real prescription — and cadence is a
 * prescription rather than telemetry, which is why it lives on the step and not
 * only on the recording.
 */
const StepParameterFields = {
	gradePct: z.number().min(-100).max(100).optional(),
	cadenceRpmMin: z.number().int().positive().max(300).optional(),
	cadenceRpmMax: z.number().int().positive().max(300).optional(),
}

const cadenceOrdered = (step: {
	cadenceRpmMin?: number
	cadenceRpmMax?: number
}) =>
	step.cadenceRpmMin == null ||
	step.cadenceRpmMax == null ||
	step.cadenceRpmMax >= step.cadenceRpmMin

// Step schemas — discriminated union over kind
export const CardioStepSchema = z
	.object({
		kind: z.literal('cardio'),
		discipline: z.enum(CARDIO_DISCIPLINES, {
			errorMap: () => ({ message: 'Please select a discipline' }),
		}),
		intensity: IntensityTargetSchema.optional(),
		durationSec: z.number().int().positive().optional(),
		distanceM: z.number().int().positive().optional(),
		// The third Step Quantity (ADR 0002).
		verticalM: z.number().int().positive().optional(),
		...StepParameterFields,
		notes: z.string().max(240).optional(),
	})
	.refine((step) => !(step.durationSec != null && step.distanceM != null), {
		message: 'A step cannot have both duration and distance',
		path: ['durationSec'],
	})
	.refine(
		(step) =>
			step.verticalM == null ||
			(step.durationSec == null && step.distanceM == null),
		{
			message: 'A step states one quantity: duration, distance, or vertical',
			path: ['verticalM'],
		},
	)
	.refine(cadenceOrdered, {
		message: 'Cadence range must run low to high',
		path: ['cadenceRpmMax'],
	})

export const StrengthStepSchema = z.object({
	kind: z.literal('strength'),
	// A per-step discipline override (spec §6.1, G6) — absent means the step
	// inherits the workout's discipline.
	discipline: z.enum(CARDIO_DISCIPLINES).optional(),
	exerciseId: z.string().min(1, 'Exercise is required'),
	sets: z.array(ExerciseSetSchema).min(1, 'At least one set is required'),
	restBetweenSetsSec: z.number().int().positive().optional(),
	notes: z.string().max(240).optional(),
})

/** Rest as an act — the default form for hill repeats, where the recovery is
 * "jog back down" and its length is a consequence of the hill. */
export const REST_ACTS = [
	'jogBack',
	'walkDown',
	'rideDown',
	'swimDown',
] as const
export type RestAct = (typeof REST_ACTS)[number]

/**
 * The **Rest Spec** (ADR 0007): the four forms rest takes in the field, of which
 * `durationSec` was one. They fail differently and they price a session's
 * duration differently — under a send-off a set's length is known before it
 * starts, under HR-recovery it is not knowable at all — so a single number could
 * never have carried them.
 *
 * Deliberately absent: an estimated duration for the forms that have none.
 * Attaching a plausible number to "until HR < 120" is precisely the fabrication
 * the Unavailable Metric rule forbids; {@link restSpecDurationSec} returns null
 * instead and callers say so.
 */
export const RestSpecSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('time'),
		durationSec: z.number().int().positive(),
	}),
	// Swimming's universal form. Portable because it is anchored: the rest is
	// `sendOff − swim time`, and the send-off itself is CSS plus an allowance.
	z.object({
		kind: z.literal('sendOff'),
		anchor: z.literal('css'),
		allowanceSecPer100m: z.number().int(),
	}),
	z.object({ kind: z.literal('toHr'), belowBpm: z.number().int().min(40) }),
	z.object({
		kind: z.literal('toHrPct'),
		ref: z.literal('max'),
		belowPct: z.number().min(1).max(100),
	}),
	z.object({
		kind: z.literal('distance'),
		distanceM: z.number().int().positive(),
	}),
	z.object({ kind: z.literal('act'), act: z.enum(REST_ACTS) }),
])
export type RestSpec = z.infer<typeof RestSpecSchema>

/**
 * The rest's length in seconds, or null when the form does not have one. Only
 * a `time` rest states a duration; a send-off states a *cycle* and not a rest,
 * a distance or an act resolves to a duration only through a pace the rest step
 * does not carry, and an HR recovery is not knowable in advance at all.
 */
export function restSpecDurationSec(spec: RestSpec | null | undefined) {
	return spec?.kind === 'time' ? spec.durationSec : null
}

/** Whether a session's arithmetic may count this rest at all — the honest
 * alternative to counting an unknowable rest as zero. */
export function restDurationKnown(spec: RestSpec | null | undefined) {
	return restSpecDurationSec(spec) != null
}

export const RestStepSchema = z
	.object({
		kind: z.literal('rest'),
		// The shorthand the editor has always submitted; equivalent to a `time`
		// Rest Spec and kept so every shipped payload keeps validating.
		durationSec: z.number().int().positive().optional(),
		rest: RestSpecSchema.optional(),
		notes: z.string().max(240).optional(),
	})
	.refine((step) => !(step.durationSec != null && step.rest != null), {
		message: 'A rest states its form once — use `rest`, not durationSec',
		path: ['rest'],
	})

/** The Rest Spec a rest step states, in one shape, whichever way it was
 * authored. A step with neither is unquantified rest and returns null. */
export function restStepSpec(step: {
	durationSec?: number | null
	rest?: RestSpec | null
}): RestSpec | null {
	if (step.rest != null) return step.rest
	if (step.durationSec != null)
		return { kind: 'time', durationSec: step.durationSec }
	return null
}

/**
 * The **Send-Off**: the cycle time a repeat group leaves on, where the rest is
 * the residual after the work. Neither a duration nor a distance, which is why
 * it sits on the block rather than inside a step's quantity.
 *
 * `anchored` exists because an absolute send-off is not portable —
 * `8 × 100 @ 1:40` is a moderate aerobic set at 1:20/100 m and physically
 * impossible at 2:10/100 m, so a shared Catalogue cannot ship one. `absolute`
 * survives because it is what a coach writes on the board and an imported set
 * has to round-trip.
 */
export const SendOffSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('anchored'),
		anchor: z.literal('css'),
		// May be negative: a set that asks the swimmer to beat their own CSS.
		allowanceSecPer100m: z.number().int(),
	}),
	z.object({
		kind: z.literal('absolute'),
		intervalSec: z.number().int().positive(),
	}),
])
export type SendOff = z.infer<typeof SendOffSchema>

export const WorkoutStepSchema = z.union([
	CardioStepSchema,
	StrengthStepSchema,
	RestStepSchema,
])
export type WorkoutStep = z.infer<typeof WorkoutStepSchema>

const BlockSchema = z
	.object({
		name: z.string().max(60).optional(),
		repeatCount: z
			.number()
			.int()
			.min(1, 'Repeat count must be at least 1')
			.default(1),
		// The second repeat level (ADR 0007). `3 × (13 × 30/15)` is
		// `seriesRepeatCount: 3` over `repeatCount: 13` — the best-studied cycling
		// interval protocol, and unexpressible with one level.
		// Optional rather than defaulted: a block that says nothing about series
		// is one series, and every caller that predates two levels keeps its
		// shape rather than growing a field it has no opinion about.
		seriesRepeatCount: z
			.number()
			.int()
			.min(1, 'Series count must be at least 1')
			.optional(),
		betweenSeriesRestSec: z.number().int().positive().optional(),
		sendOff: SendOffSchema.optional(),
		steps: z
			.array(WorkoutStepSchema)
			.min(1, 'A block must have at least one step'),
	})
	.refine(
		(block) =>
			block.betweenSeriesRestSec == null || (block.seriesRepeatCount ?? 1) > 1,
		{
			message: 'A rest between series needs more than one series',
			path: ['betweenSeriesRestSec'],
		},
	)
	// A send-off already says what the rest is — the residual after the work —
	// so a block stating both would price its recovery twice.
	.refine(
		(block) =>
			block.sendOff == null ||
			!block.steps.some((step) => step.kind === 'rest'),
		{
			message: 'A block has either a send-off or rest steps, never both',
			path: ['sendOff'],
		},
	)

/**
 * How many times a block's steps actually happen — the product of the two
 * repeat levels. Every piece of arithmetic over a block (planned load, planned
 * volume, the Workout Shape's bars) reads the repeat through this rather than
 * multiplying by `repeatCount`, or a `3 × (13 × 30/15)` block is priced at
 * thirteen reps instead of thirty-nine.
 */
export function blockRepeatTotal(block: {
	repeatCount: number
	seriesRepeatCount?: number | null
}): number {
	return (
		Math.max(1, block.repeatCount) * Math.max(1, block.seriesRepeatCount ?? 1)
	)
}

// The structural core of a workout — its discipline and the Block → Step →
// IntensityTarget shape — with none of the authoring envelope (title, intent,
// scheduledAt). A Structure Detection (ADR 0032) stores exactly this and
// materializes into a real Workout with no translation: the authoring envelope
// is omitted precisely because it would force a guessed intent and a synthetic
// schedule on a detected structure. `WorkoutAuthoringSchema` is composed from
// it below, so authoring keeps the identical shape it always had.
export const WorkoutStructureSchema = z.object({
	discipline: z.enum(DISCIPLINES, {
		errorMap: () => ({ message: 'Please select a discipline' }),
	}),
	// The structural core is envelope-free, so it carries no authoring-editor
	// copy — just the structural rule that a workout has at least one block. The
	// authoring schema below re-declares `blocks` to restore the editor's
	// zero-step save message (workout-editor spec §11.6).
	blocks: z.array(BlockSchema).min(1, 'A workout must have at least one block'),
})

export type WorkoutStructure = z.infer<typeof WorkoutStructureSchema>

export const WorkoutAuthoringSchema = WorkoutStructureSchema.extend({
	title: z
		.string()
		.min(1, 'Title is required')
		.max(120, 'Title must be 120 characters or fewer'),
	intent: z.enum(WORKOUT_INTENTS, {
		errorMap: () => ({ message: 'Please select a workout intent' }),
	}),
	scheduledAt: z.coerce.date({
		errorMap: () => ({ message: 'A valid date and time is required' }),
	}),
	// In the editor's human words (workout-editor spec §11.6): this is the
	// zero-step save's one summary-line message, kept identical to before the
	// WorkoutStructureSchema extraction.
	blocks: z
		.array(BlockSchema)
		.min(1, 'Add at least one step to save this session'),
})

export type WorkoutAuthoringInput = z.infer<typeof WorkoutAuthoringSchema>
