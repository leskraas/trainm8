import {
	CP_FIT_BAND_SEC,
	CP_PLAUSIBLE_W,
	MIN_FIT_DURATION_SPREAD,
	MIN_FIT_POINTS,
	W_PRIME_PLAUSIBLE_J,
} from './constants.ts'
import { type MergedPoint } from './mean-maximal.ts'

/**
 * The **2-parameter critical-power model**, `P(t) = CP + W′/t`.
 *
 * Linear in `1/t`, so the fit is an ordinary least-squares line: the intercept
 * is **CP** and the slope is **W′**. Fitted only inside `CP_FIT_BAND_SEC`,
 * where the model is known to be well-behaved — below it the anaerobic
 * contribution dominates and the fit returns implausibly low CP with
 * implausibly high W′, which is a documented failure mode rather than a rare
 * accident (`docs/research/zones-and-thresholds.md` §4).
 *
 * **The result is a CP and it is not an FTP.** The head-to-head is 256 ± 50 W
 * vs 249 ± 44 W, limits of agreement −19 to +33 W, and the gap widens with
 * fitness. Nothing in this module converts one to the other, because no
 * validated conversion exists to apply.
 */

export type CpFit =
	| {
			kind: 'fit'
			/** Watts. The asymptote — a **CP**, not an FTP. */
			cpW: number
			/**
			 * Joules. Returned for the derivation panel and **never proposed**: a
			 * `W′` from a curve whose short anchors were refused for coarseness is a
			 * free parameter absorbing residual, not a measurement of anaerobic
			 * capacity.
			 */
			wPrimeJ: number
			rSquared: number
			/** The durations that entered the fit, seconds, ascending. */
			durationsUsedSec: number[]
			/** Distinct activities the fitted points came from. */
			contributingActivityIds: string[]
			/** The most recent contributing effort. */
			latest: Date | null
	  }
	| {
			kind: 'refusal'
			refusal:
				| 'insufficient-efforts'
				| 'insufficient-spread'
				| 'implausible-fit'
			durationsUsedSec: number[]
	  }

/**
 * Fit the model to a merged mean-maximal curve.
 *
 * Every refusal is a *stated* one. A fit that cannot be trusted is not returned
 * as a small number with a low grade — the grade communicates uncertainty
 * within a valid fit, and it must not be asked to carry "this is not a fit at
 * all".
 */
export function fitCriticalPower(curve: readonly MergedPoint[]): CpFit {
	const [minSec, maxSec] = CP_FIT_BAND_SEC
	const points = curve
		.filter(
			(point): point is MergedPoint & { value: number } =>
				point.value != null &&
				point.durationSec >= minSec &&
				point.durationSec <= maxSec,
		)
		.sort((a, b) => a.durationSec - b.durationSec)

	const durationsUsedSec = points.map((point) => point.durationSec)

	if (points.length < MIN_FIT_POINTS) {
		return {
			kind: 'refusal',
			refusal: 'insufficient-efforts',
			durationsUsedSec,
		}
	}

	const shortest = points[0]!.durationSec
	const longest = points[points.length - 1]!.durationSec
	if (longest / shortest < MIN_FIT_DURATION_SPREAD) {
		return { kind: 'refusal', refusal: 'insufficient-spread', durationsUsedSec }
	}

	// Least squares of y = intercept + slope·x, with x = 1/t. Intercept is CP,
	// slope is W′.
	const n = points.length
	let sumX = 0
	let sumY = 0
	for (const point of points) {
		sumX += 1 / point.durationSec
		sumY += point.value
	}
	const meanX = sumX / n
	const meanY = sumY / n

	let sxx = 0
	let sxy = 0
	for (const point of points) {
		const dx = 1 / point.durationSec - meanX
		sxx += dx * dx
		sxy += dx * (point.value - meanY)
	}
	if (sxx === 0) {
		return { kind: 'refusal', refusal: 'insufficient-spread', durationsUsedSec }
	}

	const wPrimeJ = sxy / sxx
	const cpW = meanY - wPrimeJ * meanX

	if (
		!Number.isFinite(cpW) ||
		!Number.isFinite(wPrimeJ) ||
		cpW < CP_PLAUSIBLE_W[0] ||
		cpW > CP_PLAUSIBLE_W[1] ||
		wPrimeJ < W_PRIME_PLAUSIBLE_J[0] ||
		wPrimeJ > W_PRIME_PLAUSIBLE_J[1]
	) {
		return { kind: 'refusal', refusal: 'implausible-fit', durationsUsedSec }
	}

	// r² on the linearized form — the fraction of the variance in the observed
	// means the `1/t` term accounts for.
	let ssRes = 0
	let ssTot = 0
	for (const point of points) {
		const predicted = cpW + wPrimeJ / point.durationSec
		ssRes += (point.value - predicted) ** 2
		ssTot += (point.value - meanY) ** 2
	}
	const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot)

	const contributingActivityIds = [
		...new Set(
			points
				.map((point) => point.activityId)
				.filter((id): id is string => id != null),
		),
	]
	const latest = points.reduce<Date | null>((newest, point) => {
		if (!point.occurredAt) return newest
		return newest == null || point.occurredAt > newest
			? point.occurredAt
			: newest
	}, null)

	return {
		kind: 'fit',
		cpW,
		wPrimeJ,
		rSquared,
		durationsUsedSec,
		contributingActivityIds,
		latest,
	}
}
