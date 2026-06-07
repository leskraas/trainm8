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
export function PlanWizardPrototype({
	variant,
	targetEvents,
}: {
	variant: PlanProtoVariant
	targetEvents: TargetEventOption[]
}) {
	return (
		<main className="container mx-auto py-8">
			{variant === 'A' ? (
				<PlanWizardVariantA targetEvents={targetEvents} />
			) : variant === 'B' ? (
				<PlanWizardVariantB targetEvents={targetEvents} />
			) : (
				<PlanWizardVariantC targetEvents={targetEvents} />
			)}
		</main>
	)
}
