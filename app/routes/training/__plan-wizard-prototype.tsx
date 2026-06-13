// PROTOTYPE — three step-based WIZARDS for building a training plan, radically
// different in how the stepping works. Switchable via
// `?variant=rail|sidebar|focus` on `/training/plan/new` and the floating
// PrototypeSwitcher (arrow keys cycle).
//
//   rail    — classic top progress-rail, one decision per screen, Back/Continue.
//   sidebar — vertical numbered step list you can jump around (desktop) /
//             accordion (mobile).
//   focus   — full-bleed one-question-at-a-time (Typeform-style), thin progress
//             bar, Enter to advance.
//
// All carry the corrected foundation from the prototype review: collects every
// input the generator needs (incl. experience), an honest projected-weekly-load
// strip in the preview (the plan's Planned load in hours — never a fabricated
// CTL; CONTEXT.md: derived metrics are never authored), accessible controls,
// and the regeneration nuance surfaced.
//
// Filename starts with `__` so react-router-auto-routes ignores it. Generation
// + approve are STUBBED. Fold the winner into `plan.new.tsx` and delete this
// file + the switcher branch when chosen.

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
	PrototypeSwitcher,
	type PrototypeVariant,
} from '#app/components/prototype-switcher.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
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
	{ key: 'rail', name: 'Progress Rail' },
	{ key: 'sidebar', name: 'Step Sidebar' },
	{ key: 'focus', name: 'Focus (one-at-a-time)' },
] as const satisfies readonly PrototypeVariant[]

export type PlanWizardVariantKey = (typeof PLAN_WIZARD_VARIANTS)[number]['key']

export function isPlanWizardVariant(
	value: string | null | undefined,
): value is PlanWizardVariantKey {
	return PLAN_WIZARD_VARIANTS.some((v) => v.key === value)
}

export type TargetEventOption = { id: string; name: string; startDate: Date }

// ── Visual language ──────────────────────────────────────────────────────────

type Style = { dot: string; chip: string; ring: string }
const DISCIPLINE_STYLE: Record<CardioDiscipline, Style> = {
	run: { dot: 'bg-orange-500', chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', ring: 'ring-orange-400/40' },
	bike: { dot: 'bg-sky-500', chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', ring: 'ring-sky-400/40' },
	swim: { dot: 'bg-cyan-500', chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', ring: 'ring-cyan-400/40' },
}
function intentTone(intent: WorkoutIntent): 'easy' | 'mod' | 'hard' {
	if (['recovery', 'endurance', 'technique', 'mobility'].includes(intent)) return 'easy'
	if (['tempo', 'threshold', 'test'].includes(intent)) return 'mod'
	return 'hard'
}
const TONE_STYLE: Record<'easy' | 'mod' | 'hard', string> = {
	easy: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	mod: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	hard: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}
const PHASE_HEX = ['#10b981', '#f59e0b', '#f43f5e', '#0ea5e9']

const EXPERIENCE_BLURB: Record<ExperienceLevel, string> = {
	beginner: 'New to structured training — gentle, steady ramp.',
	intermediate: 'Train regularly — balanced progression.',
	advanced: 'Seasoned — higher volume and intensity.',
}

// ── Draft state + stub ───────────────────────────────────────────────────────

type Status = 'idle' | 'generating' | 'preview' | 'approved'

function useDraft(targetEvents: TargetEventOption[]) {
	const [disciplines, setDisciplines] = useState<CardioDiscipline[]>(['run'])
	const [experience, setExperience] = useState<ExperienceLevel>('intermediate')
	const [goal, setGoal] = useState('')
	const [horizonWeeks, setHorizonWeeks] = useState(8)
	const [targetEventId, setTargetEventId] = useState('')
	const [status, setStatus] = useState<Status>('idle')
	const [preview, setPreview] = useState<PlanPreview | null>(null)

	const selectedEvent = targetEvents.find((e) => e.id === targetEventId) ?? null
	const derivedHorizon = selectedEvent ? weeksUntil(selectedEvent.startDate) : null
	const effectiveHorizon = derivedHorizon ?? horizonWeeks

	function toggleDiscipline(d: CardioDiscipline) {
		setDisciplines((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
	}
	function generate() {
		setStatus('generating')
		setPreview(null)
		setTimeout(() => {
			setPreview(buildSamplePreview({ disciplines, horizon: effectiveHorizon }))
			setStatus('preview')
		}, 600)
	}
	function restart() {
		setStatus('idle')
		setPreview(null)
	}
	function approve() {
		setStatus('approved')
	}
	const canGenerate = disciplines.length > 0 && goal.trim().length > 0

	return {
		disciplines, experience, goal, horizonWeeks, targetEventId,
		targetEvents, selectedEvent, effectiveHorizon, status, preview, canGenerate,
		setExperience, setGoal, setHorizonWeeks, setTargetEventId, toggleDiscipline,
		generate, restart, approve,
	}
}
type Draft = ReturnType<typeof useDraft>

// ── Sample preview ───────────────────────────────────────────────────────────

function buildSamplePreview({ disciplines, horizon }: { disciplines: CardioDiscipline[]; horizon: number }): PlanPreview {
	const sports = disciplines.length ? disciplines : (['run'] as const)
	return { outline: buildOutline(horizon), sessions: buildSessions(sports, sports[0]!) }
}
function buildOutline(weeks: number): PlanPreview['outline'] {
	const taper = weeks >= 4 ? 1 : 0
	const peak = weeks >= 8 ? 1 : 0
	const remaining = weeks - taper - peak
	const base = Math.max(1, Math.round(remaining * 0.6))
	const build = Math.max(0, remaining - base)
	const phases = [
		{ name: 'Base', weeks: base, focus: 'Aerobic foundation & durability', hrs: 5 },
		build > 0 && { name: 'Build', weeks: build, focus: 'Threshold & VO₂ sharpening', hrs: 7 },
		peak > 0 && { name: 'Peak', weeks: peak, focus: 'Race-specific intensity', hrs: 6 },
		taper > 0 && { name: 'Taper', weeks: taper, focus: 'Freshen up, hold sharpness', hrs: 3 },
	].filter(Boolean) as Array<{ name: string; weeks: number; focus: string; hrs: number }>
	return { phases: phases.map((p) => ({ name: p.name, weeks: p.weeks, focus: p.focus, weeklyLoadHours: p.hrs })) }
}
function at(daysFromNow: number, hour: number): Date {
	const d = new Date()
	d.setHours(hour, 0, 0, 0)
	d.setDate(d.getDate() + daysFromNow)
	return d
}
function cardio(discipline: CardioDiscipline, opts: { durationSec?: number; distanceM?: number; label?: string; hr?: [number, number] }): PreviewStep {
	return { kind: 'cardio', discipline, durationSec: opts.durationSec, distanceM: opts.distanceM, intensity: opts.label ? { kind: 'zoneLabel', label: opts.label } : undefined, resolvedIntensity: opts.hr ? { hrMin: opts.hr[0], hrMax: opts.hr[1] } : undefined }
}
function rest(durationSec: number): PreviewStep {
	return { kind: 'rest', durationSec }
}
function buildSessions(sports: readonly CardioDiscipline[], primary: CardioDiscipline): PreviewSession[] {
	const second = sports[1] ?? primary
	const raw: Array<{ day: number; hour: number; title: string; discipline: CardioDiscipline; intent: WorkoutIntent; blocks: PreviewSession['blocks'] }> = [
		{ day: 1, hour: 7, title: 'Easy aerobic base', discipline: primary, intent: 'endurance', blocks: [{ repeatCount: 1, steps: [cardio(primary, { durationSec: 2700, label: 'zone2', hr: [135, 150] })] }] },
		{ day: 2, hour: 18, title: 'Threshold intervals', discipline: primary, intent: 'threshold', blocks: [
			{ name: 'Warm-up', repeatCount: 1, steps: [cardio(primary, { durationSec: 600, label: 'easy', hr: [120, 135] })] },
			{ name: 'Main set', repeatCount: 4, steps: [cardio(primary, { durationSec: 360, label: 'threshold', hr: [165, 175] }), rest(120)] },
			{ name: 'Cool-down', repeatCount: 1, steps: [cardio(primary, { durationSec: 600, label: 'easy', hr: [115, 130] })] },
		] },
		{ day: 4, hour: 7, title: sports.length > 1 ? 'Cross-training spin' : 'Recovery jog', discipline: second, intent: 'recovery', blocks: [{ repeatCount: 1, steps: [cardio(second, { durationSec: 2400, label: 'zone2', hr: [120, 140] })] }] },
		{ day: 6, hour: 9, title: 'Long endurance', discipline: primary, intent: 'endurance', blocks: [{ repeatCount: 1, steps: [cardio(primary, { distanceM: 16000, label: 'zone2', hr: [135, 152] })] }] },
		{ day: 9, hour: 18, title: 'VO₂ max repeats', discipline: primary, intent: 'vo2max', blocks: [
			{ name: 'Warm-up', repeatCount: 1, steps: [cardio(primary, { durationSec: 900, label: 'easy', hr: [120, 138] })] },
			{ name: 'Repeats', repeatCount: 5, steps: [cardio(primary, { durationSec: 180, label: 'max', hr: [178, 188] }), rest(180)] },
		] },
		{ day: 11, hour: 9, title: 'Goal-pace tempo', discipline: primary, intent: 'tempo', blocks: [{ repeatCount: 1, steps: [cardio(primary, { durationSec: 1800, label: 'threshold', hr: [158, 170] })] }] },
	]
	return raw.map((r, i) => ({ weekIndex: Math.floor(r.day / 7), orderInWeek: i, title: r.title, discipline: r.discipline, intent: r.intent, scheduledAt: at(r.day, r.hour), blocks: r.blocks }))
}

// ── Formatting + phase helpers ───────────────────────────────────────────────

function stepLabel(step: PreviewStep): string {
	if (step.kind === 'rest') return `Rest${step.durationSec ? ` ${formatDuration(step.durationSec)}` : ''}`
	const parts: string[] = []
	if (step.durationSec) parts.push(formatDuration(step.durationSec))
	if (step.distanceM) parts.push(formatDistance(step.distanceM))
	if (step.intensity) parts.push(`@ ${step.intensity.label}`)
	if (step.resolvedIntensity?.hrMin) parts.push(`${step.resolvedIntensity.hrMin}–${step.resolvedIntensity.hrMax} bpm`)
	return parts.join(' · ') || DISCIPLINE_LABELS[step.discipline]
}
function sessionDurationMin(session: PreviewSession): number {
	let total = 0
	for (const b of session.blocks) for (const s of b.steps) total += (s.durationSec ?? 0) * b.repeatCount
	return Math.round(total / 60)
}
function fmtDay(d: Date): string {
	return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(d: Date): string {
	return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
function fmtEvent(d: Date): string {
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function weeksUntil(value: Date): number {
	const weeks = Math.ceil((value.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))
	return Math.min(52, Math.max(1, weeks))
}

type PhaseSpan = { name: string; focus: string; weeklyLoadHours: number; startWeek: number; weeks: number; colorIdx: number }
function phaseSpans(outline: PlanPreview['outline']): PhaseSpan[] {
	let cursor = 0
	return outline.phases.map((p, i) => {
		const span = { name: p.name, focus: p.focus, weeklyLoadHours: p.weeklyLoadHours, startWeek: cursor, weeks: p.weeks, colorIdx: i % PHASE_HEX.length }
		cursor += p.weeks
		return span
	})
}
function phaseForWeek(spans: PhaseSpan[], week: number): PhaseSpan {
	return spans.find((s) => week >= s.startWeek && week < s.startWeek + s.weeks) ?? spans[spans.length - 1]!
}
function weeklyLoadHours(spans: PhaseSpan[], totalWeeks: number): number[] {
	return Array.from({ length: totalWeeks }, (_, w) => phaseForWeek(spans, w).weeklyLoadHours)
}
function groupByWeek(sessions: PreviewSession[]): Map<number, PreviewSession[]> {
	const m = new Map<number, PreviewSession[]>()
	for (const s of sessions) {
		const arr = m.get(s.weekIndex) ?? []
		arr.push(s)
		m.set(s.weekIndex, arr)
	}
	return m
}

const SAMPLE_EVENTS: TargetEventOption[] = [
	{ name: 'Oslo Half Marathon', startDate: at(70, 9), id: 'sample-1' },
	{ name: 'Norseman 70.3', startDate: at(126, 7), id: 'sample-2' },
]

// ── Step model ───────────────────────────────────────────────────────────────

const STEPS = [
	{ key: 'goal', label: 'Goal' },
	{ key: 'sports', label: 'Sports' },
	{ key: 'experience', label: 'Experience' },
	{ key: 'timeline', label: 'Timeline' },
	{ key: 'review', label: 'Review' },
] as const
type StepKey = (typeof STEPS)[number]['key']

function canLeave(step: StepKey, draft: Draft): boolean {
	if (step === 'goal') return draft.goal.trim().length > 0
	if (step === 'sports') return draft.disciplines.length > 0
	return true
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function PlanWizardPrototype({ variant, targetEvents }: { variant: PlanWizardVariantKey; targetEvents: TargetEventOption[] }) {
	const events = targetEvents.length ? targetEvents : SAMPLE_EVENTS
	const draft = useDraft(events)
	return (
		<>
			{variant === 'rail' && <VariantRail draft={draft} />}
			{variant === 'sidebar' && <VariantSidebar draft={draft} />}
			{variant === 'focus' && <VariantFocus draft={draft} />}
			<PrototypeSwitcher variants={[...PLAN_WIZARD_VARIANTS]} current={variant} paramName="variant" />
		</>
	)
}

// ── Shared step body (used by all three wizards) ─────────────────────────────

function StepBody({ step, draft, large = false }: { step: StepKey; draft: Draft; large?: boolean }) {
	if (step === 'goal') {
		return (
			<StepShell n={1} title="What are you training for?" sub="Describe the goal in your own words — a race, a distance, or a feeling.">
				<textarea
					autoFocus
					value={draft.goal}
					onChange={(e) => draft.setGoal(e.target.value)}
					placeholder="e.g. Sub-2:00 half marathon"
					aria-label="Goal"
					className={cn('border-border bg-background focus-visible:ring-ring/30 w-full rounded-2xl border p-4 outline-none focus-visible:ring-3', large ? 'min-h-28 text-lg' : 'min-h-24 text-base')}
				/>
				<div className="mt-3 flex flex-wrap gap-2">
					{['Sub-2:00 half marathon', 'First Olympic triathlon', 'Build aerobic base'].map((s) => (
						<button key={s} type="button" onClick={() => draft.setGoal(s)} className="border-border bg-background hover:bg-muted text-muted-foreground rounded-full border px-3 py-1.5 text-sm transition">
							{s}
						</button>
					))}
				</div>
			</StepShell>
		)
	}
	if (step === 'sports') {
		return (
			<StepShell n={2} title="Which sports?" sub="Pick everything you want in the mix — we'll balance the week across them.">
				<div className="grid gap-3 sm:grid-cols-3">
					{CARDIO_DISCIPLINES.map((d) => {
						const selected = draft.disciplines.includes(d)
						const style = DISCIPLINE_STYLE[d]
						return (
							<button key={d} type="button" onClick={() => draft.toggleDiscipline(d)} aria-pressed={selected}
								className={cn('flex flex-col items-center gap-3 rounded-2xl border-2 p-6 transition', selected ? cn('border-transparent ring-2', style.chip, style.ring) : 'border-border bg-background hover:bg-muted')}>
								<span className={cn('size-10 rounded-full', selected ? style.dot : 'bg-muted')} />
								<span className="font-semibold">{DISCIPLINE_LABELS[d]}</span>
							</button>
						)
					})}
				</div>
			</StepShell>
		)
	}
	if (step === 'experience') {
		return (
			<StepShell n={3} title="How experienced are you?" sub="This sets how aggressively the plan ramps your weekly load.">
				<div className="flex flex-col gap-3">
					{EXPERIENCE_LEVELS.map((level) => {
						const selected = draft.experience === level
						return (
							<button key={level} type="button" onClick={() => draft.setExperience(level)} aria-pressed={selected}
								className={cn('flex items-center justify-between rounded-2xl border-2 p-5 text-left transition', selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted')}>
								<div>
									<p className="font-semibold">{EXPERIENCE_LABELS[level]}</p>
									<p className="text-muted-foreground text-sm">{EXPERIENCE_BLURB[level]}</p>
								</div>
								<span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-2', selected ? 'border-primary bg-primary' : 'border-border')}>
									{selected ? <Icon name="check" size="xs" className="text-primary-foreground" /> : null}
								</span>
							</button>
						)
					})}
				</div>
			</StepShell>
		)
	}
	if (step === 'timeline') {
		return (
			<StepShell n={4} title="When's the finish line?" sub="Anchor to an event, or set a horizon to build toward.">
				<div className="space-y-3">
					{draft.targetEvents.map((event) => {
						const selected = draft.targetEventId === event.id
						return (
							<button key={event.id} type="button" onClick={() => draft.setTargetEventId(event.id)} aria-pressed={selected}
								className={cn('flex w-full items-center justify-between rounded-2xl border-2 p-4 text-left transition', selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted')}>
								<div className="flex items-center gap-3">
									<Icon name="calendar" size="md" className="text-primary" />
									<div>
										<p className="font-semibold">{event.name}</p>
										<p className="text-muted-foreground text-sm">{fmtEvent(event.startDate)} · {weeksUntil(event.startDate)} weeks away</p>
									</div>
								</div>
								{selected ? <Icon name="circle-check" size="md" className="text-primary" /> : null}
							</button>
						)
					})}
					<div className={cn('rounded-2xl border-2 p-4 transition', !draft.targetEventId ? 'border-primary bg-primary/5' : 'border-border')}>
						<button type="button" onClick={() => draft.setTargetEventId('')} aria-pressed={!draft.targetEventId} className="flex w-full items-center gap-3 text-left">
							<Icon name="clock" size="md" className="text-muted-foreground" />
							<p className="font-semibold">No event — set a horizon</p>
						</button>
						{!draft.targetEventId ? (
							<div className="mt-3 flex items-center gap-3 pl-9">
								<input type="range" min={4} max={24} value={draft.horizonWeeks} onChange={(e) => draft.setHorizonWeeks(Number(e.target.value))} aria-label="Horizon weeks" className="accent-primary w-48" />
								<span className="text-foreground font-semibold">{draft.horizonWeeks} weeks</span>
							</div>
						) : null}
					</div>
				</div>
			</StepShell>
		)
	}
	// review
	return (
		<StepShell n={5} title="Ready to build?" sub="Here's what we'll hand to the planner. You can step back to change anything.">
			<dl className="border-border bg-card divide-border divide-y rounded-2xl border">
				<ReviewRow label="Goal" value={draft.goal || '—'} />
				<ReviewRow label="Sports" value={draft.disciplines.map((d) => DISCIPLINE_LABELS[d]).join(', ')} />
				<ReviewRow label="Experience" value={EXPERIENCE_LABELS[draft.experience]} />
				<ReviewRow label="Timeline" value={draft.selectedEvent ? `${draft.selectedEvent.name} · ${draft.effectiveHorizon} weeks` : `${draft.effectiveHorizon} weeks`} />
			</dl>
		</StepShell>
	)
}

function StepShell({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
	return (
		<div>
			<p className="text-primary text-xs font-semibold tracking-wide uppercase">Step {n} of {STEPS.length}</p>
			<h1 className="text-foreground mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
			<p className="text-muted-foreground mt-2">{sub}</p>
			<div className="mt-6">{children}</div>
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

// ── Generating + Preview (shared) ────────────────────────────────────────────

function GeneratingScreen({ draft }: { draft: Draft }) {
	const msgs = ['Shaping the periodization…', 'Placing sessions on your week…', 'Resolving intensity zones…']
	return (
		<div className="grid min-h-[50vh] place-items-center">
			<div className="w-full max-w-md text-center">
				<div className="bg-primary/10 mx-auto grid size-16 place-items-center rounded-full">
					<Icon name="update" size="xl" className="text-primary animate-spin" />
				</div>
				<h2 className="text-foreground mt-6 text-xl font-bold">Building your plan</h2>
				<p className="text-muted-foreground mt-1 text-sm">Periodizing toward {draft.selectedEvent?.name ?? 'your goal'}.</p>
				<ul className="text-muted-foreground mt-6 space-y-2 text-left text-sm">
					{msgs.map((m, i) => (
						<li key={i} className="flex items-center gap-2">
							<Icon name="loader-2" size="xs" className="animate-spin" />
							{m}
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

function SessionCard({ session }: { session: PreviewSession }) {
	const style = DISCIPLINE_STYLE[session.discipline]
	const tone = intentTone(session.intent)
	const min = sessionDurationMin(session)
	return (
		<div className="border-border bg-card rounded-xl border p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', style.chip)}>
							<span className={cn('size-1.5 rounded-full', style.dot)} />
							{DISCIPLINE_LABELS[session.discipline]}
						</span>
						<span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase', TONE_STYLE[tone])}>{INTENT_LABELS[session.intent]}</span>
					</div>
					<h4 className="text-foreground mt-2 font-semibold">{session.title}</h4>
				</div>
				<div className="text-right">
					<p className="text-foreground text-sm font-medium whitespace-nowrap">{fmtDay(session.scheduledAt)}</p>
					<p className="text-muted-foreground text-xs">{fmtTime(session.scheduledAt)}{min > 0 ? ` · ${min} min` : ''}</p>
				</div>
			</div>
			<ul className="mt-3 space-y-1">
				{session.blocks.map((block, bi) => (
					<li key={bi} className="text-muted-foreground text-sm">
						{block.repeatCount > 1 ? <span className="text-foreground font-medium">{block.repeatCount}× </span> : null}
						{block.steps.map((s) => stepLabel(s)).join(' → ')}
					</li>
				))}
			</ul>
		</div>
	)
}

function PhaseRibbon({ spans }: { spans: PhaseSpan[] }) {
	const total = spans.reduce((s, p) => s + p.weeks, 0)
	return (
		<div>
			<div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label="Plan phases">
				{spans.map((p, i) => (
					<div key={i} className="h-full" style={{ width: `${(p.weeks / total) * 100}%`, background: PHASE_HEX[p.colorIdx] }} title={`${p.name} · ${p.weeks}w`} />
				))}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
				{spans.map((p, i) => (
					<div key={i} className="flex items-center gap-1.5 text-xs">
						<span className="size-2 rounded-full" style={{ background: PHASE_HEX[p.colorIdx] }} />
						<span className="text-foreground font-medium">{p.name}</span>
						<span className="text-muted-foreground">{p.weeks}w · {p.weeklyLoadHours}h/wk</span>
					</div>
				))}
			</div>
		</div>
	)
}

function LoadProjection({ hours, spans, totalWeeks }: { hours: number[]; spans: PhaseSpan[]; totalWeeks: number }) {
	const W = 1000, H = 130, padX = 14, padTop = 14, padBottom = 22
	const plotW = W - padX * 2, plotH = H - padTop - padBottom
	const maxH = Math.max(...hours, 1)
	const x = (w: number) => padX + (w / totalWeeks) * plotW
	const colW = plotW / totalWeeks
	const baseline = padTop + plotH
	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="text-primary w-full" role="img" aria-label="Projected weekly training load in hours">
			{hours.map((h, w) => {
				const bh = (h / maxH) * plotH
				const sp = phaseForWeek(spans, w)
				return (
					<g key={w}>
						<rect x={x(w) + colW * 0.18} y={baseline - bh} width={colW * 0.64} height={bh} rx={3} fill={PHASE_HEX[sp.colorIdx]} opacity={0.8} />
						{colW > 30 ? <text x={x(w) + colW / 2} y={baseline + 15} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.4}>{w + 1}</text> : null}
					</g>
				)
			})}
			<line x1={x(0)} y1={baseline} x2={x(totalWeeks)} y2={baseline} stroke="currentColor" strokeOpacity={0.15} />
		</svg>
	)
}

function WizardPreview({ draft, onRestart }: { draft: Draft; onRestart: () => void }) {
	const spans = draft.preview ? phaseSpans(draft.preview.outline) : []
	const totalWeeks = draft.effectiveHorizon
	const byWeek = groupByWeek(draft.preview?.sessions ?? [])
	const hours = weeklyLoadHours(spans, totalWeeks)
	return (
		<div className="space-y-6">
			{draft.status === 'approved' ? (
				<div className="border-primary/30 bg-primary/10 text-primary flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium">
					<Icon name="circle-check" size="md" />
					Approved — sessions are on your calendar.
					<span className="text-muted-foreground ml-auto text-xs font-normal">prototype — nothing saved</span>
				</div>
			) : null}
			<div className="flex items-baseline justify-between">
				<div>
					<p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Your plan</p>
					<h1 className="text-foreground text-2xl font-bold tracking-tight">{totalWeeks}-week build{draft.selectedEvent ? ` → ${draft.selectedEvent.name}` : ''}</h1>
				</div>
				<Button variant="ghost" size="sm" onClick={onRestart}>
					<Icon name="pencil-1" size="sm" />
					Edit answers
				</Button>
			</div>

			<div className="border-border bg-card rounded-2xl border p-5">
				<div className="mb-1 flex items-baseline justify-between">
					<h2 className="text-foreground text-sm font-semibold">Plan outline</h2>
					<span className="text-muted-foreground text-xs">projected weekly load (hours) — a projection, not a guarantee</span>
				</div>
				<LoadProjection hours={hours} spans={spans} totalWeeks={totalWeeks} />
				<div className="mt-2"><PhaseRibbon spans={spans} /></div>
			</div>

			{[...byWeek.entries()].map(([w, sessions]) => (
				<div key={w}>
					<h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">Week {w + 1} · {phaseForWeek(spans, w).name}</h2>
					<div className="grid gap-3 sm:grid-cols-2">
						{sessions.map((s, i) => <SessionCard key={i} session={s} />)}
					</div>
				</div>
			))}

			{draft.status !== 'approved' ? (
				<div className="flex flex-col gap-2">
					<div className="flex flex-wrap gap-2">
						<Button onClick={draft.approve}>
							<Icon name="check" size="sm" />
							Approve &amp; save
						</Button>
						<Button variant="outline" onClick={draft.generate}>
							<Icon name="update" size="sm" />
							Regenerate
						</Button>
					</div>
					<p className="text-muted-foreground text-xs">Regenerating replaces only future generated sessions — your completed and hand-edited sessions are never touched.</p>
				</div>
			) : (
				<Button render={<Link to="/" />}>Go to dashboard</Button>
			)}
		</div>
	)
}

function TopBar() {
	return (
		<Link to="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
			<Icon name="arrow-left" size="sm" />
			Dashboard
		</Link>
	)
}

// Shared step navigation hook.
function useStepper() {
	const [index, setIndex] = useState(0)
	const [maxVisited, setMaxVisited] = useState(0)
	const step = STEPS[index]!.key
	function go(to: number) {
		const clamped = Math.max(0, Math.min(STEPS.length - 1, to))
		setIndex(clamped)
		setMaxVisited((m) => Math.max(m, clamped))
	}
	return { index, step, maxVisited, isLast: index === STEPS.length - 1, next: () => go(index + 1), back: () => go(index - 1), goTo: go }
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — PROGRESS RAIL (classic top stepper)
// ════════════════════════════════════════════════════════════════════════════

function VariantRail({ draft }: { draft: Draft }) {
	const { index, step, isLast, next, back, goTo } = useStepper()
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'

	if (hasPlan) {
		return (
			<main className="bg-muted/20 min-h-screen px-4 py-10">
				<div className="mx-auto max-w-2xl">
					<TopBar />
					<div className="mt-6"><WizardPreview draft={draft} onRestart={draft.restart} /></div>
				</div>
			</main>
		)
	}
	if (draft.status === 'generating') {
		return <main className="bg-muted/20 min-h-screen px-4 py-10"><GeneratingScreen draft={draft} /></main>
	}

	return (
		<main className="bg-muted/20 flex min-h-screen flex-col px-4 py-8">
			<div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
				<TopBar />
				{/* Rail */}
				<ol className="mt-6 mb-10 flex items-center" aria-label="Progress">
					{STEPS.map((s, i) => {
						const done = i < index
						const active = i === index
						return (
							<li key={s.key} className="flex flex-1 items-center last:flex-none">
								<button type="button" onClick={() => i <= index && goTo(i)} aria-current={active ? 'step' : undefined}
									className={cn('grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition', active ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>
									{done ? <Icon name="check" size="sm" /> : i + 1}
								</button>
								{i < STEPS.length - 1 ? <div className={cn('mx-1 h-0.5 flex-1 rounded-full', done ? 'bg-primary' : 'bg-border')} /> : null}
							</li>
						)
					})}
				</ol>

				<div className="flex-1"><StepBody step={step} draft={draft} /></div>
			</div>

			<div className="mx-auto mt-8 flex w-full max-w-xl items-center justify-between">
				<Button variant="ghost" size="lg" onClick={back} disabled={index === 0}>
					<Icon name="arrow-left" size="sm" />
					Back
				</Button>
				{isLast ? (
					<Button size="lg" onClick={draft.generate} disabled={!draft.canGenerate}>Generate plan<Icon name="arrow-right" size="sm" /></Button>
				) : (
					<Button size="lg" onClick={next} disabled={!canLeave(step, draft)}>Continue<Icon name="arrow-right" size="sm" /></Button>
				)}
			</div>
		</main>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — STEP SIDEBAR (vertical, jump-around on desktop; accordion on mobile)
// ════════════════════════════════════════════════════════════════════════════

function VariantSidebar({ draft }: { draft: Draft }) {
	const { index, step, maxVisited, isLast, next, back, goTo } = useStepper()
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'

	return (
		<main className="bg-background min-h-screen">
			<div className="mx-auto grid max-w-5xl gap-0 md:grid-cols-[260px_1fr]">
				{/* Sidebar */}
				<aside className="border-border md:min-h-screen md:border-r">
					<div className="flex flex-col gap-6 p-6">
						<TopBar />
						<div>
							<h2 className="text-foreground text-lg font-bold tracking-tight">New plan</h2>
							<p className="text-muted-foreground text-sm">{hasPlan ? 'Review your plan.' : `Step ${index + 1} of ${STEPS.length}`}</p>
						</div>
						<ol className="hidden flex-col gap-1 md:flex">
							{STEPS.map((s, i) => {
								const done = i < maxVisited || hasPlan
								const active = i === index && !hasPlan
								const reachable = i <= maxVisited && !hasPlan
								return (
									<li key={s.key}>
										<button type="button" disabled={!reachable} onClick={() => goTo(i)} aria-current={active ? 'step' : undefined}
											className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition', active ? 'bg-primary/10 text-foreground font-semibold' : reachable ? 'text-muted-foreground hover:bg-muted' : 'text-muted-foreground/40')}>
											<span className={cn('grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold', active ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-primary text-primary' : 'border-border')}>
												{done && !active ? <Icon name="check" size="xs" /> : i + 1}
											</span>
											{s.label}
										</button>
									</li>
								)
							})}
						</ol>
					</div>
				</aside>

				{/* Content */}
				<div className="p-6 md:p-10">
					{/* Mobile progress bar */}
					{!hasPlan ? (
						<div className="mb-6 md:hidden">
							<div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
								<div className="bg-primary h-full rounded-full transition-all" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
							</div>
						</div>
					) : null}

					{hasPlan ? (
						<WizardPreview draft={draft} onRestart={draft.restart} />
					) : draft.status === 'generating' ? (
						<GeneratingScreen draft={draft} />
					) : (
						<div className="mx-auto max-w-xl">
							<StepBody step={step} draft={draft} />
							<div className="mt-8 flex items-center justify-between">
								<Button variant="ghost" size="lg" onClick={back} disabled={index === 0}>
									<Icon name="arrow-left" size="sm" />
									Back
								</Button>
								{isLast ? (
									<Button size="lg" onClick={draft.generate} disabled={!draft.canGenerate}>Generate plan<Icon name="arrow-right" size="sm" /></Button>
								) : (
									<Button size="lg" onClick={next} disabled={!canLeave(step, draft)}>Continue<Icon name="arrow-right" size="sm" /></Button>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</main>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — FOCUS (full-bleed one-question-at-a-time, Enter to advance)
// ════════════════════════════════════════════════════════════════════════════

function VariantFocus({ draft }: { draft: Draft }) {
	const { index, step, isLast, next, back } = useStepper()
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	const advance = isLast ? () => draft.canGenerate && draft.generate() : () => canLeave(step, draft) && next()

	useEffect(() => {
		if (hasPlan || draft.status === 'generating') return
		function onKey(e: KeyboardEvent) {
			if (e.key !== 'Enter') return
			const t = e.target as HTMLElement | null
			if (t && t.tagName === 'TEXTAREA') return // let goal textarea take newlines
			e.preventDefault()
			advance()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	if (hasPlan) {
		return (
			<main className="bg-muted/20 min-h-screen px-4 py-10">
				<div className="mx-auto max-w-2xl">
					<TopBar />
					<div className="mt-6"><WizardPreview draft={draft} onRestart={draft.restart} /></div>
				</div>
			</main>
		)
	}
	if (draft.status === 'generating') {
		return <main className="grid min-h-screen place-items-center px-4"><GeneratingScreen draft={draft} /></main>
	}

	return (
		<main className="bg-background flex min-h-screen flex-col">
			{/* Thin progress bar */}
			<div className="bg-muted h-1 w-full">
				<div className="bg-primary h-full transition-all" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
			</div>
			<div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
				<TopBar />
				<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{index + 1} / {STEPS.length}</span>
			</div>

			<div className="flex flex-1 items-center px-4">
				<div className="mx-auto w-full max-w-2xl pb-16">
					<StepBody step={step} draft={draft} large />
					<div className="mt-10 flex items-center gap-4">
						{isLast ? (
							<Button size="lg" onClick={draft.generate} disabled={!draft.canGenerate}>Generate plan<Icon name="arrow-right" size="sm" /></Button>
						) : (
							<Button size="lg" onClick={next} disabled={!canLeave(step, draft)}>Continue<Icon name="arrow-right" size="sm" /></Button>
						)}
						<span className="text-muted-foreground hidden text-sm sm:inline">press <kbd className="border-border bg-muted rounded border px-1.5 py-0.5 text-xs">Enter ↵</kbd></span>
						{index > 0 ? (
							<button type="button" onClick={back} className="text-muted-foreground hover:text-foreground ml-auto text-sm">Back</button>
						) : null}
					</div>
				</div>
			</div>
		</main>
	)
}
