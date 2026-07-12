import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { data, Form, Link, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field, SelectField } from '#app/components/forms.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDistance, formatDuration } from '#app/utils/format.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	DISCIPLINES,
	WORKOUT_INTENTS,
	INTENT_LABELS,
	WorkoutAuthoringSchema,
} from '#app/utils/workout-schema.ts'
import {
	getWorkoutSessionForEdit,
	updateWorkoutSession,
	getExerciseCatalog,
	getRecentExerciseIds,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/upcoming.$sessionId.edit.ts'
import { WorkoutStructureEditor } from './__workout-editor.tsx'
import { buildBlocksInput, FormSchema } from './__workout-step-fields.tsx'

export const meta: Route.MetaFunction = ({ data }) => [
	{
		title: data?.session
			? `Edit ${data.session.workout?.title ?? 'Session'} | Trainm8`
			: 'Edit Workout Session | Trainm8',
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const [session, exercises, recentExerciseIds, athleteProfile] =
		await Promise.all([
			getWorkoutSessionForEdit(userId, params.sessionId),
			getExerciseCatalog(userId),
			getRecentExerciseIds(userId),
			getOrCreateAthleteProfile(userId),
		])
	invariantResponse(session, 'Workout session not found', { status: 404 })

	return {
		session,
		exercises,
		recentExerciseIds,
		disciplineProfiles: athleteProfile.disciplineProfiles,
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: FormSchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const { title, discipline, intent, scheduledAtDate, scheduledAtTime } =
		submission.value

	const scheduledAt = new Date(`${scheduledAtDate}T${scheduledAtTime}:00.000Z`)

	if (isNaN(scheduledAt.getTime())) {
		return data(
			{
				result: submission.reply({
					fieldErrors: {
						scheduledAtDate: ['Invalid date and time combination'],
					},
				}),
			},
			{ status: 400 },
		)
	}

	const authoringInput = WorkoutAuthoringSchema.safeParse({
		title,
		discipline,
		intent,
		scheduledAt: scheduledAt.toISOString(),
		blocks: buildBlocksInput(submission.value),
	})

	if (!authoringInput.success) {
		const fieldErrors: Record<string, string[]> = {}
		for (const issue of authoringInput.error.issues) {
			const path = issue.path.join('.')
			if (!fieldErrors[path]) fieldErrors[path] = []
			fieldErrors[path]!.push(issue.message)
		}
		return data({ result: submission.reply({ fieldErrors }) }, { status: 400 })
	}

	const updated = await updateWorkoutSession(
		userId,
		params.sessionId,
		authoringInput.data,
	)
	invariantResponse(updated, 'Workout session not found', { status: 404 })

	throw redirect(`/training/sessions/${params.sessionId}`)
}

type SessionForEdit = NonNullable<
	Awaited<ReturnType<typeof getWorkoutSessionForEdit>>
>

function sessionToFormDefaults(session: SessionForEdit) {
	const scheduledAt = new Date(session.scheduledAt)
	const workout = session.workout
	if (!workout) {
		return {
			title: '',
			discipline: 'run' as const,
			intent: 'endurance' as const,
			scheduledAtDate: scheduledAt.toISOString().slice(0, 10),
			scheduledAtTime: scheduledAt.toISOString().slice(11, 16),
			blocks: [],
		}
	}
	return {
		title: workout.title,
		discipline: workout.discipline,
		intent: workout.intent,
		scheduledAtDate: scheduledAt.toISOString().slice(0, 10),
		scheduledAtTime: scheduledAt.toISOString().slice(11, 16),
		blocks: workout.blocks.map((block) => ({
			name: block.name ?? '',
			repeatCount: String(block.repeatCount),
			steps: block.steps.map((step) => ({
				kind: step.kind,
				discipline: step.discipline ?? '',
				intensity: step.intensity ?? '',
				// Canonical seconds/metres render as the humane strings the form
				// parses back through the shared format layer (ADR 0023).
				duration:
					step.durationSec != null ? formatDuration(step.durationSec) : '',
				distance: step.distanceM != null ? formatDistance(step.distanceM) : '',
				exerciseId: step.exerciseId ?? '',
				restBetweenSetsSec:
					step.restBetweenSetsSec != null
						? String(step.restBetweenSetsSec)
						: '',
				notes: step.notes ?? '',
				sets: step.sets.map((set) => ({
					kind: set.kind,
					orderIndex: String(set.orderIndex),
					reps: set.reps != null ? String(set.reps) : '',
					durationSec: set.durationSec != null ? String(set.durationSec) : '',
					weightKg: set.weightKg != null ? String(set.weightKg) : '',
					pct1RM: set.pct1RM != null ? String(set.pct1RM) : '',
				})),
			})),
		})),
	}
}

export default function EditSessionRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { session, exercises, recentExerciseIds, disciplineProfiles } =
		loaderData

	const [form, fields] = useForm({
		id: 'edit-session',
		constraint: getZodConstraint(FormSchema),
		lastResult: actionData?.result,
		defaultValue: sessionToFormDefaults(session),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	const cancelHref = `/training/sessions/${session.id}`

	return (
		<main className="container mx-auto max-w-2xl py-8">
			<div className="mb-6">
				<Link
					to={cancelHref}
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Cancel
				</Link>
			</div>

			{session.status === 'completed' ? (
				<div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
					This Workout Session is marked completed
				</div>
			) : null}

			{session.source === 'generated' ? (
				<div className="mb-4 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
					This is a generated session. Saving your edits adopts it — it becomes
					yours and will be kept when you regenerate this plan, rather than
					replaced.
				</div>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Edit Workout Session</CardTitle>
				</CardHeader>
				<CardContent>
					<Form method="POST" {...getFormProps(form)}>
						{/* Editing keeps the full structured editor — a stored session
						    already has real Block/Step structure to preserve. */}
						<input type="hidden" name="structure" value="structured" />
						<div className="space-y-6">
							<Field
								labelProps={{ children: 'Title' }}
								inputProps={{
									...getInputProps(fields.title, { type: 'text' }),
									placeholder: 'e.g. Tuesday Tempo Run',
									autoFocus: true,
								}}
								errors={fields.title.errors as string[] | undefined}
							/>

							<SelectField
								meta={fields.discipline}
								labelProps={{
									children: 'Discipline',
									className: 'text-body-xs text-muted-foreground font-medium',
								}}
								items={DISCIPLINES.map((type) => ({
									value: type,
									label: getDisciplineLabel(type),
								}))}
								errors={fields.discipline.errors as string[] | undefined}
							/>

							<SelectField
								meta={fields.intent}
								labelProps={{
									children: 'Intent',
									className: 'text-body-xs text-muted-foreground font-medium',
								}}
								items={WORKOUT_INTENTS.map((value) => ({
									value,
									label: INTENT_LABELS[value],
								}))}
								errors={fields.intent.errors as string[] | undefined}
							/>

							<div className="grid grid-cols-2 gap-4">
								<Field
									labelProps={{ children: 'Date' }}
									inputProps={{
										...getInputProps(fields.scheduledAtDate, { type: 'date' }),
									}}
									errors={fields.scheduledAtDate.errors as string[] | undefined}
								/>
								<Field
									labelProps={{ children: 'Time' }}
									inputProps={{
										...getInputProps(fields.scheduledAtTime, { type: 'time' }),
									}}
									errors={fields.scheduledAtTime.errors as string[] | undefined}
								/>
							</div>

							<WorkoutStructureEditor
								form={form}
								blocksField={fields.blocks}
								workoutDiscipline={fields.discipline.value ?? 'run'}
								disciplineMeta={fields.discipline}
								serverErrors={actionData?.result?.error}
								exercises={exercises}
								recentExerciseIds={recentExerciseIds}
								disciplineProfiles={disciplineProfiles}
							/>

							{/* Form-level server errors render through the editor's §10
							    validation summary — one error system on the card. */}

							<div className="flex gap-3">
								<Button type="submit">Save Changes</Button>
								<Link
									to={cancelHref}
									className={buttonVariants({ variant: 'ghost' })}
								>
									Cancel
								</Link>
							</div>
						</div>
					</Form>
				</CardContent>
			</Card>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
