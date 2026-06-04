import { useState } from 'react'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	getCurrentLoad,
	getLoadSnapshots,
} from '#app/utils/load/snapshot.server.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	useSessionPresenter,
	type SessionGroup,
} from '#app/utils/session-presenter.ts'
import {
	getUpcomingEvents,
	getUpcomingSessions,
	type UpcomingEvent,
} from '#app/utils/training.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { EVENT_KIND_LABELS } from '#app/utils/event-schema.ts'
import {
	DISCIPLINE_FILTER_ORDER,
	DISCIPLINE_QUERY_PARAM,
	type DisciplineFilter,
	filterSessionsByDiscipline,
	parseDisciplineQueryParam,
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
	const [sessions, events, currentLoad, snapshots] = await Promise.all([
		getUpcomingSessions(userId),
		getUpcomingEvents(userId),
		getCurrentLoad(userId),
		getLoadSnapshots(userId, 14),
	])
	const url = new URL(request.url)
	const disciplineFilter = parseDisciplineQueryParam(
		url.searchParams.get(DISCIPLINE_QUERY_PARAM),
	)
	return { sessions, events, disciplineFilter, currentLoad, snapshots }
}

function UpcomingActivityFilters({
	disciplineFilter,
}: {
	disciplineFilter: DisciplineFilter | null
}) {
	return (
		<nav
			aria-label="Discipline filters"
			className="bg-muted/50 ring-border/70 mb-5 flex w-fit max-w-full flex-wrap gap-1 rounded-4xl p-1 ring-1"
		>
			<ActivityFilterLink
				to="/training/upcoming"
				label="All"
				active={disciplineFilter === null}
			/>
			{DISCIPLINE_FILTER_ORDER.map((type) => (
				<ActivityFilterLink
					key={type}
					to={`/training/upcoming?${DISCIPLINE_QUERY_PARAM}=${type}`}
					label={getDisciplineLabel(type)}
					active={disciplineFilter === type}
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
		<Card className="mb-6 gap-0 py-0">
			<CardContent className="grid gap-6 py-5 sm:grid-cols-[1fr_auto] sm:items-end">
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
						discipline mix, and truthful unavailable metrics.
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:items-end">
					<Link to="/training/sessions/new" prefetch="intent">
						<Button type="button">+ Add Workout</Button>
					</Link>
				</div>
			</CardContent>
			<CardFooter className="border-border/70 bg-muted/35 flex-wrap gap-2 border-t py-3">
				<span className="bg-background text-foreground rounded-4xl px-3 py-1 text-xs font-medium shadow-xs">
					Upcoming
				</span>
			</CardFooter>
		</Card>
	)
}

function UpcomingLedgerSummaryPanel({
	summary,
}: {
	summary: UpcomingLedgerSummary
}) {
	return (
		<Card
			role="region"
			aria-labelledby="upcoming-ledger-summary"
			className="mb-5 gap-0 py-0"
		>
			<CardContent className="grid gap-0 p-0 md:grid-cols-[1fr_1.25fr_1fr]">
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
					aria-label="Discipline allocation"
					className="border-border/70 border-b p-5 md:border-r md:border-b-0"
				>
					<h3 className="text-body-xs font-semibold tracking-[0.12em] uppercase">
						Discipline Allocation
					</h3>
					{summary.disciplineAllocation.length > 0 ? (
						<ul className="mt-4 flex flex-col gap-3">
							{summary.disciplineAllocation.map((item) => (
								<li
									key={item.discipline}
									className="grid grid-cols-[1fr_auto] items-center gap-3"
								>
									<span className="text-body-xs">{item.label}</span>
									<span className="text-muted-foreground text-body-xs tabular-nums">
										{item.count} ({item.percentage}%)
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
			</CardContent>
		</Card>
	)
}

type LoadSnapshot = {
	date: string
	tssTotal: number
	tssByDiscipline: Record<string, number>
	ctl: number
	atl: number
	tsb: number
}

function LoadOverlay({
	currentLoad,
	snapshots,
}: {
	currentLoad: { ctl: number; atl: number; tsb: number; date: string } | null
	snapshots: LoadSnapshot[]
}) {
	const [visible, setVisible] = useState(false)

	if (!currentLoad && snapshots.length === 0) return null

	return (
		<Card
			role="region"
			aria-labelledby="load-overlay-title"
			className="mb-5 gap-0 py-0"
		>
			<CardContent className="flex items-center justify-between py-3">
				<div className="flex items-center gap-3">
					<h2
						id="load-overlay-title"
						className="text-body-xs font-semibold tracking-[0.12em] uppercase"
					>
						Training Load
					</h2>
					{currentLoad ? (
						<dl className="flex gap-3">
							<div className="rounded-3xl bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 tabular-nums dark:text-sky-300">
								<dt className="sr-only">CTL (Fitness)</dt>
								<dd>CTL {Math.round(currentLoad.ctl)}</dd>
							</div>
							<div className="rounded-3xl bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-700 tabular-nums dark:text-rose-300">
								<dt className="sr-only">ATL (Fatigue)</dt>
								<dd>ATL {Math.round(currentLoad.atl)}</dd>
							</div>
							<div
								className={cn(
									'rounded-3xl px-2.5 py-1 text-xs font-medium tabular-nums',
									currentLoad.tsb < 0
										? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
										: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
								)}
							>
								<dt className="sr-only">TSB (Form)</dt>
								<dd>
									TSB {currentLoad.tsb >= 0 ? '+' : ''}
									{Math.round(currentLoad.tsb)}
								</dd>
							</div>
						</dl>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					<Link
						to="/training/load"
						prefetch="intent"
						className="text-muted-foreground hover:text-foreground text-body-2xs transition-colors"
					>
						Full view →
					</Link>
					<button
						type="button"
						onClick={() => setVisible((v) => !v)}
						className="text-muted-foreground hover:text-foreground text-body-2xs transition-colors"
						aria-expanded={visible}
					>
						{visible ? 'Hide curve' : 'Show curve'}
					</button>
				</div>
			</CardContent>
			{visible && snapshots.length > 0 ? (
				<CardContent className="border-border/70 border-t py-3">
					<LoadCurve snapshots={snapshots} />
				</CardContent>
			) : null}
		</Card>
	)
}

function LoadCurve({ snapshots }: { snapshots: LoadSnapshot[] }) {
	const W = 800
	const H = 80
	const pad = 4

	const maxVal = Math.max(...snapshots.flatMap((s) => [s.ctl, s.atl]), 1)
	const xScale = (i: number) =>
		pad + (i / Math.max(snapshots.length - 1, 1)) * (W - pad * 2)
	const yScale = (v: number) => H - pad - (v / maxVal) * (H - pad * 2)

	function polylinePts(key: 'ctl' | 'atl') {
		return snapshots.map((s, i) => `${xScale(i)},${yScale(s[key])}`).join(' ')
	}

	return (
		<TooltipProvider>
			<div className="relative">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="w-full"
					aria-label="14-day CTL/ATL curve"
					role="img"
				>
					<polyline
						points={polylinePts('ctl')}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="text-sky-500"
					/>
					<polyline
						points={polylinePts('atl')}
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className="text-rose-500"
					/>
					{snapshots.map((snap, i) => (
						<Tooltip key={snap.date}>
							<TooltipTrigger
								render={
									<circle
										cx={xScale(i)}
										cy={yScale(snap.ctl)}
										r={4}
										className="cursor-pointer fill-sky-500"
									/>
								}
							/>
							<TooltipContent side="top" className="text-xs">
								<p className="font-semibold">{snap.date}</p>
								<p>TSS {snap.tssTotal.toFixed(1)}</p>
								<p>
									CTL {snap.ctl.toFixed(1)} · ATL {snap.atl.toFixed(1)} · TSB{' '}
									{snap.tsb.toFixed(1)}
								</p>
								{Object.keys(snap.tssByDiscipline).length > 0 ? (
									<ul className="mt-1">
										{Object.entries(snap.tssByDiscipline).map(([d, v]) => (
											<li key={d}>
												{d}: {(v as number).toFixed(1)} TSS
											</li>
										))}
									</ul>
								) : null}
							</TooltipContent>
						</Tooltip>
					))}
				</svg>
				<div className="text-body-2xs mt-1 flex gap-3">
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-0.5 w-3 rounded bg-sky-500" />
						CTL
					</span>
					<span className="flex items-center gap-1.5">
						<span className="inline-block h-0.5 w-3 rounded bg-rose-500" />
						ATL
					</span>
				</div>
			</div>
		</TooltipProvider>
	)
}

function EventMarker({ event }: { event: UpcomingEvent }) {
	const isMultiDay = event.endDate != null
	const startLabel = new Date(event.startDate).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
	})
	const endLabel = isMultiDay
		? ` – ${new Date(event.endDate!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
		: ''

	return (
		<Link
			to={`/training/events/${event.id}`}
			prefetch="intent"
			className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex items-center gap-2 border-l-2 px-3 py-2 transition-colors"
		>
			<span className="bg-primary text-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
				{event.priority}
			</span>
			<span className="text-body-xs font-semibold">{event.name}</span>
			<span className="text-muted-foreground text-body-xs">
				{EVENT_KIND_LABELS[event.kind as keyof typeof EVENT_KIND_LABELS]}
			</span>
			{isMultiDay ? (
				<span className="text-muted-foreground text-body-xs ml-auto">
					{startLabel}
					{endLabel}
				</span>
			) : null}
		</Link>
	)
}

export default function UpcomingRoute({ loaderData }: Route.ComponentProps) {
	const { sessions, events, disciplineFilter, currentLoad, snapshots } =
		loaderData
	const presenter = useSessionPresenter()
	const visibleSessions = filterSessionsByDiscipline(sessions, disciplineFilter)
	const summary = summarizeUpcomingLedger(visibleSessions)

	const eventsByDay = new Map<string, UpcomingEvent[]>()
	for (const event of events) {
		const label = presenter.formatDayLabel(new Date(event.startDate))
		const existing = eventsByDay.get(label)
		if (existing) {
			existing.push(event)
		} else {
			eventsByDay.set(label, [event])
		}
	}

	if (sessions.length === 0 && events.length === 0) {
		return (
			<main
				className="container py-6 sm:py-10"
				aria-labelledby="upcoming-ledger-title"
			>
				<UpcomingTrainingHeader />
				<UpcomingLedgerSummaryPanel summary={summary} />
				<LoadOverlay currentLoad={currentLoad} snapshots={snapshots} />
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

	if (visibleSessions.length === 0 && events.length === 0) {
		return (
			<main
				className="container py-6 sm:py-10"
				aria-labelledby="upcoming-ledger-title"
			>
				<UpcomingTrainingHeader />
				<UpcomingLedgerSummaryPanel summary={summary} />
				<LoadOverlay currentLoad={currentLoad} snapshots={snapshots} />
				<UpcomingActivityFilters disciplineFilter={disciplineFilter} />
				<Card className="max-w-xl">
					<CardHeader>
						<CardTitle>No matching sessions</CardTitle>
						<CardDescription>Discipline Filter</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">
							No sessions match this discipline in the next 14 days.
						</p>
					</CardContent>
				</Card>
			</main>
		)
	}

	const sessionGroups = presenter.groupByDay(visibleSessions)

	const sessionDayLabels = new Set(sessionGroups.map((g) => g.dateLabel))
	const eventOnlyGroups: SessionGroup[] = []
	for (const [label] of eventsByDay) {
		if (!sessionDayLabels.has(label)) {
			eventOnlyGroups.push({ dateLabel: label, sessions: [] })
		}
	}

	const allGroups = [...sessionGroups, ...eventOnlyGroups].sort((a, b) => {
		const aDate = a.sessions[0]
			? new Date(a.sessions[0].scheduledAt)
			: new Date(eventsByDay.get(a.dateLabel)![0]!.startDate)
		const bDate = b.sessions[0]
			? new Date(b.sessions[0].scheduledAt)
			: new Date(eventsByDay.get(b.dateLabel)![0]!.startDate)
		return aDate.getTime() - bDate.getTime()
	})

	return (
		<main
			className="container py-6 sm:py-10"
			aria-labelledby="upcoming-ledger-title"
		>
			<UpcomingTrainingHeader />
			<UpcomingLedgerSummaryPanel summary={summary} />
			<LoadOverlay currentLoad={currentLoad} snapshots={snapshots} />
			<UpcomingActivityFilters disciplineFilter={disciplineFilter} />
			<div className="sm:border-border/80 sm:bg-card flex flex-col gap-4 sm:overflow-hidden sm:rounded-4xl sm:border sm:shadow-md">
				<div className="text-muted-foreground bg-muted/45 hidden text-xs font-semibold tracking-[0.12em] uppercase sm:grid sm:grid-cols-[6.5rem_4.5rem_1fr_8rem_auto] sm:gap-3 sm:px-4 sm:py-3">
					<span>Time</span>
					<span>Discipline</span>
					<span>Workout</span>
					<span>Shape</span>
					<span className="text-right">Status</span>
				</div>
				{allGroups.map((group, groupIndex) => {
					const dayEvents = eventsByDay.get(group.dateLabel) ?? []
					return (
						<section
							key={group.dateLabel}
							className={
								groupIndex > 0 ? 'sm:border-border/70 sm:border-t' : undefined
							}
						>
							<h2 className="text-body-xs text-foreground bg-muted/50 sm:bg-background/40 rounded-3xl px-3 py-2 font-semibold tracking-[0.08em] uppercase sm:rounded-none sm:px-4">
								{group.dateLabel}
							</h2>
							{dayEvents.length > 0 ? (
								<ul className="mt-1 flex flex-col" aria-label="Events">
									{dayEvents.map((event) => (
										<li key={event.id}>
											<EventMarker event={event} />
										</li>
									))}
								</ul>
							) : null}
							{group.sessions.length > 0 ? (
								<ul className="sm:divide-border/70 mt-2 flex flex-col gap-3 sm:mt-0 sm:gap-0 sm:divide-y">
									{group.sessions.map((session) => (
										<UpcomingLedgerRow key={session.id} session={session} />
									))}
								</ul>
							) : null}
						</section>
					)
				})}
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
