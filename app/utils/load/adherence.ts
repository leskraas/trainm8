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

/** Per-session Plan Adherence: the actual/planned ratio and its band (ADR 0019). */
export type SessionAdherence = {
	/** actual TSS / Planned TSS for the single session. */
	ratio: number
	/** Band derived from the ratio (ADR 0019). */
	band: AdherenceBand
}

/**
 * The per-session mirror of `weeklyAdherence`: one session's actual-vs-Planned
 * TSS as a ratio plus its `adherenceBand`, owning the same exclusion gate the
 * Session Ledger used to apply inline. A band needs *both* sides present, and
 * Planned TSS must be positive to anchor a denominator — anything else returns
 * `null` (the caller renders "—", never a fabricated 100%). The ADR 0019
 * asymmetric over/under thresholds live entirely in `adherenceBand`, so the
 * per-session and weekly figures can never drift apart.
 */
export function sessionAdherence(
	actualTss: number | null,
	plannedTss: number | null,
): SessionAdherence | null {
	if (actualTss == null || plannedTss == null || plannedTss <= 0) return null
	const ratio = actualTss / plannedTss
	return { ratio, band: adherenceBand(ratio) }
}

/** A weekly Plan Adherence rollup over the sessions in a training week. */
export type WeeklyAdherence = {
	/** sum(actual TSS) / sum(Planned TSS) over the contributing sessions. */
	ratio: number
	/** Band derived from the summed ratio (ADR 0019). */
	band: AdherenceBand
	/** How many sessions contributed (both Planned and actual TSS present). */
	sessionCount: number
	/** Summed actual TSS of the contributing sessions. */
	totalActual: number
	/** Summed Planned TSS of the contributing sessions. */
	totalPlanned: number
}

/**
 * Roll a training week up to a single Plan Adherence figure (ADR 0019, #119):
 * `sum(actual TSS) / sum(Planned TSS)` over the week, banded via the same
 * `adherenceBand`. Aggregating the sums *before* dividing is what makes
 * compensation visible — a big session covering several skipped ones reads
 * on-target weekly even though each session alone was off.
 *
 * Honesty carries through the aggregate: a session missing either side (or with
 * non-positive Planned TSS, which can't anchor a denominator) is excluded from
 * *both* sums rather than zero-filled — mirroring the per-session band gate in
 * `toSessionLedgerEntry`. A week with no contributing session, or no resolvable
 * planned load, returns `null` (the caller renders "—", never a fabricated
 * ratio).
 */
export function weeklyAdherence(
	sessions: Array<{ plannedTss: number | null; actualTss: number | null }>,
): WeeklyAdherence | null {
	let totalPlanned = 0
	let totalActual = 0
	let sessionCount = 0
	for (const s of sessions) {
		if (s.plannedTss == null || s.actualTss == null) continue
		if (s.plannedTss <= 0) continue
		totalPlanned += s.plannedTss
		totalActual += s.actualTss
		sessionCount += 1
	}
	if (sessionCount === 0 || totalPlanned <= 0) return null
	const ratio = totalActual / totalPlanned
	return {
		ratio,
		band: adherenceBand(ratio),
		sessionCount,
		totalActual,
		totalPlanned,
	}
}

/**
 * A training week rolled up for the weekly-build chart. Where `WeeklyAdherence`
 * needs *both* sides of a session present to form a ratio, this keeps Planned
 * and actual TSS as **independent** sums, so a week that was planned but never
 * trustworthily recorded still carries its Planned load while its actual reads
 * honestly Unavailable (ADR 0008 / ADR 0030) — a no-bar `n/a` slot, never a
 * silent gap and never a zero bar. The comparable-sessions `adherence` rollup
 * rides along (null when no session has both sides) so the chart can colour the
 * actual bar by its Adherence Band and the coach can still read the streak from
 * the same series.
 */
export type WeeklyLoad = {
	/** Sum of Planned TSS over the week's planned sessions; null when none. */
	plannedTss: number | null
	/** Sum of actual TSS over the week's recorded sessions; null when none. */
	actualTss: number | null
	/** Comparable-sessions Weekly Plan Adherence (both sides present), or null. */
	adherence: WeeklyAdherence | null
}

/**
 * Roll a training week up for the build chart (see `WeeklyLoad`). Planned and
 * actual are summed independently — a session contributes to Planned when it
 * has a positive Planned TSS, and to actual when it has any actual TSS — so the
 * two are never coupled the way the adherence ratio must couple them. The
 * `adherence` field reuses `weeklyAdherence` verbatim, so the band shown on a
 * bar and the streak the Coach card reads can never drift.
 */
export function weeklyLoad(
	sessions: Array<{ plannedTss: number | null; actualTss: number | null }>,
): WeeklyLoad {
	let planned = 0
	let plannedCount = 0
	let actual = 0
	let actualCount = 0
	for (const s of sessions) {
		if (s.plannedTss != null && s.plannedTss > 0) {
			planned += s.plannedTss
			plannedCount += 1
		}
		if (s.actualTss != null) {
			actual += s.actualTss
			actualCount += 1
		}
	}
	return {
		plannedTss: plannedCount > 0 ? planned : null,
		actualTss: actualCount > 0 ? actual : null,
		adherence: weeklyAdherence(sessions),
	}
}
