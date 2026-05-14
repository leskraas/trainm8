import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
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
	WORKOUT_ACTIVITY_TYPES,
	STEP_ACTIVITY_TYPES,
	INTENSITY_TARGETS,
	WorkoutAuthoringSchema,
} from '#app/utils/workout-schema.ts'
import { createWorkoutSession } from '#app/utils/workout.server.ts'
import { type Route } from './+types/sessions.new.ts'

const FormStepSchema = z.object({
	activity: z.string().optional(),
	intensity: z.string().optional(),
	durationSec: z.string().optional(),
	distanceM: z.string().optional(),
	description: z.string().optional(),
})

const FormBlockSchema = z.object({
	steps: z.array(FormStepSchema).min(1, 'A block must have at least one step'),
})

const FormSchema = z.object({
	title: z.string().min(1, 'Title is required').max(120),
	activityType: z.enum(WORKOUT_ACTIVITY_TYPES),
	scheduledAtDate: z.string().min(1, 'Date is required'),
	scheduledAtTime: z.string().min(1, 'Time is required'),
	blocks: z.array(FormBlockSchema).min(1),
})

export const meta: Route.MetaFunction = () => [
	{ title: 'New Workout Session | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	const now = new Date()
	const next = new Date(now)
	next.setMinutes(0, 0, 0)
	next.setHours(next.getHours() + 1)
	return {
		defaultDate: next.toISOString().slice(0, 10),
		defaultTime: next.toISOString().slice(11, 16),
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: FormSchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const { title, activityType, scheduledAtDate, scheduledAtTime, blocks } =
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
		activityType,
		scheduledAt: scheduledAt.toISOString(),
		blocks: blocks.map((block) => ({
			repeatCount: 1,
			steps: block.steps.map((step) => ({
				activity: step.activity || undefined,
				intensity: step.intensity || undefined,
				durationSec: step.durationSec ? Number(step.durationSec) : undefined,
				distanceM: step.distanceM ? Number(step.distanceM) : undefined,
				description: step.description || undefined,
			})),
		})),
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
	throw redirect(`/training/upcoming/${session.id}`)
}

const ACTIVITY_LABELS: Record<string, string> = {
	run: 'Run',
	swim: 'Swim',
	bike: 'Ride',
	strength: 'Strength',
}

const STEP_ACTIVITY_LABELS: Record<string, string> = {
	run: 'Run',
	swim: 'Swim',
	bike: 'Ride',
	strength: 'Strength',
	rest: 'Rest',
}

const INTENSITY_LABELS: Record<string, string> = {
	easy: 'Easy',
	zone2: 'Zone 2',
	threshold: 'Threshold',
	max: 'Max',
}

function emptyStep() {
	return {
		activity: '',
		intensity: '',
		durationSec: '',
		distanceM: '',
		description: '',
	}
}

export default function NewSessionRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { defaultDate, defaultTime } = loaderData

	const [form, fields] = useForm({
		id: 'new-session',
		constraint: getZodConstraint(FormSchema),
		lastResult: actionData?.result,
		defaultValue: {
			title: '',
			activityType: 'run',
			scheduledAtDate: defaultDate,
			scheduledAtTime: defaultTime,
			blocks: [{ steps: [emptyStep()] }],
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	const blockList = fields.blocks.getFieldList()

	return (
		<main className="container mx-auto max-w-2xl py-8">
			<div className="mb-6">
				<Link
					to="/training/upcoming"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Cancel
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>New Workout Session</CardTitle>
				</CardHeader>
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

							<div className="space-y-2">
								<label
									htmlFor={fields.activityType.id}
									className="text-body-xs text-muted-foreground font-medium"
								>
									Activity Type
								</label>
								<select
									{...getInputProps(fields.activityType, { type: 'text' })}
									className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{WORKOUT_ACTIVITY_TYPES.map((type) => (
										<option key={type} value={type}>
											{ACTIVITY_LABELS[type]}
										</option>
									))}
								</select>
								<ErrorList
									errors={fields.activityType.errors as string[] | undefined}
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<Field
									labelProps={{ children: 'Date' }}
									inputProps={{
										...getInputProps(fields.scheduledAtDate, { type: 'date' }),
									}}
									errors={
										fields.scheduledAtDate.errors as string[] | undefined
									}
								/>
								<Field
									labelProps={{ children: 'Time' }}
									inputProps={{
										...getInputProps(fields.scheduledAtTime, { type: 'time' }),
									}}
									errors={
										fields.scheduledAtTime.errors as string[] | undefined
									}
								/>
							</div>

							<div className="space-y-4">
								<h2 className="text-body-sm font-semibold">Steps</h2>
								{blockList.map((blockField, blockIndex) => {
									const blockFields = blockField.getFieldset()
									const stepList = blockFields.steps.getFieldList()

									return (
										<div key={blockField.key} className="space-y-3">
											{stepList.map((stepField, stepIndex) => {
												const sf = stepField.getFieldset()
												return (
													<fieldset
														key={stepField.key}
														className="border-border/70 bg-muted/30 rounded-lg border p-4"
													>
														<legend className="text-body-2xs text-muted-foreground px-1 font-medium">
															Step {stepIndex + 1}
														</legend>
														<div className="space-y-3">
															<div className="grid grid-cols-2 gap-3">
																<div className="space-y-1">
																	<label
																		htmlFor={sf.activity.id}
																		className="text-body-2xs text-muted-foreground font-medium"
																	>
																		Activity
																	</label>
																	<select
																		{...getInputProps(sf.activity, {
																			type: 'text',
																		})}
																		className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
																	>
																		<option value="">Inherit</option>
																		{STEP_ACTIVITY_TYPES.map((type) => (
																			<option key={type} value={type}>
																				{STEP_ACTIVITY_LABELS[type]}
																			</option>
																		))}
																	</select>
																</div>
																<div className="space-y-1">
																	<label
																		htmlFor={sf.intensity.id}
																		className="text-body-2xs text-muted-foreground font-medium"
																	>
																		Intensity
																	</label>
																	<select
																		{...getInputProps(sf.intensity, {
																			type: 'text',
																		})}
																		className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
																	>
																		<option value="">None</option>
																		{INTENSITY_TARGETS.map((level) => (
																			<option key={level} value={level}>
																				{INTENSITY_LABELS[level]}
																			</option>
																		))}
																	</select>
																</div>
															</div>

															<div className="grid grid-cols-2 gap-3">
																<Field
																	labelProps={{
																		children: 'Duration (seconds)',
																	}}
																	inputProps={{
																		...getInputProps(sf.durationSec, {
																			type: 'number',
																		}),
																		placeholder: 'e.g. 600',
																		min: 1,
																	}}
																	errors={
																		sf.durationSec.errors as
																			| string[]
																			| undefined
																	}
																/>
																<Field
																	labelProps={{
																		children: 'Distance (meters)',
																	}}
																	inputProps={{
																		...getInputProps(sf.distanceM, {
																			type: 'number',
																		}),
																		placeholder: 'e.g. 400',
																		min: 1,
																	}}
																	errors={
																		sf.distanceM.errors as
																			| string[]
																			| undefined
																	}
																/>
															</div>

															<TextareaField
																labelProps={{ children: 'Description' }}
																textareaProps={{
																	...getInputProps(sf.description, {
																		type: 'text',
																	}),
																	placeholder: 'e.g. 10 min easy jog',
																	rows: 2,
																}}
																errors={
																	sf.description.errors as
																		| string[]
																		| undefined
																}
															/>

															<div className="flex items-center gap-2">
																{stepIndex > 0 ? (
																	<Button
																		type="button"
																		variant="outline"
																		size="sm"
																		{...form.reorder.getButtonProps({
																			name: blockFields.steps.name,
																			from: stepIndex,
																			to: stepIndex - 1,
																		})}
																		aria-label={`Move step ${stepIndex + 1} up`}
																	>
																		↑
																	</Button>
																) : null}
																{stepIndex < stepList.length - 1 ? (
																	<Button
																		type="button"
																		variant="outline"
																		size="sm"
																		{...form.reorder.getButtonProps({
																			name: blockFields.steps.name,
																			from: stepIndex,
																			to: stepIndex + 1,
																		})}
																		aria-label={`Move step ${stepIndex + 1} down`}
																	>
																		↓
																	</Button>
																) : null}
																{stepList.length > 1 ? (
																	<Button
																		type="button"
																		variant="outline"
																		size="sm"
																		{...form.remove.getButtonProps({
																			name: blockFields.steps.name,
																			index: stepIndex,
																		})}
																		aria-label={`Remove step ${stepIndex + 1}`}
																	>
																		Remove
																	</Button>
																) : null}
															</div>
														</div>
													</fieldset>
												)
											})}
											<div className="flex gap-2">
												<Button
													type="button"
													variant="outline"
													size="sm"
													{...form.insert.getButtonProps({
														name: blockFields.steps.name,
														defaultValue: emptyStep(),
													})}
												>
													+ Add Step
												</Button>
											</div>
											<ErrorList
												errors={
													blockFields.steps.errors as string[] | undefined
												}
											/>
										</div>
									)
								})}
							</div>

							<ErrorList errors={form.errors as string[] | undefined} />

							<div className="flex gap-3">
								<Button type="submit">Create Session</Button>
								<Link
									to="/training/upcoming"
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
