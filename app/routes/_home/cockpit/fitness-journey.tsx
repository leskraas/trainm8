// Act zone: the progression curve — real CTL ("fitness") history from the load
// snapshots (solid), the plan's phases tinted behind it, "you are here" today,
// and a dashed Fitness Projection forward to race day when an active plan lets
// us replay its weekly-load pattern (#132). The projection is derived and
// display-only; without a plan the curve simply ends at today, and when the CTL
// anchor can't be trusted it degrades to an explicit Unavailable note rather
// than a guessed curve (Unavailable Metric principle, ADR 0008).
//
// The first *continuous-series* consumer of the shared Chart Primitive (#318,
// ADR 0029/0030): it reuses `ChartFigure` + `useChartInspect` and drives the
// controller's `trackProps` (pointer scrub / desktop hover) and keyboard model
// to read the fitness on any day into the fixed inspect panel below — the same
// tap-to-inspect contract the weekly-load bars use, in the line/area regime the
// controller was built for from day one.
import {
	ChartFigure,
	niceLinearTicks,
	useChartInspect,
	type ChartDataTableModel,
	type ChartGeom,
} from '#app/components/chart/chart.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { formatDayMonth, formatLoad } from '#app/utils/format.ts'
import { type LoadSnapshot } from '#app/utils/load/types.ts'
import {
	type FitnessProjection,
	type PhaseBand,
	type PlanContext,
} from './presenter.ts'

// Axis instants derive from Load Snapshot day strings (YYYY-MM-DD in the
// Athlete Timezone, parsed as UTC midnight) and day-anchored Event dates, so
// they format in UTC — anything else would shift the labelled day (#172).
const fmtAxisDate = (ms: number) => formatDayMonth(new Date(ms), 'UTC')

// sky-500: the CTL "fitness" series identity (matches the "you are here" dot).
// Not an Adherence Band colour — the band palette in `shared.tsx` keys the
// weekly-load bars; this line has its own hue, so it stays local.
const SERIES = '#0ea5e9'

/** One inspectable point on the curve — a measured day, or a projected one. */
type Point = { ms: number; ctl: number; projected: boolean }

export function FitnessJourney({
	snapshots,
	phaseBands,
	planContext,
	projection,
}: {
	snapshots: LoadSnapshot[]
	phaseBands: PhaseBand[]
	planContext: PlanContext | null
	projection: FitnessProjection | null
}) {
	const measured = snapshots
		.map((s) => ({ ms: Date.parse(s.date), ctl: s.ctl }))
		.filter((p) => Number.isFinite(p.ms))
		.sort((a, b) => a.ms - b.ms)

	// The controller needs a stable mark count; call the hook before any early
	// return so hook order never changes across renders. A curve needs ≥2 points.
	const enoughHistory = measured.length >= 2

	const todayMs = enoughHistory ? measured[measured.length - 1]!.ms : 0
	const planned = phaseBands.length > 0
	const domainStart = planned
		? phaseBands[0]!.start.getTime()
		: (measured[0]?.ms ?? 0)
	const domainEnd = planned ? phaseBands.at(-1)!.end.getTime() : todayMs
	const span = Math.max(domainEnd - domainStart, 1)

	const vis = measured.filter((p) => p.ms >= domainStart && p.ms <= todayMs)
	const series = vis.length >= 2 ? vis : measured

	// The dashed projection (when present) opens at today's measured point, so it
	// joins the solid line seamlessly. Clamp to the domain so it can't overrun the
	// race edge, and fold its CTLs into the y-scale so a ramp never clips.
	const projectionDraw =
		projection?.status === 'projected'
			? projection.points
					.map((p) => ({
						ms: Math.min(Math.max(Date.parse(p.date), domainStart), domainEnd),
						ctl: p.ctl,
					}))
					.filter((p) => Number.isFinite(p.ms))
			: []
	// Only strictly-future projected points are separately inspectable — the
	// first shares today's measured point (the anchor), so listing it would
	// double up a mark at the same x.
	const projectedFuture = projectionDraw.filter((p) => p.ms > todayMs)
	const hasProjection = projectionDraw.length >= 2

	// One index space across measured-then-projected days — monotonic in time, so
	// keyboard arrows scrub the whole curve and the pointer maps cleanly to it.
	const points: Point[] = [
		...series.map((p) => ({ ...p, projected: false })),
		...projectedFuture.map((p) => ({ ...p, projected: true })),
	]

	const inspect = useChartInspect(points.length)

	if (!enoughHistory) {
		return (
			<p className="text-muted-foreground py-8 text-center text-sm">
				Your fitness curve will appear here as training history builds.
			</p>
		)
	}

	const rawMax = Math.max(1, ...points.map((p) => p.ctl))
	const yMax = niceLinearTicks(rawMax).at(-1)!

	const phaseAt = (ms: number): string | null =>
		phaseBands.find((b) => ms >= b.start.getTime() && ms <= b.end.getTime())
			?.name ?? null

	const ariaLabel = hasProjection
		? 'Fitness (CTL) history with a dashed projection to race day. Move across the curve to read the fitness on any day.'
		: planned
			? 'Fitness (CTL) history with plan phases. Move across the curve to read the fitness on any day.'
			: 'Fitness (CTL) history over recent weeks. Move across the curve to read the fitness on any day.'

	// The accessible equivalent (ADR 0030): every day's fitness the inspect panel
	// can surface, plus — in the caption — the honest projection status, so AT and
	// keyboard users learn a withheld projection, not only sighted ones.
	const projectionNote =
		projection?.status === 'projected'
			? ' Includes the dashed projection forward to race day.'
			: projection?.status === 'unavailable'
				? ` Race-day projection unavailable: ${projection.reason}.`
				: ''
	const dataTable: ChartDataTableModel = {
		caption: `Fitness (CTL) by day, oldest to most recent.${projectionNote}`,
		columns: ['Day', 'Fitness (CTL)', 'Phase'],
		rows: points.map((p) => [
			p.projected ? `${fmtAxisDate(p.ms)} (projected)` : fmtAxisDate(p.ms),
			formatLoad(p.ctl),
			phaseAt(p.ms) ?? (p.projected ? 'Projection' : '—'),
		]),
	}

	return (
		<div>
			<ChartFigure
				inspect={inspect}
				count={points.length}
				yMax={yMax}
				ariaLabel={ariaLabel}
				dataTable={dataTable}
				renderMarks={(geom) => (
					<Marks
						geom={geom}
						domainStart={domainStart}
						span={span}
						series={series}
						projectionDraw={projectionDraw}
						hasProjection={hasProjection}
						phaseBands={phaseBands}
						todayMs={todayMs}
						points={points}
						inspectedIndex={inspect.index}
						indexAtFraction={(frac) =>
							nearestIndex(points, domainStart + frac * span)
						}
						inspect={inspect}
					/>
				)}
				renderOverlay={(geom) => (
					<Overlay
						geom={geom}
						domainStart={domainStart}
						span={span}
						phaseBands={phaseBands}
						planned={planned}
						todayPoint={series.at(-1)!}
						projectionEnd={projectionDraw.at(-1) ?? null}
						points={points}
						inspectedIndex={inspect.index}
					/>
				)}
				renderInspect={(index) => (
					<InspectReading
						point={index != null ? points[index] : null}
						phaseName={index != null ? phaseAt(points[index]!.ms) : null}
						projection={projection}
					/>
				)}
			/>

			<div className="text-muted-foreground mt-3 flex items-center justify-between text-xs">
				<span>{fmtAxisDate(domainStart)} · start</span>
				<span className="text-foreground font-medium">
					Today · Fitness {formatLoad(series.at(-1)!.ctl)}
				</span>
				<span>
					{planContext
						? `${fmtAxisDate(domainEnd)} · race in ${planContext.daysToEvent}d`
						: `${fmtAxisDate(domainEnd)} · today`}
				</span>
			</div>

			{/* Honest about a projection we can't draw yet (Unavailable Metric): the
			    measured history still draws, but the forward curve is withheld with
			    its reason — never a guessed ramp. Also carried in the inspect panel
			    and the data-table caption above. */}
			{projection?.status === 'unavailable' ? (
				<p className="text-muted-foreground mt-1 text-center text-[11px]">
					Race-day projection unavailable · {projection.reason}
				</p>
			) : null}
		</div>
	)
}

function nearestIndex(points: Point[], targetMs: number): number {
	let best = 0
	let bestDist = Infinity
	for (let i = 0; i < points.length; i++) {
		const d = Math.abs(points[i]!.ms - targetMs)
		if (d < bestDist) {
			bestDist = d
			best = i
		}
	}
	return best
}

function Marks({
	geom,
	domainStart,
	span,
	series,
	projectionDraw,
	hasProjection,
	phaseBands,
	todayMs,
	points,
	inspectedIndex,
	indexAtFraction,
	inspect,
}: {
	geom: ChartGeom
	domainStart: number
	span: number
	series: { ms: number; ctl: number }[]
	projectionDraw: { ms: number; ctl: number }[]
	hasProjection: boolean
	phaseBands: PhaseBand[]
	todayMs: number
	points: Point[]
	inspectedIndex: number | null
	indexAtFraction: (frac: number) => number
	inspect: ReturnType<typeof useChartInspect>
}) {
	const { padding, plotW, baselineY, scaleY } = geom
	const x = (ms: number) => padding.left + ((ms - domainStart) / span) * plotW
	const y = (ctl: number) => scaleY(ctl)

	const linePoints = series.map((p) => `${x(p.ms)},${y(p.ctl)}`).join(' ')
	const area = `${x(series[0]!.ms)},${baselineY} ${linePoints} ${x(series.at(-1)!.ms)},${baselineY}`
	const projLine = hasProjection
		? projectionDraw.map((p) => `${x(p.ms)},${y(p.ctl)}`).join(' ')
		: ''
	const currentPhase = phaseBands.find((b) => b.isCurrent)
	const inspected = inspectedIndex != null ? points[inspectedIndex] : null

	return (
		<>
			<defs>
				<linearGradient id="cockpitFitArea" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={SERIES} stopOpacity="0.28" />
					<stop offset="100%" stopColor={SERIES} stopOpacity="0.02" />
				</linearGradient>
			</defs>

			{/* The current phase tinted behind the curve. */}
			{currentPhase ? (
				<rect
					x={x(currentPhase.start.getTime())}
					y={padding.top}
					width={x(currentPhase.end.getTime()) - x(currentPhase.start.getTime())}
					height={baselineY - padding.top}
					className="fill-primary"
					opacity={0.05}
				/>
			) : null}

			{/* Phase dividers (every band after the first). */}
			{phaseBands.slice(1).map((band) => (
				<line
					key={band.name}
					x1={x(band.start.getTime())}
					x2={x(band.start.getTime())}
					y1={padding.top}
					y2={baselineY}
					stroke="currentColor"
					className="text-border"
					strokeWidth={1}
					strokeDasharray="2 4"
					vectorEffect="non-scaling-stroke"
				/>
			))}

			<polygon points={area} fill="url(#cockpitFitArea)" />
			<polyline
				points={linePoints}
				fill="none"
				stroke={SERIES}
				strokeWidth={2.5}
				vectorEffect="non-scaling-stroke"
			/>
			{projLine ? (
				<polyline
					points={projLine}
					fill="none"
					stroke={SERIES}
					strokeWidth={2}
					strokeDasharray="5 4"
					opacity={0.7}
					vectorEffect="non-scaling-stroke"
				/>
			) : null}

			{/* "You are here" — a dashed vertical at today. */}
			<line
				x1={x(todayMs)}
				x2={x(todayMs)}
				y1={padding.top}
				y2={baselineY}
				stroke="currentColor"
				className="text-foreground/40"
				strokeWidth={1}
				strokeDasharray="3 3"
				vectorEffect="non-scaling-stroke"
			/>

			{/* The inspection crosshair — the inspected day's vertical. The dot rides
			    as a crisp HTML overlay (a circle would distort under the non-uniform
			    viewBox), so this is the line only. */}
			{inspected ? (
				<line
					x1={x(inspected.ms)}
					x2={x(inspected.ms)}
					y1={padding.top}
					y2={baselineY}
					stroke="currentColor"
					className="text-foreground/60"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			) : null}

			{/* The continuous pointer track (ADR 0029): one full-plot hit area that
			    maps the pointer's x to the nearest day. Desktop hovers to read; touch
			    drags to scrub. Transparent, on top, so it catches every pointer. */}
			<rect
				x={padding.left}
				y={padding.top}
				width={plotW}
				height={baselineY - padding.top}
				fill="transparent"
				className="cursor-crosshair"
				{...inspect.trackProps(indexAtFraction)}
			/>
		</>
	)
}

function Overlay({
	geom,
	domainStart,
	span,
	phaseBands,
	planned,
	todayPoint,
	projectionEnd,
	points,
	inspectedIndex,
}: {
	geom: ChartGeom
	domainStart: number
	span: number
	phaseBands: PhaseBand[]
	planned: boolean
	todayPoint: { ms: number; ctl: number }
	projectionEnd: { ms: number; ctl: number } | null
	points: Point[]
	inspectedIndex: number | null
}) {
	const { padding, plotW, scaleY, leftPct, topPct } = geom
	const svgX = (ms: number) => padding.left + ((ms - domainStart) / span) * plotW
	const left = (ms: number) => leftPct(svgX(ms))
	const top = (ctl: number) => topPct(scaleY(ctl))
	const inspected = inspectedIndex != null ? points[inspectedIndex] : null

	return (
		<>
			{/* Phase name labels along the top. */}
			{phaseBands.map((band) => {
				const mid = (band.start.getTime() + band.end.getTime()) / 2
				return (
					<span
						key={band.name}
						className="text-muted-foreground absolute -translate-x-1/2 text-[10px] font-medium tracking-wide uppercase"
						style={{ left: left(mid), top: topPct(padding.top - 12) }}
					>
						{band.name}
					</span>
				)
			})}

			{/* "You are here" — today's fitness. */}
			<span
				className="absolute -translate-x-1/2 -translate-y-1/2"
				style={{ left: left(todayPoint.ms), top: top(todayPoint.ctl) }}
			>
				<span className="block size-3 rounded-full bg-sky-500 ring-4 ring-sky-500/20" />
			</span>

			{/* The inspected day's dot — sits over the crosshair line. Hollow when the
			    day is a projected one, so a read of the future never looks measured. */}
			{inspected ? (
				<span
					className="absolute -translate-x-1/2 -translate-y-1/2"
					style={{ left: left(inspected.ms), top: top(inspected.ctl) }}
				>
					<span
						className={
							inspected.projected
								? 'border-foreground bg-background block size-2.5 rounded-full border-2'
								: 'bg-foreground ring-foreground/20 block size-2.5 rounded-full ring-4'
						}
					/>
				</span>
			) : null}

			{/* Race flag at the right edge. When a projection reaches it, the flag
			    rides at the projected fitness; otherwise it pins to the top. */}
			{planned ? (
				<span
					className={
						projectionEnd
							? 'absolute right-0 -translate-y-1/2'
							: 'absolute top-2 right-0'
					}
					style={projectionEnd ? { top: top(projectionEnd.ctl) } : undefined}
				>
					<span className="bg-foreground text-background flex -translate-x-1 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow">
						<Icon name="check" className="size-3" />
						Race
					</span>
				</span>
			) : null}
		</>
	)
}

function InspectReading({
	point,
	phaseName,
	projection,
}: {
	point: Point | null | undefined
	phaseName: string | null
	projection: FitnessProjection | null
}) {
	if (!point) {
		return (
			<span className="text-muted-foreground">
				Move across the curve to read your fitness on any day.
				{projection?.status === 'unavailable'
					? ` Race-day projection unavailable — ${projection.reason}.`
					: ''}
			</span>
		)
	}

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
			<span className="font-medium">
				{fmtAxisDate(point.ms)}
				{point.projected ? ' · projected' : ''}
			</span>
			<span className="text-sky-600 dark:text-sky-400">
				Fitness {formatLoad(point.ctl)}
			</span>
			{phaseName ? (
				<span className="text-muted-foreground text-xs tracking-wide uppercase">
					{phaseName}
				</span>
			) : null}
			{point.projected ? (
				<span className="text-muted-foreground text-xs">
					projected from your plan
				</span>
			) : null}
		</div>
	)
}
