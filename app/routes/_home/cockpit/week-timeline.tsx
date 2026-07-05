// Week zone: the current week as a Mon→Sun timeline — every day a legible stop
// (discipline, title, duration·TSS, intensity shape), today highlighted, rest
// days distinct, done days checked, missed days crossed. A filmstrip that
// scrolls on mobile and lays out as seven columns on desktop.
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import { type WeekDayCell } from './presenter.ts'
import { DiscDot, SessionStructure, targetText } from './shared.tsx'

export function WeekTimeline({ cells }: { cells: WeekDayCell[] }) {
	// Mobile (#182): the strip must read as clearly swipeable. Below the tablet
	// breakpoint it bleeds to the edge of the hosting Tile (the -mx-5/px-5 pair
	// cancels the Tile's p-5 padding) so cards visibly clip at the edge, day
	// cards are sized so a third card always peeks at 390px, and scroll-snap
	// gives the swipe a natural card-by-card feel. From md up it is the plain
	// seven-column grid again.
	return (
		<div
			data-testid="week-timeline"
			className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:snap-none md:scroll-px-0 md:grid-cols-7 md:overflow-visible md:px-0"
		>
			{cells.map((cell) => (
				<WeekTimelineCell key={cell.date.toISOString()} cell={cell} />
			))}
		</div>
	)
}

function WeekTimelineCell({ cell }: { cell: WeekDayCell }) {
	const { isToday, state, session } = cell
	const rest = state === 'rest'
	const done = state === 'completed'
	const target = session ? targetText(session.target) : null
	return (
		<div
			className={cn(
				'flex min-w-[136px] shrink-0 snap-start flex-col rounded-xl border p-3 md:min-w-0 md:shrink',
				isToday
					? 'border-primary bg-primary/5'
					: rest
						? 'border-border/50 bg-muted/20 border-dashed'
						: 'border-border/60 bg-card',
			)}
		>
			<div className="flex items-center justify-between">
				<span
					className={cn(
						'text-[11px] font-medium tracking-wide uppercase',
						isToday ? 'text-primary' : 'text-muted-foreground',
					)}
				>
					{cell.dayLabel}
				</span>
				{done ? (
					<Icon name="check" className="size-3.5 text-emerald-500" />
				) : state === 'missed' ? (
					<Icon name="cross-1" className="size-3 text-rose-500" />
				) : isToday ? (
					<span className="bg-primary size-2 rounded-full" />
				) : session ? (
					<DiscDot discipline={session.discipline} />
				) : null}
			</div>
			{rest || !session ? (
				<p className="text-muted-foreground/60 mt-3 text-xs">
					Rest &amp; recover
				</p>
			) : (
				<>
					<p
						className={cn(
							'mt-2 text-sm leading-snug font-semibold',
							done ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{session.title}
					</p>
					<p className="text-muted-foreground mt-1 text-[11px]">
						{session.disciplineLabel}
						{target ? (
							<>
								{' · '}
								<span className="text-foreground font-medium tabular-nums">
									{target}
								</span>
							</>
						) : null}
					</p>
					<p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
						{session.durationMin != null ? `${session.durationMin} min` : null}
						{session.durationMin != null && session.tss != null ? ' · ' : null}
						{session.tss != null ? `${session.tss} TSS` : null}
					</p>
					{session.profile.length > 0 ? (
						<div className="mt-auto pt-3">
							<SessionStructure bars={session.profile} scale="mini" />
						</div>
					) : null}
				</>
			)}
		</div>
	)
}
