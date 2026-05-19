import { expect, test } from 'vitest'
import { type UpcomingSession } from './training.server.ts'
import { deriveWorkoutShape } from './upcoming-ledger-workout-shape.ts'

type Workout = UpcomingSession['workout']
type Step = Workout['blocks'][number]['steps'][number]

function workoutWithBlocks(blocks: Workout['blocks']): Workout {
	return {
		id: 'workout-1',
		title: 'Threshold Intervals',
		description: null,
		discipline: 'run',
		intent: 'threshold',
		blocks,
	}
}

function cardioStep(overrides: Partial<Step> & { id: string }): Step {
	return {
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity: null,
		orderIndex: 0,
		durationSec: null,
		distanceM: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

function restStep(overrides: Partial<Step> & { id: string }): Step {
	return {
		kind: 'rest',
		notes: null,
		discipline: null,
		intensity: null,
		orderIndex: 0,
		durationSec: null,
		distanceM: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

function strengthStep(
	overrides: Partial<Step> & {
		id: string
		exerciseId: string
		sets: Step['sets']
	},
): Step {
	return {
		kind: 'strength',
		notes: null,
		discipline: null,
		intensity: null,
		orderIndex: 0,
		durationSec: null,
		distanceM: null,
		restBetweenSetsSec: null,
		exercise: null,
		...overrides,
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
					cardioStep({
						id: 'step-late',
						notes: 'Easy finish',
						intensity: 'easy',
						orderIndex: 0,
					}),
				],
			},
			{
				id: 'block-early',
				name: 'Main',
				orderIndex: 1,
				repeatCount: 1,
				steps: [
					cardioStep({
						id: 'step-second',
						notes: 'Second rep',
						intensity: 'threshold',
						orderIndex: 1,
					}),
					cardioStep({
						id: 'step-first',
						notes: 'First rep',
						intensity: 'threshold',
						orderIndex: 0,
					}),
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
					cardioStep({ id: 'easy', notes: 'Easy warm-up', intensity: 'easy', orderIndex: 0 }),
					cardioStep({ id: 'threshold', notes: 'Tempo rep', intensity: 'threshold', orderIndex: 1 }),
					restStep({ id: 'rest', notes: 'Walk recovery', orderIndex: 2 }),
					cardioStep({ id: 'unknown', notes: 'Coach choice', intensity: null, orderIndex: 3 }),
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
					cardioStep({ id: 'step-warmup', notes: 'Warm up', intensity: 'easy', orderIndex: 0, durationSec: 600 }),
					cardioStep({ id: 'step-tempo', notes: 'Tempo', intensity: 'threshold', orderIndex: 1, durationSec: 1200 }),
					cardioStep({ id: 'step-cooldown', notes: 'Cool down', intensity: 'easy', orderIndex: 2, durationSec: 300 }),
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
					cardioStep({ id: 'step-timed', notes: 'Timed rep', intensity: 'threshold', orderIndex: 0, durationSec: 180 }),
					cardioStep({ id: 'step-open', notes: 'Open warm-up', intensity: 'easy', orderIndex: 1 }),
					cardioStep({ id: 'step-distance-only', notes: 'Distance rep', intensity: 'threshold', orderIndex: 2, distanceM: 400 }),
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
					cardioStep({ id: 'step-hard', notes: 'Hard', intensity: 'threshold', orderIndex: 0, durationSec: 180 }),
					cardioStep({ id: 'step-easy', notes: 'Easy', intensity: 'easy', orderIndex: 1, durationSec: 60 }),
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
					cardioStep({ id: 'step-wu', notes: 'Warm up', intensity: 'easy', orderIndex: 0, durationSec: 600 }),
				],
			},
			{
				id: 'block-main',
				name: 'Main set',
				orderIndex: 1,
				repeatCount: 2,
				steps: [
					cardioStep({ id: 'step-on', notes: 'On', intensity: 'threshold', orderIndex: 0, durationSec: 180 }),
					restStep({ id: 'step-off', notes: 'Off', orderIndex: 1, durationSec: 60 }),
				],
			},
			{
				id: 'block-cooldown',
				name: 'Cool-down',
				orderIndex: 2,
				repeatCount: 1,
				steps: [
					cardioStep({ id: 'step-cd', notes: 'Cool down', intensity: 'easy', orderIndex: 0, durationSec: 300 }),
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

test('strength step contributes timed set durations + rest between sets to shape width', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-1',
				name: 'Main',
				orderIndex: 0,
				repeatCount: 1,
				steps: [
					strengthStep({
						id: 'step-squat',
						exerciseId: 'ex_bb_back_squat',
						exercise: { id: 'ex_bb_back_squat', name: 'Back Squat', primaryMuscle: 'quads', equipment: 'barbell' },
						orderIndex: 0,
						restBetweenSetsSec: 90,
						sets: [
							{ id: 's1', kind: 'reps', orderIndex: 0, reps: 5, weightKg: 100, pct1RM: null, durationSec: null },
							{ id: 's2', kind: 'reps', orderIndex: 1, reps: 5, weightKg: 100, pct1RM: null, durationSec: null },
							{ id: 's3', kind: 'reps', orderIndex: 2, reps: 5, weightKg: 100, pct1RM: null, durationSec: null },
						],
					}),
				],
			},
		]),
	)

	// 3 reps sets with no timed duration → 0 + restBetweenSets * (3-1) = 90*2 = 180
	expect(shape.segments[0]!.durationSec).toBe(180)
	expect(shape.segments[0]!.tone).toBe('strength')
	expect(shape.segments[0]!.label).toBe('Back Squat')
})

test('rest step contributes its durationSec to shape width', () => {
	const shape = deriveWorkoutShape(
		workoutWithBlocks([
			{
				id: 'block-1',
				name: null,
				orderIndex: 0,
				repeatCount: 1,
				steps: [
					restStep({ id: 'step-rest', notes: 'Rest', orderIndex: 0, durationSec: 90 }),
				],
			},
		]),
	)

	expect(shape.segments[0]!.durationSec).toBe(90)
	expect(shape.segments[0]!.tone).toBe('rest')
})
