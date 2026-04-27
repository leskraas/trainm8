import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import {
	formatSessionTime,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'
import {
	deriveWorkoutShape,
	type WorkoutShapeSegment,
	type WorkoutShapeTone,
} from '#app/utils/upcoming-ledger-workout-shape.ts'
import { cn } from '#app/utils/misc.tsx'

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
	const workoutShape = deriveWorkoutShape(session.workout)

	return (
		<li>
			<Link
				to={detailPath}
				prefetch="intent"
				className="hover:bg-muted/50 focus-visible:ring-ring grid grid-cols-1 gap-2 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 sm:grid-cols-[6.5rem_4.5rem_1fr_8rem_auto] sm:items-center sm:gap-3"
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
				<WorkoutShape
					title={session.workout.title}
					segments={workoutShape.segments}
				/>
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

function WorkoutShape({
	title,
	segments,
}: {
	title: string
	segments: WorkoutShapeSegment[]
}) {
	if (segments.length === 0) {
		return (
			<span className="text-muted-foreground text-xs">Shape unavailable</span>
		)
	}

	return (
		<span
			aria-label={`Workout shape for ${title}`}
			className="flex h-7 items-end gap-0.5"
		>
			{segments.map((segment) => (
				<span
					key={segment.id}
					title={getSegmentTitle(segment)}
					className={cn(
						'block min-w-2 flex-1 rounded-sm',
						getSegmentHeightClass(segment.tone),
						getSegmentColorClass(segment.tone),
					)}
				/>
			))}
		</span>
	)
}

function getSegmentTitle(segment: WorkoutShapeSegment) {
	return segment.intensity
		? `${segment.label}, ${segment.intensity}`
		: `${segment.label}, intensity unavailable`
}

function getSegmentHeightClass(tone: WorkoutShapeTone) {
	switch (tone) {
		case 'rest':
			return 'h-1.5'
		case 'easy':
			return 'h-3'
		case 'moderate':
			return 'h-4'
		case 'hard':
			return 'h-5'
		case 'max':
			return 'h-7'
		default:
			return 'h-2.5'
	}
}

function getSegmentColorClass(tone: WorkoutShapeTone) {
	switch (tone) {
		case 'rest':
			return 'bg-muted-foreground/30'
		case 'easy':
			return 'bg-primary/35'
		case 'moderate':
			return 'bg-primary/55'
		case 'hard':
			return 'bg-primary/80'
		case 'max':
			return 'bg-primary'
		default:
			return 'bg-muted-foreground/40'
	}
}
