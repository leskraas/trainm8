/**
 * The season strip — the season's horizontal axis (#505 stories 17–18, 26).
 *
 * It is an **overview, not a second list**: every week of the season as one
 * bar, all of them on screen at once, and a frame over the weeks the stream is
 * showing. It used to be a row of 124px cells the athlete scrolled sideways,
 * three to a phone; a fixed strip shows the season's *shape* — where the build
 * climbs, where the easy weeks dip, where today sits in it — which three cells
 * at a time never could (ADR 0082).
 *
 * A bar is read in the **lead track**'s own unit (`TimelineStrip`): its height
 * is `max(target, planned)` against the season's largest, so a week planned
 * past its target stands taller than the target would have it, and what was
 * done fills it from the bottom. A bar is exactly as tall as its value and
 * never floored (ADR 0066 §3); a week with no figure draws no bar, and its name
 * says so. The bars are a glyph, not a chart with axes, so each week's numbers
 * ride on its button's accessible name rather than on a data table.
 *
 * Every week is a real button: tapping one jumps the stream there. Nothing here
 * animates (ADR 0077) — the frame moves because the reader moved.
 */
import {
	memo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
} from 'react'
import { SEASON_STRIP_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type AwayFromToday } from './anchoring.ts'
import { type TimelineStrip, type TimelineStripWeek } from './strip.ts'
import { CELL_ATTR } from './use-timeline-scroll.ts'

export function WeekStrip({
	strip,
	activeWeekKey,
	frame,
	away,
	onSelect,
	onToday,
}: {
	strip: TimelineStrip
	/** The week the stream is parked in. */
	activeWeekKey: string
	/** The first and last week the stream is showing — the frame's two edges. */
	frame: { from: string; to: string }
	/** Where today is from the reader: −1 above, 0 in view, +1 below. */
	away: AwayFromToday
	onSelect: (key: string) => void
	onToday: () => void
}) {
	const count = strip.weeks.length
	const from = Math.max(
		0,
		strip.weeks.findIndex((week) => week.key === frame.from),
	)
	const to = Math.max(
		from,
		strip.weeks.findIndex((week) => week.key === frame.to),
	)
	const barsRef = useRef<HTMLDivElement>(null)
	/** The week a scrub last landed on, so a drag jumps once per week crossed. */
	const scrubRef = useRef<string | null>(null)
	/**
	 * The one week that holds the tab stop (roving tabindex): the week the
	 * stream is parked in, until the arrow keys move it.
	 */
	const [focusKey, setFocusKey] = useState<string | null>(null)
	const tabKey =
		focusKey && strip.weeks.some((week) => week.key === focusKey)
			? focusKey
			: activeWeekKey

	/**
	 * The week under a pointer, read off its x across the **whole** strip, so a
	 * thumb lands on a week whichever pixel of the bar row it touches — a bar is
	 * ~9 px wide on a phone, and its full height is part of its target.
	 */
	function weekAt(clientX: number, target: EventTarget | null): string | null {
		const bars = barsRef.current
		const rect = bars?.getBoundingClientRect()
		if (bars && rect && rect.width > 0 && count > 0) {
			const index = Math.floor(((clientX - rect.left) / rect.width) * count)
			return strip.weeks[Math.min(count - 1, Math.max(0, index))]!.key
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
		barsRef.current
			?.querySelector<HTMLElement>(`[${CELL_ATTR}="${key}"]`)
			?.focus()
	}

	return (
		<div
			data-testid="week-strip"
			className="border-hairline-week border-b-hairline-edge flex flex-col gap-1.5 border-t border-b px-[14px] pt-[8px] pb-[10px]"
		>
			<div className="flex min-h-[28px] items-center justify-between gap-3">
				<span className="text-ink-dimmer font-mono text-[10.5px]/[1.35] uppercase">
					{SEASON_STRIP_LABELS.title} · {strip.unit}
				</span>
				{/*
				 * The "I dag" pill (#505, idea I): always there, quiet while today is
				 * on screen, and filled — with the way back in its arrow — once the
				 * reader has scrolled today away. It changes look rather than coming
				 * and going, so the way back is always in the same place, and it
				 * changes instantly: a look that eases in lags the scroll it reports.
				 */}
				<button
					type="button"
					data-today-pill
					data-away={away}
					aria-label={
						away < 0
							? SEASON_STRIP_LABELS.todayNameUp
							: away > 0
								? SEASON_STRIP_LABELS.todayNameDown
								: SEASON_STRIP_LABELS.todayName
					}
					onClick={onToday}
					className={cn(
						'h-[28px] flex-none rounded-[28px] border px-3 text-[11.5px]/[1] font-bold',
						away === 0
							? 'border-hairline-edge text-ink-dim'
							: 'bg-primary text-primary-foreground border-primary shadow-(--shadow-pill)',
					)}
				>
					{away < 0
						? SEASON_STRIP_LABELS.todayUp
						: away > 0
							? SEASON_STRIP_LABELS.todayDown
							: SEASON_STRIP_LABELS.today}
				</button>
			</div>
			{/*
			 * The weeks: a toolbar of buttons with **one** tab stop and the arrow
			 * keys to move along it, so the season is a single stop in the tab order
			 * rather than fifty. A pointer is read off its x over the whole row —
			 * press anywhere to land on that week, drag to scrub through the season
			 * — so a 9 px bar is never the target a thumb has to hit.
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
					scrubTo(weekAt(event.clientX, event.target))
				}}
				onPointerMove={(event) => {
					if (scrubRef.current == null) return
					scrubTo(weekAt(event.clientX, event.target))
				}}
				onPointerUp={() => {
					scrubRef.current = null
				}}
				onPointerCancel={() => {
					scrubRef.current = null
				}}
				className="relative flex h-[44px] [touch-action:none] items-stretch"
				style={{ '--strip-weeks': count } as CSSProperties}
			>
				{strip.weeks.map((week) => (
					<StripWeek
						key={week.key}
						week={week}
						active={week.key === activeWeekKey}
						tabbable={week.key === tabKey}
						onSelect={onSelect}
					/>
				))}
				{/* The frame: the weeks the stream is showing, outlined. Positioned
				    by index, so it is exactly the weeks in view and never a pixel
				    reading of a scroll position. */}
				{count > 0 ? (
					<span
						aria-hidden
						data-strip-frame
						className="border-primary pointer-events-none absolute -inset-y-[3px] rounded-[6px] border-2"
						style={{
							left: `${(from / count) * 100}%`,
							width: `${((to - from + 1) / count) * 100}%`,
						}}
					/>
				) : null}
			</div>
		</div>
	)
}

/**
 * One week. Memoised for the reason `WeekBlock` is (#503): the active week and
 * the frame change on scroll, and a season's worth of bars should not re-render
 * for a flag one of them reads.
 *
 * The bar's tone carries the rhythm — a hard week reads darker than an easy
 * one — so the season's 3:1 is visible as a pattern before any word is read.
 * The week today falls in carries a mark under its bar.
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
			className="focus-visible:outline-ring relative flex min-w-0 flex-1 flex-col justify-end px-px pb-[7px] focus-visible:outline-2 focus-visible:-outline-offset-1"
		>
			<span className="relative block h-full w-full">
				{week.height != null ? (
					<span
						data-strip-bar
						className={cn(
							'absolute inset-x-0 bottom-0 block rounded-t-[2px]',
							week.isNow
								? 'bg-primary/35'
								: easy
									? 'bg-foreground/12'
									: 'bg-foreground/25',
						)}
						style={{ height: `${week.height * 100}%` }}
					/>
				) : null}
				{week.doneHeight != null && week.doneHeight > 0 ? (
					<span
						data-strip-done
						className="bg-primary absolute inset-x-[1px] bottom-0 block rounded-t-[2px]"
						style={{ height: `${week.doneHeight * 100}%` }}
					/>
				) : null}
			</span>
			{/* Under the bar: today's week, then a lifting week. One mark each, and
			    the row is always there so every bar stands on the same baseline. */}
			<span className="absolute inset-x-0 bottom-0 flex h-[5px] items-end justify-center">
				{week.isNow ? (
					<span className="bg-primary block h-[3px] w-full rounded-[2px]" />
				) : week.strength ? (
					<span className="bg-foreground/40 block size-[3px] rounded-full" />
				) : null}
			</span>
		</button>
	)
})
