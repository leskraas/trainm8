/**
 * Translate a Plan Adherence ratio (actual TSS / planned TSS) into a
 * plain-language band (ADR 0019). This is the planned-vs-actual mirror of
 * `readinessFromTsb`: named exported thresholds, a `tone` enum, and a
 * `{ label, recommendation, tone }` result.
 *
 * Pure and page-agnostic: callers pass `actual / planned` and render the band;
 * deciding when a band is even meaningful (both Planned and actual TSS present)
 * lives at the call site, which renders "—" otherwise rather than a fabricated
 * ratio.
 */

export type AdherenceTone = 'under' | 'on-target' | 'over'

export type AdherenceBand = {
	/** Short state, e.g. "On target". */
	label: string
	/** Short recommendation, e.g. "matched the plan". */
	recommendation: string
	/** Severity band for styling/iconography. */
	tone: AdherenceTone
}

/**
 * Ratio at/above this is at least "on target" — below it the session came in
 * meaningfully light (undertraining).
 */
export const ADHERENCE_ON_TARGET_AT_OR_ABOVE = 0.85

/**
 * Ratio strictly above this is "over" — the session ran meaningfully harder
 * than prescribed (overreaching). Asymmetric on purpose: the over edge (1.08)
 * sits nearer to 1.0 than the under edge (0.85), so overreaching — the riskier
 * failure mode — flags sooner than undertraining. Placeholder cut points: the
 * structure is fixed, the numbers are tunable later.
 */
export const ADHERENCE_OVER_ABOVE = 1.08

export function adherenceBand(ratio: number): AdherenceBand {
	if (ratio < ADHERENCE_ON_TARGET_AT_OR_ABOVE) {
		return {
			label: 'Under',
			recommendation: 'lighter than planned',
			tone: 'under',
		}
	}
	if (ratio > ADHERENCE_OVER_ABOVE) {
		return {
			label: 'Over',
			recommendation: 'harder than planned',
			tone: 'over',
		}
	}
	return {
		label: 'On target',
		recommendation: 'matched the plan',
		tone: 'on-target',
	}
}
