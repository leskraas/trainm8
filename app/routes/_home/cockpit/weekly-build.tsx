// Analyse zone: the build — trailing weekly load, planned (ghost outline) vs
// actual (filled bar, coloured by the week's Adherence Band), the current week
// marked "Now". The reference interactive chart (ADR 0029/0030): hand-rolled on
// the shared Chart Primitive, tap-to-inspect into a fixed panel below.
//
// Honest window: only weeks up to the current one, because future planned
// weekly load isn't modelled yet. A week with no trustworthy actual draws no
// bar — a small `n/a` marker and an honest inspect line instead — never a
// fabricated zero bar (Unavailable Metric, ADR 0008).
import {
	ChartFigure,
	ChartUnavailableMark,
	niceLinearTicks,
	useChartInspect,
	type ChartGeom,
} from '#app/components/chart/chart.tsx'
import { formatTss } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import { type WeeklyBuildBar } from './presenter.ts'
import { BAND } from './shared.tsx'

const BAR_W_FRAC = 0.26 // each bar's width as a fraction of its slot

export function WeeklyBuild({ bars }: { bars: WeeklyBuildBar[] }) {
	const inspect = useChartInspect(bars.length)

	if (bars.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">Not enough history yet.</p>
		)
	}

	const rawMax = Math.max(
		1,
		...bars.flatMap((b) => [b.plannedTss ?? 0, b.actualTss ?? 0]),
	)
	const yMax = niceLinearTicks(rawMax).at(-1)!

	// The accessible equivalent: every value the inspect panel can surface, so
	// AT and keyboard users are never left with only the `role="img"` SVG.
	const dataTable = {
		caption:
			'Weekly training load — planned versus actual TSS per week, with Plan Adherence',
		columns: ['Week', 'Planned', 'Actual', 'Adherence'],
		rows: bars.map((b) => [
			b.isCurrent ? `${b.weekLabel} (this week)` : b.weekLabel,
			b.plannedTss != null ? formatTss(b.plannedTss) : '—',
			b.actualTss != null ? formatTss(b.actualTss) : 'Unavailable',
			b.band ? b.band.label : '—',
		]),
	}

	return (
		<div>
			<ChartFigure
				inspect={inspect}
				count={bars.length}
				yMax={yMax}
				ariaLabel={`Weekly training load: planned versus actual TSS across ${bars.length} weeks. Select a week to read its values.`}
				dataTable={dataTable}
				renderMarks={(geom) => (
					<Marks bars={bars} geom={geom} inspect={inspect} />
				)}
				renderOverlay={(geom) => <Overlay bars={bars} geom={geom} />}
				renderInspect={(index) => (
					<InspectReading bar={index != null ? bars[index] : null} />
				)}
			/>
			<Legend />
		</div>
	)
}

function Marks({
	bars,
	geom,
	inspect,
}: {
	bars: WeeklyBuildBar[]
	geom: ChartGeom
	inspect: ReturnType<typeof useChartInspect>
}) {
	const { slotW, slotLeft, slotCenter, scaleY, baselineY, padding } = geom
	const barW = slotW * BAR_W_FRAC
	return (
		<>
			{bars.map((b, i) => {
				const cx = slotCenter(i)
				const active = inspect.isActive(i)
				const bandFill = b.band
					? BAND[b.band.tone].fill
					: 'fill-muted-foreground/50'
				return (
					<g key={b.weekStart.toISOString()} {...inspect.slotProps(i)}>
						{/* Full-height hit target — a comfortable tap area on a phone. */}
						<rect
							x={slotLeft(i)}
							y={padding.top}
							width={slotW}
							height={baselineY - padding.top}
							className={cn('cursor-pointer', active && 'fill-foreground/5')}
							fill={active ? undefined : 'transparent'}
						/>
						{/* Planned — a ghost outline behind actual; shows even when the
						    actual is Unavailable, so the week's target is never lost. */}
						{b.plannedTss != null ? (
							<rect
								x={cx - barW}
								y={scaleY(b.plannedTss)}
								width={barW}
								height={baselineY - scaleY(b.plannedTss)}
								rx={2}
								className="fill-muted-foreground/15 stroke-muted-foreground/40"
								strokeWidth={1}
								vectorEffect="non-scaling-stroke"
							/>
						) : null}
						{/* Actual — filled, coloured by Adherence Band; an Unavailable
						    week draws the marker (no bar), never a zero (ADR 0008). */}
						{b.actualTss != null ? (
							<rect
								x={cx + barW * 0.08}
								y={scaleY(b.actualTss)}
								width={barW}
								height={baselineY - scaleY(b.actualTss)}
								rx={2}
								className={bandFill}
							/>
						) : (
							<ChartUnavailableMark
								cx={cx}
								baselineY={baselineY}
								width={barW}
							/>
						)}
					</g>
				)
			})}
		</>
	)
}

function Overlay({ bars, geom }: { bars: WeeklyBuildBar[]; geom: ChartGeom }) {
	const { slotCenter, baselineY, padding, leftPct, topPct } = geom
	return (
		<>
			{bars.map((b, i) => {
				const left = leftPct(slotCenter(i))
				return (
					<div key={b.weekStart.toISOString()}>
						{/* Week label under the axis. */}
						<span
							className={cn(
								'absolute -translate-x-1/2 text-[10px] whitespace-nowrap tabular-nums',
								b.isCurrent
									? 'text-foreground font-semibold'
									: 'text-muted-foreground',
							)}
							style={{ left, top: topPct(baselineY + 8) }}
						>
							{b.weekLabel}
						</span>
						{/* "Now" above the current week. */}
						{b.isCurrent ? (
							<span
								className="text-primary absolute -translate-x-1/2 -translate-y-full text-[9px] font-semibold tracking-wide uppercase"
								style={{ left, top: topPct(padding.top - 2) }}
							>
								Now
							</span>
						) : null}
						{/* The Unavailable marker's `n/a` label (crisp HTML text). */}
						{b.actualTss == null ? (
							<span
								className="text-muted-foreground absolute -translate-x-1/2 -translate-y-full text-[9px]"
								style={{ left, top: topPct(baselineY - 8) }}
							>
								n/a
							</span>
						) : null}
					</div>
				)
			})}
		</>
	)
}

function InspectReading({ bar }: { bar: WeeklyBuildBar | null | undefined }) {
	if (!bar) {
		return (
			<span className="text-muted-foreground">
				Tap a week to inspect its planned-vs-actual load.
			</span>
		)
	}

	const planned = bar.plannedTss != null ? formatTss(bar.plannedTss) : null

	// Honest Unavailable reading (ADR 0030): the actual is missing, but the
	// planned target — the companion value we *do* know — still shows.
	if (bar.actualTss == null) {
		return (
			<div>
				<WeekHeading bar={bar} />{' '}
				<span className="text-muted-foreground">
					{planned
						? `Actual load Unavailable — planned ${planned}, no trustworthy recording to compare.`
						: 'No planned or recorded load this week.'}
				</span>
			</div>
		)
	}

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
			<WeekHeading bar={bar} />
			<span className="text-muted-foreground">Planned {planned ?? '—'}</span>
			<span className={bar.band ? BAND[bar.band.tone].ink : 'text-foreground'}>
				Actual {formatTss(bar.actualTss)}
			</span>
			{bar.band ? (
				<span
					className={cn(
						'rounded-full px-2 py-0.5 text-xs font-medium',
						BAND[bar.band.tone].ink,
						BAND[bar.band.tone].wash,
					)}
				>
					{bar.band.label}
				</span>
			) : (
				<span className="text-muted-foreground text-xs">
					no plan to compare
				</span>
			)}
		</div>
	)
}

function WeekHeading({ bar }: { bar: WeeklyBuildBar }) {
	return (
		<span className="font-medium">
			{bar.weekLabel}
			{bar.isCurrent ? ' · Now' : ''}
		</span>
	)
}

// The key: the planned ghost, then the three Adherence Bands the actual bar is
// coloured by (the palette bridged from `shared.tsx`).
function Legend() {
	return (
		<div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
			<span className="inline-flex items-center gap-1.5">
				<span className="border-muted-foreground/40 size-2 rounded-[2px] border border-dashed" />
				Planned
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className={cn('size-2 rounded-full', BAND.under.dot)} />
				Under
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className={cn('size-2 rounded-full', BAND['on-target'].dot)} />
				On target
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className={cn('size-2 rounded-full', BAND.over.dot)} />
				Over
			</span>
		</div>
	)
}
