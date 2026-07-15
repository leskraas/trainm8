/**
 * The Chart Primitive (ADR 0029, ADR 0030) — the shared, SSR-native,
 * dependency-free foundation every interactive chart in the app is built on.
 * There is no charting library: Recharts and the shadcn `chart` component were
 * measured and rejected (map #309) because the app's defining behaviours — the
 * Unavailable Metric marker, tap-to-inspect *and* dismiss, and the accessible
 * data-table equivalent — are hand-built either way, while a library trades
 * away SSR-native first paint and adds bundle weight.
 *
 * This module owns the parts every chart shares, so an individual chart only
 * supplies data + marks:
 *
 *   - `niceLinearTicks`     — the value scale's gridline stops.
 *   - `useChartInspect`     — the Chart Inspect controller: index-based
 *                             selection wired for pointer (tap on touch, hover
 *                             on desktop) and keyboard, built for **both**
 *                             discrete marks (bars) and a continuous series
 *                             (line/area) from day one so the later Telemetry
 *                             Overlay doesn't inherit a bar-only contract.
 *   - `ChartFigure`         — the `<figure>` shell: the geometry `<svg>`
 *                             (`role="img"`, focusable, keyboard-driven),
 *                             gridlines, the fixed Chart Inspect panel *below*
 *                             the chart, and the visually-hidden data table.
 *   - `ChartUnavailableMark`— the honest no-bar marker for an Unavailable slot.
 *
 * The palette is *not* owned here: the Adherence Band / zone colours live in
 * `cockpit/shared.tsx` (ADR 0029) and a chart passes fill classes in as data,
 * keeping this primitive palette-agnostic.
 *
 * SSR-native: everything renders from props on the first byte — no DOM
 * measurement, no `ResponsiveContainer`, so the complete chart paints server-
 * side with no post-hydration reflow (as `fitness-journey.tsx` does).
 */
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	useCallback,
	useState,
} from 'react'
import { cn } from '#app/utils/misc.tsx'

// ---------------------------------------------------------------------------
// Scale + ticks
// ---------------------------------------------------------------------------

/**
 * Gridline stops from 0 up to a "nice" ceiling at or above `max` — 1/2/5·10ⁿ
 * steps, the axis-scale idiom (never a raw `max / n`, which yields ugly labels
 * like 133, 267). Returns at least `[0]`; the last stop is the value-axis
 * domain top a chart scales against, so bars never touch the ceiling.
 */
export function niceLinearTicks(max: number, count = 4): number[] {
	if (!Number.isFinite(max) || max <= 0) return [0]
	const rawStep = max / count
	const mag = 10 ** Math.floor(Math.log10(rawStep))
	const norm = rawStep / mag
	const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
	const top = Math.ceil(max / step) * step
	const ticks: number[] = []
	for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v))
	return ticks
}

// ---------------------------------------------------------------------------
// Chart Inspect controller (ADR 0030)
// ---------------------------------------------------------------------------

/** The handle a chart wires into its marks, plot surface and inspect panel. */
export type ChartInspect = {
	/** The inspected mark's index, or null when nothing is inspected. */
	index: number | null
	/** Convenience predicate for per-mark highlighting. */
	isActive: (i: number) => boolean
	/** Inspect mark `i` (clamped); used by hover parity and the continuous track. */
	select: (i: number) => void
	/** Inspect `i`, or dismiss if it is already inspected (tap / re-tap). */
	toggle: (i: number) => void
	/** Dismiss the inspection (tap-empty, Escape, pointer-leave on desktop). */
	clear: () => void
	/**
	 * Props for the focusable geometry `<svg>`: keyboard inspection (arrows move,
	 * Home/End jump, Enter/Space begins, Escape dismisses) and dismiss-on-blur.
	 */
	surfaceProps: {
		tabIndex: 0
		onKeyDown: (e: ReactKeyboardEvent) => void
		onBlur: () => void
	}
	/**
	 * Props for the plot `<g>` wrapping the marks: pointer-leave dismisses on
	 * desktop (there is no hover on touch, ADR 0028, so touch is untouched).
	 */
	plotProps: {
		onPointerLeave: (e: ReactPointerEvent) => void
	}
	/**
	 * Props for a **discrete** mark's full-height hit area (a bar's slot): hover
	 * inspects on desktop, tap toggles on touch.
	 */
	slotProps: (i: number) => {
		onPointerEnter: (e: ReactPointerEvent) => void
		onPointerUp: (e: ReactPointerEvent) => void
	}
	/**
	 * Props for a **continuous** series' full-width pointer track: maps the
	 * pointer's x-fraction (0..1 across the plot) to the nearest sample index.
	 * Desktop hovers to read; touch drags to scrub. Reserved for the Telemetry
	 * Overlay — proving the controller is not bar-only (ADR 0029).
	 */
	trackProps: (indexAtFraction: (frac: number) => number) => {
		onPointerDown: (e: ReactPointerEvent) => void
		onPointerMove: (e: ReactPointerEvent) => void
		onPointerLeave: (e: ReactPointerEvent) => void
	}
}

const clampIndex = (i: number, count: number) =>
	Math.max(0, Math.min(count - 1, i))

/**
 * The Chart Inspect controller. Index-based so it is regime-agnostic: a
 * discrete chart's marks call `slotProps`/`toggle`, a continuous chart's track
 * calls `trackProps`/`select`, and both share one keyboard model and one
 * inspected-index the panel and data table read.
 */
export function useChartInspect(count: number): ChartInspect {
	const [index, setIndex] = useState<number | null>(null)

	const select = useCallback(
		(i: number) => {
			if (count <= 0) return
			setIndex(clampIndex(i, count))
		},
		[count],
	)
	const clear = useCallback(() => setIndex(null), [])
	const toggle = useCallback(
		(i: number) => {
			if (count <= 0) return
			const next = clampIndex(i, count)
			setIndex((prev) => (prev === next ? null : next))
		},
		[count],
	)
	const isActive = useCallback((i: number) => index === i, [index])

	const onKeyDown = useCallback(
		(e: ReactKeyboardEvent) => {
			if (count <= 0) return
			switch (e.key) {
				case 'ArrowRight':
				case 'ArrowUp':
					e.preventDefault()
					setIndex((prev) => (prev == null ? 0 : clampIndex(prev + 1, count)))
					break
				case 'ArrowLeft':
				case 'ArrowDown':
					e.preventDefault()
					setIndex((prev) =>
						prev == null ? count - 1 : clampIndex(prev - 1, count),
					)
					break
				case 'Home':
					e.preventDefault()
					setIndex(0)
					break
				case 'End':
					e.preventDefault()
					setIndex(count - 1)
					break
				case 'Enter':
				case ' ':
					e.preventDefault()
					setIndex((prev) => (prev == null ? 0 : prev))
					break
				case 'Escape':
					if (index != null) {
						e.preventDefault()
						setIndex(null)
					}
					break
			}
		},
		[count, index],
	)

	const slotProps = useCallback(
		(i: number) => ({
			// Desktop hover parity (ADR 0030): entering a slot with a mouse inspects.
			onPointerEnter: (e: ReactPointerEvent) => {
				if (e.pointerType === 'mouse') select(i)
			},
			// Touch/pen tap (there is no hover on touch, ADR 0028): tap toggles.
			onPointerUp: (e: ReactPointerEvent) => {
				if (e.pointerType !== 'mouse') toggle(i)
			},
		}),
		[select, toggle],
	)

	const trackProps = useCallback(
		(indexAtFraction: (frac: number) => number) => {
			const fromEvent = (e: ReactPointerEvent) => {
				const rect = e.currentTarget.getBoundingClientRect()
				if (rect.width === 0) return null
				const frac = (e.clientX - rect.left) / rect.width
				return indexAtFraction(Math.max(0, Math.min(1, frac)))
			}
			return {
				onPointerDown: (e: ReactPointerEvent) => {
					const i = fromEvent(e)
					if (i != null) select(i)
				},
				onPointerMove: (e: ReactPointerEvent) => {
					// Desktop hovers freely; touch scrubs only while pressed.
					if (e.pointerType !== 'mouse' && e.buttons === 0) return
					const i = fromEvent(e)
					if (i != null) select(i)
				},
				onPointerLeave: (e: ReactPointerEvent) => {
					if (e.pointerType === 'mouse') clear()
				},
			}
		},
		[select, clear],
	)

	return {
		index,
		isActive,
		select,
		toggle,
		clear,
		surfaceProps: { tabIndex: 0, onKeyDown, onBlur: clear },
		plotProps: {
			onPointerLeave: (e: ReactPointerEvent) => {
				if (e.pointerType === 'mouse') clear()
			},
		},
		slotProps,
		trackProps,
	}
}

// ---------------------------------------------------------------------------
// Geometry passed to a chart's mark + overlay renderers
// ---------------------------------------------------------------------------

export type ChartPadding = {
	top: number
	right: number
	bottom: number
	left: number
}

/**
 * The resolved plot geometry. Marks are drawn in SVG user units; HTML overlays
 * (crisp text — labels, the `n/a` marker, "Now") are positioned with the `*Pct`
 * helpers, so text never distorts under `preserveAspectRatio="none"` (the
 * `fitness-journey.tsx` idiom: SVG for shapes, HTML for type).
 */
export type ChartGeom = {
	width: number
	height: number
	padding: ChartPadding
	plotW: number
	plotH: number
	/** The y of the value axis's zero line (bar baseline). */
	baselineY: number
	/** Value → svg y. */
	scaleY: (value: number) => number
	/** Per-slot width for a discrete chart of `count` marks. */
	slotW: number
	/** Slot `i`'s centre x (svg units). */
	slotCenter: (i: number) => number
	/** Slot `i`'s left edge x (svg units). */
	slotLeft: (i: number) => number
	/** An svg x as a full-container left percentage (for HTML overlays). */
	leftPct: (svgX: number) => string
	/** An svg y as a full-container top percentage (for HTML overlays). */
	topPct: (svgY: number) => string
}

// ---------------------------------------------------------------------------
// ChartFigure — the ChartContainer-equivalent shell
// ---------------------------------------------------------------------------

export type ChartDataTableModel = {
	/** The table's accessible caption, e.g. "Weekly training load, planned vs actual". */
	caption: string
	columns: string[]
	rows: string[][]
}

type ChartFigureProps = {
	inspect: ChartInspect
	/** The whole chart's one-line accessible summary (the `role="img"` label). */
	ariaLabel: string
	/** Number of discrete marks; drives slot geometry. */
	count: number
	/** Value-axis domain top — pass the last `niceLinearTicks` stop. */
	yMax: number
	width?: number
	height?: number
	padding?: Partial<ChartPadding>
	/** Fixed rendered height of the plot area (px); the SVG stretches to fill it. */
	plotHeightClass?: string
	/** SVG geometry: bars, markers, selection highlight, per-slot hit areas. */
	renderMarks: (geom: ChartGeom) => ReactNode
	/** HTML overlays positioned via `geom.*Pct`: axis labels, `n/a`, "Now". */
	renderOverlay?: (geom: ChartGeom) => ReactNode
	/** The fixed Chart Inspect panel's content for the inspected index. */
	renderInspect: (index: number | null) => ReactNode
	/** The visually-hidden accessible equivalent — every value the panel shows. */
	dataTable: ChartDataTableModel
	className?: string
}

const DEFAULT_PADDING: ChartPadding = { top: 16, right: 8, bottom: 28, left: 8 }

export function ChartFigure({
	inspect,
	ariaLabel,
	count,
	yMax,
	width = 720,
	height = 240,
	padding: paddingOverride,
	plotHeightClass = 'h-56',
	renderMarks,
	renderOverlay,
	renderInspect,
	dataTable,
	className,
}: ChartFigureProps) {
	const padding: ChartPadding = { ...DEFAULT_PADDING, ...paddingOverride }
	const plotW = width - padding.left - padding.right
	const plotH = height - padding.top - padding.bottom
	const baselineY = padding.top + plotH
	const domainTop = yMax > 0 ? yMax : 1
	const scaleY = (value: number) => baselineY - (value / domainTop) * plotH
	const slotW = count > 0 ? plotW / count : plotW
	const slotLeft = (i: number) => padding.left + slotW * i
	const slotCenter = (i: number) => padding.left + slotW * (i + 0.5)
	const leftPct = (svgX: number) => `${(svgX / width) * 100}%`
	const topPct = (svgY: number) => `${(svgY / height) * 100}%`

	const geom: ChartGeom = {
		width,
		height,
		padding,
		plotW,
		plotH,
		baselineY,
		scaleY,
		slotW,
		slotCenter,
		slotLeft,
		leftPct,
		topPct,
	}

	const ticks = niceLinearTicks(domainTop)

	return (
		<figure className={cn('m-0', className)}>
			<div className={cn('relative w-full', plotHeightClass)}>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					preserveAspectRatio="none"
					className="focus-visible:outline-ring absolute inset-0 size-full touch-manipulation rounded focus-visible:outline-2 focus-visible:outline-offset-2"
					role="img"
					aria-label={ariaLabel}
					{...inspect.surfaceProps}
				>
					{/* Gridlines at each nice tick (geometry only — labels are HTML). */}
					{ticks.map((t) => (
						<line
							key={t}
							x1={padding.left}
							x2={width - padding.right}
							y1={scaleY(t)}
							y2={scaleY(t)}
							stroke="currentColor"
							className="text-border"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}
					<g {...inspect.plotProps}>{renderMarks(geom)}</g>
				</svg>

				{/* Crisp HTML overlays over the full box — text never distorts under
				    `preserveAspectRatio="none"`; positioned with `leftPct`/`topPct`. */}
				{renderOverlay ? (
					<div className="pointer-events-none absolute inset-0" aria-hidden>
						{renderOverlay(geom)}
					</div>
				) : null}
			</div>

			{/* The fixed Chart Inspect panel — always below the chart, never a
			    tooltip floating over the marks (ADR 0030). `aria-live` announces the
			    reading to assistive tech as keyboard/tap selection moves. */}
			<figcaption
				className="bg-muted/40 text-foreground mt-3 min-h-16 rounded-xl p-3 text-sm"
				aria-live="polite"
			>
				{renderInspect(inspect.index)}
			</figcaption>

			<ChartDataTable {...dataTable} />
		</figure>
	)
}

// ---------------------------------------------------------------------------
// Unavailable marker (ADR 0008 / ADR 0030)
// ---------------------------------------------------------------------------

/**
 * The honest marker an Unavailable slot draws *instead of* a bar: a muted
 * baseline stub so the slot reads as "known-empty", never a zero bar. The `n/a`
 * label rides as an HTML overlay (crisp text), so this is the SVG stub only.
 */
export function ChartUnavailableMark({
	cx,
	baselineY,
	width,
}: {
	cx: number
	baselineY: number
	width: number
}) {
	return (
		<rect
			x={cx - width / 2}
			y={baselineY - 5}
			width={width}
			height={5}
			rx={1}
			className="fill-muted-foreground/25"
		/>
	)
}

// ---------------------------------------------------------------------------
// Accessible data-table equivalent (ADR 0030)
// ---------------------------------------------------------------------------

/**
 * The visually-hidden table carrying every value the inspect panel can show, so
 * assistive-tech users get the full data even though the SVG is a single
 * `role="img"`. The `sr-only` lives on a wrapping *div*, not the table: a
 * `<table>` ignores `width: 1px` (its used width is content-driven), so a long
 * caption or row would escape the clip and push the document's scroll width past
 * the 390px viewport (docs/design/ui-conventions.md §5). A div honours the 1px +
 * `overflow: hidden`, clipping the table's layout box out of the scroll area
 * while keeping it in the accessibility tree.
 */
function ChartDataTable({ caption, columns, rows }: ChartDataTableModel) {
	return (
		<div className="sr-only">
			<table>
				<caption>{caption}</caption>
				<thead>
					<tr>
						{columns.map((c) => (
							<th key={c} scope="col">
								{c}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, r) => (
						<tr key={r}>
							{row.map((cell, c) =>
								c === 0 ? (
									<th key={c} scope="row">
										{cell}
									</th>
								) : (
									<td key={c}>{cell}</td>
								),
							)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
