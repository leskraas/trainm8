import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { data, Form, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field, SelectField } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { DEFAULT_TRAINING_TIME } from '#app/utils/athlete-schema.ts'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	APP_TAB_LABELS,
	NB_INTENT_LABELS,
	NEW_SESSION_LABELS,
	WORKOUT_DETAIL_LABELS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { readMostTrainedDiscipline } from '#app/utils/most-trained-discipline.server.ts'
import { buildBlocksInput, FormSchema } from '#app/utils/workout-authoring.ts'
import {
	DISCIPLINES,
	WORKOUT_INTENTS,
	WorkoutAuthoringSchema,
} from '#app/utils/workout-schema.ts'
import {
	createWorkoutSession,
	getExerciseCatalog,
	getRecentExerciseIds,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/sessions.new.ts'
import { WorkoutStructureEditor } from './__workout-editor.tsx'

const L = NEW_SESSION_LABELS

/**
 * The full editor page, in Norwegian on the design system (#505 round 2). It
 * is the no-JS and deep-link way in — the composer's full snap point is the
 * quick one (owner decision 1) — and the page a strength day's "Mer" opens.
 * The route and its query (`?date=`, `?discipline=`) stay as they are: the
 * composer and I dag link here.
 */
export const meta: Route.MetaFunction = () => [{ title: L.metaTitle }]

/** `YYYY-MM-DD`, and nothing else — a malformed `?date` is ignored rather than
 * coerced into whatever `new Date` makes of it. */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const params = new URL(request.url).searchParams
	const now = new Date()

	const [exercises, recentExerciseIds, athleteProfile, mostTrained] =
		await Promise.all([
			getExerciseCatalog(userId),
			getRecentExerciseIds(userId),
			getOrCreateAthleteProfile(userId),
			// Derived from the athlete's own history, never defaulted — and `null`
			// where there is no history, so the select opens unset and the athlete
			// is *asked* (ADR 0065 §5). The route used to open on a hardcoded
			// `run` for everybody, including swimmers.
			readMostTrainedDiscipline(userId, now),
		])

	const trainingTime =
		athleteProfile.defaultTrainingTime ?? DEFAULT_TRAINING_TIME

	/**
	 * **The day the caller named** (ADR 0065's consequence: "the authoring route
	 * must accept a date"). The home grid's **More** escape hands the cell's own
	 * day over so the route opens on the day the athlete tapped, rather than on
	 * whatever "in an hour" happens to be — which silently moved a Thursday cell
	 * to today. A named day takes the athlete's **Default Training Time**, the
	 * same time of day the Day Stamp writes at, so the two ways in agree.
	 */
	const namedDate = params.get('date')
	const requestedDate = namedDate && DATE_KEY.test(namedDate) ? namedDate : null

	// Unnamed, the route keeps exactly the behaviour it had: the next whole
	// hour, read off the UTC clock the action's own `date + T + time + Z`
	// parse reads it back with. That pair is UTC-naive at both ends and is
	// left that way here — see the note on `defaultTime` below.
	const next = new Date(now)
	next.setMinutes(0, 0, 0)
	next.setHours(next.getHours() + 1)

	const requestedDiscipline = params.get('discipline')
	const defaultDiscipline =
		requestedDiscipline &&
		(DISCIPLINES as readonly string[]).includes(requestedDiscipline)
			? (requestedDiscipline as (typeof DISCIPLINES)[number])
			: mostTrained

	return {
		defaultDate: requestedDate ?? next.toISOString().slice(0, 10),
		// A named day opens at the athlete's **Default Training Time** — the same
		// time of day the Day Stamp writes at, so arriving here through the grid's
		// **More** escape and arriving here through the stamp agree about when the
		// session is. (The action still reads the submitted pair as UTC, as it
		// always has; that is not this ticket's to change.)
		defaultTime: requestedDate
			? trainingTime
			: next.toISOString().slice(11, 16),
		/** The prefilled Discipline, or `null` — the athlete picks. */
		defaultDiscipline,
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
						scheduledAtDate: [WORKOUT_DETAIL_LABELS.errors.badDateTime],
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
		defaultDiscipline,
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
			// Derived from the athlete's own history and shown before it commits,
			// or left unset so they are asked (ADR 0065 §5). Never `run` for
			// everybody, which is what this was.
			discipline: defaultDiscipline ?? '',
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
				title={L.title}
				back={{ to: '/', label: APP_TAB_LABELS.today }}
				className="mb-6"
			/>

			<Card>
				<CardContent>
					<Form method="POST" {...getFormProps(form)}>
						<div className="space-y-6">
							<Field
								labelProps={{ children: L.name }}
								inputProps={{
									...getInputProps(fields.title, { type: 'text' }),
									placeholder: L.namePlaceholder,
									autoFocus: true,
									enterKeyHint: 'next',
								}}
								errors={fields.title.errors as string[] | undefined}
							/>

							<SelectField
								meta={fields.discipline}
								labelProps={{ children: L.sport }}
								items={DISCIPLINES.map((type) => ({
									value: type,
									label: nbDisciplineLabel(type),
								}))}
								// Shown when nothing is prefilled, which is what an athlete
								// with no history to derive one from gets (ADR 0065 §5).
								placeholder={L.sportPlaceholder}
								errors={fields.discipline.errors as string[] | undefined}
							/>

							<SelectField
								meta={fields.intent}
								labelProps={{ children: L.intent }}
								items={WORKOUT_INTENTS.map((value) => ({
									value,
									label: NB_INTENT_LABELS[value],
								}))}
								errors={fields.intent.errors as string[] | undefined}
							/>

							<div className="grid grid-cols-2 gap-4">
								<Field
									labelProps={{ children: L.date }}
									inputProps={{
										...getInputProps(fields.scheduledAtDate, { type: 'date' }),
									}}
									errors={fields.scheduledAtDate.errors as string[] | undefined}
								/>
								<Field
									labelProps={{ children: L.time }}
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
								workoutDiscipline={fields.discipline.value ?? ''}
								disciplineMeta={fields.discipline}
								exercises={exercises}
								recentExerciseIds={recentExerciseIds}
								disciplineProfiles={disciplineProfiles}
								serverErrors={actionData?.result?.error}
							/>

							{/* Form-level server errors render through the editor's §10
							    validation summary — one error system on the card. */}

							{/* One action row; dismissal lives in the header's back
							    button (#279, #282). It sits clear of the fixed tab bar
							    at 390px: the page pads its foot for the bar. */}
							<div className="flex">
								<Button type="submit" className="w-full sm:w-auto">
									{L.create}
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
