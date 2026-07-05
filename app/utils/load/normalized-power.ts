/**
 * Normalized Power (Coggan): the intensity a variable-power ride "felt like"
 * physiologically. A 30-second rolling average of the power stream, each
 * rolling value raised to the fourth power, the mean of those, and the fourth
 * root of that mean. Steady rides yield NP ≈ average power; interval and hilly
 * rides yield NP > average power — which is exactly the signal average power
 * loses and Coggan TSS needs (#174).
 *
 * Input is the stored Activity Stream power channel (ADR 0020): evenly spaced
 * samples every `resolutionSec`, with `null` marking paused gaps. Gaps are
 * skipped (paused time is not zero watts); a window with no real samples
 * contributes nothing. When the stream's buckets are coarser than 30s the
 * downsampler has already smoothed past the window, so the rolling pass
 * degrades to a single-sample window.
 *
 * Returns `null` when no usable power stream exists — an empty/all-gap channel,
 * a non-positive resolution, or fewer real samples than one full 30s window —
 * so callers fall back honestly instead of trusting a fabricated NP.
 */

/** The Coggan rolling-average window, in seconds. */
export const NP_WINDOW_SEC = 30

function isReal(v: number | null | undefined): v is number {
	return v != null && Number.isFinite(v) && v >= 0
}

export function normalizedPower(
	power: Array<number | null>,
	resolutionSec: number,
): number | null {
	if (!Number.isFinite(resolutionSec) || resolutionSec <= 0) return null

	// Samples per 30s window; a bucket coarser than 30s is already smoothed.
	const windowLen = Math.max(1, Math.ceil(NP_WINDOW_SEC / resolutionSec))

	let realCount = 0
	for (const v of power) if (isReal(v)) realCount++
	// Usable = enough real samples to fill at least one full rolling window.
	if (realCount < windowLen) return null

	let sumOfFourths = 0
	let windowCount = 0
	for (let i = windowLen - 1; i < power.length; i++) {
		let sum = 0
		let count = 0
		for (let j = i - windowLen + 1; j <= i; j++) {
			const v = power[j]
			if (!isReal(v)) continue
			sum += v
			count++
		}
		if (count === 0) continue // window entirely inside a pause
		const rollingAvg = sum / count
		sumOfFourths += rollingAvg ** 4
		windowCount++
	}
	if (windowCount === 0) return null

	return Math.pow(sumOfFourths / windowCount, 1 / 4)
}
