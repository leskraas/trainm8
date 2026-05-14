import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import { getUpcomingSessions } from '#app/utils/training.server.ts'
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
	const url = new URL(request.url)
	const activityFilter = parseActivityQueryParam(
		url.searchParams.get(ACTIVITY_QUERY_PARAM),
	)
	return { sessions, activityFilter }
}

function UpcomingActivityFilters({
	activityFilter,
}: {
	activityFilter: ActivityTypeFilter | null
}) {
	return (
		<nav
			aria-label="Activity filters"
			className="bg-muted/50 ring-border/70 mb-5 flex w-fit max-w-full flex-wrap gap-1 rounded-4xl p-1 ring-1"
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
				'text-body-xs focus-visible:ring-ring rounded-4xl px-3 py-1.5 font-medium transition-colors focus:outline-none focus-visible:ring-2',
				active
					? 'bg-card text-foreground shadow-xs'
					: 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
			)}
			aria-current={active ? 'page' : undefined}
		>
			{label}
		</Link>
	)
}

function UpcomingTrainingHeader() {
	return (
		<header className="border-border/80 bg-card text-card-foreground mb-6 overflow-hidden rounded-4xl border shadow-md">
			<div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
				<div>
					<p className="text-muted-foreground text-body-2xs font-semibold tracking-[0.18em] uppercase">
						Training
					</p>
					<h1
						id="upcoming-ledger-title"
						className="font-heading mt-2 text-4xl leading-none font-bold tracking-[-0.04em] sm:text-6xl"
					>
						Upcoming Ledger
					</h1>
					<p className="text-muted-foreground text-body-sm mt-3 max-w-2xl">
						A dense 14-day planning surface for scheduled Workout Sessions,
						activity mix, and truthful unavailable metrics.
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:items-end">
					<Button
						type="button"
						disabled
						aria-describedby="add-workout-visual-control-note"
						title="Creation workflow not available yet"
					>
						Add Workout
					</Button>
					<p
						id="add-workout-visual-control-note"
						className="text-muted-foreground text-body-2xs"
					>
						Creation workflow not available yet.
					</p>
				</div>
			</div>
			<div className="border-border/70 bg-muted/35 flex flex-wrap gap-2 border-t px-5 py-3 sm:px-6">
				<span className="bg-background text-foreground rounded-4xl px-3 py-1 text-xs font-medium shadow-xs">
					Upcoming
				</span>
			</div>
		</header>
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
			className="border-border/80 bg-card text-card-foreground mb-5 overflow-hidden rounded-4xl border shadow-md"
		>
			<div className="grid gap-0 md:grid-cols-[1fr_1.25fr_1fr]">
				<div className="border-border/70 bg-muted/25 border-b p-5 md:border-r md:border-b-0">
					<h2 id="upcoming-ledger-summary" className="text-h5">
						{summary.horizonDays}-Day Horizon
					</h2>
					<p className="text-muted-foreground text-body-xs">
						Current planning window
					</p>
					<p className="font-heading mt-4 text-5xl leading-none font-bold tracking-[-0.04em]">
						{summary.totalSessions}{' '}
						{summary.totalSessions === 1 ? 'Session' : 'Sessions'}
					</p>
					<dl className="mt-4 flex flex-wrap gap-2">
						{Object.entries(summary.statusCounts).map(([status, count]) => (
							<div
								key={status}
								className="bg-background/80 ring-border/70 rounded-3xl px-3 py-2 ring-1"
							>
								<dt className="text-muted-foreground text-body-2xs capitalize">
									{status}
								</dt>
								<dd className="text-body-xs font-medium tabular-nums">
									{count}
								</dd>
							</div>
						))}
					</dl>
				</div>
				<div
					aria-label="Activity allocation"
					className="border-border/70 border-b p-5 md:border-r md:border-b-0"
				>
					<h3 className="text-body-xs font-semibold tracking-[0.12em] uppercase">
						Activity Allocation
					</h3>
					{summary.activityAllocation.length > 0 ? (
						<ul className="mt-4 flex flex-col gap-3">
							{summary.activityAllocation.map((activity) => (
								<li
									key={activity.activityType}
									className="grid grid-cols-[1fr_auto] items-center gap-3"
								>
									<span className="text-body-xs">{activity.label}</span>
									<span className="text-muted-foreground text-body-xs tabular-nums">
										{activity.count} ({activity.percentage}%)
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-body-xs mt-4">
							No visible sessions to allocate.
						</p>
					)}
				</div>
				<div className="p-5">
					<h3 className="text-body-xs font-semibold tracking-[0.12em] uppercase">
						Unavailable Metrics
					</h3>
					<dl className="mt-4 flex flex-col gap-3">
						{summary.unavailableMetrics.map((metric) => (
							<div
								key={metric.label}
								className="grid grid-cols-[1fr_auto] gap-3"
							>
								<dt className="text-body-xs">{metric.label}</dt>
								<dd className="text-muted-foreground text-body-xs">
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
	const { sessions, activityFilter } = loaderData
	const presenter = useSessionPresenter()
	const visibleSessions = filterSessionsByActivityType(sessions, activityFilter)
	const summary = summarizeUpcomingLedger(visibleSessions)

	if (sessions.length === 0) {
		return (
			<main
				className="container py-6 sm:py-10"
				aria-labelledby="upcoming-ledger-title"
			>
				<UpcomingTrainingHeader />
				<UpcomingLedgerSummaryPanel summary={summary} />
				<Card className="max-w-xl">
					<CardHeader>
						<CardTitle>No scheduled sessions</CardTitle>
						<CardDescription>14-Day Horizon</CardDescription>
					</CardHeader>
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
			<main
				className="container py-6 sm:py-10"
				aria-labelledby="upcoming-ledger-title"
			>
				<UpcomingTrainingHeader />
				<UpcomingLedgerSummaryPanel summary={summary} />
				<UpcomingActivityFilters activityFilter={activityFilter} />
				<Card className="max-w-xl">
					<CardHeader>
						<CardTitle>No matching sessions</CardTitle>
						<CardDescription>Activity Filter</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">
							No sessions match this activity in the next 14 days.
						</p>
					</CardContent>
				</Card>
			</main>
		)
	}

	const groups = presenter.groupByDay(visibleSessions)

	return (
		<main
			className="container py-6 sm:py-10"
			aria-labelledby="upcoming-ledger-title"
		>
			<UpcomingTrainingHeader />
			<UpcomingLedgerSummaryPanel summary={summary} />
			<UpcomingActivityFilters activityFilter={activityFilter} />
			<div className="sm:border-border/80 sm:bg-card flex flex-col gap-4 sm:overflow-hidden sm:rounded-4xl sm:border sm:shadow-md">
				<div className="text-muted-foreground bg-muted/45 hidden text-xs font-semibold tracking-[0.12em] uppercase sm:grid sm:grid-cols-[6.5rem_4.5rem_1fr_8rem_auto] sm:gap-3 sm:px-4 sm:py-3">
					<span>Time</span>
					<span>Activity</span>
					<span>Workout</span>
					<span>Shape</span>
					<span className="text-right">Status</span>
				</div>
				{groups.map((group, groupIndex) => (
					<section
						key={group.dateLabel}
						className={
							groupIndex > 0 ? 'sm:border-border/70 sm:border-t' : undefined
						}
					>
						<h2 className="text-body-xs text-foreground bg-muted/50 sm:bg-background/40 rounded-3xl px-3 py-2 font-semibold tracking-[0.08em] uppercase sm:rounded-none sm:px-4">
							{group.dateLabel}
						</h2>
						<ul className="sm:divide-border/70 mt-2 flex flex-col gap-3 sm:mt-0 sm:gap-0 sm:divide-y">
							{group.sessions.map((session) => (
								<UpcomingLedgerRow key={session.id} session={session} />
							))}
						</ul>
					</section>
				))}
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
