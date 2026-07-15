/**
 * Signal-processing primitives for detection: robust statistics, denoising, the
 * pause split, and PELT changepoint detection. All pure, all operating on plain
 * number arrays — no domain knowledge lives here.
 */

/** A telemetry channel: index-aligned readings, `null` where the provider paused. */
export type Channel = Array<number | null>

/** A real reading: a finite number, not a `null` gap. */
export function isNum(v: number | null | undefined): v is number {
	return v != null && Number.isFinite(v)
}

export function mean(xs: number[]): number {
	if (xs.length === 0) return NaN
	return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** The median of a copy of `xs` (does not mutate the input). NaN when empty. */
export function median(xs: number[]): number {
	if (xs.length === 0) return NaN
	const sorted = [...xs].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Trimmed mean: the mean after dropping the top and bottom `fraction` of values.
 * Rejects GPS/power spikes the way #330's median/MAD normalization did, while
 * staying closer to the central tendency than a bare median on a steady segment.
 */
export function trimmedMean(xs: number[], fraction = 0.1): number {
	if (xs.length === 0) return NaN
	if (xs.length < 5) return median(xs)
	const sorted = [...xs].sort((a, b) => a - b)
	const drop = Math.floor(sorted.length * fraction)
	const kept = sorted.slice(drop, sorted.length - drop)
	return kept.length ? mean(kept) : median(xs)
}

/** Rolling median over a window of `window` samples (odd), clamped at the edges. */
export function rollingMedian(values: number[], window: number): number[] {
	const half = Math.floor(window / 2)
	return values.map((_, i) => {
		const lo = Math.max(0, i - half)
		const hi = Math.min(values.length, i + half + 1)
		return median(values.slice(lo, hi))
	})
}

/**
 * Median/MAD normalization: `(v - median) / (1.4826 · MAD)`, so the penalty PELT
 * spends is scale-free. Robust to the GPS spikes that wreck plain z-scoring
 * (a single 20 s/km sample inflates SD and deflates the effective penalty).
 */
export function robustNormalize(values: number[]): number[] {
	const med = median(values)
	const mad = median(values.map((v) => Math.abs(v - med)))
	const scale = 1.4826 * mad || 1
	return values.map((v) => (v - med) / scale)
}

/**
 * Contiguous index ranges `[start, end)` over which the channel carries real
 * readings, split at `null` pauses. We never interpolate across a pause (ADR
 * 0020) — each returned block is segmented independently.
 */
export function splitAtPauses(channel: Channel): Array<[number, number]> {
	const blocks: Array<[number, number]> = []
	let start: number | null = null
	for (let i = 0; i <= channel.length; i++) {
		const real = i < channel.length && isNum(channel[i])
		if (real && start == null) start = i
		if (!real && start != null) {
			blocks.push([start, i])
			start = null
		}
	}
	return blocks
}

/**
 * Textbook PELT with an L2 (piecewise-constant) cost (Killick et al. 2012).
 * Returns changepoint indices — segment end positions, exclusive, the last one
 * `= n`. The input should already be robust-normalized so `penalty` is
 * scale-free. A signal too short for two `minSize` segments is one segment.
 */
export function pelt(signal: number[], penalty: number, minSize: number): number[] {
	const n = signal.length
	if (n < 2 * minSize) return [n]

	// Prefix sums give O(1) segment cost: cost(a,b) = Σx² − (Σx)²/len.
	const s = new Float64Array(n + 1)
	const ss = new Float64Array(n + 1)
	for (let i = 0; i < n; i++) {
		s[i + 1] = s[i]! + signal[i]!
		ss[i + 1] = ss[i]! + signal[i]! * signal[i]!
	}
	const segCost = (a: number, b: number) => {
		const len = b - a
		const sum = s[b]! - s[a]!
		return ss[b]! - ss[a]! - (sum * sum) / len
	}

	const F = new Float64Array(n + 1).fill(Infinity)
	F[0] = -penalty
	const prev = new Int32Array(n + 1).fill(0)
	let candidates: number[] = [0]

	for (let t = minSize; t <= n; t++) {
		let best = Infinity
		let bestTau = 0
		for (const tau of candidates) {
			if (t - tau < minSize) continue
			const c = F[tau]! + segCost(tau, t) + penalty
			if (c < best) {
				best = c
				bestTau = tau
			}
		}
		F[t] = best
		prev[t] = bestTau
		// PELT prune: drop any tau that can never win again.
		candidates = candidates.filter(
			(tau) => t - tau < minSize || F[tau]! + segCost(tau, t) <= F[t]!,
		)
		candidates.push(Math.max(0, t - minSize + 1))
		candidates = [...new Set(candidates)].filter((tau) => tau <= t)
	}

	const cps: number[] = []
	let t = n
	while (t > 0) {
		cps.push(t)
		t = prev[t]!
	}
	return cps.reverse()
}
