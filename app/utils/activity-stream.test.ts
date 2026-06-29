import { expect, test } from 'vitest'
import {
	downsampleStream,
	parseStoredStream,
	serializeStream,
	STREAM_MAX_SAMPLES,
	STREAM_RESOLUTION_FLOOR_SEC,
} from './activity-stream.ts'

/** Build a raw 1 Hz time axis of `n` seconds: [0, 1, …, n-1]. */
function seconds(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i)
}

test('downsamples to an evenly-spaced, index-aligned grid starting at zero', () => {
	const time = seconds(21) // 0..20s at 1 Hz
	const power = time.map((t) => 200 + t)
	const heartrate = time.map((t) => 140 + t)

	const out = downsampleStream({ time, power, heartrate })

	expect(out).not.toBeNull()
	// Floor resolution kicks in for a short stream.
	expect(out!.resolutionSec).toBe(STREAM_RESOLUTION_FLOOR_SEC)
	// Even spacing from 0: [0, 5, 10, 15, 20].
	expect(out!.timeSec).toEqual([0, 5, 10, 15, 20])
	// Every channel is index-aligned with the time axis.
	expect(out!.sampleCount).toBe(out!.timeSec.length)
	expect(out!.power).toHaveLength(out!.timeSec.length)
	expect(out!.heartrate).toHaveLength(out!.timeSec.length)
})

test('averages the raw samples that fall in each bucket', () => {
	// 10s at 1 Hz, power climbing 200..209. With a 5s grid the first bucket
	// [0,5) averages 200..204 = 202, the second [5,10) averages 205..209 = 207.
	const time = seconds(10)
	const power = time.map((t) => 200 + t)

	const out = downsampleStream({ time, power })

	expect(out!.timeSec).toEqual([0, 5])
	expect(out!.power).toEqual([202, 207])
})

test('preserves provider null gaps as null (a paused stretch breaks the line)', () => {
	// 40s at 1 Hz. The provider reports no power for [15s, 25s) — a pause.
	const time = seconds(41)
	const power = time.map((t) => (t >= 15 && t < 25 ? null : 220))

	const out = downsampleStream({ time, power })

	// Grid: [0,5,10,15,20,25,30,35,40]. Buckets covering [15,20) and [20,25)
	// have only nulls → null; the surrounding buckets keep a value.
	expect(out!.timeSec).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40])
	expect(out!.power).toEqual([220, 220, 220, null, null, 220, 220, 220, 220])
})

test('preserves a gap where the time axis itself skips ahead', () => {
	// Samples 0..10s, then a jump to 30..40s — nothing recorded in between.
	const time = [...seconds(11), ...Array.from({ length: 11 }, (_, i) => 30 + i)]
	const power = time.map(() => 180)

	const out = downsampleStream({ time, power })

	// The empty 10..30 stretch yields null buckets, not an interpolated line.
	expect(out!.timeSec[0]).toBe(0)
	const gapIndex = out!.timeSec.findIndex((t) => t === 20)
	expect(gapIndex).toBeGreaterThan(-1)
	expect(out!.power![gapIndex]).toBeNull()
	// The ends still carry the recorded value.
	expect(out!.power![0]).toBe(180)
	expect(out!.power![out!.power!.length - 1]).toBe(180)
})

test('bounds the sample count and never goes finer than the resolution floor', () => {
	// 3 hours at 1 Hz — far more than the cap.
	const time = seconds(3 * 60 * 60)
	const power = time.map(() => 250)

	const out = downsampleStream({ time, power })

	expect(out!.sampleCount).toBeLessThanOrEqual(STREAM_MAX_SAMPLES)
	expect(out!.resolutionSec).toBeGreaterThanOrEqual(STREAM_RESOLUTION_FLOOR_SEC)
})

test('honours an explicit resolution and sample cap', () => {
	const time = seconds(101)
	const power = time.map(() => 200)

	const out = downsampleStream({ time, power }, { maxSamples: 11 })

	expect(out!.sampleCount).toBeLessThanOrEqual(11)
})

test('only emits channels that were provided', () => {
	const time = seconds(20)
	const heartrate = time.map(() => 150)

	const out = downsampleStream({ time, heartrate })

	expect(out!.heartrate).toBeDefined()
	expect(out!.power).toBeUndefined()
	expect(out!.pace).toBeUndefined()
})

test('returns null for an empty stream', () => {
	expect(downsampleStream({ time: [] })).toBeNull()
})

test('returns null when no channel carries any usable data', () => {
	const time = seconds(20)
	expect(downsampleStream({ time })).toBeNull()
	expect(downsampleStream({ time, power: time.map(() => null) })).toBeNull()
})

test('serialize → parse round-trips the read-time shape', () => {
	const time = seconds(30)
	const power = time.map((t) => (t >= 10 && t < 15 ? null : 200))
	const heartrate = time.map(() => 150)

	const out = downsampleStream({ time, power, heartrate })!
	const stored = serializeStream(out)
	const parsed = parseStoredStream({ resolutionSec: out.resolutionSec, ...stored })

	expect(parsed).not.toBeNull()
	expect(parsed!.resolutionSec).toBe(out.resolutionSec)
	expect(parsed!.timeSec).toEqual(out.timeSec)
	expect(parsed!.power).toEqual(out.power)
	expect(parsed!.heartrate).toEqual(out.heartrate)
	expect(parsed!.pace).toBeUndefined()
})

test('parseStoredStream tolerates malformed JSON and absent rows', () => {
	expect(parseStoredStream(null)).toBeNull()
	expect(
		parseStoredStream({
			resolutionSec: 5,
			timeSec: 'not json',
			power: null,
			heartrate: null,
			pace: null,
		}),
	).toBeNull()
	// Valid time axis but no channel data → nothing to plot.
	expect(
		parseStoredStream({
			resolutionSec: 5,
			timeSec: '[0,5,10]',
			power: null,
			heartrate: null,
			pace: null,
		}),
	).toBeNull()
})
