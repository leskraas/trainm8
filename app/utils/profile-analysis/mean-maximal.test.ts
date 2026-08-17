import { expect, test } from 'vitest'
import { MIN_SAMPLES_PER_WINDOW } from './constants.ts'
import {
	meanMaximalCurve,
	mergeCurves,
	shortestServableDurationSec,
	type SampledChannel,
} from './mean-maximal.ts'

// ── The mean-maximal curve ───────────────────────────────────────────────────
// The input to the critical-power fit, and the place ADR 0020's downsampling
// stops being a fidelity question and becomes a refusal.

/** A channel of `count` samples at `value`, on a `res`-second grid. */
function flat(value: number, count: number, res = 5): SampledChannel {
	return {
		resolutionSec: res,
		samples: Array.from({ length: count }, () => value),
	}
}

test('a flat channel returns its own value at every servable duration', () => {
	// 100 samples × 5 s = 500 s of steady 200 W.
	const curve = meanMaximalCurve(flat(200, 100), [60, 120, 300])
	expect(curve.map((point) => point.value)).toEqual([200, 200, 200])
	expect(curve.every((point) => point.refusal == null)).toBe(true)
})

test('the best window wins, not the first or the average', () => {
	// 60 s at 150 W, then 60 s at 400 W, then 60 s at 150 W, on a 5 s grid.
	const samples = [
		...Array.from({ length: 12 }, () => 150),
		...Array.from({ length: 12 }, () => 400),
		...Array.from({ length: 12 }, () => 150),
	]
	const [point] = meanMaximalCurve({ resolutionSec: 5, samples }, [60])
	expect(point!.value).toBe(400)
})

test('a duration the grid cannot serve is refused by name, never estimated', () => {
	// A 19 s grid is what a 5 h ride lands on. A 60 s window is 3 samples.
	const curve = meanMaximalCurve(flat(200, 400, 19), [60, 120, 300])
	expect(curve[0]).toMatchObject({ value: null, refusal: 'resolution' })
	// 120 / 19 ≈ 6 samples — still under the floor, still refused.
	expect(curve[1]).toMatchObject({ value: null, refusal: 'resolution' })
	// 300 / 19 ≈ 16 samples — servable.
	expect(curve[2]!.value).toBe(200)
})

test('the servable floor is the documented one', () => {
	expect(shortestServableDurationSec(5)).toBe(5 * MIN_SAMPLES_PER_WINDOW)
	expect(shortestServableDurationSec(19)).toBe(19 * MIN_SAMPLES_PER_WINDOW)
})

test('a pause invalidates a window rather than averaging across it', () => {
	// 200 W throughout, but a gap that every 60 s window must contain.
	const samples: Array<number | null> = [
		...Array.from({ length: 6 }, () => 200),
		null,
		...Array.from({ length: 6 }, () => 200),
	]
	const [point] = meanMaximalCurve({ resolutionSec: 5, samples }, [60])
	expect(point).toMatchObject({ value: null, refusal: 'no-clean-window' })
})

test('a gap is never treated as zero', () => {
	// A clean 60 s window exists after the gap; the value must be the clean
	// window's mean, not one dragged down by a null-as-zero.
	const samples: Array<number | null> = [
		...Array.from({ length: 4 }, () => 100),
		null,
		null,
		...Array.from({ length: 12 }, () => 300),
	]
	const [point] = meanMaximalCurve({ resolutionSec: 5, samples }, [60])
	expect(point!.value).toBe(300)
})

test('a window longer than the activity is a resolution refusal, not a crash', () => {
	const [point] = meanMaximalCurve(flat(200, 10), [1200])
	expect(point).toMatchObject({ value: null, refusal: 'resolution' })
})

test('merging takes the athlete best and remembers where it came from', () => {
	const merged = mergeCurves(
		[
			{
				activityId: 'a',
				occurredAt: new Date('2026-06-01'),
				points: meanMaximalCurve(flat(220, 100), [60, 300]),
			},
			{
				activityId: 'b',
				occurredAt: new Date('2026-07-01'),
				points: meanMaximalCurve(flat(260, 100), [60, 300]),
			},
		],
		[60, 300],
	)
	expect(merged[0]).toMatchObject({ value: 260, activityId: 'b' })
	expect(merged[1]).toMatchObject({ value: 260, activityId: 'b' })
})

test('a duration no activity could serve keeps the reason in the merge', () => {
	const merged = mergeCurves(
		[
			{
				activityId: 'a',
				occurredAt: new Date('2026-06-01'),
				points: meanMaximalCurve(flat(220, 400, 19), [60]),
			},
			{
				activityId: 'b',
				occurredAt: new Date('2026-07-01'),
				points: meanMaximalCurve(flat(260, 400, 19), [60]),
			},
		],
		[60],
	)
	// "your rides are too long to read a one-minute max off", not a generic absence.
	expect(merged[0]).toMatchObject({ value: null, refusal: 'resolution' })
})
