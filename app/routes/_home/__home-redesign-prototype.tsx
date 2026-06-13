// PROTOTYPE — three "optimal" road-to-race homes synthesising the review:
// Form/readiness kept prominent, a goal anchor up top, the real fitness curve
// for progression, planned-vs-actual comparison, a legible week, AND the dense
// Session Ledger brought back. Three structurally different takes, switchable
// via `?variant=` on `/` plus the floating PrototypeSwitcher (arrow keys cycle):
//
//   focus   — single-column brief: readiness → today → week → progress → ledger
//   cockpit — two-column power dashboard: "do" left, "review" right, ledger full
//   ascent  — vertical climb journey: curve → phases-to-summit → ledger
//
// Driven by a fabricated athlete (`__home-prototype-data.ts`). Filename starts
// with `__` so react-router-auto-routes ignores it. Delete with the data module
// when a direction wins (see NOTES at bottom).

import { Fragment, type ReactNode, useRef } from 'react'
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
	type LedgerEntry,
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
	{ key: 'focus', name: 'Focus · single-column brief' },
	{ key: 'cockpit', name: 'Cockpit · two-column dashboard' },
	{ key: 'ascent', name: 'Ascent · climb journey' },
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
const FORM_RULE = {
	fresh: 'border-l-emerald-500',
	neutral: 'border-l-muted-foreground/40',
	fatigued: 'border-l-amber-500',
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

// Legible session card — full title, targets, the workout shape.
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
type Marker = { day: number; done: boolean; title: string }
function FitnessJourney({
	athlete,
	height = 220,
	markers,
}: {
	athlete: MockAthlete
	height?: number
	markers?: Marker[]
}) {
	const { fitness, phases, event } = athlete
	const W = 800
	const H = 220
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
					aria-label="Fitness from plan start, projected to race day"
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
					className="absolute right-0 -translate-y-1/2"
					style={{ top: `${topPct(fitness[fitness.length - 1]!.ctl)}%` }}
				>
					<span className="bg-foreground text-background flex -translate-x-1 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow">
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

function WeeklyBuild({ weeks }: { weeks: WeekLoad[] }) {
	const max = Math.max(
		...weeks.map((w) => Math.max(w.plannedTss, w.actualTss ?? 0)),
	)
	return (
		<div>
			<div className="flex h-36 items-end gap-1.5">
				{weeks.map((w) => {
					const pH = (w.plannedTss / max) * 100
					const aH = ((w.actualTss ?? 0) / max) * 100
					return (
						<div
							key={w.week}
							className="flex flex-1 flex-col items-center gap-1"
						>
							<div className="relative flex h-28 w-full items-end justify-center">
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

// The dense Session Ledger — past (done/missed) → Now → planned, restored from
// the live home and given planned-vs-actual load + a workout-shape profile.
function LedgerStatusMark({ status }: { status: LedgerEntry['status'] }) {
	if (status === 'done')
		return <span className="block size-2.5 rounded-full bg-emerald-500" />
	if (status === 'missed')
		return <Icon name="cross-1" className="size-3.5 text-rose-500" />
	if (status === 'today')
		return (
			<span className="bg-primary ring-primary/25 block size-2.5 rounded-full ring-4" />
		)
	return (
		<span className="border-muted-foreground/50 block size-2.5 rounded-full border-2" />
	)
}

function LedgerTable({ ledger }: { ledger: LedgerEntry[] }) {
	const nowIdx = ledger.findIndex(
		(e) => e.status === 'today' || e.status === 'planned',
	)
	return (
		<div className="border-border/60 max-h-[60vh] overflow-auto rounded-xl border">
			<table className="w-full text-sm">
				<thead className="bg-card sticky top-0 z-10">
					<tr className="text-muted-foreground border-border/60 border-b text-left text-xs tracking-wide uppercase">
						<th className="w-8 py-2 pl-3" />
						<th className="py-2 pr-3 font-medium">Date</th>
						<th className="py-2 pr-3 font-medium">Type</th>
						<th className="py-2 pr-3 font-medium">Session</th>
						<th className="hidden py-2 pr-3 font-medium sm:table-cell">
							Profile
						</th>
						<th className="py-2 pr-3 text-right font-medium">Dur</th>
						<th className="py-2 pr-3 text-right font-medium">Load</th>
						<th className="py-2 pr-3 text-right font-medium">RPE</th>
					</tr>
				</thead>
				<tbody>
					{ledger.map((e, i) => (
						<Fragment key={e.id}>
							{i === nowIdx ? (
								<tr>
									<td colSpan={8} className="px-3 py-1.5">
										<div className="flex items-center gap-3">
											<span className="text-primary text-xs font-semibold tracking-wide uppercase">
												Now
											</span>
											<span className="bg-primary/40 h-px flex-1" />
										</div>
									</td>
								</tr>
							) : null}
							<tr
								className={cn(
									'border-border/40 border-b',
									e.status === 'planned' && 'text-muted-foreground',
								)}
							>
								<td className="py-2 pl-3">
									<LedgerStatusMark status={e.status} />
								</td>
								<td className="text-muted-foreground py-2 pr-3 whitespace-nowrap tabular-nums">
									{fmtDate(e.date)}
								</td>
								<td className="text-muted-foreground py-2 pr-3">
									{DISCIPLINE_LABEL[e.discipline]}
								</td>
								<td className="text-foreground py-2 pr-3 font-medium">
									{e.title}
								</td>
								<td className="hidden w-28 py-2 pr-3 sm:table-cell">
									<SessionStructure steps={e.structure} scale="mini" />
								</td>
								<td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
									{e.durationMin != null ? `${e.durationMin}m` : '—'}
								</td>
								<td className="py-2 pr-3 text-right tabular-nums">
									<span className="inline-flex items-center justify-end gap-1.5">
										{e.band ? (
											<span
												className={cn(
													'size-1.5 rounded-full',
													BAND[e.band].dot,
												)}
											/>
										) : null}
										{e.status === 'done'
											? Math.round(e.actualTss ?? 0)
											: e.plannedTss != null
												? e.plannedTss
												: '—'}
									</span>
								</td>
								<td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
									{e.rpe ?? '—'}
								</td>
							</tr>
						</Fragment>
					))}
				</tbody>
			</table>
		</div>
	)
}

// ============================================================
// Header & shared blocks
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

// Readiness-led banner: Form (the daily "go hard or recover?" answer) is the
// hero, the race countdown + plan position + key signals ride alongside.
function ReadinessBanner({ athlete }: { athlete: MockAthlete }) {
	const { overview, event, phase, weekStats } = athlete
	const tone = overview.formTone
	return (
		<section
			className={cn(
				'rounded-2xl border border-l-4 p-5',
				FORM_WASH[tone],
				FORM_RULE[tone],
			)}
		>
			<div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
				<div>
					<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Form · today
					</p>
					<div className="mt-1 flex flex-wrap items-baseline gap-x-3">
						<span
							className={cn(
								'text-5xl leading-none font-semibold tabular-nums',
								FORM_TONE[tone],
							)}
						>
							{signed(overview.form)}
						</span>
						<span className={cn('text-2xl font-medium', FORM_TONE[tone])}>
							{overview.formLabel}
						</span>
					</div>
					<p className="text-muted-foreground mt-2 max-w-xl text-sm">
						{overview.formAdvice}
					</p>
				</div>
				<div className="border-border/60 grid grid-cols-3 gap-4 sm:border-l sm:pl-6 sm:text-right">
					<BannerStat
						label="To race"
						value={`${event.daysOut}d`}
						sub={event.name.split(' ')[0] ?? 'race'}
					/>
					<BannerStat
						label="Phase"
						value={`W${phase.weekInPlan}`}
						sub={`of ${phase.totalWeeks} · ${phase.name}`}
					/>
					<BannerStat
						label="Week load"
						value={`${weekStats.adherencePct}%`}
						sub="of plan"
					/>
				</div>
			</div>
		</section>
	)
}

function BannerStat({
	label,
	value,
	sub,
}: {
	label: string
	value: string
	sub: string
}) {
	return (
		<div>
			<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
				{label}
			</p>
			<p className="text-foreground text-xl font-semibold tabular-nums">
				{value}
			</p>
			<p className="text-muted-foreground text-[11px]">{sub}</p>
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
	const { today } = athlete
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
				<Button
					variant="ghost"
					nativeButton={false}
					render={<Link to="/training/sessions/new" />}
				>
					Edit
				</Button>
			</div>
		</div>
	)
}

function WeekGrid({ athlete }: { athlete: MockAthlete }) {
	const sessions = athlete.week.filter((d) => d.status !== 'rest')
	return (
		<div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{sessions.map((d, i) => (
					<SessionCard key={i} c={cardFromDay(d)} />
				))}
			</div>
			<div className="border-border/60 mt-4 border-t pt-4">
				<WeekProgress athlete={athlete} />
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

function ledgerMarkers(athlete: MockAthlete): Marker[] {
	const planStart = athlete.fitness[0]!.date
	const dayOf = (d: Date) =>
		Math.round((d.getTime() - planStart.getTime()) / 86_400_000)
	return athlete.ledger.map((e) => ({
		day: dayOf(e.date),
		done: e.status === 'done',
		title: e.title,
	}))
}

function WeekDone({ athlete }: { athlete: MockAthlete }) {
	return (
		<span className="text-muted-foreground text-xs tabular-nums">
			{athlete.weekStats.done}/{athlete.weekStats.planned} done
		</span>
	)
}

// ============================================================
// VARIANT 1 — Focus (single-column brief)
// ============================================================
function Focus({ athlete }: { athlete: MockAthlete }) {
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-3xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />
				<ReadinessBanner athlete={athlete} />
				<Tile title="Today">
					<TodayHero athlete={athlete} />
				</Tile>
				<Tile title="This week" action={<WeekDone athlete={athlete} />}>
					<WeekGrid athlete={athlete} />
				</Tile>
				<Tile title="Progression · fitness to race">
					<FitnessJourney athlete={athlete} markers={ledgerMarkers(athlete)} />
				</Tile>
				<Tile title="The build · weekly load">
					<WeeklyBuild weeks={athlete.weeks} />
				</Tile>
				<Tile title="Session ledger" action={<WeekDone athlete={athlete} />}>
					<LedgerTable ledger={athlete.ledger} />
				</Tile>
				<Tile title="Personal records · this block">
					<PRChips prs={athlete.prs} />
				</Tile>
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 2 — Cockpit (two-column power dashboard)
// ============================================================
function Cockpit({ athlete }: { athlete: MockAthlete }) {
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />
				<ReadinessBanner athlete={athlete} />

				<div className="grid gap-6 lg:grid-cols-2">
					{/* DO */}
					<div className="space-y-6">
						<Tile title="Today">
							<TodayHero athlete={athlete} />
						</Tile>
						<Tile title="This week" action={<WeekDone athlete={athlete} />}>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{athlete.week
									.filter((d) => d.status !== 'rest')
									.map((d, i) => (
										<SessionCard key={i} c={cardFromDay(d)} />
									))}
							</div>
							<div className="border-border/60 mt-4 border-t pt-4">
								<WeekProgress athlete={athlete} />
							</div>
						</Tile>
					</div>

					{/* REVIEW */}
					<div className="space-y-6">
						<Tile title="Progression · fitness to race">
							<FitnessJourney
								athlete={athlete}
								height={200}
								markers={ledgerMarkers(athlete)}
							/>
						</Tile>
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
				</div>

				<Tile title="Session ledger">
					<LedgerTable ledger={athlete.ledger} />
				</Tile>
				<Tile title="Personal records · this block">
					<PRChips prs={athlete.prs} />
				</Tile>
			</div>
		</main>
	)
}

// ============================================================
// VARIANT 3 — Ascent (climb journey)
// ============================================================
function ClimbPhases({ athlete }: { athlete: MockAthlete }) {
	const { phases, phase, weeks } = athlete
	const current = phase.weekInPlan
	const ordered = [...phases].reverse()
	function avgLoad(startWeek: number, endWeek: number) {
		const ws = weeks.filter((w) => w.week >= startWeek && w.week <= endWeek)
		return Math.round(ws.reduce((s, w) => s + w.plannedTss, 0) / ws.length)
	}
	const weekSessions = athlete.week.filter((d) => d.status !== 'rest')
	return (
		<div>
			<div className="mb-2 flex items-center gap-3 pl-1">
				<span className="bg-foreground text-background grid size-8 place-items-center rounded-full">
					<Icon name="check" className="size-4" />
				</span>
				<div>
					<p className="text-foreground font-semibold">{athlete.event.name}</p>
					<p className="text-muted-foreground text-xs">
						Summit · {fmtDate(athlete.event.date)} · projected fitness{' '}
						{athlete.overview.peakProjected}
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
									background: state === 'future' ? 'var(--muted)' : ph.color,
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
											<Icon name="check" className="size-4 text-emerald-500" />
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
		</div>
	)
}

function Ascent({ athlete }: { athlete: MockAthlete }) {
	const { overview } = athlete
	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-3xl space-y-6">
				<PageHeader name={athlete.name} trailing={<NewSessionButton />} />

				{/* Compact readiness + countdown */}
				<section
					className={cn(
						'flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-l-4 p-4',
						FORM_WASH[overview.formTone],
						FORM_RULE[overview.formTone],
					)}
				>
					<div className="flex items-baseline gap-3">
						<span
							className={cn(
								'text-3xl font-semibold tabular-nums',
								FORM_TONE[overview.formTone],
							)}
						>
							{signed(overview.form)}
						</span>
						<div>
							<p className={cn('font-semibold', FORM_TONE[overview.formTone])}>
								Form · {overview.formLabel}
							</p>
							<p className="text-muted-foreground max-w-md text-xs">
								{overview.formAdvice}
							</p>
						</div>
					</div>
					<div className="text-right">
						<p className="text-foreground text-2xl font-semibold tabular-nums">
							{athlete.event.daysOut}d
						</p>
						<p className="text-muted-foreground text-xs">
							to {athlete.event.name}
						</p>
					</div>
				</section>

				<Tile title="Progression · fitness to race">
					<FitnessJourney athlete={athlete} markers={ledgerMarkers(athlete)} />
				</Tile>

				<Tile title="The climb to race day">
					<ClimbPhases athlete={athlete} />
				</Tile>

				<Tile title="Session ledger">
					<LedgerTable ledger={athlete.ledger} />
				</Tile>

				<Tile title="Personal records · this block">
					<PRChips prs={athlete.prs} />
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
	if (variant === 'cockpit') return <Cockpit athlete={athlete} />
	if (variant === 'ascent') return <Ascent athlete={athlete} />
	return <Focus athlete={athlete} />
}

// NOTES — open question this prototype answers:
//   "What's the optimal road-to-race home — Form-led, goal-anchored, with
//    progression, comparison, a legible week, and the dense ledger?"
//   Verdict: <pending — pick one (or a mashup), then fold into _home/index.tsx
//   and delete this file + the mock data. Note: pace/HR/power targets, PRs and
//   the fitness *projection* need modelling the live loader doesn't have yet.>
