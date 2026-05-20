export type LoadPoint = { ctl: number; atl: number; tsb: number }

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
	const ctl = prevCtl + (tss - prevCtl) / 42
	const atl = prevAtl + (tss - prevAtl) / 7
	const tsb = prevCtl - prevAtl
	return { ctl, atl, tsb }
}

/** Compute CTL/ATL/TSB for each day in `tssSeries`, starting from `initCtl`/`initAtl`. */
export function buildLoadCurve(
	tssSeries: number[],
	initCtl: number,
	initAtl: number,
): LoadPoint[] {
	const result: LoadPoint[] = []
	let prevCtl = initCtl
	let prevAtl = initAtl
	for (const tss of tssSeries) {
		const point = ewmaStep({ prevCtl, prevAtl, tss })
		result.push(point)
		prevCtl = point.ctl
		prevAtl = point.atl
	}
	return result
}
