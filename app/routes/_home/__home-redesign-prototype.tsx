// PROTOTYPE — three radically different Home (Dashboard) redesigns, switchable
// via `?variant=cockpit|briefing|tape` on `/` plus the floating
// PrototypeSwitcher (arrow keys cycle). All three consume the same loader data
// as the live `Dashboard`; only the layout, hierarchy, and diagrams differ.
//
//   cockpit  — data-dense bento grid, desktop-first command center
//   briefing — calm single-column editorial brief
//   tape     — horizontal scrubbable timeline ("The Tape") with a load backdrop
//
// Filename starts with `__` so react-router-auto-routes ignores it. When a
// direction wins, fold it into `_home/index.tsx` and delete this file +
// the variant wiring. See NOTES at the bottom for the open question.

import { type ReactNode, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import {
	type LoadSnapshot,
	type LoadTriad,
} from '#app/components/form-load-card.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	countdownLabel,
	greetingFor,
	isoDayKey,
	planArc,
	sumBlockDurationMin,
} from '#app/utils/dashboard.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import {
	type CoachRecommendation,
	type CoachTone,
	reconcileCoach,
	type SustainedDeviation,
} from '#app/utils/load/coach.ts'
import { readinessFromTsb } from '#app/utils/load/readiness.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { cn } from '#app/utils/misc.tsx'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import {
	type ActivePlan,
	type LedgerSession,
	type UpcomingSession,
} from '#app/utils/training.server.ts'
import {
	deriveLedgerStatus,
	getDisciplineLabel,
	getSessionDiscipline,
	getStatusLabel,
	getStatusVariant,
	type LedgerStatus,
} from '#app/utils/training.ts'
import { useOptionalUser } from '#app/utils/user.ts'

// ============================================================
// Variant registry
// ============================================================
export const HOME_VARIANTS = [
	{ key: 'cockpit', name: 'Cockpit · bento command center' },
	{ key: 'briefing', name: 'Briefing · editorial single column' },
	{ key: 'tape', name: 'Tape · horizontal timeline' },
] as const

export type HomeVariantKey = (typeof HOME_VARIANTS)[number]['key']

export function isHomeVariant(
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

// ============================================================
// Shared tone vocabulary for diagrams. Mirrors the Coach-card tones but exposes
// the raw text/stroke/bg classes the charts and gauges need.
// ============================================================
const TONE: Record<
	CoachTone,
	{ ink: string; soft: string; dot: string; grad: [string, string] }
> = {
	fresh: {
		ink: 'text-emerald-600 dark:text-emerald-400',
		soft: 'bg-emerald-500/10',
		dot: 'bg-emerald-500',
		grad: ['#10b981', '#10b981'],
	},
	neutral: {
		ink: 'text-foreground',
		soft: 'bg-muted/50',
		dot: 'bg-muted-foreground/50',
		grad: ['#71717a', '#71717a'],
	},
	fatigued: {
		ink: 'text-amber-600 dark:text-amber-400',
		soft: 'bg-amber-500/10',
		dot: 'bg-amber-500',
		grad: ['#f59e0b', '#f59e0b'],
	},
	under: {
		ink: 'text-amber-600 dark:text-amber-400',
		soft: 'bg-amber-500/10',
		dot: 'bg-amber-500',
		grad: ['#f59e0b', '#f59e0b'],
	},
	over: {
		ink: 'text-rose-600 dark:text-rose-400',
		soft: 'bg-rose-500/10',
		dot: 'bg-rose-500',
		grad: ['#f43f5e', '#f43f5e'],
	},
}

// ============================================================
// Derived model — every variant reads from this, none of them shares layout.
// ============================================================
type DisciplineSlice = { discipline: string; count: number; pct: number }
type WeekBar = {
	weekStart: Date
	label: string
	actual: number
	planned: number
	isPast: boolean
}

function startOfWeek(d: Date): Date {
	const out = new Date(d)
	out.setHours(0, 0, 0, 0)
	const day = (out.getDay() + 6) % 7 // Monday = 0
	out.setDate(out.getDate() - day)
	return out
}

function useDerived(data: HomeData) {
	const {
		current,
		tsbTrust,
		sustained,
		nextSession,
		upcomingSessions,
		ledger,
	} = data

	const tsb = current?.tsb ?? null
	const coldStart = !tsbTrust.trustworthy || tsb == null
	const readiness = !coldStart ? readinessFromTsb(tsb) : null
	const coach: CoachRecommendation | null = reconcileCoach(readiness, sustained)
	const tone = coach?.tone ?? 'neutral'

	const allSessions = [nextSession, ...upcomingSessions].filter(
		(s): s is UpcomingSession => s != null,
	)

	// Discipline allocation across upcoming sessions.
	const counts = new Map<string, number>()
	for (const s of allSessions) {
		const k = getSessionDiscipline(s)
		counts.set(k, (counts.get(k) ?? 0) + 1)
	}
	const total = allSessions.length || 1
	const allocation: DisciplineSlice[] = [...counts.entries()]
		.map(([discipline, count]) => ({
			discipline,
			count,
			pct: count / total,
		}))
		.sort((a, b) => b.count - a.count)

	// Weekly training load (actual TSS for past, planned TSS for future) from the
	// ledger window. A truthful diagram: each side uses the number it has.
	const weekMap = new Map<string, WeekBar>()
	for (const s of ledger) {
		const ws = startOfWeek(new Date(s.scheduledAt))
		const key = isoDayKey(ws)
		const isPast = deriveLedgerStatus(s) !== 'planned'
		const existing =
			weekMap.get(key) ??
			({
				weekStart: ws,
				label: '',
				actual: 0,
				planned: 0,
				isPast: true,
			} as WeekBar)
		existing.actual += s.tssValue ?? 0
		existing.planned += s.plannedTssValue ?? 0
		// A week is "past" only if all its sessions are past; once any planned
		// session lands it reads as upcoming.
		existing.isPast = existing.isPast && isPast
		weekMap.set(key, existing)
	}
	const weeklyBars: WeekBar[] = [...weekMap.values()]
		.sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
		.map((w) => ({
			...w,
			label: new Intl.DateTimeFormat('en-US', {
				month: 'short',
				day: 'numeric',
			}).format(w.weekStart),
		}))

	const nextCountdown = nextSession
		? countdownLabel(new Date(nextSession.scheduledAt))
		: null

	return {
		tsb,
		coldStart,
		coach,
		tone,
		allSessions,
		allocation,
		weeklyBars,
		nextCountdown,
	}
}

// ============================================================
// Diagrams
// ============================================================

// Fitness / Fatigue / Form area chart. CTL filled area (fitness), ATL line
// (fatigue), TSB as a zero-baseline band (form). Labels live in HTML so the SVG
// can stretch full-width with non-scaling strokes.
function LoadTrendChart({
	snapshots,
	current,
	height = 180,
}: {
	snapshots: LoadSnapshot[]
	current: LoadTriad | null
	height?: number
}) {
	if (snapshots.length < 2) {
		return (
			<div className="text-muted-foreground grid h-44 place-items-center rounded-lg border border-dashed text-sm">
				Building baseline — your load trend appears as history accrues.
			</div>
		)
	}
	const W = 600
	const H = 200
	const pad = 6
	const maxFit = Math.max(...snapshots.map((s) => Math.max(s.ctl, s.atl)), 1)
	const x = (i: number) => pad + (i / (snapshots.length - 1)) * (W - pad * 2)
	const y = (v: number) => H - pad - (v / maxFit) * (H - pad * 2)
	const ctlPts = snapshots.map((s, i) => `${x(i)},${y(s.ctl)}`).join(' ')
	const atlPts = snapshots.map((s, i) => `${x(i)},${y(s.atl)}`).join(' ')
	const area = `${pad},${H - pad} ${ctlPts} ${x(snapshots.length - 1)},${H - pad}`

	const firstDate = new Date(snapshots[0]!.date)
	const lastDate = new Date(snapshots[snapshots.length - 1]!.date)
	const fmt = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
	})

	return (
		<div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="none"
				className="w-full"
				style={{ height }}
				role="img"
				aria-label="Training load trend: fitness, fatigue and form"
			>
				<defs>
					<linearGradient id="fitFill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
						<stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
					</linearGradient>
				</defs>
				{[0.25, 0.5, 0.75].map((g) => (
					<line
						key={g}
						x1={pad}
						x2={W - pad}
						y1={H * g}
						y2={H * g}
						stroke="currentColor"
						className="text-border"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				))}
				<polygon points={area} fill="url(#fitFill)" />
				<polyline
					points={ctlPts}
					fill="none"
					stroke="#0ea5e9"
					strokeWidth={2}
					vectorEffect="non-scaling-stroke"
				/>
				<polyline
					points={atlPts}
					fill="none"
					stroke="#f43f5e"
					strokeWidth={2}
					strokeDasharray="4 3"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
				<span>{fmt.format(firstDate)}</span>
				<div className="flex items-center gap-4">
					<LegendDot color="bg-sky-500" label="Fitness (CTL)" />
					<LegendDot color="bg-rose-500" label="Fatigue (ATL)" />
				</div>
				<span>{fmt.format(lastDate)}</span>
			</div>
			{current ? (
				<div className="mt-3 grid grid-cols-3 gap-2 text-center">
					<TriadStat
						label="Fitness"
						value={current.ctl}
						ink="text-sky-600 dark:text-sky-400"
					/>
					<TriadStat
						label="Fatigue"
						value={current.atl}
						ink="text-rose-600 dark:text-rose-400"
					/>
					<TriadStat
						label="Form"
						value={current.tsb}
						ink="text-foreground"
						signed
					/>
				</div>
			) : null}
		</div>
	)
}

function TriadStat({
	label,
	value,
	ink,
	signed = false,
}: {
	label: string
	value: number
	ink: string
	signed?: boolean
}) {
	const r = Math.round(value)
	const display = signed && r > 0 ? `+${r}` : String(r)
	return (
		<div className="bg-muted/30 rounded-lg py-2">
			<div className={cn('text-xl font-semibold tabular-nums', ink)}>
				{display}
			</div>
			<div className="text-muted-foreground text-[11px] tracking-wide uppercase">
				{label}
			</div>
		</div>
	)
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className={cn('size-2 rounded-full', color)} />
			{label}
		</span>
	)
}

// Radial readiness gauge — maps TSB onto a 270° arc, fresh→neutral→fatigued.
function ReadinessGauge({
	tsb,
	tone,
	coldStart,
	size = 168,
}: {
	tsb: number | null
	tone: CoachTone
	coldStart: boolean
	size?: number
}) {
	const r = 58
	const c = 64
	const circ = 2 * Math.PI * r
	const arc = 0.75 // 270° sweep
	const dash = circ * arc
	// Map TSB [-30, +30] → [0, 1].
	const norm = tsb == null ? 0.5 : Math.min(1, Math.max(0, (tsb + 30) / 60))
	const stroke = TONE[tone].grad[0]
	const r3 = tsb == null ? null : Math.round(tsb)
	return (
		<div
			className="relative grid place-items-center"
			style={{ width: size, height: size }}
		>
			<svg viewBox="0 0 128 128" className="size-full -rotate-[135deg]">
				<circle
					cx={c}
					cy={c}
					r={r}
					fill="none"
					stroke="currentColor"
					className="text-muted/40"
					strokeWidth={10}
					strokeLinecap="round"
					strokeDasharray={`${dash} ${circ}`}
				/>
				{!coldStart ? (
					<circle
						cx={c}
						cy={c}
						r={r}
						fill="none"
						stroke={stroke}
						strokeWidth={10}
						strokeLinecap="round"
						strokeDasharray={`${dash * norm} ${circ}`}
					/>
				) : null}
			</svg>
			<div className="absolute inset-0 grid place-content-center text-center">
				{coldStart ? (
					<span className="text-muted-foreground text-xs">
						Building
						<br />
						baseline
					</span>
				) : (
					<>
						<span
							className={cn(
								'text-4xl font-semibold tabular-nums',
								TONE[tone].ink,
							)}
						>
							{r3! > 0 ? `+${r3}` : r3}
						</span>
						<span className="text-muted-foreground text-[11px] tracking-wide uppercase">
							Form
						</span>
					</>
				)}
			</div>
		</div>
	)
}

const DONUT_COLORS: Record<string, string> = {
	run: '#f97316',
	bike: '#0ea5e9',
	swim: '#06b6d4',
	strength: '#8b5cf6',
}
function donutColor(d: string) {
	return DONUT_COLORS[d] ?? '#71717a'
}

function DisciplineDonut({ allocation }: { allocation: DisciplineSlice[] }) {
	if (allocation.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No upcoming sessions yet.</p>
		)
	}
	const r = 52
	const c = 64
	const circ = 2 * Math.PI * r
	let offset = 0
	return (
		<div className="flex items-center gap-5">
			<svg viewBox="0 0 128 128" className="size-28 shrink-0 -rotate-90">
				{allocation.map((s) => {
					const len = s.pct * circ
					const seg = (
						<circle
							key={s.discipline}
							cx={c}
							cy={c}
							r={r}
							fill="none"
							stroke={donutColor(s.discipline)}
							strokeWidth={16}
							strokeDasharray={`${len} ${circ - len}`}
							strokeDashoffset={-offset}
						/>
					)
					offset += len
					return seg
				})}
			</svg>
			<ul className="space-y-1.5 text-sm">
				{allocation.map((s) => (
					<li key={s.discipline} className="flex items-center gap-2">
						<span
							className="size-2.5 rounded-full"
							style={{ background: donutColor(s.discipline) }}
						/>
						<span className="text-foreground font-medium">
							{getDisciplineLabel(s.discipline)}
						</span>
						<span className="text-muted-foreground tabular-nums">
							{Math.round(s.pct * 100)}%
						</span>
					</li>
				))}
			</ul>
		</div>
	)
}

// Weekly load bars — actual TSS solid, planned TSS as a faint target outline.
function WeeklyLoadBars({ bars }: { bars: WeekBar[] }) {
	if (bars.length === 0) {
		return <p className="text-muted-foreground text-sm">No weekly load yet.</p>
	}
	const max = Math.max(...bars.map((b) => Math.max(b.actual, b.planned)), 1)
	return (
		<div>
			<div className="flex h-36 items-end gap-2">
				{bars.map((b) => {
					const aH = (b.actual / max) * 100
					const pH = (b.planned / max) * 100
					return (
						<div
							key={b.label}
							className="flex flex-1 flex-col items-center gap-1.5"
						>
							<div className="relative flex h-32 w-full items-end justify-center">
								{b.planned > 0 ? (
									<div
										className="border-muted-foreground/40 absolute bottom-0 w-full rounded-t-sm border border-dashed"
										style={{ height: `${pH}%` }}
									/>
								) : null}
								<div
									className={cn(
										'relative w-full rounded-t-sm',
										b.isPast ? 'bg-sky-500/80' : 'bg-primary/40',
									)}
									style={{ height: `${Math.max(aH, b.actual > 0 ? 3 : 0)}%` }}
								/>
							</div>
							<span className="text-muted-foreground text-[10px] tabular-nums">
								{b.label}
							</span>
						</div>
					)
				})}
			</div>
			<div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
				<LegendDot color="bg-sky-500/80" label="Actual TSS" />
				<span className="inline-flex items-center gap-1.5">
					<span className="border-muted-foreground/40 size-2 rounded-[2px] border border-dashed" />
					Planned
				</span>
			</div>
		</div>
	)
}

// Compact intensity shape from a session's blocks/steps.
const ZONE_BG: Record<string, string> = {
	easy: 'bg-sky-400',
	zone2: 'bg-emerald-400',
	threshold: 'bg-amber-400',
	max: 'bg-rose-500',
}
type ShapeBlock = {
	repeatCount: number
	steps: Array<{
		id: string
		intensity: string | null
		durationSec: number | null
	}>
}
function WorkoutShape({ blocks }: { blocks: ShapeBlock[] }) {
	const steps: Array<{ id: string; zone: string | null; weight: number }> = []
	for (const b of blocks ?? []) {
		for (let rep = 0; rep < (b.repeatCount ?? 1); rep++) {
			for (const step of b.steps) {
				steps.push({
					id: `${step.id}-${rep}`,
					zone: step.intensity ?? null,
					weight: step.durationSec ?? 1,
				})
			}
		}
	}
	if (steps.length === 0) return null
	return (
		<div className="flex h-8 w-full items-end gap-px overflow-hidden rounded">
			{steps.map((s) => (
				<div
					key={s.id}
					style={{ flexGrow: s.weight }}
					className={cn(
						'min-w-px rounded-[1px]',
						s.zone
							? (ZONE_BG[s.zone] ?? 'bg-muted-foreground/40')
							: 'bg-muted-foreground/30',
						s.zone === 'max'
							? 'h-8'
							: s.zone === 'threshold'
								? 'h-6'
								: s.zone === 'zone2'
									? 'h-4'
									: 'h-3',
					)}
				/>
			))}
		</div>
	)
}

// ============================================================
// Small shared bits (no layout coupling)
// ============================================================
function Greeting({ trailing }: { trailing?: ReactNode }) {
	const user = useOptionalUser()
	return (
		<header className="flex flex-wrap items-end justify-between gap-4">
			<div>
				<p className="text-muted-foreground text-sm">
					{greetingFor(new Date())}, {user?.name ?? user?.username ?? 'athlete'}
					.
				</p>
				<h1 className="text-foreground mt-1 text-3xl font-semibold tracking-tight">
					Here&apos;s your training
				</h1>
			</div>
			{trailing}
		</header>
	)
}

function NewSessionButton({ className }: { className?: string }) {
	return (
		<Button
			variant="default"
			size="sm"
			className={className}
			nativeButton={false}
			render={<Link to="/training/sessions/new" />}
		>
			<Icon name="plus" size="sm" />
			New session
		</Button>
	)
}

function PlanArcInline({ plan }: { plan: ActivePlan | null }) {
	if (!plan) {
		return (
			<div>
				<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					Plan
				</p>
				<p className="text-foreground mt-1 font-semibold">No active plan</p>
				<Link
					to="/training/plan/new"
					className="text-primary mt-1 inline-block text-sm hover:underline"
				>
					Generate a plan →
				</Link>
			</div>
		)
	}
	const arc = planArc(plan.phases, new Date(plan.eventDate))
	return (
		<Link to={`/training/events/${plan.eventId}`} className="group block">
			<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
				Plan · {arc.phase}
			</p>
			<p className="text-foreground mt-1 font-semibold group-hover:underline">
				{plan.eventName}
			</p>
			<p className="text-muted-foreground text-sm">
				Week {arc.weekInPlan} of {arc.totalWeeks} · {arc.countdown}
			</p>
			<div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
				<div
					className="bg-primary h-full rounded-full"
					style={{ width: `${arc.progressPct}%` }}
				/>
			</div>
		</Link>
	)
}

function Tile({
	children,
	className,
	title,
}: {
	children: ReactNode
	className?: string
	title?: string
}) {
	return (
		<section
			className={cn(
				'bg-card border-border/60 rounded-2xl border p-5',
				className,
			)}
		>
			{title ? (
				<h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
					{title}
				</h2>
			) : null}
			{children}
		</section>
	)
}

function SessionLine({ session }: { session: UpcomingSession }) {
	const presenter = useSessionPresenter()
	const p = presenter.presentSession(session)
	const discipline = getSessionDiscipline(session)
	return (
		<Link
			to={`/training/sessions/${session.id}`}
			className="hover:bg-muted/30 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition"
		>
			<span className="text-muted-foreground w-16 shrink-0 text-xs tabular-nums">
				{p.shortDate}
			</span>
			<span
				className="size-2 shrink-0 rounded-full"
				style={{ background: donutColor(discipline) }}
			/>
			<span className="text-foreground min-w-0 flex-1 truncate text-sm">
				{session.workout?.title ?? 'Recording'}
			</span>
			<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
				{p.timeOfDay}
			</span>
		</Link>
	)
}

// ============================================================
// VARIANT 1 — Cockpit (bento grid)
// ============================================================
function Cockpit({ data }: { data: HomeData }) {
	const d = useDerived(data)
	const { coach, tone, coldStart, tsb } = d
	const next = data.nextSession

	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-6">
				<Greeting trailing={<NewSessionButton />} />

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
					{/* Readiness hero */}
					<Tile className={cn('lg:col-span-4', TONE[tone].soft)}>
						<div className="flex flex-col items-center text-center">
							<ReadinessGauge tsb={tsb} tone={tone} coldStart={coldStart} />
							<p className={cn('mt-2 text-2xl font-semibold', TONE[tone].ink)}>
								{coldStart ? 'Building baseline' : (coach?.label ?? 'Neutral')}
							</p>
							<p className="text-muted-foreground mt-1 max-w-xs text-sm">
								{coldStart
									? `Form is reliable after ${data.tsbTrust.requiredDays} days — day ${data.tsbTrust.daysOfHistory}/${data.tsbTrust.requiredDays}.`
									: coach?.recommendation}
							</p>
						</div>
					</Tile>

					{/* Load trend */}
					<Tile className="lg:col-span-8" title="Training load · 90 days">
						<LoadTrendChart snapshots={data.snapshots} current={data.current} />
					</Tile>

					{/* Next session */}
					<Tile className="lg:col-span-8" title="Next up">
						{next ? (
							<Link
								to={`/training/sessions/${next.id}`}
								className="group block"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span
												className="size-2 rounded-full"
												style={{
													background: donutColor(getSessionDiscipline(next)),
												}}
											/>
											<span className="text-muted-foreground text-xs font-medium">
												{getDisciplineLabel(getSessionDiscipline(next))}
											</span>
											<Badge variant={getStatusVariant(next.status)}>
												{getStatusLabel(next.status)}
											</Badge>
											<span className="text-muted-foreground text-xs">
												· {d.nextCountdown}
											</span>
										</div>
										<h3 className="text-foreground mt-1.5 truncate text-xl font-semibold group-hover:underline">
											{next.workout?.title ?? 'Recording'}
										</h3>
									</div>
									<Icon
										name="arrow-right"
										className="text-muted-foreground mt-1 shrink-0"
									/>
								</div>
								<div className="mt-4">
									<WorkoutShape blocks={next.workout?.blocks ?? []} />
								</div>
							</Link>
						) : (
							<p className="text-muted-foreground text-sm">
								Nothing scheduled. Enjoy the rest.
							</p>
						)}
					</Tile>

					{/* Plan arc */}
					<Tile className="lg:col-span-4">
						<PlanArcInline plan={data.activePlan} />
					</Tile>

					{/* Discipline donut */}
					<Tile className="lg:col-span-4" title="Discipline mix · upcoming">
						<DisciplineDonut allocation={d.allocation} />
					</Tile>

					{/* Weekly load bars */}
					<Tile className="lg:col-span-8" title="Weekly load">
						<WeeklyLoadBars bars={d.weeklyBars} />
					</Tile>
				</div>

				{/* Upcoming list */}
				<Tile title="The week ahead">
					{d.allSessions.length > 0 ? (
						<div className="divide-border/50 divide-y">
							{d.allSessions.slice(0, 6).map((s) => (
								<SessionLine key={s.id} session={s} />
							))}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							No sessions in the next 14 days.
						</p>
					)}
				</Tile>
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 2 — Briefing (editorial single column)
// ============================================================
function Briefing({ data }: { data: HomeData }) {
	const d = useDerived(data)
	const { coach, tone, coldStart } = d
	const user = useOptionalUser()
	const presenter = useSessionPresenter()
	const next = data.nextSession

	return (
		<main className="min-h-screen px-5 py-12 sm:py-16">
			<div className="mx-auto max-w-2xl space-y-14">
				{/* Headline brief */}
				<header>
					<p className="text-muted-foreground text-sm tracking-wide uppercase">
						{greetingFor(new Date())},{' '}
						{user?.name ?? user?.username ?? 'athlete'}
					</p>
					<h1 className="text-foreground mt-3 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
						{coldStart ? (
							<>Still building your baseline.</>
						) : (
							<>
								You&apos;re{' '}
								<span className={TONE[tone].ink}>
									{coach?.label?.toLowerCase() ?? 'neutral'}
								</span>{' '}
								today.
							</>
						)}
					</h1>
					<p className="text-muted-foreground mt-4 max-w-xl text-lg">
						{coldStart
							? `Your Form reading becomes reliable after ${data.tsbTrust.requiredDays} days — you're on day ${data.tsbTrust.daysOfHistory}.`
							: coach?.recommendation}
					</p>
				</header>

				{/* Inline load strip */}
				<section>
					<div className="text-muted-foreground mb-3 flex items-baseline justify-between">
						<h2 className="text-foreground text-sm font-semibold tracking-wide uppercase">
							Form over 90 days
						</h2>
					</div>
					<LoadTrendChart
						snapshots={data.snapshots}
						current={data.current}
						height={120}
					/>
				</section>

				{/* Today's session — the hero */}
				<section>
					<h2 className="text-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
						Today&apos;s session
					</h2>
					{next ? (
						<Link to={`/training/sessions/${next.id}`} className="group block">
							<div className="flex items-center gap-2">
								<span
									className="size-2 rounded-full"
									style={{ background: donutColor(getSessionDiscipline(next)) }}
								/>
								<span className="text-muted-foreground text-sm font-medium">
									{getDisciplineLabel(getSessionDiscipline(next))} ·{' '}
									{d.nextCountdown}
								</span>
							</div>
							<h3 className="text-foreground mt-2 text-3xl font-semibold tracking-tight group-hover:underline">
								{next.workout?.title ?? 'Recording'}
							</h3>
							{next.workout?.description ? (
								<p className="text-muted-foreground mt-2 line-clamp-2">
									{next.workout.description}
								</p>
							) : null}
							<div className="mt-5">
								<WorkoutShape blocks={next.workout?.blocks ?? []} />
							</div>
						</Link>
					) : (
						<div className="border-border/60 rounded-xl border border-dashed p-8 text-center">
							<p className="text-foreground font-medium">Rest day</p>
							<p className="text-muted-foreground mt-1 text-sm">
								Recover hard. Tomorrow&apos;s session will thank you.
							</p>
						</div>
					)}
				</section>

				{/* The week ahead — horizontal rail */}
				{d.allSessions.length > 0 ? (
					<section>
						<h2 className="text-foreground mb-4 text-sm font-semibold tracking-wide uppercase">
							The days ahead
						</h2>
						<div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
							{d.allSessions.slice(0, 8).map((s) => {
								const p = presenter.presentSession(s)
								const disc = getSessionDiscipline(s)
								return (
									<Link
										key={s.id}
										to={`/training/sessions/${s.id}`}
										className="bg-card border-border/60 hover:border-border w-44 shrink-0 rounded-xl border p-4 transition"
									>
										<div className="flex items-center gap-2">
											<span
												className="size-2 rounded-full"
												style={{ background: donutColor(disc) }}
											/>
											<span className="text-muted-foreground text-xs tabular-nums">
												{p.shortDate}
											</span>
										</div>
										<p className="text-foreground mt-2 line-clamp-2 text-sm font-medium">
											{s.workout?.title ?? 'Recording'}
										</p>
										<p className="text-muted-foreground mt-1 text-xs">
											{p.timeOfDay}
											{sumBlockDurationMin(s.workout?.blocks ?? [])
												? ` · ${sumBlockDurationMin(s.workout?.blocks ?? [])} min`
												: ''}
										</p>
									</Link>
								)
							})}
						</div>
					</section>
				) : null}

				{/* Plan */}
				<section className="border-border/60 border-t pt-8">
					<PlanArcInline plan={data.activePlan} />
				</section>

				{/* Reflections as quotes */}
				{data.recentLogs.length > 0 ? (
					<section>
						<h2 className="text-foreground mb-5 text-sm font-semibold tracking-wide uppercase">
							Recent reflections
						</h2>
						<div className="space-y-6">
							{data.recentLogs.slice(0, 3).map((log) => (
								<Link
									key={log.id}
									to={`/training/sessions/${log.session.id}`}
									className="border-border hover:border-foreground block border-l-2 pl-4"
								>
									<p className="text-foreground/90 text-lg leading-relaxed italic">
										&ldquo;{log.content}&rdquo;
									</p>
									<p className="text-muted-foreground mt-2 text-sm">
										{log.session.workout?.title ?? 'Recording'}
										{log.rpe != null ? ` · RPE ${log.rpe}` : ''}
									</p>
								</Link>
							))}
						</div>
					</section>
				) : null}
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 3 — Tape (horizontal timeline)
// ============================================================
function Tape({ data }: { data: HomeData }) {
	const d = useDerived(data)
	const { coach, tone, coldStart, tsb } = d
	const presenter = useSessionPresenter()

	// The Tape's signature move: open scrolled so "Now" sits in the middle,
	// past to the left and planned to the right (CONTEXT.md "Now centered").
	const trackRef = useRef<HTMLDivElement>(null)
	const nowRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const track = trackRef.current
		const marker = nowRef.current
		if (!track || !marker) return
		track.scrollLeft =
			marker.offsetLeft - track.clientWidth / 2 + marker.clientWidth / 2
	}, [])

	const now = new Date()
	const sorted = [...data.ledger].sort(
		(a, b) =>
			new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
	)
	const past = sorted.filter(
		(s) => new Date(s.scheduledAt).getTime() < now.getTime(),
	)
	const future = sorted.filter(
		(s) => new Date(s.scheduledAt).getTime() >= now.getTime(),
	)

	function TapeCard({ s }: { s: LedgerSession }) {
		const status = deriveLedgerStatus(s)
		const disc = getSessionDiscipline(s)
		const p = presenter.presentSession(s)
		const statusRing: Record<LedgerStatus, string> = {
			completed: 'border-emerald-500/40',
			planned: 'border-border/60 border-dashed',
			missed: 'border-rose-500/40',
		}
		return (
			<Link
				to={`/training/sessions/${s.id}`}
				className={cn(
					'bg-card hover:border-foreground/40 w-40 shrink-0 rounded-xl border p-3 transition',
					statusRing[status],
				)}
			>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground text-[11px] tabular-nums">
						{p.shortDate}
					</span>
					<span
						className="size-2 rounded-full"
						style={{ background: donutColor(disc) }}
					/>
				</div>
				<p className="text-foreground mt-2 line-clamp-2 text-sm font-medium">
					{s.workout?.title ?? 'Recording'}
				</p>
				<p className="text-muted-foreground mt-1 text-[11px]">
					{s.tssValue != null
						? `${Math.round(s.tssValue)} TSS`
						: s.plannedTssValue != null
							? `~${Math.round(s.plannedTssValue)} TSS`
							: getStatusLabel(status)}
				</p>
			</Link>
		)
	}

	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-8">
				<Greeting trailing={<NewSessionButton />} />

				{/* Readiness rail — compact, horizontal */}
				<section
					className={cn(
						'border-border/60 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border p-5',
						TONE[tone].soft,
					)}
				>
					<div className="flex items-baseline gap-3">
						<span
							className={cn(
								'text-4xl font-semibold tabular-nums',
								TONE[tone].ink,
							)}
						>
							{coldStart
								? '—'
								: tsb! > 0
									? `+${Math.round(tsb!)}`
									: Math.round(tsb!)}
						</span>
						<div>
							<p className={cn('font-semibold', TONE[tone].ink)}>
								{coldStart ? 'Building baseline' : coach?.label}
							</p>
							<p className="text-muted-foreground max-w-md text-sm">
								{coldStart
									? `Day ${data.tsbTrust.daysOfHistory}/${data.tsbTrust.requiredDays}`
									: coach?.recommendation}
							</p>
						</div>
					</div>
					<div className="text-muted-foreground ml-auto flex gap-5 text-sm">
						<span className="flex items-baseline gap-1.5">
							Fitness
							<span className="text-foreground font-semibold tabular-nums">
								{data.current ? Math.round(data.current.ctl) : '—'}
							</span>
						</span>
						<span className="flex items-baseline gap-1.5">
							Fatigue
							<span className="text-foreground font-semibold tabular-nums">
								{data.current ? Math.round(data.current.atl) : '—'}
							</span>
						</span>
					</div>
				</section>

				{/* The Tape */}
				<section>
					<div className="mb-3 flex items-baseline justify-between">
						<h2 className="text-foreground text-lg font-semibold tracking-tight">
							The Tape
						</h2>
						<p className="text-muted-foreground text-sm">
							Past left · Now · Planned right
						</p>
					</div>

					{/* Load backdrop aligned above the tape */}
					<div className="bg-card border-border/60 overflow-hidden rounded-t-2xl border border-b-0 px-5 pt-5">
						<LoadTrendChart
							snapshots={data.snapshots}
							current={null}
							height={96}
						/>
					</div>

					{/* Horizontal scrubbable track */}
					<div
						ref={trackRef}
						className="bg-card border-border/60 overflow-x-auto rounded-b-2xl border p-5"
					>
						<div className="flex items-stretch gap-3">
							{past.length === 0 ? (
								<div className="text-muted-foreground grid w-40 shrink-0 place-items-center text-xs">
									No history
								</div>
							) : (
								past.map((s) => <TapeCard key={s.id} s={s} />)
							)}

							{/* Now divider */}
							<div
								ref={nowRef}
								className="flex shrink-0 flex-col items-center justify-center px-2"
							>
								<span className="bg-primary h-full w-px" />
								<span className="text-primary bg-background -my-3 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
									Now
								</span>
							</div>

							{future.length === 0 ? (
								<div className="text-muted-foreground grid w-40 shrink-0 place-items-center text-xs">
									Nothing planned
								</div>
							) : (
								future.map((s) => <TapeCard key={s.id} s={s} />)
							)}
						</div>
					</div>
				</section>

				{/* Supporting diagrams */}
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<Tile title="Discipline mix · upcoming">
						<DisciplineDonut allocation={d.allocation} />
					</Tile>
					<Tile title="Weekly load">
						<WeeklyLoadBars bars={d.weeklyBars} />
					</Tile>
				</div>

				<Tile>
					<PlanArcInline plan={data.activePlan} />
				</Tile>
			</div>
		</main>
	)
}

// ============================================================
// Switcher entry point
// ============================================================
export function HomeRedesign({
	data,
	variant,
}: {
	data: HomeData
	variant: HomeVariantKey
}) {
	if (variant === 'briefing') return <Briefing data={data} />
	if (variant === 'tape') return <Tape data={data} />
	return <Cockpit data={data} />
}

// NOTES — open question this prototype answers:
//   "What should the Home page look like, desktop and mobile, with diagrams
//    that improve the UX?"
//   Verdict: <pending user feedback — fill in the winning variant + why before
//   folding into _home/index.tsx and deleting this file>.
