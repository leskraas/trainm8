import { type UpcomingSession } from './training.server.ts'

type Workout = UpcomingSession['workout']
type WorkoutStep = Workout['blocks'][number]['steps'][number]

export type WorkoutShapeTone =
	| 'easy'
	| 'moderate'
	| 'hard'
	| 'max'
	| 'rest'
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

export function deriveWorkoutShape(workout: Workout): WorkoutShape {
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
					label: step.description,
					intensity: step.intensity,
					tone: getSegmentTone(step),
					durationSec: step.durationSec ?? 0,
				})),
			).flat()
		})

	return { segments }
}

function getSegmentTone(step: WorkoutStep): WorkoutShapeTone {
	if (step.discipline === 'rest') return 'rest'

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
