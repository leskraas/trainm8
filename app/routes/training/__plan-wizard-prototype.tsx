// PROTOTYPE — three *unconventional*, app-native takes on building a training
// plan. Switchable via `?variant=tape|curve|summit` on `/training/plan/new`
// and the floating PrototypeSwitcher (arrow keys cycle).
//
//   tape   — The Tape: build the plan ON a horizontal time-ribbon (the app's
//            signature primitive). Now → event, phases as bands, sessions as tiles.
//   curve  — Load Sculptor: the projected fitness curve is the hero; you sculpt
//            the form you're buying and sessions are derived from the shape.
//   summit — The Ascent: the plan as a route climbing to your event summit,
//            phases as altitude camps.
//
// Filename starts with `__` so react-router-auto-routes ignores it. Generation
// + approve are STUBBED (no SSE, no DB write) so every state is clickable and
// screenshot-able without a backend. Fold the winner into `plan.new.tsx` and
// delete this file + the switcher branch when a direction is chosen.

import { useState } from 'react'
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
	{ key: 'tape', name: 'The Tape' },
	{ key: 'curve', name: 'Load Sculptor' },
	{ key: 'summit', name: 'The Ascent' },
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

const DISCIPLINE_HEX: Record<CardioDiscipline, string> = {
	run: '#f97316',
	bike: '#0ea5e9',
	swim: '#06b6d4',
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

// Phase palette (index order = Base, Build, Peak, Taper).
const PHASE_HEX = ['#10b981', '#f59e0b', '#f43f5e', '#0ea5e9']

// ── Shared draft state + stubbed generation ──────────────────────────────────

type Status = 'idle' | 'generating' | 'preview' | 'approved'

function useDraft(targetEvents: TargetEventOption[]) {
	const [disciplines, setDisciplines] = useState<CardioDiscipline[]>(['run'])
	const [goal, setGoal] = useState('')
	const [horizonWeeks, setHorizonWeeks] = useState(8)
	const [targetEventId, setTargetEventId] = useState('')
	const [ambition, setAmbition] = useState(3) // 1..5, used by the Sculptor

	const [status, setStatus] = useState<Status>('idle')
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
		setPreview(null)
		setTimeout(() => {
			setPreview(buildSamplePreview({ disciplines, horizon: effectiveHorizon }))
			setStatus('preview')
		}, 650)
	}

	function discard() {
		setStatus('idle')
		setPreview(null)
	}

	function approve() {
		setStatus('approved')
	}

	const canGenerate = disciplines.length > 0 && goal.trim().length > 0

	return {
		disciplines,
		goal,
		horizonWeeks,
		targetEventId,
		ambition,
		targetEvents,
		selectedEvent,
		effectiveHorizon,
		status,
		preview,
		canGenerate,
		setGoal,
		setHorizonWeeks,
		setTargetEventId,
		setAmbition,
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
}: {
	disciplines: CardioDiscipline[]
	horizon: number
}): PlanPreview {
	const sports = disciplines.length ? disciplines : (['run'] as const)
	const primary = sports[0]!
	return {
		outline: buildOutline(horizon),
		sessions: buildSessions(sports, primary),
	}
}

function buildOutline(weeks: number): PlanPreview['outline'] {
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

// ── Formatting + phase helpers ───────────────────────────────────────────────

function stepLabel(step: PreviewStep): string {
	if (step.kind === 'rest')
		return `Rest${step.durationSec ? ` ${formatDuration(step.durationSec)}` : ''}`
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
	for (const b of session.blocks)
		for (const s of b.steps) total += (s.durationSec ?? 0) * b.repeatCount
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

type PhaseSpan = {
	name: string
	focus: string
	weeklyLoadHours: number
	startWeek: number
	weeks: number
	colorIdx: number
}

function phaseSpans(outline: PlanPreview['outline']): PhaseSpan[] {
	let cursor = 0
	return outline.phases.map((p, i) => {
		const span = {
			name: p.name,
			focus: p.focus,
			weeklyLoadHours: p.weeklyLoadHours,
			startWeek: cursor,
			weeks: p.weeks,
			colorIdx: i % PHASE_HEX.length,
		}
		cursor += p.weeks
		return span
	})
}

function phaseForWeek(spans: PhaseSpan[], week: number): PhaseSpan {
	return (
		spans.find((s) => week >= s.startWeek && week < s.startWeek + s.weeks) ??
		spans[spans.length - 1]!
	)
}

const SAMPLE_EVENTS: TargetEventOption[] = [
	{ name: 'Oslo Half Marathon', startDate: at(70, 9), id: 'sample-1' },
	{ name: 'Norseman 70.3', startDate: at(126, 7), id: 'sample-2' },
]

// ── Root ──────────────────────────────────────────────────────────────────────

export function PlanWizardPrototype({
	variant,
	targetEvents,
}: {
	variant: PlanWizardVariantKey
	targetEvents: TargetEventOption[]
}) {
	const events = targetEvents.length ? targetEvents : SAMPLE_EVENTS
	const draft = useDraft(events)
	return (
		<>
			{variant === 'tape' && <VariantTape draft={draft} />}
			{variant === 'curve' && <VariantCurve draft={draft} />}
			{variant === 'summit' && <VariantSummit draft={draft} />}
			<PrototypeSwitcher
				variants={[...PLAN_WIZARD_VARIANTS]}
				current={variant}
				paramName="variant"
			/>
		</>
	)
}

// ── Shared bits ────────────────────────────────────────────────────────────────

function DisciplineChip({
	discipline,
	selected,
	onClick,
	dark = false,
}: {
	discipline: CardioDiscipline
	selected: boolean
	onClick: () => void
	dark?: boolean
}) {
	const style = DISCIPLINE_STYLE[discipline]
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
				selected
					? cn('border-transparent ring-2', style.chip, style.ring)
					: dark
						? 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
						: 'border-border bg-background text-muted-foreground hover:bg-muted',
			)}
		>
			<span className={cn('size-2 rounded-full', style.dot)} aria-hidden />
			{DISCIPLINE_LABELS[discipline]}
		</button>
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
		</div>
	)
}

function ApproveStrip({
	draft,
	dark = false,
}: {
	draft: Draft
	dark?: boolean
}) {
	if (draft.status === 'approved') {
		return (
			<div
				className={cn(
					'flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium',
					dark
						? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
						: 'border-primary/30 bg-primary/10 text-primary',
				)}
			>
				<Icon name="circle-check" size="md" />
				Plan locked in — sessions are on your calendar.
				<span className="ml-auto text-xs font-normal opacity-60">
					prototype — nothing saved
				</span>
			</div>
		)
	}
	return (
		<div className="flex flex-wrap gap-2">
			<Button onClick={draft.approve}>
				<Icon name="check" size="sm" />
				Lock in plan
			</Button>
			<Button variant="outline" onClick={draft.generate}>
				<Icon name="update" size="sm" />
				Reshape
			</Button>
			<Button variant="ghost" onClick={draft.discard}>
				Discard
			</Button>
		</div>
	)
}

// Compact goal + sports + event control used by Tape and Summit setup panels.
function SetupControls({
	draft,
	dark = false,
}: {
	draft: Draft
	dark?: boolean
}) {
	const labelCls = cn(
		'text-xs font-semibold tracking-wide uppercase',
		dark ? 'text-white/50' : 'text-muted-foreground',
	)
	const inputCls = cn(
		'w-full rounded-xl border p-3 text-sm outline-none',
		dark
			? 'border-white/15 bg-white/5 text-white placeholder:text-white/40'
			: 'border-border bg-background',
	)
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<label className="flex flex-col gap-1.5 sm:col-span-2">
				<span className={labelCls}>Goal</span>
				<input
					value={draft.goal}
					onChange={(e) => draft.setGoal(e.target.value)}
					placeholder="e.g. Sub-2:00 half marathon"
					className={inputCls}
				/>
			</label>
			<div className="flex flex-col gap-1.5">
				<span className={labelCls}>Sports</span>
				<div className="flex flex-wrap gap-2">
					{CARDIO_DISCIPLINES.map((d) => (
						<DisciplineChip
							key={d}
							discipline={d}
							selected={draft.disciplines.includes(d)}
							onClick={() => draft.toggleDiscipline(d)}
							dark={dark}
						/>
					))}
				</div>
			</div>
			<label className="flex flex-col gap-1.5">
				<span className={labelCls}>Target event</span>
				<select
					value={draft.targetEventId}
					onChange={(e) => draft.setTargetEventId(e.target.value)}
					className={inputCls}
				>
					<option value="">No event — {draft.horizonWeeks}w horizon</option>
					{draft.targetEvents.map((e) => (
						<option key={e.id} value={e.id}>
							{e.name} · {fmtEvent(e.startDate)}
						</option>
					))}
				</select>
			</label>
		</div>
	)
}

function CloseLink({ dark = false }: { dark?: boolean }) {
	return (
		<Link
			to="/"
			aria-label="Back to dashboard"
			className={cn(
				'inline-flex items-center gap-1 text-sm',
				dark
					? 'text-white/60 hover:text-white'
					: 'text-muted-foreground hover:text-foreground',
			)}
		>
			<Icon name="arrow-left" size="sm" />
			Dashboard
		</Link>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — THE TAPE
// Build the plan on a horizontal time-ribbon. Now on the left, the event flag on
// the right, periodization phases as colored bands, sessions as tiles in week
// columns you scroll through.
// ════════════════════════════════════════════════════════════════════════════

function VariantTape({ draft }: { draft: Draft }) {
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	const spans = draft.preview ? phaseSpans(draft.preview.outline) : []
	const totalWeeks = draft.effectiveHorizon
	const [focusWeek, setFocusWeek] = useState(0)

	const sessionsByWeek = new Map<number, PreviewSession[]>()
	for (const s of draft.preview?.sessions ?? []) {
		const arr = sessionsByWeek.get(s.weekIndex) ?? []
		arr.push(s)
		sessionsByWeek.set(s.weekIndex, arr)
	}
	const focusSessions = sessionsByWeek.get(focusWeek) ?? []

	return (
		<main className="min-h-screen bg-zinc-950 text-zinc-100">
			<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
				<div className="flex items-center justify-between">
					<CloseLink dark />
					<span className="text-xs font-semibold tracking-[0.2em] text-white/40 uppercase">
						The Tape
					</span>
				</div>

				<div className="mt-6 flex flex-col gap-1">
					<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
						{hasPlan
							? draft.selectedEvent
								? `Your run-up to ${draft.selectedEvent.name}`
								: `Your ${totalWeeks}-week tape`
							: 'Lay your plan on the tape'}
					</h1>
					<p className="text-sm text-white/50">
						{hasPlan
							? 'Now sits on the left, your event on the right. Phases flow between them — scrub a week to see its sessions.'
							: 'Set your goal and your event. We unroll the weeks between now and then, then fill them in.'}
					</p>
				</div>

				{!hasPlan ? (
					<div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
						<SetupControls draft={draft} dark />
						<div className="mt-5">
							<Button
								size="lg"
								onClick={draft.generate}
								disabled={!draft.canGenerate}
							>
								Unroll the tape
								<Icon name="arrow-right" size="sm" />
							</Button>
						</div>
					</div>
				) : null}
			</div>

			{draft.status === 'generating' ? (
				<div className="mx-auto max-w-6xl px-4 sm:px-6">
					<div className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
				</div>
			) : null}

			{hasPlan && draft.preview ? (
				<>
					{/* The ribbon — full-bleed, horizontally scrollable */}
					<div className="mt-4 overflow-x-auto pb-4">
						<div className="mx-auto min-w-max px-4 sm:px-6">
							{/* Phase band */}
							<div className="flex">
								{spans.map((sp, i) => (
									<div
										key={i}
										className="shrink-0"
										style={{ width: `${sp.weeks * 132}px` }}
									>
										<div className="flex items-center gap-2 px-1 pb-1.5">
											<span
												className="size-2 rounded-full"
												style={{ background: PHASE_HEX[sp.colorIdx] }}
											/>
											<span className="text-sm font-semibold">{sp.name}</span>
											<span className="text-xs text-white/40">
												{sp.weeks}w · {sp.weeklyLoadHours}h/wk
											</span>
										</div>
										<div
											className="h-1.5 rounded-full"
											style={{
												background: PHASE_HEX[sp.colorIdx],
												opacity: 0.85,
											}}
										/>
									</div>
								))}
							</div>

							{/* Week columns */}
							<div className="mt-3 flex gap-2">
								{Array.from({ length: totalWeeks }).map((_, w) => {
									const sp = phaseForWeek(spans, w)
									const items = sessionsByWeek.get(w) ?? []
									const isNow = w === 0
									const isFocus = w === focusWeek
									return (
										<button
											key={w}
											type="button"
											onClick={() => setFocusWeek(w)}
											className={cn(
												'relative flex w-[124px] shrink-0 flex-col overflow-hidden rounded-xl border p-2 pt-2.5 text-left transition',
												isFocus
													? 'border-white/40 bg-white/[0.07]'
													: 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]',
											)}
										>
											<span
												className="absolute inset-x-0 top-0 h-1"
												style={{ background: PHASE_HEX[sp.colorIdx] }}
												aria-hidden
											/>
											<div className="flex items-center justify-between">
												<span className="text-[10px] font-semibold tracking-wide text-white/50 uppercase">
													Wk {w + 1}
												</span>
												{isNow ? (
													<span className="rounded-full bg-white px-1.5 text-[9px] font-bold text-zinc-900">
														NOW
													</span>
												) : null}
											</div>
											<span className="mt-0.5 text-[10px] text-white/40">
												{fmtDay(at(w * 7, 9))}
											</span>
											<div className="mt-2 flex flex-col gap-1.5">
												{items.length === 0 ? (
													<span className="text-[10px] text-white/25">
														— planned —
													</span>
												) : (
													items.map((s, si) => {
														const min = sessionDurationMin(s)
														return (
															<span
																key={si}
																className="flex flex-col rounded-lg px-2 py-1"
																style={{
																	background: `${DISCIPLINE_HEX[s.discipline]}22`,
																}}
															>
																<span
																	className="flex items-center gap-1 text-[10px] font-medium"
																	style={{
																		color: DISCIPLINE_HEX[s.discipline],
																	}}
																>
																	<span
																		className="size-1.5 rounded-full"
																		style={{
																			background: DISCIPLINE_HEX[s.discipline],
																		}}
																	/>
																	{DISCIPLINE_LABELS[s.discipline]}
																</span>
																<span className="truncate text-[11px] text-white/80">
																	{s.title}
																</span>
																{min > 0 ? (
																	<span className="text-[9px] text-white/40">
																		{min} min
																	</span>
																) : null}
															</span>
														)
													})
												)}
											</div>
										</button>
									)
								})}
								{/* Event flag column */}
								<div className="flex w-[124px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-white/30 bg-white/[0.04] p-2 text-center">
									<Icon name="circle-check" size="lg" className="text-white" />
									<span className="mt-1 text-[11px] font-semibold">
										{draft.selectedEvent?.name ?? 'Goal'}
									</span>
									<span className="text-[10px] text-white/50">
										{draft.selectedEvent
											? fmtEvent(draft.selectedEvent.startDate)
											: `${totalWeeks}w`}
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Focused week detail */}
					<div className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
						<div className="mt-4 flex items-baseline justify-between">
							<h2 className="text-lg font-semibold">Week {focusWeek + 1}</h2>
							<span className="text-sm text-white/40">
								{focusSessions.length} session
								{focusSessions.length === 1 ? '' : 's'}
							</span>
						</div>
						<div className="mt-3 grid gap-3 sm:grid-cols-2">
							{focusSessions.length === 0 ? (
								<p className="text-sm text-white/40">
									This week is detailed closer to the date — only the near term
									is materialized.
								</p>
							) : (
								focusSessions.map((s, i) => (
									<div key={i} className="[&_*]:!text-inherit">
										<div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white/80">
											<SessionCardDark session={s} />
										</div>
									</div>
								))
							)}
						</div>
						<div className="mt-6">
							<ApproveStrip draft={draft} dark />
						</div>
					</div>
				</>
			) : null}
		</main>
	)
}

// Dark-surface session card for the Tape's focused-week detail.
function SessionCardDark({ session }: { session: PreviewSession }) {
	const tone = intentTone(session.intent)
	const min = sessionDurationMin(session)
	return (
		<div>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<span
							className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
							style={{
								background: `${DISCIPLINE_HEX[session.discipline]}22`,
								color: DISCIPLINE_HEX[session.discipline],
							}}
						>
							<span
								className="size-1.5 rounded-full"
								style={{ background: DISCIPLINE_HEX[session.discipline] }}
							/>
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
					<h4 className="mt-2 font-semibold text-white">{session.title}</h4>
				</div>
				<div className="text-right">
					<p className="text-sm font-medium whitespace-nowrap text-white">
						{fmtDay(session.scheduledAt)}
					</p>
					<p className="text-xs text-white/50">
						{fmtTime(session.scheduledAt)}
						{min > 0 ? ` · ${min} min` : ''}
					</p>
				</div>
			</div>
			<ul className="mt-3 space-y-1">
				{session.blocks.map((block, bi) => (
					<li key={bi} className="text-sm text-white/60">
						{block.repeatCount > 1 ? (
							<span className="font-medium text-white/90">
								{block.repeatCount}×{' '}
							</span>
						) : null}
						{block.steps.map((s) => stepLabel(s)).join(' → ')}
					</li>
				))}
			</ul>
		</div>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — LOAD SCULPTOR
// The projected fitness (CTL) ramp is the hero. The athlete sculpts the shape
// with an ambition dial; weekly load bars sit under the curve; sessions are
// derived from it. Direct manipulation of the thing a plan actually buys: form.
// ════════════════════════════════════════════════════════════════════════════

function VariantCurve({ draft }: { draft: Draft }) {
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	const totalWeeks = draft.effectiveHorizon
	const spans = draft.preview ? phaseSpans(draft.preview.outline) : []
	const curve = buildCurve(totalWeeks, draft.ambition)
	const [focusWeek, setFocusWeek] = useState(0)

	const sessionsByWeek = new Map<number, PreviewSession[]>()
	for (const s of draft.preview?.sessions ?? []) {
		const arr = sessionsByWeek.get(s.weekIndex) ?? []
		arr.push(s)
		sessionsByWeek.set(s.weekIndex, arr)
	}
	const focusSessions = sessionsByWeek.get(focusWeek) ?? []

	const AMBITION_LABELS = [
		'Gentle',
		'Steady',
		'Balanced',
		'Aggressive',
		'All-in',
	]

	return (
		<main className="bg-background min-h-screen">
			<div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
				{/* Hero curve */}
				<div className="order-2 lg:order-1">
					<div className="flex items-center justify-between">
						<CloseLink />
						<span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
							Load Sculptor
						</span>
					</div>
					<h1 className="text-foreground mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
						The form you're buying
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						This is your projected fitness if you follow the plan — rising
						through the build, peaking for the event, then a taper. Pull the
						dial to reshape it.
					</p>

					<div className="border-border bg-card mt-5 rounded-2xl border p-4">
						<FitnessCurve
							curve={curve}
							spans={
								spans.length ? spans : phaseSpans(buildOutline(totalWeeks))
							}
							totalWeeks={totalWeeks}
							eventName={draft.selectedEvent?.name ?? 'Goal'}
							focusWeek={hasPlan ? focusWeek : -1}
							onPickWeek={hasPlan ? setFocusWeek : undefined}
						/>
					</div>

					{hasPlan && draft.preview ? (
						<div className="mt-6">
							<div className="flex items-baseline justify-between">
								<h2 className="text-foreground text-lg font-semibold">
									Week {focusWeek + 1} · {phaseForWeek(spans, focusWeek).name}
								</h2>
								<span className="text-muted-foreground text-sm">
									{focusSessions.length} session
									{focusSessions.length === 1 ? '' : 's'}
								</span>
							</div>
							<div className="mt-3 grid gap-3 sm:grid-cols-2">
								{focusSessions.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										Detailed nearer the date — tap an early week to see its
										sessions.
									</p>
								) : (
									focusSessions.map((s, i) => (
										<SessionCard key={i} session={s} />
									))
								)}
							</div>
							<div className="mt-6">
								<ApproveStrip draft={draft} />
							</div>
						</div>
					) : null}
				</div>

				{/* Controls */}
				<div className="order-1 lg:order-2">
					<div className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-5 lg:sticky lg:top-6">
						<SetupControls draft={draft} />
						<div className="flex flex-col gap-2">
							<span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
								Ambition
							</span>
							<input
								type="range"
								min={1}
								max={5}
								value={draft.ambition}
								onChange={(e) => draft.setAmbition(Number(e.target.value))}
								className="accent-primary w-full"
							/>
							<div className="flex items-center justify-between">
								<span className="text-foreground text-sm font-semibold">
									{AMBITION_LABELS[draft.ambition - 1]}
								</span>
								<span className="text-muted-foreground text-xs">
									peak CTL ≈ {Math.round(40 + draft.ambition * 11)}
								</span>
							</div>
						</div>
						{!hasPlan ? (
							<Button
								size="lg"
								onClick={draft.generate}
								disabled={!draft.canGenerate}
							>
								Generate sessions
								<Icon name="arrow-right" size="sm" />
							</Button>
						) : (
							<p className="text-muted-foreground text-xs">
								Reshape the dial and hit{' '}
								<span className="text-foreground font-medium">Reshape</span>{' '}
								below to regenerate against the new curve.
							</p>
						)}
					</div>
				</div>
			</div>
		</main>
	)
}

type Curve = {
	points: Array<{ w: number; v: number }>
	bars: number[]
	peakWeek: number
}

function buildCurve(totalWeeks: number, ambition: number): Curve {
	const amp = 0.5 + ambition * 0.1 // 0.6 .. 1.0
	const taperWeeks = totalWeeks >= 4 ? 1 : 0
	const peakWeek = Math.max(0, totalWeeks - 1 - taperWeeks)
	const points: Array<{ w: number; v: number }> = []
	const bars: number[] = []
	for (let w = 0; w <= totalWeeks; w++) {
		const toPeak = Math.min(1, w / Math.max(1, peakWeek))
		// Ease-out rise to the peak.
		let v = amp * (1 - Math.pow(1 - toPeak, 1.7)) * 0.85 + 0.12
		if (w > peakWeek) v *= 0.82 // taper dip
		points.push({ w, v: Math.min(1, v) })
		// Weekly load bar: rises with the ramp, drops hard in taper.
		const barBase = 0.25 + 0.6 * toPeak
		bars.push(w > peakWeek ? barBase * 0.45 : barBase)
	}
	return { points, bars, peakWeek }
}

function FitnessCurve({
	curve,
	spans,
	totalWeeks,
	eventName,
	focusWeek,
	onPickWeek,
}: {
	curve: Curve
	spans: PhaseSpan[]
	totalWeeks: number
	eventName: string
	focusWeek: number
	onPickWeek?: (w: number) => void
}) {
	const W = 1000
	const H = 340
	const padX = 24
	const padTop = 24
	const padBottom = 44
	const plotW = W - padX * 2
	const plotH = H - padTop - padBottom
	const x = (w: number) => padX + (w / totalWeeks) * plotW
	const y = (v: number) => padTop + (1 - v) * plotH
	const baseline = padTop + plotH

	const line = curve.points
		.map(
			(p, i) =>
				`${i === 0 ? 'M' : 'L'} ${x(p.w).toFixed(1)} ${y(p.v).toFixed(1)}`,
		)
		.join(' ')
	const area = `${line} L ${x(totalWeeks).toFixed(1)} ${baseline} L ${x(0).toFixed(1)} ${baseline} Z`
	const barW = (plotW / (totalWeeks + 1)) * 0.55

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label="Projected fitness curve"
		>
			<defs>
				<linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
					<stop
						offset="0%"
						stopColor="var(--color-primary)"
						stopOpacity="0.35"
					/>
					<stop
						offset="100%"
						stopColor="var(--color-primary)"
						stopOpacity="0.02"
					/>
				</linearGradient>
			</defs>

			{/* Phase bands */}
			{spans.map((sp, i) => (
				<g key={i}>
					<rect
						x={x(sp.startWeek)}
						y={padTop}
						width={x(sp.startWeek + sp.weeks) - x(sp.startWeek)}
						height={plotH}
						fill={PHASE_HEX[sp.colorIdx]}
						opacity={0.05}
					/>
					<rect
						x={x(sp.startWeek)}
						y={baseline + 6}
						width={x(sp.startWeek + sp.weeks) - x(sp.startWeek) - 3}
						height={5}
						rx={2.5}
						fill={PHASE_HEX[sp.colorIdx]}
						opacity={0.85}
					/>
					<text
						x={x(sp.startWeek) + 4}
						y={baseline + 30}
						fontSize="13"
						fontWeight="600"
						fill={PHASE_HEX[sp.colorIdx]}
					>
						{sp.name}
					</text>
				</g>
			))}

			{/* Weekly load bars */}
			{curve.bars.map((b, w) => (
				<rect
					key={w}
					x={x(w) - barW / 2}
					y={baseline - b * plotH * 0.7}
					width={barW}
					height={b * plotH * 0.7}
					rx={3}
					className={onPickWeek ? 'cursor-pointer' : undefined}
					fill="currentColor"
					opacity={w === focusWeek ? 0.45 : 0.14}
					onClick={
						onPickWeek
							? () => onPickWeek(Math.min(totalWeeks - 1, w))
							: undefined
					}
				/>
			))}

			{/* Area + line */}
			<path d={area} fill="url(#curveFill)" />
			<path
				d={line}
				fill="none"
				stroke="var(--color-primary)"
				strokeWidth={3}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>

			{/* Peak marker */}
			<circle
				cx={x(curve.peakWeek)}
				cy={y(curve.points[curve.peakWeek]?.v ?? 1)}
				r={5}
				fill="var(--color-primary)"
			/>

			{/* Now + Event verticals */}
			<line
				x1={x(0)}
				y1={padTop}
				x2={x(0)}
				y2={baseline}
				stroke="currentColor"
				strokeOpacity={0.25}
				strokeDasharray="3 3"
			/>
			<text
				x={x(0)}
				y={padTop - 8}
				fontSize="12"
				fontWeight="700"
				fill="currentColor"
				opacity={0.5}
			>
				NOW
			</text>
			<line
				x1={x(totalWeeks)}
				y1={padTop}
				x2={x(totalWeeks)}
				y2={baseline}
				stroke="var(--color-primary)"
				strokeWidth={1.5}
			/>
			<text
				x={x(totalWeeks)}
				y={padTop - 8}
				fontSize="12"
				fontWeight="700"
				textAnchor="end"
				fill="var(--color-primary)"
			>
				{eventName.toUpperCase()}
			</text>
		</svg>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — THE ASCENT
// The plan as a route climbing to the event summit. Phases are altitude camps;
// "you are here" sits at the base; near-term sessions are markers on the trail.
// ════════════════════════════════════════════════════════════════════════════

function VariantSummit({ draft }: { draft: Draft }) {
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	const spans = draft.preview ? phaseSpans(draft.preview.outline) : []
	const totalWeeks = draft.effectiveHorizon
	const nearSessions = (draft.preview?.sessions ?? []).slice(0, 4)

	return (
		<main className="min-h-screen bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-slate-100">
			<div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
				<div className="flex items-center justify-between">
					<CloseLink dark />
					<span className="text-xs font-semibold tracking-[0.2em] text-white/40 uppercase">
						The Ascent
					</span>
				</div>

				{!hasPlan ? (
					<div className="mt-8">
						<h1 className="text-3xl font-bold tracking-tight">
							Plan the ascent
						</h1>
						<p className="mt-1 text-sm text-white/50">
							Your event is the summit. Tell us where it is and how you travel —
							we'll chart the route up.
						</p>
						<div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
							<SetupControls draft={draft} dark />
							<div className="mt-5">
								<Button
									size="lg"
									onClick={draft.generate}
									disabled={!draft.canGenerate}
								>
									Chart the route
									<Icon name="arrow-right" size="sm" />
								</Button>
							</div>
						</div>
					</div>
				) : null}

				{draft.status === 'generating' ? (
					<div className="mt-8 h-96 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
				) : null}

				{hasPlan && draft.preview ? (
					<div className="mt-8">
						{/* Summit header */}
						<div className="text-center">
							<Icon name="circle-check" size="xl" className="text-amber-300" />
							<h1 className="mt-2 text-2xl font-bold tracking-tight">
								{draft.selectedEvent?.name ?? 'Your goal'}
							</h1>
							<p className="text-sm text-white/50">
								The summit ·{' '}
								{draft.selectedEvent
									? fmtEvent(draft.selectedEvent.startDate)
									: `${totalWeeks} weeks out`}
							</p>
						</div>

						{/* The route — camps top (summit) → base (now) */}
						<div className="relative mt-8 ml-4 border-l-2 border-dashed border-white/20 pl-8">
							{spans
								.slice()
								.reverse()
								.map((sp, i) => {
									const altitude = Math.round(
										((spans.length - i) / spans.length) * 100,
									)
									return (
										<div key={i} className="relative pb-10">
											<span
												className="absolute top-1 -left-[42px] grid size-7 place-items-center rounded-full border-2 text-[10px] font-bold"
												style={{
													borderColor: PHASE_HEX[sp.colorIdx],
													background: '#0f172a',
													color: PHASE_HEX[sp.colorIdx],
												}}
											>
												{spans.length - i}
											</span>
											<div className="flex items-baseline justify-between">
												<h3
													className="text-lg font-semibold"
													style={{ color: PHASE_HEX[sp.colorIdx] }}
												>
													{sp.name} camp
												</h3>
												<span className="text-xs text-white/40">
													{sp.weeks}w · {sp.weeklyLoadHours}h/wk
												</span>
											</div>
											<p className="text-sm text-white/60">{sp.focus}</p>
											<div
												className="mt-2 h-1.5 rounded-full"
												style={{
													background: PHASE_HEX[sp.colorIdx],
													opacity: 0.3 + (altitude / 100) * 0.6,
												}}
											/>
										</div>
									)
								})}

							{/* You are here */}
							<div className="relative">
								<span className="absolute top-0 -left-[46px] grid size-8 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-900">
									YOU
								</span>
								<h3 className="text-lg font-semibold">Base camp · this week</h3>
								<p className="text-sm text-white/50">
									Your first steps on the route.
								</p>
							</div>
						</div>

						{/* First steps */}
						<div className="mt-6">
							<h2 className="text-xs font-semibold tracking-wide text-white/40 uppercase">
								First steps on the trail
							</h2>
							<div className="mt-3 space-y-2">
								{nearSessions.map((s, i) => {
									const min = sessionDurationMin(s)
									return (
										<div
											key={i}
											className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
										>
											<span
												className="size-2.5 shrink-0 rounded-full"
												style={{ background: DISCIPLINE_HEX[s.discipline] }}
											/>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">
													{s.title}
												</p>
												<p className="text-xs text-white/40">
													{DISCIPLINE_LABELS[s.discipline]} ·{' '}
													{INTENT_LABELS[s.intent]}
												</p>
											</div>
											<div className="text-right text-xs text-white/50">
												<p>{fmtDay(s.scheduledAt)}</p>
												{min > 0 ? <p>{min} min</p> : null}
											</div>
										</div>
									)
								})}
							</div>
						</div>

						<div className="mt-6 pb-28">
							<ApproveStrip draft={draft} dark />
						</div>
					</div>
				) : null}
			</div>
		</main>
	)
}
