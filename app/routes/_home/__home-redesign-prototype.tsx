// PROTOTYPE — four radically different full-page redesigns of the home
// dashboard, rendered on the existing `/` route (sub-shape A) and switchable
// via `?variant=live|a|b|c|d` + the floating PrototypeSwitcher (arrow keys
// cycle). `live` shows the current production dashboard for comparison.
//
//   a — Mission control · dark cockpit (neon instruments, mono ledger)
//   b — Poster · brutalist type (giant uppercase headline, thick rules)
//   c — Color wall · saturated planner (full-bleed solid-color day grid)
//   d — Race mode · full-bleed hero (viewport-high hero, giant countdown)
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

export const HOME_VARIANTS = [
	{ key: 'live', name: 'Live · current dashboard' },
	{ key: 'a', name: 'Mission control · dark cockpit' },
	{ key: 'b', name: 'Poster · brutalist type' },
	{ key: 'c', name: 'Color wall · saturated planner' },
	{ key: 'd', name: 'Race mode · full-bleed hero' },
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
			return <VariantMissionControl data={data} />
		case 'b':
			return <VariantBrutalistPoster data={data} />
		case 'c':
			return <VariantColorWall data={data} />
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

const ZONE_COLOR_NEON: Record<TrainingZone, string> = {
	1: 'bg-sky-400',
	2: 'bg-emerald-400',
	3: 'bg-amber-400',
	4: 'bg-orange-500',
	5: 'bg-rose-500',
}

function ShapeBars({
	bars,
	className,
	neon = false,
}: {
	bars: ProfileBar[]
	className?: string
	neon?: boolean
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
						bar.zone == null
							? neon
								? 'bg-zinc-700'
								: 'bg-muted-foreground/30'
							: (neon ? ZONE_COLOR_NEON : ZONE_COLOR)[bar.zone],
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
// Variant A — Mission control · dark cockpit
// Always-dark instrument panel: a row of oversized neon readouts (Form,
// Fit, Fatigue, Adherence), a countdown banner to the next session, and
// the full ledger as a phosphor-green monospace log. NASA-console energy.
// ========================================================================
const A_TONE_NEON: Record<string, string> = {
	fresh: 'text-emerald-400',
	neutral: 'text-zinc-100',
	fatigued: 'text-amber-400',
	under: 'text-amber-400',
	over: 'text-rose-400',
}

function VariantMissionControl({ data }: { data: HomeData }) {
	const user = useOptionalUser()
	const presenter = useSessionPresenter()
	const stats = weekStats(data)
	const coach = coachLine(data)
	const next = data.nextSession
	const arc = data.activePlan
		? planArc(data.activePlan.phases, new Date(data.activePlan.eventDate))
		: null
	const rows = buildLedgerRows(data.ledger)

	return (
		<main className="-mt-16 min-h-screen bg-zinc-950 px-4 pt-24 pb-20 font-mono text-zinc-100 sm:pb-10">
			<div className="mx-auto max-w-6xl">
				<header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 pb-3">
					<h1 className="text-xs tracking-[0.35em] text-zinc-500 uppercase">
						Trainm8 // mission control // {user?.username ?? 'athlete'}
					</h1>
					<span className="text-xs tracking-[0.2em] text-zinc-500 uppercase">
						{presenter.formatDayLabel(new Date())}
					</span>
				</header>

				{/* INSTRUMENT ROW */}
				<div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 lg:grid-cols-4">
					<Readout
						label="Form / TSB"
						value={coach.tsb != null ? signed(coach.tsb) : '--'}
						sub={coach.label}
						tone={A_TONE_NEON[coach.tone ?? 'neutral'] ?? 'text-zinc-100'}
					/>
					<Readout
						label="Fitness / CTL"
						value={data.current ? String(Math.round(data.current.ctl)) : '--'}
						sub="42-day load"
						tone="text-sky-400"
					/>
					<Readout
						label="Fatigue / ATL"
						value={data.current ? String(Math.round(data.current.atl)) : '--'}
						sub="7-day load"
						tone="text-rose-400"
					/>
					<Readout
						label="Adherence / WK"
						value={
							data.weeklyAdherence
								? `${Math.round(data.weeklyAdherence.ratio * 100)}%`
								: '--'
						}
						sub={data.weeklyAdherence?.band.label ?? 'no planned load'}
						tone="text-emerald-400"
					/>
				</div>

				{/* COACH LINE */}
				<p className="mt-3 border-l-2 border-emerald-500/60 pl-3 text-xs leading-relaxed text-zinc-400">
					<span className="text-emerald-400">COACH&gt;</span>{' '}
					{coach.recommendation}
				</p>

				{/* NEXT SESSION BANNER */}
				{next ? (
					<Link
						to={`/training/sessions/${next.id}`}
						className="group mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 transition hover:bg-emerald-500/10"
					>
						<span className="relative flex size-2.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
							<span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
						</span>
						<span className="text-2xl font-bold tracking-tight text-emerald-300 tabular-nums sm:text-3xl">
							T-
							{countdownLabel(new Date(next.scheduledAt))
								.replace(/^In /, '')
								.toUpperCase()}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-base font-bold text-zinc-100 sm:text-lg">
								{(next.workout?.title ?? 'Recording').toUpperCase()}
							</span>
							<span className="block text-xs text-zinc-500">
								{getDisciplineLabel(getSessionDiscipline(next)).toUpperCase()} ·{' '}
								{presenter.presentSession(next).timeOfDay}
								{sumBlockDurationMin(next.workout?.blocks ?? [])
									? ` · ${sumBlockDurationMin(next.workout?.blocks ?? [])} MIN`
									: ''}
							</span>
						</span>
						<span className="hidden w-40 sm:block">
							<ShapeBars
								bars={deriveSessionProfile(next.workout).bars}
								neon
								className="h-6"
							/>
						</span>
						<Icon
							name="arrow-right"
							className="text-emerald-400 transition group-hover:translate-x-1"
						/>
					</Link>
				) : (
					<div className="mt-6 rounded-lg border border-zinc-800 px-4 py-4 text-sm text-zinc-500">
						NO SESSION SCHEDULED — REST PROTOCOL ACTIVE
					</div>
				)}

				{/* PLAN TRACK */}
				{arc && data.activePlan ? (
					<Link
						to={`/training/events/${data.activePlan.eventId}`}
						className="mt-3 flex items-center gap-4 rounded-lg border border-zinc-800 px-4 py-3 text-xs transition hover:bg-zinc-900"
					>
						<span className="tracking-[0.2em] text-zinc-500 uppercase">
							Plan
						</span>
						<span className="truncate font-bold text-zinc-200 uppercase">
							{data.activePlan.eventName}
						</span>
						<span className="hidden h-1 flex-1 overflow-hidden rounded-full bg-zinc-800 sm:block">
							<span
								className="block h-full bg-emerald-400"
								style={{ width: `${arc.progressPct}%` }}
							/>
						</span>
						<span className="shrink-0 text-zinc-500 tabular-nums">
							{arc.phase.toUpperCase()} · WK {arc.weekInPlan}/{arc.totalWeeks} ·{' '}
							{arc.countdown.toUpperCase()}
						</span>
					</Link>
				) : null}

				{/* SESSION LOG */}
				<section aria-labelledby="mc-log" className="mt-8">
					<div className="flex items-baseline justify-between">
						<h2
							id="mc-log"
							className="text-xs tracking-[0.35em] text-zinc-500 uppercase"
						>
							Session log
						</h2>
						<span className="text-xs text-zinc-600">
							WK: {stats.sessions.length} SES / {stats.totalMin} MIN
							{stats.avgRpe != null ? ` / RPE ${stats.avgRpe}` : ''}
						</span>
					</div>
					<div className="mt-2 max-h-[55vh] overflow-auto rounded-lg border border-zinc-800">
						<table className="w-full text-left text-xs">
							<tbody>
								{rows.map((row) => {
									if (row.kind === 'now') {
										return (
											<tr key={row.id} className="bg-emerald-500/10">
												<td colSpan={6} className="px-3 py-1.5">
													<span className="flex items-center gap-3 text-emerald-400">
														<span className="font-bold tracking-[0.3em]">
															▶ NOW
														</span>
														<span className="h-px flex-1 bg-emerald-500/40" />
													</span>
												</td>
											</tr>
										)
									}
									const e = row.entry
									const glyph =
										e.status === 'completed'
											? { ch: '●', cls: 'text-emerald-400' }
											: e.status === 'missed'
												? { ch: '✕', cls: 'text-rose-400' }
												: { ch: '○', cls: 'text-zinc-600' }
									return (
										<tr
											key={row.id}
											className={cn(
												'border-b border-zinc-900 last:border-b-0',
												row.isPast ? 'text-zinc-300' : 'text-zinc-500',
											)}
										>
											<td className={cn('w-8 px-3 py-2', glyph.cls)}>
												{glyph.ch}
											</td>
											<td className="w-24 py-2 pr-3 whitespace-nowrap tabular-nums">
												{presenter.presentSession(row.session).shortDate}
											</td>
											<td className="w-20 py-2 pr-3 text-zinc-500 uppercase">
												{getDisciplineLabel(e.discipline)}
											</td>
											<td className="min-w-0 py-2 pr-3">
												<Link
													to={`/training/sessions/${row.id}`}
													className="block max-w-64 truncate font-bold hover:text-emerald-300 hover:underline"
												>
													{(
														e.title ??
														`${getDisciplineLabel(e.discipline)} recording`
													).toUpperCase()}
												</Link>
											</td>
											<td className="hidden w-32 py-2 pr-3 sm:table-cell">
												<ShapeBars bars={row.bars} neon className="h-4" />
											</td>
											<td className="w-32 py-2 pr-3 text-right whitespace-nowrap tabular-nums">
												{e.durationMin != null ? `${e.durationMin}m` : '--'}
												{e.load != null ? ` ${Math.round(e.load)}tss` : ''}
												{e.rpe != null ? ` r${e.rpe}` : ''}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				</section>

				<footer className="mt-6 flex items-center justify-between text-xs text-zinc-600">
					<span>SYS OK · {greetingFor(new Date()).toUpperCase()}</span>
					<Link
						to="/training/sessions/new"
						className="rounded border border-emerald-500/40 px-3 py-1.5 font-bold tracking-[0.2em] text-emerald-400 uppercase transition hover:bg-emerald-500/10"
					>
						+ Schedule session
					</Link>
				</footer>
			</div>
		</main>
	)
}

function Readout({
	label,
	value,
	sub,
	tone,
}: {
	label: string
	value: string
	sub: string
	tone: string
}) {
	return (
		<div className="bg-zinc-950 p-4">
			<p className="text-[10px] tracking-[0.25em] text-zinc-500 uppercase">
				{label}
			</p>
			<p
				className={cn(
					'mt-1 text-5xl font-bold tracking-tight tabular-nums',
					tone,
				)}
			>
				{value}
			</p>
			<p className="mt-1 truncate text-[10px] tracking-[0.15em] text-zinc-600 uppercase">
				{sub}
			</p>
		</div>
	)
}

// ========================================================================
// Variant B — Poster · brutalist type
// A training plan as a punk gig poster: giant condensed uppercase
// headline, 4px rules, marquee strip, agenda rows with enormous date
// numerals, today inverted black-on-white. Zero cards, zero shadows.
// ========================================================================
function VariantBrutalistPoster({ data }: { data: HomeData }) {
	const presenter = useSessionPresenter()
	const coach = coachLine(data)
	const stats = weekStats(data)
	const next = data.nextSession
	const arc = data.activePlan
		? planArc(data.activePlan.phases, new Date(data.activePlan.eventDate))
		: null
	const todayKey = isoDayKey(new Date())

	const days = buildWeekDays(new Date())
	const byDay = new Map<string, UpcomingSession[]>()
	for (const s of allUpcoming(data)) {
		const k = isoDayKey(new Date(s.scheduledAt))
		byDay.set(k, [...(byDay.get(k) ?? []), s])
	}

	const marquee = Array.from({ length: 10 })
		.map(
			() =>
				`${coach.label} ${coach.tsb != null ? signed(coach.tsb) : ''} · ${stats.sessions.length} SESSIONS THIS WEEK · ${stats.totalMin} MIN PLANNED`,
		)
		.join(' · ')

	return (
		<main className="text-foreground min-h-screen px-4 py-8">
			<div className="border-foreground mx-auto max-w-4xl border-4">
				{/* MASTHEAD */}
				<header className="border-foreground flex items-stretch justify-between border-b-4">
					<p className="px-4 py-3 text-xs font-black tracking-[0.3em] uppercase">
						Trainm8 — Issue {new Date().getDate()}
					</p>
					<p className="border-foreground border-l-4 px-4 py-3 text-xs font-black tracking-[0.3em] uppercase">
						{presenter.formatDayLabel(new Date())}
					</p>
				</header>

				{/* HEADLINE */}
				<section className="border-foreground border-b-4 px-4 py-8 sm:px-8">
					<p className="text-xs font-black tracking-[0.35em] uppercase">
						{next
							? `Next up · ${countdownLabel(new Date(next.scheduledAt))}`
							: 'Nothing scheduled'}
					</p>
					{next ? (
						<Link to={`/training/sessions/${next.id}`} className="group block">
							<h1 className="mt-3 text-6xl leading-[0.9] font-black tracking-tighter uppercase group-hover:underline sm:text-8xl">
								{next.workout?.title ?? 'Recording'}
							</h1>
							<p className="mt-4 text-xl font-bold uppercase">
								{getDisciplineLabel(getSessionDiscipline(next))} ·{' '}
								{presenter.presentSession(next).timeOfDay}
								{sumBlockDurationMin(next.workout?.blocks ?? [])
									? ` · ${sumBlockDurationMin(next.workout?.blocks ?? [])} min`
									: ''}
							</p>
						</Link>
					) : (
						<h1 className="mt-3 text-6xl leading-[0.9] font-black tracking-tighter uppercase sm:text-8xl">
							Rest day
						</h1>
					)}
				</section>

				{/* MARQUEE */}
				<div
					className="bg-foreground text-background overflow-hidden border-b-4 py-2 whitespace-nowrap"
					aria-hidden
				>
					<p className="inline-block text-sm font-black tracking-[0.2em] uppercase">
						{marquee}
					</p>
				</div>

				{/* BIG NUMBERS */}
				<section className="border-foreground divide-foreground grid grid-cols-2 divide-x-4 border-b-4 sm:grid-cols-4">
					<PosterStat
						value={coach.tsb != null ? signed(coach.tsb) : '—'}
						label={`Form · ${coach.label}`}
					/>
					<PosterStat
						value={String(stats.sessions.length)}
						label="Sessions this wk"
					/>
					<PosterStat
						value={stats.totalMin > 0 ? String(stats.totalMin) : '—'}
						label="Min planned"
					/>
					<PosterStat
						value={
							data.weeklyAdherence
								? `${Math.round(data.weeklyAdherence.ratio * 100)}%`
								: '—'
						}
						label="Plan adherence"
					/>
				</section>

				{/* AGENDA */}
				<section aria-labelledby="poster-agenda">
					<h2 id="poster-agenda" className="sr-only">
						The week ahead
					</h2>
					<ol>
						{days.map((d) => {
							const k = isoDayKey(d)
							const items = byDay.get(k) ?? []
							const isToday = k === todayKey
							return (
								<li
									key={k}
									className={cn(
										'border-foreground grid grid-cols-[6rem_1fr] items-stretch border-b-4 last:border-b-0 sm:grid-cols-[9rem_1fr]',
										isToday && 'bg-foreground text-background',
									)}
								>
									<div className="border-foreground flex flex-col justify-center border-r-4 px-4 py-4">
										<span className="text-4xl leading-none font-black tabular-nums sm:text-6xl">
											{String(d.getDate()).padStart(2, '0')}
										</span>
										<span className="mt-1 text-xs font-black tracking-[0.25em] uppercase">
											{isToday
												? 'Today'
												: new Intl.DateTimeFormat('en-US', {
														weekday: 'short',
													}).format(d)}
										</span>
									</div>
									<div className="flex flex-col justify-center gap-3 px-4 py-4">
										{items.length === 0 ? (
											<p className="text-lg font-black tracking-widest uppercase opacity-30">
												Rest
											</p>
										) : (
											items.map((s) => (
												<Link
													key={s.id}
													to={`/training/sessions/${s.id}`}
													className="group block"
												>
													<p className="text-xl leading-tight font-black uppercase group-hover:underline sm:text-2xl">
														{s.workout?.title ?? 'Recording'}
													</p>
													<p className="mt-0.5 text-xs font-bold tracking-[0.2em] uppercase opacity-60">
														{getDisciplineLabel(getSessionDiscipline(s))} ·{' '}
														{presenter.presentSession(s).timeOfDay}
														{sumBlockDurationMin(s.workout?.blocks ?? [])
															? ` · ${sumBlockDurationMin(s.workout?.blocks ?? [])} min`
															: ''}
													</p>
												</Link>
											))
										)}
									</div>
								</li>
							)
						})}
					</ol>
				</section>

				{/* PLAN FOOTER */}
				<footer className="border-foreground flex flex-wrap items-center justify-between gap-3 border-t-4 px-4 py-4">
					{arc && data.activePlan ? (
						<Link
							to={`/training/events/${data.activePlan.eventId}`}
							className="text-xs font-black tracking-[0.25em] uppercase hover:underline"
						>
							→ {data.activePlan.eventName} · {arc.phase} · wk {arc.weekInPlan}/
							{arc.totalWeeks} · {arc.countdown}
						</Link>
					) : (
						<Link
							to="/training/plan/new"
							className="text-xs font-black tracking-[0.25em] uppercase hover:underline"
						>
							→ No plan. Generate one.
						</Link>
					)}
					<Link
						to="/training/sessions/new"
						className="bg-foreground text-background px-4 py-2 text-xs font-black tracking-[0.25em] uppercase transition hover:opacity-80"
					>
						+ New session
					</Link>
				</footer>
			</div>

			{/* QUOTES */}
			{data.recentLogs.length > 0 ? (
				<div className="mx-auto mt-8 max-w-4xl">
					{data.recentLogs.slice(0, 1).map((log) => (
						<blockquote key={log.id} className="text-center">
							<p className="text-2xl font-black tracking-tight uppercase sm:text-3xl">
								“{log.content}”
							</p>
							<footer className="mt-2 text-xs font-bold tracking-[0.3em] uppercase opacity-60">
								— {log.session.workout?.title ?? 'Recording'}
								{log.rpe != null ? ` · RPE ${log.rpe}` : ''}
							</footer>
						</blockquote>
					))}
				</div>
			) : null}
		</main>
	)
}

function PosterStat({ value, label }: { value: string; label: string }) {
	return (
		<div className="px-4 py-5">
			<p className="text-5xl leading-none font-black tracking-tighter tabular-nums sm:text-6xl">
				{value}
			</p>
			<p className="mt-2 text-[10px] font-black tracking-[0.25em] uppercase opacity-60">
				{label}
			</p>
		</div>
	)
}

// ========================================================================
// Variant C — Color wall · saturated planner
// The 14-day horizon as a full-bleed wall of solid discipline colour:
// loud blocks, giant date numerals, white type on saturated paint. Empty
// days are quiet voids. The past compresses into a coloured tape strip.
// ========================================================================
const SOLID: Record<string, { block: string; ink: string; soft: string }> = {
	run: { block: 'bg-orange-500', ink: 'text-orange-50', soft: 'bg-orange-500' },
	bike: { block: 'bg-sky-500', ink: 'text-sky-50', soft: 'bg-sky-500' },
	swim: { block: 'bg-cyan-500', ink: 'text-cyan-50', soft: 'bg-cyan-500' },
	strength: {
		block: 'bg-violet-600',
		ink: 'text-violet-50',
		soft: 'bg-violet-600',
	},
}

function solidFor(discipline: string | null | undefined) {
	return (
		SOLID[discipline ?? ''] ?? {
			block: 'bg-zinc-600',
			ink: 'text-zinc-50',
			soft: 'bg-zinc-600',
		}
	)
}

function VariantColorWall({ data }: { data: HomeData }) {
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

	const pastRows = buildLedgerRows(data.ledger)
		.filter((r): r is SessionRow => r.kind === 'session' && r.isPast)
		.slice(-21)

	return (
		<main className="min-h-screen pb-10">
			<header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-6 pb-4 sm:px-6">
				<h1 className="text-foreground text-4xl font-black tracking-tighter uppercase sm:text-5xl">
					14 days
				</h1>
				<div className="flex items-center gap-4">
					<span className="text-muted-foreground text-sm font-bold uppercase">
						Form{' '}
						<span className="text-foreground text-2xl font-black tabular-nums">
							{coach.tsb != null ? signed(coach.tsb) : '—'}
						</span>{' '}
						{coach.tsb != null ? coach.label : ''}
					</span>
					<Link
						to="/training/sessions/new"
						className="bg-foreground text-background px-4 py-2 text-sm font-black tracking-wide uppercase transition hover:opacity-80"
					>
						+ Plan
					</Link>
				</div>
			</header>

			{/* THE WALL — full-bleed */}
			<div className="border-foreground/10 border-y">
				{weeks.map((week, wi) => (
					<div
						key={wi}
						className={cn(
							'grid grid-cols-2 sm:grid-cols-7',
							wi > 0 && 'border-foreground/10 border-t',
						)}
					>
						{week.map((d) => {
							const k = isoDayKey(d)
							const items = byDay.get(k) ?? []
							const isToday = k === todayKey
							const first = items[0]
							const solid = first ? solidFor(getSessionDiscipline(first)) : null
							return (
								<div
									key={k}
									className={cn(
										'border-foreground/10 relative flex min-h-44 flex-col border-r last:border-r-0',
										first ? solid!.block : 'bg-muted/30',
										isToday && 'ring-foreground z-10 ring-4 ring-inset',
									)}
								>
									<div
										className={cn(
											'flex items-start justify-between p-3',
											first ? solid!.ink : 'text-muted-foreground/50',
										)}
									>
										<span className="text-[10px] font-black tracking-[0.25em] uppercase">
											{isToday
												? 'Today'
												: new Intl.DateTimeFormat('en-US', {
														weekday: 'short',
													}).format(d)}
										</span>
										<span className="text-4xl leading-none font-black tabular-nums opacity-90">
											{String(d.getDate()).padStart(2, '0')}
										</span>
									</div>
									{first ? (
										<Link
											to={`/training/sessions/${first.id}`}
											className={cn(
												'group flex flex-1 flex-col justify-end p-3 pt-0',
												solid!.ink,
											)}
										>
											<ShapeBars
												bars={deriveSessionProfile(first.workout).bars}
												className="mb-2 h-4 opacity-80 brightness-200"
											/>
											<p className="text-lg leading-tight font-black uppercase group-hover:underline">
												{first.workout?.title ?? 'Recording'}
											</p>
											<p className="mt-1 text-xs font-bold opacity-80">
												{presenter.presentSession(first).timeOfDay}
												{sumBlockDurationMin(first.workout?.blocks ?? [])
													? ` · ${sumBlockDurationMin(first.workout?.blocks ?? [])}′`
													: ''}
												{items.length > 1 ? ` · +${items.length - 1} more` : ''}
											</p>
										</Link>
									) : (
										<p className="text-muted-foreground/40 flex flex-1 items-end p-3 text-xs font-bold tracking-[0.3em] uppercase">
											{isToday ? 'Rest' : ''}
										</p>
									)}
								</div>
							)
						})}
					</div>
				))}
			</div>

			{/* PAST TAPE */}
			{pastRows.length > 0 ? (
				<section aria-labelledby="wall-tape" className="px-4 pt-8 sm:px-6">
					<div className="flex items-baseline justify-between">
						<h2
							id="wall-tape"
							className="text-foreground text-sm font-black tracking-[0.25em] uppercase"
						>
							The tape · last {pastRows.length}
						</h2>
						<span className="text-muted-foreground text-xs font-bold uppercase">
							■ done&ensp;✕ missed
						</span>
					</div>
					<div className="mt-3 flex flex-wrap gap-1.5">
						{pastRows.map((row) => {
							const e = row.entry
							const solid = solidFor(e.discipline)
							return (
								<Link
									key={row.id}
									to={`/training/sessions/${row.id}`}
									title={`${e.title ?? 'Recording'} — ${presenter.presentSession(row.session).shortDate}`}
									className={cn(
										'flex size-12 items-center justify-center text-lg font-black transition hover:scale-110',
										e.status === 'missed'
											? 'bg-muted text-destructive'
											: cn(solid.block, solid.ink),
									)}
								>
									{e.status === 'missed' ? '✕' : (e.rpe ?? '■')}
								</Link>
							)
						})}
					</div>
					<p className="text-muted-foreground mt-2 text-xs font-bold uppercase">
						Number = RPE
					</p>
				</section>
			) : null}
		</main>
	)
}

// ========================================================================
// Variant D — Race mode · full-bleed hero
// One thing, the whole viewport: the next session as a stadium-screen
// takeover. Giant countdown digits, glowing discipline backdrop, TSB
// gauge. The rest of the horizon is a film strip you scroll past below.
// ========================================================================
const HERO_GLOW: Record<string, string> = {
	run: 'bg-orange-500/30',
	bike: 'bg-sky-500/30',
	swim: 'bg-cyan-500/30',
	strength: 'bg-violet-500/30',
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
	const countdown = next
		? countdownLabel(new Date(next.scheduledAt)).replace(/^In /, '')
		: null

	return (
		<main className="-mt-16 min-h-screen bg-zinc-950 pb-20 text-white sm:pb-0">
			{/* HERO — full viewport */}
			<section className="relative flex min-h-screen flex-col justify-center overflow-hidden px-4 py-24">
				<div
					aria-hidden
					className={cn(
						'absolute -top-40 left-1/2 size-[60rem] -translate-x-1/2 rounded-full blur-3xl',
						HERO_GLOW[discipline ?? ''] ?? 'bg-zinc-700/30',
					)}
				/>
				<div className="relative mx-auto w-full max-w-6xl">
					{next ? (
						<>
							<div className="flex flex-wrap items-end justify-between gap-8">
								<div className="min-w-0">
									<p
										className={cn(
											'text-sm font-black tracking-[0.4em] uppercase',
											HERO_ACCENT[discipline ?? ''] ?? 'text-zinc-400',
										)}
									>
										{getDisciplineLabel(discipline ?? '')} ·{' '}
										{presenter.presentSession(next).longDate}
									</p>
									<h1 className="mt-4 text-6xl leading-[0.9] font-black tracking-tighter text-balance uppercase sm:text-8xl lg:text-9xl">
										{next.workout?.title ?? 'Recording'}
									</h1>
								</div>
								<TsbGauge tsb={coach.tsb} label={coach.label} />
							</div>

							<div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-4">
								<div>
									<p className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
										Starts in
									</p>
									<p className="text-7xl leading-none font-black tracking-tighter tabular-nums sm:text-8xl">
										{countdown?.toUpperCase()}
									</p>
								</div>
								<div className="hidden h-16 w-px bg-white/15 sm:block" />
								<div>
									<p className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
										At
									</p>
									<p className="text-4xl font-black tabular-nums sm:text-5xl">
										{presenter.presentSession(next).timeOfDay}
									</p>
								</div>
								{durationMin ? (
									<>
										<div className="hidden h-16 w-px bg-white/15 sm:block" />
										<div>
											<p className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
												For
											</p>
											<p className="text-4xl font-black tabular-nums sm:text-5xl">
												{durationMin}
												<span className="text-xl text-zinc-400"> min</span>
											</p>
										</div>
									</>
								) : null}
							</div>

							{bars.length > 0 ? (
								<div className="mt-10 max-w-xl">
									<ShapeBars bars={bars} neon className="h-10" />
								</div>
							) : null}

							<div className="mt-10 flex flex-wrap items-center gap-3">
								<Link
									to={`/training/sessions/${next.id}`}
									className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-black tracking-wide text-zinc-950 uppercase transition hover:scale-105 hover:bg-zinc-200"
								>
									Open session
									<Icon name="arrow-right" size="sm" />
								</Link>
								<Link
									to="/training/sessions/new"
									className="inline-flex items-center gap-2 rounded-full border-2 border-white/25 px-7 py-3.5 text-base font-black tracking-wide uppercase transition hover:bg-white/10"
								>
									<Icon name="plus" size="sm" />
									Plan
								</Link>
								<p className="ml-2 max-w-xs text-sm text-zinc-400">
									{coach.recommendation}
								</p>
							</div>
						</>
					) : (
						<div className="text-center">
							<p className="text-sm font-black tracking-[0.4em] text-zinc-500 uppercase">
								Recovery
							</p>
							<h1 className="mt-4 text-7xl font-black tracking-tighter uppercase sm:text-9xl">
								Rest day
							</h1>
							<p className="mt-6 text-lg text-zinc-400">
								Nothing scheduled in the next 14 days.
							</p>
							<Link
								to="/training/sessions/new"
								className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-black tracking-wide text-zinc-950 uppercase transition hover:scale-105 hover:bg-zinc-200"
							>
								<Icon name="plus" size="sm" />
								Plan a session
							</Link>
						</div>
					)}
				</div>

				{/* scroll cue */}
				<div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-zinc-500">
					<Icon name="chevron-down" size="lg" />
				</div>
			</section>

			{/* FILM STRIP */}
			{data.upcomingSessions.length > 0 ? (
				<section
					aria-labelledby="race-strip"
					className="border-t border-white/10 px-4 py-10"
				>
					<div className="mx-auto max-w-6xl">
						<h2
							id="race-strip"
							className="mb-4 text-xs font-black tracking-[0.4em] text-zinc-500 uppercase"
						>
							Then
						</h2>
						<div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
							{data.upcomingSessions.slice(0, 10).map((s) => {
								const d = getSessionDiscipline(s)
								const solid = solidFor(d)
								const min = sumBlockDurationMin(s.workout?.blocks ?? [])
								const p = presenter.presentSession(s)
								return (
									<Link
										key={s.id}
										to={`/training/sessions/${s.id}`}
										className={cn(
											'w-52 shrink-0 snap-start p-5 transition hover:-translate-y-1',
											solid.block,
											solid.ink,
										)}
									>
										<p className="text-[10px] font-black tracking-[0.25em] uppercase opacity-80">
											{p.shortDate}
										</p>
										<p className="mt-2 line-clamp-2 text-lg leading-tight font-black uppercase">
											{s.workout?.title ?? 'Recording'}
										</p>
										<p className="mt-2 text-xs font-bold opacity-80">
											{p.timeOfDay}
											{min ? ` · ${min}′` : ''}
										</p>
									</Link>
								)
							})}
						</div>
					</div>
				</section>
			) : null}

			{/* STAT BAR */}
			<section className="border-t border-white/10 px-4 py-8">
				<dl className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-12 gap-y-4">
					<RaceStat
						label="This week"
						value={`${stats.sessions.length}`}
						unit="sessions"
					/>
					<RaceStat
						label="Volume"
						value={stats.totalMin > 0 ? String(stats.totalMin) : '—'}
						unit="min"
					/>
					<RaceStat
						label="Adherence"
						value={
							data.weeklyAdherence
								? `${Math.round(data.weeklyAdherence.ratio * 100)}%`
								: '—'
						}
						unit={data.weeklyAdherence?.band.label ?? ''}
					/>
					<RaceStat
						label="Avg RPE"
						value={stats.avgRpe != null ? String(stats.avgRpe) : '—'}
						unit=""
					/>
					{arc && data.activePlan ? (
						<Link
							to={`/training/events/${data.activePlan.eventId}`}
							className="group ml-auto text-right"
						>
							<p className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
								{arc.phase} · wk {arc.weekInPlan}/{arc.totalWeeks}
							</p>
							<p className="text-lg font-black uppercase group-hover:underline">
								{data.activePlan.eventName} · {arc.countdown}
							</p>
						</Link>
					) : null}
				</dl>
			</section>
		</main>
	)
}

function RaceStat({
	label,
	value,
	unit,
}: {
	label: string
	value: string
	unit: string
}) {
	return (
		<div>
			<dt className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
				{label}
			</dt>
			<dd className="mt-1 text-3xl font-black tabular-nums">
				{value}
				{unit ? (
					<span className="ml-1.5 text-sm font-bold text-zinc-400 uppercase">
						{unit}
					</span>
				) : null}
			</dd>
		</div>
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
		<div className="relative size-48 shrink-0">
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
					className={cn(
						'text-5xl font-black tracking-tight tabular-nums',
						tone,
					)}
				>
					{tsb != null ? signed(tsb) : '—'}
				</span>
				<span className="mt-1 max-w-28 text-center text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase">
					{label}
				</span>
			</div>
		</div>
	)
}
