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
import {
	type UpcomingLedgerSummary,
	summarizeUpcomingLedger,
} from '#app/utils/upcoming-ledger-summary.ts'
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

function UpcomingLedgerSummaryPanel({
	summary,
}: {
	summary: UpcomingLedgerSummary
}) {
	return (
		<section
			aria-labelledby="upcoming-ledger-summary"
			className="border-border bg-card mb-5 rounded-lg border p-4"
		>
			<div className="grid gap-4 md:grid-cols-[1fr_1.25fr_1fr]">
				<div>
					<h2 id="upcoming-ledger-summary" className="text-h4">
						{summary.horizonDays}-Day Horizon
					</h2>
					<p className="text-muted-foreground text-body-sm">
						Current planning window
					</p>
					<p className="text-h2 mt-3">
						{summary.totalSessions}{' '}
						{summary.totalSessions === 1 ? 'Session' : 'Sessions'}
					</p>
					<dl className="mt-3 flex flex-wrap gap-2">
						{Object.entries(summary.statusCounts).map(([status, count]) => (
							<div key={status} className="bg-muted/50 rounded-md px-2 py-1">
								<dt className="text-muted-foreground text-xs capitalize">
									{status}
								</dt>
								<dd className="text-body-sm font-medium tabular-nums">
									{count}
								</dd>
							</div>
						))}
					</dl>
				</div>
				<div aria-label="Activity allocation">
					<h3 className="text-body-sm font-medium">Activity Allocation</h3>
					{summary.activityAllocation.length > 0 ? (
						<ul className="mt-3 space-y-2">
							{summary.activityAllocation.map((activity) => (
								<li
									key={activity.activityType}
									className="grid grid-cols-[1fr_auto] gap-3"
								>
									<span className="text-body-sm">{activity.label}</span>
									<span className="text-muted-foreground text-body-sm tabular-nums">
										{activity.count} ({activity.percentage}%)
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-body-sm mt-3">
							No visible sessions to allocate.
						</p>
					)}
				</div>
				<div>
					<h3 className="text-body-sm font-medium">Unavailable Metrics</h3>
					<dl className="mt-3 space-y-2">
						{summary.unavailableMetrics.map((metric) => (
							<div
								key={metric.label}
								className="grid grid-cols-[1fr_auto] gap-3"
							>
								<dt className="text-body-sm">{metric.label}</dt>
								<dd className="text-muted-foreground text-body-sm">
									{metric.displayValue}
								</dd>
							</div>
						))}
					</dl>
				</div>
			</div>
		</section>
	)
}

export default function UpcomingRoute({ loaderData }: Route.ComponentProps) {
	const { sessions, timeZone, locale, activityFilter } = loaderData
	const visibleSessions = filterSessionsByActivityType(sessions, activityFilter)
	const summary = summarizeUpcomingLedger(visibleSessions)

	if (sessions.length === 0) {
		return (
			<main className="container py-10">
				<h1 className="text-h1 mb-6">Upcoming Workouts</h1>
				<UpcomingLedgerSummaryPanel summary={summary} />
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
				<UpcomingLedgerSummaryPanel summary={summary} />
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
			<UpcomingLedgerSummaryPanel summary={summary} />
			<UpcomingActivityFilters activityFilter={activityFilter} />
			<div className="border-border overflow-hidden rounded-lg border">
				<div className="text-body-sm text-muted-foreground bg-muted/40 hidden font-medium sm:grid sm:grid-cols-[6.5rem_4.5rem_1fr_8rem_auto] sm:gap-3 sm:px-3 sm:py-2">
					<span>Time</span>
					<span>Activity</span>
					<span>Workout</span>
					<span>Shape</span>
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
