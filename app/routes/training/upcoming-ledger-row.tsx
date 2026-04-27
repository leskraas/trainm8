import { Link } from 'react-router'
import { type ReactNode } from 'react'
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
	const activityLabel = getActivityLabel(session.workout.activityType)
	const statusLabel = getStatusLabel(session.status)

	return (
		<li>
			<Link
				to={detailPath}
				prefetch="intent"
				className="border-border/80 bg-card hover:bg-muted/45 focus-visible:ring-ring grid grid-cols-2 gap-3 rounded-4xl border p-4 text-left shadow-md transition-colors focus:outline-none focus-visible:ring-2 sm:grid-cols-[6.5rem_4.5rem_1fr_8rem_auto] sm:items-center sm:rounded-none sm:border-0 sm:bg-transparent sm:px-4 sm:py-3 sm:shadow-none"
			>
				<MobileCardField label="Time">
					<time
						className="text-body-xs text-muted-foreground tabular-nums"
						dateTime={scheduled.toISOString()}
					>
						{timeLabel}
					</time>
				</MobileCardField>
				<MobileCardField label="Activity">
					<span className="text-body-xs text-muted-foreground">
						{activityLabel}
					</span>
				</MobileCardField>
				<div className="order-first col-span-2 min-w-0 sm:order-none sm:col-span-1">
					<p className="text-body-sm leading-snug font-semibold tracking-[-0.01em]">
						{session.workout.title}
					</p>
					{session.workout.description ? (
						<p className="text-body-xs text-muted-foreground line-clamp-2">
							{session.workout.description}
						</p>
					) : null}
				</div>
				<MobileCardField className="col-span-2 sm:col-span-1" label="Shape">
					<WorkoutShape
						title={session.workout.title}
						segments={workoutShape.segments}
					/>
				</MobileCardField>
				<Badge
					variant={getStatusVariant(session.status)}
					className="w-fit sm:justify-self-end"
				>
					{statusLabel}
				</Badge>
			</Link>
		</li>
	)
}

function MobileCardField({
	label,
	className,
	children,
}: {
	label: string
	className?: string
	children: ReactNode
}) {
	return (
		<div className={cn('min-w-0', className)}>
			<span className="text-muted-foreground mb-1 block text-[0.65rem] font-semibold tracking-[0.16em] uppercase sm:hidden">
				{label}
			</span>
			{children}
		</div>
	)
}

function getActivityLabel(activityType: string) {
	if (activityType === 'bike') return 'Ride'
	return activityType.charAt(0).toUpperCase() + activityType.slice(1)
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
			<span className="text-muted-foreground text-body-2xs">
				Shape unavailable
			</span>
		)
	}

	return (
		<span
			aria-label={`Workout shape for ${title}`}
			className="bg-muted/50 ring-border/60 flex h-7 items-end gap-0.5 rounded-md px-1 py-1 ring-1"
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
