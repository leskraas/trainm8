/**
 * PROTOTYPE — the **only** module in the app that imports `@tanstack/charts`.
 *
 * The owner has decided we use TanStack Charts (https://tanstack.com/charts/latest).
 * The package is 0.13.0, seventeen days old, thirteen minors in three weeks, and
 * its own repo calls the API audit "pre-alpha". The containment strategy for that
 * is two rules, both enforced here rather than by convention:
 *
 *   1. `package.json` pins it **exact** (`--save-exact`), never `^`.
 *   2. Nothing else in `app/` may import from `@tanstack/*`. Variant L imports
 *      the three purpose-shaped components below and nothing else, so a breaking
 *      rename in 0.14 is a one-file edit and never a variant-wide rewrite.
 *
 * The API is deliberately *not* a thin `<Chart>` wrapper — a wrapper that leaks
 * `definition`/`marks`/`scales` would leak the churn it is supposed to contain.
 * Each export takes domain values (a track's weekly volumes, that track's own
 * peak, a Volume Currency's unit) and owns every chart decision itself.
 *
 * Three decisions worth reading before changing anything here:
 *
 * - **`initialWidth` defaults to 640** (`docs/framework/react/reference/chart.md`,
 *   "Accessibility and sizing"), and the responsive host measures the container
 *   after hydration. At the 390 px reference viewport the container is ~358 px, so
 *   the default server-renders geometry for a 640 px box and reflows on measure.
 *   Two documented cures, both used below:
 *     - the glyphs (hairline, sparkline) pass an explicit **`width`**, which locks
 *       the scene and skips measurement entirely, plus `style.width: '100%'` so the
 *       CSS box still fills its container. The emitted SVG is already
 *       `width="100%" height="100%" viewBox="0 0 w h"`, so with
 *       `preserveAspectRatio="none"` injected (see `renderStretchedSvg`) this is
 *       exactly the `ChartFigure` idiom: responsive with **zero measurement and
 *       zero reflow**;
 *     - the load profile stays genuinely responsive (it wants real axis text, which
 *       must not distort) and sets an explicit **`initialWidth`** — the documented
 *       fix, "Pick an `initialWidth` close to the layout's common size"
 *       (`docs/guides/ssr-and-hydration.md`). It defaults to
 *       `MOBILE_CARD_PLOT_WIDTH`, the *measured* width of the card it lands in,
 *       because "close to the layout's common size" turns out to mean the box, not
 *       the viewport: 358 (the viewport's content width) reflowed 18 px on mount.
 *       At 390 px the server width and the measured width now agree exactly; at
 *       1280 px one relayout happens on mount, which is the intended trade for
 *       undistorted axis text.
 *
 * - **The floating tooltip never exists.** ADR 0030 rule 3 bans a tooltip over the
 *   marks at 390 px. The built-in tooltip is **opt-in** — it arrives only if a
 *   definition imports `tooltip` from `@tanstack/charts/tooltip`
 *   (`docs/guides/tooltips-and-focus.md`, "Default nearest point") — and this
 *   module never imports it. `ChartDefinitionOptions.tooltip` also accepts a
 *   literal `false`, which every definition here passes as a second lock. The load
 *   profile drives the house **Chart Inspect** panel *below* the figure from
 *   `onFocusChange`/`onSelect` instead.
 *
 * - **Margins are locked.** The scene solver otherwise measures text to reserve
 *   guide space, and "the browser host remeasures when fonts become available and
 *   schedules a new layout" — a second post-hydration jump. `margin: 0` on the
 *   glyphs and an explicit four-sided `margin` on the profile lock every side, so
 *   web-font readiness cannot move any geometry.
 *
 * THROWAWAY — do not ship. Delete with the /training/plan/prototype route.
 */
import {
	barX,
	barY,
	defineChart,
	dot,
	lineY,
	text,
	type ChartPoint,
} from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { renderChartSvg } from '@tanstack/charts/svg'
import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from 'react'
import {
	ChartDataTable,
	type ChartDataTableModel,
} from '#app/components/chart/chart.tsx'
import { cn } from '#app/utils/misc.tsx'

/** Quoted in the spike's report, so the version lives next to the code using it. */
export const CHARTS_PACKAGE = '@tanstack/charts@0.13.0'

/**
 * The content width of the 390 × 844 reference viewport inside `container` — the
 * `initialWidth` the responsive chart server-renders at, so the server geometry
 * and the measured geometry agree on the viewport we design against.
 */
export const MOBILE_PLOT_WIDTH = 358

/**
 * The same width once the chart sits inside a bordered `p-2` card — 358 less two
 * 1 px borders and two 8 px paddings. Measured, not guessed: the first spike run
 * set `initialWidth` to 358 for a chart the browser then measured at **340**, and
 * an 18 px disagreement is exactly the reflow `initialWidth` exists to prevent.
 * A responsive chart's `initialWidth` is a property of the *box it lands in*, not
 * of the viewport.
 */
export const MOBILE_CARD_PLOT_WIDTH = 340

/* -------------------------------------------------------------------------- */
/* The one renderer override                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `renderChartSvg` emits `<svg width="100%" height="100%" viewBox="0 0 w h">` but
 * no `preserveAspectRatio`, so the SVG default (`xMidYMid meet`) letterboxes a
 * fixed-`width` scene inside a wider box instead of stretching to it. Injecting
 * `preserveAspectRatio="none"` is what lets a locked scene be fully responsive
 * with no measurement — the same trick `app/components/chart/chart.tsx:369-372`
 * uses. It is passed through the documented `renderSvg` prop, so the imperative
 * post-hydration reconcile emits the identical attribute (`svg-surface.js` calls
 * the supplied `renderSvg` for both `prerender` and `render`).
 *
 * Only the guide-free glyphs use it: `none` would distort axis text, so the load
 * profile keeps the default and stays measured-responsive instead.
 */
const renderStretchedSvg: typeof renderChartSvg = (scene, options) =>
	renderChartSvg(scene, options).replace(
		'<svg ',
		'<svg preserveAspectRatio="none" ',
	)

/** Every glyph fills its box; the scene size is only a coordinate system. */
const FILL_BOX: CSSProperties = { width: '100%', height: '100%' }

/* -------------------------------------------------------------------------- */
/* 1 — the per-track volume hairline                                          */
/* -------------------------------------------------------------------------- */

type HairlineRow = { slot: 'v'; value: number }

/**
 * One Training Track's week, as a ~2 px rule in the week gutter, scaled to
 * **that track's own season peak**. Three tracks give three independent
 * hairlines; nothing here can express a sum, because a hairline takes exactly
 * one number and exactly one peak (ADR 0043 §7, ADR 0046 §1).
 *
 * ADR 0030 rule 1: a week with no trustworthy volume passes `value: null` and
 * draws **no mark at all** — never a floored bar. The gutter's printed total
 * carries the `n/a`, exactly as `ChartUnavailableMark` + its HTML overlay do.
 */
export function TrackHairline({
	value,
	peak,
	ariaLabel,
	className,
}: {
	/** This week's volume in the track's Volume Currency, or null when Unavailable. */
	value: number | null
	/** This track's own season peak. Never another track's, never a blend. */
	peak: number
	ariaLabel: string
	/** A Tailwind `text-*` class — marks paint `currentColor`. */
	className?: string
}) {
	const definition = useMemo(() => {
		const rows: HairlineRow[] =
			value != null && value > 0 ? [{ slot: 'v', value }] : []
		return defineChart({
			marks: [
				barX(rows, {
					x: 'value',
					y: 'slot',
					fill: 'currentColor',
				}),
			],
			x: { scale: scaleLinear().domain([0, peak > 0 ? peak : 1]) },
			y: { scale: () => scaleBand<string>().domain(['v']).padding(0) },
			guides: false,
			margin: 0,
			tooltip: false,
			pointer: false,
			keyboard: false,
		})
	}, [value, peak])

	return (
		<Chart
			definition={definition}
			ariaLabel={ariaLabel}
			width={100}
			height={2}
			tabIndex={-1}
			renderSvg={renderStretchedSvg}
			className={cn('opacity-80', className)}
			style={FILL_BOX}
		/>
	)
}

/* -------------------------------------------------------------------------- */
/* 2 — the season sparkline that is also the scroll position                  */
/* -------------------------------------------------------------------------- */

type SparkRow = { i: number; v: number }

/**
 * The season's silhouette in one ~20 px sticky line, doubling as the calendar's
 * scroll-position indicator: the line is the shape, the rule is where you are.
 *
 * The values are **unit-less on purpose**. `Preset.weeklyLoad` is a 0–1 ratio,
 * not a Volume Currency (`__prototype-data.ts:385-397`), so this glyph carries
 * no axis, no number and no unit — the same reasoning `__preset-gallery.tsx`
 * gives for keeping its strip a glyph rather than a chart. A ratio silhouette is
 * the one figure that is honest across three currencies, because it claims no
 * exchange rate between them.
 *
 * The scroll rule is an HTML overlay, not a chart mark: re-deriving a definition
 * on every scroll frame would recompile a scene per frame, and the house idiom is
 * SVG for shapes, HTML for everything that only needs a position.
 */
export function SeasonSparkline({
	points,
	progress,
	ariaLabel,
	className,
}: {
	/** Unit-less 0–1 weekly load, one entry per week. */
	points: readonly number[]
	/** Scroll position through the calendar, 0–1. */
	progress: number
	ariaLabel: string
	className?: string
}) {
	const definition = useMemo(() => {
		const rows: SparkRow[] = points.map((v, i) => ({ i, v }))
		return defineChart({
			marks: [
				lineY(rows, {
					x: 'i',
					y: 'v',
					stroke: 'currentColor',
					strokeWidth: 1.5,
				}),
			],
			x: {
				scale: scaleLinear().domain([0, Math.max(1, points.length - 1)]),
			},
			y: { scale: scaleLinear().domain([0, 1]) },
			guides: false,
			margin: 0,
			tooltip: false,
			pointer: false,
			keyboard: false,
		})
	}, [points])

	// Rounded to 2 decimals: an unrounded percentage would differ in its last
	// bit between Node and V8 and hydrate with a mismatch (variant G's scar).
	const left = `${Math.round(Math.min(1, Math.max(0, progress)) * 10000) / 100}%`

	return (
		<div className={cn('relative h-4 w-full', className)}>
			<Chart
				definition={definition}
				ariaLabel={ariaLabel}
				width={MOBILE_PLOT_WIDTH}
				height={16}
				tabIndex={-1}
				renderSvg={renderStretchedSvg}
				style={FILL_BOX}
			/>
			<span
				aria-hidden
				className="bg-primary absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full"
				style={{ left }}
			/>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* 3 — one track's season load profile, with the house inspect panel          */
/* -------------------------------------------------------------------------- */

export type LoadProfilePoint = {
	/** 1-based Training Week index. */
	week: number
	/** The week's volume in this track's currency, or null when Unavailable. */
	value: number | null
	/** Week Role, for the inspect reading. */
	role: string
	phase: string
}

type ProfileDatum = { week: number; value: number; label: string }
type NaDatum = { week: number; label: string }

/**
 * One chart, one Training Track, one Volume Currency, one value axis. The axis
 * label states whose unit it is, so a triathlete reading three of these is never
 * offered a total. Stacking, normalising or sharing an axis across tracks is not
 * expressible through this component — it takes one track's points and one unit.
 *
 * ADR 0030, rule by rule:
 *   1. an Unavailable week draws **no bar**; it draws a muted baseline dot plus a
 *      literal `n/a` label at its slot, and the inspect reading says why;
 *   2. `role="img"` comes from the library's own SVG contract, and the accessible
 *      equivalent is the shipped `ChartDataTable` — the same `sr-only`-on-a-div
 *      component the house primitive uses, not a second copy of it;
 *   3. `tooltip: false`, and the reading lands in a fixed `aria-live` figcaption
 *      **below** the plot, dismissed by re-tap or Escape.
 */
export function TrackLoadProfile({
	points,
	unit,
	trackLabel,
	ariaLabel,
	dataTable,
	format,
	initialWidth = MOBILE_CARD_PLOT_WIDTH,
	className,
}: {
	points: readonly LoadProfilePoint[]
	/** This track's Volume Currency unit — `km`, `h`, `TSS`. */
	unit: string
	/** The Training Track, for the axis title and the reading. */
	trackLabel: string
	ariaLabel: string
	dataTable: ChartDataTableModel
	format: (value: number) => string
	/** The width of the box this chart lands in at 390 px. See the constant. */
	initialWidth?: number
	className?: string
}) {
	/**
	 * Two sources of a reading, deliberately separate.
	 *
	 * A tap on a bar fires **both** `onFocusChange` (the pointer resolved a point)
	 * and `onSelect` (the click activated it). The spike's first pass kept one
	 * `inspected` state and toggled it in `onSelect`; focus set the week, select saw
	 * it already set, and cleared it — a tap that measurably did nothing. The pin
	 * and the hover are different facts and need different cells:
	 *
	 *   - `pinned` is ADR 0030's tap-to-inspect. Re-tap, a tap on blank plot, or
	 *     Escape dismisses it. It survives the pointer leaving the plot.
	 *   - `hovered` is desktop hover parity *and* the keyboard cursor — the library
	 *     reports arrow-key movement through the same `onFocusChange`. It must not
	 *     resurrect a reading the athlete just dismissed while their pointer is
	 *     still resting on the same bar, hence `suppressed`, which holds that one
	 *     week until focus moves elsewhere.
	 *
	 * Live focus wins over the pin, and the pin is the fallback once focus clears.
	 * The other order looked equivalent and was not: with a bar pinned, arrow keys
	 * moved the library's focus while the panel kept printing the pinned week, so
	 * keyboard inspection silently stopped working (ADR 0030 rule 2).
	 */
	const [pinned, setPinned] = useState<number | null>(null)
	const [hovered, setHovered] = useState<number | null>(null)
	const suppressed = useRef<number | null>(null)
	const inspected = hovered ?? pinned

	const peak = points.reduce((most, p) => Math.max(most, p.value ?? 0), 0)

	const definition = useMemo(() => {
		const bars: ProfileDatum[] = points
			.filter(
				(p): p is LoadProfilePoint & { value: number } =>
					p.value != null && p.value > 0,
			)
			.map((p) => ({ week: p.week, value: p.value, label: `w${p.week}` }))
		const missing: NaDatum[] = points
			.filter((p) => p.value == null || p.value <= 0)
			.map((p) => ({ week: p.week, label: 'n/a' }))
		const weeks = points.map((p) => p.week)

		return defineChart({
			marks: [
				barY(bars, {
					x: 'week',
					y: 'value',
					fill: 'currentColor',
					inset: 1,
					radius: 1,
				}),
				// ADR 0030 rule 1: the honest marker for a known-empty slot. A dot at
				// the baseline plus the word — never a bar, never a floor.
				dot(missing, {
					x: 'week',
					y: () => 0,
					r: 2,
					fill: 'currentColor',
					fillOpacity: 0.35,
				}),
				text(missing, {
					x: 'week',
					y: () => 0,
					text: 'label',
					fontSize: 9,
					dy: -8,
					fill: 'currentColor',
					fillOpacity: 0.6,
				}),
			],
			x: { scale: () => scaleBand<number>().domain(weeks).padding(0.24) },
			y: {
				scale: scaleLinear().domain([0, peak > 0 ? peak : 1]),
				nice: true,
				grid: true,
				axis: { label: `${trackLabel} · ${unit}/wk` },
			},
			// Every side locked, so web-font readiness cannot relayout the scene.
			margin: { top: 8, right: 6, bottom: 20, left: 40 },
			tooltip: false,
			focus: 'nearest-x',
		})
	}, [points, peak, trackLabel, unit])

	const onFocusChange = useCallback(
		(point: ChartPoint<ProfileDatum | NaDatum, number, number> | null) => {
			const week = point ? point.datum.week : null
			if (week != null && suppressed.current === week) {
				setHovered(null)
				return
			}
			suppressed.current = null
			setHovered(week)
		},
		[],
	)

	const onSelect = useCallback(
		(point: ChartPoint<ProfileDatum | NaDatum, number, number> | null) => {
			const week = point?.datum.week ?? null
			if (week == null) {
				// A tap on blank plot area dismisses (ADR 0030 rule 3).
				setPinned(null)
				setHovered(null)
				return
			}
			setPinned((prev) => {
				if (prev === week) {
					suppressed.current = week
					setHovered(null)
					return null
				}
				suppressed.current = null
				return week
			})
		},
		[],
	)

	const dismiss = useCallback(() => {
		suppressed.current = pinned ?? hovered
		setPinned(null)
		setHovered(null)
	}, [pinned, hovered])

	const reading = points.find((p) => p.week === inspected) ?? null

	return (
		<figure
			className={cn('m-0', className)}
			onKeyDown={(event) => {
				if (event.key === 'Escape' && inspected != null) dismiss()
			}}
		>
			<Chart
				definition={definition}
				ariaLabel={ariaLabel}
				initialWidth={initialWidth}
				height={192}
				onFocusChange={onFocusChange}
				onSelect={onSelect}
			/>
			<figcaption
				className="bg-muted/40 text-foreground mt-2 min-h-12 rounded-xl p-2 text-xs tabular-nums"
				aria-live="polite"
			>
				{reading ? (
					reading.value == null || reading.value <= 0 ? (
						<span>
							{reading.week} · {reading.phase} · {reading.role} · {trackLabel}{' '}
							n/a
						</span>
					) : (
						<span>
							{reading.week} · {reading.phase} · {reading.role} · {trackLabel}{' '}
							{format(reading.value)}
						</span>
					)
				) : (
					<span className="text-muted-foreground">
						{trackLabel} · {points.length} wk · {unit}
					</span>
				)}
			</figcaption>
			<ChartDataTable {...dataTable} />
		</figure>
	)
}
