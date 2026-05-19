import { type UpcomingSession } from './training.server.ts'

type Workout = NonNullable<UpcomingSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

export type WorkoutShapeTone =
	| 'easy'
	| 'moderate'
	| 'hard'
	| 'max'
	| 'rest'
	| 'strength'
	| 'unknown'

export type WorkoutShapeSegment = {
	id: string
	label: string
	intensity: string | null
	tone: WorkoutShapeTone
	durationSec: number
}

export type WorkoutShape = {
	segments: WorkoutShapeSegment[]
}

export function deriveWorkoutShape(workout: Workout | null): WorkoutShape {
	if (!workout) return { segments: [] }
	const segments = workout.blocks
		.slice()
		.sort((a, b) => a.orderIndex - b.orderIndex)
		.flatMap((block) => {
			const sortedSteps = block.steps
				.slice()
				.sort((a, b) => a.orderIndex - b.orderIndex)

			return Array.from({ length: block.repeatCount }, (_, repeatIndex) =>
				sortedSteps.map((step) => ({
					id: block.repeatCount > 1 ? `${step.id}-r${repeatIndex}` : step.id,
					label: getStepLabel(step),
					intensity: step.intensity,
					tone: getSegmentTone(step),
					durationSec: getStepDurationSec(step),
				})),
			).flat()
		})

	return { segments }
}

function getStepLabel(step: WorkoutStep): string {
	if (step.kind === 'strength' && step.exercise) {
		return step.exercise.name
	}
	return step.notes ?? ''
}

function getStepDurationSec(step: WorkoutStep): number {
	if (step.kind === 'strength') {
		// ADR 0002: strength contribution = restBetweenSetsSec * (sets-1) + sum(timed set durations)
		const setsDuration = step.sets.reduce(
			(sum, s) => sum + (s.kind === 'timed' && s.durationSec ? s.durationSec : 0),
			0,
		)
		const restContribution =
			step.restBetweenSetsSec && step.sets.length > 1
				? step.restBetweenSetsSec * (step.sets.length - 1)
				: 0
		return setsDuration + restContribution
	}
	return step.durationSec ?? 0
}

function getSegmentTone(step: WorkoutStep): WorkoutShapeTone {
	if (step.kind === 'rest') return 'rest'
	if (step.kind === 'strength') return 'strength'

	switch (step.intensity) {
		case 'easy':
		case 'zone2':
			return 'easy'
		case 'moderate':
			return 'moderate'
		case 'threshold':
			return 'hard'
		case 'max':
			return 'max'
		default:
			return 'unknown'
	}
}
