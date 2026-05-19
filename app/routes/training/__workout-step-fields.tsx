import React from 'react'
import { getInputProps } from '@conform-to/react'
import { useFetcher } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	EXERCISE_SET_KINDS,
	INTENSITY_TARGETS,
	MUSCLE_GROUPS,
	STEP_KINDS,
	WORKOUT_INTENTS,
	type IntensityTarget,
	type StepKind,
} from '#app/utils/workout-schema.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepFieldset = any

export const STEP_SELECT_CLASS =
	'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'

export const INTENSITY_LABELS: Record<IntensityTarget, string> = {
	easy: 'Easy',
	zone2: 'Zone 2',
	threshold: 'Threshold',
	max: 'Max',
}

export const STEP_KIND_LABELS: Record<StepKind, string> = {
	cardio: 'Cardio',
	strength: 'Strength',
	rest: 'Rest',
}

export const FormSetSchema = z.object({
	kind: z.string().optional(),
	orderIndex: z.string().optional(),
	weightKg: z.string().optional(),
	pct1RM: z.string().optional(),
	reps: z.string().optional(),
	durationSec: z.string().optional(),
})

export const FormStepSchema = z.object({
	kind: z.string().optional(),
	discipline: z.string().optional(),
	intensity: z.string().optional(),
	durationSec: z.string().optional(),
	distanceM: z.string().optional(),
	exerciseId: z.string().optional(),
	restBetweenSetsSec: z.string().optional(),
	sets: z.array(FormSetSchema).optional(),
	notes: z.string().optional(),
})

export const FormBlockSchema = z.object({
	name: z.string().optional(),
	repeatCount: z.string().optional(),
	steps: z.array(FormStepSchema).min(1, 'A block must have at least one step'),
})

export const FormSchema = z.object({
	title: z.string().min(1, 'Title is required').max(120),
	discipline: z.enum(DISCIPLINES),
	intent: z.enum(WORKOUT_INTENTS),
	scheduledAtDate: z.string().min(1, 'Date is required'),
	scheduledAtTime: z.string().min(1, 'Time is required'),
	blocks: z.array(FormBlockSchema).min(1),
})

export function buildStepInput(
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

export function emptySet() {
	return {
		kind: 'reps',
		orderIndex: '0',
		reps: '5',
		weightKg: '',
		pct1RM: '',
		durationSec: '',
	}
}

export function emptyStep() {
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

export function emptyBlock() {
	return {
		name: '',
		repeatCount: '1',
		steps: [emptyStep()],
	}
}

export type ExerciseItem = {
	id: string
	name: string
	primaryMuscle: string
	equipment: string | null
}

export function CardioStepFields({ sf }: { sf: StepFieldset }) {
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
						className={STEP_SELECT_CLASS}
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

export function StrengthStepFields({
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
	const [exerciseList, setExerciseList] = React.useState(exercises)
	const [showCreate, setShowCreate] = React.useState(false)
	const [newName, setNewName] = React.useState('')
	const [newMuscle, setNewMuscle] = React.useState<string>('')
	const createFetcher = useFetcher<{
		exercise?: { id: string; name: string }
		error?: string
	}>()
	const selectRef = React.useRef<HTMLSelectElement>(null)

	React.useEffect(() => {
		if (createFetcher.data?.exercise) {
			const ex = createFetcher.data.exercise
			setExerciseList((prev) => [
				...prev,
				{ id: ex.id, name: ex.name, primaryMuscle: newMuscle, equipment: null },
			])
			setShowCreate(false)
			setNewName('')
			setNewMuscle('')
			if (selectRef.current) {
				selectRef.current.value = ex.id
				selectRef.current.dispatchEvent(new Event('change', { bubbles: true }))
			}
		}
	}, [createFetcher.data, newMuscle])

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
					ref={selectRef}
					{...getInputProps(sf.exerciseId, { type: 'text' })}
					className={STEP_SELECT_CLASS}
				>
					<option value="">Select exercise…</option>
					{exerciseList.map((ex) => (
						<option key={ex.id} value={ex.id}>
							{ex.name}
						</option>
					))}
				</select>
				<ErrorList errors={sf.exerciseId.errors as string[] | undefined} />
				<button
					type="button"
					onClick={() => setShowCreate((v) => !v)}
					className="text-body-2xs text-muted-foreground hover:text-foreground underline"
				>
					{showCreate ? 'Cancel' : '+ Create custom exercise'}
				</button>
				{showCreate ? (
					<createFetcher.Form
						method="post"
						action="/training/exercises"
						className="mt-2 flex flex-wrap items-end gap-2 rounded border p-2"
					>
						<div className="space-y-1">
							<label className="text-body-2xs text-muted-foreground font-medium">
								Name
							</label>
							<input
								name="name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="e.g. Kettlebell Swing"
								className="border-input bg-background h-8 rounded-md border px-2 text-sm"
								required
							/>
						</div>
						<div className="space-y-1">
							<label className="text-body-2xs text-muted-foreground font-medium">
								Primary muscle
							</label>
							<select
								name="primaryMuscle"
								value={newMuscle}
								onChange={(e) => setNewMuscle(e.target.value)}
								className="border-input bg-background h-8 rounded-md border px-2 text-sm"
								required
							>
								<option value="">Select…</option>
								{MUSCLE_GROUPS.map((mg) => (
									<option key={mg} value={mg}>
										{mg.charAt(0).toUpperCase() + mg.slice(1).replace('-', ' ')}
									</option>
								))}
							</select>
						</div>
						<Button
							type="submit"
							size="sm"
							disabled={createFetcher.state !== 'idle'}
						>
							{createFetcher.state !== 'idle' ? 'Saving…' : 'Create'}
						</Button>
						{createFetcher.data?.error ? (
							<p className="text-destructive w-full text-xs">
								{createFetcher.data.error}
							</p>
						) : null}
					</createFetcher.Form>
				) : null}
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

export function RestStepFields({ sf }: { sf: StepFieldset }) {
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
