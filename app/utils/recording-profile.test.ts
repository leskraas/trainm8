import { expect, test } from 'vitest'
import { deriveHrPhaseBars } from './recording-profile.ts'

/** Build parallel time (1 Hz) + HR arrays from constant-HR segments. */
function stream(segments: Array<{ sec: number; hr: number }>) {
	const time: number[] = []
	const heartrate: number[] = []
	let t = 0
	for (const seg of segments) {
		for (let i = 0; i < seg.sec; i++) {
			time.push(t++)
			heartrate.push(seg.hr)
		}
	}
	return { time, heartrate }
}

test('coalesces an easy/hard/easy HR stream into a Z2 → Z4 → Z2 arc', () => {
	// lthr 168: 110bpm≈65% (Z2), 165bpm≈98% (Z4) per the shared %threshold zones.
	const { time, heartrate } = stream([
		{ sec: 400, hr: 110 },
		{ sec: 400, hr: 165 },
		{ sec: 400, hr: 110 },
	])
	const bars = deriveHrPhaseBars(time, heartrate, 168)
	const zones = bars.map((b) => b.zone ?? 0)

	// Starts easy, peaks at threshold, returns to easy — rising then falling
	// (brief intermediate zones at the segment transitions are expected/real).
	expect(zones[0]).toBe(2)
	expect(zones[zones.length - 1]).toBe(2)
	expect(Math.max(...zones)).toBe(4)
	const peak = zones.indexOf(4)
	for (let i = 1; i <= peak; i++)
		expect(zones[i]).toBeGreaterThanOrEqual(zones[i - 1]!)
	for (let i = peak + 1; i < zones.length; i++)
		expect(zones[i]).toBeLessThanOrEqual(zones[i - 1]!)

	// Total duration tracks the stream length.
	const total = bars.reduce((s, b) => s + b.durationSec, 0)
	expect(total).toBeGreaterThanOrEqual(1140)
	expect(total).toBeLessThanOrEqual(1260)
})

test('a steady effort collapses to a single bar', () => {
	const { time, heartrate } = stream([{ sec: 600, hr: 140 }])
	const bars = deriveHrPhaseBars(time, heartrate, 168)
	expect(bars).toHaveLength(1)
})

test('returns no profile without usable HR or a threshold', () => {
	const { time, heartrate } = stream([{ sec: 300, hr: 150 }])
	expect(deriveHrPhaseBars([], [], 168)).toEqual([])
	expect(deriveHrPhaseBars(time, heartrate, 0)).toEqual([])
	expect(deriveHrPhaseBars(time, new Array(time.length).fill(0), 168)).toEqual(
		[],
	)
})
