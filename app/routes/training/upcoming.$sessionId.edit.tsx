import { invariantResponse } from '@epic-web/invariant'
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
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	DISCIPLINES,
	STEP_DISCIPLINES,
	WORKOUT_INTENTS,
	INTENT_LABELS,
	INTENSITY_TARGETS,
	WorkoutAuthoringSchema,
	type IntensityTarget,
} from '#app/utils/workout-schema.ts'
import {
	getWorkoutSessionForEdit,
	updateWorkoutSession,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/upcoming.$sessionId.edit.ts'

const FormStepSchema = z.object({
	discipline: z.string().optional(),
	intensity: z.string().optional(),
	durationSec: z.string().optional(),
	distanceM: z.string().optional(),
	description: z.string().optional(),
})

const FormBlockSchema = z.object({
	name: z.string().optional(),
	repeatCount: z.string().optional(),
	steps: z.array(FormStepSchema).min(1, 'A block must have at least one step'),
})

const FormSchema = z.object({
	title: z.string().min(1, 'Title is required').max(120),
	discipline: z.enum(DISCIPLINES),
	intent: z.enum(WORKOUT_INTENTS),
	scheduledAtDate: z.string().min(1, 'Date is required'),
	scheduledAtTime: z.string().min(1, 'Time is required'),
	blocks: z.array(FormBlockSchema).min(1),
})

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

	const session = await getWorkoutSessionForEdit(userId, params.sessionId)
	invariantResponse(session, 'Workout session not found', { status: 404 })

	return { session }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: FormSchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const {
		title,
		discipline,
		intent,
		scheduledAtDate,
		scheduledAtTime,
		blocks,
	} = submission.value

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
		blocks: blocks.map((block) => ({
			name: block.name || undefined,
			repeatCount: block.repeatCount ? Number(block.repeatCount) : 1,
			steps: block.steps.map((step) => ({
				discipline: step.discipline || undefined,
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

	const updated = await updateWorkoutSession(
		userId,
		params.sessionId,
		authoringInput.data,
	)
	invariantResponse(updated, 'Workout session not found', { status: 404 })

	throw redirect(`/training/upcoming/${params.sessionId}`)
}

const STEP_SELECT_CLASS =
	'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'

const INTENSITY_LABELS: Record<IntensityTarget, string> = {
	easy: 'Easy',
	zone2: 'Zone 2',
	threshold: 'Threshold',
	max: 'Max',
}

function emptyStep() {
	return {
		discipline: '',
		intensity: '',
		durationSec: '',
		distanceM: '',
		description: '',
	}
}

function emptyBlock() {
	return {
		name: '',
		repeatCount: '1',
		steps: [emptyStep()],
	}
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
				discipline: step.discipline ?? '',
				intensity: step.intensity ?? '',
				durationSec: step.durationSec != null ? String(step.durationSec) : '',
				distanceM: step.distanceM != null ? String(step.distanceM) : '',
				description: step.description ?? '',
			})),
		})),
	}
}

export default function EditSessionRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { session } = loaderData

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

	const blockList = fields.blocks.getFieldList()
	const cancelHref = `/training/upcoming/${session.id}`

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

			<Card>
				<CardHeader>
					<CardTitle>Edit Workout Session</CardTitle>
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
									htmlFor={fields.discipline.id}
									className="text-body-xs text-muted-foreground font-medium"
								>
									Discipline
								</label>
								<select
									{...getInputProps(fields.discipline, { type: 'text' })}
									className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{DISCIPLINES.map((type) => (
										<option key={type} value={type}>
											{getDisciplineLabel(type)}
										</option>
									))}
								</select>
								<ErrorList
									errors={fields.discipline.errors as string[] | undefined}
								/>
							</div>

							<div className="space-y-2">
								<label
									htmlFor={fields.intent.id}
									className="text-body-xs text-muted-foreground font-medium"
								>
									Intent
								</label>
								<select
									{...getInputProps(fields.intent, { type: 'text' })}
									className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{WORKOUT_INTENTS.map((value) => (
										<option key={value} value={value}>
											{INTENT_LABELS[value]}
										</option>
									))}
								</select>
								<ErrorList
									errors={fields.intent.errors as string[] | undefined}
								/>
							</div>

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

							<div className="space-y-4">
								<h2 className="text-body-sm font-semibold">Blocks</h2>
								{blockList.map((blockField, blockIndex) => {
									const blockFields = blockField.getFieldset()
									const stepList = blockFields.steps.getFieldList()

									return (
										<div
											key={blockField.key}
											className="border-border/70 space-y-4 rounded-lg border p-4"
										>
											<div className="flex items-center justify-between gap-2">
												<span className="text-body-xs text-muted-foreground font-medium">
													Block {blockIndex + 1}
												</span>
												<div className="flex gap-1">
													{blockIndex > 0 ? (
														<Button
															type="button"
															variant="outline"
															size="sm"
															{...form.reorder.getButtonProps({
																name: fields.blocks.name,
																from: blockIndex,
																to: blockIndex - 1,
															})}
															aria-label={`Move block ${blockIndex + 1} up`}
														>
															↑
														</Button>
													) : null}
													{blockIndex < blockList.length - 1 ? (
														<Button
															type="button"
															variant="outline"
															size="sm"
															{...form.reorder.getButtonProps({
																name: fields.blocks.name,
																from: blockIndex,
																to: blockIndex + 1,
															})}
															aria-label={`Move block ${blockIndex + 1} down`}
														>
															↓
														</Button>
													) : null}
													{blockList.length > 1 ? (
														<Button
															type="button"
															variant="outline"
															size="sm"
															{...form.remove.getButtonProps({
																name: fields.blocks.name,
																index: blockIndex,
															})}
															aria-label={`Remove block ${blockIndex + 1}`}
														>
															Remove block
														</Button>
													) : null}
												</div>
											</div>

											<div className="grid grid-cols-2 gap-3">
												<Field
													labelProps={{ children: 'Block name (optional)' }}
													inputProps={{
														...getInputProps(blockFields.name, {
															type: 'text',
														}),
														placeholder: 'e.g. Warm-up',
														maxLength: 60,
													}}
													errors={
														blockFields.name.errors as string[] | undefined
													}
												/>
												<Field
													labelProps={{ children: 'Repeat count' }}
													inputProps={{
														...getInputProps(blockFields.repeatCount, {
															type: 'number',
														}),
														min: 1,
													}}
													errors={
														blockFields.repeatCount.errors as
															| string[]
															| undefined
													}
												/>
											</div>

											<div className="space-y-3">
												{stepList.map((stepField, stepIndex) => {
													const stepFields = stepField.getFieldset()
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
																			htmlFor={stepFields.discipline.id}
																			className="text-body-2xs text-muted-foreground font-medium"
																		>
																			Discipline
																		</label>
																		<select
																			{...getInputProps(stepFields.discipline, {
																				type: 'text',
																			})}
																			className={STEP_SELECT_CLASS}
																		>
																			<option value="">Inherit</option>
																			{STEP_DISCIPLINES.map((type) => (
																				<option key={type} value={type}>
																					{getDisciplineLabel(type)}
																				</option>
																			))}
																		</select>
																	</div>
																	<div className="space-y-1">
																		<label
																			htmlFor={stepFields.intensity.id}
																			className="text-body-2xs text-muted-foreground font-medium"
																		>
																			Intensity
																		</label>
																		<select
																			{...getInputProps(stepFields.intensity, {
																				type: 'text',
																			})}
																			className={STEP_SELECT_CLASS}
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
																			...getInputProps(stepFields.durationSec, {
																				type: 'number',
																			}),
																			placeholder: 'e.g. 600',
																			min: 1,
																		}}
																		errors={
																			stepFields.durationSec.errors as
																				| string[]
																				| undefined
																		}
																	/>
																	<Field
																		labelProps={{
																			children: 'Distance (meters)',
																		}}
																		inputProps={{
																			...getInputProps(stepFields.distanceM, {
																				type: 'number',
																			}),
																			placeholder: 'e.g. 400',
																			min: 1,
																		}}
																		errors={
																			stepFields.distanceM.errors as
																				| string[]
																				| undefined
																		}
																	/>
																</div>

																<TextareaField
																	labelProps={{ children: 'Description' }}
																	textareaProps={{
																		...getInputProps(stepFields.description, {
																			type: 'text',
																		}),
																		placeholder: 'e.g. 10 min easy jog',
																		rows: 2,
																	}}
																	errors={
																		stepFields.description.errors as
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
										</div>
									)
								})}
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										{...form.insert.getButtonProps({
											name: fields.blocks.name,
											defaultValue: emptyBlock(),
										})}
									>
										+ Add Block
									</Button>
								</div>
							</div>

							<ErrorList errors={form.errors as string[] | undefined} />

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
