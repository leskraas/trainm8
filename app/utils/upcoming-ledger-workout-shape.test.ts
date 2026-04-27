import { expect, test } from 'vitest'
import { type UpcomingSession } from './training.server.ts'
import { deriveWorkoutShape } from './upcoming-ledger-workout-shape.ts'

type Workout = UpcomingSession['workout']

function workoutWithBlocks(blocks: Workout['blocks']): Workout {
	return {
		id: 'workout-1',
		title: 'Threshold Intervals',
		description: null,
		activityType: 'run',
		blocks,
	}
}

test('deriveWorkoutShape preserves block and step order', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-late',
				name: 'Cool-down',
				orderIndex: 2,
				steps: [
					{
						id: 'step-late',
						description: 'Easy finish',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 0,
					},
				],
			},
			{
				id: 'block-early',
				name: 'Main',
				orderIndex: 1,
				steps: [
					{
						id: 'step-second',
						description: 'Second rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 1,
					},
					{
						id: 'step-first',
						description: 'First rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 0,
					},
				],
			},
		]),
	)

	expect(shape.segments.map((segment) => segment.id)).toEqual([
		'step-first',
		'step-second',
		'step-late',
	])
})

test('deriveWorkoutShape maps intensity and rest steps to visual tones', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-1',
				name: 'Main',
				orderIndex: 0,
				steps: [
					{
						id: 'easy',
						description: 'Easy warm-up',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 0,
					},
					{
						id: 'threshold',
						description: 'Tempo rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 1,
					},
					{
						id: 'rest',
						description: 'Walk recovery',
						activity: 'rest',
						intensity: 'easy',
						orderIndex: 2,
					},
					{
						id: 'unknown',
						description: 'Coach choice',
						activity: 'run',
						intensity: null,
						orderIndex: 3,
					},
				],
			},
		]),
	)

	expect(shape.segments.map((segment) => segment.tone)).toEqual([
		'easy',
		'hard',
		'rest',
		'unknown',
	])
})

test('deriveWorkoutShape returns an empty shape for sparse workout structure', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-empty',
				name: null,
				orderIndex: 0,
				steps: [],
			},
		]),
	)

	expect(shape.segments).toEqual([])
})
