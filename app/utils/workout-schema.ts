import { z } from 'zod'

export const DISCIPLINES = ['run', 'swim', 'bike', 'strength'] as const
export type Discipline = (typeof DISCIPLINES)[number]

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

export const STEP_DISCIPLINES = [
	'run',
	'swim',
	'bike',
	'strength',
	'rest',
] as const
export type StepDiscipline = (typeof STEP_DISCIPLINES)[number]

export const INTENSITY_TARGETS = ['easy', 'zone2', 'threshold', 'max'] as const
export type IntensityTarget = (typeof INTENSITY_TARGETS)[number]

const StepSchema = z
	.object({
		discipline: z.enum(STEP_DISCIPLINES).optional(),
		intensity: z.enum(INTENSITY_TARGETS).optional(),
		durationSec: z.number().int().positive().optional(),
		distanceM: z.number().int().positive().optional(),
		description: z.string().max(240).optional(),
	})
	.refine((step) => !(step.durationSec != null && step.distanceM != null), {
		message: 'A step cannot have both duration and distance',
		path: ['durationSec'],
	})

const BlockSchema = z.object({
	name: z.string().max(60).optional(),
	repeatCount: z
		.number()
		.int()
		.min(1, 'Repeat count must be at least 1')
		.default(1),
	steps: z.array(StepSchema).min(1, 'A block must have at least one step'),
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
