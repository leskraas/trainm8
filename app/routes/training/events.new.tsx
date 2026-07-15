import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	ErrorList,
	Field,
	SelectField,
	TextareaField,
} from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	buildEventAuthoringInput,
	EVENT_KIND_LABELS,
	EVENT_KINDS,
	EVENT_PRIORITIES,
	EVENT_PRIORITY_LABELS,
	EventAuthoringSchema,
	EventFormSchema,
	TARGET_KINDS,
} from '#app/utils/event-schema.ts'
import { createEvent } from '#app/utils/event.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/events.new.ts'

export const meta: Route.MetaFunction = () => [{ title: 'New Event | Trainm8' }]

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	const today = new Date().toISOString().slice(0, 10)
	return { defaultDate: today }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, { schema: EventFormSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const rawDisciplines = formData.getAll('disciplines') as string[]
	const authoringInput = EventAuthoringSchema.safeParse(
		buildEventAuthoringInput(submission.value, rawDisciplines),
	)

	if (!authoringInput.success) {
		const fieldErrors: Record<string, string[]> = {}
		for (const issue of authoringInput.error.issues) {
			const path = issue.path.join('.')
			if (!fieldErrors[path]) fieldErrors[path] = []
			fieldErrors[path]!.push(issue.message)
		}
		return data({ result: submission.reply({ fieldErrors }) }, { status: 400 })
	}

	const event = await createEvent(userId, authoringInput.data)
	throw redirect(`/training/events/${event.id}`)
}

export default function NewEventRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { defaultDate } = loaderData

	const [form, fields] = useForm({
		id: 'new-event',
		constraint: getZodConstraint(EventFormSchema),
		lastResult: actionData?.result,
		defaultValue: {
			name: '',
			kind: 'race',
			priority: 'A',
			startDate: defaultDate,
			endDate: '',
			location: '',
			notes: '',
			targetKind: '',
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EventFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	const targetKind = fields.targetKind.value

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="New Event"
				back={{ to: '/training/events', label: 'Events' }}
				className="mb-6"
			/>

			<Form method="POST" {...getFormProps(form)}>
				<div className="space-y-4">
					<Field
						labelProps={{ children: 'Name' }}
						inputProps={{
							...getInputProps(fields.name, { type: 'text' }),
							placeholder: 'e.g. Trondheim Marathon',
							autoFocus: true,
						}}
						errors={fields.name.errors as string[] | undefined}
					/>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<SelectField
							meta={fields.kind}
							labelProps={{
								children: 'Kind',
								className: 'text-sm font-medium',
							}}
							items={EVENT_KINDS.map((k) => ({
								value: k,
								label: EVENT_KIND_LABELS[k],
							}))}
							errors={fields.kind.errors as string[] | undefined}
						/>
						<SelectField
							meta={fields.priority}
							labelProps={{
								children: 'Priority',
								className: 'text-sm font-medium',
							}}
							items={EVENT_PRIORITIES.map((p) => ({
								value: p,
								label: EVENT_PRIORITY_LABELS[p],
							}))}
							errors={fields.priority.errors as string[] | undefined}
						/>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field
							labelProps={{ children: 'Start date' }}
							inputProps={{
								...getInputProps(fields.startDate, { type: 'date' }),
							}}
							errors={fields.startDate.errors as string[] | undefined}
						/>
						<Field
							labelProps={{ children: 'End date (optional)' }}
							inputProps={{
								...getInputProps(fields.endDate, { type: 'date' }),
							}}
							errors={fields.endDate.errors as string[] | undefined}
						/>
					</div>

					<fieldset className="space-y-1.5">
						<legend className="text-sm font-medium">Disciplines</legend>
						<div className="flex flex-wrap gap-x-4">
							{DISCIPLINES.map((d) => (
								<label
									key={d}
									className="flex min-h-11 cursor-pointer items-center gap-2"
								>
									<input
										type="checkbox"
										name="disciplines"
										value={d}
										className="size-4"
									/>
									<span className="text-sm">{getDisciplineLabel(d)}</span>
								</label>
							))}
						</div>
					</fieldset>

					<Field
						labelProps={{ children: 'Location (optional)' }}
						inputProps={{
							...getInputProps(fields.location, { type: 'text' }),
							placeholder: 'e.g. Trondheim, Norway',
						}}
						errors={fields.location.errors as string[] | undefined}
					/>

					<SelectField
						meta={fields.targetKind}
						labelProps={{
							children: 'Target (optional)',
							className: 'text-sm font-medium',
						}}
						items={TARGET_KINDS}
						errors={fields.targetKind.errors as string[] | undefined}
					/>

					{targetKind === 'time' ? (
						<Field
							labelProps={{ children: 'Target time (seconds)' }}
							inputProps={{
								...getInputProps(fields.targetSeconds, { type: 'number' }),
								placeholder: 'e.g. 10800 for 3 hours',
								min: 1,
							}}
							errors={fields.targetSeconds.errors as string[] | undefined}
						/>
					) : null}

					{targetKind === 'pace' ? (
						<Field
							labelProps={{ children: 'Target pace (seconds per km)' }}
							inputProps={{
								...getInputProps(fields.targetSecPerKm, { type: 'number' }),
								placeholder: 'e.g. 255 for 4:15/km',
								min: 1,
							}}
							errors={fields.targetSecPerKm.errors as string[] | undefined}
						/>
					) : null}

					{targetKind === 'distance' ? (
						<Field
							labelProps={{ children: 'Target distance (meters)' }}
							inputProps={{
								...getInputProps(fields.targetMeters, { type: 'number' }),
								placeholder: 'e.g. 42195 for marathon',
								min: 1,
							}}
							errors={fields.targetMeters.errors as string[] | undefined}
						/>
					) : null}

					{targetKind === 'placement' ? (
						<Field
							labelProps={{ children: 'Target placement (position)' }}
							inputProps={{
								...getInputProps(fields.targetPosition, { type: 'number' }),
								placeholder: 'e.g. 1 for first place',
								min: 1,
							}}
							errors={fields.targetPosition.errors as string[] | undefined}
						/>
					) : null}

					{targetKind === 'qualitative' ? (
						<Field
							labelProps={{ children: 'Target description' }}
							inputProps={{
								...getInputProps(fields.targetDescription, { type: 'text' }),
								placeholder: 'e.g. Feel strong throughout',
							}}
							errors={fields.targetDescription.errors as string[] | undefined}
						/>
					) : null}

					<TextareaField
						labelProps={{ children: 'Notes (optional)' }}
						textareaProps={{
							...getInputProps(fields.notes, { type: 'text' }),
							placeholder: 'Any notes about this event...',
							rows: 3,
						}}
						errors={fields.notes.errors as string[] | undefined}
					/>

					<ErrorList errors={form.errors as string[] | undefined} />

					<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
						<Button type="submit" className="w-full sm:w-auto">
							Create Event
						</Button>
					</div>
				</div>
			</Form>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
