// PROTOTYPE — three radically different layouts of the "Generate a Training
// Plan" wizard, switchable via `?variant=A|B|C` on the real `/training/plan/new`
// route + the floating PrototypeSwitcher (arrow keys cycle).
//
//   A · Guided Stepper   — one decision per screen, progress rail, review step.
//   B · Narrative builder — inline-editable sentence, conversational, opinionated.
//   C · Split workbench  — persistent controls + a live preview pane (tweak loop).
//
// Filename starts with `__` so react-router-auto-routes ignores it. To keep the
// flow reliably demonstrable without an athlete profile / trainable-days setup,
// generation is SIMULATED here (timed progress + a hardcoded sample preview) —
// the prototype is about look & flow, not the real SSE pipeline. When a layout
// wins, fold it into `plan.new.tsx` (wiring the real `generate()`/`approve`),
// then delete this file and the `?variant=` branch in `plan.new.tsx`.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	type PlanPreview,
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
} from '#app/utils/workout-schema.ts'
import { type ResolvedIntensity } from '#app/utils/zones/resolve.ts'

// ============================================================
// Variant registry — consumed by plan.new.tsx + PrototypeSwitcher.
// ============================================================
export const PLAN_PROTO_VARIANTS = [
	{ key: 'A', name: 'Guided Stepper' },
	{ key: 'B', name: 'Narrative builder' },
	{ key: 'C', name: 'Split workbench' },
	{ key: 'D', name: 'Coach chat' },
	{ key: 'E', name: 'Timeline canvas' },
	{ key: 'F', name: 'Cockpit dials' },
	{ key: 'G', name: 'Magic prompt' },
	{ key: 'H', name: 'Calendar drop' },
] as const

export type PlanProtoVariant = (typeof PLAN_PROTO_VARIANTS)[number]['key']

export function isPlanProtoVariant(
	value: string | null | undefined,
): value is PlanProtoVariant {
	return PLAN_PROTO_VARIANTS.some((v) => v.key === value)
}

export type TargetEventOption = {
	id: string
	name: string
	startDate: Date | string
}

type WizardInputs = {
	disciplines: CardioDiscipline[]
	experience: ExperienceLevel
	goal: string
	horizonWeeks: number
	targetEventId: string
}

// ============================================================
// Shared: simulated generation + sample preview.
// ============================================================
type GenStatus = 'idle' | 'generating' | 'preview'

const PROGRESS_SCRIPT = [
	'Reading your goal…',
	'Periodizing the run-up…',
	'Laying out base → build → peak…',
	'Drafting near-term sessions…',
	'Resolving intensity zones…',
]

function useSimulatedGeneration() {
	const [status, setStatus] = useState<GenStatus>('idle')
	const [progress, setProgress] = useState<string[]>([])
	const [preview, setPreview] = useState<PlanPreview | null>(null)
	const timers = useRef<ReturnType<typeof setTimeout>[]>([])

	function clear() {
		timers.current.forEach(clearTimeout)
		timers.current = []
	}
	useEffect(() => clear, [])

	function start() {
		clear()
		setStatus('generating')
		setProgress([])
		setPreview(null)
		PROGRESS_SCRIPT.forEach((line, i) => {
			timers.current.push(
				setTimeout(() => setProgress((p) => [...p, line]), 450 * (i + 1)),
			)
		})
		timers.current.push(
			setTimeout(
				() => {
					setPreview(SAMPLE_PREVIEW)
					setStatus('preview')
				},
				450 * (PROGRESS_SCRIPT.length + 1),
			),
		)
	}

	function reset() {
		clear()
		setStatus('idle')
		setProgress([])
		setPreview(null)
	}

	return { status, progress, preview, start, reset }
}

const day = (offset: number, hour = 7) => {
	const d = new Date()
	d.setHours(hour, 0, 0, 0)
	d.setDate(d.getDate() + offset)
	return d
}

const SAMPLE_PREVIEW: PlanPreview = {
	outline: {
		phases: [
			{
				name: 'Base',
				weeks: 3,
				focus: 'Aerobic volume, easy mileage',
				weeklyLoadHours: 5,
			},
			{
				name: 'Build',
				weeks: 3,
				focus: 'Threshold + tempo development',
				weeklyLoadHours: 6.5,
			},
			{
				name: 'Peak',
				weeks: 1,
				focus: 'Race-pace sharpening',
				weeklyLoadHours: 5.5,
			},
			{
				name: 'Taper',
				weeks: 1,
				focus: 'Freshen up, drop volume',
				weeklyLoadHours: 3,
			},
		],
	},
	sessions: [
		{
			weekIndex: 0,
			orderInWeek: 0,
			scheduledAt: day(1),
			title: 'Easy aerobic run',
			discipline: 'run',
			intent: 'endurance',
			blocks: [
				{
					name: 'Steady',
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							durationSec: 2700,
							intensity: { kind: 'zoneLabel', label: 'Zone 2' },
							resolvedIntensity: { hrMin: 138, hrMax: 150 },
						},
					],
				},
			],
		},
		{
			weekIndex: 0,
			orderInWeek: 1,
			scheduledAt: day(3),
			title: 'Threshold intervals',
			discipline: 'run',
			intent: 'threshold',
			blocks: [
				{
					name: 'Warm-up',
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							durationSec: 900,
							intensity: { kind: 'zoneLabel', label: 'Zone 1' },
						},
					],
				},
				{
					name: 'Main set',
					repeatCount: 4,
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							distanceM: 1000,
							intensity: { kind: 'zoneLabel', label: 'Threshold' },
							resolvedIntensity: { hrMin: 165, hrMax: 175 },
						},
						{ kind: 'rest', durationSec: 90 },
					],
				},
				{
					name: 'Cool-down',
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							durationSec: 600,
							intensity: { kind: 'zoneLabel', label: 'Zone 1' },
						},
					],
				},
			],
		},
		{
			weekIndex: 0,
			orderInWeek: 2,
			scheduledAt: day(6),
			title: 'Long run',
			discipline: 'run',
			intent: 'endurance',
			blocks: [
				{
					name: 'Long steady',
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							distanceM: 16000,
							intensity: { kind: 'zoneLabel', label: 'Zone 2' },
							resolvedIntensity: { hrMin: 140, hrMax: 152 },
						},
					],
				},
			],
		},
	],
}

// ============================================================
// Shared tiny helpers.
// ============================================================
function describeStep(step: PreviewStep): string {
	if (step.kind === 'rest') {
		const dur = step.durationSec ? formatDuration(step.durationSec) : ''
		return `Rest${dur ? ` ${dur}` : ''}`
	}
	const parts: string[] = [DISCIPLINE_LABELS[step.discipline]]
	if (step.durationSec) parts.push(formatDuration(step.durationSec))
	if (step.distanceM) parts.push(formatDistance(step.distanceM))
	if (step.intensity) parts.push(`@ ${step.intensity.label}`)
	const resolved = step.resolvedIntensity
	if (resolved && !resolved.unavailable) {
		const range = formatResolved(resolved)
		if (range) parts.push(`(${range})`)
	}
	return parts.join(' · ')
}

function formatResolved(r: ResolvedIntensity): string {
	if (r.hrMin != null) return `${r.hrMin}–${r.hrMax} bpm`
	if (r.powerMin != null) return `${r.powerMin}–${r.powerMax} W`
	if (r.paceMin != null) return `${r.paceMin}–${r.paceMax} s/km`
	return ''
}

function sessionDate(value: Date | string): string {
	const d = typeof value === 'string' ? new Date(value) : value
	return d.toLocaleString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function eventDate(value: Date | string): string {
	const d = typeof value === 'string' ? new Date(value) : value
	return d.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})
}

function weeksUntil(value: Date | string): number {
	const d = typeof value === 'string' ? new Date(value) : value
	const weeks = Math.ceil(
		(d.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000),
	)
	return Math.min(52, Math.max(1, weeks))
}

const DISCIPLINE_TINT: Record<CardioDiscipline, string> = {
	run: 'data-[on=true]:border-orange-400 data-[on=true]:bg-orange-500/10 data-[on=true]:text-orange-700 dark:data-[on=true]:text-orange-300',
	bike: 'data-[on=true]:border-sky-400 data-[on=true]:bg-sky-500/10 data-[on=true]:text-sky-700 dark:data-[on=true]:text-sky-300',
	swim: 'data-[on=true]:border-cyan-400 data-[on=true]:bg-cyan-500/10 data-[on=true]:text-cyan-700 dark:data-[on=true]:text-cyan-300',
}

function useWizardState(targetEvents: TargetEventOption[]) {
	const [inputs, setInputs] = useState<WizardInputs>({
		disciplines: ['run'],
		experience: 'intermediate',
		goal: '',
		horizonWeeks: 8,
		targetEventId: '',
	})
	const set = <K extends keyof WizardInputs>(k: K, v: WizardInputs[K]) =>
		setInputs((prev) => ({ ...prev, [k]: v }))
	const toggleDiscipline = (d: CardioDiscipline) =>
		setInputs((prev) => ({
			...prev,
			disciplines: prev.disciplines.includes(d)
				? prev.disciplines.filter((x) => x !== d)
				: [...prev.disciplines, d],
		}))

	const selectedEvent =
		targetEvents.find((e) => e.id === inputs.targetEventId) ?? null
	const effectiveHorizon = selectedEvent
		? weeksUntil(selectedEvent.startDate)
		: inputs.horizonWeeks
	const canGenerate =
		inputs.disciplines.length > 0 && inputs.goal.trim().length > 0

	return {
		inputs,
		set,
		toggleDiscipline,
		selectedEvent,
		effectiveHorizon,
		canGenerate,
	}
}

// Shared preview body (outline + sessions). Variants frame it differently
// but the inner content is the same data; the wrapper is what diverges.
function PreviewBody({ preview }: { preview: PlanPreview }) {
	const totalWeeks = preview.outline.phases.reduce((s, p) => s + p.weeks, 0)
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
					Periodization · {totalWeeks} weeks
				</h3>
				{/* Proportional phase bar */}
				<div className="border-border/60 mb-4 flex h-10 overflow-hidden rounded-lg border">
					{preview.outline.phases.map((phase, i) => (
						<div
							key={i}
							className={cn(
								'flex items-center justify-center text-[11px] font-medium',
								PHASE_BAR_TINTS[i % PHASE_BAR_TINTS.length],
							)}
							style={{ width: `${(phase.weeks / totalWeeks) * 100}%` }}
							title={`${phase.name} · ${phase.weeks}w`}
						>
							<span className="truncate px-1">{phase.name}</span>
						</div>
					))}
				</div>
				<ul className="flex flex-col gap-2">
					{preview.outline.phases.map((phase, i) => (
						<li key={i} className="flex items-baseline justify-between text-sm">
							<span>
								<span className="font-medium">{phase.name}</span>{' '}
								<span className="text-muted-foreground">· {phase.focus}</span>
							</span>
							<span className="text-muted-foreground shrink-0 tabular-nums">
								{phase.weeks}w · {phase.weeklyLoadHours}h/wk
							</span>
						</li>
					))}
				</ul>
			</div>

			<div>
				<h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
					Next sessions
				</h3>
				<ul className="flex flex-col gap-3">
					{preview.sessions.map((session, i) => (
						<li key={i} className="border-border/60 rounded-lg border p-4">
							<div className="flex items-baseline justify-between gap-2">
								<h4 className="font-medium">{session.title}</h4>
								<time className="text-muted-foreground shrink-0 text-xs">
									{sessionDate(session.scheduledAt)}
								</time>
							</div>
							<p className="text-muted-foreground text-xs">
								{DISCIPLINE_LABELS[session.discipline]} ·{' '}
								{INTENT_LABELS[session.intent]}
							</p>
							<div className="mt-2 flex flex-col gap-1">
								{session.blocks.map((block, bi) => (
									<div key={bi} className="text-sm">
										{block.repeatCount > 1 ? (
											<span className="text-muted-foreground">
												{block.repeatCount}×{' '}
											</span>
										) : null}
										<ul className="text-muted-foreground ml-4 list-disc">
											{block.steps.map((step, si) => (
												<li key={si}>{describeStep(step)}</li>
											))}
										</ul>
									</div>
								))}
							</div>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

const PHASE_BAR_TINTS = [
	'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200',
	'bg-amber-500/20 text-amber-800 dark:text-amber-200',
	'bg-rose-500/20 text-rose-800 dark:text-rose-200',
	'bg-sky-500/20 text-sky-800 dark:text-sky-200',
]

function ActionBar({
	onApprove,
	onRegenerate,
	onDiscard,
}: {
	onApprove?: () => void
	onRegenerate: () => void
	onDiscard: () => void
}) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<Button type="button" onClick={onApprove}>
				<Icon name="check" size="sm" />
				Approve &amp; save
			</Button>
			<Button type="button" variant="outline" onClick={onRegenerate}>
				<Icon name="reset" size="sm" />
				Regenerate
			</Button>
			<Button type="button" variant="ghost" onClick={onDiscard}>
				Discard
			</Button>
		</div>
	)
}

function GeneratingList({ progress }: { progress: string[] }) {
	return (
		<ul className="flex flex-col gap-2">
			{PROGRESS_SCRIPT.map((line, i) => {
				const done = i < progress.length
				const active = i === progress.length
				return (
					<li
						key={i}
						className={cn(
							'flex items-center gap-2 text-sm transition',
							done
								? 'text-foreground'
								: active
									? 'text-foreground'
									: 'text-muted-foreground/40',
						)}
					>
						{done ? (
							<Icon
								name="circle-check"
								size="sm"
								className="text-emerald-500"
							/>
						) : active ? (
							<Icon name="loader-2" size="sm" className="animate-spin" />
						) : (
							<span className="border-muted-foreground/30 size-4 rounded-full border" />
						)}
						{line}
					</li>
				)
			})}
		</ul>
	)
}

// ============================================================
// Variant A — Guided Stepper
// ============================================================
const STEPS = ['Disciplines', 'Experience', 'Goal', 'Target', 'Review'] as const

export function PlanWizardVariantA({
	targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState(targetEvents)
	const gen = useSimulatedGeneration()
	const [step, setStep] = useState(0)

	const last = STEPS.length - 1
	const stepValid = (() => {
		if (step === 0) return w.inputs.disciplines.length > 0
		if (step === 2) return w.inputs.goal.trim().length > 0
		return true
	})()

	if (gen.status === 'generating') {
		return (
			<StepperFrame step={last} title="Generating your plan">
				<GeneratingList progress={gen.progress} />
			</StepperFrame>
		)
	}

	if (gen.status === 'preview' && gen.preview) {
		return (
			<div className="mx-auto max-w-2xl">
				<header className="mb-6">
					<h1 className="text-2xl font-semibold tracking-tight">
						Review your plan
					</h1>
					<p className="text-muted-foreground text-sm">
						Nothing is saved until you approve.
					</p>
				</header>
				<PreviewBody preview={gen.preview} />
				<div className="bg-background/90 sticky bottom-0 mt-6 border-t py-4 backdrop-blur">
					<ActionBar onRegenerate={gen.start} onDiscard={gen.reset} />
				</div>
			</div>
		)
	}

	return (
		<StepperFrame step={step} title="Generate a Training Plan">
			<div className="min-h-[220px]">
				{step === 0 && (
					<Field label="Which disciplines?" hint="Pick one or more.">
						<div className="grid grid-cols-3 gap-3">
							{CARDIO_DISCIPLINES.map((d) => (
								<button
									key={d}
									type="button"
									data-on={w.inputs.disciplines.includes(d)}
									onClick={() => w.toggleDiscipline(d)}
									className={cn(
										'border-input rounded-xl border p-4 text-center text-sm font-medium transition',
										DISCIPLINE_TINT[d],
									)}
								>
									{DISCIPLINE_LABELS[d]}
								</button>
							))}
						</div>
					</Field>
				)}

				{step === 1 && (
					<Field label="How experienced are you?">
						<div className="flex flex-col gap-3">
							{EXPERIENCE_LEVELS.map((level) => (
								<button
									key={level}
									type="button"
									data-on={w.inputs.experience === level}
									onClick={() => w.set('experience', level)}
									className="border-input data-[on=true]:border-primary data-[on=true]:bg-primary/5 flex items-center justify-between rounded-xl border p-4 text-left text-sm font-medium transition"
								>
									{EXPERIENCE_LABELS[level]}
									{w.inputs.experience === level ? (
										<Icon name="check" size="sm" className="text-primary" />
									) : null}
								</button>
							))}
						</div>
					</Field>
				)}

				{step === 2 && (
					<Field
						label="What's your goal?"
						hint="Be specific — it shapes the plan."
					>
						<textarea
							autoFocus
							className="border-input bg-background min-h-32 w-full rounded-xl border p-4 text-sm"
							placeholder="e.g. Run a sub-2:00 half marathon"
							value={w.inputs.goal}
							onChange={(e) => w.set('goal', e.target.value)}
						/>
					</Field>
				)}

				{step === 3 && (
					<Field
						label="Target event?"
						hint="Anchoring to an event sets the horizon automatically."
					>
						<div className="flex flex-col gap-3">
							<button
								type="button"
								data-on={!w.inputs.targetEventId}
								onClick={() => w.set('targetEventId', '')}
								className="border-input data-[on=true]:border-primary data-[on=true]:bg-primary/5 rounded-xl border p-4 text-left text-sm font-medium transition"
							>
								No event — set a horizon
							</button>
							{targetEvents.map((event) => (
								<button
									key={event.id}
									type="button"
									data-on={w.inputs.targetEventId === event.id}
									onClick={() => w.set('targetEventId', event.id)}
									className="border-input data-[on=true]:border-primary data-[on=true]:bg-primary/5 flex items-center justify-between rounded-xl border p-4 text-left text-sm font-medium transition"
								>
									<span>{event.name}</span>
									<span className="text-muted-foreground text-xs">
										{eventDate(event.startDate)}
									</span>
								</button>
							))}
							{!w.inputs.targetEventId ? (
								<label className="mt-1 flex items-center gap-3 text-sm">
									<span className="text-muted-foreground">Horizon</span>
									<input
										type="number"
										min={1}
										max={52}
										value={w.inputs.horizonWeeks}
										onChange={(e) =>
											w.set('horizonWeeks', Number(e.target.value))
										}
										className="border-input bg-background w-20 rounded-md border px-3 py-1.5"
									/>
									<span className="text-muted-foreground">weeks</span>
								</label>
							) : null}
						</div>
					</Field>
				)}

				{step === 4 && (
					<Field label="Ready to generate" hint="Review your inputs.">
						<dl className="divide-border/60 divide-y text-sm">
							<SummaryRow label="Disciplines">
								{w.inputs.disciplines
									.map((d) => DISCIPLINE_LABELS[d])
									.join(', ')}
							</SummaryRow>
							<SummaryRow label="Experience">
								{EXPERIENCE_LABELS[w.inputs.experience]}
							</SummaryRow>
							<SummaryRow label="Goal">{w.inputs.goal || '—'}</SummaryRow>
							<SummaryRow label="Target">
								{w.selectedEvent
									? `${w.selectedEvent.name} · ${w.effectiveHorizon} weeks`
									: `${w.effectiveHorizon} weeks`}
							</SummaryRow>
						</dl>
					</Field>
				)}
			</div>

			<div className="mt-8 flex items-center justify-between">
				<Button
					type="button"
					variant="ghost"
					onClick={() => setStep((s) => Math.max(0, s - 1))}
					disabled={step === 0}
				>
					<Icon name="arrow-left" size="sm" />
					Back
				</Button>
				{step < last ? (
					<Button
						type="button"
						onClick={() => setStep((s) => s + 1)}
						disabled={!stepValid}
					>
						Next
						<Icon name="arrow-right" size="sm" />
					</Button>
				) : (
					<Button type="button" onClick={gen.start} disabled={!w.canGenerate}>
						Generate plan
						<Icon name="arrow-right" size="sm" />
					</Button>
				)}
			</div>
		</StepperFrame>
	)
}

function StepperFrame({
	step,
	title,
	children,
}: {
	step: number
	title: string
	children: React.ReactNode
}) {
	return (
		<div className="mx-auto max-w-xl">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
				<Link to="/" className="text-muted-foreground text-sm hover:underline">
					Cancel
				</Link>
			</div>
			{/* Progress rail */}
			<ol className="mb-8 flex items-center gap-2">
				{STEPS.map((s, i) => (
					<li key={s} className="flex flex-1 items-center gap-2">
						<div
							className={cn(
								'h-1.5 flex-1 rounded-full transition',
								i <= step ? 'bg-primary' : 'bg-muted',
							)}
						/>
					</li>
				))}
			</ol>
			<p className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
				Step {Math.min(step + 1, STEPS.length)} of {STEPS.length} ·{' '}
				{STEPS[Math.min(step, STEPS.length - 1)]}
			</p>
			{children}
		</div>
	)
}

function Field({
	label,
	hint,
	children,
}: {
	label: string
	hint?: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-3">
			<div>
				<h2 className="text-lg font-medium">{label}</h2>
				{hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
			</div>
			{children}
		</div>
	)
}

function SummaryRow({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="flex items-baseline justify-between gap-4 py-2">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-right font-medium">{children}</dd>
		</div>
	)
}

// ============================================================
// Variant B — Narrative builder
// Inline-editable sentence. Click any underlined token to edit it.
// ============================================================
export function PlanWizardVariantB({
	targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState(targetEvents)
	const gen = useSimulatedGeneration()

	const disciplineText =
		w.inputs.disciplines.length === 0
			? 'a discipline'
			: w.inputs.disciplines.map((d) => DISCIPLINE_LABELS[d]).join(' + ')

	return (
		<div className="mx-auto max-w-2xl">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="text-2xl font-semibold tracking-tight">
					Let's build your plan
				</h1>
				<Link to="/" className="text-muted-foreground text-sm hover:underline">
					Cancel
				</Link>
			</div>

			{/* The sentence */}
			<div className="text-2xl leading-relaxed font-light sm:text-3xl sm:leading-relaxed">
				Build me a{' '}
				<Popover
					label={disciplineText}
					empty={w.inputs.disciplines.length === 0}
				>
					<p className="text-muted-foreground mb-2 text-xs">Disciplines</p>
					<div className="flex flex-wrap gap-2">
						{CARDIO_DISCIPLINES.map((d) => (
							<button
								key={d}
								type="button"
								data-on={w.inputs.disciplines.includes(d)}
								onClick={() => w.toggleDiscipline(d)}
								className={cn(
									'border-input rounded-full border px-3 py-1 text-sm transition',
									DISCIPLINE_TINT[d],
								)}
							>
								{DISCIPLINE_LABELS[d]}
							</button>
						))}
					</div>
				</Popover>{' '}
				plan. I'm an{' '}
				<Popover label={EXPERIENCE_LABELS[w.inputs.experience]}>
					<p className="text-muted-foreground mb-2 text-xs">Experience</p>
					<div className="flex flex-col gap-1">
						{EXPERIENCE_LEVELS.map((level) => (
							<button
								key={level}
								type="button"
								onClick={() => w.set('experience', level)}
								className={cn(
									'rounded-md px-3 py-1.5 text-left text-sm transition',
									w.inputs.experience === level
										? 'bg-primary/10 text-primary font-medium'
										: 'hover:bg-muted',
								)}
							>
								{EXPERIENCE_LABELS[level]}
							</button>
						))}
					</div>
				</Popover>{' '}
				athlete who wants to{' '}
				<Popover
					label={w.inputs.goal || 'describe a goal'}
					empty={!w.inputs.goal}
					wide
				>
					<p className="text-muted-foreground mb-2 text-xs">Your goal</p>
					<textarea
						autoFocus
						className="border-input bg-background min-h-24 w-72 rounded-md border p-3 text-sm"
						placeholder="e.g. Run a sub-2:00 half marathon"
						value={w.inputs.goal}
						onChange={(e) => w.set('goal', e.target.value)}
					/>
				</Popover>
				, targeting{' '}
				<Popover
					label={
						w.selectedEvent
							? w.selectedEvent.name
							: `${w.inputs.horizonWeeks} weeks out`
					}
				>
					<p className="text-muted-foreground mb-2 text-xs">Target</p>
					<div className="flex w-64 flex-col gap-1">
						<button
							type="button"
							onClick={() => w.set('targetEventId', '')}
							className={cn(
								'rounded-md px-3 py-1.5 text-left text-sm transition',
								!w.inputs.targetEventId
									? 'bg-primary/10 text-primary font-medium'
									: 'hover:bg-muted',
							)}
						>
							No event — set a horizon
						</button>
						{targetEvents.map((event) => (
							<button
								key={event.id}
								type="button"
								onClick={() => w.set('targetEventId', event.id)}
								className={cn(
									'rounded-md px-3 py-1.5 text-left text-sm transition',
									w.inputs.targetEventId === event.id
										? 'bg-primary/10 text-primary font-medium'
										: 'hover:bg-muted',
								)}
							>
								{event.name}
								<span className="text-muted-foreground ml-1 text-xs">
									{eventDate(event.startDate)}
								</span>
							</button>
						))}
						{!w.inputs.targetEventId ? (
							<label className="mt-2 flex items-center gap-2 text-sm">
								<input
									type="number"
									min={1}
									max={52}
									value={w.inputs.horizonWeeks}
									onChange={(e) =>
										w.set('horizonWeeks', Number(e.target.value))
									}
									className="border-input bg-background w-20 rounded-md border px-3 py-1.5"
								/>
								weeks
							</label>
						) : null}
					</div>
				</Popover>
				.
			</div>

			<div className="mt-10">
				{gen.status === 'idle' && (
					<Button
						type="button"
						size="lg"
						onClick={gen.start}
						disabled={!w.canGenerate}
					>
						Generate my plan
						<Icon name="arrow-right" size="sm" />
					</Button>
				)}

				{gen.status === 'generating' && (
					<div className="border-border/60 rounded-xl border p-6">
						<GeneratingList progress={gen.progress} />
					</div>
				)}

				{gen.status === 'preview' && gen.preview && (
					<div className="border-border/60 animate-in fade-in slide-in-from-bottom-2 rounded-xl border p-6">
						<div className="mb-5">
							<ActionBar onRegenerate={gen.start} onDiscard={gen.reset} />
						</div>
						<PreviewBody preview={gen.preview} />
					</div>
				)}
			</div>
		</div>
	)
}

function Popover({
	label,
	children,
	empty,
	wide,
}: {
	label: string
	children: React.ReactNode
	empty?: boolean
	wide?: boolean
}) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLSpanElement>(null)

	useEffect(() => {
		if (!open) return
		function onDoc(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', onDoc)
		return () => document.removeEventListener('mousedown', onDoc)
	}, [open])

	return (
		<span ref={ref} className="relative inline-block">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className={cn(
					'decoration-primary/50 hover:decoration-primary rounded px-1 underline decoration-2 underline-offset-4 transition',
					empty ? 'text-muted-foreground/60' : 'text-primary',
				)}
			>
				{label}
			</button>
			{open ? (
				<span
					className={cn(
						'bg-popover absolute top-full left-0 z-20 mt-2 block rounded-xl border p-4 text-base font-normal shadow-xl',
						wide ? 'w-80' : 'w-max',
					)}
				>
					{children}
				</span>
			) : null}
		</span>
	)
}

// ============================================================
// Variant C — Split workbench
// Persistent control panel (left) + live preview pane (right).
// ============================================================
export function PlanWizardVariantC({
	targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState(targetEvents)
	const gen = useSimulatedGeneration()

	return (
		<div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
			{/* Controls */}
			<aside className="border-border/60 bg-card flex h-fit flex-col gap-5 rounded-xl border p-5 lg:sticky lg:top-6">
				<div className="flex items-center justify-between">
					<h1 className="text-lg font-semibold tracking-tight">Plan inputs</h1>
					<Link
						to="/"
						className="text-muted-foreground text-sm hover:underline"
					>
						Cancel
					</Link>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">
						Disciplines
					</span>
					<div className="flex flex-wrap gap-2">
						{CARDIO_DISCIPLINES.map((d) => (
							<button
								key={d}
								type="button"
								data-on={w.inputs.disciplines.includes(d)}
								onClick={() => w.toggleDiscipline(d)}
								className={cn(
									'border-input rounded-lg border px-3 py-1.5 text-sm transition',
									DISCIPLINE_TINT[d],
								)}
							>
								{DISCIPLINE_LABELS[d]}
							</button>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">
						Experience
					</span>
					<div className="border-input flex rounded-lg border p-0.5">
						{EXPERIENCE_LEVELS.map((level) => (
							<button
								key={level}
								type="button"
								onClick={() => w.set('experience', level)}
								className={cn(
									'flex-1 rounded-md py-1.5 text-xs font-medium transition',
									w.inputs.experience === level
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								{EXPERIENCE_LABELS[level]}
							</button>
						))}
					</div>
				</div>

				<label className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">
						Goal
					</span>
					<textarea
						className="border-input bg-background min-h-20 rounded-lg border p-3 text-sm"
						placeholder="e.g. Run a sub-2:00 half marathon"
						value={w.inputs.goal}
						onChange={(e) => w.set('goal', e.target.value)}
					/>
				</label>

				{targetEvents.length > 0 ? (
					<label className="flex flex-col gap-1.5">
						<span className="text-muted-foreground text-xs font-medium">
							Target event
						</span>
						<select
							className="border-input bg-background rounded-lg border px-3 py-2 text-sm"
							value={w.inputs.targetEventId}
							onChange={(e) => w.set('targetEventId', e.target.value)}
						>
							<option value="">No event — set a horizon</option>
							{targetEvents.map((event) => (
								<option key={event.id} value={event.id}>
									{event.name} · {eventDate(event.startDate)}
								</option>
							))}
						</select>
					</label>
				) : null}

				{w.selectedEvent ? (
					<p className="text-muted-foreground text-sm">
						Periodizing toward <strong>{w.selectedEvent.name}</strong> ·{' '}
						{w.effectiveHorizon} weeks away.
					</p>
				) : (
					<label className="flex flex-col gap-1.5">
						<span className="text-muted-foreground text-xs font-medium">
							Horizon (weeks)
						</span>
						<input
							type="number"
							min={1}
							max={52}
							value={w.inputs.horizonWeeks}
							onChange={(e) => w.set('horizonWeeks', Number(e.target.value))}
							className="border-input bg-background w-24 rounded-lg border px-3 py-2 text-sm"
						/>
					</label>
				)}

				<Button
					type="button"
					onClick={gen.start}
					disabled={!w.canGenerate || gen.status === 'generating'}
					className="mt-1"
				>
					{gen.status === 'generating'
						? 'Generating…'
						: gen.status === 'preview'
							? 'Regenerate'
							: 'Generate plan'}
				</Button>
			</aside>

			{/* Live preview pane */}
			<section className="border-border/60 min-h-[480px] rounded-xl border p-6">
				{gen.status === 'idle' && (
					<div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
						<div className="bg-muted mb-4 grid size-14 place-items-center rounded-full">
							<Icon
								name="bar-chart"
								size="lg"
								className="text-muted-foreground"
							/>
						</div>
						<p className="font-medium">Your plan preview will appear here</p>
						<p className="text-muted-foreground mt-1 max-w-xs text-sm">
							Set your inputs on the left and hit Generate. Tweak and regenerate
							until it's right — nothing saves until you approve.
						</p>
					</div>
				)}

				{gen.status === 'generating' && (
					<div className="flex h-full min-h-[420px] flex-col justify-center">
						<p className="mb-4 text-sm font-medium">Building your plan…</p>
						<GeneratingList progress={gen.progress} />
					</div>
				)}

				{gen.status === 'preview' && gen.preview && (
					<div>
						<div className="mb-5 flex items-center justify-between">
							<h2 className="text-lg font-semibold tracking-tight">
								Plan preview
							</h2>
							<ActionBar onRegenerate={gen.start} onDiscard={gen.reset} />
						</div>
						<PreviewBody preview={gen.preview} />
					</div>
				)}
			</section>
		</div>
	)
}

// ============================================================
// Dispatcher
// ============================================================
const VARIANT_COMPONENTS: Record<
	PlanProtoVariant,
	(props: { targetEvents: TargetEventOption[] }) => React.ReactNode
> = {
	A: PlanWizardVariantA,
	B: PlanWizardVariantB,
	C: PlanWizardVariantC,
	D: PlanWizardVariantD,
	E: PlanWizardVariantE,
	F: PlanWizardVariantF,
	G: PlanWizardVariantG,
	H: PlanWizardVariantH,
}

export function PlanWizardPrototype({
	variant,
	targetEvents,
}: {
	variant: PlanProtoVariant
	targetEvents: TargetEventOption[]
}) {
	const Variant = VARIANT_COMPONENTS[variant]
	return (
		<main className="container mx-auto py-8">
			<Variant targetEvents={targetEvents} />
		</main>
	)
}

// ============================================================
// Variant D — Coach chat
// A conversational thread: the coach asks one thing at a time, you answer
// from the composer (chips or a text field). The plan arrives as a chat
// message once the questions are done.
// ============================================================
type ChatTurn = { from: 'coach' | 'you'; text: string }

type ChatStage =
	| 'disciplines'
	| 'experience'
	| 'goal'
	| 'target'
	| 'generating'
	| 'done'

export function PlanWizardVariantD({
	targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState(targetEvents)
	const gen = useSimulatedGeneration()
	const [stage, setStage] = useState<ChatStage>('disciplines')
	const [turns, setTurns] = useState<ChatTurn[]>([
		{
			from: 'coach',
			text: "Hey! I'm your Trainm8 coach. Let's put a plan together. Which disciplines are we training?",
		},
	])
	const threadRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
	}, [turns, stage])

	function say(turn: ChatTurn) {
		setTurns((t) => [...t, turn])
	}

	function advance(youSaid: string, next: ChatStage, coachAsks: string) {
		say({ from: 'you', text: youSaid })
		setStage(next)
		// Small delay so the coach "responds" rather than appearing instantly.
		window.setTimeout(() => say({ from: 'coach', text: coachAsks }), 400)
	}

	function finish() {
		say({ from: 'you', text: targetLabel(w) })
		setStage('generating')
		window.setTimeout(() => {
			say({ from: 'coach', text: 'Got it — building your plan now…' })
			gen.start()
		}, 400)
	}

	// When the simulated generation lands, surface the plan as a coach message.
	useEffect(() => {
		if (gen.status === 'preview' && stage === 'generating') {
			setStage('done')
			say({ from: 'coach', text: "Here's what I'd run with:" })
		}
	}, [gen.status, stage])

	return (
		<div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="bg-primary/15 text-primary grid size-8 place-items-center rounded-full text-sm font-bold">
						C
					</span>
					<div>
						<p className="text-sm font-semibold">Coach</p>
						<p className="text-muted-foreground text-xs">Plan builder</p>
					</div>
				</div>
				<Link to="/" className="text-muted-foreground text-sm hover:underline">
					Cancel
				</Link>
			</div>

			<div
				ref={threadRef}
				className="border-border/60 flex-1 space-y-3 overflow-y-auto rounded-xl border p-4"
			>
				{turns.map((turn, i) => (
					<div
						key={i}
						className={cn(
							'flex',
							turn.from === 'you' ? 'justify-end' : 'justify-start',
						)}
					>
						<div
							className={cn(
								'max-w-[80%] rounded-2xl px-4 py-2 text-sm',
								turn.from === 'you'
									? 'bg-primary text-primary-foreground rounded-br-sm'
									: 'bg-muted rounded-bl-sm',
							)}
						>
							{turn.text}
						</div>
					</div>
				))}

				{stage === 'generating' ? (
					<div className="flex justify-start">
						<div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-2xl rounded-bl-sm px-4 py-2 text-sm">
							<Icon name="loader-2" size="sm" className="animate-spin" />
							{gen.progress.at(-1) ?? 'Thinking…'}
						</div>
					</div>
				) : null}

				{stage === 'done' && gen.preview ? (
					<div className="flex justify-start">
						<div className="bg-card border-border/60 w-full rounded-2xl rounded-bl-sm border p-4">
							<PreviewBody preview={gen.preview} />
							<div className="mt-4">
								<ActionBar
									onRegenerate={() => {
										setStage('generating')
										say({ from: 'coach', text: 'Reworking it…' })
										gen.start()
									}}
									onDiscard={gen.reset}
								/>
							</div>
						</div>
					</div>
				) : null}
			</div>

			{/* Composer — changes per question */}
			<div className="border-border/60 mt-3 rounded-xl border p-3">
				{stage === 'disciplines' ? (
					<ComposerChips>
						{CARDIO_DISCIPLINES.map((d) => (
							<button
								key={d}
								type="button"
								data-on={w.inputs.disciplines.includes(d)}
								onClick={() => w.toggleDiscipline(d)}
								className={cn(
									'border-input rounded-full border px-3 py-1.5 text-sm transition',
									DISCIPLINE_TINT[d],
								)}
							>
								{DISCIPLINE_LABELS[d]}
							</button>
						))}
						<ComposerSend
							disabled={w.inputs.disciplines.length === 0}
							onClick={() =>
								advance(
									w.inputs.disciplines
										.map((d) => DISCIPLINE_LABELS[d])
										.join(' + '),
									'experience',
									'Nice. How would you rate your experience?',
								)
							}
						/>
					</ComposerChips>
				) : null}

				{stage === 'experience' ? (
					<ComposerChips>
						{EXPERIENCE_LEVELS.map((level) => (
							<button
								key={level}
								type="button"
								onClick={() =>
									advance(
										EXPERIENCE_LABELS[level],
										'goal',
										'What are you training for? Give me the goal in your words.',
									)
								}
								className="border-input hover:bg-muted rounded-full border px-3 py-1.5 text-sm transition"
							>
								{EXPERIENCE_LABELS[level]}
							</button>
						))}
					</ComposerChips>
				) : null}

				{stage === 'goal' ? (
					<form
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault()
							if (!w.inputs.goal.trim()) return
							advance(
								w.inputs.goal,
								'target',
								targetEvents.length > 0
									? 'Are you pointing at a specific event?'
									: 'How many weeks should I plan for?',
							)
						}}
					>
						<input
							autoFocus
							className="border-input bg-background flex-1 rounded-full border px-4 py-2 text-sm"
							placeholder="e.g. Run a sub-2:00 half marathon"
							value={w.inputs.goal}
							onChange={(e) => w.set('goal', e.target.value)}
						/>
						<ComposerSend disabled={!w.inputs.goal.trim()} />
					</form>
				) : null}

				{stage === 'target' ? (
					<ComposerChips>
						{targetEvents.map((event) => (
							<button
								key={event.id}
								type="button"
								onClick={() => {
									w.set('targetEventId', event.id)
									finish()
								}}
								className="border-input hover:bg-muted rounded-full border px-3 py-1.5 text-sm transition"
							>
								{event.name}
							</button>
						))}
						<label className="flex items-center gap-2 text-sm">
							<input
								type="number"
								min={1}
								max={52}
								value={w.inputs.horizonWeeks}
								onChange={(e) => {
									w.set('targetEventId', '')
									w.set('horizonWeeks', Number(e.target.value))
								}}
								className="border-input bg-background w-20 rounded-full border px-3 py-1.5"
							/>
							weeks
						</label>
						<ComposerSend onClick={finish} />
					</ComposerChips>
				) : null}

				{stage === 'generating' || stage === 'done' ? (
					<p className="text-muted-foreground px-2 py-1 text-sm">
						{stage === 'done'
							? 'Plan ready above ☝️'
							: 'Coach is working on it…'}
					</p>
				) : null}
			</div>
		</div>
	)
}

function ComposerChips({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

function ComposerSend({
	disabled,
	onClick,
}: {
	disabled?: boolean
	onClick?: () => void
}) {
	return (
		<button
			type={onClick ? 'button' : 'submit'}
			onClick={onClick}
			disabled={disabled}
			className="bg-primary text-primary-foreground ml-auto grid size-9 shrink-0 place-items-center rounded-full transition disabled:opacity-40"
			aria-label="Send"
		>
			<Icon name="arrow-right" size="sm" />
		</button>
	)
}

function targetLabel(w: ReturnType<typeof useWizardState>): string {
	return w.selectedEvent
		? w.selectedEvent.name
		: `${w.effectiveHorizon} weeks out`
}

// ============================================================
// Variant E — Timeline canvas
// Time-first. The hero is a horizontal timeline from today → race day.
// Inputs sit in a compact toolbar; generating paints periodized phase bands
// and session markers straight onto the timeline.
// ============================================================
export function PlanWizardVariantE({
	targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState(targetEvents)
	const gen = useSimulatedGeneration()
	const totalWeeks = w.effectiveHorizon
	const phases = gen.preview?.outline.phases ?? null

	// Map a phase index → cumulative start week, for placing bands on the track.
	let acc = 0
	const bands = (phases ?? []).map((p) => {
		const startPct = (acc / totalWeeksOf(phases!)) * 100
		const widthPct = (p.weeks / totalWeeksOf(phases!)) * 100
		acc += p.weeks
		return { phase: p, startPct, widthPct }
	})

	return (
		<div className="mx-auto max-w-5xl">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Plan timeline
					</h1>
					<p className="text-muted-foreground text-sm">
						From today to race day — {totalWeeks} weeks.
					</p>
				</div>
				<Link to="/" className="text-muted-foreground text-sm hover:underline">
					Cancel
				</Link>
			</div>

			{/* Toolbar */}
			<div className="border-border/60 mb-8 flex flex-wrap items-end gap-4 rounded-xl border p-4">
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">
						Disciplines
					</span>
					<div className="flex gap-2">
						{CARDIO_DISCIPLINES.map((d) => (
							<button
								key={d}
								type="button"
								data-on={w.inputs.disciplines.includes(d)}
								onClick={() => w.toggleDiscipline(d)}
								className={cn(
									'border-input rounded-lg border px-3 py-1.5 text-sm transition',
									DISCIPLINE_TINT[d],
								)}
							>
								{DISCIPLINE_LABELS[d]}
							</button>
						))}
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">
						Experience
					</span>
					<div className="border-input flex rounded-lg border p-0.5">
						{EXPERIENCE_LEVELS.map((level) => (
							<button
								key={level}
								type="button"
								onClick={() => w.set('experience', level)}
								className={cn(
									'rounded-md px-2.5 py-1 text-xs font-medium transition',
									w.inputs.experience === level
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								{EXPERIENCE_LABELS[level]}
							</button>
						))}
					</div>
				</div>
				<label className="flex flex-1 flex-col gap-1.5">
					<span className="text-muted-foreground text-xs font-medium">
						Goal
					</span>
					<input
						className="border-input bg-background min-w-48 rounded-lg border px-3 py-2 text-sm"
						placeholder="e.g. Run a sub-2:00 half marathon"
						value={w.inputs.goal}
						onChange={(e) => w.set('goal', e.target.value)}
					/>
				</label>
			</div>

			{/* The timeline */}
			<div className="border-border/60 rounded-xl border p-6">
				<div className="mb-2 flex items-center justify-between text-xs font-medium">
					<span className="text-muted-foreground">TODAY</span>
					<span className="text-foreground">
						{w.selectedEvent?.name ?? 'Race day'} · wk {totalWeeks}
					</span>
				</div>

				{/* Track */}
				<div className="bg-muted relative h-16 overflow-hidden rounded-lg">
					{bands.length > 0 ? (
						bands.map((b, i) => (
							<div
								key={i}
								className={cn(
									'absolute inset-y-0 flex items-center justify-center border-r border-white/40 text-[11px] font-medium last:border-r-0',
									PHASE_BAR_TINTS[i % PHASE_BAR_TINTS.length],
								)}
								style={{ left: `${b.startPct}%`, width: `${b.widthPct}%` }}
								title={`${b.phase.name} · ${b.phase.weeks}w`}
							>
								<span className="truncate px-1">{b.phase.name}</span>
							</div>
						))
					) : (
						<div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
							{gen.status === 'generating'
								? (gen.progress.at(-1) ?? 'Plotting your phases…')
								: 'Phases will plot here once generated'}
						</div>
					)}

					{/* Session markers */}
					{gen.preview?.sessions.map((s, i) => {
						const left = ((i + 0.5) / (gen.preview!.sessions.length + 2)) * 100
						return (
							<span
								key={i}
								className="bg-foreground absolute top-1 size-2 -translate-x-1/2 rounded-full ring-2 ring-white"
								style={{ left: `${left}%` }}
								title={s.title}
							/>
						)
					})}
				</div>

				{/* Week ticks */}
				<div className="text-muted-foreground mt-1 flex justify-between text-[10px] tabular-nums">
					{Array.from({ length: 5 }, (_, i) => (
						<span key={i}>wk {Math.round((totalWeeks / 4) * i)}</span>
					))}
				</div>

				<div className="mt-6 flex items-center gap-3">
					<label className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">Horizon</span>
						<input
							type="range"
							min={4}
							max={24}
							value={w.inputs.horizonWeeks}
							disabled={!!w.selectedEvent}
							onChange={(e) => w.set('horizonWeeks', Number(e.target.value))}
							className="accent-primary"
						/>
						<span className="w-14 tabular-nums">{totalWeeks} weeks</span>
					</label>
					<Button
						type="button"
						className="ml-auto"
						onClick={gen.start}
						disabled={!w.canGenerate || gen.status === 'generating'}
					>
						{gen.status === 'idle'
							? 'Plot plan'
							: gen.status === 'generating'
								? 'Plotting…'
								: 'Re-plot'}
					</Button>
				</div>
			</div>

			{gen.status === 'preview' && gen.preview ? (
				<div className="mt-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-lg font-semibold tracking-tight">
							Sessions on the timeline
						</h2>
						<ActionBar onRegenerate={gen.start} onDiscard={gen.reset} />
					</div>
					<div className="grid gap-3 sm:grid-cols-3">
						{gen.preview.sessions.map((session, i) => (
							<div key={i} className="border-border/60 rounded-lg border p-4">
								<time className="text-muted-foreground text-xs">
									{sessionDate(session.scheduledAt)}
								</time>
								<h4 className="mt-1 font-medium">{session.title}</h4>
								<p className="text-muted-foreground text-xs">
									{DISCIPLINE_LABELS[session.discipline]} ·{' '}
									{INTENT_LABELS[session.intent]}
								</p>
								<ul className="text-muted-foreground mt-2 ml-4 list-disc text-xs">
									{session.blocks.flatMap((b, bi) =>
										b.steps.map((step, si) => (
											<li key={`${bi}-${si}`}>
												{b.repeatCount > 1 && si === 0
													? `${b.repeatCount}× `
													: ''}
												{describeStep(step)}
											</li>
										)),
									)}
								</ul>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	)
}

function totalWeeksOf(phases: { weeks: number }[]): number {
	return phases.reduce((s, p) => s + p.weeks, 0)
}

// ============================================================
// Variant F — Cockpit dials
// A control-panel aesthetic: switches, segmented controls, a radial horizon
// gauge and a big launch button. Preview reads back like an instrument panel.
// ============================================================
export function PlanWizardVariantF({
	targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState(targetEvents)
	const gen = useSimulatedGeneration()

	return (
		<div className="mx-auto max-w-3xl">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-mono text-xl font-bold tracking-tight uppercase">
					Plan Control
				</h1>
				<Link
					to="/"
					className="text-muted-foreground font-mono text-xs hover:underline"
				>
					[ exit ]
				</Link>
			</div>

			<div className="border-border bg-card rounded-2xl border-2 p-6 shadow-inner">
				<div className="grid gap-6 sm:grid-cols-2">
					{/* Discipline switches */}
					<Panel label="Disciplines">
						<div className="flex flex-col gap-2">
							{CARDIO_DISCIPLINES.map((d) => {
								const on = w.inputs.disciplines.includes(d)
								return (
									<button
										key={d}
										type="button"
										onClick={() => w.toggleDiscipline(d)}
										className="flex items-center justify-between"
									>
										<span className="font-mono text-sm">
											{DISCIPLINE_LABELS[d]}
										</span>
										<span
											className={cn(
												'relative h-6 w-11 rounded-full transition',
												on ? 'bg-primary' : 'bg-muted-foreground/30',
											)}
										>
											<span
												className={cn(
													'absolute top-0.5 size-5 rounded-full bg-white shadow transition',
													on ? 'left-[1.375rem]' : 'left-0.5',
												)}
											/>
										</span>
									</button>
								)
							})}
						</div>
					</Panel>

					{/* Horizon gauge */}
					<Panel label="Horizon">
						<HorizonGauge
							weeks={w.effectiveHorizon}
							locked={!!w.selectedEvent}
							onChange={(v) => w.set('horizonWeeks', v)}
						/>
					</Panel>

					{/* Experience segmented */}
					<Panel label="Experience">
						<div className="border-border flex rounded-lg border">
							{EXPERIENCE_LEVELS.map((level) => (
								<button
									key={level}
									type="button"
									onClick={() => w.set('experience', level)}
									className={cn(
										'flex-1 py-2 font-mono text-xs uppercase transition first:rounded-l-md last:rounded-r-md',
										w.inputs.experience === level
											? 'bg-foreground text-background'
											: 'text-muted-foreground hover:text-foreground',
									)}
								>
									{level.slice(0, 3)}
								</button>
							))}
						</div>
						{targetEvents.length > 0 ? (
							<select
								className="border-border bg-background mt-3 w-full rounded-lg border px-2 py-1.5 font-mono text-xs"
								value={w.inputs.targetEventId}
								onChange={(e) => w.set('targetEventId', e.target.value)}
							>
								<option value="">— no event —</option>
								{targetEvents.map((event) => (
									<option key={event.id} value={event.id}>
										{event.name}
									</option>
								))}
							</select>
						) : null}
					</Panel>

					{/* Goal */}
					<Panel label="Mission">
						<textarea
							className="border-border bg-background h-full min-h-20 w-full rounded-lg border p-2 font-mono text-sm"
							placeholder="> describe the goal"
							value={w.inputs.goal}
							onChange={(e) => w.set('goal', e.target.value)}
						/>
					</Panel>
				</div>

				{/* Launch */}
				<button
					type="button"
					onClick={gen.start}
					disabled={!w.canGenerate || gen.status === 'generating'}
					className={cn(
						'mt-6 w-full rounded-xl py-4 font-mono text-sm font-bold tracking-widest uppercase transition disabled:opacity-40',
						gen.status === 'generating'
							? 'bg-amber-500 text-black'
							: 'bg-primary text-primary-foreground hover:brightness-110',
					)}
				>
					{gen.status === 'generating'
						? '◍ generating…'
						: gen.status === 'preview'
							? '↻ regenerate'
							: '▶ launch generation'}
				</button>

				{gen.status === 'generating' ? (
					<div className="mt-4 font-mono text-xs">
						{PROGRESS_SCRIPT.map((line, i) => (
							<div
								key={i}
								className={cn(
									i < gen.progress.length
										? 'text-emerald-500'
										: 'text-muted-foreground/40',
								)}
							>
								{i < gen.progress.length ? '✓' : '·'} {line}
							</div>
						))}
					</div>
				) : null}
			</div>

			{gen.status === 'preview' && gen.preview ? (
				<div className="border-border mt-6 rounded-2xl border-2 p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-mono text-sm font-bold tracking-widest uppercase">
							Readout
						</h2>
						<ActionBar onRegenerate={gen.start} onDiscard={gen.reset} />
					</div>
					<PreviewBody preview={gen.preview} />
				</div>
			) : null}
		</div>
	)
}

function Panel({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="border-border/60 bg-background/50 rounded-xl border p-4">
			<p className="text-muted-foreground mb-3 font-mono text-[10px] font-bold tracking-widest uppercase">
				{label}
			</p>
			{children}
		</div>
	)
}

function HorizonGauge({
	weeks,
	locked,
	onChange,
}: {
	weeks: number
	locked: boolean
	onChange: (v: number) => void
}) {
	const min = 4
	const max = 24
	const pct = Math.min(1, Math.max(0, (weeks - min) / (max - min)))
	// Half-circle gauge: -90deg (empty) → +90deg (full).
	const angle = -90 + pct * 180
	return (
		<div className="flex flex-col items-center">
			<div className="relative h-16 w-32 overflow-hidden">
				<div className="border-muted-foreground/20 absolute inset-x-0 top-0 h-32 rounded-full border-8" />
				<div
					className="bg-primary absolute bottom-0 left-1/2 h-14 w-1 origin-bottom -translate-x-1/2 rounded-full"
					style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
				/>
			</div>
			<p className="font-mono text-2xl font-bold tabular-nums">{weeks}</p>
			<p className="text-muted-foreground font-mono text-[10px] uppercase">
				weeks
			</p>
			<input
				type="range"
				min={min}
				max={max}
				value={weeks}
				disabled={locked}
				onChange={(e) => onChange(Number(e.target.value))}
				className="accent-primary mt-2 w-full disabled:opacity-40"
			/>
		</div>
	)
}

// ============================================================
// Variant G — Magic prompt (prompt-to-plan)
// One natural-language field. As you type, the prompt "reads itself": the
// inferred discipline / horizon / experience light up as chips you can still
// override. Mirrors the LLM-in-the-loop idea (ADR 0016); parsing here is a
// throwaway keyword stub, not the real model.
// ============================================================
const PROMPT_EXAMPLES = [
	'Sub-2:00 half marathon in 12 weeks, I run 4× a week',
	'First triathlon — swim, bike and run, total beginner, 16 weeks out',
	'Build my cycling FTP over 8 weeks, fairly advanced',
]

function parsePrompt(text: string): {
	disciplines: CardioDiscipline[]
	experience: ExperienceLevel
	horizonWeeks?: number
} {
	const t = text.toLowerCase()
	const disciplines: CardioDiscipline[] = []
	if (/run|jog|5k|10k|marathon|half|parkrun/.test(t)) disciplines.push('run')
	if (/bike|cycl|ride|ftp|watt|gravel/.test(t)) disciplines.push('bike')
	if (/swim|pool|open ?water|tri(athlon)?/.test(t)) {
		if (!disciplines.includes('swim')) disciplines.push('swim')
		if (/tri(athlon)?/.test(t)) {
			for (const d of ['run', 'bike'] as const)
				if (!disciplines.includes(d)) disciplines.push(d)
		}
	}
	let experience: ExperienceLevel = 'intermediate'
	if (/beginner|new to|first ?(time|timer)?|just start|couch/.test(t))
		experience = 'beginner'
	else if (/advanced|elite|competitive|experienced|seasoned/.test(t))
		experience = 'advanced'
	let horizonWeeks: number | undefined
	const wk = t.match(/(\d+)\s*week/)
	const mo = t.match(/(\d+)\s*month/)
	if (wk) horizonWeeks = clampWeeks(Number(wk[1]))
	else if (mo) horizonWeeks = clampWeeks(Number(mo[1]) * 4)
	return { disciplines, experience, horizonWeeks }
}

function clampWeeks(n: number): number {
	return Math.min(52, Math.max(1, n))
}

export function PlanWizardVariantG({
	targetEvents: _targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState([])
	const gen = useSimulatedGeneration()
	const [touchedHorizon, setTouchedHorizon] = useState(false)

	function onPromptChange(value: string) {
		const parsed = parsePrompt(value)
		w.set('goal', value)
		w.set('disciplines', parsed.disciplines)
		w.set('experience', parsed.experience)
		if (parsed.horizonWeeks && !touchedHorizon)
			w.set('horizonWeeks', parsed.horizonWeeks)
	}

	const detected = parsePrompt(w.inputs.goal)
	const hasText = w.inputs.goal.trim().length > 0

	if (gen.status === 'preview' && gen.preview) {
		return (
			<div className="mx-auto max-w-2xl">
				<div className="mb-5 flex items-center justify-between">
					<h1 className="text-2xl font-semibold tracking-tight">Your plan</h1>
					<ActionBar onRegenerate={gen.start} onDiscard={gen.reset} />
				</div>
				<p className="text-muted-foreground mb-6 text-sm italic">
					“{w.inputs.goal}”
				</p>
				<PreviewBody preview={gen.preview} />
			</div>
		)
	}

	return (
		<div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center">
			<div className="mb-8 text-center">
				<h1 className="text-3xl font-semibold tracking-tight">
					Describe your plan
				</h1>
				<p className="text-muted-foreground mt-1">
					One sentence. We&apos;ll read the rest.
				</p>
			</div>

			<div className="border-input focus-within:border-primary rounded-2xl border-2 p-2 transition">
				<textarea
					autoFocus
					className="min-h-24 w-full resize-none bg-transparent p-3 text-lg outline-none"
					placeholder="e.g. Sub-2:00 half marathon in 12 weeks, I run 4× a week"
					value={w.inputs.goal}
					onChange={(e) => onPromptChange(e.target.value)}
				/>
				<div className="flex items-center justify-between gap-2 px-2 pb-1">
					<button
						type="button"
						onClick={() => {
							const pick =
								PROMPT_EXAMPLES[
									Math.floor(Math.random() * PROMPT_EXAMPLES.length)
								]!
							onPromptChange(pick)
						}}
						className="text-muted-foreground hover:text-foreground text-xs"
					>
						🎲 Surprise me
					</button>
					<Button type="button" onClick={gen.start} disabled={!hasText}>
						{gen.status === 'generating' ? 'Reading…' : 'Generate'}
						<Icon name="arrow-right" size="sm" />
					</Button>
				</div>
			</div>

			{/* Live detection */}
			<div className="mt-5 min-h-[2.5rem]">
				{hasText ? (
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="text-muted-foreground text-xs">We read:</span>
						{detected.disciplines.length > 0 ? (
							detected.disciplines.map((d) => (
								<DetectChip key={d} tint={DISCIPLINE_TINT[d]}>
									{DISCIPLINE_LABELS[d]}
								</DetectChip>
							))
						) : (
							<DetectChip muted>discipline?</DetectChip>
						)}
						<DetectChip>{EXPERIENCE_LABELS[detected.experience]}</DetectChip>
						<DetectChip muted={!detected.horizonWeeks}>
							{detected.horizonWeeks
								? `${detected.horizonWeeks} weeks`
								: 'horizon?'}
						</DetectChip>
						{!touchedHorizon ? (
							<button
								type="button"
								onClick={() => setTouchedHorizon(true)}
								className="text-muted-foreground hover:text-foreground text-xs underline"
							>
								adjust
							</button>
						) : (
							<label className="flex items-center gap-1 text-xs">
								<input
									type="number"
									min={1}
									max={52}
									value={w.inputs.horizonWeeks}
									onChange={(e) =>
										w.set('horizonWeeks', Number(e.target.value))
									}
									className="border-input bg-background w-16 rounded-md border px-2 py-1"
								/>
								weeks
							</label>
						)}
					</div>
				) : (
					<p className="text-muted-foreground/60 text-center text-xs">
						Disciplines, horizon and experience appear here as you type.
					</p>
				)}
			</div>

			{gen.status === 'generating' ? (
				<div className="border-border/60 mt-6 rounded-xl border p-5">
					<GeneratingList progress={gen.progress} />
				</div>
			) : null}
		</div>
	)
}

function DetectChip({
	children,
	tint,
	muted,
}: {
	children: React.ReactNode
	tint?: string
	muted?: boolean
}) {
	return (
		<span
			data-on={!muted}
			className={cn(
				'animate-in fade-in rounded-full border px-3 py-1 text-xs font-medium transition',
				muted
					? 'text-muted-foreground/50 border-dashed'
					: tint
						? tint
						: 'border-primary/40 bg-primary/5 text-primary',
			)}
		>
			{children}
		</span>
	)
}

// ============================================================
// Variant H — Calendar drop
// Generation drops the sessions onto a real month calendar; tactile and
// spatial. Inputs live in a slim toolbar; the calendar is the hero.
// ============================================================
function dayKey(d: Date): string {
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function PlanWizardVariantH({
	targetEvents,
}: {
	targetEvents: TargetEventOption[]
}) {
	const w = useWizardState(targetEvents)
	const gen = useSimulatedGeneration()

	// Build a 6-week grid for the current month (Mon-first).
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const first = new Date(today.getFullYear(), today.getMonth(), 1)
	const offset = (first.getDay() + 6) % 7 // Mon=0
	const gridStart = new Date(first)
	gridStart.setDate(first.getDate() - offset)
	const cells = Array.from({ length: 42 }, (_, i) => {
		const d = new Date(gridStart)
		d.setDate(gridStart.getDate() + i)
		return d
	})

	const byDay = new Map<string, (typeof SAMPLE_PREVIEW.sessions)[number][]>()
	if (gen.preview) {
		for (const s of gen.preview.sessions) {
			const k = dayKey(new Date(s.scheduledAt))
			byDay.set(k, [...(byDay.get(k) ?? []), s])
		}
	}

	const monthLabel = today.toLocaleDateString(undefined, {
		month: 'long',
		year: 'numeric',
	})

	return (
		<div className="mx-auto max-w-4xl">
			<div className="mb-5 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Drop it on the calendar
					</h1>
					<p className="text-muted-foreground text-sm">{monthLabel}</p>
				</div>
				<Link to="/" className="text-muted-foreground text-sm hover:underline">
					Cancel
				</Link>
			</div>

			{/* Toolbar */}
			<div className="border-border/60 mb-5 flex flex-wrap items-center gap-3 rounded-xl border p-3">
				<div className="flex gap-1.5">
					{CARDIO_DISCIPLINES.map((d) => (
						<button
							key={d}
							type="button"
							data-on={w.inputs.disciplines.includes(d)}
							onClick={() => w.toggleDiscipline(d)}
							className={cn(
								'border-input rounded-lg border px-2.5 py-1 text-sm transition',
								DISCIPLINE_TINT[d],
							)}
						>
							{DISCIPLINE_LABELS[d]}
						</button>
					))}
				</div>
				<input
					className="border-input bg-background min-w-40 flex-1 rounded-lg border px-3 py-1.5 text-sm"
					placeholder="e.g. Run a sub-2:00 half marathon"
					value={w.inputs.goal}
					onChange={(e) => w.set('goal', e.target.value)}
				/>
				<Button
					type="button"
					onClick={gen.start}
					disabled={!w.canGenerate || gen.status === 'generating'}
				>
					{gen.status === 'idle'
						? 'Drop sessions'
						: gen.status === 'generating'
							? 'Dropping…'
							: 'Re-drop'}
				</Button>
			</div>

			{/* Calendar */}
			<div className="border-border/60 overflow-hidden rounded-xl border">
				<div className="text-muted-foreground grid grid-cols-7 border-b text-center text-[11px] font-medium tracking-wide uppercase">
					{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
						<div key={d} className="py-2">
							{d}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7">
					{cells.map((d, i) => {
						const inMonth = d.getMonth() === today.getMonth()
						const isToday = dayKey(d) === dayKey(today)
						const sessions = byDay.get(dayKey(d)) ?? []
						return (
							<div
								key={i}
								className={cn(
									'min-h-20 border-r border-b p-1.5 last:border-r-0',
									inMonth ? '' : 'bg-muted/30 text-muted-foreground/50',
								)}
							>
								<div
									className={cn(
										'mb-1 text-xs tabular-nums',
										isToday &&
											'bg-primary text-primary-foreground inline-grid size-5 place-items-center rounded-full font-semibold',
									)}
								>
									{d.getDate()}
								</div>
								<div className="flex flex-col gap-1">
									{sessions.map((s, si) => (
										<div
											key={si}
											className={cn(
												'animate-in fade-in slide-in-from-top-1 truncate rounded-md px-1.5 py-1 text-[11px] font-medium',
												DISCIPLINE_DOT[s.discipline],
											)}
											style={{ animationDelay: `${si * 80}ms` }}
											title={`${s.title} · ${INTENT_LABELS[s.intent]}`}
										>
											{s.title}
										</div>
									))}
								</div>
							</div>
						)
					})}
				</div>
			</div>

			{gen.status === 'generating' ? (
				<p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
					<Icon name="loader-2" size="sm" className="animate-spin" />
					{gen.progress.at(-1) ?? 'Placing sessions…'}
				</p>
			) : null}

			{gen.status === 'preview' && gen.preview ? (
				<div className="mt-5 flex items-center justify-between">
					<p className="text-muted-foreground text-sm">
						{gen.preview.sessions.length} sessions placed ·{' '}
						{gen.preview.outline.phases.length} phases over{' '}
						{gen.preview.outline.phases.reduce((s, p) => s + p.weeks, 0)} weeks.
					</p>
					<ActionBar onRegenerate={gen.start} onDiscard={gen.reset} />
				</div>
			) : null}
		</div>
	)
}

const DISCIPLINE_DOT: Record<CardioDiscipline, string> = {
	run: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
	bike: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
	swim: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
}
