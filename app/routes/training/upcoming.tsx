import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getHints } from '#app/utils/client-hints.tsx'
import { getLocaleFromRequest } from '#app/utils/locale.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { getUpcomingSessions } from '#app/utils/training.server.ts'
import { groupSessionsByDay } from '#app/utils/training.ts'
import {
	ACTIVITY_FILTER_ORDER,
	ACTIVITY_QUERY_PARAM,
	activityFilterLabel,
	type ActivityTypeFilter,
	filterSessionsByActivityType,
	parseActivityQueryParam,
} from '#app/utils/upcoming-ledger-filters.ts'
import { type Route } from './+types/upcoming.ts'
import { UpcomingLedgerRow } from './upcoming-ledger-row.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Upcoming Workouts | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const sessions = await getUpcomingSessions(userId)
	const hints = getHints(request)
	const url = new URL(request.url)
	const activityFilter = parseActivityQueryParam(
		url.searchParams.get(ACTIVITY_QUERY_PARAM),
	)
	return {
		sessions,
		timeZone: hints.timeZone,
		locale: getLocaleFromRequest(request),
		activityFilter,
	}
}

function UpcomingActivityFilters({
	activityFilter,
}: {
	activityFilter: ActivityTypeFilter | null
}) {
	return (
		<nav
			aria-label="Activity filters"
			className="border-border mb-4 flex flex-wrap gap-1 border-b pb-3"
		>
			<ActivityFilterLink
				to="/training/upcoming"
				label="All"
				active={activityFilter === null}
			/>
			{ACTIVITY_FILTER_ORDER.map((type) => (
				<ActivityFilterLink
					key={type}
					to={`/training/upcoming?${ACTIVITY_QUERY_PARAM}=${type}`}
					label={activityFilterLabel(type)}
					active={activityFilter === type}
				/>
			))}
		</nav>
	)
}

function ActivityFilterLink({
	to,
	label,
	active,
}: {
	to: string
	label: string
	active: boolean
}) {
	return (
		<Link
			to={to}
			prefetch="intent"
			className={cn(
				'text-body-sm focus-visible:ring-ring rounded-md px-3 py-1.5 font-medium transition-colors focus:outline-none focus-visible:ring-2',
				active
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
			)}
			aria-current={active ? 'page' : undefined}
		>
			{label}
		</Link>
	)
}

export default function UpcomingRoute({ loaderData }: Route.ComponentProps) {
	const { sessions, timeZone, locale, activityFilter } = loaderData
	const visibleSessions = filterSessionsByActivityType(sessions, activityFilter)

	if (sessions.length === 0) {
		return (
			<main className="container py-10">
				<h1 className="text-h1 mb-6">Upcoming Workouts</h1>
				<Card className="max-w-xl">
					<CardContent>
						<p className="text-muted-foreground">
							No upcoming sessions scheduled.
						</p>
					</CardContent>
				</Card>
			</main>
		)
	}

	if (visibleSessions.length === 0) {
		return (
			<main className="container py-10">
				<h1 className="text-h1 mb-6">Upcoming Workouts</h1>
				<UpcomingActivityFilters activityFilter={activityFilter} />
				<Card className="max-w-xl">
					<CardContent>
						<p className="text-muted-foreground">
							No sessions match this activity in the next 14 days.
						</p>
					</CardContent>
				</Card>
			</main>
		)
	}

	const groups = groupSessionsByDay(visibleSessions, { timeZone, locale })
	const formatOptions = { locale, timeZone }

	return (
		<main className="container py-10">
			<h1 className="text-h1 mb-6">Upcoming Workouts</h1>
			<UpcomingActivityFilters activityFilter={activityFilter} />
			<div className="border-border overflow-hidden rounded-lg border">
				<div className="text-body-sm text-muted-foreground bg-muted/40 hidden font-medium sm:grid sm:grid-cols-[6.5rem_4.5rem_1fr_auto] sm:gap-3 sm:px-3 sm:py-2">
					<span>Time</span>
					<span>Activity</span>
					<span>Workout</span>
					<span className="text-right">Status</span>
				</div>
				{groups.map((group, groupIndex) => (
					<section
						key={group.dateLabel}
						className={groupIndex > 0 ? 'border-border border-t' : undefined}
					>
						<h2 className="text-body-sm text-foreground bg-muted/30 px-3 py-1.5 font-medium">
							{group.dateLabel}
						</h2>
						<ul className="divide-border/80 divide-y">
							{group.sessions.map((session) => (
								<UpcomingLedgerRow
									key={session.id}
									session={session}
									formatOptions={formatOptions}
								/>
							))}
						</ul>
					</section>
				))}
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
