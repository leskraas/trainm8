import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { PrototypeSwitcher } from '#app/components/prototype-switcher.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatDate } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import { type Route } from './+types/plan.manual-prototype.ts'

// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE — wayfinder ticket #366: "How should manual planning look and feel?"
//
// Three variants of a manual Plan Outline authoring surface, switchable via
// `?variant=` on this throwaway route (/training/plan/manual-prototype).
// Sub-shape B (new page): manual planning has no existing host page — the
// AI wizard at /training/plan/new is a different flow, and the goal step here
// precedes the Event detail page existing.
//
//   A — "Season canvas": ONE zoomable surface. Macro band → click a phase to
//       zoom its weeks → click a week to zoom its days. Drill-in-place.
//   B — "Guided studio": SEPARATE view per cycle level, as wizard steps:
//       Goal → Phases (macro) → Weeks (meso) → Stamp patterns (micro).
//   C — "ATP grid": intervals.icu/TrainingPeaks-style spreadsheet — every week
//       of the season as a table row, inline editing, pattern panel alongside.
//   D — "Load sculptor": the season is ONE editable load curve — drag a week's
//       point up or down to sculpt volume directly. Chart-first planning.
//   E — "Pattern deck": tactile card metaphor — deal week-pattern cards onto
//       phase shelves (drag-and-drop or tap-to-arm) to stamp their weeks.
//
// All edits are in-memory only. Nothing persists. Delete this file when #366
// is resolved.
// ─────────────────────────────────────────────────────────────────────────────

export const meta: Route.MetaFunction = () => [
	{ title: 'PROTOTYPE · Manual Plan | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// Real upcoming Events ground the goal step ("what are you building
	// toward?"); everything downstream is in-memory prototype state.
	const events = await prisma.event.findMany({
		where: {
			athleteId: userId,
			status: 'planned',
			startDate: { gt: new Date() },
		},
		orderBy: { startDate: 'asc' },
		select: {
			id: true,
			name: true,
			startDate: true,
			kind: true,
			priority: true,
		},
	})
	return {
		events: events.map((e) => ({
			...e,
			startDate: e.startDate.toISOString(),
		})),
	}
}

// ── Prototype domain model (in-memory only) ─────────────────────────────────

type PhaseDraft = {
	id: string
	name: string
	weeks: number
	weeklyLoadHours: number
}

type WeekType = 'loading' | 'recovery' | 'taper'

type WeekDraft = {
	index: number // 1-based across the whole plan
	phaseId: string
	phaseName: string
	type: WeekType
	targetHours: number
	patternId: string | null
}

type PatternSession = {
	day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
	title: string
	discipline: 'run' | 'ride' | 'swim' | 'strength'
	durationMin: number
	tss: number | null // null = Unavailable Metric (strength) — never counts
}

type WeekPattern = {
	id: string
	name: string
	sessions: PatternSession[]
}

const DEFAULT_PHASES: PhaseDraft[] = [
	{ id: 'base', name: 'Base', weeks: 4, weeklyLoadHours: 6 },
	{ id: 'build', name: 'Build', weeks: 3, weeklyLoadHours: 8 },
	{ id: 'peak', name: 'Peak', weeks: 2, weeklyLoadHours: 9 },
	{ id: 'taper', name: 'Taper', weeks: 1, weeklyLoadHours: 4 },
]

const PATTERNS: WeekPattern[] = [
	{
		id: 'quality-run',
		name: 'Quality run week',
		sessions: [
			{
				day: 'Mon',
				title: 'Strength — full body',
				discipline: 'strength',
				durationMin: 45,
				tss: null,
			},
			{
				day: 'Tue',
				title: 'Intervals 6×3 min',
				discipline: 'run',
				durationMin: 55,
				tss: 70,
			},
			{
				day: 'Thu',
				title: 'Easy run',
				discipline: 'run',
				durationMin: 45,
				tss: 45,
			},
			{
				day: 'Sat',
				title: 'Long run',
				discipline: 'run',
				durationMin: 100,
				tss: 110,
			},
			{
				day: 'Sun',
				title: 'Recovery spin',
				discipline: 'ride',
				durationMin: 40,
				tss: 30,
			},
		],
	},
	{
		id: 'base-strength',
		name: 'Base + strength',
		sessions: [
			{
				day: 'Mon',
				title: 'Strength — lower body',
				discipline: 'strength',
				durationMin: 50,
				tss: null,
			},
			{
				day: 'Wed',
				title: 'Steady run',
				discipline: 'run',
				durationMin: 60,
				tss: 60,
			},
			{
				day: 'Fri',
				title: 'Strength — upper body',
				discipline: 'strength',
				durationMin: 40,
				tss: null,
			},
			{
				day: 'Sat',
				title: 'Long easy run',
				discipline: 'run',
				durationMin: 90,
				tss: 90,
			},
		],
	},
	{
		id: 'multi',
		name: 'Multisport mix',
		sessions: [
			{
				day: 'Tue',
				title: 'Swim technique',
				discipline: 'swim',
				durationMin: 45,
				tss: 40,
			},
			{
				day: 'Wed',
				title: 'Tempo ride',
				discipline: 'ride',
				durationMin: 75,
				tss: 80,
			},
			{
				day: 'Thu',
				title: 'Strength — core',
				discipline: 'strength',
				durationMin: 30,
				tss: null,
			},
			{
				day: 'Sat',
				title: 'Long ride',
				discipline: 'ride',
				durationMin: 150,
				tss: 130,
			},
			{
				day: 'Sun',
				title: 'Brick run',
				discipline: 'run',
				durationMin: 30,
				tss: 35,
			},
		],
	},
]

const DISCIPLINE_ICON: Record<PatternSession['discipline'], string> = {
	run: '🏃',
	ride: '🚴',
	swim: '🏊',
	strength: '🏋',
}

const PHASE_COLORS: Record<string, string> = {
	Base: 'bg-sky-500/80',
	Build: 'bg-emerald-500/80',
	Peak: 'bg-amber-500/80',
	Taper: 'bg-rose-400/80',
}

function phaseColor(name: string) {
	return PHASE_COLORS[name] ?? 'bg-zinc-400/80'
}

// SVG rects need fill-* classes; bg-* only sets background-color (variant D).
const PHASE_FILLS: Record<string, string> = {
	Base: 'fill-sky-500',
	Build: 'fill-emerald-500',
	Peak: 'fill-amber-500',
	Taper: 'fill-rose-400',
}

function phaseFill(name: string) {
	return PHASE_FILLS[name] ?? 'fill-zinc-400'
}

/**
 * Derive the season's Training Weeks from the authored phases + recovery
 * cadence. Loading weeks carry the phase target; every Nth week is a recovery
 * week at a % cut; a phase named "Taper" decays week over week (hold
 * intensity, cut volume — the volume-only taper from the #363 research).
 */
function deriveWeeks(
	phases: PhaseDraft[],
	cadence: 3 | 2,
	recoveryCutPct: number,
	overrides: Record<number, number>,
	patternByPhase: Record<string, string | null>,
): WeekDraft[] {
	const weeks: WeekDraft[] = []
	let index = 0
	for (const phase of phases) {
		const isTaper = /taper/i.test(phase.name)
		for (let i = 0; i < phase.weeks; i++) {
			index++
			let type: WeekType = 'loading'
			let target = phase.weeklyLoadHours
			if (isTaper) {
				type = 'taper'
				target = Math.round(phase.weeklyLoadHours * Math.pow(0.6, i) * 10) / 10
			} else if ((i + 1) % (cadence + 1) === 0) {
				type = 'recovery'
				target =
					Math.round(phase.weeklyLoadHours * (1 - recoveryCutPct / 100) * 10) /
					10
			}
			weeks.push({
				index,
				phaseId: phase.id,
				phaseName: phase.name,
				type,
				targetHours: overrides[index] ?? target,
				patternId: patternByPhase[phase.id] ?? null,
			})
		}
	}
	return weeks
}

const HOURS_TO_TSS = 60 // Fitness Projection's ≈60 TSS per endurance hour

function weekTss(w: WeekDraft) {
	return Math.round(w.targetHours * HOURS_TO_TSS)
}

function patternPlannedTss(p: WeekPattern) {
	return p.sessions.reduce((sum, s) => sum + (s.tss ?? 0), 0)
}

/** One shared in-memory plan draft; each variant renders/edits it its own way. */
function usePlanDraft(events: LoaderEvent[]) {
	const [goalEventId, setGoalEventId] = useState<string | null>(
		events[0]?.id ?? null,
	)
	const [goalDraft, setGoalDraft] = useState({ name: '', date: '' })
	const [phases, setPhases] = useState<PhaseDraft[]>(DEFAULT_PHASES)
	const [cadence, setCadence] = useState<3 | 2>(3)
	const [recoveryCutPct, setRecoveryCutPct] = useState(30)
	const [overrides, setOverrides] = useState<Record<number, number>>({})
	const [patternByPhase, setPatternByPhase] = useState<
		Record<string, string | null>
	>({})

	const goalEvent = events.find((e) => e.id === goalEventId) ?? null
	const goalLabel = goalEvent
		? goalEvent.name
		: goalDraft.name
			? `${goalDraft.name} (Goal event)`
			: 'No goal yet'
	const goalDate = goalEvent?.startDate ?? (goalDraft.date || null)

	const weeks = useMemo(
		() =>
			deriveWeeks(phases, cadence, recoveryCutPct, overrides, patternByPhase),
		[phases, cadence, recoveryCutPct, overrides, patternByPhase],
	)

	function updatePhase(id: string, patch: Partial<PhaseDraft>) {
		setPhases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
	}
	function setWeekTarget(index: number, hours: number) {
		setOverrides((prev) => ({ ...prev, [index]: hours }))
	}
	function stampPattern(phaseId: string, patternId: string | null) {
		setPatternByPhase((prev) => ({ ...prev, [phaseId]: patternId }))
	}

	return {
		events,
		goalEventId,
		setGoalEventId,
		goalDraft,
		setGoalDraft,
		goalLabel,
		goalDate,
		phases,
		updatePhase,
		cadence,
		setCadence,
		recoveryCutPct,
		setRecoveryCutPct,
		weeks,
		setWeekTarget,
		patternByPhase,
		stampPattern,
	}
}

type LoaderEvent = Route.ComponentProps['loaderData']['events'][number]
type PlanDraft = ReturnType<typeof usePlanDraft>

// ── Route: variant switcher ─────────────────────────────────────────────────

const VARIANTS = [
	{ key: 'A', name: 'Season canvas — one zoomable surface' },
	{ key: 'B', name: 'Guided studio — a view per cycle level' },
	{ key: 'C', name: 'ATP grid — spreadsheet season' },
	{ key: 'D', name: 'Load sculptor — drag the season curve' },
	{ key: 'E', name: 'Pattern deck — deal weeks onto the season' },
]

export default function ManualPlanPrototype({
	loaderData,
}: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const variant = searchParams.get('variant') ?? 'A'
	const draft = usePlanDraft(loaderData.events)

	return (
		<main className="container mx-auto max-w-5xl pt-6 pb-24 md:pt-8">
			<PageHeader
				title="Manual plan (prototype)"
				back={{ to: '/', label: 'Home' }}
				className="mb-2"
			/>
			<p className="text-muted-foreground mb-6 text-sm">
				Throwaway prototype for ticket #366 — nothing here saves.
			</p>
			{variant === 'A' ? <VariantSeasonCanvas draft={draft} /> : null}
			{variant === 'B' ? <VariantGuidedStudio draft={draft} /> : null}
			{variant === 'C' ? <VariantAtpGrid draft={draft} /> : null}
			{variant === 'D' ? <VariantLoadSculptor draft={draft} /> : null}
			{variant === 'E' ? <VariantPatternDeck draft={draft} /> : null}
			<PrototypeSwitcher variants={VARIANTS} current={variant} />
		</main>
	)
}

// ── Shared bits (kept deliberately small — layout stays per-variant) ────────

function WeekTypeBadge({ type }: { type: WeekType }) {
	const styles: Record<WeekType, string> = {
		loading: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
		recovery: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		taper: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
	}
	const labels: Record<WeekType, string> = {
		loading: 'Loading',
		recovery: 'Recovery',
		taper: 'Taper',
	}
	return (
		<span
			className={cn(
				'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
				styles[type],
			)}
		>
			{labels[type]}
		</span>
	)
}

/** The micro view: a stamped Training Week, Mon–Sun, with honest strength
 * (Unavailable Metric) handling. Shared because every variant needs to show
 * the same truth about stamping. */
function StampedWeek({ week }: { week: WeekDraft }) {
	const pattern = PATTERNS.find((p) => p.id === week.patternId) ?? null
	const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
	const target = weekTss(week)
	const planned = pattern ? patternPlannedTss(pattern) : 0
	return (
		<div>
			{pattern ? (
				<>
					<div className="grid grid-cols-7 gap-1.5">
						{days.map((day) => {
							const session = pattern.sessions.find((s) => s.day === day)
							return (
								<div
									key={day}
									className={cn(
										'min-h-20 rounded-md border p-1.5 text-[11px]',
										session ? 'bg-card' : 'bg-muted/40 border-dashed',
									)}
								>
									<div className="text-muted-foreground mb-1 font-medium">
										{day}
									</div>
									{session ? (
										<div>
											<div className="leading-tight">
												{DISCIPLINE_ICON[session.discipline]} {session.title}
											</div>
											<div className="text-muted-foreground mt-0.5">
												{session.durationMin} min ·{' '}
												{session.tss != null ? (
													`${session.tss} TSS`
												) : (
													<span className="italic">no TSS</span>
												)}
											</div>
										</div>
									) : (
										<span className="text-muted-foreground/60">Rest</span>
									)}
								</div>
							)
						})}
					</div>
					<p className="text-muted-foreground mt-2 text-xs">
						Planned <strong>{planned} TSS</strong> of a {target} TSS target.
						Strength sessions carry no TSS and{' '}
						<strong>don't count toward the week's load target</strong>. Stamping
						creates standalone sessions — editing this week never changes its
						siblings.
					</p>
				</>
			) : (
				<p className="text-muted-foreground text-sm">
					No week pattern stamped on {week.phaseName} yet.
				</p>
			)}
		</div>
	)
}

function GoalLine({
	draft,
	onChange,
}: {
	draft: PlanDraft
	onChange?: () => void
}) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<span className="text-muted-foreground text-sm">Building toward</span>
			<span className="font-semibold">{draft.goalLabel}</span>
			{draft.goalDate ? (
				<span className="text-muted-foreground text-sm">
					· {formatDate(draft.goalDate, 'UTC')}
				</span>
			) : null}
			{onChange ? (
				<button
					type="button"
					onClick={onChange}
					className="text-primary text-sm underline underline-offset-2"
				>
					change
				</button>
			) : null}
		</div>
	)
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT A — "Season canvas": one zoomable surface. The whole macro→meso→micro
// nest lives on one page; clicking drills in place. Would live as a new route
// opened from the Plan chip / Target Event detail.
// ═════════════════════════════════════════════════════════════════════════════

function VariantSeasonCanvas({ draft }: { draft: PlanDraft }) {
	const [selectedPhaseId, setSelectedPhaseId] = useState<string>(
		draft.phases[0]?.id ?? 'base',
	)
	const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(
		null,
	)
	const [showGoalPicker, setShowGoalPicker] = useState(false)

	const totalWeeks = draft.phases.reduce((sum, p) => sum + p.weeks, 0)
	const selectedPhase =
		draft.phases.find((p) => p.id === selectedPhaseId) ?? draft.phases[0]!
	const phaseWeeks = draft.weeks.filter((w) => w.phaseId === selectedPhaseId)
	const selectedWeek =
		draft.weeks.find((w) => w.index === selectedWeekIndex) ?? null
	const maxHours = Math.max(...draft.weeks.map((w) => w.targetHours), 1)

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardContent className="pt-6">
					<GoalLine
						draft={draft}
						onChange={() => setShowGoalPicker((v) => !v)}
					/>
					{showGoalPicker ? (
						<GoalPickerInline
							draft={draft}
							onDone={() => setShowGoalPicker(false)}
						/>
					) : null}
				</CardContent>
			</Card>

			{/* Macro: the season band, widths proportional to phase length */}
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">
						Season · {totalWeeks} weeks
					</CardTitle>
					<CardDescription>
						Tap a phase to zoom into its weeks. Adjust length and weekly load in
						place.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex h-16 w-full gap-1 overflow-hidden rounded-lg">
						{draft.phases.map((phase) => (
							<button
								key={phase.id}
								type="button"
								onClick={() => {
									setSelectedPhaseId(phase.id)
									setSelectedWeekIndex(null)
								}}
								style={{ flexGrow: phase.weeks }}
								className={cn(
									'flex min-w-0 flex-col items-center justify-center text-white transition',
									phaseColor(phase.name),
									phase.id === selectedPhaseId
										? 'ring-primary ring-2 ring-offset-2'
										: 'opacity-80 hover:opacity-100',
								)}
							>
								<span className="truncate px-1 text-sm font-semibold">
									{phase.name}
								</span>
								<span className="text-xs opacity-90">
									{phase.weeks} wk · {phase.weeklyLoadHours} h
								</span>
							</button>
						))}
						<div className="flex w-10 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
							🏁
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Meso: the selected phase's weeks as editable load bars */}
			<Card>
				<CardHeader className="pb-2">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="text-base">
							{selectedPhase.name} · week by week
						</CardTitle>
						<div className="flex items-center gap-3 text-sm">
							<Stepper
								label="Length"
								value={selectedPhase.weeks}
								unit="wk"
								onChange={(v) =>
									draft.updatePhase(selectedPhase.id, { weeks: Math.max(1, v) })
								}
							/>
							<Stepper
								label="Load"
								value={selectedPhase.weeklyLoadHours}
								unit="h/wk"
								onChange={(v) =>
									draft.updatePhase(selectedPhase.id, {
										weeklyLoadHours: Math.max(1, v),
									})
								}
							/>
							<button
								type="button"
								onClick={() => draft.setCadence(draft.cadence === 3 ? 2 : 3)}
								className="border-input rounded-md border px-2 py-1 text-xs"
							>
								{draft.cadence}:1 recovery
							</button>
						</div>
					</div>
					<CardDescription>
						Every {draft.cadence + 1}th week recovers at −{draft.recoveryCutPct}
						%. Tap a week to zoom into its days.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-end gap-2">
						{phaseWeeks.map((week) => (
							<button
								key={week.index}
								type="button"
								onClick={() =>
									setSelectedWeekIndex(
										selectedWeekIndex === week.index ? null : week.index,
									)
								}
								className="group flex flex-1 flex-col items-center gap-1"
							>
								<span className="text-muted-foreground text-xs tabular-nums">
									{week.targetHours}h
								</span>
								<div
									className={cn(
										'w-full rounded-t-md transition',
										week.type === 'recovery'
											? 'bg-sky-400/70'
											: week.type === 'taper'
												? 'bg-rose-400/70'
												: 'bg-emerald-500/80',
										week.index === selectedWeekIndex
											? 'ring-primary ring-2'
											: 'group-hover:opacity-80',
									)}
									style={{
										height: `${(week.targetHours / maxHours) * 96 + 8}px`,
									}}
								/>
								<span className="text-xs font-medium">W{week.index}</span>
								<WeekTypeBadge type={week.type} />
							</button>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Micro: the selected week's days */}
			{selectedWeek ? (
				<Card>
					<CardHeader className="pb-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle className="text-base">
								Week {selectedWeek.index} · {weekTss(selectedWeek)} TSS target
							</CardTitle>
							<PatternSelect
								value={selectedWeek.patternId}
								onChange={(id) => draft.stampPattern(selectedWeek.phaseId, id)}
								stampLabel={`Stamp across ${selectedWeek.phaseName}`}
							/>
						</div>
					</CardHeader>
					<CardContent>
						<StampedWeek week={selectedWeek} />
					</CardContent>
				</Card>
			) : null}
		</div>
	)
}

function Stepper({
	label,
	value,
	unit,
	onChange,
}: {
	label: string
	value: number
	unit: string
	onChange: (v: number) => void
}) {
	return (
		<span className="flex items-center gap-1 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<button
				type="button"
				onClick={() => onChange(value - 1)}
				className="border-input grid size-6 place-items-center rounded border"
			>
				<Icon name="minus" size="xs" />
			</button>
			<span className="min-w-10 text-center tabular-nums">
				{value} {unit}
			</span>
			<button
				type="button"
				onClick={() => onChange(value + 1)}
				className="border-input grid size-6 place-items-center rounded border"
			>
				<Icon name="plus" size="xs" />
			</button>
		</span>
	)
}

function PatternSelect({
	value,
	onChange,
	stampLabel,
}: {
	value: string | null
	onChange: (id: string | null) => void
	stampLabel: string
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{PATTERNS.map((p) => (
				<Button
					key={p.id}
					type="button"
					size="sm"
					variant={value === p.id ? 'default' : 'outline'}
					onClick={() => onChange(value === p.id ? null : p.id)}
					title={stampLabel}
				>
					{p.name}
				</Button>
			))}
		</div>
	)
}

function GoalPickerInline({
	draft,
	onDone,
}: {
	draft: PlanDraft
	onDone: () => void
}) {
	return (
		<div className="mt-3 flex flex-col gap-2 rounded-md border p-3">
			{draft.events.map((event) => (
				<button
					key={event.id}
					type="button"
					onClick={() => {
						draft.setGoalEventId(event.id)
						onDone()
					}}
					className={cn(
						'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm',
						draft.goalEventId === event.id && 'border-primary',
					)}
				>
					<span>
						{event.name}{' '}
						<Badge variant="outline" className="ml-1">
							{event.priority}
						</Badge>
					</span>
					<span className="text-muted-foreground">
						{formatDate(event.startDate, 'UTC')}
					</span>
				</button>
			))}
			<GoalEventForm draft={draft} onDone={onDone} compact />
		</div>
	)
}

function GoalEventForm({
	draft,
	onDone,
	compact,
}: {
	draft: PlanDraft
	onDone: () => void
	compact?: boolean
}) {
	return (
		<div
			className={cn(
				'flex flex-col gap-2 rounded-md border border-dashed p-3',
				!compact && 'p-4',
			)}
		>
			<span className="text-sm font-medium">…or set a goal instead</span>
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					placeholder="e.g. Sub-20 5K shape"
					value={draft.goalDraft.name}
					onChange={(e) =>
						draft.setGoalDraft({ ...draft.goalDraft, name: e.target.value })
					}
				/>
				<Input
					type="date"
					className="sm:w-44"
					value={draft.goalDraft.date}
					onChange={(e) =>
						draft.setGoalDraft({ ...draft.goalDraft, date: e.target.value })
					}
				/>
				<Button
					type="button"
					variant="secondary"
					disabled={!draft.goalDraft.name || !draft.goalDraft.date}
					onClick={() => {
						draft.setGoalEventId(null)
						onDone()
					}}
				>
					Set goal
				</Button>
			</div>
			<p className="text-muted-foreground text-xs">
				This creates a <strong>Goal event</strong> on your calendar — your plan
				anchors to it exactly like a race.
			</p>
		</div>
	)
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT B — "Guided studio": a separate view per cycle level, as wizard
// steps. Goal → Phases (macro) → Weeks (meso) → Stamp (micro). Would live at
// /training/plan/manual, linked from the Create menu next to "Generate plan".
// ═════════════════════════════════════════════════════════════════════════════

const STUDIO_STEPS = [
	{ key: 'goal', label: '1 · Goal' },
	{ key: 'phases', label: '2 · Phases' },
	{ key: 'weeks', label: '3 · Weekly loads' },
	{ key: 'stamp', label: '4 · Fill the weeks' },
] as const

type StudioStep = (typeof STUDIO_STEPS)[number]['key']

function VariantGuidedStudio({ draft }: { draft: PlanDraft }) {
	const [step, setStep] = useState<StudioStep>('goal')
	const stepIdx = STUDIO_STEPS.findIndex((s) => s.key === step)

	return (
		<div className="flex flex-col gap-4">
			<nav className="flex gap-1 overflow-x-auto rounded-lg border p-1">
				{STUDIO_STEPS.map((s, i) => (
					<button
						key={s.key}
						type="button"
						onClick={() => setStep(s.key)}
						className={cn(
							'flex-1 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap',
							s.key === step
								? 'bg-primary text-primary-foreground'
								: i < stepIdx
									? 'text-foreground'
									: 'text-muted-foreground',
						)}
					>
						{i < stepIdx ? (
							<Icon name="check" size="xs" className="mr-1" />
						) : null}
						{s.label}
					</button>
				))}
			</nav>

			{step === 'goal' ? <StudioGoalStep draft={draft} /> : null}
			{step === 'phases' ? <StudioPhasesStep draft={draft} /> : null}
			{step === 'weeks' ? <StudioWeeksStep draft={draft} /> : null}
			{step === 'stamp' ? <StudioStampStep draft={draft} /> : null}

			<div className="flex justify-between">
				<Button
					type="button"
					variant="outline"
					disabled={stepIdx === 0}
					onClick={() => setStep(STUDIO_STEPS[stepIdx - 1]!.key)}
				>
					<Icon name="arrow-left" size="sm" className="mr-1" /> Back
				</Button>
				{stepIdx < STUDIO_STEPS.length - 1 ? (
					<Button
						type="button"
						onClick={() => setStep(STUDIO_STEPS[stepIdx + 1]!.key)}
					>
						Continue <Icon name="arrow-right" size="sm" className="ml-1" />
					</Button>
				) : (
					<Button type="button" disabled title="Prototype — nothing saves">
						Save plan
					</Button>
				)}
			</div>
		</div>
	)
}

function StudioGoalStep({ draft }: { draft: PlanDraft }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>What are you building toward?</CardTitle>
				<CardDescription>
					Every plan anchors to an event — a race you've entered, or a goal you
					set yourself.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{draft.events.map((event) => (
					<button
						key={event.id}
						type="button"
						onClick={() => draft.setGoalEventId(event.id)}
						className={cn(
							'flex items-center justify-between rounded-lg border p-4 text-left',
							draft.goalEventId === event.id
								? 'border-primary bg-primary/5'
								: 'hover:bg-muted/50',
						)}
					>
						<div>
							<div className="font-medium">{event.name}</div>
							<div className="text-muted-foreground text-sm">
								{event.kind === 'race' ? 'Race' : event.kind} · priority{' '}
								{event.priority}
							</div>
						</div>
						<span className="text-muted-foreground text-sm">
							{formatDate(event.startDate, 'UTC')}
						</span>
					</button>
				))}
				<GoalEventForm draft={draft} onDone={() => {}} />
			</CardContent>
		</Card>
	)
}

function StudioPhasesStep({ draft }: { draft: PlanDraft }) {
	const totalWeeks = draft.phases.reduce((s, p) => s + p.weeks, 0)
	return (
		<Card>
			<CardHeader>
				<CardTitle>Shape the season</CardTitle>
				<CardDescription>
					Phases run backward from {draft.goalLabel}. {totalWeeks} weeks total.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-md">
					{draft.phases.map((phase) => (
						<div
							key={phase.id}
							style={{ flexGrow: phase.weeks }}
							className={cn(
								'flex items-center justify-center text-xs font-medium text-white',
								phaseColor(phase.name),
							)}
						>
							{phase.name}
						</div>
					))}
				</div>
				{draft.phases.map((phase) => (
					<div
						key={phase.id}
						className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-b-0"
					>
						<div className="flex items-center gap-2">
							<span
								className={cn('size-3 rounded-full', phaseColor(phase.name))}
							/>
							<span className="font-medium">{phase.name}</span>
						</div>
						<div className="flex items-center gap-4">
							<Stepper
								label="Length"
								value={phase.weeks}
								unit="wk"
								onChange={(v) =>
									draft.updatePhase(phase.id, { weeks: Math.max(1, v) })
								}
							/>
							<Stepper
								label="Load"
								value={phase.weeklyLoadHours}
								unit="h/wk"
								onChange={(v) =>
									draft.updatePhase(phase.id, {
										weeklyLoadHours: Math.max(1, v),
									})
								}
							/>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	)
}

function StudioWeeksStep({ draft }: { draft: PlanDraft }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Weekly load targets</CardTitle>
				<CardDescription>
					Derived from your phases and recovery rhythm — override any week
					directly.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-4 text-sm">
					<div className="flex items-center gap-2">
						<span id="cadence-label">Recovery rhythm</span>
						<Select
							value={String(draft.cadence)}
							onValueChange={(value) =>
								draft.setCadence(Number(value) as 3 | 2)
							}
						>
							<SelectTrigger aria-labelledby="cadence-label" className="w-64">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="3">
									3:1 — three loading, one recovery
								</SelectItem>
								<SelectItem value="2">
									2:1 — two loading, one recovery
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<label className="flex items-center gap-2">
						Recovery cut
						<Input
							type="number"
							className="w-20"
							value={draft.recoveryCutPct}
							onChange={(e) => draft.setRecoveryCutPct(Number(e.target.value))}
						/>
						%
					</label>
				</div>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{draft.weeks.map((week) => (
						<div
							key={week.index}
							className={cn(
								'rounded-md border p-2',
								week.type === 'recovery' && 'bg-sky-500/5',
								week.type === 'taper' && 'bg-rose-500/5',
							)}
						>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">W{week.index}</span>
								<WeekTypeBadge type={week.type} />
							</div>
							<div className="text-muted-foreground text-xs">
								{week.phaseName}
							</div>
							<div className="mt-1 flex items-center gap-1">
								<Input
									type="number"
									step="0.5"
									className="h-8 w-16"
									value={week.targetHours}
									onChange={(e) =>
										draft.setWeekTarget(week.index, Number(e.target.value))
									}
								/>
								<span className="text-muted-foreground text-xs">
									h · {weekTss(week)} TSS
								</span>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	)
}

function StudioStampStep({ draft }: { draft: PlanDraft }) {
	const [previewPhaseId, setPreviewPhaseId] = useState(
		draft.phases[0]?.id ?? '',
	)
	const previewWeek =
		draft.weeks.find((w) => w.phaseId === previewPhaseId) ?? null
	return (
		<Card>
			<CardHeader>
				<CardTitle>Fill the weeks</CardTitle>
				<CardDescription>
					Author a week pattern once, stamp it across a phase. Stamping creates
					standalone sessions you edit like any other — no live link back.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{draft.phases.map((phase) => {
					const stamped = draft.patternByPhase[phase.id] ?? null
					return (
						<div
							key={phase.id}
							className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
						>
							<div className="flex items-center gap-2">
								<span
									className={cn('size-3 rounded-full', phaseColor(phase.name))}
								/>
								<span className="font-medium">{phase.name}</span>
								<span className="text-muted-foreground text-sm">
									{phase.weeks} wk
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								{PATTERNS.map((p) => (
									<Button
										key={p.id}
										type="button"
										size="sm"
										variant={stamped === p.id ? 'default' : 'outline'}
										onClick={() => {
											draft.stampPattern(
												phase.id,
												stamped === p.id ? null : p.id,
											)
											setPreviewPhaseId(phase.id)
										}}
									>
										{p.name}
									</Button>
								))}
							</div>
							{stamped ? (
								<p className="text-muted-foreground w-full text-xs">
									Stamps {phase.weeks} ×{' '}
									{PATTERNS.find((p) => p.id === stamped)?.sessions.length}{' '}
									standalone sessions across {phase.name}.
								</p>
							) : null}
						</div>
					)
				})}
				{previewWeek ? (
					<div>
						<h3 className="mb-2 text-sm font-medium">
							Preview · week {previewWeek.index} ({previewWeek.phaseName})
						</h3>
						<StampedWeek week={previewWeek} />
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT C — "ATP grid": the intervals.icu / TrainingPeaks shape — every week
// of the season as a spreadsheet row, inline edits, expandable week detail.
// Would live embedded on the Target Event detail page as a "Plan" section.
// ═════════════════════════════════════════════════════════════════════════════

function VariantAtpGrid({ draft }: { draft: PlanDraft }) {
	const [expandedWeek, setExpandedWeek] = useState<number | null>(null)
	const maxHours = Math.max(...draft.weeks.map((w) => w.targetHours), 1)

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
					<GoalLine draft={draft} />
					<div className="flex items-center gap-3 text-sm">
						<button
							type="button"
							onClick={() => draft.setCadence(draft.cadence === 3 ? 2 : 3)}
							className="border-input rounded-md border px-2 py-1 text-xs"
						>
							{draft.cadence}:1 · −{draft.recoveryCutPct}% recovery
						</button>
						<span className="text-muted-foreground text-xs">
							{draft.weeks.length} weeks ·{' '}
							{Math.round(draft.weeks.reduce((s, w) => s + w.targetHours, 0))} h
							total
						</span>
					</div>
				</CardContent>
			</Card>

			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full min-w-[640px] text-sm">
					<thead>
						<tr className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
							<th className="px-3 py-2">Wk</th>
							<th className="px-3 py-2">Phase</th>
							<th className="px-3 py-2">Type</th>
							<th className="px-3 py-2">Target</th>
							<th className="w-1/3 px-3 py-2">Load</th>
							<th className="px-3 py-2">Week pattern</th>
							<th className="px-3 py-2" />
						</tr>
					</thead>
					<tbody>
						{draft.weeks.map((week) => {
							const pattern = PATTERNS.find((p) => p.id === week.patternId)
							const expanded = expandedWeek === week.index
							return (
								<WeekRow
									key={week.index}
									week={week}
									pattern={pattern ?? null}
									expanded={expanded}
									maxHours={maxHours}
									draft={draft}
									onToggle={() => setExpandedWeek(expanded ? null : week.index)}
								/>
							)
						})}
					</tbody>
				</table>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Week patterns</CardTitle>
					<CardDescription>
						Reusable microcycles — stamp one across a phase from any row above.
						Stamped sessions are standalone; later edits stay per-week.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-3">
					{PATTERNS.map((p) => (
						<div key={p.id} className="rounded-md border p-3">
							<div className="mb-1 font-medium">{p.name}</div>
							<ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
								{p.sessions.map((s) => (
									<li key={s.day + s.title}>
										{s.day} · {DISCIPLINE_ICON[s.discipline]} {s.title}{' '}
										{s.tss != null ? `(${s.tss} TSS)` : '(no TSS)'}
									</li>
								))}
							</ul>
							<div className="text-muted-foreground mt-2 text-xs">
								{patternPlannedTss(p)} TSS/week · strength uncounted
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	)
}

function WeekRow({
	week,
	pattern,
	expanded,
	maxHours,
	draft,
	onToggle,
}: {
	week: WeekDraft
	pattern: WeekPattern | null
	expanded: boolean
	maxHours: number
	draft: PlanDraft
	onToggle: () => void
}) {
	return (
		<>
			<tr
				className={cn(
					'border-t',
					week.type === 'recovery' && 'bg-sky-500/5',
					week.type === 'taper' && 'bg-rose-500/5',
				)}
			>
				<td className="px-3 py-1.5 font-medium tabular-nums">{week.index}</td>
				<td className="px-3 py-1.5">
					<span className="flex items-center gap-1.5">
						<span
							className={cn(
								'size-2.5 rounded-full',
								phaseColor(week.phaseName),
							)}
						/>
						{week.phaseName}
					</span>
				</td>
				<td className="px-3 py-1.5">
					<WeekTypeBadge type={week.type} />
				</td>
				<td className="px-3 py-1.5">
					<span className="flex items-center gap-1">
						<Input
							type="number"
							step="0.5"
							className="h-7 w-16 text-sm"
							value={week.targetHours}
							onChange={(e) =>
								draft.setWeekTarget(week.index, Number(e.target.value))
							}
						/>
						<span className="text-muted-foreground text-xs whitespace-nowrap">
							h · {weekTss(week)} TSS
						</span>
					</span>
				</td>
				<td className="px-3 py-1.5">
					<div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
						<div
							className={cn(
								'h-full rounded-full',
								week.type === 'recovery'
									? 'bg-sky-400'
									: week.type === 'taper'
										? 'bg-rose-400'
										: 'bg-emerald-500',
							)}
							style={{ width: `${(week.targetHours / maxHours) * 100}%` }}
						/>
					</div>
				</td>
				<td className="px-3 py-1.5">
					<Select
						value={week.patternId ?? ''}
						onValueChange={(value) =>
							draft.stampPattern(week.phaseId, (value as string) || null)
						}
					>
						<SelectTrigger
							aria-label={`Week pattern — stamps across all of ${week.phaseName}`}
							className="w-full"
						>
							<SelectValue>
								{(value) =>
									value
										? (PATTERNS.find((p) => p.id === value)?.name ?? '')
										: '— none —'
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">— none —</SelectItem>
							{PATTERNS.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</td>
				<td className="px-3 py-1.5">
					<button
						type="button"
						onClick={onToggle}
						className="text-muted-foreground hover:bg-muted grid size-7 place-items-center rounded"
						aria-label={expanded ? 'Collapse week' : 'Expand week'}
					>
						<Icon name={expanded ? 'chevron-up' : 'chevron-down'} size="sm" />
					</button>
				</td>
			</tr>
			{expanded ? (
				<tr className="border-t">
					<td colSpan={7} className="bg-muted/30 px-3 py-3">
						{pattern ? (
							<StampedWeek week={week} />
						) : (
							<p className="text-muted-foreground text-sm">
								No pattern stamped — pick one to fill this week's days.
							</p>
						)}
					</td>
				</tr>
			) : null}
		</>
	)
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT D — "Load sculptor": the whole season is ONE editable load curve.
// Drag a week's point vertically to sculpt its volume; phase bands sit under
// the curve; the race flag ends it. The chart IS the plan — the same picture
// Fitness Projection draws, but authored by hand. Would live as a new route
// opened from the Plan chip, sharing the Trends tab's visual language.
// ═════════════════════════════════════════════════════════════════════════════

const SCULPT_W = 900
const SCULPT_H = 280
const SCULPT_PAD_X = 36
const SCULPT_PAD_Y = 28

function VariantLoadSculptor({ draft }: { draft: PlanDraft }) {
	const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(
		null,
	)
	const svgRef = useRef<SVGSVGElement | null>(null)
	const dragIndex = useRef<number | null>(null)

	const weeks = draft.weeks
	const maxHours = Math.max(...weeks.map((w) => w.targetHours), 10) + 2
	const xFor = (i: number) =>
		SCULPT_PAD_X +
		(i / Math.max(weeks.length - 1, 1)) * (SCULPT_W - 2 * SCULPT_PAD_X)
	const yFor = (h: number) =>
		SCULPT_H - SCULPT_PAD_Y - (h / maxHours) * (SCULPT_H - 2 * SCULPT_PAD_Y)

	function hoursFromPointer(clientY: number): number {
		const svg = svgRef.current
		if (!svg) return 0
		const rect = svg.getBoundingClientRect()
		const y = ((clientY - rect.top) / rect.height) * SCULPT_H
		const h =
			((SCULPT_H - SCULPT_PAD_Y - y) / (SCULPT_H - 2 * SCULPT_PAD_Y)) * maxHours
		return Math.min(maxHours, Math.max(0.5, Math.round(h * 2) / 2))
	}

	function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
		if (dragIndex.current == null) return
		draft.setWeekTarget(dragIndex.current, hoursFromPointer(e.clientY))
	}
	function endDrag() {
		dragIndex.current = null
	}

	// Phase bands: contiguous week ranges per phase
	const bands = draft.phases.map((phase) => {
		const phaseWeeks = weeks.filter((w) => w.phaseId === phase.id)
		const first = phaseWeeks[0]
		const last = phaseWeeks[phaseWeeks.length - 1]
		return { phase, first, last }
	})

	const curvePoints = weeks
		.map((w, i) => `${xFor(i)},${yFor(w.targetHours)}`)
		.join(' ')
	const areaPath = `M ${xFor(0)},${yFor(weeks[0]?.targetHours ?? 0)} ${weeks
		.map((w, i) => `L ${xFor(i)},${yFor(w.targetHours)}`)
		.join(
			' ',
		)} L ${xFor(weeks.length - 1)},${SCULPT_H - SCULPT_PAD_Y} L ${xFor(0)},${SCULPT_H - SCULPT_PAD_Y} Z`

	const selectedWeek = weeks.find((w) => w.index === selectedWeekIndex) ?? null

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
					<GoalLine draft={draft} />
					<div className="flex items-center gap-2 text-sm">
						<button
							type="button"
							onClick={() => draft.setCadence(draft.cadence === 3 ? 2 : 3)}
							className="border-input rounded-md border px-2 py-1 text-xs"
						>
							{draft.cadence}:1 recovery rhythm
						</button>
						<span className="text-muted-foreground text-xs">
							drag any point · tap to open the week
						</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Sculpt the season</CardTitle>
					<CardDescription>
						The curve is your weekly volume. Grab a week and pull — recovery
						dips and the taper glide are yours to shape.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<svg
							ref={svgRef}
							viewBox={`0 0 ${SCULPT_W} ${SCULPT_H}`}
							className="min-w-[640px] touch-none select-none"
							onPointerMove={onPointerMove}
							onPointerUp={endDrag}
							onPointerLeave={endDrag}
						>
							{/* phase bands */}
							{bands.map(({ phase, first, last }) =>
								first && last ? (
									<g key={phase.id}>
										<rect
											x={xFor(first.index - 1) - 8}
											y={SCULPT_PAD_Y / 2}
											width={xFor(last.index - 1) - xFor(first.index - 1) + 16}
											height={SCULPT_H - SCULPT_PAD_Y - SCULPT_PAD_Y / 2}
											className={cn(phaseFill(phase.name), 'opacity-[0.13]')}
											rx={6}
										/>
										<text
											x={(xFor(first.index - 1) + xFor(last.index - 1)) / 2}
											y={SCULPT_PAD_Y / 2 + 16}
											textAnchor="middle"
											className="fill-muted-foreground text-[11px] font-semibold tracking-wider uppercase"
										>
											{phase.name}
										</text>
									</g>
								) : null,
							)}
							{/* horizontal grid */}
							{[4, 8, 12].map((h) =>
								h < maxHours ? (
									<g key={h}>
										<line
											x1={SCULPT_PAD_X}
											x2={SCULPT_W - SCULPT_PAD_X}
											y1={yFor(h)}
											y2={yFor(h)}
											className="stroke-border"
											strokeDasharray="4 6"
										/>
										<text
											x={SCULPT_PAD_X - 8}
											y={yFor(h) + 4}
											textAnchor="end"
											className="fill-muted-foreground text-[10px]"
										>
											{h}h
										</text>
									</g>
								) : null,
							)}
							{/* area + curve */}
							<path d={areaPath} className="fill-emerald-500/15" />
							<polyline
								points={curvePoints}
								fill="none"
								className="stroke-emerald-500"
								strokeWidth={2.5}
								strokeLinejoin="round"
							/>
							{/* week handles */}
							{weeks.map((w, i) => (
								<g key={w.index}>
									<circle
										cx={xFor(i)}
										cy={yFor(w.targetHours)}
										r={14}
										className="cursor-ns-resize fill-transparent"
										onPointerDown={(e) => {
											;(e.target as Element).setPointerCapture?.(e.pointerId)
											dragIndex.current = w.index
											setSelectedWeekIndex(w.index)
										}}
									/>
									<circle
										cx={xFor(i)}
										cy={yFor(w.targetHours)}
										r={w.index === selectedWeekIndex ? 8 : 6}
										className={cn(
											'stroke-background pointer-events-none',
											w.type === 'recovery'
												? 'fill-sky-400'
												: w.type === 'taper'
													? 'fill-rose-400'
													: 'fill-emerald-500',
										)}
										strokeWidth={2}
									/>
									<text
										x={xFor(i)}
										y={SCULPT_H - SCULPT_PAD_Y + 16}
										textAnchor="middle"
										className={cn(
											'text-[10px]',
											w.index === selectedWeekIndex
												? 'fill-foreground font-bold'
												: 'fill-muted-foreground',
										)}
									>
										{w.index}
									</text>
								</g>
							))}
							{/* race flag */}
							<text
								x={SCULPT_W - SCULPT_PAD_X + 14}
								y={yFor(weeks[weeks.length - 1]?.targetHours ?? 0)}
								className="text-base"
							>
								🏁
							</text>
						</svg>
					</div>
					<div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
						<span>
							<span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />
							loading
						</span>
						<span>
							<span className="mr-1 inline-block size-2 rounded-full bg-sky-400" />
							recovery ({draft.cadence}:1, −{draft.recoveryCutPct}%)
						</span>
						<span>
							<span className="mr-1 inline-block size-2 rounded-full bg-rose-400" />
							taper
						</span>
					</div>
				</CardContent>
			</Card>

			{selectedWeek ? (
				<Card>
					<CardHeader className="pb-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle className="text-base">
								Week {selectedWeek.index} · {selectedWeek.phaseName} ·{' '}
								{selectedWeek.targetHours}h ({weekTss(selectedWeek)} TSS)
							</CardTitle>
							<div className="flex items-center gap-2">
								<WeekTypeBadge type={selectedWeek.type} />
								<PatternSelect
									value={selectedWeek.patternId}
									onChange={(id) =>
										draft.stampPattern(selectedWeek.phaseId, id)
									}
									stampLabel={`Stamp across ${selectedWeek.phaseName}`}
								/>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<StampedWeek week={selectedWeek} />
					</CardContent>
				</Card>
			) : (
				<p className="text-muted-foreground text-center text-sm">
					Tap a point on the curve to open that week's days.
				</p>
			)}
		</div>
	)
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT E — "Pattern deck": planning as dealing cards. Week patterns are a
// deck at the bottom; phases are shelves of week slots. Drag a card onto a
// shelf (or tap the card, then tap the shelf) to stamp its weeks. The goal is
// a boarding pass up top. Tactile-first; built for touch as much as mouse.
// Would live as a new route from the Create menu.
// ═════════════════════════════════════════════════════════════════════════════

function VariantPatternDeck({ draft }: { draft: PlanDraft }) {
	const [armedPattern, setArmedPattern] = useState<string | null>(null)
	const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(
		null,
	)
	const selectedWeek =
		draft.weeks.find((w) => w.index === selectedWeekIndex) ?? null

	function stampOnPhase(phaseId: string, patternId: string) {
		draft.stampPattern(phaseId, patternId)
		setArmedPattern(null)
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Boarding pass */}
			<div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-emerald-600 to-sky-600 p-5 text-white">
				<div className="text-xs font-semibold tracking-widest uppercase opacity-80">
					Destination
				</div>
				<div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<span className="text-2xl font-bold">{draft.goalLabel}</span>
					{draft.goalDate ? (
						<span className="text-sm opacity-90">
							{formatDate(draft.goalDate, 'UTC')} · {draft.weeks.length} weeks
							out
						</span>
					) : null}
				</div>
				<div className="mt-2 text-xs opacity-80">
					{draft.phases.map((p) => `${p.name} ${p.weeks}wk`).join(' → ')} → 🏁
				</div>
			</div>

			{/* Phase shelves */}
			<div className="flex flex-col gap-3">
				{draft.phases.map((phase) => {
					const phaseWeeks = draft.weeks.filter((w) => w.phaseId === phase.id)
					const stamped = draft.patternByPhase[phase.id] ?? null
					const stampedPattern = PATTERNS.find((p) => p.id === stamped)
					return (
						<div
							key={phase.id}
							data-shelf={phase.id}
							onDragOver={(e) => e.preventDefault()}
							onDrop={(e) => {
								e.preventDefault()
								const id = e.dataTransfer.getData('text/pattern')
								if (id) stampOnPhase(phase.id, id)
							}}
							onClick={() => {
								if (armedPattern) stampOnPhase(phase.id, armedPattern)
							}}
							className={cn(
								'rounded-xl border-2 p-3 transition',
								armedPattern
									? 'border-primary cursor-copy border-dashed'
									: 'border-transparent',
								'bg-card shadow-sm',
							)}
						>
							<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<span
										className={cn(
											'size-3 rounded-full',
											phaseColor(phase.name),
										)}
									/>
									<span className="font-semibold">{phase.name}</span>
									<span className="text-muted-foreground text-sm">
										{phase.weeks} wk · {phase.weeklyLoadHours} h/wk
									</span>
								</div>
								{stampedPattern ? (
									<Badge variant="secondary">
										{stampedPattern.name} stamped
									</Badge>
								) : (
									<span className="text-muted-foreground text-xs">
										{armedPattern ? 'tap to stamp here' : 'drop a card here'}
									</span>
								)}
							</div>
							<div className="flex gap-1.5 overflow-x-auto pb-1">
								{phaseWeeks.map((week) => (
									<button
										key={week.index}
										type="button"
										onClick={(e) => {
											e.stopPropagation()
											setSelectedWeekIndex(
												selectedWeekIndex === week.index ? null : week.index,
											)
										}}
										className={cn(
											'min-w-20 shrink-0 rounded-lg border p-2 text-left',
											week.type === 'recovery' && 'bg-sky-500/10',
											week.type === 'taper' && 'bg-rose-500/10',
											week.index === selectedWeekIndex && 'ring-primary ring-2',
										)}
									>
										<div className="text-xs font-semibold">W{week.index}</div>
										<div className="text-muted-foreground text-[11px]">
											{week.targetHours}h
										</div>
										<div className="mt-1 flex gap-0.5">
											{stampedPattern
												? stampedPattern.sessions.map((s) => (
														<span
															key={s.day + s.title}
															title={`${s.day} · ${s.title}`}
															className={cn(
																'size-1.5 rounded-full',
																s.tss != null
																	? 'bg-emerald-500'
																	: 'bg-zinc-400',
															)}
														/>
													))
												: [1, 2, 3].map((i) => (
														<span
															key={i}
															className="bg-muted size-1.5 rounded-full"
														/>
													))}
										</div>
									</button>
								))}
							</div>
						</div>
					)
				})}
			</div>

			{/* Selected week detail */}
			{selectedWeek ? (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-base">
							Week {selectedWeek.index} · {selectedWeek.phaseName} ·{' '}
							{weekTss(selectedWeek)} TSS target
						</CardTitle>
					</CardHeader>
					<CardContent>
						<StampedWeek week={selectedWeek} />
					</CardContent>
				</Card>
			) : null}

			{/* The deck */}
			<div className="bg-background/95 sticky bottom-16 rounded-xl border p-3 shadow-lg backdrop-blur">
				<div className="mb-2 flex items-baseline justify-between">
					<span className="text-sm font-semibold">Week pattern deck</span>
					<span className="text-muted-foreground text-xs">
						drag onto a phase — or tap a card, then tap a phase
					</span>
				</div>
				<div className="flex gap-2 overflow-x-auto pb-1">
					{PATTERNS.map((p) => (
						<button
							key={p.id}
							type="button"
							draggable
							onDragStart={(e) => e.dataTransfer.setData('text/pattern', p.id)}
							onClick={() =>
								setArmedPattern(armedPattern === p.id ? null : p.id)
							}
							className={cn(
								'min-w-44 shrink-0 cursor-grab rounded-lg border-2 p-3 text-left shadow-sm active:cursor-grabbing',
								armedPattern === p.id
									? 'border-primary -translate-y-1'
									: 'border-border bg-card',
							)}
						>
							<div className="text-sm font-semibold">{p.name}</div>
							<ul className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-[11px]">
								{p.sessions.map((s) => (
									<li key={s.day + s.title}>
										{s.day} {DISCIPLINE_ICON[s.discipline]}{' '}
										{s.tss != null ? `${s.tss} TSS` : 'no TSS'}
									</li>
								))}
							</ul>
							<div className="text-muted-foreground mt-1.5 text-[11px] font-medium">
								{patternPlannedTss(p)} TSS/wk
							</div>
						</button>
					))}
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
