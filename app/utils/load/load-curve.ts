import { ewmaStep } from './ewma.ts'

/** One day's TSS, totalled and split by discipline. The curve's input row. */
export type DailyTss = {
	date: string
	tssTotal: number
	tssByDiscipline: Record<string, number>
}

/** Prior CTL/ATL the curve continues from (the day before the first row). */
export type LoadAnchor = { ctl: number; atl: number }

/** One day of the Load Snapshot series: the input TSS plus derived load. */
export type LoadSnapshotPoint = DailyTss & {
	ctl: number
	atl: number
	tsb: number
}

/**
 * The pure Load Curve: daily TSS totals + a starting anchor in, the ordered
 * Load Snapshot series out. The anchor carries the prior CTL/ATL forward so a
 * recompute can continue from the day before `dailyTss[0]`; the EWMA 42/7
 * windows (ADR 0008) live inside `ewmaStep`.
 *
 * No database, no clock — testable through this interface and reusable to
 * rebuild an athlete's load from any set of contributions (recompute-from-date,
 * backfill, or rebuild-from-filter).
 */
export function buildLoadCurve(
	dailyTss: DailyTss[],
	anchor: LoadAnchor,
): LoadSnapshotPoint[] {
	const series: LoadSnapshotPoint[] = []
	let prevCtl = anchor.ctl
	let prevAtl = anchor.atl
	for (const day of dailyTss) {
		const { ctl, atl, tsb } = ewmaStep({
			prevCtl,
			prevAtl,
			tss: day.tssTotal,
		})
		series.push({ ...day, ctl, atl, tsb })
		prevCtl = ctl
		prevAtl = atl
	}
	return series
}
