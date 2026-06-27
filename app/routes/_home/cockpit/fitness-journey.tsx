// Act zone: the progression curve — real CTL ("fitness") history from the load
// snapshots, the plan's phases tinted behind it, and "you are here" today.
//
// The prototype drew a dashed projection forward to race day; that needs
// modelling we don't have, so this stops the line at today (the Unavailable
// Metric principle, ADR 0008). When a plan exists we still show where the race
// sits on the timeline and the countdown — we just don't fake the curve to it.
import { type LoadSnapshot } from '#app/components/form-load-card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type PhaseBand, type PlanContext } from './presenter.ts'
import { fmtDate } from './shared.tsx'

const W = 800
const H = 220

export function FitnessJourney({
	snapshots,
	phaseBands,
	planContext,
	height = 220,
}: {
	snapshots: LoadSnapshot[]
	phaseBands: PhaseBand[]
	planContext: PlanContext | null
	height?: number
}) {
	const points = snapshots
		.map((s) => ({ ms: Date.parse(s.date), ctl: s.ctl }))
		.filter((p) => Number.isFinite(p.ms))
		.sort((a, b) => a.ms - b.ms)

	if (points.length < 2) {
		return (
			<p className="text-muted-foreground py-8 text-center text-sm">
				Your fitness curve will appear here as training history builds.
			</p>
		)
	}

	const todayMs = points[points.length - 1]!.ms
	const planned = phaseBands.length > 0
	const domainStart = planned ? phaseBands[0]!.start.getTime() : points[0]!.ms
	const domainEnd = planned ? phaseBands.at(-1)!.end.getTime() : todayMs
	const span = Math.max(domainEnd - domainStart, 1)

	const vis = points.filter((p) => p.ms >= domainStart && p.ms <= todayMs)
	const series = vis.length >= 2 ? vis : points

	const ctls = series.map((p) => p.ctl)
	const lo = Math.min(...ctls)
	const hi = Math.max(...ctls)
	const yMin = Math.max(0, Math.floor(lo - Math.max((hi - lo) * 0.2, 3)))
	const yMax = Math.ceil(hi + Math.max((hi - lo) * 0.2, 3))
	const ySpan = Math.max(yMax - yMin, 1)

	const xFrac = (ms: number) => (ms - domainStart) / span
	const x = (ms: number) => xFrac(ms) * W
	const y = (ctl: number) => H - ((ctl - yMin) / ySpan) * H
	const leftPct = (ms: number) => `${xFrac(ms) * 100}%`
	const topPct = (ctl: number) => `${(1 - (ctl - yMin) / ySpan) * 100}%`

	const linePoints = series.map((p) => `${x(p.ms)},${y(p.ctl)}`).join(' ')
	const area = `${x(series[0]!.ms)},${H} ${linePoints} ${x(series.at(-1)!.ms)},${H}`
	const todayPt = series.at(-1)!
	const currentPhase = phaseBands.find((b) => b.isCurrent)

	return (
		<div>
			<div className="relative" style={{ height }}>
				<svg
					viewBox={`0 0 ${W} ${H}`}
					preserveAspectRatio="none"
					className="absolute inset-0 size-full"
					role="img"
					aria-label="Fitness (CTL) history with plan phases"
				>
					<defs>
						<linearGradient id="cockpitFitArea" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
							<stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
						</linearGradient>
					</defs>

					{currentPhase ? (
						<rect
							x={x(currentPhase.start.getTime())}
							y={0}
							width={
								x(currentPhase.end.getTime()) - x(currentPhase.start.getTime())
							}
							height={H}
							className="fill-primary"
							opacity={0.05}
						/>
					) : null}

					{phaseBands.slice(1).map((band) => (
						<line
							key={band.name}
							x1={x(band.start.getTime())}
							x2={x(band.start.getTime())}
							y1={0}
							y2={H}
							stroke="currentColor"
							className="text-border"
							strokeWidth={1}
							strokeDasharray="2 4"
							vectorEffect="non-scaling-stroke"
						/>
					))}

					{[0.25, 0.5, 0.75].map((g) => (
						<line
							key={g}
							x1={0}
							x2={W}
							y1={H * g}
							y2={H * g}
							stroke="currentColor"
							className="text-border"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}

					<polygon points={area} fill="url(#cockpitFitArea)" />
					<polyline
						points={linePoints}
						fill="none"
						stroke="#0ea5e9"
						strokeWidth={2.5}
						vectorEffect="non-scaling-stroke"
					/>
					<line
						x1={x(todayPt.ms)}
						x2={x(todayPt.ms)}
						y1={0}
						y2={H}
						stroke="currentColor"
						className="text-foreground/40"
						strokeWidth={1}
						strokeDasharray="3 3"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>

				{/* Phase name labels along the top. */}
				{phaseBands.map((band) => {
					const mid = (band.start.getTime() + band.end.getTime()) / 2
					return (
						<span
							key={band.name}
							className="text-muted-foreground absolute top-1 -translate-x-1/2 text-[10px] font-medium tracking-wide uppercase"
							style={{ left: leftPct(mid) }}
						>
							{band.name}
						</span>
					)
				})}

				{/* "You are here" — today's fitness. */}
				<span
					className="absolute -translate-x-1/2 -translate-y-1/2"
					style={{ left: leftPct(todayPt.ms), top: topPct(todayPt.ctl) }}
				>
					<span className="block size-3 rounded-full bg-sky-500 ring-4 ring-sky-500/20" />
				</span>

				{/* Race flag at the right edge — where it is, not a projected curve. */}
				{planned ? (
					<span className="absolute top-2 right-0">
						<span className="bg-foreground text-background flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow">
							<Icon name="check" className="size-3" />
							Race
						</span>
					</span>
				) : null}
			</div>

			<div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
				<span>{fmtDate(new Date(domainStart))} · start</span>
				<span className="text-foreground font-medium">
					Today · Fitness {Math.round(todayPt.ctl)}
				</span>
				<span>
					{planContext
						? `${fmtDate(new Date(domainEnd))} · race in ${planContext.daysToEvent}d`
						: `${fmtDate(new Date(domainEnd))} · today`}
				</span>
			</div>
		</div>
	)
}
