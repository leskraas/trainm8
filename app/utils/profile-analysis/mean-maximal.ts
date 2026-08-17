import { MIN_SAMPLES_PER_WINDOW } from './constants.ts'

/**
 * The **mean-maximal curve**: the best average a channel sustained over each of
 * a set of durations. The input to a critical-power fit, and the thing ADR 0020
 * makes partly unrecoverable.
 *
 * Pure and dependency-free — it takes an already-parsed channel and a grid
 * resolution, never a row.
 */

/**
 * One duration's answer, with the refusal named rather than the value nulled
 * silently. A curve that quietly omitted its short rungs would look complete;
 * one that lists them refused says what the storage cost.
 */
export type MeanMaximalPoint = {
	durationSec: number
	/** The best mean over `durationSec`, or `null` where refused. */
	value: number | null
	refusal: MeanMaximalRefusal | null
}

export type MeanMaximalRefusal =
	/** The stored grid is too coarse for this duration (ADR 0020). */
	| 'resolution'
	/**
	 * The grid is fine enough, but no window of this length was free of `null`.
	 * A pause inside a window means the athlete was not doing the effort, so the
	 * window is not an effort — never averaged across, never zero-filled.
	 */
	| 'no-clean-window'

/** A channel as stored: an even grid, with `null` marking a pause. */
export type SampledChannel = {
	resolutionSec: number
	samples: Array<number | null>
}

/**
 * The shortest duration a grid can honestly serve, in seconds.
 *
 * See `MIN_SAMPLES_PER_WINDOW` for the derivation: an even grid quantizes a
 * window's true length to a multiple of `resolutionSec`, so `n` samples cap the
 * relative duration error at `1 / (2n)`.
 */
export function shortestServableDurationSec(resolutionSec: number): number {
	return resolutionSec * MIN_SAMPLES_PER_WINDOW
}

/**
 * The best mean over each requested duration.
 *
 * The sliding window runs on the **sample grid**, so a requested duration is
 * first rounded to a whole number of samples; that rounding is exactly the error
 * `MIN_SAMPLES_PER_WINDOW` bounds. Windows containing any `null` are skipped
 * entirely rather than averaged over — a paused five minutes is not a
 * five-minute effort, and treating the gap as zero would report a
 * lower-than-real value with full confidence.
 */
export function meanMaximalCurve(
	channel: SampledChannel,
	durationsSec: readonly number[],
): MeanMaximalPoint[] {
	const { resolutionSec, samples } = channel
	// Prefix sums over the values, and over the count of gaps, so each window is
	// O(1): `sum` is only meaningful where `gaps` says the window is clean.
	const n = samples.length
	const sum = new Float64Array(n + 1)
	const gaps = new Int32Array(n + 1)
	for (let i = 0; i < n; i++) {
		const v = samples[i]
		const usable = v != null && Number.isFinite(v)
		sum[i + 1] = sum[i]! + (usable ? v : 0)
		gaps[i + 1] = gaps[i]! + (usable ? 0 : 1)
	}

	return durationsSec.map((durationSec) => {
		const width = Math.round(durationSec / resolutionSec)
		if (width < MIN_SAMPLES_PER_WINDOW || width > n) {
			return { durationSec, value: null, refusal: 'resolution' as const }
		}
		let best: number | null = null
		for (let i = 0; i + width <= n; i++) {
			if (gaps[i + width]! - gaps[i]! > 0) continue
			const mean = (sum[i + width]! - sum[i]!) / width
			if (best == null || mean > best) best = mean
		}
		return best == null
			? { durationSec, value: null, refusal: 'no-clean-window' as const }
			: { durationSec, value: best, refusal: null }
	})
}

/** One activity's contribution to the merged curve. */
export type CurveContribution = {
	/** Opaque activity identifier, so the merge can count distinct sources. */
	activityId: string
	occurredAt: Date
	points: MeanMaximalPoint[]
}

/** A merged curve point: the athlete's best, and where it came from. */
export type MergedPoint = MeanMaximalPoint & {
	activityId: string | null
	occurredAt: Date | null
}

/**
 * Merge per-activity curves into the athlete's best over the window.
 *
 * A duration is **refused** in the merge only when no activity produced a value
 * for it, and the reported refusal is the most common one across activities —
 * so "your rides are too long to read a one-minute max off" surfaces as
 * `resolution` rather than being flattened into a generic absence.
 */
export function mergeCurves(
	contributions: readonly CurveContribution[],
	durationsSec: readonly number[],
): MergedPoint[] {
	return durationsSec.map((durationSec) => {
		let best: MergedPoint = {
			durationSec,
			value: null,
			refusal: null,
			activityId: null,
			occurredAt: null,
		}
		const refusals: MeanMaximalRefusal[] = []
		for (const contribution of contributions) {
			const point = contribution.points.find(
				(candidate) => candidate.durationSec === durationSec,
			)
			if (!point) continue
			if (point.value == null) {
				if (point.refusal) refusals.push(point.refusal)
				continue
			}
			if (best.value == null || point.value > best.value) {
				best = {
					durationSec,
					value: point.value,
					refusal: null,
					activityId: contribution.activityId,
					occurredAt: contribution.occurredAt,
				}
			}
		}
		if (best.value != null) return best
		return { ...best, refusal: dominantRefusal(refusals) }
	})
}

function dominantRefusal(
	refusals: readonly MeanMaximalRefusal[],
): MeanMaximalRefusal | null {
	if (refusals.length === 0) return null
	const counts = new Map<MeanMaximalRefusal, number>()
	for (const refusal of refusals) {
		counts.set(refusal, (counts.get(refusal) ?? 0) + 1)
	}
	let winner: MeanMaximalRefusal = refusals[0]!
	let most = 0
	for (const [refusal, count] of counts) {
		if (count > most) {
			most = count
			winner = refusal
		}
	}
	return winner
}
