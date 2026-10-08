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
import { memo, type CSSProperties } from 'react'
import { SEASON_STRIP_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type AwayFromToday } from './anchoring.ts'
import { type TimelineStrip, type TimelineStripWeek } from './presenter.ts'
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
	return (
		<div
			data-testid="week-strip"
			// A named, keyboard-reachable region: the strip is one of the screen's
			// two horizontal axes (ADR 0065 §8), and its weeks are real buttons.
			role="region"
			aria-label={SEASON_STRIP_LABELS.region}
			tabIndex={0}
			className="border-hairline-week border-b-hairline-edge focus-visible:outline-ring flex flex-col gap-1.5 border-t border-b px-[14px] pt-[8px] pb-[10px] focus-visible:outline-2 focus-visible:-outline-offset-2"
		>
			<div className="flex min-h-[28px] items-center justify-between gap-3">
				<span className="text-ink-dimmer font-mono text-[9.5px]/[1.35] uppercase">
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
			<div
				data-strip-bars
				className="relative flex h-[44px] items-stretch"
				style={{ '--strip-weeks': count } as CSSProperties}
			>
				{strip.weeks.map((week) => (
					<StripWeek
						key={week.key}
						week={week}
						active={week.key === activeWeekKey}
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
	onSelect,
}: {
	week: TimelineStripWeek
	active: boolean
	onSelect: (key: string) => void
}) {
	const easy = week.role === 'recovery' || week.role === 'taper'
	return (
		<button
			type="button"
			{...{ [CELL_ATTR]: week.key }}
			data-role={week.role ?? undefined}
			data-now={week.isNow ? '' : undefined}
			onClick={() => onSelect(week.key)}
			aria-current={active ? 'true' : undefined}
			aria-label={week.label}
			title={week.label}
			className="relative flex min-w-0 flex-1 flex-col justify-end px-px pb-[7px]"
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
