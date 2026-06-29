import { type ProfileBar, pctToZone } from './session-profile.ts'

/**
 * Derive a recording's intensity profile from its heart-rate-over-time, using
 * the *same* zone boundaries as planned workouts (`pctToZone` on %threshold) so
 * a recorded session and a planned one are coloured by one consistent scheme.
 *
 * The raw per-second stream is bucketed into fixed time windows (smoothing out
 * second-to-second noise), each window's mean HR is mapped to a zone as a
 * percentage of threshold HR, and adjacent same-zone windows are coalesced into
 * `ProfileBar`s weighted by their duration — the exact shape the planned-profile
 * renderer already consumes.
 *
 * Returns `[]` when there's no usable HR data or no threshold to normalise
 * against, which the UI renders as a muted "—" (never a fabricated profile).
 */
const TARGET_WINDOWS = 80
const MIN_WINDOW_SEC = 15

export function deriveHrPhaseBars(
	time: number[],
	heartrate: number[],
	thresholdHr: number,
): ProfileBar[] {
	const n = Math.min(time.length, heartrate.length)
	if (n === 0 || !Number.isFinite(thresholdHr) || thresholdHr <= 0) return []

	const totalSec = time[n - 1]! - time[0]!
	if (totalSec <= 0) return []
	const windowSec = Math.max(
		MIN_WINDOW_SEC,
		Math.ceil(totalSec / TARGET_WINDOWS),
	)
	const start = time[0]!

	// Accumulate HR per window.
	const sums = new Map<number, { sum: number; count: number }>()
	for (let i = 0; i < n; i++) {
		const hr = heartrate[i]!
		if (!Number.isFinite(hr) || hr <= 0) continue
		const w = Math.floor((time[i]! - start) / windowSec)
		const acc = sums.get(w) ?? { sum: 0, count: 0 }
		acc.sum += hr
		acc.count += 1
		sums.set(w, acc)
	}
	if (sums.size === 0) return []

	// Walk windows in order, coalescing adjacent equal zones into bars.
	const bars: ProfileBar[] = []
	const maxWindow = Math.max(...sums.keys())
	for (let w = 0; w <= maxWindow; w++) {
		const acc = sums.get(w)
		if (!acc) continue // gap in the stream (paused) — skip
		const meanHr = acc.sum / acc.count
		const zone = pctToZone((meanHr / thresholdHr) * 100)
		const last = bars[bars.length - 1]
		if (last && last.zone === zone) {
			last.durationSec += windowSec
		} else {
			bars.push({ id: `w${w}`, zone, durationSec: windowSec })
		}
	}
	return bars
}
