import { type ReactNode } from 'react'
import { Badge } from '#app/components/ui/badge.tsx'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import {
	getDisciplineLabel,
	getSessionDiscipline,
	getStatusLabel,
	getStatusVariant,
	isRecordingOnly,
} from '#app/utils/training.ts'
import {
	deriveWorkoutShape,
	type WorkoutShapeSegment,
	type WorkoutShapeTone,
} from '#app/utils/upcoming-ledger-workout-shape.ts'
import { cn } from '#app/utils/misc.tsx'
import { UpcomingSessionCard } from './upcoming-session-card.tsx'

type UpcomingLedgerRowProps = {
	session: UpcomingSession
}

export function UpcomingLedgerRow({ session }: UpcomingLedgerRowProps) {
	const presenter = useSessionPresenter()
	const scheduled = new Date(session.scheduledAt)
	const timeLabel = presenter.presentSession(session).timeOfDay
	const detailPath = `/training/upcoming/${session.id}`
	const workoutShape = deriveWorkoutShape(session.workout)
	const activityLabel = getDisciplineLabel(getSessionDiscipline(session))
	const statusLabel = getStatusLabel(session.status)
	const recordingOnly = isRecordingOnly(session)

	return (
		<li>
			<UpcomingSessionCard to={detailPath}>
				<MobileCardField label="Time">
					<time
						className="text-body-xs text-muted-foreground tabular-nums"
						dateTime={scheduled.toISOString()}
					>
						{timeLabel}
					</time>
				</MobileCardField>
				<MobileCardField label="Discipline">
					<span className="text-body-xs text-muted-foreground">
						{activityLabel}
					</span>
				</MobileCardField>
				<div className="order-first col-span-2 min-w-0 sm:order-none sm:col-span-1">
					<div className="flex items-center gap-2">
						<p className="text-body-sm leading-snug font-semibold tracking-[-0.01em]">
							{session.workout?.title ?? `${activityLabel} recording`}
						</p>
						{recordingOnly ? (
							<span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase">
								recorded
							</span>
						) : null}
					</div>
					{session.workout?.description ? (
						<p className="text-body-xs text-muted-foreground line-clamp-2">
							{session.workout.description}
						</p>
					) : null}
				</div>
				<MobileCardField className="col-span-2 sm:col-span-1" label="Shape">
					<WorkoutShape
						title={session.workout?.title ?? `${activityLabel} recording`}
						segments={workoutShape.segments}
					/>
				</MobileCardField>
				<Badge
					variant={getStatusVariant(session.status)}
					className="w-fit sm:justify-self-end"
				>
					{statusLabel}
				</Badge>
			</UpcomingSessionCard>
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

function WorkoutShape({
	title,
	segments,
}: {
	title: string
	segments: WorkoutShapeSegment[]
}) {
	const hasDuration = segments.some((s) => s.durationSec > 0)

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
					style={hasDuration ? { flexGrow: segment.durationSec } : undefined}
					className={cn(
						'block rounded-sm',
						getSegmentWidthClass(hasDuration, segment.durationSec),
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

function getSegmentWidthClass(hasDuration: boolean, durationSec: number) {
	if (!hasDuration) return 'min-w-2 flex-1'
	return durationSec > 0 ? 'min-w-1' : 'min-w-0 flex-grow-0'
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
