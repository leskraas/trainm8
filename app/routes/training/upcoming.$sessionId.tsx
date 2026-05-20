import { invariantResponse } from '@epic-web/invariant'
import { getFormProps, getTextareaProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect, useActionData } from 'react-router'
import { z } from 'zod'
import { ErrorList, TextareaField } from '#app/components/forms.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import {
	formatDuration,
	formatDistance,
} from '#app/utils/workout-formatting.ts'
import { upsertSessionLog } from '#app/utils/session-log.server.ts'
import {
	type SessionDetail,
	getSessionByIdForUser,
} from '#app/utils/training.server.ts'
import {
	INTENT_LABELS,
	IntensityTargetSchema,
	type WorkoutIntent,
} from '#app/utils/workout-schema.ts'
import { deleteWorkoutSession } from '#app/utils/workout.server.ts'
import { getStatusLabel, getStatusVariant } from '#app/utils/training.ts'
import { type Route } from './+types/upcoming.$sessionId.ts'

const SessionLogSchema = z.object({
	content: z.string().min(1, 'Reflection is required'),
	rpe: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : null))
		.pipe(
			z
				.number()
				.int('RPE must be a whole number')
				.min(1, 'RPE must be between 1 and 10')
				.max(10, 'RPE must be between 1 and 10')
				.nullable(),
		),
})

export const meta: Route.MetaFunction = ({ data }) => [
	{
		title: data?.session
			? `${data.session.workout?.title ?? 'Recording'} | Workout Details | Trainm8`
			: 'Workout Details | Trainm8',
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, 'Workout session not found', { status: 404 })

	return { session }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const deleted = await deleteWorkoutSession(userId, params.sessionId)
		invariantResponse(deleted, 'Workout session not found', { status: 404 })
		return redirect('/training/upcoming')
	}

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, 'Workout session not found', { status: 404 })

	const submission = parseWithZod(formData, { schema: SessionLogSchema })

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { content, rpe } = submission.value
	await upsertSessionLog({ sessionId: params.sessionId, content, rpe })

	return { result: submission.reply() }
}

export default function UpcomingSessionDetailRoute({
	loaderData,
}: Route.ComponentProps) {
	const { session } = loaderData
	const presenter = useSessionPresenter()

	return (
		<main className="container py-10">
			<div className="mb-6 flex items-center justify-between gap-3">
				<Link
					to="/training/upcoming"
					prefetch="intent"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Back to upcoming workouts
				</Link>
				<div className="flex gap-2">
					<Link
						to={`/training/upcoming/${session.id}/edit`}
						prefetch="intent"
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						Edit session
					</Link>
					<Form method="POST">
						<input type="hidden" name="intent" value="delete" />
						<Button
							type="submit"
							variant="destructive"
							size="sm"
							onClick={(e) => {
								if (
									!window.confirm(
										'Delete this workout session? This cannot be undone.',
									)
								) {
									e.preventDefault()
								}
							}}
						>
							Delete session
						</Button>
					</Form>
				</div>
			</div>

			<Card className="bg-muted">
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<CardTitle>{session.workout?.title ?? 'Recording'}</CardTitle>
						<CardDescription className="capitalize">
							{session.workout?.discipline ?? session.recording?.discipline}
						</CardDescription>
						<div className="flex items-center gap-2">
							<p className="text-body-sm text-muted-foreground">
								{presenter.presentSession(session).timeOfDay}
							</p>
							{session.workout ? (
								<span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
									{INTENT_LABELS[session.workout.intent as WorkoutIntent]}
								</span>
							) : (
								<span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium tracking-wide uppercase">
									recorded
								</span>
							)}
						</div>
					</div>
					<Badge variant={getStatusVariant(session.status)}>
						{getStatusLabel(session.status)}
					</Badge>
				</CardHeader>

				<CardContent className="space-y-4">
					{session.workout?.description ? (
						<p className="text-body-sm">{session.workout.description}</p>
					) : null}

					{session.workout ? (
						<div className="space-y-3">
							<h2 className="text-h5">Workout structure</h2>
							<ul className="space-y-3">
								{session.workout.blocks.map((block) => {
									const blockLabel =
										block.name ?? `Block ${block.orderIndex + 1}`
									return (
										<li key={block.id} className="rounded-md border p-3">
											<p className="text-body-sm font-semibold">
												{block.repeatCount > 1
													? `${block.repeatCount} × ${blockLabel}`
													: blockLabel}
											</p>
											<ul className="mt-2 space-y-1 pl-4">
												{block.steps.map((step) => (
													<li
														key={step.id}
														className="text-body-sm text-muted-foreground"
													>
														<StepDisplay step={step} />
													</li>
												))}
											</ul>
										</li>
									)
								})}
							</ul>
						</div>
					) : null}
				</CardContent>
			</Card>

			<SessionLogSection sessionLog={session.sessionLog} />
		</main>
	)
}

type Step = NonNullable<
	SessionDetail['workout']
>['blocks'][number]['steps'][number]

function StepDisplay({ step }: { step: Step }) {
	if (step.kind === 'strength') {
		const exerciseName = step.exercise?.name ?? 'Unknown exercise'
		return (
			<div className="space-y-1">
				<span className="font-medium">{exerciseName}</span>
				{step.sets.length > 0 ? (
					<ul className="space-y-0.5 pl-4">
						{step.sets.map((set, i) => {
							const parts: string[] = [`Set ${i + 1}:`]
							if (set.kind === 'reps') {
								parts.push(`${set.reps} reps`)
							} else if (set.kind === 'timed' && set.durationSec != null) {
								parts.push(formatDuration(set.durationSec))
							} else if (set.kind === 'amrap') {
								parts.push('AMRAP')
							}
							if (set.weightKg != null) parts.push(`@ ${set.weightKg} kg`)
							if (set.pct1RM != null) parts.push(`@ ${set.pct1RM}% 1RM`)
							return (
								<li key={set.id} className="text-xs">
									{parts.join(' ')}
								</li>
							)
						})}
					</ul>
				) : null}
				{step.restBetweenSetsSec != null ? (
					<p className="text-xs">
						{formatDuration(step.restBetweenSetsSec)} rest between sets
					</p>
				) : null}
				{step.notes ? <p className="text-xs italic">{step.notes}</p> : null}
			</div>
		)
	}

	if (step.kind === 'rest') {
		const parts: string[] = ['Rest']
		if (step.durationSec != null) parts.push(formatDuration(step.durationSec))
		if (step.notes) parts.push(`— ${step.notes}`)
		return <span>{parts.join(' ')}</span>
	}

	// cardio
	const parts: string[] = []
	if (step.durationSec != null) parts.push(formatDuration(step.durationSec))
	if (step.distanceM != null) parts.push(formatDistance(step.distanceM))
	if (step.notes) parts.push(step.notes)

	let authoredLabel: string | null = null
	let resolvedLabel: string | null = null

	if (step.intensity) {
		try {
			const parsed = IntensityTargetSchema.safeParse(JSON.parse(step.intensity))
			if (parsed.success) {
				const t = parsed.data
				switch (t.kind) {
					case 'zoneLabel':
						authoredLabel = t.label
						break
					case 'rpe':
						authoredLabel =
							t.max != null ? `RPE ${t.min}–${t.max}` : `RPE ${t.min}`
						break
					case 'hrBpm':
						authoredLabel =
							t.max != null ? `${t.min}–${t.max} bpm` : `${t.min}+ bpm`
						break
					case 'hrPct':
						authoredLabel =
							t.maxPct != null
								? `${t.minPct}–${t.maxPct}% ${t.ref === 'max' ? 'MaxHR' : 'LTHR'}`
								: `${t.minPct}%+ ${t.ref === 'max' ? 'MaxHR' : 'LTHR'}`
						break
					case 'power':
						authoredLabel =
							t.maxW != null ? `${t.minW}–${t.maxW} W` : `${t.minW}+ W`
						break
					case 'powerPct':
						authoredLabel =
							t.maxPct != null
								? `${t.minPct}–${t.maxPct}% FTP`
								: `${t.minPct}%+ FTP`
						break
					case 'pace': {
						const fmt = (s: number) =>
							`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
						authoredLabel =
							t.maxSecPerKm != null
								? `${fmt(t.minSecPerKm)}–${fmt(t.maxSecPerKm)} /km`
								: `${fmt(t.minSecPerKm)}+ /km`
						break
					}
				}
			}
		} catch {
			// malformed JSON — skip
		}
	}

	const resolvedParts: string[] = []
	if (step.intensityHrMin != null) {
		resolvedParts.push(
			step.intensityHrMax != null
				? `${step.intensityHrMin}–${step.intensityHrMax} bpm`
				: `${step.intensityHrMin}+ bpm`,
		)
	}
	if (step.intensityPowerMin != null) {
		resolvedParts.push(
			step.intensityPowerMax != null
				? `${step.intensityPowerMin}–${step.intensityPowerMax} W`
				: `${step.intensityPowerMin}+ W`,
		)
	}
	if (step.intensityPaceMin != null) {
		const fmt = (s: number) =>
			`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
		resolvedParts.push(
			step.intensityPaceMax != null
				? `${fmt(step.intensityPaceMin)}–${fmt(step.intensityPaceMax)} /km`
				: `${fmt(step.intensityPaceMin)}+ /km`,
		)
	}
	if (resolvedParts.length > 0) resolvedLabel = resolvedParts.join(' · ')

	return (
		<span>
			{parts.join(' ') || null}
			{authoredLabel ? (
				<>
					{parts.length > 0 ? ' — ' : ''}
					<span className="font-medium">{authoredLabel}</span>
					{resolvedLabel ? (
						<span className="text-muted-foreground ml-1 text-xs">
							({resolvedLabel})
						</span>
					) : null}
				</>
			) : null}
			{!parts.length && !authoredLabel ? '—' : null}
		</span>
	)
}

function SessionLogSection({
	sessionLog,
}: {
	sessionLog: SessionDetail['sessionLog']
}) {
	const actionData = useActionData<typeof action>()

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Session Log</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{sessionLog ? <SessionLogDisplay sessionLog={sessionLog} /> : null}
				<SessionLogForm
					defaultContent={sessionLog?.content}
					defaultRpe={sessionLog?.rpe}
					actionData={actionData}
				/>
			</CardContent>
		</Card>
	)
}

function SessionLogDisplay({
	sessionLog,
}: {
	sessionLog: NonNullable<SessionDetail['sessionLog']>
}) {
	return (
		<div className="bg-muted rounded-lg p-4">
			<p className="text-body-sm whitespace-pre-wrap">{sessionLog.content}</p>
			{sessionLog.rpe != null ? (
				<p className="text-muted-foreground mt-2 text-sm">
					RPE: {sessionLog.rpe}/10
				</p>
			) : null}
		</div>
	)
}

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function SessionLogForm({
	defaultContent,
	defaultRpe,
	actionData,
}: {
	defaultContent?: string
	defaultRpe?: number | null
	actionData?: { result: Parameters<typeof useForm>[0]['lastResult'] }
}) {
	const [form, fields] = useForm({
		id: 'session-log',
		constraint: getZodConstraint(SessionLogSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SessionLogSchema })
		},
		defaultValue: {
			content: defaultContent ?? '',
			rpe: defaultRpe?.toString() ?? '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Form method="POST" {...getFormProps(form)}>
			<fieldset className="space-y-4">
				<legend className="text-body-sm font-semibold">
					{defaultContent ? 'Update your reflection' : 'Log your reflection'}
				</legend>

				<TextareaField
					labelProps={{ children: 'Reflection' }}
					textareaProps={{
						...getTextareaProps(fields.content),
						placeholder: 'How did the session go?',
					}}
					errors={fields.content.errors as string[] | undefined}
				/>

				<div className="space-y-2">
					<label className="text-body-xs text-muted-foreground font-medium">
						RPE (Rate of Perceived Exertion)
					</label>
					<div
						className="flex flex-wrap gap-1.5"
						role="group"
						aria-label="RPE selector"
					>
						{RPE_VALUES.map((value) => (
							<Button
								key={value}
								type="button"
								variant={
									fields.rpe.value === String(value) ? 'default' : 'outline'
								}
								size="sm"
								className={cn(
									'h-9 w-9 p-0',
									fields.rpe.value === String(value) && 'ring-ring/30 ring-2',
								)}
								onClick={() => {
									const input = document.querySelector<HTMLInputElement>(
										`input[name="${fields.rpe.name}"]`,
									)
									if (input) {
										const newValue =
											input.value === String(value) ? '' : String(value)
										input.value = newValue
										input.dispatchEvent(new Event('input', { bubbles: true }))
										input.dispatchEvent(new Event('change', { bubbles: true }))
									}
								}}
								aria-pressed={fields.rpe.value === String(value)}
							>
								{value}
							</Button>
						))}
					</div>
					<input
						type="hidden"
						name={fields.rpe.name}
						value={fields.rpe.value ?? ''}
					/>
					<ErrorList errors={fields.rpe.errors as string[] | undefined} />
				</div>

				<StatusButton
					type="submit"
					status={form.status === 'error' ? 'error' : 'idle'}
				>
					{defaultContent ? 'Update Session Log' : 'Save Session Log'}
				</StatusButton>
				<ErrorList errors={form.errors as string[] | undefined} />
			</fieldset>
		</Form>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
