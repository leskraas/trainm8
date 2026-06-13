// PROTOTYPE — three "optimal" plan-builders, each applying the prototype-review
// feedback but radically different in shape. Switchable via
// `?variant=planner|sculptor|brief` on `/training/plan/new` and the floating
// PrototypeSwitcher (arrow keys cycle).
//
//   planner  — recommended hybrid: accessible sticky control panel + a preview
//              you flip between a Tape (timeline) and Weeks (list), with an
//              honest projected-weekly-load strip.
//   sculptor — data-first: sculpt the projected *weekly training load* with an
//              ambition dial (labelled a projection — no fabricated CTL).
//   brief    — clean guided single-column "training brief": fast, accessible,
//              closest to the honest baseline but far better designed.
//
// Feedback applied vs the earlier cut: (1) collects every input the generator
// needs incl. experience; (2) no fabricated CTL/derived metric — projections
// are the plan's own prescribed load, clearly labelled (CONTEXT.md: CTL/ATL/TSB
// are never authored); (3) accessible controls (real labels, aria, keyboard);
// (4) one consistent light in-app surface; (5) regeneration nuance surfaced.
//
// Filename starts with `__` so react-router-auto-routes ignores it. Generation
// + approve are STUBBED (no SSE, no DB write). Fold the winner into
// `plan.new.tsx` and delete this file + the switcher branch when chosen.

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
	{ key: 'planner', name: 'Planner (hybrid)' },
	{ key: 'sculptor', name: 'Load Sculptor' },
	{ key: 'brief', name: 'Training Brief' },
] as const satisfies readonly PrototypeVariant[]

export type PlanWizardVariantKey = (typeof PLAN_WIZARD_VARIANTS)[number]['key']

export function isPlanWizardVariant(
	value: string | null | undefined,
): value is PlanWizardVariantKey {
	return PLAN_WIZARD_VARIANTS.some((v) => v.key === value)
}

export type TargetEventOption = { id: string; name: string; startDate: Date }

// ── Discipline + phase visual language ───────────────────────────────────────

type Style = { dot: string; chip: string; ring: string }

const DISCIPLINE_STYLE: Record<CardioDiscipline, Style> = {
	run: {
		dot: 'bg-orange-500',
		chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
		ring: 'ring-orange-400/40',
	},
	bike: {
		dot: 'bg-sky-500',
		chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		ring: 'ring-sky-400/40',
	},
	swim: {
		dot: 'bg-cyan-500',
		chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
		ring: 'ring-cyan-400/40',
	},
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

const PHASE_HEX = ['#10b981', '#f59e0b', '#f43f5e', '#0ea5e9']

// ── Shared draft state + stubbed generation ──────────────────────────────────

type Status = 'idle' | 'generating' | 'preview' | 'approved'

function useDraft(targetEvents: TargetEventOption[]) {
	const [disciplines, setDisciplines] = useState<CardioDiscipline[]>(['run'])
	const [experience, setExperience] = useState<ExperienceLevel>('intermediate')
	const [goal, setGoal] = useState('')
	const [horizonWeeks, setHorizonWeeks] = useState(8)
	const [targetEventId, setTargetEventId] = useState('')
	const [ambition, setAmbition] = useState(3)

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
		}, 600)
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
		experience,
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
		setExperience,
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

// ── Sample preview + projection ──────────────────────────────────────────────

function buildSamplePreview({
	disciplines,
	horizon,
}: {
	disciplines: CardioDiscipline[]
	horizon: number
}): PlanPreview {
	const sports = disciplines.length ? disciplines : (['run'] as const)
	return {
		outline: buildOutline(horizon),
		sessions: buildSessions(sports, sports[0]!),
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

// Projected weekly load (HOURS) from the plan's own prescription, scaled by the
// ambition dial. This is the plan's Planned load — NOT a derived CTL/fitness
// metric (those are never authored), so it's honest to show and shape.
function weeklyLoadHours(
	spans: PhaseSpan[],
	totalWeeks: number,
	ambition: number,
): number[] {
	const factor = 0.8 + ambition * 0.08 // 0.88 .. 1.2
	return Array.from({ length: totalWeeks }, (_, w) => {
		const sp = phaseForWeek(spans, w)
		return Math.round(sp.weeklyLoadHours * factor * 10) / 10
	})
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
			{variant === 'planner' && <VariantPlanner draft={draft} />}
			{variant === 'sculptor' && <VariantSculptor draft={draft} />}
			{variant === 'brief' && <VariantBrief draft={draft} />}
			<PrototypeSwitcher
				variants={[...PLAN_WIZARD_VARIANTS]}
				current={variant}
				paramName="variant"
			/>
		</>
	)
}

// ── Shared, accessible controls ──────────────────────────────────────────────

function DisciplineChip({
	discipline,
	selected,
	onClick,
}: {
	discipline: CardioDiscipline
	selected: boolean
	onClick: () => void
}) {
	const style = DISCIPLINE_STYLE[discipline]
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
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

function ExperienceSeg({
	value,
	onChange,
}: {
	value: ExperienceLevel
	onChange: (v: ExperienceLevel) => void
}) {
	return (
		<div
			role="radiogroup"
			aria-label="Experience"
			className="border-border flex rounded-xl border p-1"
		>
			{EXPERIENCE_LEVELS.map((level) => (
				<button
					key={level}
					type="button"
					role="radio"
					aria-checked={value === level}
					onClick={() => onChange(level)}
					className={cn(
						'flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition',
						value === level
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>
					{EXPERIENCE_LABELS[level]}
				</button>
			))}
		</div>
	)
}

function PlanInputs({ draft, idPrefix }: { draft: Draft; idPrefix: string }) {
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1.5">
				<label
					htmlFor={`${idPrefix}-goal`}
					className="text-foreground text-xs font-semibold tracking-wide uppercase"
				>
					Goal
				</label>
				<input
					id={`${idPrefix}-goal`}
					value={draft.goal}
					onChange={(e) => draft.setGoal(e.target.value)}
					placeholder="e.g. Sub-2:00 half marathon"
					className="border-border bg-background focus-visible:ring-ring/30 w-full rounded-xl border p-3 text-sm outline-none focus-visible:ring-3"
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="text-foreground text-xs font-semibold tracking-wide uppercase">
					Sports
				</span>
				<div className="flex flex-wrap gap-2">
					{CARDIO_DISCIPLINES.map((d) => (
						<DisciplineChip
							key={d}
							discipline={d}
							selected={draft.disciplines.includes(d)}
							onClick={() => draft.toggleDiscipline(d)}
						/>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<span className="text-foreground text-xs font-semibold tracking-wide uppercase">
					Experience
				</span>
				<ExperienceSeg
					value={draft.experience}
					onChange={draft.setExperience}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<label
					htmlFor={`${idPrefix}-event`}
					className="text-foreground text-xs font-semibold tracking-wide uppercase"
				>
					Target event
				</label>
				<select
					id={`${idPrefix}-event`}
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
					<div className="mt-1 flex items-center gap-3">
						<input
							type="range"
							min={4}
							max={24}
							value={draft.horizonWeeks}
							onChange={(e) => draft.setHorizonWeeks(Number(e.target.value))}
							aria-label="Horizon weeks"
							className="accent-primary flex-1"
						/>
						<span className="text-foreground w-16 text-right text-sm font-semibold">
							{draft.horizonWeeks} wk
						</span>
					</div>
				) : (
					<p className="text-muted-foreground text-xs">
						{draft.effectiveHorizon} weeks out · horizon derived from the event
						date.
					</p>
				)}
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

function PhaseRibbon({ spans }: { spans: PhaseSpan[] }) {
	const total = spans.reduce((s, p) => s + p.weeks, 0)
	return (
		<div>
			<div
				className="flex h-3 w-full overflow-hidden rounded-full"
				role="img"
				aria-label="Plan phases"
			>
				{spans.map((p, i) => (
					<div
						key={i}
						className="h-full"
						style={{
							width: `${(p.weeks / total) * 100}%`,
							background: PHASE_HEX[p.colorIdx],
						}}
						title={`${p.name} · ${p.weeks}w`}
					/>
				))}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
				{spans.map((p, i) => (
					<div key={i} className="flex items-center gap-1.5 text-xs">
						<span
							className="size-2 rounded-full"
							style={{ background: PHASE_HEX[p.colorIdx] }}
						/>
						<span className="text-foreground font-medium">{p.name}</span>
						<span className="text-muted-foreground">
							{p.weeks}w · {p.weeklyLoadHours}h/wk
						</span>
					</div>
				))}
			</div>
		</div>
	)
}

// Honest projection: weekly Planned load in HOURS. Clearly labelled a
// projection; never claims a derived fitness number.
function LoadProjection({
	hours,
	spans,
	totalWeeks,
	eventName,
	height = 200,
	focusWeek = -1,
	onPick,
}: {
	hours: number[]
	spans: PhaseSpan[]
	totalWeeks: number
	eventName: string
	height?: number
	focusWeek?: number
	onPick?: (w: number) => void
}) {
	const W = 1000
	const H = height
	const padX = 16
	const padTop = 14
	const padBottom = 30
	const plotW = W - padX * 2
	const plotH = H - padTop - padBottom
	const maxH = Math.max(...hours, 1)
	const x = (w: number) => padX + (w / totalWeeks) * plotW
	const colW = plotW / totalWeeks
	const baseline = padTop + plotH
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label={`Projected weekly training load in hours toward ${eventName}`}
		>
			{spans.map((sp, i) => (
				<rect
					key={i}
					x={x(sp.startWeek)}
					y={padTop}
					width={x(sp.startWeek + sp.weeks) - x(sp.startWeek)}
					height={plotH}
					fill={PHASE_HEX[sp.colorIdx]}
					opacity={0.06}
				/>
			))}
			{hours.map((h, w) => {
				const bh = (h / maxH) * plotH
				const sp = phaseForWeek(spans, w)
				return (
					<g
						key={w}
						className={onPick ? 'cursor-pointer' : undefined}
						onClick={onPick ? () => onPick(w) : undefined}
					>
						<rect
							x={x(w) + colW * 0.18}
							y={baseline - bh}
							width={colW * 0.64}
							height={bh}
							rx={3}
							fill={PHASE_HEX[sp.colorIdx]}
							opacity={w === focusWeek ? 1 : 0.7}
						/>
						{colW > 34 ? (
							<text
								x={x(w) + colW / 2}
								y={baseline - bh - 4}
								fontSize="11"
								textAnchor="middle"
								fill="currentColor"
								opacity={0.55}
							>
								{h}
							</text>
						) : null}
						{colW > 26 ? (
							<text
								x={x(w) + colW / 2}
								y={baseline + 16}
								fontSize="10"
								textAnchor="middle"
								fill="currentColor"
								opacity={0.4}
							>
								{w + 1}
							</text>
						) : null}
					</g>
				)
			})}
			<line
				x1={x(0)}
				y1={baseline}
				x2={x(totalWeeks)}
				y2={baseline}
				stroke="currentColor"
				strokeOpacity={0.15}
			/>
		</svg>
	)
}

function RegenNote() {
	return (
		<p className="text-muted-foreground text-xs">
			Regenerating replaces only future generated sessions — your completed and
			hand-edited sessions are never touched.
		</p>
	)
}

function ApproveRow({ draft }: { draft: Draft }) {
	if (draft.status === 'approved') {
		return (
			<div className="border-primary/30 bg-primary/10 text-primary flex items-center gap-3 rounded-2xl border p-4 text-sm font-medium">
				<Icon name="circle-check" size="md" />
				Approved — sessions are on your calendar.
				<span className="text-muted-foreground ml-auto text-xs font-normal">
					prototype — nothing saved
				</span>
			</div>
		)
	}
	return (
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
				<Button variant="ghost" onClick={draft.discard}>
					Discard
				</Button>
			</div>
			<RegenNote />
		</div>
	)
}

function TopBar({ title }: { title: string }) {
	return (
		<div className="flex items-center justify-between">
			<Link
				to="/"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<Icon name="arrow-left" size="sm" />
				Dashboard
			</Link>
			<span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
				{title}
			</span>
		</div>
	)
}

function GeneratingPane() {
	return (
		<div className="space-y-4">
			<div className="bg-card border-border h-20 animate-pulse rounded-2xl border" />
			<div className="grid gap-3 sm:grid-cols-2">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						key={i}
						className="bg-card border-border h-28 animate-pulse rounded-xl border"
					/>
				))}
			</div>
		</div>
	)
}

function groupByWeek(
	sessions: PreviewSession[],
): Map<number, PreviewSession[]> {
	const m = new Map<number, PreviewSession[]>()
	for (const s of sessions) {
		const arr = m.get(s.weekIndex) ?? []
		arr.push(s)
		m.set(s.weekIndex, arr)
	}
	return m
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — PLANNER (recommended hybrid)
// Accessible sticky control panel + a preview you flip between Tape and Weeks,
// with an honest projected-weekly-load strip. The daily-driver.
// ════════════════════════════════════════════════════════════════════════════

function VariantPlanner({ draft }: { draft: Draft }) {
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	const [view, setView] = useState<'tape' | 'weeks'>('tape')
	const [focusWeek, setFocusWeek] = useState(0)
	const spans = draft.preview ? phaseSpans(draft.preview.outline) : []
	const totalWeeks = draft.effectiveHorizon
	const byWeek = groupByWeek(draft.preview?.sessions ?? [])
	const hours = spans.length
		? weeklyLoadHours(spans, totalWeeks, draft.ambition)
		: []

	return (
		<main className="bg-background min-h-screen">
			<div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[360px_1fr]">
				{/* Control panel */}
				<div className="border-border lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r">
					<div className="flex flex-col gap-6 p-6">
						<TopBar title="Planner" />
						<div>
							<h1 className="text-foreground text-xl font-bold tracking-tight">
								Build your plan
							</h1>
							<p className="text-muted-foreground text-sm">
								Set the inputs — the preview fills in. Nothing is saved until
								you approve.
							</p>
						</div>
						<PlanInputs draft={draft} idPrefix="planner" />
						<div className="border-border bg-background sticky bottom-0 -mx-6 border-t px-6 py-4">
							<Button
								className="w-full"
								size="lg"
								onClick={draft.generate}
								disabled={!draft.canGenerate}
							>
								{hasPlan ? 'Regenerate plan' : 'Generate plan'}
								<Icon name="arrow-right" size="sm" />
							</Button>
						</div>
					</div>
				</div>

				{/* Preview */}
				<div className="bg-muted/20 min-h-screen p-6 lg:p-8">
					{draft.status === 'idle' ? (
						<div className="grid h-full min-h-[60vh] place-items-center">
							<div className="max-w-sm text-center">
								<div className="border-border text-muted-foreground/40 mx-auto grid size-20 place-items-center rounded-2xl border-2 border-dashed">
									<Icon name="bar-chart" size="xl" />
								</div>
								<h2 className="text-foreground mt-5 font-semibold">
									Your plan appears here
								</h2>
								<p className="text-muted-foreground mt-1 text-sm">
									Flip between a time-line Tape and a week list once it's
									generated.
								</p>
							</div>
						</div>
					) : draft.status === 'generating' ? (
						<GeneratingPane />
					) : draft.preview ? (
						<div className="space-y-6">
							{draft.status === 'approved' ? (
								<ApproveRow draft={draft} />
							) : null}
							<div className="flex flex-wrap items-end justify-between gap-3">
								<div>
									<p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
										Plan
									</p>
									<h2 className="text-foreground text-2xl font-bold tracking-tight">
										{totalWeeks}-week plan
										{draft.selectedEvent
											? ` → ${draft.selectedEvent.name}`
											: ''}
									</h2>
								</div>
								<div
									role="tablist"
									aria-label="Preview view"
									className="border-border flex rounded-xl border p-1"
								>
									{(['tape', 'weeks'] as const).map((v) => (
										<button
											key={v}
											type="button"
											role="tab"
											aria-selected={view === v}
											onClick={() => setView(v)}
											className={cn(
												'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition',
												view === v
													? 'bg-primary text-primary-foreground'
													: 'text-muted-foreground hover:text-foreground',
											)}
										>
											{v}
										</button>
									))}
								</div>
							</div>

							{/* Honest projection strip */}
							<div className="border-border bg-card rounded-2xl border p-4">
								<div className="mb-1 flex items-baseline justify-between">
									<h3 className="text-foreground text-sm font-semibold">
										Projected weekly load
									</h3>
									<span className="text-muted-foreground text-xs">
										hours · a projection from the plan, not a guarantee
									</span>
								</div>
								<div className="text-primary">
									<LoadProjection
										hours={hours}
										spans={spans}
										totalWeeks={totalWeeks}
										eventName={draft.selectedEvent?.name ?? 'goal'}
										height={140}
										focusWeek={focusWeek}
										onPick={setFocusWeek}
									/>
								</div>
								<PhaseRibbon spans={spans} />
							</div>

							{view === 'tape' ? (
								<TapeView
									spans={spans}
									totalWeeks={totalWeeks}
									byWeek={byWeek}
									focusWeek={focusWeek}
									setFocusWeek={setFocusWeek}
									eventName={draft.selectedEvent?.name ?? 'Goal'}
									eventDate={draft.selectedEvent?.startDate}
								/>
							) : (
								<div className="space-y-6">
									{[...byWeek.entries()].map(([w, sessions]) => (
										<div key={w}>
											<h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
												Week {w + 1} · {phaseForWeek(spans, w).name}
											</h3>
											<div className="grid gap-3 sm:grid-cols-2">
												{sessions.map((s, i) => (
													<SessionCard key={i} session={s} />
												))}
											</div>
										</div>
									))}
								</div>
							)}

							{draft.status !== 'approved' ? (
								<ApproveRow draft={draft} />
							) : null}
						</div>
					) : null}
				</div>
			</div>
		</main>
	)
}

// Light, scrollable time-ribbon used inside Planner's Tape view.
function TapeView({
	spans,
	totalWeeks,
	byWeek,
	focusWeek,
	setFocusWeek,
	eventName,
	eventDate,
}: {
	spans: PhaseSpan[]
	totalWeeks: number
	byWeek: Map<number, PreviewSession[]>
	focusWeek: number
	setFocusWeek: (w: number) => void
	eventName: string
	eventDate?: Date
}) {
	const focusSessions = byWeek.get(focusWeek) ?? []
	return (
		<div className="space-y-4">
			<div className="border-border bg-card overflow-x-auto rounded-2xl border p-3">
				<div className="flex min-w-max gap-2">
					{Array.from({ length: totalWeeks }).map((_, w) => {
						const sp = phaseForWeek(spans, w)
						const items = byWeek.get(w) ?? []
						const isNow = w === 0
						const isFocus = w === focusWeek
						return (
							<button
								key={w}
								type="button"
								onClick={() => setFocusWeek(w)}
								aria-pressed={isFocus}
								className={cn(
									'relative flex w-[120px] shrink-0 flex-col overflow-hidden rounded-xl border p-2 pt-2.5 text-left transition',
									isFocus
										? 'border-primary bg-primary/5'
										: 'border-border hover:bg-muted/50',
								)}
							>
								<span
									className="absolute inset-x-0 top-0 h-1"
									style={{ background: PHASE_HEX[sp.colorIdx] }}
									aria-hidden
								/>
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
										Wk {w + 1}
									</span>
									{isNow ? (
										<span className="bg-foreground text-background rounded-full px-1.5 text-[9px] font-bold">
											NOW
										</span>
									) : null}
								</div>
								<span className="text-muted-foreground/70 mt-0.5 text-[10px]">
									{fmtDay(at(w * 7, 9))}
								</span>
								<div className="mt-2 flex flex-col gap-1">
									{items.length === 0 ? (
										<span className="text-muted-foreground/40 text-[10px]">
											— planned —
										</span>
									) : (
										items.map((s, si) => (
											<span
												key={si}
												className={cn(
													'truncate rounded-md px-1.5 py-1 text-[11px] font-medium',
													DISCIPLINE_STYLE[s.discipline].chip,
												)}
											>
												{s.title}
											</span>
										))
									)}
								</div>
							</button>
						)
					})}
					<div className="border-primary/40 bg-primary/5 flex w-[120px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed p-2 text-center">
						<Icon name="circle-check" size="lg" className="text-primary" />
						<span className="text-foreground mt-1 text-[11px] font-semibold">
							{eventName}
						</span>
						<span className="text-muted-foreground text-[10px]">
							{eventDate ? fmtEvent(eventDate) : `${totalWeeks}w`}
						</span>
					</div>
				</div>
			</div>
			<div>
				<div className="flex items-baseline justify-between">
					<h3 className="text-foreground font-semibold">
						Week {focusWeek + 1} · {phaseForWeek(spans, focusWeek).name}
					</h3>
					<span className="text-muted-foreground text-sm">
						{focusSessions.length} session
						{focusSessions.length === 1 ? '' : 's'}
					</span>
				</div>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
					{focusSessions.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Detailed nearer the date — only the near term is materialized.
						</p>
					) : (
						focusSessions.map((s, i) => <SessionCard key={i} session={s} />)
					)}
				</div>
			</div>
		</div>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — LOAD SCULPTOR (honest)
// Hero = projected WEEKLY TRAINING LOAD (hours), shaped by an ambition dial and
// explicitly labelled a projection. No fabricated CTL. Sessions below.
// ════════════════════════════════════════════════════════════════════════════

function VariantSculptor({ draft }: { draft: Draft }) {
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	const totalWeeks = draft.effectiveHorizon
	const baseSpans = draft.preview
		? phaseSpans(draft.preview.outline)
		: phaseSpans(buildOutline(totalWeeks))
	const hours = weeklyLoadHours(baseSpans, totalWeeks, draft.ambition)
	const peakHours = Math.max(...hours)
	const [focusWeek, setFocusWeek] = useState(0)
	const byWeek = groupByWeek(draft.preview?.sessions ?? [])
	const focusSessions = byWeek.get(focusWeek) ?? []
	const AMBITION = ['Gentle', 'Steady', 'Balanced', 'Aggressive', 'All-in']

	return (
		<main className="bg-background min-h-screen">
			<div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
				<div className="order-2 lg:order-1">
					<TopBar title="Load Sculptor" />
					<h1 className="text-foreground mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
						Shape your training load
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						This is the{' '}
						<span className="text-foreground font-medium">
							weekly load the plan will prescribe
						</span>{' '}
						— rising through the build, then a taper. Pull the dial to make it
						harder or gentler. It's a projection of planned hours, not a fitness
						promise.
					</p>

					<div className="border-border bg-card mt-5 rounded-2xl border p-4">
						<div className="mb-1 flex items-baseline justify-between">
							<h2 className="text-foreground text-sm font-semibold">
								Projected weekly load (hours)
							</h2>
							<span className="text-muted-foreground text-xs">
								peak ≈ {peakHours} h/wk · {AMBITION[draft.ambition - 1]}
							</span>
						</div>
						<div className="text-primary">
							<LoadProjection
								hours={hours}
								spans={baseSpans}
								totalWeeks={totalWeeks}
								eventName={draft.selectedEvent?.name ?? 'goal'}
								height={300}
								focusWeek={hasPlan ? focusWeek : -1}
								onPick={hasPlan ? setFocusWeek : undefined}
							/>
						</div>
						<div className="mt-2">
							<PhaseRibbon spans={baseSpans} />
						</div>
					</div>

					{hasPlan && draft.preview ? (
						<div className="mt-6 space-y-6">
							{draft.status === 'approved' ? (
								<ApproveRow draft={draft} />
							) : null}
							<div>
								<div className="flex items-baseline justify-between">
									<h2 className="text-foreground text-lg font-semibold">
										Week {focusWeek + 1} ·{' '}
										{phaseForWeek(baseSpans, focusWeek).name}
									</h2>
									<span className="text-muted-foreground text-sm">
										{focusSessions.length} session
										{focusSessions.length === 1 ? '' : 's'}
									</span>
								</div>
								<div className="mt-3 grid gap-3 sm:grid-cols-2">
									{focusSessions.length === 0 ? (
										<p className="text-muted-foreground text-sm">
											Tap an early week's bar to see its sessions — later weeks
											are detailed nearer the date.
										</p>
									) : (
										focusSessions.map((s, i) => (
											<SessionCard key={i} session={s} />
										))
									)}
								</div>
							</div>
							{draft.status !== 'approved' ? (
								<ApproveRow draft={draft} />
							) : null}
						</div>
					) : null}
				</div>

				<div className="order-1 lg:order-2">
					<div className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-5 lg:sticky lg:top-6">
						<PlanInputs draft={draft} idPrefix="sculptor" />
						<div className="flex flex-col gap-2">
							<label
								htmlFor="ambition"
								className="text-foreground text-xs font-semibold tracking-wide uppercase"
							>
								Ambition
							</label>
							<input
								id="ambition"
								type="range"
								min={1}
								max={5}
								value={draft.ambition}
								onChange={(e) => draft.setAmbition(Number(e.target.value))}
								className="accent-primary w-full"
							/>
							<span className="text-foreground text-sm font-semibold">
								{AMBITION[draft.ambition - 1]}
							</span>
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
							<RegenNote />
						)}
					</div>
				</div>
			</div>
		</main>
	)
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANT — TRAINING BRIEF (guided, accessible-first)
// One clean scrollable column: a sectioned brief → big readable preview with a
// phase ribbon + full week-grouped sessions. Honest, fast, keyboard-first.
// ════════════════════════════════════════════════════════════════════════════

function VariantBrief({ draft }: { draft: Draft }) {
	const hasPlan = draft.status === 'preview' || draft.status === 'approved'
	const spans = draft.preview ? phaseSpans(draft.preview.outline) : []
	const totalWeeks = draft.effectiveHorizon
	const byWeek = groupByWeek(draft.preview?.sessions ?? [])

	return (
		<main className="bg-muted/20 min-h-screen">
			<div className="mx-auto max-w-2xl px-4 py-8">
				<TopBar title="Training Brief" />

				{!hasPlan ? (
					<div className="mt-6">
						<h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
							Your training brief
						</h1>
						<p className="text-muted-foreground mt-1">
							Four quick things, then we build it. Nothing is saved until you
							approve.
						</p>
						<div className="border-border bg-card mt-6 rounded-2xl border p-6">
							<PlanInputs draft={draft} idPrefix="brief" />
						</div>
						<div className="mt-5">
							<Button
								size="lg"
								onClick={draft.generate}
								disabled={!draft.canGenerate}
							>
								Build plan
								<Icon name="arrow-right" size="sm" />
							</Button>
							{!draft.canGenerate ? (
								<p className="text-muted-foreground mt-2 text-xs">
									Add a goal and at least one sport to continue.
								</p>
							) : null}
						</div>
					</div>
				) : null}

				{draft.status === 'generating' ? (
					<div className="mt-6">
						<GeneratingPane />
					</div>
				) : null}

				{hasPlan && draft.preview ? (
					<div className="mt-6 space-y-6">
						{draft.status === 'approved' ? <ApproveRow draft={draft} /> : null}
						<div className="flex items-baseline justify-between">
							<div>
								<p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
									Your plan
								</p>
								<h1 className="text-foreground text-2xl font-bold tracking-tight">
									{totalWeeks}-week build
									{draft.selectedEvent ? ` → ${draft.selectedEvent.name}` : ''}
								</h1>
							</div>
							<Button variant="ghost" size="sm" onClick={draft.discard}>
								<Icon name="pencil-1" size="sm" />
								Edit brief
							</Button>
						</div>

						<div className="border-border bg-card rounded-2xl border p-5">
							<h2 className="text-foreground mb-3 font-semibold">
								Plan outline
							</h2>
							<PhaseRibbon spans={spans} />
						</div>

						{[...byWeek.entries()].map(([w, sessions]) => (
							<div key={w}>
								<h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
									Week {w + 1} · {phaseForWeek(spans, w).name}
								</h2>
								<div className="space-y-3">
									{sessions.map((s, i) => (
										<SessionCard key={i} session={s} />
									))}
								</div>
							</div>
						))}

						{draft.status !== 'approved' ? <ApproveRow draft={draft} /> : null}
					</div>
				) : null}
			</div>
		</main>
	)
}
