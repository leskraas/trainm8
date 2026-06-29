import { cn } from '#app/utils/misc.tsx'
import {
	type ProfileBar,
	type TrainingZone,
} from '#app/utils/session-profile.ts'

const ZONE_COLOR: Record<TrainingZone, string> = {
	1: 'bg-sky-400 dark:bg-sky-500',
	2: 'bg-emerald-400 dark:bg-emerald-500',
	3: 'bg-amber-400 dark:bg-amber-500',
	4: 'bg-orange-500',
	5: 'bg-rose-500 dark:bg-rose-600',
}

const ZONE_HEIGHT: Record<TrainingZone, string> = {
	1: 'h-2',
	2: 'h-3',
	3: 'h-4',
	4: 'h-5',
	5: 'h-6',
}

/**
 * Render an intensity profile as zone-coloured bars whose widths track each
 * segment's duration. Shared by planned workouts (authored steps) and recordings
 * (HR-derived phases) so both read identically. An empty profile renders a muted
 * "—" rather than an empty strip.
 */
export function ProfileBars({
	bars,
	className,
}: {
	bars: ProfileBar[]
	className?: string
}) {
	if (bars.length === 0) {
		return <span className="text-muted-foreground/60 text-xs">—</span>
	}
	const hasDuration = bars.some((b) => b.durationSec > 0)
	return (
		<span
			aria-hidden
			className={cn(
				'flex h-6 w-full items-end gap-px overflow-hidden',
				className,
			)}
		>
			{bars.map((bar) => (
				<span
					key={bar.id}
					style={
						hasDuration ? { flexGrow: bar.durationSec || 0.001 } : undefined
					}
					className={cn(
						'block min-w-px rounded-[1px]',
						hasDuration ? '' : 'flex-1',
						bar.zone == null
							? 'bg-muted-foreground/30 h-1.5'
							: ZONE_COLOR[bar.zone],
						bar.zone == null ? '' : ZONE_HEIGHT[bar.zone],
					)}
				/>
			))}
		</span>
	)
}
