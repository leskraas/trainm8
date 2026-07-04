import { Link } from 'react-router'
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
import { useDisplayTimeZone } from '#app/utils/client-hints.tsx'
import { formatMediumDate } from '#app/utils/format.ts'
import {
	EVENT_KIND_LABELS,
	EVENT_STATUS_LABELS,
	eventStatusVariant,
	type EventKind,
	type EventStatus,
	parseEventDisciplines,
} from '#app/utils/event-schema.ts'
import { getEventsForUser, type EventRecord } from '#app/utils/event.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { type Route } from './+types/events.ts'

export const meta: Route.MetaFunction = () => [{ title: 'Events | Trainm8' }]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const events = await getEventsForUser(userId)
	return { events }
}

function EventCard({ event }: { event: EventRecord }) {
	const timeZone = useDisplayTimeZone()
	const disciplines = parseEventDisciplines(event.disciplines)
	const startLabel = event.startDate
		? formatMediumDate(new Date(event.startDate), timeZone)
		: ''
	const endLabel = event.endDate
		? ` – ${formatMediumDate(new Date(event.endDate), timeZone)}`
		: ''

	return (
		<Link
			to={`/training/events/${event.id}`}
			prefetch="intent"
			className="block"
		>
			<Card className="hover:bg-muted/50 transition-colors">
				<CardHeader className="pb-2">
					<div className="flex items-start justify-between gap-2">
						<div>
							<div className="flex items-center gap-2">
								<span className="bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold">
									{event.priority}
								</span>
								<CardTitle className="text-base">{event.name}</CardTitle>
							</div>
							<CardDescription className="mt-1">
								{EVENT_KIND_LABELS[event.kind as EventKind]} · {startLabel}
								{endLabel}
							</CardDescription>
						</div>
						<Badge variant={eventStatusVariant(event.status as EventStatus)}>
							{EVENT_STATUS_LABELS[event.status as EventStatus]}
						</Badge>
					</div>
				</CardHeader>
				{disciplines.length > 0 ? (
					<CardContent className="pt-0">
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
					</CardContent>
				) : null}
			</Card>
		</Link>
	)
}

export default function EventsRoute({ loaderData }: Route.ComponentProps) {
	const { events } = loaderData

	const upcoming = events.filter(
		(e) => e.status === 'planned' && new Date(e.startDate) >= new Date(),
	)
	const past = events.filter(
		(e) => e.status !== 'planned' || new Date(e.startDate) < new Date(),
	)

	return (
		<main className="container mx-auto max-w-2xl py-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-heading text-3xl font-bold tracking-tight">
					Events
				</h1>
				<Link
					to="/training/events/new"
					prefetch="intent"
					className={buttonVariants({ size: 'sm' })}
				>
					+ New Event
				</Link>
			</div>

			{events.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>No events yet</CardTitle>
						<CardDescription>
							Events are race dates, time trials, and fitness goals that anchor
							your training plan.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Link to="/training/events/new">
							<Button>Create your first event</Button>
						</Link>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-8">
					{upcoming.length > 0 ? (
						<section>
							<h2 className="text-body-xs text-muted-foreground mb-3 font-semibold tracking-[0.12em] uppercase">
								Upcoming
							</h2>
							<div className="space-y-2">
								{upcoming.map((event) => (
									<EventCard key={event.id} event={event} />
								))}
							</div>
						</section>
					) : null}

					{past.length > 0 ? (
						<section>
							<h2 className="text-body-xs text-muted-foreground mb-3 font-semibold tracking-[0.12em] uppercase">
								Past &amp; cancelled
							</h2>
							<div className="space-y-2">
								{past.map((event) => (
									<EventCard key={event.id} event={event} />
								))}
							</div>
						</section>
					) : null}
				</div>
			)}
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
