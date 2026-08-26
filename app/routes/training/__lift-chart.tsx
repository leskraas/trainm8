/**
 * **The lift over time**, as bars, on the shared Chart Primitive.
 *
 * Every decision the chart makes — the height, which bar is the latest, which
 * session the program cut on, which bars carry a tick, what the picture is
 * called and what the table says — is the presenter's and arrives on
 * {@link ChartBar}. This module picks a class per flag and lays out geometry.
 *
 * It is **static** (ADR 0063 §3, ADR 0066 §1): the design specifies no tap, no
 * tooltip and no motion, so it takes ADR 0030's two rules that are about honesty
 * and access and none of rule 3's interaction machinery — no `useChartInspect`,
 * no focusable surface, no panel to dismiss. What it does take from the primitive
 * is everything that is expensive either way (ADR 0029): the figure and its
 * geometry, the Unavailable marker, and the visually-hidden data table.
 *
 * A session with **no honest kilo draws no bar** and carries an explicit `n/a`
 * at its slot (ADR 0030 rule 1): never a zero bar, and never a gap that reads
 * like a mis-tap.
 */
import {
	ChartFigure,
	ChartUnavailableMark,
	type ChartDataTableModel,
	type ChartGeom,
} from '#app/components/chart/chart.tsx'
import { type ChartBar } from './__exercise-history-presenter.ts'

/**
 * The gap between bars, in user units — the handoff's 6 px at 390×844, where the
 * plot is 318 px wide. A **fixed gap**, not a fixed fraction, because that is
 * what the flexbox it replaces did and what the capture shows: twelve sessions
 * are fat bars with a hairline between them, and twenty-five are thin ones.
 */
const BAR_GAP = 13.6

/** Below this the gap gives way, so a long history thins rather than vanishes. */
const MIN_BAR_W_FRAC = 0.35

const barWidth = (slotW: number) =>
	Math.max(slotW * MIN_BAR_W_FRAC, slotW - BAR_GAP)

/**
 * The viewBox and the rendered box. The plot lands at ~134 px tall at 390×844,
 * which is the handoff's bar area, with the tick row in the bottom padding.
 */
const VIEW_W = 720
const VIEW_H = 240
const PADDING = { top: 2, right: 0, bottom: 26, left: 0 }

/**
 * The handoff's 6 px bar radius, in user units. Under
 * `preserveAspectRatio="none"` the two axes scale by different factors (≈0.44
 * across and ≈0.63 down at 390×844), so one `rx` would draw a bar with elliptical
 * corners; the pair lands square.
 */
const BAR_RX = 13.5
const BAR_RY = 9.5

export function LiftChart({
	bars,
	label,
	table,
}: {
	bars: ChartBar[]
	/** The `role="img"` name, or null where there is nothing to draw. */
	label: string | null
	/** The accessible equivalent, or null alongside the name. */
	table: ChartDataTableModel | null
}) {
	if (bars.length === 0 || !label || !table) return null
	return (
		<ChartFigure
			ariaLabel={label}
			count={bars.length}
			// The value axis is a *window* on the range in view, not a domain from
			// zero — a squat that moved 100 → 105 kg is a flat line from zero, and
			// the question the screen answers is "is this lift moving". The presenter
			// has already resolved each bar to its 0–1 of that window, so the domain
			// here is that fraction, and there are no gridlines because a line
			// halfway up a floating window names no weight.
			yMax={1}
			gridlines={false}
			height={VIEW_H}
			width={VIEW_W}
			padding={PADDING}
			plotHeightClass="h-38"
			dataTable={table}
			renderMarks={(geom) => <Bars bars={bars} geom={geom} />}
			renderOverlay={(geom) => <Overlay bars={bars} geom={geom} />}
		/>
	)
}

function Bars({ bars, geom }: { bars: ChartBar[]; geom: ChartGeom }) {
	const { slotW, slotCenter, scaleY, baselineY } = geom
	const barW = barWidth(slotW)
	return (
		<>
			{bars.map((bar, i) => {
				const cx = slotCenter(i)
				// No kilo, no bar — the marker instead, never a zero (ADR 0030 rule 1).
				if (bar.heightFraction == null) {
					return (
						<ChartUnavailableMark
							key={bar.sessionId}
							cx={cx}
							baselineY={baselineY}
							width={barW}
						/>
					)
				}
				// The bar is exactly as tall as its value. **No minimum height**: a
				// floor would draw two different readings at one height, and at the
				// sizes where it bites it draws them at the height of the Unavailable
				// marker, so a real value would be indistinguishable from a missing one.
				const y = scaleY(bar.heightFraction)
				return (
					<rect
						key={bar.sessionId}
						// Marks a bar as a bar, so a test can tell one from the
						// Unavailable stub beside it without reading a fill class.
						data-lift-bar=""
						x={cx - barW / 2}
						y={y}
						width={barW}
						height={baselineY - y}
						rx={BAR_RX}
						ry={BAR_RY}
						className={barTone(bar)}
					/>
				)
			})}
		</>
	)
}

/** The tick labels and the `n/a` markers, as crisp HTML over the geometry. */
function Overlay({ bars, geom }: { bars: ChartBar[]; geom: ChartGeom }) {
	const { slotCenter, baselineY, leftPct, topPct } = geom
	return (
		<>
			{bars.map((bar, i) => {
				const left = leftPct(slotCenter(i))
				return (
					<div key={bar.sessionId}>
						{bar.tickLabel ? (
							<span
								className="text-muted-foreground text-body-2xs absolute -translate-x-1/2 font-semibold"
								style={{ left, top: topPct(baselineY + 6) }}
							>
								{bar.tickLabel}
							</span>
						) : null}
						{bar.heightFraction == null ? (
							<span
								className="text-muted-foreground text-body-2xs absolute -translate-x-1/2 -translate-y-full"
								style={{ left, top: topPct(baselineY - 6) }}
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

/**
 * **The Stall Cut wins over the latest.** A bar can be both, and on the day the
 * program cuts a weight the cut is what the athlete needs to see; drawing it in
 * primary because it happens to be today would hide the one event the screen
 * exists to explain. The data table's `Marked` column reads in the same
 * precedence, so the picture and the words cannot disagree.
 */
function barTone(bar: ChartBar): string {
	if (bar.stallCut) return 'fill-destructive'
	return bar.latest ? 'fill-primary' : 'fill-foreground/15'
}
