/**
 * The season strip — the season's horizontal axis (#505 stories 17–18, 26;
 * ADR 0082 §5, ADR 0086), drawn after Arket variant P.
 *
 * An **overview, not a second list**: one bar per week, a frame over the weeks
 * the list is showing, and under the bars the plan's **phases** as a band in
 * the phase colours, named where the name fits. A dashed line stands where the
 * Planning Horizon ends; past it the bars are **dashed** — a target the week
 * change has not filled yet — and the race week carries a **flag**. Today's
 * week has a mark under its bar.
 *
 * A bar is read in the **lead track**'s own unit (`TimelineStrip`): its height
 * is `max(target, planned)` against the season's largest, and what was done
 * fills it from the bottom. Exactly as tall as its value, never floored
 * (ADR 0066 §3). Each week's numbers ride on its button's accessible name.
 *
 * **A season too long for the width** (S10) — bars narrower than
 * `MIN_BAR_PX` — is shown as a **window** around the reader
 * (`stripWindow`): it follows the frame as the list scrolls, holds still under
 * a scrubbing finger, and steps a window's width either way from the edge
 * buttons, which say how many weeks lie beyond. The whole season stays one
 * scroll of the list away, and the bars stay wide enough to hit.
 *
 * Every week is a real button: pressing jumps the list there, dragging scrubs
 * the season. **Nothing here animates** (ADR 0077, Emil's frequency table: the
 * strip is used tens of times a day) — the frame moves because the reader did.
 */
import {
	Fragment,
	memo,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent,
} from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
import { SEASON_STRIP_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type PhaseTone } from './presenter.ts'
import {
	stripWindow,
	type StripWindow,
	type TimelineStrip,
	type TimelineStripWeek,
} from './strip.ts'
import { CELL_ATTR } from './use-timeline-scroll.ts'

/**
 * The width a phone gives the strip before anything is measured — the server
 * render and the first client render agree on it, so a long season renders
 * the same window on both sides of hydration.
 */
const ASSUMED_WIDTH = 358

/** A phase's band and its column tint. Literal classes, for Tailwind. */
const PHASE_BAND: Record<PhaseTone, string> = {
	base: 'border-phase-base',
	build: 'border-phase-build',
	peak: 'border-phase-peak',
	taper: 'border-phase-taper',
}
const PHASE_TINT: Record<PhaseTone, string> = {
	base: 'bg-phase-base/12',
	build: 'bg-phase-build/14',
	peak: 'bg-phase-peak/14',
	taper: 'bg-phase-taper/14',
}

/** The two edge buttons and their gaps, taken from the bars once windowed. */
const EDGES_PX = 2 * (28 + 4)

/** Roughly how wide a phase name sets at the band's 10px, and its inset. */
const NAME_PX_PER_CHAR = 5.6
const NAME_INSET_PX = 4

/** A phase's name under the strip: where it starts and whether it is drawn. */
export type PhaseNamePlacement = {
	/** The phase's own band, in px from the bars' left edge. */
	bandLeft: number
	bandWidth: number
	/** The name, whole, or null where it is left out. Never abbreviated. */
	name: string | null
	/** Where the name starts, in px from the bars' left edge. */
	nameLeft: number
}

/**
 * The phase names under the strip (variant P, #505 polish): **whole or not at
 * all** — never `Grunntr.`, an abbreviation nobody chose.
 *
 * Every phase whose band is wide enough is named in full. A phase whose band
 * is too narrow is left unnamed — except the phase **today** falls in (or,
 * when today is outside the window, the phase the reader is in), which is
 * always named in full: its name may run on past its own band, kept inside
 * the strip, and a neighbour's name it would overlap gives way. The week
 * buttons' accessible names carry every week's phase, so nothing is lost to a
 * screen reader; this row is for the eye.
 *
 * `phases` are already clipped to the window, in week indices relative to its
 * first week; `barPx` is one column's width.
 */
export function placePhaseNames(
	phases: ReadonlyArray<{ name: string; from: number; to: number }>,
	{
		barPx,
		count,
		current,
	}: { barPx: number; count: number; current: number | null },
): PhaseNamePlacement[] {
	const total = barPx * count
	const textWidth = (name: string) =>
		name.length * NAME_PX_PER_CHAR + NAME_INSET_PX
	const placed = phases.map((phase) => {
		const bandLeft = phase.from * barPx
		const bandWidth = (phase.to - phase.from + 1) * barPx
		const fits = textWidth(phase.name) <= bandWidth
		return {
			bandLeft,
			bandWidth,
			name: fits ? phase.name : null,
			nameLeft: bandLeft,
		}
	})
	const currentIndex =
		current == null
			? -1
			: phases.findIndex(
					(phase) => phase.from <= current && current <= phase.to,
				)
	const own = phases[currentIndex]
	const mine = placed[currentIndex]
	if (!own || !mine || mine.name != null) return placed
	// The current phase's band is too narrow: its name runs on, kept inside
	// the strip, and whatever name it would cover is left out.
	const width = textWidth(own.name)
	if (width > total) return placed
	const left = Math.max(0, Math.min(mine.bandLeft, total - width))
	mine.name = own.name
	mine.nameLeft = left
	const right = left + width
	placed.forEach((other, index) => {
		if (index === currentIndex || other.name == null) return
		const otherRight = other.nameLeft + textWidth(other.name)
		if (
			other.nameLeft < right + NAME_INSET_PX &&
			otherRight + NAME_INSET_PX > left
		) {
			other.name = null
		}
	})
	return placed
}

export function WeekStrip({
	strip,
	activeWeekKey,
	frame,
	onSelect,
}: {
	strip: TimelineStrip
	/** The week the stream is parked in. */
	activeWeekKey: string
	/** The first and last week the stream is showing — the frame's two edges. */
	frame: { from: string; to: string }
	onSelect: (key: string) => void
}) {
	const count = strip.weeks.length
	const frameFrom = Math.max(
		0,
		strip.weeks.findIndex((week) => week.key === frame.from),
	)
	const frameTo = Math.max(
		frameFrom,
		strip.weeks.findIndex((week) => week.key === frame.to),
	)

	const barsRef = useRef<HTMLDivElement>(null)
	const rowRef = useRef<HTMLDivElement>(null)
	const [width, setWidth] = useState(ASSUMED_WIDTH)
	useLayoutEffect(() => {
		const row = rowRef.current
		if (!row) return
		const measure = () => {
			const next = Math.round(row.getBoundingClientRect().width)
			if (next > 0) setWidth((current) => (current === next ? current : next))
		}
		measure()
		if (typeof ResizeObserver === 'undefined') return
		const observer = new ResizeObserver(measure)
		observer.observe(row)
		return () => observer.disconnect()
	}, [])

	/** The week a scrub last landed on, so a drag jumps once per week crossed. */
	const scrubRef = useRef<string | null>(null)
	// The window, and whether a finger is on the strip: it holds still under
	// a scrub, or every jump would slide the bars out from under the finger.
	const [window_, setWindow] = useState<StripWindow | null>(null)
	const [scrubbing, setScrubbing] = useState(false)
	const frameIndices = { from: frameFrom, to: frameTo }
	const shown =
		scrubbing && window_
			? window_
			: stripWindow({
					count,
					width,
					frame: frameIndices,
					current: window_,
					edges: EDGES_PX,
				})
	if (!window_ || window_.start !== shown.start || window_.end !== shown.end) {
		// Remembered (React's "state from the previous render"), so the next
		// frame change moves the window only as far as it must.
		setWindow(shown)
	}
	const windowed = shown.start > 0 || shown.end < count - 1
	const visible = strip.weeks.slice(shown.start, shown.end + 1)
	const n = visible.length

	/**
	 * The one week that holds the tab stop (roving tabindex): the week the
	 * stream is parked in, until the arrow keys move it.
	 */
	const [focusKey, setFocusKey] = useState<string | null>(null)
	const tabKey =
		focusKey && visible.some((week) => week.key === focusKey)
			? focusKey
			: visible.some((week) => week.key === activeWeekKey)
				? activeWeekKey
				: visible[0]?.key

	/**
	 * The week under a pointer, read off its x across the **whole** row, so a
	 * thumb lands on a week whichever pixel of the column it touches.
	 */
	function weekAt(clientX: number, target: EventTarget | null): string | null {
		const bars = barsRef.current
		const rect = bars?.getBoundingClientRect()
		if (bars && rect && rect.width > 0 && n > 0) {
			const index = Math.floor(((clientX - rect.left) / rect.width) * n)
			return visible[Math.min(n - 1, Math.max(0, index))]!.key
		}
		// No layout to measure (a test renderer): the cell under the pointer.
		const cell =
			target instanceof Element ? target.closest(`[${CELL_ATTR}]`) : null
		return cell?.getAttribute(CELL_ATTR) ?? null
	}

	function scrubTo(key: string | null) {
		if (!key || key === scrubRef.current) return
		scrubRef.current = key
		onSelect(key)
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		const index = strip.weeks.findIndex((week) => week.key === tabKey)
		const next =
			event.key === 'ArrowRight'
				? index + 1
				: event.key === 'ArrowLeft'
					? index - 1
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? count - 1
							: null
		if (next == null) return
		event.preventDefault()
		const key = strip.weeks[Math.min(count - 1, Math.max(0, next))]?.key
		if (!key) return
		setFocusKey(key)
		// A key past the window's edge steps the window there by jumping the
		// list, which is what moves the window — then focuses the bar.
		if (!visible.some((week) => week.key === key)) onSelect(key)
		requestAnimationFrame(() =>
			barsRef.current
				?.querySelector<HTMLElement>(`[${CELL_ATTR}="${key}"]`)
				?.focus(),
		)
	}

	const before = shown.start
	const after = count - 1 - shown.end
	const pct = (index: number) => `${((index - shown.start) / n) * 100}%`
	const frameStart = Math.max(frameFrom, shown.start)
	const frameEnd = Math.min(frameTo, shown.end)
	const horizon = strip.horizonIndex
	// The bars' own width: the row less the edge buttons once there is a window.
	const barPx = Math.max(0, width - (windowed ? EDGES_PX : 0)) / Math.max(1, n)
	const shownPhases = strip.phases
		.filter((phase) => phase.to >= shown.start && phase.from <= shown.end)
		.map((phase) => ({
			...phase,
			from: Math.max(phase.from, shown.start) - shown.start,
			to: Math.min(phase.to, shown.end) - shown.start,
		}))
	// The phase named whatever its band's width: today's, or the reader's when
	// today is outside the window. Today's, first, so the name holds still
	// while the list scrolls.
	const todayIndex = visible.findIndex((week) => week.isNow)
	const activeIndex = visible.findIndex((week) => week.key === activeWeekKey)
	const phaseNames = placePhaseNames(shownPhases, {
		barPx,
		count: n,
		current:
			todayIndex >= 0 ? todayIndex : activeIndex >= 0 ? activeIndex : null,
	})
	const px = (value: number) => `${(value / Math.max(1, barPx * n)) * 100}%`

	return (
		<div
			data-testid="week-strip"
			data-strip-windowed={windowed || undefined}
			// 8px of padding the strip takes back with a negative margin: room
			// for the edge buttons' hit areas to reach 44px without overflowing.
			className="-mx-2 px-2"
		>
			<div ref={rowRef} className="flex items-stretch gap-1">
				{windowed ? (
					<EdgeButton
						side="earlier"
						weeks={before}
						onStep={() =>
							onSelect(strip.weeks[Math.max(0, shown.start - n)]!.key)
						}
					/>
				) : null}
				<div className="relative min-w-0 flex-1">
					{/*
					 * The weeks: a toolbar of buttons with **one** tab stop and the
					 * arrow keys to move along it, so the season is a single stop in the
					 * tab order rather than fifty. A pointer is read off its x over the
					 * whole row — press anywhere to land on that week, drag to scrub.
					 */}
					<div
						ref={barsRef}
						data-strip-bars
						role="toolbar"
						aria-label={SEASON_STRIP_LABELS.region}
						aria-orientation="horizontal"
						onKeyDown={onKeyDown}
						onPointerDown={(event) => {
							if (event.button !== 0) return
							event.currentTarget.setPointerCapture?.(event.pointerId)
							scrubRef.current = null
							setScrubbing(true)
							scrubTo(weekAt(event.clientX, event.target))
						}}
						onPointerMove={(event) => {
							if (scrubRef.current == null) return
							scrubTo(weekAt(event.clientX, event.target))
						}}
						onPointerUp={() => {
							scrubRef.current = null
							setScrubbing(false)
						}}
						onPointerCancel={() => {
							scrubRef.current = null
							setScrubbing(false)
						}}
						className="relative flex h-11 [touch-action:none] items-stretch overflow-hidden rounded-xl"
					>
						{visible.map((week) => (
							<StripWeek
								key={week.key}
								week={week}
								active={week.key === activeWeekKey}
								tabbable={week.key === tabKey}
								onSelect={onSelect}
							/>
						))}
						{/* The Planning Horizon: dashed, where the filled weeks end. */}
						{horizon != null &&
						horizon > shown.start &&
						horizon <= shown.end ? (
							<span
								aria-hidden
								data-strip-horizon
								className="border-foreground/55 pointer-events-none absolute inset-y-[3px] border-l-[1.5px] border-dashed"
								style={{ left: pct(horizon) }}
							/>
						) : null}
						{/* The frame: the weeks the list is showing, outlined. By index,
						    never by a pixel reading of a scroll position. */}
						{n > 0 && frameEnd >= frameStart ? (
							<span
								aria-hidden
								data-strip-frame
								className="border-primary pointer-events-none absolute inset-y-0 rounded-lg border-2"
								style={{
									left: pct(frameStart),
									width: `${((frameEnd - frameStart + 1) / n) * 100}%`,
								}}
							/>
						) : null}
					</div>
					{/* The phases, under the bars: a coloured rule per phase and its
					    name, whole, where it fits (`placePhaseNames`). Decoration for
					    the eye; each week's name already says its phase. */}
					<div aria-hidden data-strip-phases className="relative mt-1 h-3.5">
						{shownPhases.map((phase, index) => {
							const placed = phaseNames[index]!
							return (
								<Fragment key={`${phase.from}-${phase.name}`}>
									<span
										data-strip-phase={phase.tone ?? 'none'}
										title={phase.name}
										className={cn(
											'absolute top-0 h-full border-t-2',
											phase.tone ? PHASE_BAND[phase.tone] : 'border-border',
										)}
										style={{
											left: px(placed.bandLeft),
											width: px(placed.bandWidth),
										}}
									/>
									{placed.name ? (
										<span
											data-strip-phase-name
											className="text-muted-foreground absolute top-0.5 pl-0.5 text-[10px]/[12px] whitespace-nowrap"
											style={{ left: px(placed.nameLeft) }}
										>
											{placed.name}
										</span>
									) : null}
								</Fragment>
							)
						})}
					</div>
				</div>
				{windowed ? (
					<EdgeButton
						side="later"
						weeks={after}
						onStep={() =>
							onSelect(strip.weeks[Math.min(count - 1, shown.end + 1)]!.key)
						}
					/>
				) : null}
			</div>
		</div>
	)
}

/**
 * The window's edge (S10): how many weeks lie beyond it, as a control that
 * jumps the list to the first of them — which moves the window there.
 * Disabled, and quiet, when nothing lies beyond.
 */
function EdgeButton({
	side,
	weeks,
	onStep,
}: {
	side: 'earlier' | 'later'
	weeks: number
	onStep: () => void
}) {
	return (
		<button
			type="button"
			data-strip-edge={side}
			disabled={weeks === 0}
			onClick={onStep}
			aria-label={
				side === 'earlier'
					? SEASON_STRIP_LABELS.earlierName(weeks)
					: SEASON_STRIP_LABELS.laterName(weeks)
			}
			className="text-muted-foreground pressable relative flex h-11 w-7 flex-none flex-col items-center justify-center rounded-lg text-[10px]/[1] font-semibold tabular-nums after:absolute after:-inset-x-2 after:inset-y-0 disabled:opacity-40"
		>
			<Icon
				name="chevron-right"
				size="xs"
				className={side === 'earlier' ? 'rotate-180' : undefined}
			/>
			<span>{weeks}</span>
		</button>
	)
}

/**
 * One week. Memoised for the reason `WeekBlock` is (#503): the active week and
 * the frame change on scroll, and a season's worth of bars should not
 * re-render for a flag one of them reads.
 *
 * The column is tinted by its phase; the bar's tone carries the rhythm — a
 * hard week darker than an easy one — so the season's 3:1 is a pattern before
 * any word is read. A week past the horizon is its target, dashed. Today's
 * week carries a mark under its bar, a lifting week a dot, the race week a
 * flag.
 */
const StripWeek = memo(function StripWeek({
	week,
	active,
	tabbable,
	onSelect,
}: {
	week: TimelineStripWeek
	active: boolean
	/** Holds the toolbar's one tab stop. */
	tabbable: boolean
	onSelect: (key: string) => void
}) {
	const easy = week.role === 'recovery' || week.role === 'taper'
	return (
		<button
			type="button"
			{...{ [CELL_ATTR]: week.key }}
			data-role={week.role ?? undefined}
			data-now={week.isNow ? '' : undefined}
			data-unfilled={week.unfilled ? '' : undefined}
			data-event={week.event ? '' : undefined}
			tabIndex={tabbable ? 0 : -1}
			// A pointer already chose its week on press (the toolbar reads it off
			// the pointer's x); a click with no pointer behind it — Enter or Space
			// — is the keyboard's way to the same jump.
			onClick={(event) => {
				if (event.detail === 0) onSelect(week.key)
			}}
			aria-current={active ? 'true' : undefined}
			aria-label={week.label}
			title={week.label}
			className={cn(
				'focus-visible:outline-ring relative flex min-w-0 flex-1 flex-col justify-end pt-3.5 pb-[7px] focus-visible:outline-2 focus-visible:-outline-offset-2',
				// Outside a plan's phases (history from before it, a named phase) the
				// column is a neutral tone, so the strip still reads as one band.
				week.phaseTone ? PHASE_TINT[week.phaseTone] : 'bg-muted/70',
			)}
		>
			{week.event ? (
				<span className="text-foreground absolute inset-x-0 top-0 text-center text-[10px]/[12px]">
					⚑
				</span>
			) : null}
			{/* The bar is the column's middle 60%: a percentage *width* of the
			    column, where a percentage *padding* would be one of the whole
			    toolbar and blow every column up to a third of the strip. */}
			<span className="relative mx-auto block h-full w-[60%]">
				{week.height != null ? (
					<span
						data-strip-bar
						className={cn(
							'absolute inset-x-0 bottom-0 block rounded-t-[2px]',
							week.unfilled
								? 'border-foreground/45 border-[1.5px] border-b-0 border-dashed'
								: week.isNow
									? 'bg-primary/35'
									: easy
										? 'bg-foreground/14'
										: 'bg-foreground/26',
						)}
						style={{ height: `${week.height * 100}%` }}
					/>
				) : null}
				{week.doneHeight != null && week.doneHeight > 0 ? (
					<span
						data-strip-done
						className="bg-primary absolute inset-x-0 bottom-0 block rounded-t-[2px]"
						style={{ height: `${week.doneHeight * 100}%` }}
					/>
				) : null}
			</span>
			{/* Under the bar: today's week, then a lifting week. One mark each, and
			    the row is always there so every bar stands on the same baseline. */}
			<span className="absolute inset-x-0 bottom-0 flex h-[5px] items-end justify-center">
				{week.isNow ? (
					<span
						data-strip-today
						className="bg-primary block h-[3px] w-full rounded-[2px]"
					/>
				) : week.strength ? (
					<span className="bg-foreground/40 block size-[3px] rounded-full" />
				) : null}
			</span>
		</button>
	)
})
