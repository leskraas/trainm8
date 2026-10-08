/**
 * The Events a season is planned around, on the season plan itself (spec #505
 * story 57, ADR 0083): Sesong is the one place for everything about the season,
 * so the Events list and the way to plan another season are reached from here
 * rather than from a far corner of home.
 *
 * A short list, not the Events page again: the next few upcoming Events, each a
 * line that opens its detail, then the full list, a new Event and a new plan.
 * Event dates are calendar-day anchors, formatted in UTC like every other Event
 * date in the app (ADR 0023).
 */
import { Link } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { formatDate } from '#app/utils/format.ts'
import { EVENT_KIND_LABELS, SEASON_EVENTS_LABELS } from '#app/utils/labels.ts'
import { type EventKind } from '#app/utils/event-schema.ts'
import { PillLink, PlanCard } from './__plan-chrome.tsx'

export type SeasonEvent = {
	id: string
	name: string
	kind: string
	priority: string
	startDate: Date | string
}

/** How many upcoming Events the section lists before "All events" takes over. */
export const SEASON_EVENTS_SHOWN = 3

export function SeasonEvents({
	events,
	upcomingCount,
}: {
	/** The next upcoming Events, soonest first, already cut to what is shown. */
	events: SeasonEvent[]
	/** How many upcoming Events there are in all, so the aside never undercounts. */
	upcomingCount: number
}) {
	return (
		<PlanCard
			titleId="season-events"
			title={SEASON_EVENTS_LABELS.title}
			aside={SEASON_EVENTS_LABELS.comingUp(upcomingCount)}
			contentClassName="space-y-4"
		>
			{events.length > 0 ? (
				<ul className="divide-border/70 divide-y">
					{events.map((event) => (
						<li key={event.id}>
							<Link
								to={`/training/events/${event.id}`}
								prefetch="intent"
								className="flex min-h-11 items-center gap-3 py-2 hover:underline"
							>
								<span className="bg-primary text-primary-foreground flex size-6 flex-none items-center justify-center rounded-full text-xs font-bold">
									{event.priority}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block font-medium">{event.name}</span>
									<span className="text-muted-foreground block text-xs">
										{EVENT_KIND_LABELS[event.kind as EventKind]} ·{' '}
										{formatDate(event.startDate, 'UTC')}
									</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground text-sm">
					{SEASON_EVENTS_LABELS.none}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<PillLink to="/training/events">{SEASON_EVENTS_LABELS.all}</PillLink>
				<PillLink to="/training/events/new">
					<Icon name="plus" size="sm" />
					{SEASON_EVENTS_LABELS.newEvent}
				</PillLink>
				<PillLink to="/training/plan/new">
					<Icon name="calendar" size="sm" />
					{SEASON_EVENTS_LABELS.newPlan}
				</PillLink>
			</div>
		</PlanCard>
	)
}
