// PROTOTYPE — three radically different takes on the Plan Generation wizard
// ("plan training program"), switchable via `?variant=A|B|C` on
// `/training/plan/new` and the floating PrototypeSwitcher (arrow keys cycle).
//
//   A — Guided Stepper   one decision per screen, big tap targets, mobile-first.
//   B — Split Studio     dense two-pane control panel + live preview, desktop-first.
//   C — Coach Chat       conversational column, the planner "talks" to the athlete.
//
// Filename starts with `__` so react-router-auto-routes ignores it. The
// generation + approve here are STUBBED (no SSE, no DB write) so every variant
// is fully clickable and screenshot-able without a backend. When a direction
// wins, fold it into the real `plan.new.tsx` (wiring the real EventSource +
// approve action back in) and delete this file + the switcher branch.

import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import {
	PrototypeSwitcher,
	type PrototypeVariant,
} from '#app/components/prototype-switcher.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	type PlanPreview,
	type PreviewSession,
	type PreviewStep,
} from '#app/utils/plan-generation/preview.ts'
import {
	EXPERIENCE_LABELS,
	EXPERIENCE_LEVELS,
	type ExperienceLevel,
} from '#app/utils/plan-generation/schema.ts'
import {
	formatDistance,
	formatDuration,
} from '#app/utils/workout-formatting.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINE_LABELS,
	INTENT_LABELS,
	type CardioDiscipline,
	type WorkoutIntent,
} from '#app/utils/workout-schema.ts'

// ── Variant registry ─────────────────────────────────────────────────────────

export const PLAN_WIZARD_VARIANTS = [
	{ key: 'A', name: 'Guided Stepper' },
	{ key: 'B', name: 'Split Studio' },
	{ key: 'C', name: 'Coach Chat' },
] as const satisfies readonly PrototypeVariant[]

export type PlanWizardVariantKey = (typeof PLAN_WIZARD_VARIANTS)[number]['key']

export function isPlanWizardVariant(
	value: string | null | undefined,
): value is PlanWizardVariantKey {
	return PLAN_WIZARD_VARIANTS.some((v) => v.key === value)
}

export type TargetEventOption = { id: string; name: string; startDate: Date }

// ── Discipline visual language (shared across variants) ──────────────────────

type Style = { dot: string; chip: string; ring: string; text: string }

const DISCIPLINE_STYLE: Record<CardioDiscipline, Style> = {
	run: {
		dot: 'bg-orange-500',
		chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
		ring: 'ring-orange-400/40',
		text: 'text-orange-600 dark:text-orange-300',
	},
	bike: {
		dot: 'bg-sky-500',
		chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		ring: 'ring-sky-400/40',
		text: 'text-sky-600 dark:text-sky-300',
	},
	swim: {
		dot: 'bg-cyan-500',
		chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
		ring: 'ring-cyan-400/40',
		text: 'text-cyan-600 dark:text-cyan-300',
	},
}

const DISCIPLINE_ICON: Record<CardioDiscipline, IconName> = {
	run: 'barbell',
	bike: 'barbell',
	swim: 'barbell',
}

function intentTone(intent: WorkoutIntent): 'easy' | 'mod' | 'hard' {
	if (['recovery', 'endurance', 'technique', 'mobility'].includes(intent))
		return 'easy'
	if (['tempo', 'threshold', 'test'].includes(intent)) return 'mod'
	return 'hard'
}

const TONE_STYLE: Record<'easy' | 'mod' | 'hard', string> = {
	easy: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	mod: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	hard: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

// ── Shared draft state + stubbed generation ──────────────────────────────────

type Status = 'idle' | 'generating' | 'preview' | 'approved'

const PROGRESS_STEPS = [
	'Reading your goal…',
	'Shaping the periodization…',
	'Placing sessions on your trainable days…',
	'Resolving intensity zones…',
] as const

function useDraft(targetEvents: TargetEventOption[]) {
	const [disciplines, setDisciplines] = useState<CardioDiscipline[]>(['run'])
	const [experience, setExperience] = useState<ExperienceLevel>('intermediate')
	const [goal, setGoal] = useState('')
	const [horizonWeeks, setHorizonWeeks] = useState(8)
	const [targetEventId, setTargetEventId] = useState('')

	const [status, setStatus] = useState<Status>('idle')
	const [progress, setProgress] = useState(0)
	const [preview, setPreview] = useState<PlanPreview | null>(null)

	const selectedEvent = targetEvents.find((e) => e.id === targetEventId) ?? null
	const derivedHorizon = selectedEvent
		? weeksUntil(selectedEvent.startDate)
		: null
	const effectiveHorizon = derivedHorizon ?? horizonWeeks

	function toggleDiscipline(d: CardioDiscipline) {
		setDisciplines((prev) =>
			prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
		)
	}

	function generate() {
		setStatus('generating')
		setProgress(0)
		setPreview(null)
		// Stubbed streaming — step through progress, then drop a sample preview.
		PROGRESS_STEPS.forEach((_, i) => {
			setTimeout(() => setProgress(i + 1), 220 * (i + 1))
		})
		setTimeout(
			() => {
				setPreview(
					buildSamplePreview({
						disciplines,
						horizon: effectiveHorizon,
						goal,
					}),
				)
				setStatus('preview')
			},
			220 * (PROGRESS_STEPS.length + 1),
		)
	}

	function discard() {
		setStatus('idle')
		setPreview(null)
		setProgress(0)
	}

	function approve() {
		setStatus('approved')
	}

	const canGenerate = disciplines.length > 0 && goal.trim().length > 0

	return {
		disciplines,
		experience,
		goal,
		horizonWeeks,
		targetEventId,
		targetEvents,
		selectedEvent,
		effectiveHorizon,
		status,
		progress,
		preview,
		canGenerate,
		setExperience,
		setGoal,
		setHorizonWeeks,
		setTargetEventId,
		toggleDiscipline,
		generate,
		discard,
		approve,
	}
}

type Draft = ReturnType<typeof useDraft>

// ── Sample preview builder (stub) ─────────────────────────────────────────────

function buildSamplePreview({
	disciplines,
	horizon,
	goal,
}: {
	disciplines: CardioDiscipline[]
	horizon: number
	goal: string
}): PlanPreview {
	const sports = disciplines.length ? disciplines : (['run'] as const)
	const primary = sports[0]!
	return {
		outline: buildOutline(horizon),
		sessions: buildSessions(sports, primary, goal),
	}
}

function buildOutline(weeks: number): PlanPreview['outline'] {
	// Friel-ish split scaled to the horizon, always summing to `weeks`.
	const taper = weeks >= 4 ? 1 : 0
	const peak = weeks >= 8 ? 1 : 0
	const remaining = weeks - taper - peak
	const base = Math.max(1, Math.round(remaining * 0.6))
	const build = Math.max(0, remaining - base)
	const phases = [
		{
			name: 'Base',
			weeks: base,
			focus: 'Aerobic foundation & durability',
			hrs: 5,
		},
		build > 0 && {
			name: 'Build',
			weeks: build,
			focus: 'Threshold & VO₂ sharpening',
			hrs: 7,
		},
		peak > 0 && {
			name: 'Peak',
			weeks: peak,
			focus: 'Race-specific intensity',
			hrs: 6,
		},
		taper > 0 && {
			name: 'Taper',
			weeks: taper,
			focus: 'Freshen up, hold sharpness',
			hrs: 3,
		},
	].filter(Boolean) as Array<{
		name: string
		weeks: number
		focus: string
		hrs: number
	}>
	return {
		phases: phases.map((p) => ({
			name: p.name,
			weeks: p.weeks,
			focus: p.focus,
			weeklyLoadHours: p.hrs,
		})),
	}
}

function at(daysFromNow: number, hour: number): Date {
	const d = new Date()
	d.setHours(hour, 0, 0, 0)
	d.setDate(d.getDate() + daysFromNow)
	return d
}

function cardio(
	discipline: CardioDiscipline,
	opts: {
		durationSec?: number
		distanceM?: number
		label?: string
		hr?: [number, number]
	},
): PreviewStep {
	return {
		kind: 'cardio',
		discipline,
		durationSec: opts.durationSec,
		distanceM: opts.distanceM,
		intensity: opts.label
			? { kind: 'zoneLabel', label: opts.label }
			: undefined,
		resolvedIntensity: opts.hr
			? { hrMin: opts.hr[0], hrMax: opts.hr[1] }
			: undefined,
	}
}

function rest(durationSec: number): PreviewStep {
	return { kind: 'rest', durationSec }
}

function buildSessions(
	sports: readonly CardioDiscipline[],
	primary: CardioDiscipline,
	goal: string,
): PreviewSession[] {
	const second = sports[1] ?? primary
	const raw: Array<{
		day: number
		hour: number
		title: string
		discipline: CardioDiscipline
		intent: WorkoutIntent
		blocks: PreviewSession['blocks']
	}> = [
		{
			day: 1,
			hour: 7,
			title: 'Easy aerobic base',
			discipline: primary,
			intent: 'endurance',
			blocks: [
				{
					repeatCount: 1,
					steps: [
						cardio(primary, {
							durationSec: 2700,
							label: 'zone2',
							hr: [135, 150],
						}),
					],
				},
			],
		},
		{
			day: 2,
			hour: 18,
			title: 'Threshold intervals',
			discipline: primary,
			intent: 'threshold',
			blocks: [
				{
					name: 'Warm-up',
					repeatCount: 1,
					steps: [
						cardio(primary, {
							durationSec: 600,
							label: 'easy',
							hr: [120, 135],
						}),
					],
				},
				{
					name: 'Main set',
					repeatCount: 4,
					steps: [
						cardio(primary, {
							durationSec: 360,
							label: 'threshold',
							hr: [165, 175],
						}),
						rest(120),
					],
				},
				{
					name: 'Cool-down',
					repeatCount: 1,
					steps: [
						cardio(primary, {
							durationSec: 600,
							label: 'easy',
							hr: [115, 130],
						}),
					],
				},
			],
		},
		{
			day: 4,
			hour: 7,
			title: sports.length > 1 ? 'Cross-training spin' : 'Recovery jog',
			discipline: second,
			intent: 'recovery',
			blocks: [
				{
					repeatCount: 1,
					steps: [
						cardio(second, {
							durationSec: 2400,
							label: 'zone2',
							hr: [120, 140],
						}),
					],
				},
			],
		},
		{
			day: 6,
			hour: 9,
			title: 'Long endurance',
			discipline: primary,
			intent: 'endurance',
			blocks: [
				{
					repeatCount: 1,
					steps: [
						cardio(primary, {
							distanceM: 16000,
							label: 'zone2',
							hr: [135, 152],
						}),
					],
				},
			],
		},
		{
			day: 9,
			hour: 18,
			title: 'VO₂ max repeats',
			discipline: primary,
			intent: 'vo2max',
			blocks: [
				{
					name: 'Warm-up',
					repeatCount: 1,
					steps: [
						cardio(primary, {
							durationSec: 900,
							label: 'easy',
							hr: [120, 138],
						}),
					],
				},
				{
					name: 'Repeats',
					repeatCount: 5,
					steps: [
						cardio(primary, { durationSec: 180, label: 'max', hr: [178, 188] }),
						rest(180),
					],
				},
			],
		},
		{
			day: 11,
			hour: 9,
			title: 'Goal-pace tempo',
			discipline: primary,
			intent: 'tempo',
			blocks: [
				{
					repeatCount: 1,
					steps: [
						cardio(primary, {
							durationSec: 1800,
							label: 'threshold',
							hr: [158, 170],
						}),
					],
				},
			],
		},
	]
	void goal
	return raw.map((r, i) => ({
		weekIndex: Math.floor(r.day / 7),
		orderInWeek: i,
		title: r.title,
		discipline: r.discipline,
		intent: r.intent,
		scheduledAt: at(r.day, r.hour),
		blocks: r.blocks,
	}))
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function stepLabel(step: PreviewStep): string {
	if (step.kind === 'rest') {
		return `Rest${step.durationSec ? ` ${formatDuration(step.durationSec)}` : ''}`
	}
	const parts: string[] = []
	if (step.durationSec) parts.push(formatDuration(step.durationSec))
	if (step.distanceM) parts.push(formatDistance(step.distanceM))
	if (step.intensity) parts.push(`@ ${step.intensity.label}`)
	if (step.resolvedIntensity?.hrMin)
		parts.push(
			`${step.resolvedIntensity.hrMin}–${step.resolvedIntensity.hrMax} bpm`,
		)
	return parts.join(' · ') || DISCIPLINE_LABELS[step.discipline]
}

function sessionDurationMin(session: PreviewSession): number {
	let total = 0
	for (const b of session.blocks) {
		for (const s of b.steps) total += (s.durationSec ?? 0) * b.repeatCount
	}
	return Math.round(total / 60)
}

function fmtDay(d: Date): string {
	return d.toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	})
}

function fmtTime(d: Date): string {
	return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function fmtEvent(d: Date): string {
	return d.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

function weeksUntil(value: Date): number {
	const weeks = Math.ceil(
		(value.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000),
	)
	return Math.min(52, Math.max(1, weeks))
}

const SAMPLE_EVENTS: TargetEventOption[] = [
	{ name: 'Oslo Half Marathon', startDate: at(70, 9), id: 'sample-1' },
	{ name: 'Norseman 70.3', startDate: at(126, 7), id: 'sample-2' },
]

// ── Root: owns shared state, renders the chosen variant + switcher ───────────

export function PlanWizardPrototype({
	variant,
	targetEvents,
}: {
	variant: PlanWizardVariantKey
	targetEvents: TargetEventOption[]
}) {
	// The wizard is empty for a fresh athlete; seed sample events so the Target
	// Event affordance is visible in the prototype.
	const events = targetEvents.length ? targetEvents : SAMPLE_EVENTS
	const draft = useDraft(events)

	return (
		<>
			{variant === 'A' && <VariantStepper draft={draft} />}
			{variant === 'B' && <VariantStudio draft={draft} />}
			{variant === 'C' && <VariantChat draft={draft} />}
			<PrototypeSwitcher
				variants={[...PLAN_WIZARD_VARIANTS]}
				current={variant}
				paramName="variant"
			/>
		</>
	)
}

// ── Small shared bits ─────────────────────────────────────────────────────────

function DisciplineChip({
	discipline,
	selected,
	onClick,
	size = 'md',
}: {
	discipline: CardioDiscipline
	selected: boolean
	onClick: () => void
	size?: 'sm' | 'md'
}) {
	const style = DISCIPLINE_STYLE[discipline]
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				'inline-flex items-center gap-2 rounded-full border font-medium transition',
				size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
				selected
					? cn('border-transparent ring-2', style.chip, style.ring)
					: 'border-border bg-background text-muted-foreground hover:bg-muted',
			)}
		>
			<span className={cn('size-2 rounded-full', style.dot)} aria-hidden />
			{DISCIPLINE_LABELS[discipline]}
		</button>
	)
}

function ApprovedBanner() {
	return (
		<div className="border-primary/30 bg-primary/10 text-primary flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium">
			<Icon name="circle-check" size="md" />
			Plan approved — your sessions are on the calendar.
			<span className="text-muted-foreground ml-auto text-xs font-normal">
				(prototype — nothing was saved)
			</span>
		</div>
	)
}

function SessionCard({
	session,
	dense = false,
}: {
	session: PreviewSession
	dense?: boolean
}) {
	const style = DISCIPLINE_STYLE[session.discipline]
	const tone = intentTone(session.intent)
	const min = sessionDurationMin(session)
	return (
		<div className="border-border bg-card rounded-xl border p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
								style.chip,
							)}
						>
							<span className={cn('size-1.5 rounded-full', style.dot)} />
							{DISCIPLINE_LABELS[session.discipline]}
						</span>
						<span
							className={cn(
								'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
								TONE_STYLE[tone],
							)}
						>
							{INTENT_LABELS[session.intent]}
						</span>
					</div>
					<h4 className="text-foreground mt-2 font-semibold">
						{session.title}
					</h4>
				</div>
				<div className="text-right">
					<p className="text-foreground text-sm font-medium whitespace-nowrap">
						{fmtDay(session.scheduledAt)}
					</p>
					<p className="text-muted-foreground text-xs">
						{fmtTime(session.scheduledAt)}
						{min > 0 ? ` · ${min} min` : ''}
					</p>
				</div>
			</div>
			{!dense ? (
				<ul className="mt-3 space-y-1">
					{session.blocks.map((block, bi) => (
						<li key={bi} className="text-muted-foreground text-sm">
							{block.repeatCount > 1 ? (
								<span className="text-foreground font-medium">
									{block.repeatCount}×{' '}
								</span>
							) : null}
							{block.steps.map((s) => stepLabel(s)).join(' → ')}
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}

function PhaseRibbon({ outline }: { outline: PlanPreview['outline'] }) {
	const total = outline.phases.reduce((s, p) => s + p.weeks, 0)
	const tones = ['bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500']
	return (
		<div>
			<div className="flex h-3 w-full overflow-hidden rounded-full">
				{outline.phases.map((p, i) => (
					<div
						key={i}
						className={cn(tones[i % tones.length], 'h-full')}
						style={{ width: `${(p.weeks / total) * 100}%` }}
						title={`${p.name} · ${p.weeks}w`}
					/>
				))}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
				{outline.phases.map((p, i) => (
					<div key={i} className="flex items-center gap-1.5 text-xs">
						<span
							className={cn('size-2 rounded-full', tones[i % tones.length])}
						/>
						<span className="text-foreground font-medium">{p.name}</span>
						<span className="text-muted-foreground">{p.weeks}w</span>
					</div>
				))}
			</div>
		</div>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT A — Guided Stepper
// One decision per screen, progress rail, huge tap targets. Mobile-first.
// ════════════════════════════════════════════════════════════════════════════

const STEPPER_STEPS = [
	{ key: 'goal', label: 'Goal', icon: 'magnifying-glass' as IconName },
	{ key: 'sports', label: 'Sports', icon: 'barbell' as IconName },
	{ key: 'level', label: 'Level', icon: 'bar-chart' as IconName },
	{ key: 'timeline', label: 'Timeline', icon: 'calendar' as IconName },
	{ key: 'review', label: 'Review', icon: 'check' as IconName },
] as const

function VariantStepper({ draft }: { draft: Draft }) {
	const [stepIdx, setStepIdx] = useState(0)
	const step = STEPPER_STEPS[stepIdx]!
	const isLast = stepIdx === STEPPER_STEPS.length - 1

	const showPlan = draft.status === 'preview' || draft.status === 'approved'

	const canAdvance =
		step.key === 'goal'
			? draft.goal.trim().length > 0
			: step.key === 'sports'
				? draft.disciplines.length > 0
				: true

	if (showPlan) {
		return (
			<main className="bg-muted/30 min-h-screen px-4 py-10">
				<div className="mx-auto max-w-2xl space-y-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-primary text-xs font-semibold tracking-wide uppercase">
								Your plan
							</p>
							<h1 className="text-foreground text-2xl font-bold tracking-tight">
								{draft.effectiveHorizon}-week build
							</h1>
						</div>
						<Button variant="ghost" size="sm" onClick={draft.discard}>
							<Icon name="arrow-left" size="sm" />
							Start over
						</Button>
					</div>
					{draft.status === 'approved' ? <ApprovedBanner /> : null}
					<div className="border-border bg-card rounded-2xl border p-5">
						<h2 className="text-foreground mb-3 font-semibold">Plan outline</h2>
						{draft.preview ? (
							<PhaseRibbon outline={draft.preview.outline} />
						) : null}
					</div>
					<div className="space-y-3">
						<h2 className="text-foreground font-semibold">First sessions</h2>
						{draft.preview?.sessions.map((s, i) => (
							<SessionCard key={i} session={s} />
						))}
					</div>
					{draft.status !== 'approved' ? (
						<div className="bg-background/80 border-border sticky bottom-0 -mx-4 flex gap-3 border-t px-4 py-4 backdrop-blur-md">
							<Button className="flex-1" size="lg" onClick={draft.approve}>
								<Icon name="check" size="sm" />
								Approve &amp; save
							</Button>
							<Button variant="outline" size="lg" onClick={draft.generate}>
								<Icon name="update" size="sm" />
								Regenerate
							</Button>
						</div>
					) : (
						<Button size="lg" render={<Link to="/" />}>
							Go to dashboard
						</Button>
					)}
				</div>
			</main>
		)
	}

	if (draft.status === 'generating') {
		return <GeneratingScreen draft={draft} />
	}

	return (
		<main className="bg-muted/30 flex min-h-screen flex-col px-4 py-8">
			<div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
				{/* Progress rail */}
				<div className="mb-10 flex items-center justify-between">
					{STEPPER_STEPS.map((s, i) => {
						const done = i < stepIdx
						const active = i === stepIdx
						return (
							<div
								key={s.key}
								className="flex flex-1 items-center last:flex-none"
							>
								<button
									type="button"
									onClick={() => i <= stepIdx && setStepIdx(i)}
									className={cn(
										'grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition',
										active
											? 'border-primary bg-primary text-primary-foreground'
											: done
												? 'border-primary text-primary'
												: 'border-border text-muted-foreground',
									)}
									aria-current={active ? 'step' : undefined}
								>
									{done ? <Icon name="check" size="sm" /> : i + 1}
								</button>
								{i < STEPPER_STEPS.length - 1 ? (
									<div
										className={cn(
											'mx-1 h-0.5 flex-1 rounded-full transition',
											done ? 'bg-primary' : 'bg-border',
										)}
									/>
								) : null}
							</div>
						)
					})}
				</div>

				<AnimatePresence mode="wait">
					<motion.div
						key={step.key}
						initial={{ opacity: 0, x: 24 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: -24 }}
						transition={{ duration: 0.2 }}
						className="flex-1"
					>
						<StepperBody step={step.key} draft={draft} />
					</motion.div>
				</AnimatePresence>
			</div>

			{/* Footer actions */}
			<div className="mx-auto mt-8 flex w-full max-w-xl items-center justify-between">
				<Button
					variant="ghost"
					size="lg"
					onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
					disabled={stepIdx === 0}
				>
					<Icon name="arrow-left" size="sm" />
					Back
				</Button>
				{isLast ? (
					<Button
						size="lg"
						onClick={draft.generate}
						disabled={!draft.canGenerate}
					>
						Generate plan
						<Icon name="arrow-right" size="sm" />
					</Button>
				) : (
					<Button
						size="lg"
						onClick={() => setStepIdx((i) => i + 1)}
						disabled={!canAdvance}
					>
						Continue
						<Icon name="arrow-right" size="sm" />
					</Button>
				)}
			</div>
		</main>
	)
}

function StepperBody({
	step,
	draft,
}: {
	step: (typeof STEPPER_STEPS)[number]['key']
	draft: Draft
}) {
	if (step === 'goal') {
		return (
			<div>
				<StepHeading
					eyebrow="Step 1"
					title="What are you training for?"
					sub="Describe the goal in your own words — a race, a distance, or a feeling."
				/>
				<textarea
					autoFocus
					value={draft.goal}
					onChange={(e) => draft.setGoal(e.target.value)}
					placeholder="e.g. Run a sub-2:00 half marathon this autumn"
					className="border-border bg-background focus-visible:ring-ring/30 min-h-32 w-full rounded-2xl border p-4 text-lg outline-none focus-visible:ring-3"
				/>
				<div className="mt-3 flex flex-wrap gap-2">
					{[
						'Sub-2:00 half marathon',
						'First Olympic triathlon',
						'Build aerobic base',
					].map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => draft.setGoal(s)}
							className="border-border bg-background hover:bg-muted text-muted-foreground rounded-full border px-3 py-1.5 text-sm transition"
						>
							{s}
						</button>
					))}
				</div>
			</div>
		)
	}
	if (step === 'sports') {
		return (
			<div>
				<StepHeading
					eyebrow="Step 2"
					title="Which sports?"
					sub="Pick everything you want in the mix. We'll balance the week across them."
				/>
				<div className="grid gap-3 sm:grid-cols-3">
					{CARDIO_DISCIPLINES.map((d) => {
						const selected = draft.disciplines.includes(d)
						const style = DISCIPLINE_STYLE[d]
						return (
							<button
								key={d}
								type="button"
								onClick={() => draft.toggleDiscipline(d)}
								aria-pressed={selected}
								className={cn(
									'flex flex-col items-center gap-3 rounded-2xl border-2 p-6 transition',
									selected
										? cn('border-transparent ring-2', style.chip, style.ring)
										: 'border-border bg-background hover:bg-muted',
								)}
							>
								<span
									className={cn(
										'grid size-12 place-items-center rounded-full',
										selected ? style.dot : 'bg-muted',
									)}
								>
									<Icon
										name={DISCIPLINE_ICON[d]}
										size="md"
										className={
											selected ? 'text-white' : 'text-muted-foreground'
										}
									/>
								</span>
								<span className="font-semibold">{DISCIPLINE_LABELS[d]}</span>
							</button>
						)
					})}
				</div>
			</div>
		)
	}
	if (step === 'level') {
		return (
			<div>
				<StepHeading
					eyebrow="Step 3"
					title="How experienced are you?"
					sub="This sets how aggressively the plan ramps your weekly load."
				/>
				<div className="flex flex-col gap-3">
					{EXPERIENCE_LEVELS.map((level) => {
						const selected = draft.experience === level
						return (
							<button
								key={level}
								type="button"
								onClick={() => draft.setExperience(level)}
								aria-pressed={selected}
								className={cn(
									'flex items-center justify-between rounded-2xl border-2 p-5 text-left transition',
									selected
										? 'border-primary bg-primary/5'
										: 'border-border bg-background hover:bg-muted',
								)}
							>
								<div>
									<p className="font-semibold">{EXPERIENCE_LABELS[level]}</p>
									<p className="text-muted-foreground text-sm">
										{EXPERIENCE_BLURB[level]}
									</p>
								</div>
								<span
									className={cn(
										'grid size-6 place-items-center rounded-full border-2',
										selected ? 'border-primary bg-primary' : 'border-border',
									)}
								>
									{selected ? (
										<Icon
											name="check"
											size="xs"
											className="text-primary-foreground"
										/>
									) : null}
								</span>
							</button>
						)
					})}
				</div>
			</div>
		)
	}
	if (step === 'timeline') {
		return (
			<div>
				<StepHeading
					eyebrow="Step 4"
					title="When's the finish line?"
					sub="Anchor to an event, or set a horizon to build toward."
				/>
				<div className="space-y-3">
					{draft.targetEvents.map((event) => {
						const selected = draft.targetEventId === event.id
						return (
							<button
								key={event.id}
								type="button"
								onClick={() => draft.setTargetEventId(event.id)}
								className={cn(
									'flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left transition',
									selected
										? 'border-primary bg-primary/5'
										: 'border-border bg-background hover:bg-muted',
								)}
							>
								<div className="flex items-center gap-3">
									<Icon name="calendar" size="md" className="text-primary" />
									<div>
										<p className="font-semibold">{event.name}</p>
										<p className="text-muted-foreground text-sm">
											{fmtEvent(event.startDate)} ·{' '}
											{weeksUntil(event.startDate)} weeks away
										</p>
									</div>
								</div>
								{selected ? (
									<Icon
										name="circle-check"
										size="md"
										className="text-primary"
									/>
								) : null}
							</button>
						)
					})}
					<button
						type="button"
						onClick={() => draft.setTargetEventId('')}
						className={cn(
							'flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left transition',
							!draft.targetEventId
								? 'border-primary bg-primary/5'
								: 'border-border bg-background hover:bg-muted',
						)}
					>
						<div className="flex items-center gap-3">
							<Icon name="clock" size="md" className="text-muted-foreground" />
							<div className="flex-1">
								<p className="font-semibold">No event — set a horizon</p>
								{!draft.targetEventId ? (
									<div className="mt-2 flex items-center gap-3">
										<input
											type="range"
											min={4}
											max={24}
											value={draft.horizonWeeks}
											onChange={(e) =>
												draft.setHorizonWeeks(Number(e.target.value))
											}
											className="accent-primary w-48"
											onClick={(e) => e.stopPropagation()}
										/>
										<span className="text-foreground font-semibold">
											{draft.horizonWeeks} weeks
										</span>
									</div>
								) : null}
							</div>
						</div>
					</button>
				</div>
			</div>
		)
	}
	// review
	return (
		<div>
			<StepHeading
				eyebrow="Step 5"
				title="Ready to build?"
				sub="Here's what we'll hand to the planner."
			/>
			<dl className="border-border bg-card divide-border divide-y rounded-2xl border">
				<ReviewRow label="Goal" value={draft.goal || '—'} />
				<ReviewRow
					label="Sports"
					value={draft.disciplines.map((d) => DISCIPLINE_LABELS[d]).join(', ')}
				/>
				<ReviewRow label="Level" value={EXPERIENCE_LABELS[draft.experience]} />
				<ReviewRow
					label="Timeline"
					value={
						draft.selectedEvent
							? `${draft.selectedEvent.name} · ${draft.effectiveHorizon} weeks`
							: `${draft.effectiveHorizon} weeks`
					}
				/>
			</dl>
		</div>
	)
}

const EXPERIENCE_BLURB: Record<ExperienceLevel, string> = {
	beginner: 'New to structured training — gentle, steady ramp.',
	intermediate: 'Train regularly — balanced progression.',
	advanced: 'Seasoned — higher volume and intensity.',
}

function StepHeading({
	eyebrow,
	title,
	sub,
}: {
	eyebrow: string
	title: string
	sub: string
}) {
	return (
		<div className="mb-6">
			<p className="text-primary text-xs font-semibold tracking-wide uppercase">
				{eyebrow}
			</p>
			<h1 className="text-foreground mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
				{title}
			</h1>
			<p className="text-muted-foreground mt-2">{sub}</p>
		</div>
	)
}

function ReviewRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-4 p-4">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="text-foreground text-right font-medium">{value}</dd>
		</div>
	)
}

function GeneratingScreen({ draft }: { draft: Draft }) {
	return (
		<main className="bg-muted/30 grid min-h-screen place-items-center px-4">
			<div className="w-full max-w-md text-center">
				<div className="bg-primary/10 mx-auto grid size-16 place-items-center rounded-full">
					<Icon name="update" size="xl" className="text-primary animate-spin" />
				</div>
				<h1 className="text-foreground mt-6 text-xl font-bold">
					Building your plan
				</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Periodizing toward {draft.selectedEvent?.name ?? 'your goal'}.
				</p>
				<ul className="mt-8 space-y-3 text-left">
					{PROGRESS_STEPS.map((msg, i) => {
						const done = i < draft.progress
						const active = i === draft.progress
						return (
							<li
								key={i}
								className={cn(
									'flex items-center gap-3 text-sm transition',
									done || active
										? 'text-foreground'
										: 'text-muted-foreground/50',
								)}
							>
								<span
									className={cn(
										'grid size-6 place-items-center rounded-full',
										done
											? 'bg-primary text-primary-foreground'
											: active
												? 'bg-primary/20 text-primary'
												: 'bg-muted',
									)}
								>
									{done ? (
										<Icon name="check" size="xs" />
									) : active ? (
										<Icon name="loader-2" size="xs" className="animate-spin" />
									) : (
										<span className="bg-muted-foreground/40 size-1.5 rounded-full" />
									)}
								</span>
								{msg}
							</li>
						)
					})}
				</ul>
			</div>
		</main>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT B — Split Studio
// Dense control panel (left) + live preview (right). Desktop-first; stacks on
// mobile with a sticky generate bar.
// ════════════════════════════════════════════════════════════════════════════

function VariantStudio({ draft }: { draft: Draft }) {
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	return (
		<main className="min-h-screen">
			<div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[380px_1fr]">
				{/* Control panel */}
				<div className="border-border lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r">
					<div className="flex flex-col gap-6 p-6">
						<div>
							<Link
								to="/"
								className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
							>
								<Icon name="arrow-left" size="sm" />
								Dashboard
							</Link>
							<h1 className="text-foreground mt-3 text-xl font-bold tracking-tight">
								Plan studio
							</h1>
							<p className="text-muted-foreground text-sm">
								Tune the inputs — the preview updates on generate.
							</p>
						</div>

						<Field label="Goal">
							<textarea
								value={draft.goal}
								onChange={(e) => draft.setGoal(e.target.value)}
								placeholder="e.g. Sub-2:00 half marathon"
								className="border-border bg-background focus-visible:ring-ring/30 min-h-20 w-full rounded-xl border p-3 text-sm outline-none focus-visible:ring-3"
							/>
						</Field>

						<Field label="Sports">
							<div className="flex flex-wrap gap-2">
								{CARDIO_DISCIPLINES.map((d) => (
									<DisciplineChip
										key={d}
										discipline={d}
										selected={draft.disciplines.includes(d)}
										onClick={() => draft.toggleDiscipline(d)}
										size="sm"
									/>
								))}
							</div>
						</Field>

						<Field label="Experience">
							<div className="border-border flex rounded-xl border p-1">
								{EXPERIENCE_LEVELS.map((level) => (
									<button
										key={level}
										type="button"
										onClick={() => draft.setExperience(level)}
										className={cn(
											'flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition',
											draft.experience === level
												? 'bg-primary text-primary-foreground'
												: 'text-muted-foreground hover:text-foreground',
										)}
									>
										{EXPERIENCE_LABELS[level]}
									</button>
								))}
							</div>
						</Field>

						<Field label="Target event">
							<select
								value={draft.targetEventId}
								onChange={(e) => draft.setTargetEventId(e.target.value)}
								className="border-border bg-background w-full rounded-xl border p-2.5 text-sm"
							>
								<option value="">No event — set a horizon</option>
								{draft.targetEvents.map((e) => (
									<option key={e.id} value={e.id}>
										{e.name} · {fmtEvent(e.startDate)}
									</option>
								))}
							</select>
							{!draft.targetEventId ? (
								<div className="mt-3 flex items-center gap-3">
									<input
										type="range"
										min={4}
										max={24}
										value={draft.horizonWeeks}
										onChange={(e) =>
											draft.setHorizonWeeks(Number(e.target.value))
										}
										className="accent-primary flex-1"
									/>
									<span className="text-foreground w-16 text-right text-sm font-semibold">
										{draft.horizonWeeks} wk
									</span>
								</div>
							) : (
								<p className="text-muted-foreground mt-2 text-xs">
									{draft.effectiveHorizon} weeks out · horizon derived from
									event
								</p>
							)}
						</Field>

						<div className="border-border bg-background sticky bottom-0 -mx-6 border-t px-6 py-4">
							{hasPlan ? (
								<div className="flex gap-2">
									<Button
										className="flex-1"
										onClick={draft.approve}
										disabled={draft.status === 'approved'}
									>
										<Icon name="check" size="sm" />
										{draft.status === 'approved' ? 'Approved' : 'Approve'}
									</Button>
									<Button variant="outline" onClick={draft.generate}>
										<Icon name="update" size="sm" />
									</Button>
								</div>
							) : (
								<Button
									className="w-full"
									size="lg"
									onClick={draft.generate}
									disabled={!draft.canGenerate}
								>
									Generate plan
									<Icon name="arrow-right" size="sm" />
								</Button>
							)}
						</div>
					</div>
				</div>

				{/* Preview pane */}
				<div className="bg-muted/20 min-h-screen p-6 lg:p-10">
					<StudioPreview draft={draft} />
				</div>
			</div>
		</main>
	)
}

function Field({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-foreground text-xs font-semibold tracking-wide uppercase">
				{label}
			</span>
			{children}
		</div>
	)
}

function StudioPreview({ draft }: { draft: Draft }) {
	if (draft.status === 'idle') {
		return (
			<div className="grid h-full min-h-[60vh] place-items-center">
				<div className="max-w-sm text-center">
					<div className="border-border text-muted-foreground/40 mx-auto grid size-20 place-items-center rounded-2xl border-2 border-dashed">
						<Icon name="bar-chart" size="xl" />
					</div>
					<h2 className="text-foreground mt-5 font-semibold">
						Your plan appears here
					</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						Set your goal and sports, then hit{' '}
						<span className="text-foreground font-medium">Generate plan</span>.
						Nothing is saved until you approve.
					</p>
				</div>
			</div>
		)
	}

	if (draft.status === 'generating') {
		return (
			<div className="space-y-4">
				<div className="bg-card border-border h-24 animate-pulse rounded-2xl border" />
				<div className="grid gap-3 sm:grid-cols-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="bg-card border-border h-32 animate-pulse rounded-xl border"
						/>
					))}
				</div>
			</div>
		)
	}

	const preview = draft.preview!
	const byWeek = new Map<number, PreviewSession[]>()
	for (const s of preview.sessions) {
		const arr = byWeek.get(s.weekIndex) ?? []
		arr.push(s)
		byWeek.set(s.weekIndex, arr)
	}

	return (
		<div className="space-y-6">
			{draft.status === 'approved' ? <ApprovedBanner /> : null}
			<div>
				<div className="flex items-end justify-between">
					<div>
						<p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
							Plan outline
						</p>
						<h2 className="text-foreground text-2xl font-bold tracking-tight">
							{draft.effectiveHorizon}-week plan
							{draft.selectedEvent ? ` → ${draft.selectedEvent.name}` : ''}
						</h2>
					</div>
					<span className="text-muted-foreground text-sm">
						{preview.sessions.length} sessions detailed
					</span>
				</div>
				<div className="border-border bg-card mt-4 rounded-2xl border p-5">
					<PhaseRibbon outline={preview.outline} />
					<div className="border-border mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
						{preview.outline.phases.map((p, i) => (
							<div key={i}>
								<p className="text-foreground font-semibold">{p.name}</p>
								<p className="text-muted-foreground text-xs">{p.focus}</p>
								<p className="text-muted-foreground mt-1 text-xs">
									{p.weeklyLoadHours} h/wk
								</p>
							</div>
						))}
					</div>
				</div>
			</div>

			{[...byWeek.entries()].map(([week, sessions]) => (
				<div key={week}>
					<h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
						Week {week + 1}
					</h3>
					<div className="grid gap-3 sm:grid-cols-2">
						{sessions.map((s, i) => (
							<SessionCard key={i} session={s} />
						))}
					</div>
				</div>
			))}
		</div>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT C — Coach Chat
// Conversational column. The planner asks; the athlete answers inline. The plan
// arrives as a rich coach message.
// ════════════════════════════════════════════════════════════════════════════

function VariantChat({ draft }: { draft: Draft }) {
	const showPlan = draft.status === 'preview' || draft.status === 'approved'
	return (
		<main className="bg-muted/20 min-h-screen">
			<header className="border-border bg-background/80 sticky top-0 z-10 border-b backdrop-blur-md">
				<div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
					<CoachAvatar />
					<div className="flex-1">
						<p className="text-foreground text-sm font-semibold">Coach</p>
						<p className="text-muted-foreground text-xs">
							Building your training plan
						</p>
					</div>
					<Link
						to="/"
						className="text-muted-foreground hover:text-foreground"
						aria-label="Close"
					>
						<Icon name="cross-1" size="sm" />
					</Link>
				</div>
			</header>

			<div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
				<CoachBubble>
					Hi! I'm your coach. Let's design a training plan together. First —
					what are you training for?
				</CoachBubble>

				<UserBubble>
					<textarea
						value={draft.goal}
						onChange={(e) => draft.setGoal(e.target.value)}
						placeholder="Type your goal…"
						rows={2}
						className="placeholder:text-primary-foreground/60 w-full resize-none bg-transparent text-sm outline-none"
					/>
				</UserBubble>

				<CoachBubble>Nice. Which sports should I program?</CoachBubble>
				<div className="flex flex-wrap justify-end gap-2">
					{CARDIO_DISCIPLINES.map((d) => (
						<DisciplineChip
							key={d}
							discipline={d}
							selected={draft.disciplines.includes(d)}
							onClick={() => draft.toggleDiscipline(d)}
						/>
					))}
				</div>

				<CoachBubble>And how would you describe your experience?</CoachBubble>
				<div className="flex flex-wrap justify-end gap-2">
					{EXPERIENCE_LEVELS.map((level) => (
						<button
							key={level}
							type="button"
							onClick={() => draft.setExperience(level)}
							aria-pressed={draft.experience === level}
							className={cn(
								'rounded-full border px-4 py-2 text-sm font-medium transition',
								draft.experience === level
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border bg-background text-muted-foreground hover:bg-muted',
							)}
						>
							{EXPERIENCE_LABELS[level]}
						</button>
					))}
				</div>

				<CoachBubble>
					When are we peaking? Pick an event, or tell me how many weeks you've
					got.
				</CoachBubble>
				<div className="flex flex-col items-end gap-2">
					{draft.targetEvents.map((event) => (
						<button
							key={event.id}
							type="button"
							onClick={() => draft.setTargetEventId(event.id)}
							className={cn(
								'flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition',
								draft.targetEventId === event.id
									? 'border-primary bg-primary/10 text-foreground'
									: 'border-border bg-background text-muted-foreground hover:bg-muted',
							)}
						>
							<Icon name="calendar" size="sm" className="text-primary" />
							{event.name}
							<span className="text-muted-foreground text-xs">
								· {weeksUntil(event.startDate)}w
							</span>
						</button>
					))}
					<button
						type="button"
						onClick={() => draft.setTargetEventId('')}
						className={cn(
							'flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm transition',
							!draft.targetEventId
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border bg-background text-muted-foreground hover:bg-muted',
						)}
					>
						<Icon name="clock" size="sm" />
						{!draft.targetEventId ? (
							<>
								<input
									type="range"
									min={4}
									max={24}
									value={draft.horizonWeeks}
									onChange={(e) =>
										draft.setHorizonWeeks(Number(e.target.value))
									}
									className="accent-primary w-32"
								/>
								<span className="font-semibold">
									{draft.horizonWeeks} weeks
								</span>
							</>
						) : (
							'No event — set a horizon'
						)}
					</button>
				</div>

				{draft.status === 'generating' ? (
					<CoachBubble>
						<span className="flex items-center gap-2">
							<Icon name="loader-2" size="sm" className="animate-spin" />
							Putting your {draft.effectiveHorizon}-week plan together…
						</span>
					</CoachBubble>
				) : null}

				{showPlan && draft.preview ? (
					<ChatPlanMessage draft={draft} preview={draft.preview} />
				) : draft.status === 'idle' ? (
					<div className="flex justify-center pt-2">
						<Button
							size="lg"
							onClick={draft.generate}
							disabled={!draft.canGenerate}
						>
							<Icon name="check" size="sm" />
							Build my plan
						</Button>
					</div>
				) : null}
			</div>
		</main>
	)
}

function ChatPlanMessage({
	draft,
	preview,
}: {
	draft: Draft
	preview: PlanPreview
}) {
	return (
		<div className="flex gap-3">
			<CoachAvatar />
			<div className="flex-1 space-y-3">
				<div className="border-border bg-card rounded-2xl rounded-tl-sm border p-5 shadow-sm">
					<p className="text-foreground font-semibold">
						Here's your {draft.effectiveHorizon}-week plan
						{draft.selectedEvent ? ` for ${draft.selectedEvent.name}` : ''} 🎯
					</p>
					<p className="text-muted-foreground mt-1 text-sm">
						{preview.outline.phases.length} phases · {preview.sessions.length}{' '}
						sessions ready to go.
					</p>
					<div className="mt-4">
						<PhaseRibbon outline={preview.outline} />
					</div>
				</div>

				<div className="space-y-2">
					{preview.sessions.map((s, i) => (
						<SessionCard key={i} session={s} dense />
					))}
				</div>

				{draft.status === 'approved' ? (
					<ApprovedBanner />
				) : (
					<div className="flex flex-wrap gap-2">
						<Button onClick={draft.approve}>
							<Icon name="check" size="sm" />
							Looks great — save it
						</Button>
						<Button variant="outline" onClick={draft.generate}>
							<Icon name="update" size="sm" />
							Try again
						</Button>
						<Button variant="ghost" onClick={draft.discard}>
							Discard
						</Button>
					</div>
				)}
			</div>
		</div>
	)
}

function CoachAvatar() {
	return (
		<span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold">
			C
		</span>
	)
}

function CoachBubble({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex gap-3">
			<CoachAvatar />
			<div className="border-border bg-card text-foreground max-w-[80%] rounded-2xl rounded-tl-sm border px-4 py-3 text-sm shadow-sm">
				{children}
			</div>
		</div>
	)
}

function UserBubble({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex justify-end">
			<div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm">
				{children}
			</div>
		</div>
	)
}
