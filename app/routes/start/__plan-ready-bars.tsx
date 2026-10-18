import { ChartFigure, niceLinearTicks } from '#app/components/chart/chart.tsx'
import { type PlanReady } from '#app/utils/first-run/plan-ready.server.ts'
import { PLAN_READY_LABELS, SEASON_PANE_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'

const L = PLAN_READY_LABELS

const WIDTH = 300
const HEIGHT = 112
/** Room above the tallest bar for its figure, and below for the week numbers. */
const PADDING = { top: 16, right: 2, bottom: 18, left: 2 }
/** A bar's share of its slot: the rest is the gap between bars. */
const BAR_SHARE = 0.78
/** The rounded data end (dataviz: 4px), square at the baseline. */
const RADIUS = 3

/** The round as laid is solid; the rounds it would earn are a lighter step. */
const LAID_FILL = 'fill-primary'
const PROJECTED_FILL = 'fill-primary/35'
const LAID_SWATCH = 'bg-primary'
const PROJECTED_SWATCH = 'bg-primary/35'

/** A bar from the baseline up, its top corners rounded. */
function barPath(x: number, y: number, width: number, bottom: number): string {
	const r = Math.min(RADIUS, width / 2, Math.max(0, bottom - y))
	return [
		`M${x},${bottom}`,
		`V${y + r}`,
		`Q${x},${y} ${x + r},${y}`,
		`H${x + width - r}`,
		`Q${x + width},${y} ${x + width},${y + r}`,
		`V${bottom}`,
		'Z',
	].join(' ')
}

/**
 * _Planen er klar_'s twelve weeks of hours as bars (#584, the prototype's
 * ramp): one bar a week from a shared baseline, the round as laid solid and
 * the rounds a round done to plan would earn a lighter step of the same hue,
 * named in a legend under the chart so the difference is never colour alone.
 * The first week and the highest carry their hours on the cap; every week is
 * in the visually-hidden table (ADR 0030 rule 2). A static chart on the
 * primitive: nothing to inspect that the table and the legend do not say.
 */
export function PlanReadyBars({
	curve,
	figure,
}: {
	curve: PlanReady['curve']
	figure: (hours: number) => string
}) {
	const { points } = curve
	if (points.length === 0) return null
	const ticks = niceLinearTicks(curve.max * 1.1)
	const yMax = ticks[ticks.length - 1] ?? 1
	const projectedFrom =
		curve.projectedFrom != null && curve.projectedFrom < points.length
			? curve.projectedFrom
			: null
	const isProjected = (index: number) =>
		projectedFrom != null && index >= projectedFrom
	const peak = points.reduce(
		(best, point, index) =>
			(point.target ?? 0) > (points[best]?.target ?? 0) ? index : best,
		0,
	)
	const labelled = new Set([0, peak])

	return (
		<div className="flex flex-col gap-2" data-plan-ready-bars>
			<ChartFigure
				ariaLabel={curve.ariaLabel}
				count={points.length}
				yMax={yMax}
				width={WIDTH}
				height={HEIGHT}
				padding={PADDING}
				plotHeightClass="h-28"
				gridlines={false}
				renderMarks={(geom) => (
					<>
						<line
							x1={geom.padding.left}
							x2={geom.width - geom.padding.right}
							y1={geom.baselineY + 0.5}
							y2={geom.baselineY + 0.5}
							stroke="currentColor"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
							className="text-border"
						/>
						{points.map((point, index) => {
							// A week with no hours draws no bar (ADR 0030 rule 1).
							if (point.target == null || point.target <= 0) return null
							const width = geom.slotW * BAR_SHARE
							return (
								<path
									key={point.key}
									d={barPath(
										geom.slotCenter(index) - width / 2,
										geom.scaleY(point.target),
										width,
										geom.baselineY,
									)}
									className={isProjected(index) ? PROJECTED_FILL : LAID_FILL}
									data-plan-ready-bar={
										isProjected(index) ? 'projected' : 'laid'
									}
								/>
							)
						})}
					</>
				)}
				renderOverlay={(geom) => (
					// In-plot figures sit below the type scale on purpose, as the
					// Season Pane's do: they live in the bands above and below the
					// bars, and every figure is also in the table.
					<>
						{points.map((point, index) =>
							labelled.has(index) && point.target != null ? (
								<span
									key={`value-${point.key}`}
									aria-hidden
									className="text-foreground absolute -translate-x-1/2 -translate-y-full pb-0.5 text-[10px]/[12px] font-semibold tabular-nums"
									style={{
										left: geom.leftPct(geom.slotCenter(index)),
										top: geom.topPct(geom.scaleY(point.target)),
									}}
								>
									{figure(point.target)}
								</span>
							) : null,
						)}
						{points.map((point, index) =>
							index % 4 === 0 ? (
								<span
									key={`week-${point.key}`}
									aria-hidden
									className="text-muted-foreground absolute bottom-0 -translate-x-1/2 text-[10px]/[12px] tabular-nums"
									style={{ left: geom.leftPct(geom.slotCenter(index)) }}
								>
									{point.weekNumber}
								</span>
							) : null,
						)}
					</>
				)}
				dataTable={{
					caption: curve.caption,
					columns: [
						SEASON_PANE_LABELS.week,
						`${curve.trackName} (${curve.unit})`,
					],
					rows: points.map((point, index) => [
						String(point.weekNumber),
						point.target == null
							? '–'
							: isProjected(index)
								? `${figure(point.target)} (${curve.projectedLabel})`
								: figure(point.target),
					]),
				}}
			/>
			{projectedFrom != null ? (
				<p
					aria-hidden
					className="text-footnote text-muted-foreground flex flex-wrap gap-x-4 gap-y-1"
					data-plan-ready-legend
				>
					<span className="inline-flex items-center gap-1.5">
						<span className={cn('size-2.5 rounded-[3px]', LAID_SWATCH)} />
						{L.legendLaid}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<span className={cn('size-2.5 rounded-[3px]', PROJECTED_SWATCH)} />
						{L.legendProjected}
					</span>
				</p>
			) : null}
		</div>
	)
}
