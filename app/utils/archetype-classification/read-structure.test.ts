import { expect, test } from 'vitest'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import {
	readMainSet,
	type ReadableBlock,
	type ReadableWorkout,
} from './read-structure.ts'

// ── Reading a stored Workout into rep geometry (ADR 0055) ────────────────────
// The adapter's whole job is to say truthfully what the stored shape does and
// does not contain — including that the individual reps are already gone.

const RUNNER: DisciplineProfileForResolver = {
	lthr: 170,
	maxHr: 190,
	ftp: null,
	runPowerThresholdW: 280,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

const NO_THRESHOLDS: DisciplineProfileForResolver = {
	...RUNNER,
	lthr: null,
	maxHr: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: null,
}

function step(
	overrides: Partial<ReadableWorkout['blocks'][number]['steps'][number]> = {},
) {
	return {
		kind: 'cardio',
		orderIndex: 0,
		durationSec: 480,
		intensity: JSON.stringify({ kind: 'power', minW: 280 }),
		...overrides,
	}
}

function workout(blocks: ReadableBlock[], discipline = 'run'): ReadableWorkout {
	return { discipline, blocks }
}

/** A warm-up / main set / cool-down shape, the one detection actually emits. */
function detectedShape(repeatCount: number): ReadableBlock[] {
	return [
		{
			orderIndex: 0,
			repeatCount: 1,
			steps: [
				step({
					durationSec: 900,
					intensity: JSON.stringify({ kind: 'power', minW: 190 }),
				}),
			],
		},
		{
			orderIndex: 1,
			repeatCount,
			steps: [
				step({ orderIndex: 0, durationSec: 480 }),
				step({
					orderIndex: 1,
					durationSec: 120,
					intensity: JSON.stringify({ kind: 'power', minW: 170 }),
				}),
			],
		},
		{
			orderIndex: 2,
			repeatCount: 1,
			steps: [
				step({
					durationSec: 600,
					intensity: JSON.stringify({ kind: 'power', minW: 180 }),
				}),
			],
		},
	]
}

test('the main set is the repeated block, not the warm-up in front of it', () => {
	const reading = readMainSet(workout(detectedShape(4)), RUNNER, 'high')

	expect(reading?.reps).toHaveLength(4)
	expect(reading?.reps.every((rep) => rep.durationSec === 480)).toBe(true)
})

test('the harder step in the block is the work and the other is the recovery', () => {
	const reading = readMainSet(workout(detectedShape(4)), RUNNER, 'high')

	expect(reading?.reps[0]?.zone).toBe(4)
	expect(reading?.recoverySec).toBe(4 * 120)
})

test('a Workout with nothing repeated has no main set to read', () => {
	// Null is "nothing structured", which sends the reader down its
	// duration-and-intensity path. It is never an empty set.
	const reading = readMainSet(
		workout([{ orderIndex: 0, repeatCount: 1, steps: [step()] }]),
		RUNNER,
		'high',
	)

	expect(reading).toBeNull()
})

test('rep durations come back as null variability, never as regular', () => {
	// A persisted detection stores one averaged step with `{ repeatCount: k }`, so
	// the individual rep lengths are gone. Reporting 0 would read an average as
	// regularity and let a ladder pass for a flat set.
	const reading = readMainSet(workout(detectedShape(4)), RUNNER, 'high')

	expect(reading?.durationCV).toBeNull()
})

test('a measured watt target resolves against the run power threshold, not FTP', () => {
	// ADR 0038: a run's power anchor is its critical power.
	const reading = readMainSet(
		workout([
			{
				orderIndex: 0,
				repeatCount: 4,
				steps: [
					step({ intensity: JSON.stringify({ kind: 'power', minW: 196 }) }),
				],
			},
		]),
		RUNNER,
		'high',
	)

	// 196 / 280 = 70 % of threshold — zone 2 on the canonical scale.
	expect(reading?.reps[0]?.zone).toBe(2)
})

test('a measured pace target inverts, because the percentage is of threshold speed', () => {
	const reading = readMainSet(
		workout([
			{
				orderIndex: 0,
				repeatCount: 4,
				steps: [
					step({
						intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 228 }),
					}),
				],
			},
		]),
		RUNNER,
		'high',
	)

	// 240 / 228 ≈ 105 % of threshold speed — hard, and not the 95 % a naive
	// ratio would have produced.
	expect(reading?.reps[0]?.zone).toBe(4)
	expect(reading?.channel).toBe('pace')
})

test('with no threshold on the channel the zone is null, never a population default', () => {
	// ADR 0035's rule, and what makes the classifier refuse downstream rather
	// than call a hard set an easy run.
	const reading = readMainSet(workout(detectedShape(4)), NO_THRESHOLDS, 'high')

	expect(reading?.reps[0]?.zone).toBeNull()
})

test('a heart-rate target reports the heartRate channel, so the confidence can cap', () => {
	const reading = readMainSet(
		workout([
			{
				orderIndex: 0,
				repeatCount: 4,
				steps: [
					step({ intensity: JSON.stringify({ kind: 'hrBpm', min: 165 }) }),
				],
			},
		]),
		RUNNER,
		'high',
	)

	expect(reading?.channel).toBe('heartRate')
	// 165 / 170 ≈ 97 % LTHR.
	expect(reading?.reps[0]?.zone).toBe(4)
})

test('a zone-label target still resolves, and needs no threshold to do it', () => {
	const reading = readMainSet(
		workout([
			{
				orderIndex: 0,
				repeatCount: 5,
				steps: [step({ intensity: 'threshold' })],
			},
		]),
		NO_THRESHOLDS,
		'high',
	)

	expect(reading?.reps[0]?.zone).toBe(4)
})

test('a two-level repeat counts every rep it actually executes', () => {
	// 3 × (13 × 30/15) is 39 reps, not 13.
	const reading = readMainSet(
		workout([
			{
				orderIndex: 0,
				repeatCount: 13,
				seriesRepeatCount: 3,
				steps: [step({ durationSec: 30 })],
			},
		]),
		RUNNER,
		'high',
	)

	expect(reading?.reps).toHaveLength(39)
})

test('the detection grade travels through untouched', () => {
	const reading = readMainSet(workout(detectedShape(4)), RUNNER, 'medium')

	expect(reading?.grade).toBe('medium')
})
