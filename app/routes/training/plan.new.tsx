import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
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
import { type Route } from './+types/plan.new.ts'
import {
	PLAN_ERROR_EVENT,
	PLAN_PREVIEW_EVENT,
	PLAN_PROGRESS_EVENT,
} from './plan.generate.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Generate Training Plan | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return {}
}

type Status = 'idle' | 'generating' | 'preview' | 'error'

export default function PlanWizard() {
	const [disciplines, setDisciplines] = useState<CardioDiscipline[]>(['run'])
	const [experience, setExperience] = useState<ExperienceLevel>('intermediate')
	const [goal, setGoal] = useState('')
	const [horizonWeeks, setHorizonWeeks] = useState(8)

	const [status, setStatus] = useState<Status>('idle')
	const [progress, setProgress] = useState<string[]>([])
	const [preview, setPreview] = useState<PlanPreview | null>(null)
	const [error, setError] = useState<string | null>(null)
	const sourceRef = useRef<EventSource | null>(null)

	useEffect(() => {
		// Tear the stream down if the wizard unmounts mid-generation.
		return () => sourceRef.current?.close()
	}, [])

	function toggleDiscipline(d: CardioDiscipline) {
		setDisciplines((prev) =>
			prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
		)
	}

	function generate() {
		sourceRef.current?.close()
		setStatus('generating')
		setProgress([])
		setPreview(null)
		setError(null)

		const params = new URLSearchParams()
		disciplines.forEach((d) => params.append('discipline', d))
		params.set('experience', experience)
		params.set('goal', goal)
		params.set('horizonWeeks', String(horizonWeeks))

		const source = new EventSource(
			`/training/plan/generate?${params.toString()}`,
		)
		sourceRef.current = source

		source.addEventListener(PLAN_PROGRESS_EVENT, (e) => {
			setProgress((prev) => [...prev, (e as MessageEvent).data])
		})
		source.addEventListener(PLAN_PREVIEW_EVENT, (e) => {
			setPreview(JSON.parse((e as MessageEvent).data) as PlanPreview)
			setStatus('preview')
			source.close()
		})
		source.addEventListener(PLAN_ERROR_EVENT, (e) => {
			setError((e as MessageEvent).data)
			setStatus('error')
			source.close()
		})
		source.onerror = () => {
			// A transport error with no terminal event still ends the run.
			if (sourceRef.current === source) {
				setStatus((s) => (s === 'generating' ? 'error' : s))
				setError((prev) => prev ?? 'The connection was interrupted.')
				source.close()
			}
		}
	}

	function discard() {
		sourceRef.current?.close()
		setStatus('idle')
		setPreview(null)
		setProgress([])
		setError(null)
	}

	const canGenerate = disciplines.length > 0 && goal.trim().length > 0

	return (
		<main className="container mx-auto max-w-3xl py-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-h3">Generate a Training Plan</h1>
				<Link to="/training/upcoming" className="text-body-sm underline">
					Back
				</Link>
			</div>

			{status !== 'preview' ? (
				<Card>
					<CardHeader>
						<CardTitle>Plan inputs</CardTitle>
						<CardDescription>
							Tell the planner what to build. Nothing is saved until you approve
							a preview.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-6">
						<fieldset className="flex flex-col gap-2">
							<span className="text-body-xs text-muted-foreground">
								Disciplines
							</span>
							<div className="flex flex-wrap gap-3">
								{CARDIO_DISCIPLINES.map((d) => (
									<label
										key={d}
										className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm select-none"
									>
										<input
											type="checkbox"
											className="sr-only"
											checked={disciplines.includes(d)}
											onChange={() => toggleDiscipline(d)}
										/>
										{DISCIPLINE_LABELS[d]}
									</label>
								))}
							</div>
						</fieldset>

						<fieldset className="flex flex-col gap-2">
							<span className="text-body-xs text-muted-foreground">
								Experience
							</span>
							<div className="flex flex-wrap gap-3">
								{EXPERIENCE_LEVELS.map((level) => (
									<label
										key={level}
										className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm select-none"
									>
										<input
											type="radio"
											name="experience"
											className="sr-only"
											checked={experience === level}
											onChange={() => setExperience(level)}
										/>
										{EXPERIENCE_LABELS[level]}
									</label>
								))}
							</div>
						</fieldset>

						<label className="flex flex-col gap-2">
							<span className="text-body-xs text-muted-foreground">Goal</span>
							<textarea
								className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
								placeholder="e.g. Run a sub-2:00 half marathon"
								value={goal}
								onChange={(e) => setGoal(e.target.value)}
							/>
						</label>

						<label className="flex flex-col gap-2">
							<span className="text-body-xs text-muted-foreground">
								Horizon (weeks)
							</span>
							<input
								type="number"
								min={1}
								max={52}
								className="border-input bg-background w-24 rounded-md border px-3 py-2 text-sm"
								value={horizonWeeks}
								onChange={(e) => setHorizonWeeks(Number(e.target.value))}
							/>
						</label>

						<div className="flex items-center gap-3">
							<Button
								type="button"
								onClick={generate}
								disabled={!canGenerate || status === 'generating'}
							>
								{status === 'generating' ? 'Generating…' : 'Generate plan'}
							</Button>
						</div>

						{progress.length > 0 ? (
							<ul className="text-body-sm text-muted-foreground flex flex-col gap-1">
								{progress.map((message, i) => (
									<li key={i}>{message}</li>
								))}
							</ul>
						) : null}

						{status === 'error' && error ? (
							<p className="text-destructive text-body-sm" role="alert">
								{error}
							</p>
						) : null}
					</CardContent>
				</Card>
			) : null}

			{status === 'preview' && preview ? (
				<PlanPreviewView
					preview={preview}
					onDiscard={discard}
					onRegenerate={generate}
				/>
			) : null}
		</main>
	)
}

function PlanPreviewView({
	preview,
	onDiscard,
	onRegenerate,
}: {
	preview: PlanPreview
	onDiscard: () => void
	onRegenerate: () => void
}) {
	return (
		<div className="flex flex-col gap-6">
			<Card role="region" aria-labelledby="plan-outline-title">
				<CardHeader>
					<CardTitle id="plan-outline-title">Plan Outline</CardTitle>
					<CardDescription>
						Periodized phases across the full horizon.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{preview.outline.phases.map((phase, i) => (
						<div
							key={i}
							className="flex items-baseline justify-between border-b pb-2 last:border-b-0"
						>
							<div>
								<span className="font-medium">{phase.name}</span>{' '}
								<span className="text-muted-foreground text-body-sm">
									· {phase.weeks} {phase.weeks === 1 ? 'week' : 'weeks'}
								</span>
								<p className="text-muted-foreground text-body-sm">
									{phase.focus}
								</p>
							</div>
							<span className="text-body-sm whitespace-nowrap">
								{phase.weeklyLoadHours} h/wk
							</span>
						</div>
					))}
				</CardContent>
			</Card>

			<Card role="region" aria-labelledby="generated-sessions-title">
				<CardHeader>
					<CardTitle id="generated-sessions-title">
						Generated Sessions
					</CardTitle>
					<CardDescription>Near-term dated sessions.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{preview.sessions.length === 0 ? (
						<p className="text-muted-foreground text-body-sm">
							No sessions could be scheduled. Set your trainable days in your
							athlete profile.
						</p>
					) : (
						preview.sessions.map((session, i) => (
							<div key={i} className="rounded-md border p-4">
								<div className="flex items-baseline justify-between">
									<h3 className="font-medium">{session.title}</h3>
									<time className="text-muted-foreground text-body-sm">
										{formatSessionDate(session.scheduledAt)}
									</time>
								</div>
								<p className="text-muted-foreground text-body-sm">
									{DISCIPLINE_LABELS[session.discipline]} ·{' '}
									{INTENT_LABELS[session.intent]}
								</p>
								<div className="mt-3 flex flex-col gap-2">
									{session.blocks.map((block, bi) => (
										<div key={bi} className="text-body-sm">
											{block.repeatCount > 1 ? (
												<span className="text-muted-foreground">
													{block.repeatCount}×{' '}
												</span>
											) : null}
											<ul className="ml-4 list-disc">
												{block.steps.map((step, si) => (
													<li key={si}>{describeStep(step)}</li>
												))}
											</ul>
										</div>
									))}
								</div>
							</div>
						))
					)}
				</CardContent>
			</Card>

			<div className="flex items-center gap-3">
				<Button type="button" onClick={onRegenerate}>
					Regenerate
				</Button>
				<Button type="button" variant="outline" onClick={onDiscard}>
					Discard
				</Button>
			</div>
		</div>
	)
}

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
	if (r.hrMin != null) return formatRange(r.hrMin, r.hrMax, 'bpm')
	if (r.powerMin != null) return formatRange(r.powerMin, r.powerMax, 'W')
	if (r.paceMin != null) return formatRange(r.paceMin, r.paceMax, 's/km')
	return ''
}

function formatRange(
	min: number,
	max: number | undefined,
	unit: string,
): string {
	return max != null ? `${min}–${max} ${unit}` : `${min} ${unit}`
}

function formatSessionDate(value: Date | string): string {
	const date = typeof value === 'string' ? new Date(value) : value
	return date.toLocaleString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
