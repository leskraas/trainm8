// Analyse zone: the mix — **Discipline Allocation** as a load view (ADR 0031),
// one bar per discipline coloured by the discipline palette, heights the
// accumulated actual TSS over the trailing window. The second discrete consumer
// of the shared Chart Primitive (ADR 0029/0030), confirming it generalises
// beyond the weekly-load bars: tap-to-inspect into the fixed panel below.
//
// Honest gaps: a discipline that trained in the window but has no trustworthy
// TSS draws no bar — a small `n/a` marker and an honest inspect line instead —
// never a fabricated zero (Unavailable Metric, ADR 0008).
import {
	ChartFigure,
	ChartUnavailableMark,
	niceLinearTicks,
	useChartInspect,
	type ChartGeom,
} from '#app/components/chart/chart.tsx'
import { formatPercent, formatTss } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	DISCIPLINE_MIX_WEEKS,
	type DisciplineAllocationSlice,
} from './presenter.ts'
import { disciplineFill, paletteInk } from './shared.tsx'

const BAR_W_FRAC = 0.42 // each bar's width as a fraction of its slot
const WINDOW_LABEL = `Last ${DISCIPLINE_MIX_WEEKS} weeks`

export function DisciplineMix({
	slices,
}: {
	slices: DisciplineAllocationSlice[]
}) {
	const inspect = useChartInspect(slices.length)

	if (slices.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No completed sessions in the last {DISCIPLINE_MIX_WEEKS} weeks.
			</p>
		)
	}

	const rawMax = Math.max(1, ...slices.map((s) => s.tss ?? 0))
	const yMax = niceLinearTicks(rawMax).at(-1)!

	// The accessible equivalent: every value the inspect panel can surface, so AT
	// and keyboard users are never left with only the `role="img"` SVG.
	const dataTable = {
		caption: `Training-load mix by discipline — accumulated actual TSS over the last ${DISCIPLINE_MIX_WEEKS} weeks, with each discipline's share`,
		columns: ['Discipline', 'Sessions', 'Load', 'Share'],
		rows: slices.map((s) => [
			s.disciplineLabel,
			String(s.sessionCount),
			s.tss != null ? formatTss(s.tss) : 'Unavailable',
			s.share != null ? formatPercent(s.share) : '—',
		]),
	}

	return (
		<ChartFigure
			inspect={inspect}
			count={slices.length}
			yMax={yMax}
			ariaLabel={`Training-load mix across ${slices.length} disciplines over the last ${DISCIPLINE_MIX_WEEKS} weeks. Select a discipline to read its load and share.`}
			dataTable={dataTable}
			renderMarks={(geom) => (
				<Marks slices={slices} geom={geom} inspect={inspect} />
			)}
			renderOverlay={(geom) => <Overlay slices={slices} geom={geom} />}
			renderInspect={(index) => (
				<InspectReading slice={index != null ? slices[index] : null} />
			)}
		/>
	)
}

function Marks({
	slices,
	geom,
	inspect,
}: {
	slices: DisciplineAllocationSlice[]
	geom: ChartGeom
	inspect: ReturnType<typeof useChartInspect>
}) {
	const { slotW, slotLeft, slotCenter, scaleY, baselineY, padding } = geom
	const barW = slotW * BAR_W_FRAC
	return (
		<>
			{slices.map((s, i) => {
				const cx = slotCenter(i)
				const active = inspect.isActive(i)
				return (
					<g key={s.discipline} {...inspect.slotProps(i)}>
						{/* Full-height hit target — a comfortable tap area on a phone. */}
						<rect
							x={slotLeft(i)}
							y={padding.top}
							width={slotW}
							height={baselineY - padding.top}
							className={cn('cursor-pointer', active && 'fill-foreground/5')}
							fill={active ? undefined : 'transparent'}
						/>
						{/* The load bar, coloured by the discipline palette; an Unavailable
						    discipline draws the marker (no bar), never a zero (ADR 0008). */}
						{s.tss != null ? (
							<rect
								x={cx - barW / 2}
								y={scaleY(s.tss)}
								width={barW}
								height={baselineY - scaleY(s.tss)}
								rx={2}
								className={disciplineFill(s.discipline)}
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

function Overlay({
	slices,
	geom,
}: {
	slices: DisciplineAllocationSlice[]
	geom: ChartGeom
}) {
	const { slotCenter, baselineY, leftPct, topPct } = geom
	return (
		<>
			{slices.map((s, i) => {
				const left = leftPct(slotCenter(i))
				return (
					<div key={s.discipline}>
						{/* Discipline label under the axis. */}
						<span
							className="text-muted-foreground absolute -translate-x-1/2 text-[10px] whitespace-nowrap"
							style={{ left, top: topPct(baselineY + 8) }}
						>
							{s.disciplineLabel}
						</span>
						{/* The Unavailable marker's `n/a` label (crisp HTML text). */}
						{s.tss == null ? (
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

function InspectReading({
	slice,
}: {
	slice: DisciplineAllocationSlice | null | undefined
}) {
	if (!slice) {
		return (
			<span className="text-muted-foreground">
				{WINDOW_LABEL} · tap a discipline to read its load and share.
			</span>
		)
	}

	const sessions = `${slice.sessionCount} ${
		slice.sessionCount === 1 ? 'session' : 'sessions'
	}`

	// Honest Unavailable reading (ADR 0030): the discipline trained, but none of
	// its sessions carry a trustworthy TSS, so there is no load or share to show.
	if (slice.tss == null) {
		return (
			<div>
				<span className={cn('font-medium', paletteInk(slice.discipline))}>
					{slice.disciplineLabel}
				</span>{' '}
				<span className="text-muted-foreground">
					Load Unavailable — {sessions}, no trustworthy TSS to total.
				</span>
			</div>
		)
	}

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
			<span className={cn('font-medium', paletteInk(slice.discipline))}>
				{slice.disciplineLabel}
			</span>
			<span className="text-foreground">{formatTss(slice.tss)}</span>
			{slice.share != null ? (
				<span className="text-muted-foreground">
					{formatPercent(slice.share)} of load
				</span>
			) : null}
			<span className="text-muted-foreground text-xs">{sessions}</span>
		</div>
	)
}
