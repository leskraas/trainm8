/**
 * One Event: what it is, when, the target, the notes and — once it has been
 * run — the session that is its result. In Norwegian (ADR 0081) on the design
 * system's card, type steps and buttons (ADR 0085).
 *
 * The result section (#670, ADR 0117) shows the time the watch measured as the
 * Event's **Performance Result**, or says in the athlete's terms why there is
 * none and offers the fix in place: the **Event Distance**, the one thing this
 * page writes for a done Event. Every state reads the same rule the writer
 * does (`eventResultFrom`), and the racePace line reads the resolver's choice.
 */
import { invariantResponse } from '@epic-web/invariant'
import { useRef, useState } from 'react'
import { data, Form, Link, redirect, useActionData } from 'react-router'
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
import {
	Collapsible,
	CollapsibleContent,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Separator } from '#app/components/ui/separator.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	readEventResultView,
	type EventResultView,
} from '#app/utils/event-result.server.ts'
import {
	eventDistanceChoiceOf,
	eventDistanceFromChoice,
	eventDistanceInText,
	eventDistanceName,
	nbMeasuredKm,
} from '#app/utils/event-result.ts'
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
	setEventDistance,
	setEventResult,
	unlinkEventResult,
	type CandidateSession,
	type EventRecord,
} from '#app/utils/event.server.ts'
import {
	formatClockDuration,
	formatNbDate,
	formatPace,
	formatTime,
} from '#app/utils/format.ts'
import {
	EVENTS_LABELS,
	INTENSITY_DISPLAY_WORDS,
	NB_DISCIPLINE_LABELS,
	NB_EVENT_KIND_LABELS,
	NB_EVENT_STATUS_LABELS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { paceSecPerKm } from '#app/utils/performance-result-entry.ts'
import { recordingSource } from '#app/utils/source-attribution.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/events.$eventId.ts'
import {
	EventDistancePicker,
	type EventDistanceValue,
} from './__event-distance.tsx'
import { PriorityDisc } from './__event-parts.tsx'
import {
	eventDayLongText,
	eventDaysText,
	targetText,
} from './__event-target.ts'

const L = EVENTS_LABELS
const RESULTS_PATH = '/settings/training/resultater'

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

	const [candidates, resultView] = await Promise.all([
		getCandidateSessionsForEvent(userId, params.eventId),
		event.resultSessionId && event.status !== 'cancelled'
			? readEventResultView(userId, params.eventId)
			: Promise.resolve(null),
	])

	return { event, candidates, result: presentResult(resultView) }
}

/** The result section's view, built server-side from the rule's verdict and
 * the stored row, so the page renders words and never re-derives the rule. */
function presentResult(view: EventResultView | null) {
	if (!view) return null
	const { verdict, stored } = view
	if (verdict.kind === 'ineligible') return { kind: 'ineligible' as const }
	if (verdict.kind === 'result' && stored) {
		const pace = paceSecPerKm(stored.timeSec, stored.distanceM)
		const race = eventDistanceInText(stored.distanceM)
		const racePace = stored.anchor
			? (INTENSITY_DISPLAY_WORDS.racePace[stored.anchor] ?? race)
			: null
		const credit = stored.recording ? recordingSource(stored.recording) : null
		return {
			kind: 'saved' as const,
			id: stored.id,
			time: formatClockDuration(stored.timeSec),
			pace: pace == null ? null : formatPace(pace),
			distance: eventDistanceName(stored.distanceM),
			credit: credit?.text ?? null,
			creditOwed: credit?.owed ?? false,
			use:
				stored.use === 'in-use' && racePace
					? { text: L.inUse(racePace), link: false }
					: stored.use === 'typed-same-day' && racePace
						? { text: L.typedSameDay(race, racePace), link: true }
						: stored.use === 'newer' && racePace
							? { text: L.newerInUse(race, racePace), link: true }
							: { text: L.notAnchor(race), link: false },
		}
	}
	if (verdict.kind !== 'missing') return { kind: 'ineligible' as const }
	switch (verdict.reason) {
		case 'no-distance':
			return { kind: 'ask-distance' as const }
		case 'distance-mismatch': {
			const race = eventDistanceInText(verdict.raceDistanceM)
			return {
				kind: 'mismatch' as const,
				body: L.mismatch(nbMeasuredKm(verdict.measuredM), race),
				typed: L.mismatchTypedBefore(race),
			}
		}
		case 'no-recording-distance':
			return {
				kind: 'why' as const,
				title: L.noTimeSaved,
				body: L.noRecordingDistance(eventDistanceInText(verdict.raceDistanceM)),
			}
		case 'other-discipline':
			return {
				kind: 'why' as const,
				title: L.noTimeSaved,
				body: L.otherDiscipline(nbDisciplineLabel(verdict.discipline)),
			}
		case 'no-recording':
			return { kind: 'why' as const, title: L.waiting, body: L.waitingBody }
	}
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

	if (intent === 'set-distance') {
		const read = eventDistanceFromChoice(
			formData.get('distance')?.toString(),
			formData.get('distanceKm')?.toString(),
		)
		if (!read.ok) {
			return data({ distanceError: L.distanceKmInvalid }, { status: 400 })
		}
		const updated = await setEventDistance(
			userId,
			params.eventId,
			read.distanceM,
		)
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

type ResultViewData = NonNullable<Route.ComponentProps['loaderData']['result']>

function ResultSection({
	event,
	candidates,
	result,
}: {
	event: EventRecord
	candidates: CandidateSession[]
	result: ResultViewData | null
}) {
	const timeZone = useAthleteTimezone()
	if (event.status === 'cancelled') return null

	if (event.resultSessionId) {
		if (!result || result.kind === 'ineligible') {
			return <LinkedSession sessionId={event.resultSessionId} />
		}
		return (
			<section>
				<SectionHeading>{L.result}</SectionHeading>
				<EventResultWell
					event={event}
					sessionId={event.resultSessionId}
					result={result}
				/>
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
					{event.distanceM ? (
						<p className="text-muted-foreground text-footnote">
							{L.candidatesDistance(eventDistanceInText(event.distanceM))}
						</p>
					) : null}
				</div>
			)}
		</section>
	)
}

/** The linked session with no result to show: an Event that makes none (a
 * fitness goal, not exactly run), as the section read before #670. */
function LinkedSession({ sessionId }: { sessionId: string }) {
	return (
		<section>
			<SectionHeading>{L.result}</SectionHeading>
			<div className="bg-muted/60 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-3">
				<div className="min-w-0">
					<p className="text-muted-foreground text-footnote">
						{L.linkedSession}
					</p>
					<Link
						to={`/training/sessions/${sessionId}`}
						className="text-callout text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
					>
						{L.viewSession}
					</Link>
				</div>
				<UnlinkForm variant="outline" />
			</div>
		</section>
	)
}

function UnlinkForm({ variant }: { variant: 'outline' | 'ghost' }) {
	return (
		<Form method="POST">
			<input type="hidden" name="intent" value="unlink-result" />
			<Button type="submit" variant={variant}>
				{L.unlink}
			</Button>
		</Form>
	)
}

/** The inline link to Løpsresultater a racePace line or a mismatch points at. */
function ResultsLink() {
	return (
		<Link
			to={RESULTS_PATH}
			className="text-primary font-medium underline-offset-4 hover:underline"
		>
			{L.resultsLink}
		</Link>
	)
}

/**
 * The result well: the measured time, or why there is none and the fix. Keyed
 * by the result's id, and it lands (rises 4px and fades in, ADR 0088) only on
 * the render after a write made it: not on a visit, not on a revalidation.
 */
function EventResultWell({
	event,
	sessionId,
	result,
}: {
	event: EventRecord
	sessionId: string
	result: Exclude<ResultViewData, { kind: 'ineligible' }>
}) {
	const savedId = result.kind === 'saved' ? result.id : null
	// The id this page first rendered with: a different one later is a write.
	const firstId = useRef(savedId)
	const lands = savedId != null && savedId !== firstId.current
	// Open for the state it was opened in: once a save changes the distance,
	// the page comes back with the fix closed.
	const fixKey = `${result.kind}:${event.distanceM ?? ''}`
	const [openFor, setOpenFor] = useState<string | null>(null)
	const fixOpen = openFor === fixKey
	const setFixOpen = (open: boolean) => setOpenFor(open ? fixKey : null)
	const fixShown = result.kind === 'ask-distance' || fixOpen
	return (
		<div
			key={savedId ?? 'none'}
			data-event-result={result.kind}
			className={cn(
				'bg-muted/60 flex flex-col gap-4 rounded-3xl p-3',
				lands &&
					'duration-collapse [transition-property:opacity,translate] ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0',
			)}
		>
			{result.kind === 'saved' ? (
				<>
					<div className="flex flex-col gap-1">
						<p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span className="text-display tabular-nums">{result.time}</span>
							<span className="text-callout text-muted-foreground tabular-nums">
								{[result.pace, result.distance].filter(Boolean).join(' · ')}
							</span>
						</p>
						{/* The credit sits by the figure, never in a fold (ADR 0098
						    §3): "Målt av klokka · Garmin Forerunner 265". */}
						<p
							data-source-attribution={
								result.credit
									? result.creditOwed
										? 'owed'
										: 'courtesy'
									: 'none'
							}
							className="text-footnote text-muted-foreground [overflow-wrap:anywhere]"
						>
							{L.measured}
							{result.credit ? ` · ${result.credit}` : ''}
						</p>
					</div>
					<p className="text-footnote" data-race-pace-use>
						{result.use.text}
						{result.use.link ? (
							<>
								{' '}
								<ResultsLink />.
							</>
						) : null}
					</p>
				</>
			) : (
				<div role="status" className="flex flex-col gap-1">
					<p className="text-callout font-medium">
						{result.kind === 'ask-distance'
							? L.askDistance
							: result.kind === 'mismatch'
								? L.noTimeSaved
								: result.title}
					</p>
					<p className="text-footnote text-muted-foreground tabular-nums">
						{result.kind === 'ask-distance' ? L.askDistanceBody : result.body}
					</p>
					{result.kind === 'mismatch' ? (
						<p className="text-footnote text-muted-foreground">
							{result.typed} <ResultsLink />.
						</p>
					) : null}
				</div>
			)}

			{result.kind === 'saved' || result.kind === 'mismatch' ? (
				<Collapsible open={fixOpen} onOpenChange={setFixOpen}>
					<CollapsibleContent>
						<DistanceFix event={event} labelled />
					</CollapsibleContent>
				</Collapsible>
			) : result.kind === 'ask-distance' ? (
				<DistanceFix event={event} labelled={false} />
			) : null}

			{/* While the fix is open, the primary is the only filled thing: the
			    session's own actions go quiet. */}
			<div className="flex flex-wrap gap-2">
				<Link
					to={`/training/sessions/${sessionId}`}
					className={buttonVariants({
						variant: fixShown ? 'ghost' : 'outline',
					})}
				>
					{L.viewSession}
				</Link>
				<UnlinkForm variant="ghost" />
				{(result.kind === 'saved' || result.kind === 'mismatch') && !fixOpen ? (
					<Button
						type="button"
						variant={result.kind === 'mismatch' ? 'outline' : 'ghost'}
						onClick={() => setFixOpen(true)}
					>
						{L.changeDistance}
					</Button>
				) : null}
			</div>
		</div>
	)
}

/** The Event Distance, set where a missing or wrong result is noticed: the
 * same pills as the form, posting to the same reader. _Lagre distansen_ waits
 * until the choice differs from the stored distance. */
function DistanceFix({
	event,
	labelled,
}: {
	event: EventRecord
	labelled: boolean
}) {
	const actionData = useActionData<typeof action>()
	const stored = eventDistanceChoiceOf(event.distanceM)
	const [value, setValue] = useState<EventDistanceValue>(stored)
	const read = eventDistanceFromChoice(value.choice, value.km)
	const unchanged = read.ok
		? read.distanceM === event.distanceM
		: value.choice === stored.choice && value.km === stored.km
	const labelId = `event-${event.id}-distance-label`
	const error =
		actionData && 'distanceError' in actionData
			? actionData.distanceError
			: null
	return (
		<Form method="POST" className="flex flex-col gap-4" data-distance-fix>
			<input type="hidden" name="intent" value="set-distance" />
			{labelled ? (
				<p id={labelId} className="text-callout font-medium">
					{L.raceDistance}
				</p>
			) : (
				<span id={labelId} className="sr-only">
					{L.raceDistance}
				</span>
			)}
			<EventDistancePicker
				id={`event-${event.id}-distance`}
				labelledBy={labelId}
				defaultValue={stored}
				kmError={error}
				onChange={setValue}
			/>
			<Button
				type="submit"
				className="w-full sm:w-auto sm:self-start"
				disabled={unchanged || !value.choice}
			>
				{L.saveDistance}
			</Button>
		</Form>
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
	const { event, candidates, result } = loaderData
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
							{/* The Event Distance leads the meta line when there is one
							    (#670): "10 km · lørdag 25. apr 2026 · Oslo". */}
							<p
								data-event-meta
								className="text-muted-foreground text-footnote tabular-nums"
							>
								{event.distanceM
									? `${eventDistanceName(event.distanceM)} · `
									: ''}
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
							<ResultSection
								event={event}
								candidates={candidates}
								result={result}
							/>
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
