import { Link } from 'react-router'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	getCurrentLoad,
	getLoadSnapshots,
} from '#app/utils/load/snapshot.server.ts'
import { type Route } from './+types/load.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Training Load | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [current, snapshots] = await Promise.all([
		getCurrentLoad(userId),
		getLoadSnapshots(userId, 90),
	])
	return { current, snapshots }
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

function Sparkline({
	snapshots,
}: {
	snapshots: Array<{ date: string; ctl: number; atl: number; tsb: number }>
}) {
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

export default function LoadRoute({ loaderData }: Route.ComponentProps) {
	const { current, snapshots } = loaderData

	return (
		<main className="container py-6 sm:py-10">
			<Card className="mb-6">
				<CardContent>
					<Link
						to="/"
						className="text-muted-foreground hover:text-foreground text-body-2xs inline-flex items-center gap-1 font-medium transition-colors"
					>
						← Home
					</Link>
					<p className="text-muted-foreground text-body-2xs mt-3 font-semibold tracking-[0.18em] uppercase">
						Training · Detail
					</p>
					<h1 className="font-heading mt-2 text-4xl leading-none font-bold tracking-[-0.04em] sm:text-6xl">
						Training Load
					</h1>
					<p className="text-muted-foreground text-body-sm mt-3 max-w-2xl">
						Fitness (CTL), fatigue (ATL), and form (TSB) computed from your
						session logs and activity imports.
					</p>
				</CardContent>
			</Card>

			<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

			<Card aria-labelledby="load-sparkline-title">
				<CardContent>
					<h2
						id="load-sparkline-title"
						className="text-body-xs mb-4 font-semibold tracking-[0.12em] uppercase"
					>
						90-Day Trend
					</h2>
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
		</main>
	)
}
