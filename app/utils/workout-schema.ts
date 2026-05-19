import { z } from 'zod'

export const DISCIPLINES = ['run', 'swim', 'bike', 'strength'] as const
export type Discipline = (typeof DISCIPLINES)[number]

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Bike',
	swim: 'Swim',
	strength: 'Strength',
}

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

export const INTENT_LABELS: Record<WorkoutIntent, string> = {
	recovery: 'Recovery',
	endurance: 'Endurance',
	tempo: 'Tempo',
	threshold: 'Threshold',
	vo2max: 'VO₂ Max',
	anaerobic: 'Anaerobic',
	neuromuscular: 'Neuromuscular',
	race: 'Race',
	test: 'Test',
	technique: 'Technique',
	'strength-max': 'Strength — Max',
	'strength-hypertrophy': 'Strength — Hypertrophy',
	'strength-power': 'Strength — Power',
	'strength-endurance': 'Strength — Endurance',
	mobility: 'Mobility',
}

export const INTENSITY_TARGETS = ['easy', 'zone2', 'threshold', 'max'] as const
export type IntensityTarget = (typeof INTENSITY_TARGETS)[number]

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
		intensity: z.enum(INTENSITY_TARGETS).optional(),
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

export const WorkoutAuthoringSchema = z.object({
	title: z
		.string()
		.min(1, 'Title is required')
		.max(120, 'Title must be 120 characters or fewer'),
	discipline: z.enum(DISCIPLINES, {
		errorMap: () => ({ message: 'Please select a discipline' }),
	}),
	intent: z.enum(WORKOUT_INTENTS, {
		errorMap: () => ({ message: 'Please select a workout intent' }),
	}),
	scheduledAt: z.coerce.date({
		errorMap: () => ({ message: 'A valid date and time is required' }),
	}),
	blocks: z.array(BlockSchema).min(1, 'A workout must have at least one block'),
})

export type WorkoutAuthoringInput = z.infer<typeof WorkoutAuthoringSchema>
