import { Link, useLoaderData, useSearchParams } from 'react-router'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import { getRecentSessionLogs } from '#app/utils/session-log.server.ts'
import {
	type UpcomingSession,
	getUpcomingSessions,
} from '#app/utils/training.server.ts'
import { getActivityLabel, getStatusLabel } from '#app/utils/training.ts'
import {
	buildWeekDays,
	countdownLabel,
	greetingFor,
	isoDayKey,
	paletteFor,
	sumBlockDurationMin,
} from '#app/utils/dashboard.ts'
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
	const upcomingSessions = sessions.slice(1)
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
	const [searchParams, setSearchParams] = useSearchParams()
	const presenter = useSessionPresenter()

	const today = new Date()
	const todayKey = isoDayKey(today)
	const weekDays = buildWeekDays(today)

	const allSessions: UpcomingSession[] = [
		...(nextSession ? [nextSession] : []),
		...upcomingSessions,
	]

	const sessionsByDay = new Map<string, UpcomingSession[]>()
	for (const session of allSessions) {
		const key = isoDayKey(new Date(session.scheduledAt))
		const existing = sessionsByDay.get(key) ?? []
		existing.push(session)
		sessionsByDay.set(key, existing)
	}

	const weekKeys = weekDays.map((d) => isoDayKey(d))

	// Determine the focused day from URL param, falling back to first day with sessions or today
	const dayParam = searchParams.get('day')
	const focusedKey = (() => {
		if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) return dayParam
		for (const key of weekKeys) {
			if (sessionsByDay.has(key)) return key
		}
		return todayKey
	})()

	const isOnToday = focusedKey === todayKey
	const focusedSessions = sessionsByDay.get(focusedKey) ?? []
	const heroSession = focusedSessions[0] ?? null

	// Next 4 sessions not on the focused day
	const upcomingThisWeek = allSessions
		.filter((s) => isoDayKey(new Date(s.scheduledAt)) !== focusedKey)
		.slice(0, 4)

	const thisWeekSessions = allSessions.filter((s) =>
		weekKeys.includes(isoDayKey(new Date(s.scheduledAt))),
	)

	let weekTotalMin = 0
	let weekHasAnyDuration = false
	let weekTotalSteps = 0
	for (const s of thisWeekSessions) {
		const min = sumBlockDurationMin(s.workout.blocks)
		if (min !== null) {
			weekTotalMin += min
			weekHasAnyDuration = true
		}
		weekTotalSteps += s.workout.blocks.reduce(
			(sum, b) => sum + b.steps.length * b.repeatCount,
			0,
		)
	}

	const rpeValues = recentLogs
		.filter((l) => l.rpe != null)
		.map((l) => l.rpe as number)
	const avgRpe =
		rpeValues.length > 0
			? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1)
			: null

	const nextCountdown = nextSession
		? countdownLabel(new Date(nextSession.scheduledAt))
		: null

	return (
		<main className="container mx-auto max-w-2xl px-4 py-6">
			<div className="mb-6">
				<p className="text-muted-foreground text-sm">{greetingFor(today)}</p>
				<h1 className="text-foreground text-2xl font-bold">
					Here&apos;s your week
				</h1>
			</div>

			{/* Back to today */}
			{!isOnToday && (
				<div className="mb-4">
					<Link
						to="/"
						replace
						preventScrollReset
						className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
					>
						← Back to today
					</Link>
				</div>
			)}

			{/* 7-day strip */}
			<nav aria-label="Week navigation" className="mb-6 grid grid-cols-7 gap-1">
				{weekDays.map((day) => {
					const key = isoDayKey(day)
					const daySessions = sessionsByDay.get(key) ?? []
					const isFocused = key === focusedKey
					const isToday = key === todayKey
					const weekdayShort = day.toLocaleDateString('en-US', {
						weekday: 'short',
					})
					const dayOfMonth = day.getDate()

					return (
						<button
							key={key}
							type="button"
							onClick={() =>
								setSearchParams(
									{ day: key },
									{ replace: true, preventScrollReset: true },
								)
							}
							className={cn(
								'flex flex-col items-center rounded-lg px-1 py-2 text-center transition',
								isFocused
									? 'bg-primary text-primary-foreground'
									: 'hover:bg-muted/50',
								isToday && !isFocused && 'font-semibold',
							)}
						>
							<span className="text-xs">{weekdayShort}</span>
							<span className="text-sm font-bold">{dayOfMonth}</span>
							<div className="mt-1 flex flex-wrap justify-center gap-0.5">
								{daySessions.map((s) => {
									const p = paletteFor(s.workout.activityType)
									return (
										<span
											key={s.id}
											className={cn('size-2 rounded-full', p.chip)}
										/>
									)
								})}
							</div>
							{daySessions[0] && (
								<span className="mt-1 line-clamp-1 w-full text-[10px] leading-tight opacity-70">
									{daySessions[0].workout.title}
								</span>
							)}
						</button>
					)
				})}
			</nav>

			{heroSession ? (
				<TodayHero session={heroSession} presenter={presenter} />
			) : (
				<RestDay />
			)}

			{/* Inline stats strip */}
			<div className="my-6 grid grid-cols-4 gap-2">
				<StatCell label="Sessions" value={String(thisWeekSessions.length)} />
				{weekHasAnyDuration ? (
					<StatCell label="Min planned" value={String(weekTotalMin)} />
				) : (
					<StatCell label="Steps" value={String(weekTotalSteps)} />
				)}
				<StatCell
					label="Avg RPE"
					value={avgRpe ? `${avgRpe} (${rpeValues.length})` : '—'}
				/>
				<StatCell label="Next" value={nextCountdown ?? '—'} />
			</div>

			{upcomingThisWeek.length > 0 && (
				<section className="mb-6">
					<h2 className="text-foreground mb-3 text-lg font-semibold">
						This week
					</h2>
					<ul className="divide-border divide-y">
						{upcomingThisWeek.map((session) => (
							<UpcomingRow
								key={session.id}
								session={session}
								presenter={presenter}
							/>
						))}
					</ul>
				</section>
			)}

			{recentLogs.length > 0 && (
				<section className="mb-6">
					<h2 className="text-foreground mb-3 text-lg font-semibold">
						Recent reflections
					</h2>
					<ul className="grid gap-3 sm:grid-cols-2">
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
									{log.rpe != null && (
										<p className="text-muted-foreground mt-1 text-xs">
											RPE {log.rpe}/10
										</p>
									)}
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			<section>
				<h2 className="text-foreground mb-3 text-lg font-semibold">
					Quick start
				</h2>
				<div className="flex flex-wrap gap-2">
					{(
						[
							{ key: 'run', label: 'Run' },
							{ key: 'bike', label: 'Ride' },
							{ key: 'swim', label: 'Swim' },
							{ key: 'strength', label: 'Strength' },
						] as const
					).map(({ key, label }) => {
						const p = paletteFor(key)
						return (
							<Link
								key={key}
								to={`/training/sessions/new?activity=${key}`}
								className={cn(
									'rounded-full px-4 py-2 text-sm font-medium ring-1 transition',
									p.chip,
									p.ink,
									p.ring,
								)}
							>
								{label}
							</Link>
						)
					})}
				</div>
			</section>
		</main>
	)
}

function StatCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-muted/50 flex flex-col items-center rounded-lg p-3 text-center">
			<span className="text-foreground text-lg font-bold">{value}</span>
			<span className="text-muted-foreground text-xs">{label}</span>
		</div>
	)
}

function TodayHero({
	session,
	presenter,
}: {
	session: UpcomingSession
	presenter: ReturnType<typeof useSessionPresenter>
}) {
	const { timeOfDay } = presenter.presentSession(session)
	const activityLabel = getActivityLabel(session.workout.activityType)
	const statusLabel = getStatusLabel(session.status)
	const palette = paletteFor(session.workout.activityType)
	const durationMin = sumBlockDurationMin(session.workout.blocks)
	const stepCount = session.workout.blocks.reduce(
		(sum, b) => sum + b.steps.length * b.repeatCount,
		0,
	)
	const blockNames = session.workout.blocks
		.slice(0, 3)
		.map((b) => b.name)
		.filter(Boolean)

	return (
		<section className="mb-6">
			<h2 className="text-foreground mb-3 text-lg font-semibold">Today</h2>
			<Link
				to={`/training/upcoming/${session.id}`}
				className={cn(
					'focus-visible:outline-ring block rounded-xl p-5 ring-1 transition hover:opacity-90',
					palette.bg,
					palette.ring,
				)}
			>
				<div className="flex items-start justify-between gap-2">
					<div>
						<p className="text-foreground text-xl font-semibold">
							{session.workout.title}
						</p>
						<p className="text-muted-foreground mt-1 text-sm">{timeOfDay}</p>
					</div>
					<div className="flex flex-col items-end gap-1">
						<span
							className={cn(
								'rounded-full px-2 py-0.5 text-xs font-medium',
								palette.chip,
								palette.ink,
							)}
						>
							{activityLabel}
						</span>
						<span className="text-muted-foreground text-xs">{statusLabel}</span>
					</div>
				</div>

				<div className="text-muted-foreground mt-3 text-sm">
					{durationMin != null ? (
						<span>{durationMin} min planned</span>
					) : (
						<span>{stepCount} steps</span>
					)}
				</div>

				{blockNames.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-1">
						{blockNames.map((name) => (
							<span
								key={name}
								className={cn(
									'rounded-full px-2 py-0.5 text-xs',
									palette.chip,
									palette.ink,
								)}
							>
								{name}
							</span>
						))}
					</div>
				)}
			</Link>
		</section>
	)
}

function RestDay() {
	return (
		<section className="mb-6">
			<h2 className="text-foreground mb-3 text-lg font-semibold">Today</h2>
			<div className="bg-muted/50 flex flex-col items-center rounded-xl p-8 text-center">
				<p className="text-foreground font-semibold">Rest day</p>
				<p className="text-muted-foreground mt-1 text-sm">
					No sessions scheduled for this day.
				</p>
			</div>
		</section>
	)
}

function UpcomingRow({
	session,
	presenter,
}: {
	session: UpcomingSession
	presenter: ReturnType<typeof useSessionPresenter>
}) {
	const { timeOfDay, shortDate } = presenter.presentSession(session)
	const palette = paletteFor(session.workout.activityType)

	return (
		<li className="py-3">
			<Link
				to={`/training/upcoming/${session.id}`}
				className="hover:bg-accent/50 focus-visible:outline-ring flex items-center gap-3 rounded-md px-2 py-1 transition"
			>
				<span className={cn('size-2.5 shrink-0 rounded-full', palette.chip)} />
				<div className="min-w-0 flex-1">
					<p className="text-foreground truncate text-sm font-medium">
						{session.workout.title}
					</p>
					<p className="text-muted-foreground text-xs">
						{shortDate} · {timeOfDay}
					</p>
				</div>
			</Link>
		</li>
	)
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
