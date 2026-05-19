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
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	EXERCISE_SET_KINDS,
	WORKOUT_INTENTS,
	INTENT_LABELS,
	INTENSITY_TARGETS,
	STEP_KINDS,
	WorkoutAuthoringSchema,
	type IntensityTarget,
	type StepKind,
} from '#app/utils/workout-schema.ts'
import {
	createWorkoutSession,
	getExerciseCatalog,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/sessions.new.ts'

const FormSetSchema = z.object({
	kind: z.string().optional(),
	orderIndex: z.string().optional(),
	weightKg: z.string().optional(),
	pct1RM: z.string().optional(),
	reps: z.string().optional(),
	durationSec: z.string().optional(),
})

const FormStepSchema = z.object({
	kind: z.string().optional(),
	// cardio fields
	discipline: z.string().optional(),
	intensity: z.string().optional(),
	durationSec: z.string().optional(),
	distanceM: z.string().optional(),
	// strength fields
	exerciseId: z.string().optional(),
	restBetweenSetsSec: z.string().optional(),
	sets: z.array(FormSetSchema).optional(),
	// shared
	notes: z.string().optional(),
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

export const meta: Route.MetaFunction = () => [
	{ title: 'New Workout Session | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const now = new Date()
	const next = new Date(now)
	next.setMinutes(0, 0, 0)
	next.setHours(next.getHours() + 1)
	const exercises = await getExerciseCatalog(userId)
	return {
		defaultDate: next.toISOString().slice(0, 10),
		defaultTime: next.toISOString().slice(11, 16),
		exercises,
	}
}

function buildStepInput(
	step: z.infer<typeof FormStepSchema>,
	workoutDiscipline: string,
) {
	const kind = (step.kind || 'cardio') as StepKind

	if (kind === 'rest') {
		return {
			kind: 'rest' as const,
			durationSec: step.durationSec ? Number(step.durationSec) : undefined,
			notes: step.notes || undefined,
		}
	}

	if (kind === 'strength') {
		return {
			kind: 'strength' as const,
			exerciseId: step.exerciseId || '',
			sets: (step.sets ?? []).map((set, i) => {
				const setKind = (set.kind || 'reps') as 'reps' | 'timed' | 'amrap'
				const base = {
					orderIndex: set.orderIndex ? Number(set.orderIndex) : i,
					weightKg: set.weightKg ? Number(set.weightKg) : undefined,
					pct1RM: set.pct1RM ? Number(set.pct1RM) : undefined,
				}
				if (setKind === 'reps') {
					return {
						...base,
						kind: 'reps' as const,
						reps: set.reps ? Number(set.reps) : 1,
					}
				}
				if (setKind === 'timed') {
					return {
						...base,
						kind: 'timed' as const,
						durationSec: set.durationSec ? Number(set.durationSec) : 30,
					}
				}
				return { ...base, kind: 'amrap' as const }
			}),
			restBetweenSetsSec: step.restBetweenSetsSec
				? Number(step.restBetweenSetsSec)
				: undefined,
			notes: step.notes || undefined,
		}
	}

	// cardio — discipline defaults to workout discipline if not set
	const disc = (step.discipline || workoutDiscipline) as 'run' | 'swim' | 'bike'
	const validDisc = CARDIO_DISCIPLINES.includes(
		disc as (typeof CARDIO_DISCIPLINES)[number],
	)
		? (disc as (typeof CARDIO_DISCIPLINES)[number])
		: 'run'
	return {
		kind: 'cardio' as const,
		discipline: validDisc,
		intensity:
			(step.intensity as (typeof INTENSITY_TARGETS)[number] | undefined) ||
			undefined,
		durationSec: step.durationSec ? Number(step.durationSec) : undefined,
		distanceM: step.distanceM ? Number(step.distanceM) : undefined,
		notes: step.notes || undefined,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
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
			steps: block.steps.map((step) => buildStepInput(step, discipline)),
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

const INTENSITY_LABELS: Record<IntensityTarget, string> = {
	easy: 'Easy',
	zone2: 'Zone 2',
	threshold: 'Threshold',
	max: 'Max',
}

const STEP_KIND_LABELS: Record<StepKind, string> = {
	cardio: 'Cardio',
	strength: 'Strength',
	rest: 'Rest',
}

function emptySet() {
	return {
		kind: 'reps',
		orderIndex: '0',
		reps: '5',
		weightKg: '',
		pct1RM: '',
		durationSec: '',
	}
}

function emptyStep() {
	return {
		kind: 'cardio',
		discipline: '',
		intensity: '',
		durationSec: '',
		distanceM: '',
		exerciseId: '',
		restBetweenSetsSec: '',
		sets: [emptySet()],
		notes: '',
	}
}

function emptyBlock() {
	return {
		name: '',
		repeatCount: '1',
		steps: [emptyStep()],
	}
}

export default function NewSessionRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { defaultDate, defaultTime, exercises } = loaderData

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
																{/* Step kind picker */}
																<div className="space-y-1">
																	<label
																		htmlFor={sf.kind.id}
																		className="text-body-2xs text-muted-foreground font-medium"
																	>
																		Kind
																	</label>
																	<select
																		{...getInputProps(sf.kind, {
																			type: 'text',
																		})}
																		className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
																	>
																		{STEP_KINDS.map((k) => (
																			<option key={k} value={k}>
																				{STEP_KIND_LABELS[k]}
																			</option>
																		))}
																	</select>
																</div>

																{currentKind === 'cardio' ? (
																	<CardioStepFields sf={sf} />
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepFieldset = any

function CardioStepFields({ sf }: { sf: StepFieldset }) {
	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-1">
					<label
						htmlFor={sf.discipline.id}
						className="text-body-2xs text-muted-foreground font-medium"
					>
						Discipline
					</label>
					<select
						{...getInputProps(sf.discipline, { type: 'text' })}
						className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<option value="">Inherit</option>
						{CARDIO_DISCIPLINES.map((type) => (
							<option key={type} value={type}>
								{getDisciplineLabel(type)}
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
						{...getInputProps(sf.intensity, { type: 'text' })}
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
					labelProps={{ children: 'Duration (seconds)' }}
					inputProps={{
						...getInputProps(sf.durationSec, { type: 'number' }),
						placeholder: 'e.g. 600',
						min: 1,
					}}
					errors={sf.durationSec.errors as string[] | undefined}
				/>
				<Field
					labelProps={{ children: 'Distance (meters)' }}
					inputProps={{
						...getInputProps(sf.distanceM, { type: 'number' }),
						placeholder: 'e.g. 400',
						min: 1,
					}}
					errors={sf.distanceM.errors as string[] | undefined}
				/>
			</div>

			<TextareaField
				labelProps={{ children: 'Notes' }}
				textareaProps={{
					...getInputProps(sf.notes, { type: 'text' }),
					placeholder: 'e.g. 10 min easy jog',
					rows: 2,
				}}
				errors={sf.notes.errors as string[] | undefined}
			/>
		</>
	)
}

type ExerciseItem = {
	id: string
	name: string
	primaryMuscle: string
	equipment: string | null
}

function StrengthStepFields({
	sf,
	exercises,
	setList,
	form,
}: {
	sf: StepFieldset
	exercises: ExerciseItem[]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	setList: any[]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: any
}) {
	return (
		<>
			<div className="space-y-1">
				<label
					htmlFor={sf.exerciseId.id}
					className="text-body-2xs text-muted-foreground font-medium"
				>
					Exercise
				</label>
				<select
					{...getInputProps(sf.exerciseId, { type: 'text' })}
					className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
				>
					<option value="">Select exercise…</option>
					{exercises.map((ex) => (
						<option key={ex.id} value={ex.id}>
							{ex.name}
						</option>
					))}
				</select>
				<ErrorList errors={sf.exerciseId.errors as string[] | undefined} />
			</div>

			<div className="space-y-2">
				<p className="text-body-2xs text-muted-foreground font-medium">Sets</p>
				{setList.map((setField, setIndex) => {
					const setFs = setField.getFieldset()
					const setKind = setFs.kind.value || 'reps'
					return (
						<div
							key={setField.key}
							className="flex flex-wrap items-end gap-2 rounded border p-2"
						>
							<input
								{...getInputProps(setFs.orderIndex, { type: 'hidden' })}
								value={String(setIndex)}
							/>
							<div className="space-y-1">
								<label className="text-body-2xs text-muted-foreground font-medium">
									Kind
								</label>
								<select
									{...getInputProps(setFs.kind, { type: 'text' })}
									className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-8 rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{EXERCISE_SET_KINDS.map((k) => (
										<option key={k} value={k}>
											{k.charAt(0).toUpperCase() + k.slice(1)}
										</option>
									))}
								</select>
							</div>
							{setKind === 'reps' ? (
								<div className="w-16 space-y-1">
									<label className="text-body-2xs text-muted-foreground font-medium">
										Reps
									</label>
									<input
										{...getInputProps(setFs.reps, { type: 'number' })}
										min={1}
										className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
									/>
								</div>
							) : setKind === 'timed' ? (
								<div className="w-20 space-y-1">
									<label className="text-body-2xs text-muted-foreground font-medium">
										Secs
									</label>
									<input
										{...getInputProps(setFs.durationSec, { type: 'number' })}
										min={1}
										className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
									/>
								</div>
							) : null}
							<div className="w-20 space-y-1">
								<label className="text-body-2xs text-muted-foreground font-medium">
									kg
								</label>
								<input
									{...getInputProps(setFs.weightKg, { type: 'number' })}
									min={0}
									step={0.5}
									placeholder="—"
									className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
								/>
							</div>
							<div className="w-16 space-y-1">
								<label className="text-body-2xs text-muted-foreground font-medium">
									%1RM
								</label>
								<input
									{...getInputProps(setFs.pct1RM, { type: 'number' })}
									min={0}
									max={200}
									placeholder="—"
									className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
								/>
							</div>
							{setList.length > 1 ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									{...form.remove.getButtonProps({
										name: sf.sets.name,
										index: setIndex,
									})}
									aria-label={`Remove set ${setIndex + 1}`}
								>
									×
								</Button>
							) : null}
						</div>
					)
				})}
				<Button
					type="button"
					variant="outline"
					size="sm"
					{...form.insert.getButtonProps({
						name: sf.sets.name,
						defaultValue: { ...emptySet(), orderIndex: String(setList.length) },
					})}
				>
					+ Add Set
				</Button>
			</div>

			<Field
				labelProps={{ children: 'Rest between sets (seconds)' }}
				inputProps={{
					...getInputProps(sf.restBetweenSetsSec, { type: 'number' }),
					placeholder: 'e.g. 90',
					min: 1,
				}}
				errors={sf.restBetweenSetsSec.errors as string[] | undefined}
			/>

			<TextareaField
				labelProps={{ children: 'Notes' }}
				textareaProps={{
					...getInputProps(sf.notes, { type: 'text' }),
					placeholder: 'e.g. Focus on depth',
					rows: 2,
				}}
				errors={sf.notes.errors as string[] | undefined}
			/>
		</>
	)
}

function RestStepFields({ sf }: { sf: StepFieldset }) {
	return (
		<>
			<Field
				labelProps={{ children: 'Duration (seconds)' }}
				inputProps={{
					...getInputProps(sf.durationSec, { type: 'number' }),
					placeholder: 'e.g. 90',
					min: 1,
				}}
				errors={sf.durationSec.errors as string[] | undefined}
			/>
			<TextareaField
				labelProps={{ children: 'Notes' }}
				textareaProps={{
					...getInputProps(sf.notes, { type: 'text' }),
					placeholder: 'e.g. Rest until ready',
					rows: 2,
				}}
				errors={sf.notes.errors as string[] | undefined}
			/>
		</>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
