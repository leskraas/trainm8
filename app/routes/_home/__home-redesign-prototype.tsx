// PROTOTYPE — five creative variations on the "road to race" home, all
// goal-anchored, switchable via `?variant=` on `/` plus the floating
// PrototypeSwitcher (arrow keys cycle):
//
//   road    — the plan as a route line: stations, "you are here", finish flag
//   mission — mission-control countdown: a radial plan-progress ring hero
//   rail     — a temporal narrative in three columns: Banked · Today · Ahead
//   climb   — the periodization as a vertical climb to the race summit
//   chart   — the fitness curve as hero, every session plotted on the line
//
// Driven by a fabricated athlete (`__home-prototype-data.ts`) so progression
// and comparison aren't limited by the live loader. Filename starts with `__`
// so react-router-auto-routes ignores it. Delete with the data module when a
// direction wins (see NOTES at bottom).

import { type ReactNode, useRef } from 'react'
import { Link } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { greetingFor } from '#app/utils/dashboard.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type DayCell,
	DISCIPLINE_COLOR,
	DISCIPLINE_LABEL,
	type Discipline,
	getMockAthlete,
	type MockAthlete,
	type PR,
	type Session,
	type StructureStep,
	type WeekLoad,
	type Zone,
} from './__home-prototype-data.ts'

// ============================================================
// Variant registry
// ============================================================
export const HOME_VARIANTS = [
	{ key: 'road', name: 'Road · the route line' },
	{ key: 'mission', name: 'Mission · countdown control' },
	{ key: 'rail', name: 'Rail · banked · today · ahead' },
	{ key: 'climb', name: 'Climb · phases to the summit' },
	{ key: 'chart', name: 'Chart · sessions on the curve' },
] as const

export type HomeVariantKey = (typeof HOME_VARIANTS)[number]['key']

export function isHomeVariant(
	value: string | null | undefined,
): value is HomeVariantKey {
	return HOME_VARIANTS.some((v) => v.key === value)
}

// ============================================================
// Shared vocabulary
// ============================================================
const FORM_TONE = {
	fresh: 'text-emerald-600 dark:text-emerald-400',
	neutral: 'text-foreground',
	fatigued: 'text-amber-600 dark:text-amber-400',
} as const
const FORM_WASH = {
	fresh: 'bg-emerald-500/10',
	neutral: 'bg-muted/40',
	fatigued: 'bg-amber-500/10',
} as const

const ZONE_COLOR: Record<Zone, string> = {
	1: 'bg-sky-400',
	2: 'bg-emerald-400',
	3: 'bg-amber-400',
	4: 'bg-orange-500',
	5: 'bg-rose-500',
}
const ZONE_H: Record<Zone, string> = {
	1: 'h-3',
	2: 'h-5',
	3: 'h-7',
	4: 'h-9',
	5: 'h-11',
}
const ZONE_H_MINI: Record<Zone, string> = {
	1: 'h-1.5',
	2: 'h-2.5',
	3: 'h-3.5',
	4: 'h-4',
	5: 'h-5',
}

const BAND: Record<
	NonNullable<Session['band']>,
	{ label: string; dot: string; ink: string; wash: string }
> = {
	under: {
		label: 'Under',
		dot: 'bg-sky-400',
		ink: 'text-sky-600 dark:text-sky-400',
		wash: 'bg-sky-500/10',
	},
	'on-target': {
		label: 'On target',
		dot: 'bg-emerald-500',
		ink: 'text-emerald-600 dark:text-emerald-400',
		wash: 'bg-emerald-500/10',
	},
	over: {
		label: 'Over',
		dot: 'bg-rose-500',
		ink: 'text-rose-600 dark:text-rose-400',
		wash: 'bg-rose-500/10',
	},
}

function signed(n: number): string {
	const r = Math.round(n)
	return r > 0 ? `+${r}` : String(r)
}
function fmtDate(d: Date): string {
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
	}).format(d)
}
function weekdayShort(d: Date): string {
	return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d)
}

// ============================================================
// Shared atoms
// ============================================================
function DiscDot({ d, className }: { d: Discipline; className?: string }) {
	return (
		<span
			className={cn('inline-block size-2 rounded-full', className)}
			style={{ background: DISCIPLINE_COLOR[d] }}
		/>
	)
}

function SessionStructure({
	steps,
	scale = 'full',
}: {
	steps: StructureStep[]
	scale?: 'full' | 'mini'
}) {
	if (steps.length === 0) return null
	const heights = scale === 'mini' ? ZONE_H_MINI : ZONE_H
	return (
		<div
			className={cn(
				'flex w-full items-end gap-px overflow-hidden rounded',
				scale === 'mini' ? 'h-5' : 'h-11',
			)}
		>
			{steps.map((s, i) => (
				<div
					key={i}
					style={{ flexGrow: s.minutes }}
					className={cn(
						'min-w-px rounded-[1px]',
						ZONE_COLOR[s.zone],
						heights[s.zone],
					)}
					title={`${s.label ?? `Zone ${s.zone}`} · ${s.minutes} min`}
				/>
			))}
		</div>
	)
}

type CardData = {
	date: Date
	discipline: Discipline
	title: string
	target: string | null
	durationMin: number | null
	tss: number | null
	structure: StructureStep[]
	done?: boolean
	today?: boolean
}
function cardFromSession(s: Session): CardData {
	return {
		date: s.date,
		discipline: s.discipline,
		title: s.title,
		target: s.targetMetric,
		durationMin: s.plannedMin,
		tss: s.plannedTss,
		structure: s.structure,
	}
}
function cardFromDay(d: DayCell): CardData {
	return {
		date: d.date,
		discipline: d.discipline!,
		title: d.title!,
		target: d.target,
		durationMin: d.durationMin,
		tss: d.status === 'done' ? d.actualTss : d.plannedTss,
		structure: d.structure,
		done: d.status === 'done',
		today: d.status === 'today',
	}
}

// A legible session card — full title, the targets, the workout shape. Used
// everywhere a workout needs to be readable (never a truncated peek).
function SessionCard({ c, className }: { c: CardData; className?: string }) {
	return (
		<div
			className={cn(
				'border-border/60 flex flex-col rounded-xl border p-4',
				c.today ? 'border-primary bg-primary/5' : 'bg-card',
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs font-medium tabular-nums">
					{c.today ? 'Today' : `${weekdayShort(c.date)} ${fmtDate(c.date)}`}
				</span>
				<span className="inline-flex items-center gap-1.5">
					{c.done ? (
						<Icon name="check" className="size-3.5 text-emerald-500" />
					) : null}
					<DiscDot d={c.discipline} />
				</span>
			</div>
			<p
				className={cn(
					'mt-2 text-sm leading-snug font-semibold',
					c.done ? 'text-muted-foreground' : 'text-foreground',
				)}
			>
				{c.title}
			</p>
			<p className="text-muted-foreground mt-1 text-xs">
				{DISCIPLINE_LABEL[c.discipline]}
				{c.target ? ` · ${c.target}` : ''}
			</p>
			<p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
				{c.durationMin} min · {c.tss} TSS
			</p>
			<div className="mt-3">
				<SessionStructure steps={c.structure} scale="mini" />
			</div>
		</div>
	)
}

// ============================================================
// Diagrams
// ============================================================

// Fitness (CTL) from plan start → race day. Solid for banked, dashed for the
// projection ahead, phase bands, a "you are here" dot and a race flag. Optional
// session markers plot workouts directly on the line.
type Marker = { day: number; done: boolean; title: string }
function FitnessJourney({
	athlete,
	height = 240,
	markers,
}: {
	athlete: MockAthlete
	height?: number
	markers?: Marker[]
}) {
	const { fitness, phases, event } = athlete
	const W = 800
	const H = 240
	const yMin = 30
	const yMax = 92
	const planDays = fitness[fitness.length - 1]!.day
	const todayIdx = fitness.filter((p) => !p.projected).length - 1
	const x = (day: number) => (day / planDays) * W
	const y = (ctl: number) => H - ((ctl - yMin) / (yMax - yMin)) * H
	const pct = (day: number) => (day / planDays) * 100
	const topPct = (ctl: number) => ((yMax - ctl) / (yMax - yMin)) * 100
	const ctlAtDay = (day: number) =>
		fitness[Math.max(0, Math.min(planDays, Math.round(day)))]!.ctl

	const actual = fitness.filter((p) => !p.projected)
	const projected = fitness.slice(todayIdx)
	const ptStr = (p: { day: number; ctl: number }) => `${x(p.day)},${y(p.ctl)}`
	const lineActual = actual.map(ptStr).join(' ')
	const lineProj = projected.map(ptStr).join(' ')
	const areaActual = `0,${H} ${lineActual} ${x(actual[actual.length - 1]!.day)},${H}`
	const todayPt = fitness[todayIdx]!

	return (
		<div>
			<div className="relative" style={{ height }}>
				<svg
					viewBox={`0 0 ${W} ${H}`}
					preserveAspectRatio="none"
					className="absolute inset-0 size-full"
					role="img"
					aria-label="Fitness trend from plan start projected to race day"
				>
					<defs>
						<linearGradient id="fitArea" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.30" />
							<stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
						</linearGradient>
					</defs>
					{phases.map((ph) => {
						const dayStart = (ph.startWeek - 1) * 7
						const dayEnd = ph.endWeek * 7
						return (
							<rect
								key={ph.name}
								x={x(dayStart)}
								y={0}
								width={x(dayEnd) - x(dayStart)}
								height={H}
								fill={ph.color}
								opacity={0.06}
							/>
						)
					})}
					{[0.25, 0.5, 0.75].map((g) => (
						<line
							key={g}
							x1={0}
							x2={W}
							y1={H * g}
							y2={H * g}
							stroke="currentColor"
							className="text-border"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}
					<polygon points={areaActual} fill="url(#fitArea)" />
					<polyline
						points={lineActual}
						fill="none"
						stroke="#0ea5e9"
						strokeWidth={2.5}
						vectorEffect="non-scaling-stroke"
					/>
					<polyline
						points={lineProj}
						fill="none"
						stroke="#0ea5e9"
						strokeWidth={2}
						strokeDasharray="5 4"
						opacity={0.7}
						vectorEffect="non-scaling-stroke"
					/>
					<line
						x1={x(todayPt.day)}
						x2={x(todayPt.day)}
						y1={0}
						y2={H}
						stroke="currentColor"
						className="text-foreground/40"
						strokeWidth={1}
						strokeDasharray="3 3"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>

				{phases.map((ph) => {
					const mid = ((ph.startWeek - 1) * 7 + ph.endWeek * 7) / 2
					return (
						<span
							key={ph.name}
							className="text-muted-foreground absolute top-1 -translate-x-1/2 text-[10px] font-medium tracking-wide uppercase"
							style={{ left: `${pct(mid)}%` }}
						>
							{ph.name}
						</span>
					)
				})}

				{/* session markers plotted on the curve (round; HTML so no distortion) */}
				{markers?.map((m, i) => (
					<span
						key={i}
						className="absolute -translate-x-1/2 -translate-y-1/2"
						style={{
							left: `${pct(m.day)}%`,
							top: `${topPct(ctlAtDay(m.day))}%`,
						}}
						title={m.title}
					>
						<span
							className={cn(
								'block size-2.5 rounded-full border-2',
								m.done
									? 'border-sky-500 bg-sky-500'
									: 'bg-background border-sky-400',
							)}
						/>
					</span>
				))}

				<span
					className="absolute -translate-x-1/2 -translate-y-1/2"
					style={{
						left: `${pct(todayPt.day)}%`,
						top: `${topPct(todayPt.ctl)}%`,
					}}
				>
					<span className="block size-3 rounded-full bg-sky-500 ring-4 ring-sky-500/20" />
				</span>

				<span
					className="absolute right-0 translate-x-1 -translate-y-1/2"
					style={{ top: `${topPct(fitness[fitness.length - 1]!.ctl)}%` }}
				>
					<span className="bg-foreground text-background flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow">
						<Icon name="check" className="size-3" />
						Race
					</span>
				</span>
			</div>
			<div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
				<span>{fmtDate(fitness[0]!.date)} · start</span>
				<span className="text-foreground font-medium">
					Today · Fitness {todayPt.ctl}
				</span>
				<span>{fmtDate(event.date)} · race</span>
			</div>
		</div>
	)
}

function FitnessSpark({ athlete }: { athlete: MockAthlete }) {
	const { fitness } = athlete
	const W = 200
	const H = 44
	const ys = fitness.map((p) => p.ctl)
	const min = Math.min(...ys)
	const max = Math.max(...ys)
	const planDays = fitness[fitness.length - 1]!.day
	const x = (d: number) => (d / planDays) * W
	const y = (v: number) => H - ((v - min) / (max - min || 1)) * H
	const todayIdx = fitness.filter((p) => !p.projected).length - 1
	const a = fitness.slice(0, todayIdx + 1)
	const p = fitness.slice(todayIdx)
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			className="h-10 w-28"
		>
			<polyline
				points={a.map((q) => `${x(q.day)},${y(q.ctl)}`).join(' ')}
				fill="none"
				stroke="#0ea5e9"
				strokeWidth={2}
				vectorEffect="non-scaling-stroke"
			/>
			<polyline
				points={p.map((q) => `${x(q.day)},${y(q.ctl)}`).join(' ')}
				fill="none"
				stroke="#0ea5e9"
				strokeWidth={1.5}
				strokeDasharray="4 3"
				opacity={0.6}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	)
}

function WeeklyBuild({ weeks }: { weeks: WeekLoad[] }) {
	const max = Math.max(
		...weeks.map((w) => Math.max(w.plannedTss, w.actualTss ?? 0)),
	)
	return (
		<div>
			<div className="flex h-40 items-end gap-1.5">
				{weeks.map((w) => {
					const pH = (w.plannedTss / max) * 100
					const aH = ((w.actualTss ?? 0) / max) * 100
					return (
						<div
							key={w.week}
							className="flex flex-1 flex-col items-center gap-1"
						>
							<div className="relative flex h-32 w-full items-end justify-center">
								<div
									className="border-muted-foreground/30 absolute bottom-0 w-full rounded-t border border-dashed"
									style={{ height: `${pH}%` }}
								/>
								{w.actualTss != null ? (
									<div
										className={cn(
											'relative w-full rounded-t',
											w.isCurrent ? 'bg-primary' : 'bg-sky-500/70',
										)}
										style={{ height: `${aH}%` }}
									/>
								) : null}
								{w.isCurrent ? (
									<span className="text-primary absolute -top-4 text-[9px] font-semibold tracking-wide uppercase">
										Now
									</span>
								) : null}
							</div>
							<span
								className={cn(
									'text-[10px] tabular-nums',
									w.isCurrent
										? 'text-foreground font-semibold'
										: 'text-muted-foreground',
								)}
							>
								{w.label}
							</span>
						</div>
					)
				})}
			</div>
			<div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
				<LegendDot color="bg-sky-500/70" label="Actual TSS" />
				<span className="inline-flex items-center gap-1.5">
					<span className="border-muted-foreground/40 size-2 rounded-[2px] border border-dashed" />
					Planned
				</span>
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

// Recent session as a planned-vs-actual comparison row.
function CompareRow({ s }: { s: Session }) {
	const max = Math.max(s.plannedTss, s.actualTss ?? 0, 1)
	return (
		<div className="flex items-center gap-3 py-2.5">
			<div className="flex w-24 items-center gap-2">
				<DiscDot d={s.discipline} />
				<span className="text-muted-foreground text-xs tabular-nums">
					{fmtDate(s.date)}
				</span>
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-foreground truncate text-sm font-medium">
					{s.title}
				</p>
				<p className="text-muted-foreground truncate text-xs tabular-nums">
					{s.targetMetric}
					{s.actualMetric ? ` → ${s.actualMetric}` : ''}
				</p>
			</div>
			<div className="hidden w-20 sm:block">
				<div className="bg-muted h-1.5 overflow-hidden rounded-full">
					<div
						className="bg-muted-foreground/40 h-full rounded-full"
						style={{ width: `${(s.plannedTss / max) * 100}%` }}
					/>
				</div>
				<div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
					<div
						className={cn(
							'h-full rounded-full',
							s.band ? BAND[s.band].dot : 'bg-sky-500',
						)}
						style={{ width: `${((s.actualTss ?? 0) / max) * 100}%` }}
					/>
				</div>
			</div>
			{s.band ? (
				<span
					className={cn(
						'inline-flex w-20 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium',
						BAND[s.band].wash,
						BAND[s.band].ink,
					)}
				>
					<span className={cn('size-1.5 rounded-full', BAND[s.band].dot)} />
					{BAND[s.band].label}
				</span>
			) : null}
		</div>
	)
}

function PRChips({ prs }: { prs: PR[] }) {
	return (
		<div className="flex flex-wrap gap-2">
			{prs.map((pr) => (
				<div
					key={pr.label}
					className="bg-card border-border/60 flex items-center gap-3 rounded-xl border px-3 py-2"
				>
					<div>
						<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
							{pr.label}
						</p>
						<p className="text-foreground text-base font-semibold tabular-nums">
							{pr.value}
						</p>
					</div>
					<span
						className={cn(
							'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums',
							pr.improved
								? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
								: 'bg-muted text-muted-foreground',
						)}
					>
						<Icon
							name={pr.improved ? 'chevron-up' : 'chevron-down'}
							className="size-3"
						/>
						{pr.delta}
					</span>
				</div>
			))}
		</div>
	)
}

// The plan as a route line: traveled (solid) up to today, dashed ahead, with
// phase stations, a "you are here" pin, and a finish flag.
function RouteLine({ athlete }: { athlete: MockAthlete }) {
	const { fitness, phases } = athlete
	const planDays = fitness[fitness.length - 1]!.day
	const todayDay = fitness.filter((p) => !p.projected).length - 1
	const pct = (d: number) => (d / planDays) * 100
	const stations = [
		{ day: 0, label: 'Start', color: '#94a3b8' },
		...phases.slice(1).map((ph) => ({
			day: (ph.startWeek - 1) * 7,
			label: ph.name,
			color: ph.color,
		})),
	]
	return (
		<div className="relative px-3 pt-12 pb-14">
			<div className="bg-muted relative h-2 rounded-full">
				<div
					className="bg-primary absolute inset-y-0 left-0 rounded-full"
					style={{ width: `${pct(todayDay)}%` }}
				/>
				{/* phase stations — labels above */}
				{stations.map((st) => (
					<div
						key={st.label}
						className="absolute -translate-x-1/2"
						style={{ left: `${pct(st.day)}%`, top: '50%' }}
					>
						<span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center">
							<span className="text-foreground block text-[11px] font-semibold whitespace-nowrap">
								{st.label}
							</span>
						</span>
						<span
							className="border-background block size-3 -translate-y-1/2 rounded-full border-2"
							style={{ background: st.color }}
						/>
					</div>
				))}
				{/* you-are-here pin — below */}
				<div
					className="absolute -translate-x-1/2"
					style={{ left: `${pct(todayDay)}%`, top: '50%' }}
				>
					<span className="border-background bg-primary ring-primary/20 block size-5 -translate-y-1/2 rounded-full border-2 shadow ring-4" />
					<span className="text-primary absolute top-4 left-1/2 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap">
						You are here
					</span>
				</div>
				{/* finish flag */}
				<div className="absolute top-1/2 right-0">
					<span className="bg-foreground text-background absolute right-0 bottom-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
						<Icon name="check" className="size-3" />
						Race
					</span>
					<span className="border-background bg-foreground block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" />
				</div>
			</div>
		</div>
	)
}

// Radial progress ring for the mission-control hero.
function RadialRing({
	pct,
	size = 200,
	children,
}: {
	pct: number
	size?: number
	children: ReactNode
}) {
	const r = 54
	const c = 64
	const circ = 2 * Math.PI * r
	return (
		<div
			className="relative grid place-items-center"
			style={{ width: size, height: size }}
		>
			<svg viewBox="0 0 128 128" className="size-full -rotate-90">
				<circle
					cx={c}
					cy={c}
					r={r}
					fill="none"
					stroke="currentColor"
					className="text-muted"
					strokeWidth={8}
				/>
				<circle
					cx={c}
					cy={c}
					r={r}
					fill="none"
					stroke="currentColor"
					className="text-primary"
					strokeWidth={8}
					strokeLinecap="round"
					strokeDasharray={`${(circ * pct) / 100} ${circ}`}
				/>
			</svg>
			<div className="absolute inset-0 grid place-content-center text-center">
				{children}
			</div>
		</div>
	)
}

// ============================================================
// Header pieces
// ============================================================
function PageHeader({
	name,
	trailing,
}: {
	name: string
	trailing?: ReactNode
}) {
	return (
		<header className="flex flex-wrap items-end justify-between gap-4">
			<div>
				<p className="text-muted-foreground text-sm">
					{greetingFor(new Date())}, {name}.
				</p>
				<h1 className="text-foreground mt-1 text-3xl font-semibold tracking-tight">
					Road to race day
				</h1>
			</div>
			{trailing}
		</header>
	)
}

function NewSessionButton() {
	return (
		<Button
			variant="default"
			size="sm"
			nativeButton={false}
			render={<Link to="/training/sessions/new" />}
		>
			<Icon name="plus" size="sm" />
			New session
		</Button>
	)
}

function RaceBanner({ athlete }: { athlete: MockAthlete }) {
	const { event, phase } = athlete
	return (
		<div className="bg-card border-border/60 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4">
			<div className="flex items-center gap-3">
				<span className="bg-foreground text-background grid size-11 place-items-center rounded-xl text-lg font-bold tabular-nums">
					{event.daysOut}
				</span>
				<div>
					<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
						Days to race · Priority {event.priority}
					</p>
					<p className="text-foreground font-semibold">{event.name}</p>
				</div>
			</div>
			<div className="text-right">
				<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
					{phase.name} phase
				</p>
				<p className="text-foreground font-semibold tabular-nums">
					Week {phase.weekInPlan} of {phase.totalWeeks}
				</p>
			</div>
		</div>
	)
}

function Tile({
	children,
	className,
	title,
	action,
}: {
	children: ReactNode
	className?: string
	title?: string
	action?: ReactNode
}) {
	return (
		<section
			className={cn(
				'bg-card border-border/60 rounded-2xl border p-5',
				className,
			)}
		>
			{title ? (
				<div className="mb-4 flex items-baseline justify-between">
					<h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						{title}
					</h2>
					{action}
				</div>
			) : null}
			{children}
		</section>
	)
}

function TodayHero({ athlete }: { athlete: MockAthlete }) {
	const { today, overview } = athlete
	return (
		<div>
			<div className="flex items-center gap-2">
				<DiscDot d={today.discipline} />
				<span className="text-muted-foreground text-xs font-medium">
					{DISCIPLINE_LABEL[today.discipline]} · today
				</span>
			</div>
			<h3 className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight">
				{today.title}
			</h3>
			<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
				<span>
					<span className="text-foreground font-medium tabular-nums">
						{today.plannedMin}
					</span>{' '}
					min
				</span>
				<span>
					<span className="text-foreground font-medium tabular-nums">
						{today.plannedTss}
					</span>{' '}
					TSS
				</span>
				<span className="tabular-nums">{today.targetMetric}</span>
			</div>
			<div className="mt-4">
				<SessionStructure steps={today.structure} />
			</div>
			<div className="mt-5 flex flex-wrap items-center gap-3">
				<Button nativeButton={false} render={<Link to="/" />}>
					<Icon name="arrow-right" size="sm" />
					Start session
				</Button>
				<p className={cn('text-sm', FORM_TONE[overview.formTone])}>
					Form {signed(overview.form)} · {overview.formLabel}
				</p>
			</div>
		</div>
	)
}

function WeekProgress({ athlete }: { athlete: MockAthlete }) {
	const { weekStats } = athlete
	return (
		<div className="flex items-center gap-4">
			<div className="flex-1">
				<div className="text-muted-foreground mb-1 flex justify-between text-xs">
					<span>
						{weekStats.done} of {weekStats.planned} sessions
					</span>
					<span className="tabular-nums">
						{weekStats.loadDone} / {weekStats.loadPlanned} TSS
					</span>
				</div>
				<div className="bg-muted h-2 overflow-hidden rounded-full">
					<div
						className="bg-primary h-full rounded-full"
						style={{ width: `${weekStats.adherencePct}%` }}
					/>
				</div>
			</div>
			<span className="text-foreground text-lg font-semibold tabular-nums">
				{weekStats.adherencePct}%
			</span>
		</div>
	)
}

function StatChip({
	label,
	value,
	ink,
}: {
	label: string
	value: string
	ink?: string
}) {
	return (
		<div className="bg-card border-border/60 rounded-xl border px-4 py-3">
			<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
				{label}
			</p>
			<p
				className={cn(
					'text-xl font-semibold tabular-nums',
					ink ?? 'text-foreground',
				)}
			>
				{value}
			</p>
		</div>
	)
}

function HScroll({ children }: { children: ReactNode }) {
	return (
		<div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2">{children}</div>
	)
}

// ============================================================
// VARIANT 1 — Road (the route line)
// ============================================================
function Road({ athlete }: { athlete: MockAthlete }) {
	const { overview, event } = athlete
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-5xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />
				<RaceBanner athlete={athlete} />

				<Tile>
					<div className="mb-1 flex flex-wrap items-center justify-between gap-3">
						<h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							The route · {event.name}
						</h2>
						<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
							<Icon name="check" className="size-3.5" />
							On track · fitness {overview.fitness} → {overview.peakProjected}
						</span>
					</div>
					<RouteLine athlete={athlete} />
				</Tile>

				<Tile title="Today" className={FORM_WASH[overview.formTone]}>
					<TodayHero athlete={athlete} />
				</Tile>

				<Tile title="Next stops on the road">
					<HScroll>
						{athlete.upcoming.map((s) => (
							<SessionCard
								key={s.id}
								c={cardFromSession(s)}
								className="w-56 shrink-0"
							/>
						))}
					</HScroll>
				</Tile>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<Tile title="The build · weekly load">
						<WeeklyBuild weeks={athlete.weeks} />
					</Tile>
					<Tile title="Recent · planned vs actual">
						<div className="divide-border/50 divide-y">
							{athlete.recent.slice(0, 4).map((s) => (
								<CompareRow key={s.id} s={s} />
							))}
						</div>
					</Tile>
				</div>

				<Tile title="Personal records · this block">
					<PRChips prs={athlete.prs} />
				</Tile>
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 2 — Mission (countdown control)
// ============================================================
function Mission({ athlete }: { athlete: MockAthlete }) {
	const { event, phase, overview } = athlete
	const planDays = athlete.fitness[athlete.fitness.length - 1]!.day
	const progress = Math.round(((planDays - event.daysOut) / planDays) * 100)
	const weekSessions = athlete.week.filter((d) => d.status !== 'rest')
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-5xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />

				{/* Mission-control hero */}
				<Tile>
					<div className="grid items-center gap-8 sm:grid-cols-[auto_1fr]">
						<div className="mx-auto">
							<RadialRing pct={progress}>
								<span className="text-foreground text-4xl font-semibold tabular-nums">
									{event.daysOut}
								</span>
								<span className="text-muted-foreground text-xs tracking-wide uppercase">
									days to race
								</span>
							</RadialRing>
						</div>
						<div>
							<p className="text-muted-foreground text-xs tracking-wide uppercase">
								Priority {event.priority} · {phase.name} phase
							</p>
							<h2 className="text-foreground text-2xl font-semibold tracking-tight">
								{event.name}
							</h2>
							<p className="text-muted-foreground mt-1 text-sm">
								{fmtDate(event.date)} · Week {phase.weekInPlan} of{' '}
								{phase.totalWeeks} · {progress}% through the plan
							</p>
							<div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
								<div className="flex items-center gap-3">
									<FitnessSpark athlete={athlete} />
									<div>
										<p className="text-foreground text-sm font-semibold tabular-nums">
											{overview.fitness} → {overview.peakProjected}
										</p>
										<p className="text-muted-foreground text-xs">
											projected fitness
										</p>
									</div>
								</div>
								<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
									<Icon name="check" className="size-3.5" />
									On track
								</span>
							</div>
						</div>
					</div>
				</Tile>

				<Tile title="Today" className={FORM_WASH[overview.formTone]}>
					<TodayHero athlete={athlete} />
				</Tile>

				<Tile
					title="This week"
					action={
						<span className="text-muted-foreground text-xs tabular-nums">
							{athlete.weekStats.done}/{athlete.weekStats.planned} done
						</span>
					}
				>
					<HScroll>
						{weekSessions.map((d, i) => (
							<SessionCard
								key={i}
								c={cardFromDay(d)}
								className="w-52 shrink-0"
							/>
						))}
					</HScroll>
					<div className="border-border/60 mt-4 border-t pt-4">
						<WeekProgress athlete={athlete} />
					</div>
				</Tile>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<Tile title="The build">
						<WeeklyBuild weeks={athlete.weeks} />
					</Tile>
					<Tile title="Recent · planned vs actual">
						<div className="divide-border/50 divide-y">
							{athlete.recent.slice(0, 4).map((s) => (
								<CompareRow key={s.id} s={s} />
							))}
						</div>
					</Tile>
				</div>
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 3 — Rail (banked · today · ahead)
// ============================================================
function Rail({ athlete }: { athlete: MockAthlete }) {
	const { overview, banked, event } = athlete
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />
				<RaceBanner athlete={athlete} />
				<Tile title="Fitness · road to race">
					<FitnessJourney athlete={athlete} height={200} />
				</Tile>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
					{/* Banked */}
					<Tile title="Banked">
						<div className="grid grid-cols-3 gap-3">
							<div>
								<p className="text-2xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
									+{banked.fitnessGained}
								</p>
								<p className="text-muted-foreground text-[11px]">
									fitness gained
								</p>
							</div>
							<div>
								<p className="text-foreground text-2xl font-semibold tabular-nums">
									{banked.sessionsDone}
								</p>
								<p className="text-muted-foreground text-[11px]">
									sessions done
								</p>
							</div>
							<div>
								<p className="text-foreground text-2xl font-semibold tabular-nums">
									{banked.weeksDone}
								</p>
								<p className="text-muted-foreground text-[11px]">
									weeks complete
								</p>
							</div>
						</div>
						<div className="border-border/60 mt-4 border-t pt-3">
							<p className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">
								Recent
							</p>
							<div className="divide-border/50 divide-y">
								{athlete.recent.slice(0, 3).map((s) => (
									<CompareRow key={s.id} s={s} />
								))}
							</div>
						</div>
						<div className="mt-4">
							<PRChips prs={athlete.prs.slice(0, 2)} />
						</div>
					</Tile>

					{/* Today */}
					<Tile
						title="Today"
						className={cn('lg:order-none', FORM_WASH[overview.formTone])}
					>
						<TodayHero athlete={athlete} />
					</Tile>

					{/* Ahead */}
					<Tile title="Ahead">
						<div className="mb-3 flex items-baseline gap-2">
							<span className="text-foreground text-3xl font-semibold tabular-nums">
								{event.daysOut}
							</span>
							<span className="text-muted-foreground text-sm">
								days to {event.name}
							</span>
						</div>
						<div className="space-y-3">
							{athlete.upcoming.slice(0, 4).map((s) => (
								<SessionCard key={s.id} c={cardFromSession(s)} />
							))}
						</div>
					</Tile>
				</div>
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 4 — Climb (phases to the summit)
// ============================================================
function Climb({ athlete }: { athlete: MockAthlete }) {
	const { phases, phase, overview, event, weeks } = athlete
	const current = phase.weekInPlan
	const ordered = [...phases].reverse() // summit (race) first, base last
	function avgLoad(startWeek: number, endWeek: number) {
		const ws = weeks.filter((w) => w.week >= startWeek && w.week <= endWeek)
		return Math.round(ws.reduce((s, w) => s + w.plannedTss, 0) / ws.length)
	}
	const weekSessions = athlete.week.filter((d) => d.status !== 'rest')
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-3xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />
				<RaceBanner athlete={athlete} />

				<Tile title="The climb to race day">
					{/* Summit */}
					<div className="mb-2 flex items-center gap-3 pl-1">
						<span className="bg-foreground text-background grid size-8 place-items-center rounded-full">
							<Icon name="check" className="size-4" />
						</span>
						<div>
							<p className="text-foreground font-semibold">{event.name}</p>
							<p className="text-muted-foreground text-xs">
								Summit · {fmtDate(event.date)} · projected fitness{' '}
								{overview.peakProjected}
							</p>
						</div>
					</div>

					<ol className="border-border/70 relative ml-4 border-l-2 border-dashed">
						{ordered.map((ph) => {
							const state =
								ph.endWeek < current
									? 'done'
									: current >= ph.startWeek
										? 'current'
										: 'future'
							const isCurrent = state === 'current'
							return (
								<li key={ph.name} className="relative pb-6 pl-6 last:pb-0">
									<span
										className="border-background absolute top-1 -left-[9px] block size-4 rounded-full border-2"
										style={{
											background:
												state === 'future' ? 'var(--muted)' : ph.color,
											opacity: state === 'future' ? 0.5 : 1,
										}}
									/>
									<div
										className={cn(
											'rounded-xl border p-4',
											isCurrent
												? 'border-primary bg-primary/5'
												: 'border-border/60',
											state === 'future' && 'opacity-70',
										)}
									>
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-2">
												<span className="text-foreground font-semibold">
													{ph.name}
												</span>
												{state === 'done' ? (
													<Icon
														name="check"
														className="size-4 text-emerald-500"
													/>
												) : null}
												{isCurrent ? (
													<span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
														You are here
													</span>
												) : null}
											</div>
											<span className="text-muted-foreground text-xs tabular-nums">
												Weeks {ph.startWeek}–{ph.endWeek} · ~
												{avgLoad(ph.startWeek, ph.endWeek)} TSS/wk
											</span>
										</div>

										{isCurrent ? (
											<div className="mt-4">
												<p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
													This week · Week {current}
												</p>
												<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
													{weekSessions.map((d, i) => (
														<SessionCard key={i} c={cardFromDay(d)} />
													))}
												</div>
												<div className="border-border/60 mt-4 border-t pt-4">
													<WeekProgress athlete={athlete} />
												</div>
											</div>
										) : null}
									</div>
								</li>
							)
						})}
					</ol>
				</Tile>

				<Tile title="The build · weekly load">
					<WeeklyBuild weeks={athlete.weeks} />
				</Tile>
				<Tile title="Personal records · this block">
					<PRChips prs={athlete.prs} />
				</Tile>
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 5 — Chart (sessions on the curve)
// ============================================================
function Chart({ athlete }: { athlete: MockAthlete }) {
	const { overview, event } = athlete
	const planStart = athlete.fitness[0]!.date
	const dayOf = (d: Date) =>
		Math.round((d.getTime() - planStart.getTime()) / 86_400_000)
	const markers: Marker[] = [
		...athlete.recent.map((s) => ({
			day: dayOf(s.date),
			done: true,
			title: s.title,
		})),
		{ day: dayOf(athlete.today.date), done: false, title: athlete.today.title },
		...athlete.upcoming.map((s) => ({
			day: dayOf(s.date),
			done: false,
			title: s.title,
		})),
	]
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-5xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />
				<RaceBanner athlete={athlete} />

				<Tile>
					<div className="mb-2 flex flex-wrap items-center justify-between gap-3">
						<h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Fitness &amp; every session · road to {event.name}
						</h2>
						<div className="text-muted-foreground flex items-center gap-4 text-xs">
							<span className="inline-flex items-center gap-1.5">
								<span className="size-2.5 rounded-full bg-sky-500" />
								Completed
							</span>
							<span className="inline-flex items-center gap-1.5">
								<span className="border-background bg-background size-2.5 rounded-full border-2 border-sky-400 ring-1 ring-sky-400" />
								Planned
							</span>
						</div>
					</div>
					<FitnessJourney athlete={athlete} height={300} markers={markers} />
				</Tile>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<StatChip
						label="Fitness"
						value={String(overview.fitness)}
						ink="text-sky-600 dark:text-sky-400"
					/>
					<StatChip
						label="Fatigue"
						value={String(overview.fatigue)}
						ink="text-rose-600 dark:text-rose-400"
					/>
					<StatChip
						label="Form"
						value={signed(overview.form)}
						ink={FORM_TONE[overview.formTone]}
					/>
					<StatChip label="Peak proj." value={String(overview.peakProjected)} />
				</div>

				<Tile title="Today" className={FORM_WASH[overview.formTone]}>
					<TodayHero athlete={athlete} />
				</Tile>

				<Tile title="Coming up">
					<HScroll>
						{athlete.upcoming.map((s) => (
							<SessionCard
								key={s.id}
								c={cardFromSession(s)}
								className="w-56 shrink-0"
							/>
						))}
					</HScroll>
				</Tile>

				<Tile title="Recent · planned vs actual">
					<div className="divide-border/50 divide-y">
						{athlete.recent.map((s) => (
							<CompareRow key={s.id} s={s} />
						))}
					</div>
				</Tile>
			</div>
		</main>
	)
}

// ============================================================
// Switcher entry point. `now` held stable so SSR and client agree.
// ============================================================
export function HomeRedesign({ variant }: { variant: HomeVariantKey }) {
	const nowRef = useRef<Date>(new Date())
	const athlete = getMockAthlete(nowRef.current)
	if (variant === 'mission') return <Mission athlete={athlete} />
	if (variant === 'rail') return <Rail athlete={athlete} />
	if (variant === 'climb') return <Climb athlete={athlete} />
	if (variant === 'chart') return <Chart athlete={athlete} />
	return <Road athlete={athlete} />
}

// NOTES — open question this prototype answers:
//   "What should the road-to-race home look like?"
//   Verdict: <pending — pick a variation (or a mashup) and note why before
//   folding into _home/index.tsx and deleting this file + the mock data>.
