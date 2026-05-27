/**
 * Minimum days of load history before the Form (TSB) number is trustworthy.
 *
 * Matches CTL's 42-day EWMA time constant (ADR 0008): until the athlete has
 * roughly that much history, CTL is still climbing from zero and TSB reads
 * artificially negative. Below this gate the Coach card shows a "building
 * baseline" state instead of the number (Unavailable Metric principle).
 * Tune here.
 */
export const TSB_TRUSTWORTHY_MIN_DAYS = 42

export type TsbTrust = {
	/** Whether the athlete has enough history for TSB to be presented as-is. */
	trustworthy: boolean
	/** Days of load history accumulated so far (the N in "day N/42"). */
	daysOfHistory: number
	/** Days of history required before TSB is trustworthy. */
	requiredDays: number
}

/**
 * Inclusive count of load-history days between the first recorded day and
 * today. Both are YYYY-MM-DD in the athlete timezone. The first day counts as
 * day 1, so a `firstDate` equal to `today` yields 1. Returns 0 when there is
 * no history.
 */
export function daysOfLoadHistory(
	firstDate: string | null,
	today: string,
): number {
	if (!firstDate) return 0
	const first = Date.parse(`${firstDate}T00:00:00.000Z`)
	const now = Date.parse(`${today}T00:00:00.000Z`)
	if (Number.isNaN(first) || Number.isNaN(now)) return 0
	const diffDays = Math.round((now - first) / 86_400_000)
	return Math.max(0, diffDays + 1)
}

/**
 * Decide whether TSB is trustworthy given how many days of load history the
 * athlete has accumulated. Page-agnostic: callers render the "building
 * baseline" progress (`day {daysOfHistory}/{requiredDays}`) when not
 * trustworthy, and the real TSB number once at/above the threshold.
 */
export function assessTsbTrust(daysOfHistory: number): TsbTrust {
	const days = Math.max(0, Math.floor(daysOfHistory))
	return {
		trustworthy: days >= TSB_TRUSTWORTHY_MIN_DAYS,
		daysOfHistory: days,
		requiredDays: TSB_TRUSTWORTHY_MIN_DAYS,
	}
}
