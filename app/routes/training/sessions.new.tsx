import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { getOrCreateAthleteProfile } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	DISCIPLINES,
	WORKOUT_INTENTS,
	INTENT_LABELS,
	STEP_KINDS,
	WorkoutAuthoringSchema,
	type StepKind,
} from '#app/utils/workout-schema.ts'
import {
	createWorkoutSession,
	getExerciseCatalog,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/sessions.new.ts'
import {
	buildBlocksInput,
	CardioStepFields,
	emptyBlock,
	emptyStep,
	FormSchema,
	RestStepFields,
	STEP_KIND_LABELS,
	StrengthStepFields,
} from './__workout-step-fields.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'New Workout Session | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const now = new Date()
	const next = new Date(now)
	next.setMinutes(0, 0, 0)
	next.setHours(next.getHours() + 1)
	const [exercises, athleteProfile] = await Promise.all([
		getExerciseCatalog(userId),
		getOrCreateAthleteProfile(userId),
	])
	return {
		defaultDate: next.toISOString().slice(0, 10),
		defaultTime: next.toISOString().slice(11, 16),
		exercises,
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
	const { defaultDate, defaultTime, exercises, disciplineProfiles } = loaderData

	// Structure is opt-in (#176): the default is the simple mode — one humane
	// duration/distance pair — and "Add structure" reveals the Block/Step editor.
	const [showStructure, setShowStructure] = useState(false)

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
			duration: '',
			distance: '',
			blocks: [emptyBlock()],
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
					to="/"
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

							<input
								type="hidden"
								name={fields.structure.name}
								value={showStructure ? 'structured' : 'simple'}
							/>

							{!showStructure ? (
								<>
									<div className="grid grid-cols-2 gap-4">
										<Field
											labelProps={{ children: 'Duration' }}
											inputProps={{
												...getInputProps(fields.duration, { type: 'text' }),
												placeholder: 'e.g. 40 min',
											}}
											errors={fields.duration.errors as string[] | undefined}
										/>
										<Field
											labelProps={{ children: 'Distance (optional)' }}
											inputProps={{
												...getInputProps(fields.distance, { type: 'text' }),
												placeholder: 'e.g. 8 km',
											}}
											errors={fields.distance.errors as string[] | undefined}
										/>
									</div>

									{fields.discipline.value === 'strength' ? (
										<p className="text-body-xs text-muted-foreground">
											Strength sessions need exercises — use "Add structure" to
											pick them.
										</p>
									) : null}

									<div className="space-y-1">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => setShowStructure(true)}
										>
											+ Add structure
										</Button>
										<p className="text-body-2xs text-muted-foreground">
											Build the workout from blocks and steps (intervals,
											strength sets, rest).
										</p>
									</div>
								</>
							) : (
								<div className="space-y-4">
									<div className="flex items-center justify-between gap-2">
										<h2 className="text-body-sm font-semibold">Blocks</h2>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setShowStructure(false)}
										>
											Remove structure
										</Button>
									</div>
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
														const sf = stepField.getFieldset()
														const currentKind = (sf.kind.value ||
															'cardio') as StepKind
														const setList = sf.sets?.getFieldList?.() ?? []

														return (
															<fieldset
																key={stepField.key}
																className="border-border/70 bg-muted/30 rounded-lg border p-4"
															>
																<legend className="text-body-2xs text-muted-foreground px-1 font-medium">
																	Step {stepIndex + 1}
																</legend>
																<div className="space-y-3">
																	<SelectField
																		meta={sf.kind}
																		labelProps={{
																			children: 'Kind',
																			className:
																				'text-body-2xs text-muted-foreground font-medium',
																		}}
																		items={STEP_KINDS.map((k) => ({
																			value: k,
																			label: STEP_KIND_LABELS[k],
																		}))}
																		errors={
																			sf.kind.errors as string[] | undefined
																		}
																	/>

																	{currentKind === 'cardio' ? (
																		<CardioStepFields
																			sf={sf}
																			disciplineProfiles={disciplineProfiles}
																			workoutDiscipline={
																				fields.discipline.value ?? 'run'
																			}
																		/>
																	) : currentKind === 'strength' ? (
																		<StrengthStepFields
																			sf={sf}
																			exercises={exercises}
																			setList={setList}
																			form={form}
																		/>
																	) : (
																		<RestStepFields sf={sf} />
																	)}

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
									<ErrorList
										errors={fields.blocks.errors as string[] | undefined}
									/>
								</div>
							)}

							<ErrorList errors={form.errors as string[] | undefined} />

							<div className="flex gap-3">
								<Button type="submit">Create Session</Button>
								<Link to="/" className={buttonVariants({ variant: 'ghost' })}>
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
