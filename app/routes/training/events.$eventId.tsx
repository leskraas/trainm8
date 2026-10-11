/**
 * One Event: what it is, when, the target, the notes and — once it has been
 * run — the session that is its result. In Norwegian (ADR 0081) on the design
 * system's card, type steps and buttons (ADR 0085).
 */
import { invariantResponse } from '@epic-web/invariant'
import { Form, Link, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Separator } from '#app/components/ui/separator.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	eventStatusVariant,
	isEventKind,
	type EventStatus,
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
import { formatNbDate, formatTime } from '#app/utils/format.ts'
import {
	EVENTS_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_EVENT_KIND_LABELS,
	NB_EVENT_STATUS_LABELS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/events.$eventId.ts'
import { PriorityDisc } from './__event-parts.tsx'
import {
	eventDayLongText,
	eventDaysText,
	targetText,
} from './__event-target.ts'

const L = EVENTS_LABELS

export const meta: Route.MetaFunction = ({ data }) => [
	{
		title: data?.event ? `${data.event.name} | Trainm8` : L.metaTitle,
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, L.notFound, { status: 400 })

	const event = await getEventById(userId, params.eventId)
	invariantResponse(event, L.notFound, { status: 404 })

	const candidates = await getCandidateSessionsForEvent(userId, params.eventId)

	return { event, candidates }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, L.notFound, { status: 400 })

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const deleted = await deleteEvent(userId, params.eventId)
		invariantResponse(deleted, L.notFound, { status: 404 })
		throw redirect('/training/events')
	}

	if (intent === 'cancel') {
		const cancelled = await cancelEvent(userId, params.eventId)
		invariantResponse(cancelled, L.notFound, { status: 404 })
		throw redirect(`/training/events/${params.eventId}`)
	}

	if (intent === 'set-result') {
		const sessionId = formData.get('sessionId') as string
		invariantResponse(sessionId, 'Session id is required', { status: 400 })
		const updated = await setEventResult(userId, params.eventId, sessionId)
		invariantResponse(updated, L.notFound, { status: 404 })
		throw redirect(`/training/events/${params.eventId}`)
	}

	if (intent === 'unlink-result') {
		const updated = await unlinkEventResult(userId, params.eventId)
		invariantResponse(updated, L.notFound, { status: 404 })
		throw redirect(`/training/events/${params.eventId}`)
	}

	invariantResponse(false, 'Unknown intent', { status: 400 })
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-overline text-muted-foreground mb-2 uppercase">
			{children}
		</h2>
	)
}

function ResultSection({
	event,
	candidates,
}: {
	event: EventRecord
	candidates: CandidateSession[]
}) {
	const timeZone = useAthleteTimezone()
	if (event.status === 'cancelled') return null

	if (event.resultSessionId) {
		return (
			<section>
				<SectionHeading>{L.result}</SectionHeading>
				<div className="bg-muted/60 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-3">
					<div className="min-w-0">
						<p className="text-muted-foreground text-footnote">
							{L.linkedSession}
						</p>
						<Link
							to={`/training/sessions/${event.resultSessionId}`}
							className="text-callout text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
						>
							{L.viewSession}
						</Link>
					</div>
					<Form method="POST">
						<input type="hidden" name="intent" value="unlink-result" />
						<Button type="submit" variant="outline">
							{L.unlink}
						</Button>
					</Form>
				</div>
			</section>
		)
	}

	return (
		<section>
			<SectionHeading>{L.setResult}</SectionHeading>
			{candidates.length === 0 ? (
				<p className="text-muted-foreground text-footnote">{L.noCandidates}</p>
			) : (
				<div className="space-y-2">
					<p className="text-muted-foreground text-footnote">
						{L.candidatesOn(formatNbDate(event.startDate, 'UTC'))}
					</p>
					<ul className="space-y-2">
						{candidates.map((s) => (
							<li key={s.id}>
								<Form
									method="POST"
									className="bg-muted/60 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-3"
								>
									<input type="hidden" name="intent" value="set-result" />
									<input type="hidden" name="sessionId" value={s.id} />
									<div className="min-w-0 [overflow-wrap:anywhere]">
										<p className="text-callout font-medium">
											{s.workout?.title || L.untitledSession}
										</p>
										<p className="text-muted-foreground text-footnote tabular-nums">
											{s.workout
												? `${nbDisciplineLabel(s.workout.discipline)} · `
												: null}
											{formatTime(s.scheduledAt, timeZone)}
										</p>
									</div>
									<Button type="submit" variant="outline">
										{L.setAsResult}
									</Button>
								</Form>
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	)
}

function CancelEventDialog() {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={<Button variant="outline">{L.cancel}</Button>}
			/>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{L.cancelTitle}</AlertDialogTitle>
					<AlertDialogDescription>{L.cancelBody}</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="POST">
					<input type="hidden" name="intent" value="cancel" />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">{L.keep}</AlertDialogCancel>
						<AlertDialogAction type="submit">
							{L.cancelConfirm}
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function DeleteEventDialog({ eventStatus }: { eventStatus: string }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant="destructive">
						<Icon name="trash" size="sm" aria-hidden="true" />
						{L.delete}
					</Button>
				}
			/>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{L.deleteTitle}</AlertDialogTitle>
					<AlertDialogDescription>
						{L.deleteBody(eventStatus === 'planned')}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="POST">
					<input type="hidden" name="intent" value="delete" />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">{L.keep}</AlertDialogCancel>
						<AlertDialogAction type="submit" variant="destructive">
							{L.deleteConfirm}
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogContent>
		</AlertDialog>
	)
}

export default function EventDetailRoute({ loaderData }: Route.ComponentProps) {
	const { event, candidates } = loaderData
	const disciplines = parseEventDisciplines(event.disciplines)
	const target = parseEventTarget(event.target)
	const kind = isEventKind(event.kind) ? NB_EVENT_KIND_LABELS[event.kind] : null
	// Event dates are day-anchored (stored as UTC midnight), so they are read
	// in UTC: the named day never shifts with a viewer, and server and client
	// render the same markup (#172).
	const days = event.endDate
		? eventDaysText(event.startDate, event.endDate)
		: eventDayLongText(event.startDate)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={kind ?? L.title}
				back={{ to: '/training/events', label: L.title }}
				className="mb-6"
			/>

			<Card>
				<CardContent className="flex flex-col gap-6">
					<header className="flex items-start gap-3">
						<PriorityDisc
							priority={event.priority}
							className="text-callout mt-0.5 size-8"
						/>
						{/* The name wraps in full, however long: this is the one place
						    it is read whole. The status sits under it, not beside it,
						    so a 120-character name keeps the card's width. */}
						<div className="min-w-0 flex-1 space-y-1.5 [overflow-wrap:anywhere]">
							<h2 className="text-title">{event.name}</h2>
							<p className="text-muted-foreground text-footnote tabular-nums">
								{days}
								{event.location ? ` · ${event.location}` : ''}
							</p>
							<Badge variant={eventStatusVariant(event.status as EventStatus)}>
								{NB_EVENT_STATUS_LABELS[event.status as EventStatus] ??
									event.status}
							</Badge>
						</div>
					</header>

					{disciplines.length > 0 ? (
						<ul className="flex flex-wrap gap-1.5">
							{disciplines.map((d) => (
								<li key={d}>
									<Badge variant="secondary">{NB_DISCIPLINE_LABELS[d]}</Badge>
								</li>
							))}
						</ul>
					) : null}

					{target ? (
						<section>
							<SectionHeading>{L.targetHeading}</SectionHeading>
							<p className="text-heading [overflow-wrap:anywhere] tabular-nums">
								{targetText(target)}
							</p>
						</section>
					) : null}

					{event.notes ? (
						<p className="text-body [overflow-wrap:anywhere] whitespace-pre-wrap">
							{event.notes}
						</p>
					) : null}

					{event.status !== 'cancelled' ? (
						<>
							<Separator />
							<ResultSection event={event} candidates={candidates} />
						</>
					) : null}
				</CardContent>
			</Card>

			{/* Cancel vs Delete are different promises (#179): Cancel keeps the
			    Event with a cancelled status, Delete destroys it. Each dialog
			    spells out what its action does — and names the other — so the
			    two side-by-side buttons can't be mistaken for each other. The row
			    wraps (never one non-wrapping line) so it can't overflow 390px. */}
			<div className="mt-6 flex flex-wrap gap-2">
				{event.status === 'planned' ? (
					<>
						<Link
							to={`/training/events/${event.id}/edit`}
							prefetch="intent"
							className={buttonVariants({ variant: 'outline' })}
						>
							<Icon name="pencil-1" size="sm" aria-hidden="true" />
							{L.edit}
						</Link>
						<CancelEventDialog />
					</>
				) : null}
				<DeleteEventDialog eventStatus={event.status} />
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
