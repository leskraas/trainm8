import { expect, test } from 'vitest'
import { deriveSessionProfile } from './session-profile.ts'
import { type LedgerSession } from './training.server.ts'

type Workout = NonNullable<LedgerSession['workout']>
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

const resolvedNulls = {
	intensityHrMin: null,
	intensityHrMax: null,
	intensityPowerMin: null,
	intensityPowerMax: null,
	intensityPaceMin: null,
	intensityPaceMax: null,
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
		...resolvedNulls,
		...overrides,
	}
}

function oneBlock(steps: Step[]): Workout['blocks'] {
	return [{ id: 'block-1', name: 'Main', orderIndex: 0, repeatCount: 1, steps }]
}

test('maps the legacy intensity vocabulary to zones', () => {
	const { bars } = deriveSessionProfile(
		workoutWithBlocks(
			oneBlock([
				cardioStep({ id: 'a', intensity: 'easy', orderIndex: 0 }),
				cardioStep({ id: 'b', intensity: 'zone2', orderIndex: 1 }),
				cardioStep({ id: 'c', intensity: 'moderate', orderIndex: 2 }),
				cardioStep({ id: 'd', intensity: 'threshold', orderIndex: 3 }),
				cardioStep({ id: 'e', intensity: 'max', orderIndex: 4 }),
			]),
		),
	)

	expect(bars.map((b) => b.zone)).toEqual([1, 2, 3, 4, 5])
})

test('maps structured zoneLabel targets (Z1–Z7) to zones, clamping above Z5', () => {
	const { bars } = deriveSessionProfile(
		workoutWithBlocks(
			oneBlock([
				cardioStep({
					id: 'z3',
					orderIndex: 0,
					intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z3' }),
				}),
				cardioStep({
					id: 'z7',
					orderIndex: 1,
					intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z7' }),
				}),
			]),
		),
	)

	expect(bars.map((b) => b.zone)).toEqual([3, 5])
})

test('maps RPE and %FTP power targets to zones', () => {
	const { bars } = deriveSessionProfile(
		workoutWithBlocks(
			oneBlock([
				cardioStep({
					id: 'rpe',
					orderIndex: 0,
					intensity: JSON.stringify({ kind: 'rpe', min: 3 }),
				}),
				cardioStep({
					id: 'ftp',
					orderIndex: 1,
					intensity: JSON.stringify({ kind: 'powerPct', minPct: 95 }),
				}),
			]),
		),
	)

	expect(bars.map((b) => b.zone)).toEqual([2, 4])
})

test('leaves unzoneable intensities and non-cardio steps null', () => {
	const { bars } = deriveSessionProfile(
		workoutWithBlocks(
			oneBlock([
				cardioStep({ id: 'none', orderIndex: 0, intensity: null }),
				cardioStep({
					id: 'pace',
					orderIndex: 1,
					intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 300 }),
				}),
			]),
		),
	)

	expect(bars.map((b) => b.zone)).toEqual([null, null])
})

test('expands block repetition and carries step duration as bar weight', () => {
	const { bars } = deriveSessionProfile(
		workoutWithBlocks([
			{
				id: 'intervals',
				name: 'Intervals',
				orderIndex: 0,
				repeatCount: 3,
				steps: [
					cardioStep({
						id: 'on',
						orderIndex: 0,
						intensity: 'threshold',
						durationSec: 180,
					}),
					cardioStep({
						id: 'off',
						orderIndex: 1,
						intensity: 'easy',
						durationSec: 60,
					}),
				],
			},
		]),
	)

	expect(bars).toHaveLength(6)
	expect(bars.map((b) => b.zone)).toEqual([4, 1, 4, 1, 4, 1])
	expect(bars.map((b) => b.durationSec)).toEqual([180, 60, 180, 60, 180, 60])
})

test('returns no bars for a workout-less session', () => {
	expect(deriveSessionProfile(null).bars).toEqual([])
})
