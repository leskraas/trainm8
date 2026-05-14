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
				repeatCount: 1,
				steps: [
					{
						id: 'step-late',
						description: 'Easy finish',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 0,
						durationSec: null,
						distanceM: null,
					},
				],
			},
			{
				id: 'block-early',
				name: 'Main',
				orderIndex: 1,
				repeatCount: 1,
				steps: [
					{
						id: 'step-second',
						description: 'Second rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 1,
						durationSec: null,
						distanceM: null,
					},
					{
						id: 'step-first',
						description: 'First rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 0,
						durationSec: null,
						distanceM: null,
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
				repeatCount: 1,
				steps: [
					{
						id: 'easy',
						description: 'Easy warm-up',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 0,
						durationSec: null,
						distanceM: null,
					},
					{
						id: 'threshold',
						description: 'Tempo rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 1,
						durationSec: null,
						distanceM: null,
					},
					{
						id: 'rest',
						description: 'Walk recovery',
						activity: 'rest',
						intensity: 'easy',
						orderIndex: 2,
						durationSec: null,
						distanceM: null,
					},
					{
						id: 'unknown',
						description: 'Coach choice',
						activity: 'run',
						intensity: null,
						orderIndex: 3,
						durationSec: null,
						distanceM: null,
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
				repeatCount: 1,
				steps: [],
			},
		]),
	)

	expect(shape.segments).toEqual([])
})
