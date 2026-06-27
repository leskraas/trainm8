// Week zone: the current week as a Mon→Sun timeline — every day a legible stop
// (discipline, title, duration·TSS, intensity shape), today highlighted, rest
// days distinct, done days checked, missed days crossed. A filmstrip that
// scrolls on mobile and lays out as seven columns on desktop.
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import { type WeekDayCell } from './presenter.ts'
import { DiscDot, SessionStructure, weekdayShort } from './shared.tsx'

export function WeekTimeline({ cells }: { cells: WeekDayCell[] }) {
	return (
		<div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-7 md:overflow-visible">
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
	return (
		<div
			className={cn(
				'flex min-w-[150px] flex-col rounded-xl border p-3 md:min-w-0',
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
					{weekdayShort(cell.date)} {cell.date.getDate()}
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
				<p className="text-muted-foreground/60 mt-3 text-xs">Rest &amp; recover</p>
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
