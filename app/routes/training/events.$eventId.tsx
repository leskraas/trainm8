import { invariantResponse } from '@epic-web/invariant'
import { Form, Link, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	EVENT_KIND_LABELS,
	EVENT_STATUS_LABELS,
	eventStatusVariant,
	type EventKind,
	type EventStatus,
	type EventTarget,
	parseEventDisciplines,
	parseEventTarget,
} from '#app/utils/event-schema.ts'
import {
	cancelEvent,
	deleteEvent,
	getCandidateSessionsForEvent,
	getEventById,
	setEventResult,
	unlinkEventResult,
	type CandidateSession,
	type EventRecord,
} from '#app/utils/event.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { type Route } from './+types/events.$eventId.ts'

export const meta: Route.MetaFunction = ({ data }) => [
	{
		title: data?.event
			? `${data.event.name} | Event | Trainm8`
			: 'Event | Trainm8',
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, 'Event id is required', { status: 400 })

	const event = await getEventById(userId, params.eventId)
	invariantResponse(event, 'Event not found', { status: 404 })

	const candidates = await getCandidateSessionsForEvent(userId, params.eventId)

	return { event, candidates }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, 'Event id is required', { status: 400 })

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const deleted = await deleteEvent(userId, params.eventId)
		invariantResponse(deleted, 'Event not found', { status: 404 })
		throw redirect('/training/events')
	}

	if (intent === 'cancel') {
		const cancelled = await cancelEvent(userId, params.eventId)
		invariantResponse(cancelled, 'Event not found', { status: 404 })
		throw redirect(`/training/events/${params.eventId}`)
	}

	if (intent === 'set-result') {
		const sessionId = formData.get('sessionId') as string
		invariantResponse(sessionId, 'Session id is required', { status: 400 })
		const updated = await setEventResult(userId, params.eventId, sessionId)
		invariantResponse(updated, 'Event not found', { status: 404 })
		throw redirect(`/training/events/${params.eventId}`)
	}

	if (intent === 'unlink-result') {
		const updated = await unlinkEventResult(userId, params.eventId)
		invariantResponse(updated, 'Event not found', { status: 404 })
		throw redirect(`/training/events/${params.eventId}`)
	}

	invariantResponse(false, 'Unknown intent', { status: 400 })
}

function formatTargetLabel(target: EventTarget): string {
	switch (target.kind) {
		case 'time': {
			const h = Math.floor(target.seconds / 3600)
			const m = Math.floor((target.seconds % 3600) / 60)
			const s = target.seconds % 60
			return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		}
		case 'pace': {
			const m = Math.floor(target.secPerKm / 60)
			const s = target.secPerKm % 60
			return `${m}:${String(Math.round(s)).padStart(2, '0')}/km`
		}
		case 'distance': {
			if (target.meters >= 1000)
				return `${(target.meters / 1000).toFixed(1)} km`
			return `${target.meters} m`
		}
		case 'placement':
			return `Top ${target.position}`
		case 'finish':
			return 'Finish'
		case 'qualitative':
			return target.description
	}
}

function targetKindPrefix(kind: EventTarget['kind']): string {
	switch (kind) {
		case 'time':
			return 'Time: '
		case 'pace':
			return 'Pace: '
		case 'distance':
			return 'Distance: '
		case 'placement':
			return 'Placement: '
		default:
			return ''
	}
}

function TargetDisplay({ target }: { target: EventTarget }) {
	return (
		<div className="bg-muted rounded-lg p-3">
			<p className="text-body-2xs text-muted-foreground font-semibold tracking-wide uppercase">
				Target
			</p>
			<p className="text-body-sm font-medium capitalize">
				{targetKindPrefix(target.kind)}
				<span className="font-bold">{formatTargetLabel(target)}</span>
			</p>
		</div>
	)
}

function ResultLinkingSection({
	event,
	candidates,
}: {
	event: EventRecord
	candidates: CandidateSession[]
}) {
	if (event.status === 'cancelled') return null

	if (event.resultSessionId) {
		return (
			<div className="space-y-3">
				<h3 className="text-body-sm font-semibold">Result</h3>
				<div className="bg-muted flex items-center justify-between rounded-lg p-3">
					<div>
						<p className="text-body-xs text-muted-foreground">Linked session</p>
						<Link
							to={`/training/upcoming/${event.resultSessionId}`}
							className="text-body-sm font-medium underline-offset-2 hover:underline"
						>
							View session
						</Link>
					</div>
					<Form method="POST">
						<input type="hidden" name="intent" value="unlink-result" />
						<Button type="submit" variant="outline" size="sm">
							Unlink result
						</Button>
					</Form>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-3">
			<h3 className="text-body-sm font-semibold">Set result</h3>
			{candidates.length === 0 ? (
				<p className="text-muted-foreground text-body-sm">
					No matching sessions found on the event date(s) for the event's
					disciplines.
				</p>
			) : (
				<div className="space-y-2">
					<p className="text-muted-foreground text-body-xs">
						Sessions on {new Date(event.startDate).toLocaleDateString()} that
						match this event's disciplines:
					</p>
					{candidates.map((s) => (
						<Form
							key={s.id}
							method="POST"
							className="flex items-center justify-between rounded-lg border p-3"
						>
							<input type="hidden" name="intent" value="set-result" />
							<input type="hidden" name="sessionId" value={s.id} />
							<div>
								<p className="text-body-sm font-medium">{s.workout.title}</p>
								<p className="text-muted-foreground text-body-xs capitalize">
									{getDisciplineLabel(
										s.workout.discipline as Parameters<
											typeof getDisciplineLabel
										>[0],
									)}{' '}
									·{' '}
									{new Date(s.scheduledAt).toLocaleTimeString('en-GB', {
										hour: '2-digit',
										minute: '2-digit',
									})}
								</p>
							</div>
							<Button type="submit" variant="outline" size="sm">
								Set as result
							</Button>
						</Form>
					))}
				</div>
			)}
		</div>
	)
}

export default function EventDetailRoute({ loaderData }: Route.ComponentProps) {
	const { event, candidates } = loaderData
	const disciplines = parseEventDisciplines(event.disciplines)
	const target = parseEventTarget(event.target)

	const startLabel = new Date(event.startDate).toLocaleDateString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	})
	const endLabel = event.endDate
		? ` – ${new Date(event.endDate).toLocaleDateString('en-GB', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			})}`
		: ''

	return (
		<main className="container mx-auto max-w-2xl py-8">
			<div className="mb-6 flex items-center justify-between gap-3">
				<Link
					to="/training/events"
					prefetch="intent"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Back to events
				</Link>
				<div className="flex gap-2">
					{event.status === 'planned' ? (
						<>
							<Link
								to={`/training/events/${event.id}/edit`}
								prefetch="intent"
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								Edit
							</Link>
							<Form method="POST">
								<input type="hidden" name="intent" value="cancel" />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									onClick={(e) => {
										if (!window.confirm('Cancel this event?'))
											e.preventDefault()
									}}
								>
									Cancel event
								</Button>
							</Form>
						</>
					) : null}
					<Form method="POST">
						<input type="hidden" name="intent" value="delete" />
						<Button
							type="submit"
							variant="destructive"
							size="sm"
							onClick={(e) => {
								if (
									!window.confirm('Delete this event? This cannot be undone.')
								)
									e.preventDefault()
							}}
						>
							Delete
						</Button>
					</Form>
				</div>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-start justify-between gap-3">
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<span className="bg-primary text-primary-foreground flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold">
									{event.priority}
								</span>
								<CardTitle>{event.name}</CardTitle>
							</div>
							<CardDescription>
								{EVENT_KIND_LABELS[event.kind as EventKind]}
								{event.location ? ` · ${event.location}` : ''}
							</CardDescription>
							<p className="text-body-sm text-muted-foreground">
								{startLabel}
								{endLabel}
							</p>
						</div>
						<Badge variant={eventStatusVariant(event.status as EventStatus)}>
							{EVENT_STATUS_LABELS[event.status as EventStatus]}
						</Badge>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{disciplines.length > 0 ? (
						<div className="flex flex-wrap gap-1">
							{disciplines.map((d) => (
								<span
									key={d}
									className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs"
								>
									{getDisciplineLabel(d)}
								</span>
							))}
						</div>
					) : null}

					{target ? <TargetDisplay target={target} /> : null}

					{event.notes ? (
						<p className="text-body-sm whitespace-pre-wrap">{event.notes}</p>
					) : null}

					<hr className="border-border/70" />

					<ResultLinkingSection event={event} candidates={candidates} />
				</CardContent>
			</Card>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
