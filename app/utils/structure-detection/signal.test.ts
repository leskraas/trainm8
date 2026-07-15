import { expect, test } from 'vitest'
import {
	median,
	pelt,
	rollingMedian,
	robustNormalize,
	splitAtPauses,
	trimmedMean,
} from './signal.ts'

test('median handles odd and even lengths without mutating the input', () => {
	const xs = [3, 1, 2]
	expect(median(xs)).toBe(2)
	expect(xs).toEqual([3, 1, 2]) // unsorted — not mutated
	expect(median([4, 1, 3, 2])).toBe(2.5)
})

test('trimmedMean drops outliers on a long series but falls back to median when short', () => {
	// A single 900 spike is trimmed away from an otherwise-200 series.
	const xs = [200, 200, 200, 200, 200, 200, 200, 200, 200, 900]
	expect(trimmedMean(xs)).toBeCloseTo(200, 5)
	// Short series (< 5) can't trim a whole fraction → median.
	expect(trimmedMean([100, 300, 100])).toBe(100)
})

test('rollingMedian erases a two-sample dip but keeps a three-sample block', () => {
	// Window 5. A 2-sample dip is a minority in every window → smoothed away.
	expect(rollingMedian([9, 9, 1, 1, 9, 9, 9], 5).slice(2, 4)).toEqual([9, 9])
	// A 3-sample block is a majority in its central window → survives.
	expect(rollingMedian([9, 9, 1, 1, 1, 9, 9], 5)[3]).toBe(1)
})

test('robustNormalize centres on the median and is spike-resistant', () => {
	const z = robustNormalize([10, 10, 10, 10, 1000])
	expect(z[0]).toBe(0) // the median value maps to 0
	expect(z[4]).toBeGreaterThan(0) // the spike is positive but MAD-scaled
})

test('splitAtPauses returns contiguous real-reading ranges, splitting at nulls', () => {
	expect(splitAtPauses([1, 2, null, 3, 4, null, null, 5])).toEqual([
		[0, 2],
		[3, 5],
		[7, 8],
	])
	expect(splitAtPauses([null, null])).toEqual([])
})

test('PELT finds the single changepoint of a clean step, at the right place', () => {
	// 20 samples at level 0, then 20 at level 10. Normalized so penalty is
	// scale-free. The one interior changepoint should land at index 20.
	const signal = [
		...Array.from({ length: 20 }, () => 0),
		...Array.from({ length: 20 }, () => 10),
	]
	const z = robustNormalize(signal)
	const cps = pelt(z, 3 * Math.log(z.length), 5)
	expect(cps[cps.length - 1]).toBe(40) // last cp is always n
	expect(cps).toContain(20)
})

test('PELT returns a single segment for a constant signal', () => {
	const z = robustNormalize(Array.from({ length: 40 }, () => 5))
	expect(pelt(z, 3 * Math.log(z.length), 5)).toEqual([40])
})

test('PELT never emits a segment shorter than minSize', () => {
	const signal = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0 : 10))
	const cps = pelt(robustNormalize(signal), 2 * Math.log(60), 5)
	let prev = 0
	for (const cp of cps) {
		expect(cp - prev).toBeGreaterThanOrEqual(5)
		prev = cp
	}
})
