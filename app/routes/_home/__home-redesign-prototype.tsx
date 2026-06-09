// PROTOTYPE — four radically different full-page redesigns of the home
// dashboard, rendered on the existing `/` route (sub-shape A) and switchable
// via `?variant=live|a|b|c|d` + the floating PrototypeSwitcher (arrow keys
// cycle). `live` shows the current production dashboard for comparison.
//
//   a — Command center · split cockpit (dense two-column, sticky side rail)
//   b — Coach briefing · editorial (typography-first, prose + timeline)
//   c — Calendar wall · planner (14-day grid is the page)
//   d — Race mode · focus hero (dark full-bleed hero, TSB gauge, film strip)
//
// Filename starts with `__` so react-router-auto-routes ignores it.
// When a direction wins, fold it into `index.tsx` and delete this file.

import { Link } from 'react-router'
import {
	type LoadSnapshot,
	type LoadTriad,
} from '#app/components/form-load-card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	buildWeekDays,
	countdownLabel,
	greetingFor,
	isoDayKey,
	paletteFor,
	planArc,
	sumBlockDurationMin,
} from '#app/utils/dashboard.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import {
	type SustainedDeviation,
	reconcileCoach,
} from '#app/utils/load/coach.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	buildLedgerRows,
	type SessionRow,
} from '#app/utils/session-ledger-rows.ts'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import {
	deriveSessionProfile,
	type ProfileBar,
	type TrainingZone,
} from '#app/utils/session-profile.ts'
import {
	type ActivePlan,
	type LedgerSession,
	type UpcomingSession,
} from '#app/utils/training.server.ts'
import {
	getDisciplineLabel,
	getSessionDiscipline,
} from '#app/utils/training.ts'
import { useOptionalUser } from '#app/utils/user.ts'
import { SessionLedger } from './session-ledger.tsx'

export const HOME_VARIANTS = [
	{ key: 'live', name: 'Live · current dashboard' },
	{ key: 'a', name: 'Command center · split cockpit' },
	{ key: 'b', name: 'Coach briefing · editorial' },
	{ key: 'c', name: 'Calendar wall · planner' },
	{ key: 'd', name: 'Race mode · focus hero' },
] as const

export type HomeVariantKey = (typeof HOME_VARIANTS)[number]['key']

export function isHomeVariantKey(
	value: string | null | undefined,
): value is HomeVariantKey {
	return HOME_VARIANTS.some((v) => v.key === value)
}

type RecentLog = {
	id: string
	content: string
	rpe: number | null
	session: { id: string; workout: { title: string } | null }
}

export type HomeData = {
	nextSession: UpcomingSession | null
	upcomingSessions: UpcomingSession[]
	recentLogs: RecentLog[]
	ledger: LedgerSession[]
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	tsbTrust: TsbTrust
	activePlan: ActivePlan | null
	weeklyAdherence: WeeklyAdherence | null
	sustained: SustainedDeviation | null
}

export function HomeRedesignVariant({
	data,
	variant,
}: {
	data: HomeData
	variant: Exclude<HomeVariantKey, 'live'>
}) {
	switch (variant) {
		case 'a':
			return <VariantCommandCenter data={data} />
		case 'b':
			return <VariantCoachBriefing data={data} />
		case 'c':
			return <VariantCalendarWall data={data} />
		case 'd':
			return <VariantRaceMode data={data} />
	}
}

// ---------- shared scraps ----------------------------------------------

function signed(n: number): string {
	const r = Math.round(n)
	return r > 0 ? `+${r}` : String(r)
}

function allUpcoming(data: HomeData): UpcomingSession[] {
	return [
		...(data.nextSession ? [data.nextSession] : []),
		...data.upcomingSessions,
	]
}

function weekStats(data: HomeData) {
	const weekKeys = buildWeekDays(new Date()).map((d) => isoDayKey(d))
	const sessions = allUpcoming(data).filter((s) =>
		weekKeys.includes(isoDayKey(new Date(s.scheduledAt))),
	)
	let totalMin = 0
	for (const s of sessions) {
		totalMin += sumBlockDurationMin(s.workout?.blocks ?? []) ?? 0
	}
	const rpeValues = data.recentLogs
		.map((l) => l.rpe)
		.filter((r): r is number => r != null)
	const avgRpe =
		rpeValues.length > 0
			? Math.round(
					(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10,
				) / 10
			: null
	return { sessions, totalMin, avgRpe, rpeCount: rpeValues.length }
}

const ZONE_COLOR: Record<TrainingZone, string> = {
	1: 'bg-sky-400 dark:bg-sky-500',
	2: 'bg-emerald-400 dark:bg-emerald-500',
	3: 'bg-amber-400 dark:bg-amber-500',
	4: 'bg-orange-500',
	5: 'bg-rose-500 dark:bg-rose-600',
}

function ShapeBars({
	bars,
	className,
}: {
	bars: ProfileBar[]
	className?: string
}) {
	if (bars.length === 0) return null
	const hasDuration = bars.some((b) => b.durationSec > 0)
	const maxZone = 5
	return (
		<span
			aria-hidden
			className={cn(
				'flex h-5 w-full items-end gap-px overflow-hidden',
				className,
			)}
		>
			{bars.map((bar) => (
				<span
					key={bar.id}
					style={{
						flexGrow: hasDuration ? bar.durationSec || 0.001 : 1,
						height: `${((bar.zone ?? 1) / maxZone) * 100}%`,
					}}
					className={cn(
						'block min-w-px rounded-[1px]',
						bar.zone == null ? 'bg-muted-foreground/30' : ZONE_COLOR[bar.zone],
					)}
				/>
			))}
		</span>
	)
}

function coachLine(data: HomeData): {
	tone: 'fresh' | 'neutral' | 'fatigued' | 'under' | 'over' | null
	label: string
	recommendation: string
	tsb: number | null
} {
	const tsb = data.current?.tsb ?? null
	const coldStart = !data.tsbTrust.trustworthy || tsb == null
	const readiness = !coldStart && tsb != null ? readinessFromTsb(tsb) : null
	const coach = reconcileCoach(readiness, data.sustained)
	if (!coach) {
		return {
			tone: null,
			label: 'Building baseline',
			recommendation: `Your Form reading is reliable after ${data.tsbTrust.requiredDays} days — day ${data.tsbTrust.daysOfHistory}/${data.tsbTrust.requiredDays}.`,
			tsb: coldStart ? null : tsb,
		}
	}
	return {
		tone: coach.tone,
		label: coach.label,
		recommendation: coach.recommendation,
		tsb: coldStart ? null : tsb,
	}
}

// ========================================================================
// Variant A — Command center · split cockpit
// Dense two-column ops layout: ledger-dominant main column on the left, a
// sticky instrument rail on the right (form dial, plan arc, week numbers,
// reflections). Information density over breathing room.
// ========================================================================
function VariantCommandCenter({ data }: { data: HomeData }) {
	const user = useOptionalUser()
	const presenter = useSessionPresenter()
	const stats = weekStats(data)
	const coach = coachLine(data)
	const next = data.nextSession
	const arc = data.activePlan
		? planArc(data.activePlan.phases, new Date(data.activePlan.eventDate))
		: null

	const toneInk: Record<string, string> = {
		fresh: 'text-emerald-600 dark:text-emerald-400',
		fatigued: 'text-amber-600 dark:text-amber-400',
		under: 'text-amber-600 dark:text-amber-400',
		over: 'text-rose-600 dark:text-rose-400',
	}

	return (
		<main className="min-h-screen px-4 py-6">
			<div className="mx-auto max-w-6xl">
				<header className="mb-6 flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-baseline gap-3">
						<h1 className="text-foreground text-xl font-semibold tracking-tight">
							{greetingFor(new Date())},{' '}
							{user?.name ?? user?.username ?? 'athlete'}
						</h1>
						<span className="text-muted-foreground text-sm">
							{presenter.formatDayLabel(new Date())}
						</span>
					</div>
					<Link
						to="/training/sessions/new"
						className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition"
					>
						<Icon name="plus" size="sm" />
						New session
					</Link>
				</header>

				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
					{/* main column */}
					<div className="min-w-0 space-y-6">
						{next ? (
							<NextUpRow
								session={next}
								timeOfDay={presenter.presentSession(next).timeOfDay}
							/>
						) : (
							<div className="border-border/60 bg-card rounded-lg border px-4 py-3 text-sm">
								<span className="text-foreground font-medium">Rest day.</span>{' '}
								<span className="text-muted-foreground">
									Nothing on the schedule.
								</span>
							</div>
						)}

						<section aria-labelledby="cc-ledger">
							<h2
								id="cc-ledger"
								className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
							>
								Session ledger
							</h2>
							<SessionLedger sessions={data.ledger} />
						</section>
					</div>

					{/* instrument rail */}
					<aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
						<section className="border-border/60 bg-card rounded-lg border p-4">
							<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Form
							</p>
							<div className="mt-1 flex items-baseline gap-2">
								<span
									className={cn(
										'text-4xl font-semibold tracking-tight tabular-nums',
										coach.tone ? toneInk[coach.tone] : 'text-foreground',
									)}
								>
									{coach.tsb != null ? signed(coach.tsb) : '—'}
								</span>
								<span className="text-foreground text-sm font-medium">
									{coach.label}
								</span>
							</div>
							<p className="text-muted-foreground mt-2 text-xs">
								{coach.recommendation}
							</p>
							<dl className="border-border/60 mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center">
								<RailStat label="Fit" value={data.current?.ctl} />
								<RailStat label="Fatigue" value={data.current?.atl} />
								<RailStat label="Form" value={data.current?.tsb} />
							</dl>
						</section>

						<section className="border-border/60 bg-card rounded-lg border p-4">
							<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								This week
							</p>
							<dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-3">
								<RailStat label="Sessions" value={stats.sessions.length} />
								<RailStat
									label="Volume"
									value={stats.totalMin > 0 ? stats.totalMin : null}
									unit="min"
								/>
								<RailStat
									label="Adherence"
									value={
										data.weeklyAdherence
											? Math.round(data.weeklyAdherence.ratio * 100)
											: null
									}
									unit="%"
								/>
								<RailStat label="Avg RPE" value={stats.avgRpe} />
							</dl>
						</section>

						{data.activePlan && arc ? (
							<Link
								to={`/training/events/${data.activePlan.eventId}`}
								className="border-border/60 bg-card hover:bg-muted/30 block rounded-lg border p-4 transition"
							>
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Plan · {arc.phase}
								</p>
								<p className="text-foreground mt-1 truncate text-sm font-medium">
									{data.activePlan.eventName}
								</p>
								<p className="text-muted-foreground mt-0.5 text-xs">
									Week {arc.weekInPlan}/{arc.totalWeeks} · {arc.countdown}
								</p>
								<div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
									<div
										className="bg-primary h-full rounded-full"
										style={{ width: `${arc.progressPct}%` }}
									/>
								</div>
							</Link>
						) : (
							<Link
								to="/training/plan/new"
								className="border-border/60 bg-card hover:bg-muted/30 block rounded-lg border p-4 transition"
							>
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Plan
								</p>
								<p className="text-foreground mt-1 text-sm font-medium">
									No active plan — generate one →
								</p>
							</Link>
						)}

						{data.recentLogs.length > 0 ? (
							<section className="border-border/60 bg-card rounded-lg border p-4">
								<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Reflections
								</p>
								<ul className="divide-border/60 mt-2 divide-y">
									{data.recentLogs.slice(0, 3).map((log) => (
										<li key={log.id} className="py-2 first:pt-0 last:pb-0">
											<Link
												to={`/training/sessions/${log.session.id}`}
												className="group block"
											>
												<div className="flex items-baseline justify-between gap-2">
													<span className="text-foreground truncate text-xs font-medium group-hover:underline">
														{log.session.workout?.title ?? 'Recording'}
													</span>
													{log.rpe != null ? (
														<span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
															RPE {log.rpe}
														</span>
													) : null}
												</div>
												<p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
													{log.content}
												</p>
											</Link>
										</li>
									))}
								</ul>
							</section>
						) : null}
					</aside>
				</div>
			</div>
		</main>
	)
}

function NextUpRow({
	session,
	timeOfDay,
}: {
	session: UpcomingSession
	timeOfDay: string
}) {
	const discipline = getSessionDiscipline(session)
	const pal = paletteFor(discipline)
	const durationMin = sumBlockDurationMin(session.workout?.blocks ?? [])
	const bars = deriveSessionProfile(session.workout).bars
	return (
		<Link
			to={`/training/sessions/${session.id}`}
			className="border-border/60 bg-card hover:bg-muted/20 flex items-center gap-4 rounded-lg border px-4 py-3 transition"
		>
			<span className={cn('size-2 shrink-0 rounded-full', pal.chip)} />
			<div className="min-w-0 flex-1">
				<p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
					Next up · {countdownLabel(new Date(session.scheduledAt))}
				</p>
				<p className="text-foreground truncate text-sm font-semibold">
					{session.workout?.title ?? 'Recording'}
				</p>
			</div>
			<div className="hidden w-28 sm:block">
				<ShapeBars bars={bars} />
			</div>
			<div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
				<p>{timeOfDay}</p>
				{durationMin ? <p>{durationMin} min</p> : null}
			</div>
			<Icon
				name="chevron-right"
				className="text-muted-foreground shrink-0"
				size="sm"
			/>
		</Link>
	)
}

function RailStat({
	label,
	value,
	unit,
}: {
	label: string
	value: number | null | undefined
	unit?: string
}) {
	return (
		<div>
			<dt className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
				{label}
			</dt>
			<dd className="text-foreground text-lg font-semibold tabular-nums">
				{value != null ? Math.round(value * 10) / 10 : '—'}
				{value != null && unit ? (
					<span className="text-muted-foreground ml-0.5 text-xs font-normal">
						{unit}
					</span>
				) : null}
			</dd>
		</div>
	)
}

// ========================================================================
// Variant B — Coach briefing · editorial
// No cards, no grid. A narrow column of typography that *reads* like a
// coach's morning note: a composed headline sentence, an agenda timeline
// for the days ahead, stats as a prose sentence, reflections as pull
// quotes. Hierarchy via type scale and rules only.
// ========================================================================
function VariantCoachBriefing({ data }: { data: HomeData }) {
	const user = useOptionalUser()
	const presenter = useSessionPresenter()
	const coach = coachLine(data)
	const stats = weekStats(data)
	const next = data.nextSession
	const arc = data.activePlan
		? planArc(data.activePlan.phases, new Date(data.activePlan.eventDate))
		: null

	const todayKey = isoDayKey(new Date())
	const nextIsToday =
		next != null && isoDayKey(new Date(next.scheduledAt)) === todayKey
	const nextDuration = next
		? sumBlockDurationMin(next.workout?.blocks ?? [])
		: null

	// Agenda: the next 7 days, every day, sessions or rest.
	const days = buildWeekDays(new Date())
	const byDay = new Map<string, UpcomingSession[]>()
	for (const s of allUpcoming(data)) {
		const k = isoDayKey(new Date(s.scheduledAt))
		byDay.set(k, [...(byDay.get(k) ?? []), s])
	}

	return (
		<main className="min-h-screen px-4 py-12">
			<div className="mx-auto max-w-2xl">
				<p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
					{presenter.formatDayLabel(new Date())} · {greetingFor(new Date())},{' '}
					{user?.name ?? user?.username ?? 'athlete'}
				</p>

				<h1 className="text-foreground mt-4 text-4xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-5xl">
					{coach.tsb != null ? (
						<>
							You&apos;re {coach.label.toLowerCase()}{' '}
							<span className="text-muted-foreground">
								({signed(coach.tsb)})
							</span>
							.
						</>
					) : (
						<>{coach.label}.</>
					)}{' '}
					{next ? (
						<>
							{nextIsToday
								? 'Today'
								: countdownLabel(new Date(next.scheduledAt))}
							:{' '}
							<Link
								to={`/training/sessions/${next.id}`}
								className="decoration-muted-foreground/40 underline decoration-2 underline-offset-4 hover:decoration-current"
							>
								{next.workout?.title ?? 'a recording'}
							</Link>
							{nextDuration ? `, ${nextDuration} minutes` : ''}.
						</>
					) : (
						<>Nothing scheduled — rest, or plan something.</>
					)}
				</h1>

				<p className="text-muted-foreground mt-6 text-lg leading-relaxed">
					{coach.recommendation}
					{arc && data.activePlan ? (
						<>
							{' '}
							You&apos;re in week {arc.weekInPlan} of {arc.totalWeeks} (
							{arc.phase}) on the road to{' '}
							<Link
								to={`/training/events/${data.activePlan.eventId}`}
								className="text-foreground underline decoration-1 underline-offset-2 hover:no-underline"
							>
								{data.activePlan.eventName}
							</Link>
							, {arc.countdown.toLowerCase()}.
						</>
					) : null}
				</p>

				<hr className="border-border/60 my-10" />

				<section aria-labelledby="briefing-week">
					<h2
						id="briefing-week"
						className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase"
					>
						The week ahead
					</h2>
					<ol className="mt-6">
						{days.map((d) => {
							const k = isoDayKey(d)
							const items = byDay.get(k) ?? []
							const isToday = k === todayKey
							return (
								<li
									key={k}
									className="border-border/40 grid grid-cols-[5.5rem_1fr] gap-4 border-b py-4 first:pt-0 last:border-b-0"
								>
									<div
										className={cn(
											'pt-0.5 text-sm',
											isToday
												? 'text-foreground font-semibold'
												: 'text-muted-foreground',
										)}
									>
										{isToday
											? 'Today'
											: new Intl.DateTimeFormat('en-US', {
													weekday: 'short',
													day: 'numeric',
												}).format(d)}
									</div>
									{items.length === 0 ? (
										<p className="text-muted-foreground/60 text-sm italic">
											Rest
										</p>
									) : (
										<div className="space-y-3">
											{items.map((s) => {
												const pal = paletteFor(getSessionDiscipline(s))
												const min = sumBlockDurationMin(s.workout?.blocks ?? [])
												return (
													<Link
														key={s.id}
														to={`/training/sessions/${s.id}`}
														className="group block"
													>
														<p className="text-foreground text-base font-medium group-hover:underline">
															{s.workout?.title ?? 'Recording'}
														</p>
														<p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-sm">
															<span
																className={cn(
																	'size-1.5 rounded-full',
																	pal.chip,
																)}
															/>
															{getDisciplineLabel(getSessionDiscipline(s))}
															{min ? ` · ${min} min` : ''}
															{' · '}
															{presenter.presentSession(s).timeOfDay}
														</p>
													</Link>
												)
											})}
										</div>
									)}
								</li>
							)
						})}
					</ol>
				</section>

				<p className="text-muted-foreground mt-10 text-base leading-relaxed">
					This week holds{' '}
					<strong className="text-foreground font-semibold">
						{stats.sessions.length} session
						{stats.sessions.length === 1 ? '' : 's'}
					</strong>
					{stats.totalMin > 0 ? (
						<>
							{' '}
							and{' '}
							<strong className="text-foreground font-semibold">
								{stats.totalMin} minutes
							</strong>{' '}
							of planned work
						</>
					) : null}
					{data.weeklyAdherence ? (
						<>
							. Plan adherence so far:{' '}
							<strong className="text-foreground font-semibold">
								{Math.round(data.weeklyAdherence.ratio * 100)}%
							</strong>{' '}
							({data.weeklyAdherence.band.label.toLowerCase()})
						</>
					) : null}
					{stats.avgRpe != null ? (
						<>
							. Recent sessions felt like{' '}
							<strong className="text-foreground font-semibold">
								RPE {stats.avgRpe}
							</strong>{' '}
							on average
						</>
					) : null}
					.
				</p>

				{data.recentLogs.length > 0 ? (
					<>
						<hr className="border-border/60 my-10" />
						<section aria-labelledby="briefing-notes">
							<h2
								id="briefing-notes"
								className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase"
							>
								In your own words
							</h2>
							<div className="mt-6 space-y-6">
								{data.recentLogs.slice(0, 2).map((log) => (
									<blockquote
										key={log.id}
										className="border-foreground/20 border-l-2 pl-4"
									>
										<p className="text-foreground text-lg leading-relaxed italic">
											“{log.content}”
										</p>
										<footer className="text-muted-foreground mt-2 text-sm">
											—{' '}
											<Link
												to={`/training/sessions/${log.session.id}`}
												className="hover:underline"
											>
												{log.session.workout?.title ?? 'Recording'}
											</Link>
											{log.rpe != null ? `, RPE ${log.rpe}` : ''}
										</footer>
									</blockquote>
								))}
							</div>
						</section>
					</>
				) : null}

				<hr className="border-border/60 my-10" />
				<p className="text-muted-foreground text-sm">
					<Link
						to="/training/sessions/new"
						className="text-foreground hover:underline"
					>
						Plan a session →
					</Link>
				</p>
			</div>
		</main>
	)
}

// ========================================================================
// Variant C — Calendar wall · planner
// The 14-day horizon grid IS the page: two week rows of seven day cells,
// sessions as discipline-coloured blocks with workout shape, today framed.
// A slim status strip on top, the recent past compressed into a small
// per-day completion strip below. Everything is anchored to a day.
// ========================================================================
function VariantCalendarWall({ data }: { data: HomeData }) {
	const presenter = useSessionPresenter()
	const coach = coachLine(data)
	const todayKey = isoDayKey(new Date())

	const days = buildWeekDays(new Date(), 14)
	const weeks = [days.slice(0, 7), days.slice(7, 14)]
	const byDay = new Map<string, UpcomingSession[]>()
	for (const s of allUpcoming(data)) {
		const k = isoDayKey(new Date(s.scheduledAt))
		byDay.set(k, [...(byDay.get(k) ?? []), s])
	}

	// Recent past: ledger session rows strictly before today, latest 14 days.
	const pastRows = buildLedgerRows(data.ledger)
		.filter((r): r is SessionRow => r.kind === 'session' && r.isPast)
		.slice(-14)

	return (
		<main className="min-h-screen px-4 py-6">
			<div className="mx-auto max-w-6xl">
				<header className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-foreground text-xl font-semibold tracking-tight">
						Next 14 days
					</h1>
					<div className="flex items-center gap-3 text-sm">
						<span className="text-muted-foreground">
							Form{' '}
							<strong className="text-foreground font-semibold tabular-nums">
								{coach.tsb != null ? signed(coach.tsb) : '—'}
							</strong>{' '}
							{coach.tsb != null ? `· ${coach.label}` : ''}
						</span>
						<span className="text-muted-foreground">
							Adherence{' '}
							<strong className="text-foreground font-semibold tabular-nums">
								{data.weeklyAdherence
									? `${Math.round(data.weeklyAdherence.ratio * 100)}%`
									: '—'}
							</strong>
						</span>
						<Link
							to="/training/sessions/new"
							className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition"
						>
							<Icon name="plus" size="sm" />
							Plan
						</Link>
					</div>
				</header>

				<div className="border-border/60 overflow-hidden rounded-xl border">
					{weeks.map((week, wi) => (
						<div
							key={wi}
							className={cn(
								'divide-border/60 grid grid-cols-2 divide-x sm:grid-cols-7',
								wi > 0 && 'border-border/60 border-t',
							)}
						>
							{week.map((d) => {
								const k = isoDayKey(d)
								const items = byDay.get(k) ?? []
								const isToday = k === todayKey
								return (
									<div
										key={k}
										className={cn(
											'flex min-h-32 flex-col gap-1.5 p-2',
											isToday ? 'bg-primary/5' : 'bg-card',
										)}
									>
										<div className="flex items-baseline justify-between px-0.5">
											<span
												className={cn(
													'text-[10px] font-medium tracking-wide uppercase',
													isToday ? 'text-primary' : 'text-muted-foreground',
												)}
											>
												{isToday
													? 'Today'
													: new Intl.DateTimeFormat('en-US', {
															weekday: 'short',
														}).format(d)}
											</span>
											<span
												className={cn(
													'text-xs tabular-nums',
													isToday
														? 'text-foreground font-semibold'
														: 'text-muted-foreground',
												)}
											>
												{d.getDate()}
											</span>
										</div>
										{items.map((s) => {
											const pal = paletteFor(getSessionDiscipline(s))
											const min = sumBlockDurationMin(s.workout?.blocks ?? [])
											const bars = deriveSessionProfile(s.workout).bars
											return (
												<Link
													key={s.id}
													to={`/training/sessions/${s.id}`}
													className={cn(
														'block rounded-md bg-gradient-to-br p-2 ring-1 transition hover:brightness-95 dark:hover:brightness-110',
														pal.bg,
														pal.ring,
													)}
												>
													<p className="text-foreground line-clamp-2 text-xs font-medium">
														{s.workout?.title ?? 'Recording'}
													</p>
													<p className={cn('mt-0.5 text-[10px]', pal.ink)}>
														{presenter.presentSession(s).timeOfDay}
														{min ? ` · ${min}m` : ''}
													</p>
													{bars.length > 0 ? (
														<ShapeBars bars={bars} className="mt-1.5 h-3" />
													) : null}
												</Link>
											)
										})}
									</div>
								)
							})}
						</div>
					))}
				</div>

				{pastRows.length > 0 ? (
					<section aria-labelledby="wall-past" className="mt-8">
						<h2
							id="wall-past"
							className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
						>
							Just behind you
						</h2>
						<ul className="divide-border/60 border-border/60 bg-card divide-y overflow-hidden rounded-xl border">
							{pastRows
								.slice()
								.reverse()
								.slice(0, 6)
								.map((row) => {
									const e = row.entry
									const pal = paletteFor(e.discipline)
									return (
										<li key={row.id}>
											<Link
												to={`/training/sessions/${row.id}`}
												className="hover:bg-muted/30 flex items-center gap-3 px-4 py-2.5 transition"
											>
												<span
													className={cn(
														'size-1.5 shrink-0 rounded-full',
														pal.chip,
													)}
												/>
												<span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
													{presenter.presentSession(row.session).shortDate}
												</span>
												<span className="text-foreground min-w-0 flex-1 truncate text-sm">
													{e.title ??
														`${getDisciplineLabel(e.discipline)} recording`}
												</span>
												{e.status === 'missed' ? (
													<span className="text-destructive shrink-0 text-xs font-medium">
														Missed
													</span>
												) : (
													<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
														{e.durationMin != null ? `${e.durationMin}m` : ''}
														{e.load != null
															? ` · ${Math.round(e.load)} TSS`
															: ''}
														{e.rpe != null ? ` · RPE ${e.rpe}` : ''}
													</span>
												)}
											</Link>
										</li>
									)
								})}
						</ul>
					</section>
				) : null}
			</div>
		</main>
	)
}

// ========================================================================
// Variant D — Race mode · focus hero
// One thing matters: the next session. A dark full-bleed hero with huge
// type, a countdown, and a circular TSB gauge. Everything else lives in a
// horizontal film strip + a slim stat bar below. Bold and sporty.
// ========================================================================
const HERO_GRADIENT: Record<string, string> = {
	run: 'from-orange-950 via-zinc-950 to-zinc-950',
	bike: 'from-sky-950 via-zinc-950 to-zinc-950',
	swim: 'from-cyan-950 via-zinc-950 to-zinc-950',
	strength: 'from-violet-950 via-zinc-950 to-zinc-950',
}

const HERO_ACCENT: Record<string, string> = {
	run: 'text-orange-400',
	bike: 'text-sky-400',
	swim: 'text-cyan-400',
	strength: 'text-violet-400',
}

function VariantRaceMode({ data }: { data: HomeData }) {
	const presenter = useSessionPresenter()
	const coach = coachLine(data)
	const stats = weekStats(data)
	const next = data.nextSession
	const discipline = next ? getSessionDiscipline(next) : null
	const durationMin = next
		? sumBlockDurationMin(next.workout?.blocks ?? [])
		: null
	const bars = next ? deriveSessionProfile(next.workout).bars : []
	const arc = data.activePlan
		? planArc(data.activePlan.phases, new Date(data.activePlan.eventDate))
		: null

	return (
		<main className="min-h-screen">
			{/* HERO */}
			<section
				className={cn(
					'bg-gradient-to-br px-4 py-12 text-white sm:py-16',
					HERO_GRADIENT[discipline ?? ''] ??
						'from-zinc-900 via-zinc-950 to-zinc-950',
				)}
			>
				<div className="mx-auto grid max-w-5xl items-center gap-10 sm:grid-cols-[1fr_auto]">
					<div>
						{next ? (
							<>
								<p
									className={cn(
										'text-xs font-semibold tracking-[0.25em] uppercase',
										HERO_ACCENT[discipline ?? ''] ?? 'text-zinc-400',
									)}
								>
									{getDisciplineLabel(discipline ?? '')} ·{' '}
									{countdownLabel(new Date(next.scheduledAt))}
								</p>
								<h1 className="mt-3 text-5xl font-bold tracking-tight text-balance sm:text-6xl">
									{next.workout?.title ?? 'Recording'}
								</h1>
								<p className="mt-4 text-lg text-zinc-300">
									{presenter.presentSession(next).longDate} ·{' '}
									{presenter.presentSession(next).timeOfDay}
									{durationMin ? ` · ${durationMin} min` : ''}
								</p>
								{bars.length > 0 ? (
									<div className="mt-6 max-w-md">
										<ShapeBars bars={bars} className="h-8" />
									</div>
								) : null}
								<div className="mt-8 flex flex-wrap items-center gap-3">
									<Link
										to={`/training/sessions/${next.id}`}
										className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
									>
										Open session
										<Icon name="arrow-right" size="sm" />
									</Link>
									<Link
										to="/training/sessions/new"
										className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
									>
										<Icon name="plus" size="sm" />
										Plan another
									</Link>
								</div>
							</>
						) : (
							<>
								<p className="text-xs font-semibold tracking-[0.25em] text-zinc-400 uppercase">
									Recovery
								</p>
								<h1 className="mt-3 text-5xl font-bold tracking-tight sm:text-6xl">
									Rest day
								</h1>
								<p className="mt-4 text-lg text-zinc-300">
									Nothing scheduled in the next 14 days.
								</p>
								<Link
									to="/training/sessions/new"
									className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
								>
									<Icon name="plus" size="sm" />
									Plan a session
								</Link>
							</>
						)}
					</div>

					<TsbGauge tsb={coach.tsb} label={coach.label} />
				</div>

				{arc && data.activePlan ? (
					<div className="mx-auto mt-10 max-w-5xl">
						<Link
							to={`/training/events/${data.activePlan.eventId}`}
							className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur transition hover:bg-white/10"
						>
							<span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
								{arc.phase}
							</span>
							<span className="truncate text-sm font-medium text-white">
								{data.activePlan.eventName}
							</span>
							<span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-white/10 sm:block">
								<span
									className="block h-full rounded-full bg-white/70"
									style={{ width: `${arc.progressPct}%` }}
								/>
							</span>
							<span className="shrink-0 text-xs text-zinc-400 tabular-nums">
								Wk {arc.weekInPlan}/{arc.totalWeeks} · {arc.countdown}
							</span>
						</Link>
					</div>
				) : null}
			</section>

			{/* FILM STRIP — what's after the hero session */}
			{data.upcomingSessions.length > 0 ? (
				<section aria-labelledby="race-strip" className="px-4 py-8">
					<div className="mx-auto max-w-5xl">
						<h2
							id="race-strip"
							className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase"
						>
							Then
						</h2>
						<div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
							{data.upcomingSessions.slice(0, 8).map((s) => {
								const pal = paletteFor(getSessionDiscipline(s))
								const min = sumBlockDurationMin(s.workout?.blocks ?? [])
								const p = presenter.presentSession(s)
								return (
									<Link
										key={s.id}
										to={`/training/sessions/${s.id}`}
										className={cn(
											'w-44 shrink-0 snap-start rounded-xl bg-gradient-to-br p-4 ring-1 transition hover:brightness-95 dark:hover:brightness-110',
											pal.bg,
											pal.ring,
										)}
									>
										<p
											className={cn(
												'text-[10px] font-semibold tracking-wide uppercase',
												pal.ink,
											)}
										>
											{p.shortDate}
										</p>
										<p className="text-foreground mt-1.5 line-clamp-2 text-sm font-semibold">
											{s.workout?.title ?? 'Recording'}
										</p>
										<p className="text-muted-foreground mt-1 text-xs">
											{p.timeOfDay}
											{min ? ` · ${min} min` : ''}
										</p>
									</Link>
								)
							})}
						</div>
					</div>
				</section>
			) : null}

			{/* STAT BAR */}
			<section className="border-border/60 border-t px-4 py-6">
				<dl className="text-muted-foreground mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 text-sm">
					<BarStat
						label="This week"
						value={`${stats.sessions.length} sessions`}
					/>
					<BarStat
						label="Volume"
						value={stats.totalMin > 0 ? `${stats.totalMin} min` : '—'}
					/>
					<BarStat
						label="Adherence"
						value={
							data.weeklyAdherence
								? `${Math.round(data.weeklyAdherence.ratio * 100)}% ${data.weeklyAdherence.band.label.toLowerCase()}`
								: '—'
						}
					/>
					<BarStat
						label="Avg RPE"
						value={stats.avgRpe != null ? String(stats.avgRpe) : '—'}
					/>
					<BarStat
						label="Fit / Fatigue"
						value={
							data.current
								? `${Math.round(data.current.ctl)} / ${Math.round(data.current.atl)}`
								: '—'
						}
					/>
				</dl>
			</section>
		</main>
	)
}

/** Circular TSB gauge, clamped to [-30, +30]; honest "—" during cold-start. */
function TsbGauge({ tsb, label }: { tsb: number | null; label: string }) {
	const R = 64
	const C = 2 * Math.PI * R
	// Three-quarter ring, gap at the bottom.
	const ringFrac = 0.75
	const clamped = tsb != null ? Math.max(-30, Math.min(30, tsb)) : null
	const fillFrac = clamped != null ? ((clamped + 30) / 60) * ringFrac : 0
	const tone =
		tsb == null
			? 'text-zinc-500'
			: tsb >= 5
				? 'text-emerald-400'
				: tsb <= -10
					? 'text-amber-400'
					: 'text-zinc-200'
	return (
		<div className="relative mx-auto size-44 shrink-0">
			<svg viewBox="0 0 160 160" className="size-full -rotate-[225deg]">
				<circle
					cx="80"
					cy="80"
					r={R}
					fill="none"
					stroke="currentColor"
					strokeWidth="10"
					strokeLinecap="round"
					strokeDasharray={`${C * ringFrac} ${C}`}
					className="text-white/10"
				/>
				{fillFrac > 0 ? (
					<circle
						cx="80"
						cy="80"
						r={R}
						fill="none"
						stroke="currentColor"
						strokeWidth="10"
						strokeLinecap="round"
						strokeDasharray={`${C * fillFrac} ${C}`}
						className={tone}
					/>
				) : null}
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<span
					className={cn('text-4xl font-bold tracking-tight tabular-nums', tone)}
				>
					{tsb != null ? signed(tsb) : '—'}
				</span>
				<span className="mt-1 max-w-28 text-center text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
					{label}
				</span>
			</div>
		</div>
	)
}

function BarStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline gap-1.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="text-foreground text-sm font-semibold tabular-nums">
				{value}
			</dd>
		</div>
	)
}
