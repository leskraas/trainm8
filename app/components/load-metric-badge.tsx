import { cn } from '#app/utils/misc.tsx'

type LoadMetric = 'ctl' | 'atl' | 'tsb'

const METRIC_SR_LABELS: Record<LoadMetric, string> = {
	ctl: 'CTL (Fitness)',
	atl: 'ATL (Fatigue)',
	tsb: 'TSB (Form)',
}

const METRIC_ABBREVIATIONS: Record<LoadMetric, string> = {
	ctl: 'CTL',
	atl: 'ATL',
	tsb: 'TSB',
}

const STATIC_METRIC_COLORS: Record<Exclude<LoadMetric, 'tsb'>, string> = {
	ctl: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
	atl: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

/**
 * A colour-coded chip for a Training Load metric (CTL / ATL / TSB).
 *
 * The colour-by-metric mapping lives here, including TSB's sign-based swap
 * (negative form → amber, non-negative → emerald) and its explicit `+` prefix.
 */
export function LoadMetricBadge({
	metric,
	value,
}: {
	metric: LoadMetric
	value: number
}) {
	const rounded = Math.round(value)
	const colorClassName =
		metric === 'tsb'
			? value < 0
				? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
				: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
			: STATIC_METRIC_COLORS[metric]
	const displayValue =
		metric === 'tsb' && value >= 0 ? `+${rounded}` : `${rounded}`

	return (
		<div
			className={cn(
				'rounded-3xl px-2.5 py-1 text-xs font-medium tabular-nums',
				colorClassName,
			)}
		>
			<dt className="sr-only">{METRIC_SR_LABELS[metric]}</dt>
			<dd>
				{METRIC_ABBREVIATIONS[metric]} {displayValue}
			</dd>
		</div>
	)
}
