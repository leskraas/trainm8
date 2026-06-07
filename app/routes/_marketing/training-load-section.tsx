import { useState } from 'react'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'

export type LoadTriad = { ctl: number; atl: number; tsb: number }
export type LoadSnapshot = {
	date: string
	ctl: number
	atl: number
	tsb: number
}

// The Training Load Section folds the retired `/training/load` deep-dive onto
// home, directly beneath the Coach card (ADR 0017). It is always visible,
// defaults to the CTL/ATL/TSB numbers, and exposes a single toggle to the
// trend graph. During cold-start (untrustworthy TSB, ADR 0008/0010) it stays
// visible carrying the same "building baseline — day N/42" caveat as the Coach
// card rather than hiding (the Unavailable Metric principle).
export function TrainingLoadSection({
	current,
	snapshots,
	trust,
}: {
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	trust: TsbTrust
}) {
	const [view, setView] = useState<'numbers' | 'graph'>('numbers')
	const coldStart = !trust.trustworthy

	return (
		<section aria-labelledby="load-heading">
			<div className="mb-4 flex items-baseline justify-between gap-4">
				<h2
					id="load-heading"
					className="text-foreground text-lg font-semibold tracking-tight"
				>
					Training load
				</h2>
				<button
					type="button"
					onClick={() =>
						setView((v) => (v === 'numbers' ? 'graph' : 'numbers'))
					}
					className="text-muted-foreground hover:text-foreground text-sm font-medium"
				>
					{view === 'numbers' ? 'View trend →' : '← View numbers'}
				</button>
			</div>

			{coldStart ? (
				<p className="text-muted-foreground mb-4 text-sm">
					Building baseline — day {trust.daysOfHistory}/{trust.requiredDays}.
				</p>
			) : null}

			{view === 'numbers' ? (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<LoadMetric
						label="Fitness (CTL)"
						value={current?.ctl ?? null}
						description="42-day chronic training load"
						className="ring-sky-400/30"
					/>
					<LoadMetric
						label="Fatigue (ATL)"
						value={current?.atl ?? null}
						description="7-day acute training load"
						className="ring-rose-400/30"
					/>
					<LoadMetric
						label="Form (TSB)"
						value={current?.tsb ?? null}
						description="Fitness − fatigue (positive = fresh)"
						className={
							(current?.tsb ?? 0) < 0
								? 'ring-amber-400/30'
								: 'ring-emerald-400/30'
						}
					/>
				</div>
			) : (
				<Card role="region" aria-labelledby="load-trend-title">
					<CardContent>
						<h3
							id="load-trend-title"
							className="text-body-xs mb-4 font-semibold tracking-[0.12em] uppercase"
						>
							90-Day Trend
						</h3>
						<div className="text-body-2xs mb-3 flex gap-4">
							<span className="flex items-center gap-1.5">
								<span className="inline-block h-0.5 w-4 rounded bg-sky-500" />
								CTL (Fitness)
							</span>
							<span className="flex items-center gap-1.5">
								<span className="inline-block h-0.5 w-4 rounded bg-rose-500" />
								ATL (Fatigue)
							</span>
						</div>
						<Sparkline snapshots={snapshots} />
						{snapshots.length === 0 ? null : (
							<p className="text-muted-foreground text-body-2xs mt-2 text-right">
								Last updated: {snapshots[snapshots.length - 1]?.date}
							</p>
						)}
					</CardContent>
				</Card>
			)}
		</section>
	)
}

function LoadMetric({
	label,
	value,
	description,
	className,
}: {
	label: string
	value: number | null
	description: string
	className?: string
}) {
	return (
		<Card className={className}>
			<CardContent>
				<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
					{label}
				</p>
				<p className="font-heading mt-2 text-5xl leading-none font-bold tracking-[-0.04em] tabular-nums">
					{value != null ? Math.round(value) : '—'}
				</p>
				<p className="text-muted-foreground text-body-xs mt-2">{description}</p>
			</CardContent>
		</Card>
	)
}

function Sparkline({ snapshots }: { snapshots: LoadSnapshot[] }) {
	if (snapshots.length === 0) {
		return (
			<p className="text-muted-foreground text-body-sm">
				No load data yet. Log sessions to start tracking.
			</p>
		)
	}

	const maxCtl = Math.max(...snapshots.map((s) => s.ctl), 1)
	const maxAtl = Math.max(...snapshots.map((s) => s.atl), 1)
	const maxAbs = Math.max(maxCtl, maxAtl)

	const W = 800
	const H = 120
	const pad = 4

	const xScale = (i: number) =>
		pad + (i / Math.max(snapshots.length - 1, 1)) * (W - pad * 2)
	const yScale = (v: number) => H - pad - (v / maxAbs) * (H - pad * 2)

	function polyline(key: 'ctl' | 'atl') {
		return snapshots.map((s, i) => `${xScale(i)},${yScale(s[key])}`).join(' ')
	}

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			aria-label="90-day CTL/ATL sparkline"
			role="img"
		>
			<polyline
				points={polyline('ctl')}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="text-sky-500"
			/>
			<polyline
				points={polyline('atl')}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				className="text-rose-500"
			/>
		</svg>
	)
}
