/**
 * The week strip — the season's horizontal axis.
 *
 * It is an **overview, not a second list**: a cell shows only the shape of a
 * week (which days happened, how heavy it is) and never a session name, so the
 * two axes do not compete for attention. Vertical is where the athlete reads;
 * horizontal is where they navigate.
 *
 * The whole season is rendered, not a window over it. Weeks outside the stream's
 * loaded window are dimmed rather than dropped, because an overview with holes
 * in it is not an overview — and tapping a dimmed cell is exactly how a week
 * gets loaded.
 */
import { formatLoad, formatTss } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import { type DayDot, type TimelineWeek } from './presenter.ts'
import { CELL_ATTR } from './use-timeline-scroll.ts'

/**
 * A day's dot. Size carries emphasis and fill carries state: a done day is
 * solid, a planned one an outline, a missed one an outline in the failure
 * colour, and today the largest and loudest of the five.
 */
const DOT_CLASS: Record<DayDot, string> = {
	empty: 'size-[5px] bg-hairline',
	done: 'size-[7px] bg-primary/80',
	planned: 'size-[7px] border border-foreground/30',
	missed: 'size-[7px] border border-destructive',
	today: 'size-[9px] bg-primary',
}

const DOT_LABEL: Record<DayDot, string> = {
	empty: 'nothing',
	done: 'done',
	planned: 'planned',
	missed: 'missed',
	today: 'today',
}

const WEEKDAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
]

export function WeekStrip({
	weeks,
	activeWeekKey,
	loadedKeys,
	heaviestPlannedTss,
	raceDayLabel,
	onSelect,
	stripRef,
}: {
	weeks: TimelineWeek[]
	activeWeekKey: string
	/** The weeks currently mounted in the stream; the rest render dimmed. */
	loadedKeys: ReadonlySet<string>
	heaviestPlannedTss: number
	/** `25 Oct` — the far end of the season; null without a plan to anchor one. */
	raceDayLabel: string | null
	onSelect: (key: string) => void
	stripRef: (node: HTMLDivElement | null) => void
}) {
	return (
		<div
			ref={stripRef}
			data-testid="week-strip"
			aria-label="The season, week by week"
			// `proximity` rather than `mandatory`: a flick across three months
			// should not be dragged back to the nearest cell.
			className="border-hairline-week border-b-hairline-edge flex snap-x snap-proximity gap-2 overflow-x-auto [scroll-behavior:smooth] border-t border-b px-[14px] pt-[10px] pb-[12px]"
		>
			{/* The strip is the whole season, so its near end is the season's near
			    end — unconditionally, unlike the stream's start cap, which appears
			    only once the reader has scrolled that far back. */}
			<span className="text-ink-dimmest flex w-[78px] flex-none items-center font-mono text-[9.5px]/[1.35] uppercase">
				No earlier weeks
			</span>
			{weeks.map((week) => (
				<WeekCell
					key={week.key}
					week={week}
					active={week.key === activeWeekKey}
					loaded={loadedKeys.has(week.key)}
					heaviestPlannedTss={heaviestPlannedTss}
					onSelect={onSelect}
				/>
			))}
			{raceDayLabel ? (
				<span className="text-primary flex w-[86px] flex-none items-center font-mono text-[9.5px]/[1.35] font-bold uppercase">
					{raceDayLabel} race day
				</span>
			) : null}
		</div>
	)
}

function WeekCell({
	week,
	active,
	loaded,
	heaviestPlannedTss,
	onSelect,
}: {
	week: TimelineWeek
	active: boolean
	loaded: boolean
	heaviestPlannedTss: number
	onSelect: (key: string) => void
}) {
	const done = week.doneTss ?? 0
	// A week with no plan is measured against what it actually was, so an
	// imported week still draws a bar instead of an empty track.
	const planned = week.plannedTss ?? done
	return (
		<button
			type="button"
			{...{ [CELL_ATTR]: week.key }}
			onClick={() => onSelect(week.key)}
			aria-current={active ? 'true' : undefined}
			className={cn(
				'hover:border-primary flex w-[124px] flex-none snap-center flex-col items-start gap-2 rounded-[12px] border px-[10px] py-[9px] text-left transition-colors',
				active ? 'border-primary/55 bg-primary/10' : 'border-hairline-week',
				loaded ? 'opacity-100' : 'opacity-66',
			)}
		>
			<span
				className={cn(
					'font-mono text-[10.5px]/[1.25] font-bold tracking-[0.01em] uppercase',
					active
						? 'text-primary'
						: loaded
							? 'text-foreground'
							: 'text-muted-foreground',
				)}
			>
				{week.stripLabel}
			</span>
			<span className="flex h-[10px] items-center gap-1">
				{week.dayDots.map((dot, index) => (
					<span
						key={WEEKDAYS[index]}
						title={`${WEEKDAYS[index]} — ${DOT_LABEL[dot]}`}
						className={cn('flex-none rounded-[9px]', DOT_CLASS[dot])}
					/>
				))}
			</span>
			<span className="flex w-full flex-col gap-1">
				{/* Planned load against the season's heaviest week, with what was
				    actually done filled inside it — so the bar says both how heavy
				    the week is and how much of it has happened.

				    Three nested layers, so the bar paints three bands: the track,
				    the planned load, the part of it that has happened. `data-load-bar`
				    marks the outermost so a test can read those bands off the pixels
				    — a layer tuned for one theme composites to nothing in the other
				    while its class name still looks right. */}
				<span
					data-load-bar
					className="bg-hairline block h-[3px] w-full rounded-[3px]"
				>
					<span
						className="bg-foreground/14 block h-[3px] rounded-[3px]"
						style={{
							width: `${Math.min(100, Math.round((planned / heaviestPlannedTss) * 100))}%`,
						}}
					>
						<span
							className={cn(
								'block h-[3px] rounded-[3px]',
								week.imported ? 'bg-foreground/30' : 'bg-primary',
							)}
							style={{
								width: planned
									? `${Math.round((Math.min(done, planned) / planned) * 100)}%`
									: '0%',
							}}
						/>
					</span>
				</span>
				<span className="flex items-baseline justify-between gap-1.5">
					<span className="text-ink-dimmer text-[9.5px]/[1.2]">
						{week.stripPhaseLabel}
					</span>
					<span
						className={cn(
							'font-mono text-[9.5px]/[1.2] font-semibold tabular-nums',
							week.isNow ? 'text-primary' : 'text-ink-dim',
						)}
					>
						<CellLoad week={week} />
					</span>
				</span>
			</span>
		</button>
	)
}

/**
 * The cell's load figure. The current week is the one place both sides belong —
 * it is the week being decided — so it reads `48 / 312`. Every other week shows
 * the single number that exists: what was done, or what is planned, never a
 * pair with a zero in it.
 */
function CellLoad({ week }: { week: TimelineWeek }) {
	if (week.isNow && week.plannedTss != null) {
		// Bare figures: a 124px cell has room for `176 / 159` beside the phase
		// word and not for a unit, and the week header below states TSS in full.
		return (
			<>
				{formatLoad(week.doneTss ?? 0)} / {formatLoad(week.plannedTss)}
			</>
		)
	}
	if (week.doneTss != null) return <>{formatTss(week.doneTss)}</>
	if (week.plannedTss != null) return <>{formatTss(week.plannedTss)}</>
	return null
}
