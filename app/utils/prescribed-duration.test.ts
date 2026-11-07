import { expect, test } from 'vitest'
import {
	plannedMinutes,
	prescribedDuration,
	sumBlockDurationMin,
} from './prescribed-duration.ts'

/** A reading with no thresholds: only authored times and paces count. */
const NO_THRESHOLDS = { thresholds: {} }

// --- sumBlockDurationMin ---

test('sumBlockDurationMin returns null when no steps have durationSec', () => {
	const blocks = [
		{
			sendOff: null,
			repeatCount: 1,
			steps: [{ durationSec: null }, { durationSec: null }],
		},
		{ sendOff: null, repeatCount: 2, steps: [{ durationSec: null }] },
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBeNull()
})

test('sumBlockDurationMin returns null for empty blocks array', () => {
	expect(sumBlockDurationMin([], NO_THRESHOLDS)).toBeNull()
})

test('sumBlockDurationMin sums step durations across multiple blocks', () => {
	const blocks = [
		{
			sendOff: null,
			repeatCount: 1,
			steps: [{ durationSec: 600 }, { durationSec: 300 }],
		}, // 900s = 15min
		{ sendOff: null, repeatCount: 1, steps: [{ durationSec: 1200 }] }, // 1200s = 20min
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBe(35)
})

test('sumBlockDurationMin multiplies each block by its repeatCount', () => {
	const blocks = [
		{
			sendOff: null,
			repeatCount: 4,
			steps: [{ durationSec: 180 }, { durationSec: 60 }],
		}, // 4 * 240s = 960s = 16min
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBe(16)
})

test('sumBlockDurationMin rounds to nearest minute', () => {
	// 90s = 1.5min → rounds to 2
	expect(
		sumBlockDurationMin(
			[{ sendOff: null, repeatCount: 1, steps: [{ durationSec: 90 }] }],
			NO_THRESHOLDS,
		),
	).toBe(2)
	// 89s → rounds to 1
	expect(
		sumBlockDurationMin(
			[{ sendOff: null, repeatCount: 1, steps: [{ durationSec: 89 }] }],
			NO_THRESHOLDS,
		),
	).toBe(1)
})

test('sumBlockDurationMin hides a total that leaves an untimed step out', () => {
	const blocks = [
		{
			sendOff: null,
			repeatCount: 1,
			steps: [{ durationSec: 600 }, { durationSec: null }],
		},
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBeNull()
})

// --- prescribedDuration (#615) ---

const zone = (label: string) => JSON.stringify({ kind: 'zoneLabel', label })
const run = (step: {
	kind?: string
	discipline?: string | null
	intensity?: string | null
	durationSec?: number | null
	distanceM?: number | null
}) => ({
	kind: 'cardio',
	discipline: 'run',
	intensity: null,
	durationSec: null,
	distanceM: null,
	...step,
})

/** `15 min Z2 + 6 × (1 km @ 3:40 + 90 s) + 10 min Z1`: 15 + 6 × 5:10 + 10. */
const distanceReps = [
	{
		sendOff: null,
		repeatCount: 1,
		steps: [run({ intensity: zone('Z2'), durationSec: 900 })],
	},
	{
		sendOff: null,
		repeatCount: 6,
		steps: [
			run({
				intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 220 }),
				distanceM: 1000,
			}),
			run({ kind: 'rest', durationSec: 90 }),
		],
	},
	{
		sendOff: null,
		repeatCount: 1,
		steps: [run({ intensity: zone('Z1'), durationSec: 600 })],
	},
]

/** `3 × 13 × 30/15 s` with 6 min between the series: 39 × 45 s + 2 × 6 min. */
const seriesBlock = {
	sendOff: null,
	repeatCount: 13,
	seriesRepeatCount: 3,
	betweenSeriesRestSec: 360,
	steps: [
		run({ intensity: zone('Z5'), durationSec: 30 }),
		run({ kind: 'rest', durationSec: 15 }),
	],
}

test('prescribedDuration times a distance rep through the pace it is run at', () => {
	expect(prescribedDuration(distanceReps, NO_THRESHOLDS)).toEqual({
		seconds: 3360,
		complete: true,
		estimated: true,
	})
	expect(sumBlockDurationMin(distanceReps, NO_THRESHOLDS)).toBe(56)
})

test('prescribedDuration falls back to the threshold pace for a distance rep with no pace of its own', () => {
	const blocks = [
		{
			sendOff: null,
			repeatCount: 5,
			steps: [run({ intensity: zone('Z4'), distanceM: 1000 })],
		},
	]
	const thresholds = {
		run: {
			lthr: null,
			maxHr: null,
			ftp: null,
			runPowerThresholdW: null,
			thresholdPaceSecPerKm: 240,
			cssSecPer100m: null,
			zoneSystem: null,
			zoneOverrides: null,
		},
	}
	expect(prescribedDuration(blocks, { thresholds })).toEqual({
		seconds: 1200,
		complete: true,
		estimated: true,
	})
})

test('prescribedDuration says when a distance step was timed through a pace', () => {
	expect(prescribedDuration(distanceReps, NO_THRESHOLDS)?.estimated).toBe(true)
	expect(prescribedDuration([seriesBlock], NO_THRESHOLDS)?.estimated).toBe(
		false,
	)
	expect(plannedMinutes(distanceReps, NO_THRESHOLDS)).toEqual({
		minutes: 56,
		estimated: true,
	})
})

test('prescribedDuration adds the rests between series', () => {
	expect(prescribedDuration([seriesBlock], NO_THRESHOLDS)).toEqual({
		seconds: 39 * 45 + 2 * 360,
		complete: true,
		estimated: false,
	})
	expect(sumBlockDurationMin([seriesBlock], NO_THRESHOLDS)).toBe(41)
})

test('prescribedDuration says when a step it cannot time leaves the total short', () => {
	const blocks = [
		{ sendOff: null, repeatCount: 1, steps: [run({ durationSec: 600 })] },
		{ sendOff: null, repeatCount: 5, steps: [run({ distanceM: 1000 })] },
	]
	expect(prescribedDuration(blocks, NO_THRESHOLDS)).toEqual({
		seconds: 600,
		complete: false,
		estimated: false,
	})
	expect(
		prescribedDuration(
			[{ sendOff: null, repeatCount: 1, steps: [run({})] }],
			NO_THRESHOLDS,
		),
	).toBeNull()
})

const runProfile = {
	lthr: null,
	maxHr: null,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

test('sumBlockDurationMin hides a session whose distance step has no pace to time it by', () => {
	// `15 min · 8 km terskel · 10 min` with no threshold pace is not 25 min.
	const blocks = [
		{ sendOff: null, repeatCount: 1, steps: [run({ durationSec: 900 })] },
		{
			sendOff: null,
			repeatCount: 1,
			steps: [run({ intensity: zone('Z4'), distanceM: 8000 })],
		},
		{ sendOff: null, repeatCount: 1, steps: [run({ durationSec: 600 })] },
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBeNull()
	expect(sumBlockDurationMin(blocks, { thresholds: { run: runProfile } })).toBe(
		57,
	)
})

test('prescribedDuration times a step with no Discipline of its own as the Workout’s', () => {
	const blocks = [
		{
			sendOff: null,
			repeatCount: 5,
			steps: [
				run({ discipline: null, intensity: zone('Z4'), distanceM: 1000 }),
			],
		},
	]
	const thresholds = { run: runProfile }
	expect(prescribedDuration(blocks, { thresholds })).toBeNull()
	expect(prescribedDuration(blocks, { thresholds, discipline: 'run' })).toEqual(
		{ seconds: 1200, complete: true, estimated: true },
	)
})

// --- Send-Off (ADR 0112 §4) ---

const swim = (distanceM: number, label: string) => ({
	kind: 'cardio',
	discipline: 'swim',
	intensity: zone(label),
	durationSec: null,
	distanceM,
})
const swimProfile = (cssSecPer100m: number | null) => ({
	lthr: null,
	maxHr: null,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m,
	zoneSystem: null,
	zoneOverrides: null,
})
const onCss = (allowanceSecPer100m: number) =>
	JSON.stringify({ kind: 'anchored', anchor: 'css', allowanceSecPer100m })

/** `swim-C1`, CSS hundreds: `600 · 10 × 100 Z4 on CSS + 10 s · 400`. */
const cssHundreds = [
	{ sendOff: null, repeatCount: 1, steps: [swim(600, 'Z2')] },
	{ sendOff: onCss(10), repeatCount: 10, steps: [swim(100, 'Z4')] },
	{ sendOff: null, repeatCount: 1, steps: [swim(400, 'Z1')] },
]

test('prescribedDuration times a send-off rep at its cycle, not its swim alone (swim-C1)', () => {
	const reading = { thresholds: { swim: swimProfile(100) }, discipline: 'swim' }
	const [warmUp, main, coolDown] = cssHundreds
	const swimOnly = prescribedDuration(
		[{ ...main!, sendOff: null }],
		reading,
	)!.seconds
	// Each hundred leaves on CSS + 10 s = 110 s, so the set takes 10 × 110 s
	// whatever the swim itself takes, as long as it fits the cycle.
	expect(swimOnly).toBeLessThan(1100)
	expect(prescribedDuration([main!], reading)).toEqual({
		seconds: 1100,
		complete: true,
		estimated: true,
	})
	const around =
		prescribedDuration([warmUp!], reading)!.seconds +
		prescribedDuration([coolDown!], reading)!.seconds
	expect(prescribedDuration(cssHundreds, reading)).toEqual({
		seconds: around + 1100,
		complete: true,
		estimated: true,
	})
})

test('prescribedDuration keeps the swim when it outlasts the cycle', () => {
	// A send-off faster than the swim: the rep takes as long as the swim does.
	const block = {
		sendOff: onCss(-60),
		repeatCount: 4,
		steps: [swim(100, 'Z4')],
	}
	const reading = { thresholds: { swim: swimProfile(100) }, discipline: 'swim' }
	const swimOnly = prescribedDuration([{ ...block, sendOff: null }], reading)
	expect(prescribedDuration([block], reading)).toEqual(swimOnly)
})

test('prescribedDuration times an absolute send-off at its interval', () => {
	const block = {
		sendOff: JSON.stringify({ kind: 'absolute', intervalSec: 90 }),
		repeatCount: 8,
		steps: [{ ...swim(50, 'Z5'), durationSec: 40 }],
	}
	expect(prescribedDuration([block], NO_THRESHOLDS)).toEqual({
		seconds: 8 * 90,
		complete: true,
		estimated: false,
	})
})

test('prescribedDuration leaves a send-off set incomplete when there is no CSS to anchor it to', () => {
	const block = {
		sendOff: onCss(10),
		repeatCount: 10,
		steps: [{ ...swim(100, 'Z4'), durationSec: 80 }],
	}
	// The swims are timed, but the rest the cycle leaves cannot be read.
	expect(prescribedDuration([block], NO_THRESHOLDS)).toEqual({
		seconds: 800,
		complete: false,
		estimated: false,
	})
	expect(
		prescribedDuration([block], { thresholds: { swim: swimProfile(null) } }),
	).toEqual({ seconds: 800, complete: false, estimated: false })
})
