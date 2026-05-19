import { invariantResponse } from '@epic-web/invariant'
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	EVENT_KIND_LABELS,
	EVENT_KINDS,
	EVENT_PRIORITIES,
	EventAuthoringSchema,
	parseEventDisciplines,
	parseEventTarget,
} from '#app/utils/event-schema.ts'
import { getEventById, updateEvent } from '#app/utils/event.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/events.$eventId.edit.ts'

const TARGET_KINDS = [
	{ value: '', label: 'No target' },
	{ value: 'finish', label: 'Finish' },
	{ value: 'time', label: 'Time' },
	{ value: 'pace', label: 'Pace' },
	{ value: 'distance', label: 'Distance' },
	{ value: 'placement', label: 'Placement' },
	{ value: 'qualitative', label: 'Qualitative' },
] as const

const FormSchema = z.object({
	name: z.string().min(1, 'Name is required').max(120),
	kind: z.enum(EVENT_KINDS),
	priority: z.enum(EVENT_PRIORITIES),
	startDate: z.string().min(1, 'Start date is required'),
	endDate: z.string().optional(),
	location: z.string().optional(),
	notes: z.string().optional(),
	targetKind: z.string().optional(),
	targetSeconds: z.string().optional(),
	targetSecPerKm: z.string().optional(),
	targetMeters: z.string().optional(),
	targetPosition: z.string().optional(),
	targetDescription: z.string().optional(),
})

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{
		title: loaderData?.event
			? `Edit ${loaderData.event.name} | Trainm8`
			: 'Edit Event | Trainm8',
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, 'Event id is required', { status: 400 })

	const event = await getEventById(userId, params.eventId)
	invariantResponse(event, 'Event not found', { status: 404 })

	return { event }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, 'Event id is required', { status: 400 })

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: FormSchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const {
		name,
		kind,
		priority,
		startDate,
		endDate,
		location,
		notes,
		targetKind,
		targetSeconds,
		targetSecPerKm,
		targetMeters,
		targetPosition,
		targetDescription,
	} = submission.value

	const rawDisciplines = formData.getAll('disciplines') as string[]

	let target: unknown = undefined
	if (targetKind === 'time' && targetSeconds) {
		target = { kind: 'time', seconds: Number(targetSeconds) }
	} else if (targetKind === 'pace' && targetSecPerKm) {
		target = { kind: 'pace', secPerKm: Number(targetSecPerKm) }
	} else if (targetKind === 'distance' && targetMeters) {
		target = { kind: 'distance', meters: Number(targetMeters) }
	} else if (targetKind === 'placement' && targetPosition) {
		target = { kind: 'placement', position: Number(targetPosition) }
	} else if (targetKind === 'finish') {
		target = { kind: 'finish' }
	} else if (targetKind === 'qualitative' && targetDescription) {
		target = { kind: 'qualitative', description: targetDescription }
	}

	const authoringInput = EventAuthoringSchema.safeParse({
		name,
		kind,
		priority,
		startDate: new Date(startDate),
		endDate: endDate ? new Date(endDate) : null,
		disciplines: rawDisciplines,
		target: target ?? null,
		location: location || null,
		notes: notes || null,
		status: 'planned',
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

	const updated = await updateEvent(userId, params.eventId, authoringInput.data)
	invariantResponse(updated, 'Event not found', { status: 404 })

	throw redirect(`/training/events/${params.eventId}`)
}

export default function EditEventRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { event } = loaderData
	const existingTarget = parseEventTarget(event.target)
	const existingDisciplines = parseEventDisciplines(event.disciplines)

	const defaultTargetKind = existingTarget?.kind ?? ''
	const [targetKind, setTargetKind] = useState(defaultTargetKind)

	function defaultTargetField(field: string): string {
		if (!existingTarget) return ''
		switch (field) {
			case 'seconds':
				return existingTarget.kind === 'time' ? String(existingTarget.seconds) : ''
			case 'secPerKm':
				return existingTarget.kind === 'pace' ? String(existingTarget.secPerKm) : ''
			case 'meters':
				return existingTarget.kind === 'distance' ? String(existingTarget.meters) : ''
			case 'position':
				return existingTarget.kind === 'placement' ? String(existingTarget.position) : ''
			case 'description':
				return existingTarget.kind === 'qualitative' ? existingTarget.description : ''
			default:
				return ''
		}
	}

	const startDateStr = event.startDate
		? new Date(event.startDate).toISOString().slice(0, 10)
		: ''
	const endDateStr = event.endDate
		? new Date(event.endDate).toISOString().slice(0, 10)
		: ''

	const [form, fields] = useForm({
		id: 'edit-event',
		constraint: getZodConstraint(FormSchema),
		lastResult: actionData?.result,
		defaultValue: {
			name: event.name,
			kind: event.kind,
			priority: event.priority,
			startDate: startDateStr,
			endDate: endDateStr,
			location: event.location ?? '',
			notes: event.notes ?? '',
			targetKind: defaultTargetKind,
			targetSeconds: defaultTargetField('seconds'),
			targetSecPerKm: defaultTargetField('secPerKm'),
			targetMeters: defaultTargetField('meters'),
			targetPosition: defaultTargetField('position'),
			targetDescription: defaultTargetField('description'),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<main className="container mx-auto max-w-2xl py-8">
			<div className="mb-6">
				<Link
					to={`/training/events/${event.id}`}
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Cancel
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Edit Event</CardTitle>
				</CardHeader>
				<CardContent>
					<Form method="POST" {...getFormProps(form)}>
						<div className="space-y-6">
							<Field
								labelProps={{ children: 'Name' }}
								inputProps={{
									...getInputProps(fields.name, { type: 'text' }),
									autoFocus: true,
								}}
								errors={fields.name.errors as string[] | undefined}
							/>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<label
										htmlFor={fields.kind.id}
										className="text-body-xs text-muted-foreground font-medium"
									>
										Kind
									</label>
									<select
										{...getInputProps(fields.kind, { type: 'text' })}
										className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
									>
										{EVENT_KINDS.map((k) => (
											<option key={k} value={k}>
												{EVENT_KIND_LABELS[k]}
											</option>
										))}
									</select>
									<ErrorList errors={fields.kind.errors as string[] | undefined} />
								</div>

								<div className="space-y-2">
									<label
										htmlFor={fields.priority.id}
										className="text-body-xs text-muted-foreground font-medium"
									>
										Priority
									</label>
									<select
										{...getInputProps(fields.priority, { type: 'text' })}
										className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
									>
										{EVENT_PRIORITIES.map((p) => (
											<option key={p} value={p}>
												Priority {p}
											</option>
										))}
									</select>
									<ErrorList errors={fields.priority.errors as string[] | undefined} />
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
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

							<div className="space-y-2">
								<fieldset>
									<legend className="text-body-xs text-muted-foreground mb-2 font-medium">
										Disciplines
									</legend>
									<div className="flex flex-wrap gap-3">
										{DISCIPLINES.map((d) => (
											<label key={d} className="flex cursor-pointer items-center gap-1.5">
												<input
													type="checkbox"
													name="disciplines"
													value={d}
													defaultChecked={existingDisciplines.includes(d)}
													className="h-4 w-4"
												/>
												<span className="text-sm">{getDisciplineLabel(d)}</span>
											</label>
										))}
									</div>
								</fieldset>
							</div>

							<Field
								labelProps={{ children: 'Location (optional)' }}
								inputProps={{
									...getInputProps(fields.location, { type: 'text' }),
									placeholder: 'e.g. Trondheim, Norway',
								}}
								errors={fields.location.errors as string[] | undefined}
							/>

							<div className="space-y-2">
								<label className="text-body-xs text-muted-foreground font-medium">
									Target (optional)
								</label>
								<select
									name="targetKind"
									value={targetKind}
									onChange={(e) => setTargetKind(e.target.value)}
									className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{TARGET_KINDS.map((t) => (
										<option key={t.value} value={t.value}>
											{t.label}
										</option>
									))}
								</select>

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
										errors={
											fields.targetDescription.errors as string[] | undefined
										}
									/>
								) : null}
							</div>

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

							<div className="flex gap-3">
								<Button type="submit">Save changes</Button>
								<Link
									to={`/training/events/${event.id}`}
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
