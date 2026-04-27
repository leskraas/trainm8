import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import {
	formatSessionTime,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'

type UpcomingLedgerRowProps = {
	session: UpcomingSession
	formatOptions: {
		locale?: Intl.LocalesArgument
		timeZone?: string
	}
}

export function UpcomingLedgerRow({
	session,
	formatOptions,
}: UpcomingLedgerRowProps) {
	const scheduled = new Date(session.scheduledAt)
	const timeLabel = formatSessionTime(session.scheduledAt, formatOptions)
	const detailPath = `/training/upcoming/${session.id}`

	return (
		<li>
			<Link
				to={detailPath}
				prefetch="intent"
				className="hover:bg-muted/50 focus-visible:ring-ring grid grid-cols-1 gap-2 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 sm:grid-cols-[6.5rem_4.5rem_1fr_auto] sm:items-center sm:gap-3"
			>
				<time
					className="text-body-sm text-muted-foreground tabular-nums"
					dateTime={scheduled.toISOString()}
				>
					{timeLabel}
				</time>
				<span className="text-body-sm text-muted-foreground capitalize">
					{session.workout.activityType}
				</span>
				<div className="min-w-0">
					<p className="text-body leading-snug font-medium">
						{session.workout.title}
					</p>
					{session.workout.description ? (
						<p className="text-body-sm text-muted-foreground line-clamp-2">
							{session.workout.description}
						</p>
					) : null}
				</div>
				<Badge
					variant={getStatusVariant(session.status)}
					className="w-fit sm:justify-self-end"
				>
					{getStatusLabel(session.status)}
				</Badge>
			</Link>
		</li>
	)
}
