import { Link, useLoaderData } from 'react-router'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import { getRecentSessionLogs } from '#app/utils/session-log.server.ts'
import {
	type UpcomingSession,
	getUpcomingSessions,
} from '#app/utils/training.server.ts'
import { getStatusLabel, getStatusVariant } from '#app/utils/training.ts'
import { logos } from './+logos/logos.ts'
import { type Route } from './+types/index.ts'

export const meta: Route.MetaFunction = () => [{ title: 'Trainm8' }]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await getUserId(request)
	if (!userId) {
		return { isAuthenticated: false as const }
	}
	const [sessions, recentLogs] = await Promise.all([
		getUpcomingSessions(userId),
		getRecentSessionLogs(userId),
	])
	const nextSession = sessions[0] ?? null
	const upcomingSessions = sessions.slice(1, 6)
	return {
		isAuthenticated: true as const,
		nextSession,
		upcomingSessions,
		recentLogs,
	}
}

export default function Index() {
	const data = useLoaderData<typeof loader>()

	if (!data.isAuthenticated) {
		return <MarketingLanding />
	}

	return <Dashboard data={data} />
}

type RecentLog = Awaited<ReturnType<typeof getRecentSessionLogs>>[number]

function Dashboard({
	data,
}: {
	data: {
		nextSession: UpcomingSession | null
		upcomingSessions: UpcomingSession[]
		recentLogs: RecentLog[]
	}
}) {
	const { nextSession, upcomingSessions, recentLogs } = data

	return (
		<main className="container mx-auto max-w-3xl px-4 py-8">
			<h1 className="text-foreground mb-6 text-2xl font-bold">Dashboard</h1>

			{nextSession ? (
				<>
					<NextSessionCard session={nextSession} />

					{upcomingSessions.length > 0 && (
						<section className="mt-8">
							<h2 className="text-foreground mb-3 text-lg font-semibold">
								Coming Up
							</h2>
							<ul className="divide-border divide-y">
								{upcomingSessions.map((session) => (
									<UpcomingSessionRow key={session.id} session={session} />
								))}
							</ul>
						</section>
					)}
				</>
			) : (
				<div className="bg-muted/50 rounded-lg p-8 text-center">
					<p className="text-muted-foreground">
						No upcoming workouts scheduled.
					</p>
				</div>
			)}

			<div className="mt-6">
				<Link
					to="/training/upcoming"
					className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
				>
					View full Upcoming Ledger →
				</Link>
			</div>

			<section className="mt-10">
				<h2 className="text-foreground mb-3 text-lg font-semibold">
					Recent Session Logs
				</h2>
				{recentLogs.length > 0 ? (
					<ul className="space-y-3">
						{recentLogs.map((log) => (
							<li key={log.id}>
								<Link
									to={`/training/upcoming/${log.session.id}`}
									className="bg-card ring-border/70 hover:bg-accent/50 focus-visible:outline-ring block rounded-lg p-4 ring-1 transition"
								>
									<p className="text-foreground text-sm font-medium">
										{log.session.workout.title}
									</p>
									<p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
										{log.content}
									</p>
									{log.rpe != null ? (
										<p className="text-muted-foreground mt-1 text-xs">
											RPE: {log.rpe}/10
										</p>
									) : null}
								</Link>
							</li>
						))}
					</ul>
				) : (
					<div className="bg-muted/50 rounded-lg p-6 text-center">
						<p className="text-muted-foreground text-sm">
							No session logs yet. Complete a workout and log your reflection!
						</p>
					</div>
				)}
			</section>
		</main>
	)
}

function NextSessionCard({ session }: { session: UpcomingSession }) {
	const presenter = useSessionPresenter()
	const { timeOfDay, longDate } = presenter.presentSession(session)
	const activityLabel = getActivityLabel(session.workout.activityType)

	return (
		<section>
			<h2 className="text-foreground mb-3 text-lg font-semibold">
				Next Workout
			</h2>
			<Link
				to={`/training/upcoming/${session.id}`}
				className="bg-card ring-border/70 hover:bg-accent/50 focus-visible:outline-ring block rounded-lg p-5 ring-1 transition"
			>
				<div className="flex items-start justify-between">
					<div>
						<p className="text-foreground text-lg font-semibold">
							{session.workout.title}
						</p>
						<p className="text-muted-foreground mt-1 text-sm">
							{longDate} · {timeOfDay}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant="outline">{activityLabel}</Badge>
						<Badge variant={getStatusVariant(session.status)}>
							{getStatusLabel(session.status)}
						</Badge>
					</div>
				</div>
				{session.workout.description && (
					<p className="text-muted-foreground mt-3 text-sm">
						{session.workout.description}
					</p>
				)}
			</Link>
		</section>
	)
}

function UpcomingSessionRow({ session }: { session: UpcomingSession }) {
	const presenter = useSessionPresenter()
	const { timeOfDay, shortDate } = presenter.presentSession(session)
	const activityLabel = getActivityLabel(session.workout.activityType)

	return (
		<li className="py-3">
			<Link
				to={`/training/upcoming/${session.id}`}
				className="hover:bg-accent/50 focus-visible:outline-ring flex items-center justify-between rounded-md px-2 py-1 transition"
			>
				<div className="min-w-0 flex-1">
					<p className="text-foreground text-sm font-medium">
						{session.workout.title}
					</p>
					<p className="text-muted-foreground text-xs">
						{shortDate} · {timeOfDay}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant="outline" className="text-xs">
						{activityLabel}
					</Badge>
					<Badge variant={getStatusVariant(session.status)} className="text-xs">
						{getStatusLabel(session.status)}
					</Badge>
				</div>
			</Link>
		</li>
	)
}

function getActivityLabel(activityType: string): string {
	if (activityType === 'bike') return 'Ride'
	return activityType.charAt(0).toUpperCase() + activityType.slice(1)
}

const columnClasses: Record<(typeof logos)[number]['column'], string> = {
	1: 'xl:col-start-1',
	2: 'xl:col-start-2',
	3: 'xl:col-start-3',
	4: 'xl:col-start-4',
	5: 'xl:col-start-5',
}
const rowClasses: Record<(typeof logos)[number]['row'], string> = {
	1: 'xl:row-start-1',
	2: 'xl:row-start-2',
	3: 'xl:row-start-3',
	4: 'xl:row-start-4',
	5: 'xl:row-start-5',
	6: 'xl:row-start-6',
}

function MarketingLanding() {
	return (
		<main className="font-poppins grid h-full place-items-center">
			<div className="grid place-items-center px-4 py-16 xl:grid-cols-2 xl:gap-24">
				<div className="flex max-w-md flex-col items-center text-center xl:order-2 xl:items-start xl:text-left">
					<a
						href="https://www.epicweb.dev/stack"
						className="animate-slide-top xl:animate-slide-left [animation-fill-mode:backwards] xl:[animation-delay:0.5s] xl:[animation-fill-mode:backwards]"
					>
						<svg
							className="text-foreground size-20 xl:-mt-4"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 65 65"
						>
							<path
								fill="currentColor"
								d="M39.445 25.555 37 17.163 65 0 47.821 28l-8.376-2.445Zm-13.89 0L28 17.163 0 0l17.179 28 8.376-2.445Zm13.89 13.89L37 47.837 65 65 47.821 37l-8.376 2.445Zm-13.89 0L28 47.837 0 65l17.179-28 8.376 2.445Z"
							></path>
						</svg>
					</a>
					<h1
						data-heading
						className="animate-slide-top text-foreground xl:animate-slide-left mt-8 text-4xl font-medium [animation-delay:0.3s] [animation-fill-mode:backwards] md:text-5xl xl:mt-4 xl:text-6xl xl:[animation-delay:0.8s] xl:[animation-fill-mode:backwards]"
					>
						<a href="https://www.epicweb.dev/stack">The Epic Stack</a>
					</h1>
					<p
						data-paragraph
						className="animate-slide-top text-muted-foreground xl:animate-slide-left mt-6 text-xl/7 [animation-delay:0.8s] [animation-fill-mode:backwards] xl:mt-8 xl:text-xl/6 xl:leading-10 xl:[animation-delay:1s] xl:[animation-fill-mode:backwards]"
					>
						Check the{' '}
						<a
							className="underline hover:no-underline"
							href="https://github.com/epicweb-dev/epic-stack/blob/main/docs/getting-started.md"
						>
							Getting Started guide
						</a>{' '}
						file for how to get your project off the ground!
					</p>
				</div>
				<ul className="mt-16 flex max-w-3xl flex-wrap justify-center gap-2 sm:gap-4 xl:mt-0 xl:grid xl:grid-flow-col xl:grid-cols-5 xl:grid-rows-6">
					<TooltipProvider>
						{logos.map((logo, i) => (
							<li
								key={logo.href}
								className={cn(
									columnClasses[logo.column],
									rowClasses[logo.row],
									'animate-roll-reveal [animation-fill-mode:backwards]',
								)}
								style={{ animationDelay: `${i * 0.07}s` }}
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<a
											href={logo.href}
											className="grid size-20 place-items-center rounded-2xl bg-violet-600/10 p-4 transition hover:-rotate-6 hover:bg-violet-600/15 sm:size-24 dark:bg-violet-200 dark:hover:bg-violet-100"
										>
											<img src={logo.src} alt="" />
										</a>
									</TooltipTrigger>
									<TooltipContent>{logo.alt}</TooltipContent>
								</Tooltip>
							</li>
						))}
					</TooltipProvider>
				</ul>
			</div>
		</main>
	)
}
