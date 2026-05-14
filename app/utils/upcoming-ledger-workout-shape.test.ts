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

test('deriveWorkoutShape assigns durationSec as segment width weight', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-1',
				name: 'Main',
				orderIndex: 0,
				repeatCount: 1,
				steps: [
					{
						id: 'step-warmup',
						description: 'Warm up',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 0,
						durationSec: 600,
						distanceM: null,
					},
					{
						id: 'step-tempo',
						description: 'Tempo',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 1,
						durationSec: 1200,
						distanceM: null,
					},
					{
						id: 'step-cooldown',
						description: 'Cool down',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 2,
						durationSec: 300,
						distanceM: null,
					},
				],
			},
		]),
	)

	expect(shape.segments.map((s) => s.durationSec)).toEqual([600, 1200, 300])
})

test('deriveWorkoutShape assigns zero durationSec for unquantified steps', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-1',
				name: 'Main',
				orderIndex: 0,
				repeatCount: 1,
				steps: [
					{
						id: 'step-timed',
						description: 'Timed rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 0,
						durationSec: 180,
						distanceM: null,
					},
					{
						id: 'step-open',
						description: 'Open warm-up',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 1,
						durationSec: null,
						distanceM: null,
					},
					{
						id: 'step-distance-only',
						description: 'Distance rep',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 2,
						durationSec: null,
						distanceM: 400,
					},
				],
			},
		]),
	)

	expect(shape.segments.map((s) => s.durationSec)).toEqual([180, 0, 0])
})

test('deriveWorkoutShape unrolls block repetition', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-intervals',
				name: 'Intervals',
				orderIndex: 0,
				repeatCount: 3,
				steps: [
					{
						id: 'step-hard',
						description: 'Hard',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 0,
						durationSec: 180,
						distanceM: null,
					},
					{
						id: 'step-easy',
						description: 'Easy',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 1,
						durationSec: 60,
						distanceM: null,
					},
				],
			},
		]),
	)

	expect(shape.segments).toHaveLength(6)
	expect(shape.segments.map((s) => s.tone)).toEqual([
		'hard',
		'easy',
		'hard',
		'easy',
		'hard',
		'easy',
	])
	expect(shape.segments.map((s) => s.durationSec)).toEqual([
		180, 60, 180, 60, 180, 60,
	])
})

test('deriveWorkoutShape preserves order across blocks with unrolling', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-warmup',
				name: 'Warm-up',
				orderIndex: 0,
				repeatCount: 1,
				steps: [
					{
						id: 'step-wu',
						description: 'Warm up',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 0,
						durationSec: 600,
						distanceM: null,
					},
				],
			},
			{
				id: 'block-main',
				name: 'Main set',
				orderIndex: 1,
				repeatCount: 2,
				steps: [
					{
						id: 'step-on',
						description: 'On',
						activity: 'run',
						intensity: 'threshold',
						orderIndex: 0,
						durationSec: 180,
						distanceM: null,
					},
					{
						id: 'step-off',
						description: 'Off',
						activity: 'rest',
						intensity: null,
						orderIndex: 1,
						durationSec: 60,
						distanceM: null,
					},
				],
			},
			{
				id: 'block-cooldown',
				name: 'Cool-down',
				orderIndex: 2,
				repeatCount: 1,
				steps: [
					{
						id: 'step-cd',
						description: 'Cool down',
						activity: 'run',
						intensity: 'easy',
						orderIndex: 0,
						durationSec: 300,
						distanceM: null,
					},
				],
			},
		]),
	)

	expect(shape.segments.map((s) => s.label)).toEqual([
		'Warm up',
		'On',
		'Off',
		'On',
		'Off',
		'Cool down',
	])
	expect(shape.segments.map((s) => s.durationSec)).toEqual([
		600, 180, 60, 180, 60, 300,
	])
})
