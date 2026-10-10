/**
 * Every Event, upcoming first (spec #505 story 57): the full list behind
 * Sesong's Events card, in Norwegian (ADR 0081) on the design system's list
 * group (ADR 0085) — one card per section, a row per Event.
 */
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	eventStatusVariant,
	isEventKind,
	type EventStatus,
	parseEventDisciplines,
} from '#app/utils/event-schema.ts'
import { getEventsForUser, type EventRecord } from '#app/utils/event.server.ts'
import {
	EVENTS_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_EVENT_KIND_LABELS,
	NB_EVENT_STATUS_LABELS,
} from '#app/utils/labels.ts'
import { type Route } from './+types/events.ts'
import { PriorityDisc } from './__event-parts.tsx'
import { eventDaysText } from './__event-target.ts'

export const meta: Route.MetaFunction = () => [
	{ title: EVENTS_LABELS.metaTitle },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const events = await getEventsForUser(userId)
	return { events }
}

/** A stored day (UTC midnight) as `YYYY-MM-DD`, which orders as text. */
function dayKeyOf(date: Date | string): string {
	return new Date(date).toISOString().slice(0, 10)
}

/**
 * An Event is upcoming while it is planned and its last day has not passed —
 * so a race today is still "kommende" all day, not "tidligere" from 00:01.
 */
function isUpcoming(event: EventRecord, todayKey: string): boolean {
	return (
		event.status === 'planned' &&
		dayKeyOf(event.endDate ?? event.startDate) >= todayKey
	)
}

function EventRow({
	event,
	showStatus,
}: {
	event: EventRecord
	showStatus: boolean
}) {
	const disciplines = parseEventDisciplines(event.disciplines)
	const facts = [
		isEventKind(event.kind) ? NB_EVENT_KIND_LABELS[event.kind] : null,
		eventDaysText(event.startDate, event.endDate),
		disciplines.map((d) => NB_DISCIPLINE_LABELS[d]).join(', ') || null,
	].filter(Boolean)

	return (
		<li>
			<Link
				to={`/training/events/${event.id}`}
				prefetch="intent"
				// A row of a list, so the press is an instant tint rather than a
				// scale: a whole-width row shrinking reads as the page moving.
				className="active:bg-muted/60 hover:bg-muted/40 duration-press flex min-h-14 items-start gap-3 px-4 py-3 transition-colors ease-out"
			>
				<PriorityDisc priority={event.priority} />
				{/* The name wraps (and breaks anywhere if it has no space): a list
				    of Events is read by name, so it is never cut to `Trondhe…`. */}
				<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
					<span className="text-callout block font-medium">{event.name}</span>
					<span className="text-muted-foreground text-footnote block tabular-nums">
						{facts.join(' · ')}
					</span>
				</span>
				{showStatus ? (
					<Badge
						variant={eventStatusVariant(event.status as EventStatus)}
						className="mt-0.5"
					>
						{NB_EVENT_STATUS_LABELS[event.status as EventStatus] ??
							event.status}
					</Badge>
				) : null}
				<Icon
					name="chevron-right"
					size="sm"
					className="text-muted-foreground mt-1.5 flex-none"
					aria-hidden="true"
				/>
			</Link>
		</li>
	)
}

function EventSection({
	id,
	title,
	events,
	showStatus,
}: {
	id: string
	title: string
	events: EventRecord[]
	showStatus: boolean
}) {
	if (events.length === 0) return null
	return (
		<section aria-labelledby={id}>
			<h2
				id={id}
				className="text-overline text-muted-foreground mb-2 uppercase"
			>
				{title}
			</h2>
			<Card className="gap-0 py-0">
				<ul className="divide-border/60 divide-y">
					{events.map((event) => (
						<EventRow key={event.id} event={event} showStatus={showStatus} />
					))}
				</ul>
			</Card>
		</section>
	)
}

export default function EventsRoute({ loaderData }: Route.ComponentProps) {
	const { events } = loaderData
	const todayKey = new Date().toISOString().slice(0, 10)
	const upcoming = events.filter((e) => isUpcoming(e, todayKey))
	const past = events.filter((e) => !isUpcoming(e, todayKey))

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={EVENTS_LABELS.title}
				back={{ to: '/training/plan', label: EVENTS_LABELS.backToSeason }}
				actions={
					<Link
						to="/training/events/new"
						prefetch="intent"
						className={buttonVariants({
							size: 'sm',
							className: 'rounded-full',
						})}
					>
						<Icon name="plus" size="sm" aria-hidden="true" />
						{EVENTS_LABELS.newEvent}
					</Link>
				}
				className="mb-6"
			/>

			{events.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-start gap-4">
						<div className="space-y-1">
							<h2 className="text-heading">{EVENTS_LABELS.emptyTitle}</h2>
							<p className="text-muted-foreground text-footnote">
								{EVENTS_LABELS.emptyBody}
							</p>
						</div>
						<Link
							to="/training/events/new"
							prefetch="intent"
							className={buttonVariants()}
						>
							<Icon name="plus" size="sm" aria-hidden="true" />
							{EVENTS_LABELS.emptyAction}
						</Link>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-8">
					<EventSection
						id="events-upcoming"
						title={EVENTS_LABELS.upcoming}
						events={upcoming}
						showStatus={false}
					/>
					<EventSection
						id="events-past"
						title={EVENTS_LABELS.past}
						events={past}
						showStatus
					/>
				</div>
			)}
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
