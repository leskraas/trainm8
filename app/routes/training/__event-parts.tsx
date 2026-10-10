/**
 * Small pieces the Events pages share: the priority disc a list row and the
 * detail both lead with.
 */
import { EVENTS_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'

/** The priority letter in a disc, as on Sesong's Events card. */
export function PriorityDisc({
	priority,
	className = 'size-7 text-footnote',
}: {
	priority: string
	className?: string
}) {
	return (
		<span
			role="img"
			aria-label={EVENTS_LABELS.priority(priority)}
			className={cn(
				'bg-primary text-primary-foreground flex flex-none items-center justify-center rounded-full font-semibold tabular-nums',
				className,
			)}
		>
			{priority}
		</span>
	)
}
