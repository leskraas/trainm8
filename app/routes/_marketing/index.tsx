import { Link, useLoaderData, useSearchParams } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { useOptionalHints } from '#app/utils/client-hints.tsx'
import {
	buildWeekDays,
	countdownLabel,
	greetingFor,
	isoDayKey,
	paletteFor,
	sumBlockDurationMin,
} from '#app/utils/dashboard.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { getCurrentLoad, getTsbTrust } from '#app/utils/load/snapshot.server.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { cn } from '#app/utils/misc.tsx'
import { useOptionalRequestInfo } from '#app/utils/request-info.ts'
import { getRecentSessionLogs } from '#app/utils/session-log.server.ts'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import {
	type LedgerSession,
	type UpcomingSession,
	getSessionLedger,
	getUpcomingSessions,
} from '#app/utils/training.server.ts'
import {
	getDisciplineLabel,
	getSessionDiscipline,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'
import { useOptionalUser } from '#app/utils/user.ts'
import { logos } from './+logos/logos.ts'
import { type Route } from './+types/index.ts'
import { DashboardWithNav, isNavKey } from './__dashboard-prototype.tsx'
import { SessionLedger } from './session-ledger.tsx'

export const meta: Route.MetaFunction = () => [{ title: 'Trainm8' }]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await getUserId(request)
	if (!userId) {
		return { isAuthenticated: false as const }
	}
	const [sessions, recentLogs, ledger, currentLoad, tsbTrust] =
		await Promise.all([
			getUpcomingSessions(userId),
			getRecentSessionLogs(userId),
			getSessionLedger(userId),
			getCurrentLoad(userId),
			getTsbTrust(userId),
		])
	const nextSession = sessions[0] ?? null
	const upcomingSessions = sessions.slice(1)
	return {
		isAuthenticated: true as const,
		nextSession,
		upcomingSessions,
		recentLogs,
		ledger,
		tsb: currentLoad?.tsb ?? null,
		tsbTrust,
	}
}

export default function Index() {
	const data = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()

	if (!data.isAuthenticated) {
		return <MarketingLanding />
	}

	// PROTOTYPE — `?nav=pill|quiet|sidebar|inline` renders the original
	// prototype dashboard (`VariantB`) wrapped in its prototype chrome. Used
	// for side-by-side comparison against the live `Dashboard`. The production
	// chrome (`PillBrandRow` + `PillNav` in root.tsx) is hidden when `?nav` is
	// present so only the prototype chrome shows.
	const navParam = searchParams.get('nav')
	if (isNavKey(navParam)) {
		return (
			<DashboardWithNav
				data={{
					nextSession: data.nextSession,
					upcomingSessions: data.upcomingSessions,
					recentLogs: data.recentLogs,
				}}
				nav={navParam}
			/>
		)
	}

	return <Dashboard data={data} />
}

type RecentLog = Awaited<ReturnType<typeof getRecentSessionLogs>>[number]

const ACTIVITY_QUICK_STARTS = [
	{ key: 'run', label: 'Run' },
	{ key: 'bike', label: 'Ride' },
	{ key: 'swim', label: 'Swim' },
	{ key: 'strength', label: 'Strength' },
] as const

function useLocale(): string {
	const requestInfo = useOptionalRequestInfo()
	return requestInfo?.locale ?? 'en-US'
}

function useTimeZone(): string {
	const hints = useOptionalHints()
	return hints?.timeZone ?? 'UTC'
}

function Dashboard({
	data,
}: {
	data: {
		nextSession: UpcomingSession | null
		upcomingSessions: UpcomingSession[]
		recentLogs: RecentLog[]
		ledger: LedgerSession[]
		tsb: number | null
		tsbTrust: TsbTrust
	}
}) {
	const { nextSession, upcomingSessions, recentLogs, ledger, tsb, tsbTrust } =
		data
	const [searchParams] = useSearchParams()
	const presenter = useSessionPresenter()
	const user = useOptionalUser()
	const locale = useLocale()
	const timeZone = useTimeZone()

	const today = new Date()
	const todayKey = isoDayKey(today)
	const weekDays = buildWeekDays(today)
	const weekKeys = weekDays.map((d) => isoDayKey(d))

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

	const dayParam = searchParams.get('day')
	const focusedKey = (() => {
		if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) return dayParam
		for (const key of weekKeys) {
			if (sessionsByDay.has(key)) return key
		}
		return todayKey
	})()
	const focusedDay =
		weekDays.find((d) => isoDayKey(d) === focusedKey) ?? weekDays[0]!
	const isOnToday = focusedKey === todayKey
	const focusedSessions = sessionsByDay.get(focusedKey) ?? []

	const thisWeekSessions = allSessions.filter((s) =>
		weekKeys.includes(isoDayKey(new Date(s.scheduledAt))),
	)

	let weekTotalMin = 0
	let weekHasAnyDuration = false
	let weekTotalSteps = 0
	for (const s of thisWeekSessions) {
		const blocks = s.workout?.blocks ?? []
		const min = sumBlockDurationMin(blocks)
		if (min !== null) {
			weekTotalMin += min
			weekHasAnyDuration = true
		}
		weekTotalSteps += blocks.reduce(
			(sum, b) => sum + b.steps.length * b.repeatCount,
			0,
		)
	}

	const rpeValues = recentLogs
		.filter((l) => l.rpe != null)
		.map((l) => l.rpe as number)
	const avgRpe =
		rpeValues.length > 0
			? Math.round(
					(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10,
				) / 10
			: null

	const nextCountdown = nextSession
		? countdownLabel(new Date(nextSession.scheduledAt))
		: null

	const focusedDayLabel = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone,
	}).format(focusedDay)

	function dayHref(d: Date) {
		const next = new URLSearchParams(searchParams)
		next.set('day', isoDayKey(d))
		return `?${next.toString()}`
	}

	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-5xl space-y-12">
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="text-muted-foreground text-sm">
							{greetingFor(today)}, {user?.name ?? user?.username ?? 'athlete'}.
						</p>
						<h1 className="text-foreground mt-1 text-3xl font-semibold tracking-tight">
							Here&apos;s your week
						</h1>
					</div>
					<Button
						variant="ghost"
						size="sm"
						nativeButton={false}
						render={<Link to="/training/sessions/new" />}
					>
						<Icon name="plus" size="sm" />
						New session
					</Button>
				</header>

				<CoachCard tsb={tsb} trust={tsbTrust} />

				<section aria-labelledby="today-heading">
					<div className="mb-4 flex items-baseline justify-between">
						<h2
							id="today-heading"
							className="text-foreground text-xl font-semibold tracking-tight"
						>
							{isOnToday ? 'Today' : focusedDayLabel}
						</h2>
						{!isOnToday ? (
							<Link
								to={dayHref(weekDays[0]!)}
								replace
								preventScrollReset
								className="text-primary text-sm font-medium hover:underline"
							>
								Back to today
							</Link>
						) : (
							<p className="text-muted-foreground text-sm">{focusedDayLabel}</p>
						)}
					</div>

					{focusedSessions.length === 0 ? (
						<div className="bg-card border-border/60 rounded-xl border p-12 text-center">
							<p className="text-foreground text-base font-medium">Rest day</p>
							<p className="text-muted-foreground mt-1 text-sm">
								Recover hard. Tomorrow&apos;s session will thank you.
							</p>
						</div>
					) : (
						<ul className="space-y-3">
							{focusedSessions.map((s) => (
								<SessionHero
									key={s.id}
									session={s}
									timeOfDay={presenter.presentSession(s).timeOfDay}
								/>
							))}
						</ul>
					)}

					<dl className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
						<InlineStat
							label="This week"
							value={String(thisWeekSessions.length)}
							unit={thisWeekSessions.length === 1 ? 'session' : 'sessions'}
						/>
						<InlineStat
							label={weekHasAnyDuration ? 'Volume' : 'Steps'}
							value={
								weekHasAnyDuration
									? String(weekTotalMin)
									: String(weekTotalSteps)
							}
							unit={weekHasAnyDuration ? 'min planned' : 'planned'}
						/>
						<InlineStat
							label="Avg RPE"
							value={avgRpe != null ? String(avgRpe) : '—'}
							unit={
								avgRpe != null
									? `(${rpeValues.length} log${rpeValues.length === 1 ? '' : 's'})`
									: ''
							}
						/>
						<InlineStat
							label="Next"
							value={nextCountdown ?? '—'}
							unit={
								nextSession
									? presenter.presentSession(nextSession).timeOfDay
									: ''
							}
						/>
					</dl>
				</section>

				<section aria-labelledby="ledger-heading">
					<div className="mb-4 flex items-baseline justify-between">
						<h2
							id="ledger-heading"
							className="text-foreground text-lg font-semibold tracking-tight"
						>
							Session ledger
						</h2>
						<Link
							to="/training/upcoming"
							className="text-muted-foreground hover:text-foreground text-sm font-medium"
						>
							Upcoming →
						</Link>
					</div>

					<SessionLedger sessions={ledger} />
				</section>

				{recentLogs.length > 0 ? (
					<section aria-labelledby="recent-heading">
						<div className="mb-4 flex items-baseline justify-between">
							<h2
								id="recent-heading"
								className="text-foreground text-lg font-semibold tracking-tight"
							>
								Recent reflections
							</h2>
							<Link
								to="/training/upcoming"
								className="text-muted-foreground hover:text-foreground text-sm font-medium"
							>
								All logs →
							</Link>
						</div>
						<div className="grid gap-3 md:grid-cols-3">
							{recentLogs.map((log) => (
								<Link
									key={log.id}
									to={`/training/upcoming/${log.session.id}`}
									className="bg-card hover:bg-muted/30 border-border/60 flex flex-col rounded-lg border p-4 transition"
								>
									<div className="flex items-start justify-between gap-2">
										<p className="text-foreground text-sm font-medium">
											{log.session.workout?.title ?? 'Recording'}
										</p>
										{log.rpe != null ? (
											<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
												RPE {log.rpe}
											</span>
										) : null}
									</div>
									<p className="text-muted-foreground mt-2 line-clamp-3 flex-1 text-xs">
										{log.content}
									</p>
								</Link>
							))}
						</div>
					</section>
				) : null}

				<section
					aria-labelledby="quick-heading"
					className="border-border/60 border-t pt-8"
				>
					<h2
						id="quick-heading"
						className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase"
					>
						Quick start a new session
					</h2>
					<div className="flex flex-wrap gap-2">
						{ACTIVITY_QUICK_STARTS.map((a) => {
							const pal = paletteFor(a.key)
							return (
								<Link
									key={a.key}
									to={`/training/sessions/new?discipline=${a.key}`}
									className="hover:bg-muted/40 border-border/60 bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition"
								>
									<span className={cn('size-1.5 rounded-full', pal.chip)} />
									<span className="text-foreground text-xs font-medium">
										{a.label}
									</span>
								</Link>
							)
						})}
					</div>
				</section>
			</div>
		</main>
	)
}

function InlineStat({
	label,
	value,
	unit,
}: {
	label: string
	value: string
	unit?: string
}) {
	return (
		<div className="flex items-baseline gap-1.5">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="text-foreground text-sm font-semibold tabular-nums">
				{value}
			</span>
			{unit ? (
				<span className="text-muted-foreground text-xs">{unit}</span>
			) : null}
		</div>
	)
}

const READINESS_TONE: Record<
	ReturnType<typeof readinessFromTsb>['tone'],
	{ chip: string; accent: string }
> = {
	fresh: {
		chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
		accent: 'text-emerald-600 dark:text-emerald-400',
	},
	neutral: {
		chip: 'bg-muted text-muted-foreground',
		accent: 'text-foreground',
	},
	fatigued: {
		chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		accent: 'text-amber-600 dark:text-amber-400',
	},
}

function CoachCard({ tsb, trust }: { tsb: number | null; trust: TsbTrust }) {
	// Cold-start (#57): below the trustworthiness threshold — or with no TSB
	// computed yet — show the honest "building baseline" state, never a number.
	if (!trust.trustworthy || tsb == null) {
		const pct = Math.min(
			100,
			Math.round((trust.daysOfHistory / trust.requiredDays) * 100),
		)
		return (
			<section
				aria-labelledby="coach-heading"
				className="bg-card border-border/60 rounded-xl border p-6"
			>
				<p
					id="coach-heading"
					className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
				>
					Form
				</p>
				<p className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
					Building baseline
				</p>
				<p className="text-muted-foreground mt-1 text-sm">
					Keep logging sessions — your Form reading is reliable after{' '}
					{trust.requiredDays} days of training history.
				</p>
				<div className="mt-4 flex items-center gap-3">
					<div
						className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
						role="progressbar"
						aria-valuemin={0}
						aria-valuemax={trust.requiredDays}
						aria-valuenow={trust.daysOfHistory}
						aria-label="Days of training history toward a reliable Form reading"
					>
						<div
							className="bg-primary h-full rounded-full"
							style={{ width: `${pct}%` }}
						/>
					</div>
					<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
						day {trust.daysOfHistory}/{trust.requiredDays}
					</span>
				</div>
				<CoachCardTrendLink />
			</section>
		)
	}

	// Trustworthy (#58): translate the number into a plain-language readiness
	// label + recommendation.
	const readiness = readinessFromTsb(tsb)
	const rounded = Math.round(tsb)
	const signed = rounded > 0 ? `+${rounded}` : String(rounded)
	const tone = READINESS_TONE[readiness.tone]

	return (
		<section
			aria-labelledby="coach-heading"
			className="bg-card border-border/60 rounded-xl border p-6"
		>
			<p
				id="coach-heading"
				className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
			>
				Form
			</p>
			<div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span
					className={cn(
						'text-4xl font-semibold tracking-tight tabular-nums',
						tone.accent,
					)}
				>
					{signed}
				</span>
				<span
					className={cn(
						'rounded-full px-2.5 py-0.5 text-sm font-medium',
						tone.chip,
					)}
				>
					{readiness.label}
				</span>
			</div>
			<p className="text-muted-foreground mt-2 text-sm">
				{readiness.recommendation}
			</p>
			<CoachCardTrendLink />
		</section>
	)
}

function CoachCardTrendLink() {
	return (
		<Link
			to="/training/load"
			prefetch="intent"
			className="text-muted-foreground hover:text-foreground mt-4 inline-flex items-center gap-1 text-xs font-medium transition-colors"
		>
			View load trend →
		</Link>
	)
}

function SessionHero({
	session,
	timeOfDay,
}: {
	session: UpcomingSession
	timeOfDay: string
}) {
	const discipline = getSessionDiscipline(session)
	const pal = paletteFor(discipline)
	const blocks = session.workout?.blocks ?? []
	const durationMin = sumBlockDurationMin(blocks)
	const activityLabel = getDisciplineLabel(discipline)
	const totalSteps = blocks.reduce(
		(sum, b) => sum + b.steps.length * (b.repeatCount ?? 1),
		0,
	)

	return (
		<li>
			<Link
				to={`/training/upcoming/${session.id}`}
				className="bg-card hover:bg-muted/20 border-border/60 block rounded-xl border p-6 transition"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
								<span className={cn('size-1.5 rounded-full', pal.chip)} />
								{activityLabel}
							</span>
							<span className="text-muted-foreground/60 text-xs">·</span>
							<Badge variant={getStatusVariant(session.status)}>
								{getStatusLabel(session.status)}
							</Badge>
						</div>
						<h3 className="text-foreground mt-2 text-xl font-semibold tracking-tight md:text-2xl">
							{session.workout?.title ?? 'Recording'}
						</h3>
						<p className="text-muted-foreground mt-1 text-sm">
							{timeOfDay}
							{durationMin ? ` · ${durationMin} min` : ''}
							{totalSteps > 0 ? ` · ${totalSteps} steps` : ''}
						</p>
					</div>
					<Icon name="arrow-right" className="text-muted-foreground mt-1" />
				</div>

				{session.workout?.description ? (
					<p className="text-foreground/80 mt-4 line-clamp-2 text-sm">
						{session.workout.description}
					</p>
				) : null}

				{blocks.length > 0 ? (
					<div className="mt-5 grid gap-2 sm:grid-cols-3">
						{blocks.slice(0, 3).map((b) => (
							<div key={b.id} className="border-border/60 border-l-2 py-1 pl-3">
								<p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
									Block {b.orderIndex + 1}
								</p>
								<p className="text-foreground mt-0.5 text-sm font-medium">
									{b.name ?? `Block ${b.orderIndex + 1}`}
								</p>
								<p className="text-muted-foreground text-xs">
									{b.steps.length} step{b.steps.length === 1 ? '' : 's'}
									{b.repeatCount && b.repeatCount > 1
										? ` × ${b.repeatCount}`
										: ''}
								</p>
							</div>
						))}
					</div>
				) : null}
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
