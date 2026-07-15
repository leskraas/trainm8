import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field, SelectField } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { buildBlocksInput, FormSchema } from '#app/utils/workout-authoring.ts'
import {
	DISCIPLINES,
	WORKOUT_INTENTS,
	INTENT_LABELS,
	WorkoutAuthoringSchema,
} from '#app/utils/workout-schema.ts'
import {
	createWorkoutSession,
	getExerciseCatalog,
	getRecentExerciseIds,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/sessions.new.ts'
import { WorkoutStructureEditor } from './__workout-editor.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'New Workout Session | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const now = new Date()
	const next = new Date(now)
	next.setMinutes(0, 0, 0)
	next.setHours(next.getHours() + 1)
	const [exercises, recentExerciseIds, athleteProfile] = await Promise.all([
		getExerciseCatalog(userId),
		getRecentExerciseIds(userId),
		getOrCreateAthleteProfile(userId),
	])
	return {
		defaultDate: next.toISOString().slice(0, 10),
		defaultTime: next.toISOString().slice(11, 16),
		exercises,
		recentExerciseIds,
		disciplineProfiles: athleteProfile.disciplineProfiles,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
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

	const session = await createWorkoutSession(userId, authoringInput.data)
	throw redirect(`/training/sessions/${session.id}`)
}

export default function NewSessionRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const {
		defaultDate,
		defaultTime,
		exercises,
		recentExerciseIds,
		disciplineProfiles,
	} = loaderData

	// A new session is honestly empty (workout-editor spec §11): zero blocks,
	// nothing fabricated the athlete didn't choose. The editor renders the
	// empty composition — three archetype seeds + start-from-scratch — until
	// the first step materializes. The Zod schema still accepts the legacy
	// simple shape, but the UI never produces it.
	const [form, fields] = useForm({
		id: 'new-session',
		constraint: getZodConstraint(FormSchema),
		lastResult: actionData?.result,
		defaultValue: {
			title: '',
			discipline: 'run',
			intent: 'endurance',
			scheduledAtDate: defaultDate,
			scheduledAtTime: defaultTime,
			blocks: [],
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="New Workout Session"
				back={{ to: '/', label: 'Home' }}
				className="mb-6"
			/>

			<Card>
				<CardContent>
					<Form method="POST" {...getFormProps(form)}>
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

							{/* The UI always submits structured blocks — the simple shape
							    stays in the schema only for compatibility (ADR 0027 §6). */}
							<input
								type="hidden"
								name={fields.structure.name}
								value="structured"
							/>

							<WorkoutStructureEditor
								form={form}
								blocksField={fields.blocks}
								workoutDiscipline={fields.discipline.value ?? 'run'}
								disciplineMeta={fields.discipline}
								exercises={exercises}
								recentExerciseIds={recentExerciseIds}
								disciplineProfiles={disciplineProfiles}
								serverErrors={actionData?.result?.error}
							/>

							{/* Form-level server errors render through the editor's §10
							    validation summary — one error system on the card. */}

							{/* One action row; dismissal lives in the header's back
							    button (#279, #282). */}
							<div className="flex">
								<Button type="submit" className="w-full sm:w-auto">
									Create Session
								</Button>
							</div>
						</div>
					</Form>
				</CardContent>
			</Card>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
