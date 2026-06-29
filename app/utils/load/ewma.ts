export type LoadPoint = { ctl: number; atl: number; tsb: number }

/** CTL ("fitness") EWMA time constant in days (ADR 0008). */
export const CTL_DAYS = 42
/** ATL ("fatigue") EWMA time constant in days (ADR 0008). */
export const ATL_DAYS = 7

/**
 * One step of the Coggan EWMA recurrence (ADR 0008):
 *   CTL_today = CTL_yesterday + (TSS_today − CTL_yesterday) / 42
 *   ATL_today = ATL_yesterday + (TSS_today − ATL_yesterday) / 7
 *   TSB_today = CTL_yesterday − ATL_yesterday  (form = yesterday's fitness − yesterday's fatigue)
 */
export function ewmaStep(opts: {
	prevCtl: number
	prevAtl: number
	tss: number
}): LoadPoint {
	const { prevCtl, prevAtl, tss } = opts
	const ctl = prevCtl + (tss - prevCtl) / CTL_DAYS
	const atl = prevAtl + (tss - prevAtl) / ATL_DAYS
	const tsb = prevCtl - prevAtl
	return { ctl, atl, tsb }
}
