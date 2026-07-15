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
		minPct: z.number().min(1).max(300),
		maxPct: z.number().min(1).max(300).optional(),
	}),
	z.object({
		kind: z.literal('pace'),
		minSecPerKm: z.number().int().positive(),
		maxSecPerKm: z.number().int().positive().optional(),
	}),
])
export type IntensityTarget = z.infer<typeof IntensityTargetSchema>

export const STEP_KINDS = ['cardio', 'strength', 'rest'] as const
export type StepKind = (typeof STEP_KINDS)[number]

export const EXERCISE_SET_KINDS = ['reps', 'timed', 'amrap'] as const
export type ExerciseSetKind = (typeof EXERCISE_SET_KINDS)[number]

// ExerciseSet schema — kind discriminates which quantity fields are required
const ExerciseSetBaseFields = {
	orderIndex: z.number().int().min(0),
	weightKg: z.number().positive().optional(),
	pct1RM: z.number().positive().max(200).optional(),
}

const weightXorPct = (s: { weightKg?: number; pct1RM?: number }) =>
	!(s.weightKg != null && s.pct1RM != null)

export const RepsSetSchema = z
	.object({
		...ExerciseSetBaseFields,
		kind: z.literal('reps'),
		reps: z.number().int().positive('Reps must be a positive integer'),
	})
	.refine(weightXorPct, {
		message: 'A set cannot have both weightKg and pct1RM',
		path: ['weightKg'],
	})

export const TimedSetSchema = z
	.object({
		...ExerciseSetBaseFields,
		kind: z.literal('timed'),
		durationSec: z
			.number()
			.int()
			.positive('Duration must be a positive integer'),
	})
	.refine(weightXorPct, {
		message: 'A set cannot have both weightKg and pct1RM',
		path: ['weightKg'],
	})

export const AmrapSetSchema = z
	.object({
		...ExerciseSetBaseFields,
		kind: z.literal('amrap'),
	})
	.refine(weightXorPct, {
		message: 'A set cannot have both weightKg and pct1RM',
		path: ['weightKg'],
	})

export const ExerciseSetSchema = z.union([
	RepsSetSchema,
	TimedSetSchema,
	AmrapSetSchema,
])
export type ExerciseSet = z.infer<typeof ExerciseSetSchema>

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
		notes: z.string().max(240).optional(),
	})
	.refine((step) => !(step.durationSec != null && step.distanceM != null), {
		message: 'A step cannot have both duration and distance',
		path: ['durationSec'],
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

export const RestStepSchema = z.object({
	kind: z.literal('rest'),
	durationSec: z.number().int().positive().optional(),
	notes: z.string().max(240).optional(),
})

export const WorkoutStepSchema = z.union([
	CardioStepSchema,
	StrengthStepSchema,
	RestStepSchema,
])
export type WorkoutStep = z.infer<typeof WorkoutStepSchema>

const BlockSchema = z.object({
	name: z.string().max(60).optional(),
	repeatCount: z
		.number()
		.int()
		.min(1, 'Repeat count must be at least 1')
		.default(1),
	steps: z
		.array(WorkoutStepSchema)
		.min(1, 'A block must have at least one step'),
})

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
