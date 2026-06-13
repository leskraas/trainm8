// PROTOTYPE — three Home redesigns built around the jobs a self-coaching
// athlete opens the app for, switchable via `?variant=` on `/` plus the
// floating PrototypeSwitcher (arrow keys cycle):
//
//   journey — goal-anchored "road to race": fitness projection to race day,
//             today's prescription, the week, the periodized build, comparisons
//   cockpit — today-first execution: full prescription + targets, and today
//             measured against the last time you did this session
//   log     — longitudinal progression board: planned-vs-actual everywhere,
//             a scannable comparison table, PRs, the build chart
//
// Driven by a fabricated athlete (`__home-prototype-data.ts`) so progression
// and comparison views aren't limited by what the live loader can compute —
// this is about what the page SHOULD show. Filename starts with `__` so
// react-router-auto-routes ignores it. Delete with the data module when a
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
	type FitnessPoint,
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
	{ key: 'journey', name: 'Journey · road to race' },
	{ key: 'cockpit', name: 'Cockpit · today + execution' },
	{ key: 'log', name: 'Log · progression & compare' },
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
	neutral: 'bg-muted/50',
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

const BAND: Record<
	NonNullable<Session['band']>,
	{ label: string; dot: string; ink: string }
> = {
	under: {
		label: 'Under',
		dot: 'bg-sky-400',
		ink: 'text-sky-600 dark:text-sky-400',
	},
	'on-target': {
		label: 'On target',
		dot: 'bg-emerald-500',
		ink: 'text-emerald-600 dark:text-emerald-400',
	},
	over: {
		label: 'Over',
		dot: 'bg-rose-500',
		ink: 'text-rose-600 dark:text-rose-400',
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

// ============================================================
// Diagram — the signature one. Fitness (CTL) from plan start, climbing toward
// the race: solid for what's banked, dashed projection ahead, phase bands, a
// "you are here" marker and a race flag. Answers "am I improving" + "on track"
// in one read. SVG draws the curves; HTML overlays keep labels crisp.
// ============================================================
function FitnessJourney({
	athlete,
	height = 240,
}: {
	athlete: MockAthlete
	height?: number
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

	const actual = fitness.filter((p) => !p.projected)
	const projected = fitness.slice(todayIdx) // include boundary so lines join
	const pt = (p: FitnessPoint) => `${x(p.day)},${y(p.ctl)}`
	const lineActual = actual.map(pt).join(' ')
	const lineProj = projected.map(pt).join(' ')
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
					{/* phase bands */}
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
					{/* today marker */}
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

				{/* phase labels */}
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

				{/* you-are-here dot */}
				<span
					className="absolute -translate-x-1/2 -translate-y-1/2"
					style={{
						left: `${pct(todayPt.day)}%`,
						top: `${((yMax - todayPt.ctl) / (yMax - yMin)) * 100}%`,
					}}
				>
					<span className="block size-3 rounded-full bg-sky-500 ring-4 ring-sky-500/20" />
				</span>

				{/* race flag */}
				<span
					className="absolute right-0 translate-x-1 -translate-y-1/2"
					style={{
						top: `${((yMax - fitness[fitness.length - 1]!.ctl) / (yMax - yMin)) * 100}%`,
					}}
				>
					<span className="bg-foreground text-background flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow">
						<Icon name="check" size="sm" className="size-3" />
						Race
					</span>
				</span>
			</div>
			<div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
				<span>{fmtDate(fitness[0]!.date)} · plan start</span>
				<span className="text-foreground font-medium">
					Today · Fitness {todayPt.ctl}
				</span>
				<span>{fmtDate(event.date)} · race</span>
			</div>
		</div>
	)
}

// Compact fitness sparkline for the cockpit/log headers.
function FitnessSpark({ fitness }: { fitness: FitnessPoint[] }) {
	const W = 200
	const H = 44
	const ys = fitness.map((p) => p.ctl)
	const min = Math.min(...ys)
	const max = Math.max(...ys)
	const planDays = fitness[fitness.length - 1]!.day
	const x = (d: number) => (d / planDays) * W
	const y = (v: number) => H - ((v - min) / (max - min || 1)) * H
	const todayIdx = fitness.filter((p) => !p.projected).length - 1
	const actual = fitness.slice(0, todayIdx + 1)
	const proj = fitness.slice(todayIdx)
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			className="h-10 w-28"
		>
			<polyline
				points={actual.map((p) => `${x(p.day)},${y(p.ctl)}`).join(' ')}
				fill="none"
				stroke="#0ea5e9"
				strokeWidth={2}
				vectorEffect="non-scaling-stroke"
			/>
			<polyline
				points={proj.map((p) => `${x(p.day)},${y(p.ctl)}`).join(' ')}
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

// Periodized build: planned vs actual TSS per plan week, phase-coloured, current
// week highlighted. The "am I doing the work the plan asks" diagram.
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

// Workout structure as an intensity profile (zone height + duration width).
function SessionStructure({ steps }: { steps: StructureStep[] }) {
	if (steps.length === 0) return null
	return (
		<div className="flex h-11 w-full items-end gap-px overflow-hidden rounded">
			{steps.map((s, i) => (
				<div
					key={i}
					style={{ flexGrow: s.minutes }}
					className={cn(
						'min-w-px rounded-[1px]',
						ZONE_COLOR[s.zone],
						ZONE_H[s.zone],
					)}
					title={`${s.label ?? `Zone ${s.zone}`} · ${s.minutes} min`}
				/>
			))}
		</div>
	)
}

function DiscDot({ d, className }: { d: Discipline; className?: string }) {
	return (
		<span
			className={cn('inline-block size-2 rounded-full', className)}
			style={{ background: DISCIPLINE_COLOR[d] }}
		/>
	)
}

// Recent session as a planned-vs-actual comparison row.
function CompareRow({ s }: { s: Session }) {
	const max = Math.max(s.plannedTss, s.actualTss ?? 0, 1)
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
			<div className="flex w-28 items-center gap-2">
				<DiscDot d={s.discipline} />
				<span className="text-muted-foreground text-xs tabular-nums">
					{fmtDate(s.date)}
				</span>
			</div>
			<div className="min-w-0">
				<p className="text-foreground truncate text-sm font-medium">
					{s.title}
				</p>
				<p className="text-muted-foreground truncate text-xs">
					<span className="tabular-nums">{s.targetMetric}</span>
					{s.actualMetric ? (
						<>
							{' → '}
							<span className="text-foreground/80 tabular-nums">
								{s.actualMetric}
							</span>
						</>
					) : null}
				</p>
			</div>
			<div className="flex items-center gap-3">
				{/* planned vs actual TSS mini-bars */}
				<div className="hidden w-24 sm:block">
					<div className="flex items-center gap-1">
						<div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
							<div
								className="bg-muted-foreground/40 h-full rounded-full"
								style={{ width: `${(s.plannedTss / max) * 100}%` }}
							/>
						</div>
						<span className="text-muted-foreground w-7 text-right text-[10px] tabular-nums">
							{s.plannedTss}
						</span>
					</div>
					<div className="mt-1 flex items-center gap-1">
						<div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
							<div
								className={cn(
									'h-full rounded-full',
									s.band ? BAND[s.band].dot : 'bg-sky-500',
								)}
								style={{ width: `${((s.actualTss ?? 0) / max) * 100}%` }}
							/>
						</div>
						<span className="text-foreground w-7 text-right text-[10px] font-medium tabular-nums">
							{s.actualTss ?? '—'}
						</span>
					</div>
				</div>
				{s.band ? (
					<span
						className={cn(
							'inline-flex w-20 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium',
							FORM_WASH_FOR_BAND[s.band],
							BAND[s.band].ink,
						)}
					>
						<span className={cn('size-1.5 rounded-full', BAND[s.band].dot)} />
						{BAND[s.band].label}
					</span>
				) : null}
				<span className="text-muted-foreground w-12 text-right text-xs tabular-nums">
					RPE {s.rpe ?? '—'}
				</span>
			</div>
		</div>
	)
}

const FORM_WASH_FOR_BAND: Record<NonNullable<Session['band']>, string> = {
	under: 'bg-sky-500/10',
	'on-target': 'bg-emerald-500/10',
	over: 'bg-rose-500/10',
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

// Week strip — planned vs done, today highlighted.
function WeekStrip({ week }: { week: DayCell[] }) {
	return (
		<div className="grid grid-cols-7 gap-1.5">
			{week.map((day, i) => {
				const done = day.status === 'done'
				const isToday = day.status === 'today'
				const rest = day.status === 'rest'
				return (
					<div
						key={i}
						className={cn(
							'flex flex-col gap-1.5 rounded-lg border p-2',
							isToday
								? 'border-primary bg-primary/5'
								: 'border-border/60 bg-card',
						)}
					>
						<div className="flex items-center justify-between">
							<span
								className={cn(
									'text-[10px] font-medium tracking-wide uppercase',
									isToday ? 'text-primary' : 'text-muted-foreground',
								)}
							>
								{day.weekday}
							</span>
							{done ? (
								<Icon name="check" className="size-3 text-emerald-500" />
							) : day.discipline ? (
								<DiscDot d={day.discipline} />
							) : null}
						</div>
						{rest ? (
							<span className="text-muted-foreground/50 text-[11px]">Rest</span>
						) : (
							<>
								<p
									className={cn(
										'line-clamp-2 text-[11px] leading-tight font-medium',
										done ? 'text-muted-foreground' : 'text-foreground',
									)}
								>
									{day.title}
								</p>
								<span className="text-muted-foreground text-[10px] tabular-nums">
									{done && day.actualTss != null
										? `${day.actualTss} TSS`
										: day.plannedTss != null
											? `${day.plannedTss} TSS`
											: ''}
								</span>
							</>
						)}
					</div>
				)
			})}
		</div>
	)
}

// ============================================================
// Reusable header pieces
// ============================================================
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
					Here&apos;s your training
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

// Today's prescription, full or compact.
function TodayPrescription({
	s,
	size = 'lg',
}: {
	s: Session
	size?: 'lg' | 'md'
}) {
	return (
		<div>
			<div className="flex items-center gap-2">
				<DiscDot d={s.discipline} />
				<span className="text-muted-foreground text-xs font-medium">
					{DISCIPLINE_LABEL[s.discipline]} · today
				</span>
			</div>
			<h3
				className={cn(
					'text-foreground mt-1.5 font-semibold tracking-tight',
					size === 'lg' ? 'text-2xl' : 'text-xl',
				)}
			>
				{s.title}
			</h3>
			<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
				<span>
					<span className="text-foreground font-medium tabular-nums">
						{s.plannedMin}
					</span>{' '}
					min
				</span>
				<span>
					<span className="text-foreground font-medium tabular-nums">
						{s.plannedTss}
					</span>{' '}
					TSS
				</span>
				<span className="tabular-nums">{s.targetMetric}</span>
			</div>
			<div className="mt-4">
				<SessionStructure steps={s.structure} />
			</div>
		</div>
	)
}

function OverviewStat({
	label,
	value,
	ink,
}: {
	label: string
	value: string
	ink?: string
}) {
	return (
		<div>
			<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
				{label}
			</p>
			<p
				className={cn(
					'text-2xl font-semibold tabular-nums',
					ink ?? 'text-foreground',
				)}
			>
				{value}
			</p>
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

// ============================================================
// VARIANT 1 — Journey (road to race)
// ============================================================
function Journey({ athlete }: { athlete: MockAthlete }) {
	const { overview } = athlete
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-5xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />
				<RaceBanner athlete={athlete} />

				{/* The journey chart — progression + on-track in one read */}
				<Tile>
					<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
						<div>
							<h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Fitness · road to race
							</h2>
							<p className="text-foreground mt-1 text-sm">
								Climbing on plan — projected to peak at{' '}
								<span className="font-semibold">{overview.peakProjected}</span>{' '}
								fitness by race day.
							</p>
						</div>
						<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
							<Icon name="check" className="size-3.5" />
							On track
						</span>
					</div>
					<FitnessJourney athlete={athlete} />
				</Tile>

				{/* Today + week */}
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<Tile title="Today" className={FORM_WASH[overview.formTone]}>
						<TodayPrescription s={athlete.today} />
						<div className="mt-5 flex items-center gap-3">
							<Button size="sm" nativeButton={false} render={<Link to="/" />}>
								Start session
							</Button>
							<p className={cn('text-sm', FORM_TONE[overview.formTone])}>
								Form {signed(overview.form)} · {overview.formLabel}
							</p>
						</div>
					</Tile>
					<Tile title="This week" action={<WeekDoneBadge athlete={athlete} />}>
						<WeekStrip week={athlete.week} />
						<div className="mt-4">
							<WeekProgress athlete={athlete} />
						</div>
					</Tile>
				</div>

				{/* The build */}
				<Tile title="The build · weekly load">
					<WeeklyBuild weeks={athlete.weeks} />
				</Tile>

				{/* Compare */}
				<Tile title="Recent sessions · planned vs actual">
					<div className="divide-border/50 divide-y">
						{athlete.recent.map((s) => (
							<CompareRow key={s.id} s={s} />
						))}
					</div>
				</Tile>

				<Tile title="Personal records · this block">
					<PRChips prs={athlete.prs} />
				</Tile>
			</div>
		</main>
	)
}

function WeekDoneBadge({ athlete }: { athlete: MockAthlete }) {
	return (
		<span className="text-muted-foreground text-xs tabular-nums">
			{athlete.weekStats.done}/{athlete.weekStats.planned} done
		</span>
	)
}

// ============================================================
// VARIANT 2 — Cockpit (today + execution)
// ============================================================
function Cockpit({ athlete }: { athlete: MockAthlete }) {
	const { today, lastSimilar, overview, event } = athlete
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-4xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />

				{/* Big today hero with form readout */}
				<section
					className={cn(
						'border-border/60 rounded-2xl border p-6',
						FORM_WASH[overview.formTone],
					)}
				>
					<div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
						<div>
							<TodayPrescription s={today} />
							<div className="mt-5 flex flex-wrap items-center gap-3">
								<Button nativeButton={false} render={<Link to="/" />}>
									<Icon name="arrow-right" size="sm" />
									Start session
								</Button>
								<Button
									variant="ghost"
									nativeButton={false}
									render={<Link to="/training/sessions/new" />}
								>
									Edit
								</Button>
							</div>
						</div>
						<div className="border-border/60 sm:w-44 sm:border-l sm:pl-6">
							<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
								Form today
							</p>
							<p
								className={cn(
									'text-4xl font-semibold tabular-nums',
									FORM_TONE[overview.formTone],
								)}
							>
								{signed(overview.form)}
							</p>
							<p
								className={cn(
									'text-sm font-medium',
									FORM_TONE[overview.formTone],
								)}
							>
								{overview.formLabel}
							</p>
							<p className="text-muted-foreground mt-2 text-xs leading-relaxed">
								{overview.formAdvice}
							</p>
						</div>
					</div>
				</section>

				{/* Compare: today vs last time you did this */}
				<Tile title="Compared with your last threshold run">
					<div className="bg-border/60 grid grid-cols-2 gap-px overflow-hidden rounded-xl">
						<CompareColumn
							heading="Last time"
							sub={`${fmtDate(lastSimilar.date)} · ${lastSimilar.title}`}
							rows={[
								['Duration', `${lastSimilar.actualMin} min`],
								['Load', `${lastSimilar.actualTss} TSS`],
								['Pace / HR', lastSimilar.actualMetric ?? '—'],
								['RPE', String(lastSimilar.rpe ?? '—')],
							]}
							muted
						/>
						<CompareColumn
							heading="Today's target"
							sub={today.title}
							rows={[
								['Duration', `${today.plannedMin} min`],
								['Load', `${today.plannedTss} TSS`],
								['Pace / HR', today.targetMetric],
								['RPE', 'target 6–7'],
							]}
						/>
					</div>
					<p className="text-muted-foreground mt-3 text-xs">
						Last time you nailed it (
						<span className="text-emerald-600 dark:text-emerald-400">
							on target
						</span>
						). Today is +2 min of work — hold the same effort.
					</p>
				</Tile>

				{/* This week + race countdown */}
				<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
					<Tile title="This week" className="md:col-span-2">
						<WeekStrip week={athlete.week} />
						<div className="mt-4">
							<WeekProgress athlete={athlete} />
						</div>
					</Tile>
					<Tile title="Toward the race">
						<p className="text-foreground text-3xl font-semibold tabular-nums">
							{event.daysOut}
							<span className="text-muted-foreground ml-1 text-sm font-normal">
								days
							</span>
						</p>
						<p className="text-muted-foreground text-sm">{event.name}</p>
						<div className="mt-3">
							<FitnessSpark fitness={athlete.fitness} />
						</div>
						<p className="text-muted-foreground mt-1 text-xs">
							Fitness {overview.fitness} → {overview.peakProjected} projected
						</p>
					</Tile>
				</div>

				{/* Recent execution */}
				<Tile title="Recent sessions · planned vs actual">
					<div className="divide-border/50 divide-y">
						{athlete.recent.slice(0, 4).map((s) => (
							<CompareRow key={s.id} s={s} />
						))}
					</div>
				</Tile>
			</div>
		</main>
	)
}

function CompareColumn({
	heading,
	sub,
	rows,
	muted = false,
}: {
	heading: string
	sub: string
	rows: [string, string][]
	muted?: boolean
}) {
	return (
		<div className="bg-card p-4">
			<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
				{heading}
			</p>
			<p
				className={cn(
					'mt-0.5 line-clamp-1 text-sm font-medium',
					muted ? 'text-muted-foreground' : 'text-foreground',
				)}
			>
				{sub}
			</p>
			<dl className="mt-3 space-y-2">
				{rows.map(([k, v]) => (
					<div key={k} className="flex items-baseline justify-between gap-2">
						<dt className="text-muted-foreground text-xs">{k}</dt>
						<dd
							className={cn(
								'text-sm tabular-nums',
								muted ? 'text-muted-foreground' : 'text-foreground font-medium',
							)}
						>
							{v}
						</dd>
					</div>
				))}
			</dl>
		</div>
	)
}

// ============================================================
// VARIANT 3 — Log (progression & compare board)
// ============================================================
function Log({ athlete }: { athlete: MockAthlete }) {
	const { overview, event, today } = athlete
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />

				{/* Overview bar */}
				<section className="bg-card border-border/60 grid grid-cols-2 gap-4 rounded-2xl border p-5 sm:grid-cols-5">
					<OverviewStat
						label="Fitness"
						value={String(overview.fitness)}
						ink="text-sky-600 dark:text-sky-400"
					/>
					<OverviewStat
						label="Fatigue"
						value={String(overview.fatigue)}
						ink="text-rose-600 dark:text-rose-400"
					/>
					<OverviewStat
						label="Form"
						value={signed(overview.form)}
						ink={FORM_TONE[overview.formTone]}
					/>
					<OverviewStat
						label={`To ${event.name.split(' ')[0]}`}
						value={`${event.daysOut}d`}
					/>
					<div className="col-span-2 flex items-center gap-3 sm:col-span-1">
						<FitnessSpark fitness={athlete.fitness} />
						<span className="text-muted-foreground text-xs">
							→ {overview.peakProjected}
						</span>
					</div>
				</section>

				{/* Today rail */}
				<Tile>
					<div className="flex flex-wrap items-center justify-between gap-4">
						<TodayPrescriptionInline s={today} />
						<Button size="sm" nativeButton={false} render={<Link to="/" />}>
							Start session
						</Button>
					</div>
				</Tile>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<Tile title="The build · planned vs actual">
						<WeeklyBuild weeks={athlete.weeks} />
					</Tile>
					<Tile title="Fitness trend">
						<FitnessJourney athlete={athlete} height={196} />
					</Tile>
				</div>

				{/* The comparison table — the star of this variant */}
				<Tile title="Session log · planned vs actual">
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-muted-foreground border-border/60 border-b text-left text-xs tracking-wide uppercase">
									<th className="py-2 pr-3 font-medium">Date</th>
									<th className="py-2 pr-3 font-medium">Session</th>
									<th className="py-2 pr-3 text-right font-medium">Dur</th>
									<th className="py-2 pr-3 text-right font-medium">TSS</th>
									<th className="py-2 pr-3 font-medium">Target → actual</th>
									<th className="py-2 pr-3 text-right font-medium">RPE</th>
									<th className="py-2 font-medium">Result</th>
								</tr>
							</thead>
							<tbody className="divide-border/40 divide-y">
								{athlete.recent.map((s) => (
									<tr key={s.id}>
										<td className="text-muted-foreground py-2.5 pr-3 whitespace-nowrap tabular-nums">
											{fmtDate(s.date)}
										</td>
										<td className="py-2.5 pr-3">
											<span className="flex items-center gap-2">
												<DiscDot d={s.discipline} />
												<span className="text-foreground font-medium">
													{s.title}
												</span>
											</span>
										</td>
										<td className="text-muted-foreground py-2.5 pr-3 text-right tabular-nums">
											<span className="text-muted-foreground/60">
												{s.plannedMin}
											</span>
											→
											<span className="text-foreground font-medium">
												{s.actualMin}
											</span>
										</td>
										<td className="py-2.5 pr-3 text-right tabular-nums">
											<span className="text-muted-foreground/60">
												{s.plannedTss}
											</span>
											→
											<span className="text-foreground font-medium">
												{s.actualTss}
											</span>
										</td>
										<td className="text-muted-foreground py-2.5 pr-3 text-xs">
											<span>{s.targetMetric}</span>
											{s.actualMetric ? (
												<span className="text-foreground/80">
													{' '}
													→ {s.actualMetric}
												</span>
											) : null}
										</td>
										<td className="text-foreground py-2.5 pr-3 text-right tabular-nums">
											{s.rpe ?? '—'}
										</td>
										<td className="py-2.5">
											{s.band ? (
												<span
													className={cn(
														'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
														FORM_WASH_FOR_BAND[s.band],
														BAND[s.band].ink,
													)}
												>
													<span
														className={cn(
															'size-1.5 rounded-full',
															BAND[s.band].dot,
														)}
													/>
													{BAND[s.band].label}
												</span>
											) : (
												'—'
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Tile>

				<Tile title="Personal records · this block">
					<PRChips prs={athlete.prs} />
				</Tile>
			</div>
		</main>
	)
}

function TodayPrescriptionInline({ s }: { s: Session }) {
	return (
		<div className="flex items-center gap-3">
			<DiscDot d={s.discipline} />
			<div>
				<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
					Today
				</p>
				<p className="text-foreground font-semibold">{s.title}</p>
				<p className="text-muted-foreground text-xs tabular-nums">
					{s.plannedMin} min · {s.plannedTss} TSS · {s.targetMetric}
				</p>
			</div>
			<div className="hidden w-40 sm:block">
				<SessionStructure steps={s.structure} />
			</div>
		</div>
	)
}

// ============================================================
// Switcher entry point. `now` is held stable so SSR and client agree.
// ============================================================
export function HomeRedesign({ variant }: { variant: HomeVariantKey }) {
	const nowRef = useRef<Date>(new Date())
	const athlete = getMockAthlete(nowRef.current)
	if (variant === 'cockpit') return <Cockpit athlete={athlete} />
	if (variant === 'log') return <Log athlete={athlete} />
	return <Journey athlete={athlete} />
}

// NOTES — open question this prototype answers:
//   "What should Home show so an athlete can follow the plan, see progression,
//    compare sessions, and get an overview?"
//   Verdict: <pending user feedback — pick a variant (or a mashup) and note why
//   before folding into _home/index.tsx and deleting this file + the mock data>.
