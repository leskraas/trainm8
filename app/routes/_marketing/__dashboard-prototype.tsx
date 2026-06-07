// PROTOTYPE — VariantB ("Week Strip") dashboard wrapped in several nav-bar
// variations to compare. Switchable via `?nav=quiet|pill|sidebar|inline` on
// `/` and the floating PrototypeSwitcher (arrow keys cycle).
//
// Filename starts with `__` so react-router-auto-routes ignores it.
// When a nav direction wins, fold the dashboard + winning nav into the real
// `_marketing/index.tsx` (and adjust `root.tsx`/`AppNavigation`), then delete
// this file and the switcher.

import { LayoutGroup, motion } from 'motion/react'
import { type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { useOptionalHints } from '#app/utils/client-hints.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useOptionalRequestInfo } from '#app/utils/request-info.ts'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import { type UpcomingSession } from '#app/utils/training.server.ts'
import {
	getDisciplineLabel,
	getSessionDiscipline,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'
import { useOptionalUser } from '#app/utils/user.ts'

type RecentLog = {
	id: string
	content: string
	rpe: number | null
	session: { id: string; workout: { title: string } | null }
}

export type DashboardData = {
	nextSession: UpcomingSession | null
	upcomingSessions: UpcomingSession[]
	recentLogs: RecentLog[]
}

// ============================================================
// Nav variants — each wraps VariantB with different chrome.
// ============================================================
export const NAV_VARIANTS = [
	{ key: 'quiet', name: 'Quiet · logo + avatar' },
	{ key: 'pill', name: 'Pill · floating dock' },
	{ key: 'sidebar', name: 'Sidebar · icon rail' },
	{ key: 'inline', name: 'Inline · header tabs' },
] as const

export type NavKey = (typeof NAV_VARIANTS)[number]['key']

export function isNavKey(value: string | null | undefined): value is NavKey {
	return NAV_VARIANTS.some((v) => v.key === value)
}

// Activity → palette mapping so variants can share visual language.
type Palette = { bg: string; ring: string; chip: string; ink: string }

const defaultPalette: Palette = {
	bg: 'from-zinc-500/10 to-zinc-500/5',
	ring: 'ring-zinc-300/40',
	chip: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
	ink: 'text-zinc-600 dark:text-zinc-300',
}

const activityPalette: Record<string, Palette> = {
	run: {
		bg: 'from-orange-500/15 to-rose-500/10',
		ring: 'ring-orange-400/30',
		chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
		ink: 'text-orange-600 dark:text-orange-300',
	},
	bike: {
		bg: 'from-sky-500/15 to-indigo-500/10',
		ring: 'ring-sky-400/30',
		chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		ink: 'text-sky-600 dark:text-sky-300',
	},
	swim: {
		bg: 'from-cyan-500/15 to-teal-500/10',
		ring: 'ring-cyan-400/30',
		chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
		ink: 'text-cyan-600 dark:text-cyan-300',
	},
	strength: {
		bg: 'from-violet-500/15 to-fuchsia-500/10',
		ring: 'ring-violet-400/30',
		chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
		ink: 'text-violet-600 dark:text-violet-300',
	},
}

function paletteFor(discipline: string | undefined): Palette {
	if (!discipline) return defaultPalette
	return activityPalette[discipline] ?? defaultPalette
}

function countdownLabel(scheduledAt: Date | string): string {
	const date = new Date(scheduledAt)
	const diffMs = date.getTime() - Date.now()
	const diffMin = Math.round(diffMs / 60000)
	if (diffMin < 0) return 'Now'
	if (diffMin < 60) return `In ${diffMin} min`
	const diffH = Math.round(diffMin / 60)
	if (diffH < 24) return `In ${diffH}h`
	const diffD = Math.round(diffH / 24)
	if (diffD === 1) return 'Tomorrow'
	if (diffD < 7) return `In ${diffD} days`
	return `In ${Math.round(diffD / 7)}w`
}

function sumBlockDurationMin(session: UpcomingSession): number | null {
	const blocks = session.workout?.blocks ?? []
	if (!blocks.length) return null
	let total = 0
	for (const b of blocks) {
		const repeats = b.repeatCount ?? 1
		for (const step of b.steps) {
			total += (step.durationSec ?? 0) * repeats
		}
	}
	const minutes = Math.round(total / 60)
	return minutes > 0 ? minutes : null
}

function isoDayKey(d: Date): string {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

const ACTIVITY_QUICK_STARTS = [
	{ key: 'run', label: 'Run' },
	{ key: 'bike', label: 'Ride' },
	{ key: 'swim', label: 'Swim' },
	{ key: 'strength', label: 'Strength' },
] as const

function greetingFor(d: Date): string {
	const h = d.getHours()
	if (h < 5) return 'Up late'
	if (h < 12) return 'Good morning'
	if (h < 18) return 'Good afternoon'
	return 'Good evening'
}

// Lock formatters to the SSR-provided locale/timeZone so server and client
// render the same weekday/month strings.
function useLocaleCtx() {
	const hints = useOptionalHints()
	const requestInfo = useOptionalRequestInfo()
	return {
		locale: requestInfo?.locale ?? 'en-US',
		timeZone: hints?.timeZone ?? 'UTC',
	}
}

// ============================================================
// VariantB — Week Strip (the chosen dashboard).
// Horizontal 7-day strip, click a day to render its detail.
// Schedule-first hierarchy.
// ============================================================
export function VariantB({ data }: { data: DashboardData }) {
	const user = useOptionalUser()
	const presenter = useSessionPresenter()
	const { locale } = useLocaleCtx()
	const [searchParams] = useSearchParams()
	const { nextSession, upcomingSessions, recentLogs } = data
	const all = [nextSession, ...upcomingSessions].filter(
		(s): s is UpcomingSession => s != null,
	)

	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const days = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(today)
		d.setDate(today.getDate() + i)
		return d
	})

	const sessionsByDay = new Map<string, UpcomingSession[]>()
	for (const s of all) {
		const d = new Date(s.scheduledAt)
		d.setHours(0, 0, 0, 0)
		const k = isoDayKey(d)
		const arr = sessionsByDay.get(k) ?? []
		arr.push(s)
		sessionsByDay.set(k, arr)
	}

	const requestedDay = searchParams.get('day')
	const requestedFocus = requestedDay
		? days.find((d) => isoDayKey(d) === requestedDay)
		: undefined
	const focusDay: Date =
		requestedFocus ??
		days.find((d) => (sessionsByDay.get(isoDayKey(d)) ?? []).length > 0) ??
		days[0]!
	const focusSessions = sessionsByDay.get(isoDayKey(focusDay)) ?? []
	const firstDay = days[0]!
	const focusIsToday = isoDayKey(focusDay) === isoDayKey(firstDay)

	function dayHref(d: Date) {
		const next = new URLSearchParams(searchParams)
		next.set('day', isoDayKey(d))
		return `?${next.toString()}`
	}

	// Stats — derived from what the loader already returns.
	const sessionsThisWeek = all.length
	const totalPlannedMin = all.reduce(
		(sum, s) => sum + (sumBlockDurationMin(s) ?? 0),
		0,
	)
	const totalSteps = all.reduce(
		(sum, s) =>
			sum +
			(s.workout?.blocks ?? []).reduce(
				(bSum, b) => bSum + b.steps.length * (b.repeatCount ?? 1),
				0,
			),
		0,
	)
	const workloadValue =
		totalPlannedMin > 0
			? String(totalPlannedMin)
			: totalSteps > 0
				? String(totalSteps)
				: '—'
	const rpeValues = recentLogs
		.map((l) => l.rpe)
		.filter((r): r is number => r != null)
	const avgRpe =
		rpeValues.length > 0
			? Math.round(
					(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10,
				) / 10
			: null
	const nextIn = nextSession ? countdownLabel(nextSession.scheduledAt) : '—'

	const upcomingThisWeek = all
		.filter((s) => isoDayKey(new Date(s.scheduledAt)) !== isoDayKey(focusDay))
		.slice(0, 4)

	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-5xl space-y-12">
				{/* Header */}
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="text-muted-foreground text-sm">
							{greetingFor(new Date())},{' '}
							{user?.name ?? user?.username ?? 'athlete'}.
						</p>
						<h1 className="text-foreground mt-1 text-3xl font-semibold tracking-tight">
							Here's your week
						</h1>
					</div>
					<Button
						variant="ghost"
						size="sm"
						render={<Link to="/training/sessions/new" />}
					>
						<Icon name="plus" size="sm" />
						New session
					</Button>
				</header>

				{/* PRIMARY — Today's session */}
				<section aria-labelledby="today-heading">
					<div className="mb-4 flex items-baseline justify-between">
						<h2
							id="today-heading"
							className="text-foreground text-xl font-semibold tracking-tight"
						>
							{focusIsToday
								? 'Today'
								: new Intl.DateTimeFormat(locale, {
										weekday: 'long',
										month: 'long',
										day: 'numeric',
									}).format(focusDay)}
						</h2>
						{!focusIsToday ? (
							<Link
								to={dayHref(firstDay)}
								replace
								preventScrollReset
								className="text-primary text-sm font-medium hover:underline"
							>
								Back to today
							</Link>
						) : (
							<p className="text-muted-foreground text-sm">
								{new Intl.DateTimeFormat(locale, {
									weekday: 'long',
									month: 'long',
									day: 'numeric',
								}).format(focusDay)}
							</p>
						)}
					</div>
					{focusSessions.length === 0 ? (
						<div className="bg-card border-border/60 rounded-xl border p-12 text-center">
							<p className="text-foreground text-base font-medium">Rest day</p>
							<p className="text-muted-foreground mt-1 text-sm">
								Recover hard. Tomorrow's session will thank you.
							</p>
						</div>
					) : (
						<ul className="space-y-3">
							{focusSessions.map((s) => (
								<SessionHero
									key={s.id}
									session={s}
									timeOfDay={presenter.presentSession(s).timeOfDay}
								/>
							))}
						</ul>
					)}

					{/* Stats strip — secondary, inline */}
					<dl className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
						<InlineStat
							label="This week"
							value={String(sessionsThisWeek)}
							unit={sessionsThisWeek === 1 ? 'session' : 'sessions'}
						/>
						<InlineStat
							label={totalPlannedMin > 0 ? 'Volume' : 'Steps'}
							value={workloadValue}
							unit={totalPlannedMin > 0 ? 'min planned' : 'planned'}
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
							value={nextIn}
							unit={
								nextSession
									? presenter.presentSession(nextSession).timeOfDay
									: ''
							}
						/>
					</dl>
				</section>

				{/* SECONDARY — This week */}
				<section aria-labelledby="week-heading">
					<div className="mb-4 flex items-baseline justify-between">
						<h2
							id="week-heading"
							className="text-foreground text-lg font-semibold tracking-tight"
						>
							This week
						</h2>
						<Link
							to="/training/upcoming"
							className="text-muted-foreground hover:text-foreground text-sm font-medium"
						>
							Full ledger →
						</Link>
					</div>
					<div className="bg-card border-border/60 overflow-hidden rounded-xl border">
						<div className="divide-border/60 grid grid-cols-7 divide-x">
							{days.map((d, i) => {
								const k = isoDayKey(d)
								const items = sessionsByDay.get(k) ?? []
								const isToday = i === 0
								const isFocus = isoDayKey(d) === isoDayKey(focusDay)
								return (
									<Link
										key={k}
										to={dayHref(d)}
										replace
										preventScrollReset
										aria-current={isFocus ? 'date' : undefined}
										className={cn(
											'focus-visible:ring-primary/40 flex flex-col gap-1 p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset',
											isFocus ? 'bg-muted/40' : 'hover:bg-muted/30',
										)}
									>
										<div className="flex items-center justify-between">
											<span
												className={cn(
													'text-xs font-medium tracking-wide uppercase',
													isToday ? 'text-foreground' : 'text-muted-foreground',
												)}
											>
												{new Intl.DateTimeFormat(locale, {
													weekday: 'short',
												}).format(d)}
											</span>
											<span
												className={cn(
													'text-sm tabular-nums',
													isToday
														? 'text-foreground font-semibold'
														: 'text-foreground/70',
												)}
											>
												{d.getDate()}
											</span>
										</div>
										<div className="mt-1 flex flex-wrap gap-1">
											{items.length === 0 ? (
												<span className="text-muted-foreground/40 text-xs">
													·
												</span>
											) : (
												items.map((s) => {
													const pal = paletteFor(getSessionDiscipline(s))
													return (
														<span
															key={s.id}
															className={cn('size-2 rounded-full', pal.chip)}
															title={s.workout?.title ?? 'Recording'}
														/>
													)
												})
											)}
										</div>
										{items[0] ? (
											<p className="text-foreground/80 mt-1.5 line-clamp-2 text-xs">
												{items[0].workout?.title ?? 'Recording'}
											</p>
										) : null}
									</Link>
								)
							})}
						</div>
					</div>

					{upcomingThisWeek.length > 0 ? (
						<ul className="mt-4 space-y-2">
							{upcomingThisWeek.map((s) => {
								const p = presenter.presentSession(s)
								const pal = paletteFor(getSessionDiscipline(s))
								return (
									<li key={s.id}>
										<Link
											to={`/training/sessions/${s.id}`}
											className="hover:bg-muted/30 group flex items-center gap-3 rounded-md px-3 py-2 transition"
										>
											<span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
												{p.shortDate}
											</span>
											<span
												className={cn(
													'size-1.5 shrink-0 rounded-full',
													pal.chip,
												)}
											/>
											<span className="text-foreground min-w-0 flex-1 truncate text-sm">
												{s.workout?.title ?? 'Recording'}
											</span>
											<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
												{p.timeOfDay}
											</span>
										</Link>
									</li>
								)
							})}
						</ul>
					) : null}
				</section>

				{/* TERTIARY — Recent reflections */}
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
									to={`/training/sessions/${log.session.id}`}
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

				{/* FOOTER — Quick start (least important; actions, not info) */}
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

function SessionHero({
	session,
	timeOfDay,
}: {
	session: UpcomingSession
	timeOfDay: string
}) {
	const discipline = getSessionDiscipline(session)
	const pal = paletteFor(discipline)
	const durationMin = sumBlockDurationMin(session)
	const activityLabel = getDisciplineLabel(discipline)
	const blocks = session.workout?.blocks ?? []
	const totalSteps = blocks.reduce(
		(sum, b) => sum + b.steps.length * (b.repeatCount ?? 1),
		0,
	)

	return (
		<li>
			<Link
				to={`/training/sessions/${session.id}`}
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

// ============================================================
// Nav-bar variants
// Each is a layout shell that owns the global chrome (top bar, side rail,
// bottom dock — whatever fits) and renders `children` (VariantB) inside.
// Tabs are illustrative: routes match the real `AppNavigation` so the prototype
// can be clicked through without 404s.
// ============================================================

type NavLink = {
	label: string
	href: string
	icon: IconName
	matchPrefix: string
}

const NAV_LINKS: NavLink[] = [
	{ label: 'Home', href: '/', icon: 'home', matchPrefix: '/' },
	{
		label: 'Training',
		href: '/training/upcoming',
		icon: 'barbell',
		matchPrefix: '/training',
	},
	{
		label: 'Settings',
		href: '/settings/profile',
		icon: 'settings',
		matchPrefix: '/settings',
	},
]

function isLinkActive(pathname: string, item: NavLink): boolean {
	if (item.matchPrefix === '/') return pathname === '/'
	return pathname.startsWith(item.matchPrefix)
}

function preserveSearch(searchParams: URLSearchParams, href: string): string {
	// Keep the `nav` param so clicking nav items doesn't drop us out of the
	// prototype. Drop the per-day focus when navigating away from `/`.
	const nav = searchParams.get('nav')
	if (!nav) return href
	const [path, existing] = href.split('?')
	const next = new URLSearchParams(existing)
	next.set('nav', nav)
	return `${path}?${next.toString()}`
}

function BrandMark({ subdued = false }: { subdued?: boolean }) {
	const [searchParams] = useSearchParams()
	return (
		<Link
			to={preserveSearch(searchParams, '/')}
			className="group inline-flex items-baseline gap-1.5"
		>
			<span
				className={cn(
					'text-base font-bold tracking-tight transition group-hover:translate-x-0.5',
					subdued ? 'text-foreground/90' : 'text-foreground',
				)}
			>
				Trainm8
			</span>
			<span className="bg-primary/80 size-1.5 rounded-full" aria-hidden />
		</Link>
	)
}

function UserBubble() {
	const user = useOptionalUser()
	const [searchParams] = useSearchParams()
	const initial = (user?.name ?? user?.username ?? '?')
		.slice(0, 1)
		.toUpperCase()
	return (
		<Link
			to={preserveSearch(searchParams, '/settings/profile')}
			className="border-border/60 bg-card text-foreground hover:bg-muted/40 inline-flex size-9 items-center justify-center rounded-full border text-xs font-semibold transition"
			aria-label="Account"
		>
			{initial}
		</Link>
	)
}

// --- N1 · Quiet --------------------------------------------------------
// Just a slim top bar with brand + avatar. No tabs, no buttons. Trusts
// the dashboard's own header CTA to handle creation. Maximum calm.
function NavQuietShell({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen">
			<header className="border-border/40 sticky top-0 z-30 border-b backdrop-blur-md">
				<div className="bg-background/70 mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
					<BrandMark />
					<UserBubble />
				</div>
			</header>
			{children}
		</div>
	)
}

// --- N2 · Pill ---------------------------------------------------------
// Floating glass dock. Mobile: slim brand+avatar top bar + pill at the
// bottom. Desktop: brand + pill + avatar share one row at the top, with
// the pill centered between brand (left) and avatar (right).
// Active tab uses motion `layoutId` so the highlight glides between items.
// The bar renders globally from `root.tsx` so it persists across routes
// and the highlight can actually slide on real navigation.
export function PillNavBar() {
	return (
		<>
			{/* Mobile: top bar */}
			<header className="border-border/40 fixed inset-x-0 top-0 z-40 border-b backdrop-blur-md sm:hidden">
				<div className="bg-background/70 flex h-14 items-center justify-between px-4">
					<BrandMark />
					<UserBubble />
				</div>
			</header>

			{/* Mobile: floating bottom pill (nav only) */}
			<div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 sm:hidden">
				<PillTabs />
			</div>

			{/* Desktop: single top row — brand · pill · avatar */}
			<div className="pointer-events-none fixed inset-x-0 top-6 z-40 hidden grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 sm:grid">
				<div className="pointer-events-auto justify-self-start">
					<BrandMark />
				</div>
				<div className="pointer-events-auto justify-self-center">
					<PillTabs />
				</div>
				<div className="pointer-events-auto justify-self-end">
					<UserBubble />
				</div>
			</div>
		</>
	)
}

// Just the pill itself — no fixed positioning, so it can be placed inside
// a layout row (desktop) or a floating bottom container (mobile).
function PillTabs() {
	const location = useLocation()
	const [searchParams] = useSearchParams()
	const activeKey =
		NAV_LINKS.find((item) => isLinkActive(location.pathname, item))?.href ??
		null

	return (
		<LayoutGroup id="pill-nav">
			<motion.nav
				aria-label="Primary"
				layout
				transition={{ type: 'spring', stiffness: 380, damping: 32 }}
				className="border-border/40 bg-background/85 flex items-center gap-1 rounded-full border p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:ring-white/5"
			>
				{NAV_LINKS.map((item) => {
					const active = item.href === activeKey
					return (
						<PillNavItem
							key={item.href}
							item={item}
							active={active}
							href={preserveSearch(searchParams, item.href)}
						/>
					)
				})}
				<span className="bg-border/60 mx-1 h-6 w-px" aria-hidden />
				<PillNewButton
					href={preserveSearch(searchParams, '/training/sessions/new')}
				/>
			</motion.nav>
		</LayoutGroup>
	)
}

function PillNavItem({
	item,
	active,
	href,
}: {
	item: NavLink
	active: boolean
	href: string
}) {
	return (
		<motion.div
			whileHover={{ scale: 1.06 }}
			whileTap={{ scale: 0.94 }}
			transition={{ type: 'spring', stiffness: 400, damping: 25 }}
			className="relative"
		>
			<Link
				to={href}
				aria-current={active ? 'page' : undefined}
				className={cn(
					'relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
					active
						? 'text-background'
						: 'text-muted-foreground hover:text-foreground',
				)}
			>
				{active ? (
					<motion.span
						layoutId="pill-nav-active"
						className="bg-foreground absolute inset-0 rounded-full shadow-sm"
						transition={{ type: 'spring', stiffness: 380, damping: 32 }}
					/>
				) : null}
				<span className="relative z-10 inline-flex items-center gap-2">
					<Icon name={item.icon} size="sm" />
					<span className="hidden sm:inline">{item.label}</span>
				</span>
			</Link>
		</motion.div>
	)
}

function PillNewButton({ href }: { href: string }) {
	return (
		<motion.div
			whileHover={{ scale: 1.06 }}
			whileTap={{ scale: 0.94 }}
			transition={{ type: 'spring', stiffness: 400, damping: 25 }}
		>
			<Link
				to={href}
				className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
			>
				<Icon name="plus" size="sm" />
				<span className="hidden sm:inline">New</span>
			</Link>
		</motion.div>
	)
}

// --- N3 · Sidebar ------------------------------------------------------
// Slim vertical icon rail on desktop; falls back to a bottom tab bar on
// mobile. Closest in spirit to the current AppNavigation, but tighter.
function NavSidebarShell({ children }: { children: ReactNode }) {
	const location = useLocation()
	const [searchParams] = useSearchParams()
	return (
		<div className="min-h-screen sm:flex">
			<aside
				aria-label="Primary"
				className="border-border/40 bg-background/60 sticky top-0 z-30 hidden h-screen w-16 shrink-0 flex-col items-center justify-between border-r py-4 backdrop-blur-sm sm:flex"
			>
				<div className="flex flex-col items-center gap-6">
					<Link
						to={preserveSearch(searchParams, '/')}
						className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl text-sm font-bold tracking-tight"
						aria-label="Trainm8 home"
					>
						T
					</Link>
					<div className="flex flex-col items-center gap-1.5">
						{NAV_LINKS.map((item) => {
							const active = isLinkActive(location.pathname, item)
							return (
								<Link
									key={item.href}
									to={preserveSearch(searchParams, item.href)}
									aria-current={active ? 'page' : undefined}
									aria-label={item.label}
									className={cn(
										'group focus-visible:ring-primary/40 grid size-10 place-items-center rounded-xl transition focus:outline-none focus-visible:ring-2',
										active
											? 'bg-muted text-foreground'
											: 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
									)}
								>
									<Icon name={item.icon} size="md" />
								</Link>
							)
						})}
					</div>
				</div>
				<div className="flex flex-col items-center gap-3">
					<Link
						to={preserveSearch(searchParams, '/training/sessions/new')}
						className="bg-foreground text-background hover:bg-foreground/90 grid size-10 place-items-center rounded-xl transition"
						aria-label="New session"
					>
						<Icon name="plus" size="md" />
					</Link>
					<UserBubble />
				</div>
			</aside>

			<div className="flex-1">
				{/* Mobile top bar — sidebar is hidden below sm. */}
				<header className="border-border/40 sticky top-0 z-30 border-b backdrop-blur-md sm:hidden">
					<div className="bg-background/70 flex h-14 items-center justify-between px-4">
						<BrandMark />
						<UserBubble />
					</div>
				</header>
				{children}
				{/* Mobile bottom tab bar. */}
				<nav
					aria-label="Primary"
					className="border-border bg-background fixed inset-x-0 bottom-0 z-40 border-t sm:hidden"
				>
					<div className="flex h-16 items-center justify-around">
						{NAV_LINKS.map((item) => {
							const active = isLinkActive(location.pathname, item)
							return (
								<Link
									key={item.href}
									to={preserveSearch(searchParams, item.href)}
									aria-current={active ? 'page' : undefined}
									className={cn(
										'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
										active
											? 'text-foreground'
											: 'text-muted-foreground hover:text-foreground',
									)}
								>
									<Icon name={item.icon} size="lg" />
									{item.label}
								</Link>
							)
						})}
					</div>
				</nav>
				<div className="sm:hidden" aria-hidden style={{ height: '4rem' }} />
			</div>
		</div>
	)
}

// --- N4 · Inline tabs --------------------------------------------------
// Brand + tabs share one slim top row, all inside the dashboard's max-w
// container. Feels like a desktop SaaS app. No floating elements.
function NavInlineShell({ children }: { children: ReactNode }) {
	const location = useLocation()
	const [searchParams] = useSearchParams()
	return (
		<div className="min-h-screen">
			<header className="border-border/40 border-b">
				<div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 pt-4 pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
					<div className="flex items-center justify-between gap-4 sm:justify-start">
						<BrandMark />
						<UserBubble />
					</div>
					<nav
						aria-label="Primary"
						className="flex items-center gap-1 overflow-x-auto"
					>
						{NAV_LINKS.map((item) => {
							const active = isLinkActive(location.pathname, item)
							return (
								<Link
									key={item.href}
									to={preserveSearch(searchParams, item.href)}
									aria-current={active ? 'page' : undefined}
									className={cn(
										'relative inline-flex items-center gap-2 px-2 py-3 text-sm font-medium transition-colors',
										active
											? 'text-foreground'
											: 'text-muted-foreground hover:text-foreground',
									)}
								>
									<Icon name={item.icon} size="sm" />
									{item.label}
									<span
										className={cn(
											'pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full',
											active ? 'bg-foreground' : 'bg-transparent',
										)}
										aria-hidden
									/>
								</Link>
							)
						})}
					</nav>
				</div>
			</header>
			{children}
		</div>
	)
}

const NAV_SHELLS: Record<
	Exclude<NavKey, 'pill'>,
	(props: { children: ReactNode }) => ReactNode
> = {
	quiet: NavQuietShell,
	sidebar: NavSidebarShell,
	inline: NavInlineShell,
}

function NavPillShell({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen pt-20 pb-28 sm:pt-24 sm:pb-12">
			<PillNavBar />
			{children}
		</div>
	)
}

export function DashboardWithNav({
	data,
	nav,
}: {
	data: DashboardData
	nav: NavKey
}) {
	const Shell = nav === 'pill' ? NavPillShell : NAV_SHELLS[nav]
	return (
		<Shell>
			<VariantB data={data} />
		</Shell>
	)
}
