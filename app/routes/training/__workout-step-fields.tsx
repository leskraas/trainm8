import React from 'react'
import { getInputProps, useInputControl } from '@conform-to/react'
import { useFetcher } from 'react-router'
import { z } from 'zod'
import {
	ErrorList,
	Field,
	SelectField,
	TextareaField,
} from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	EXERCISE_SET_KINDS,
	INTENSITY_KIND_LABELS,
	IntensityTargetSchema,
	MUSCLE_GROUPS,
	STEP_KINDS,
	WORKOUT_INTENTS,
	type IntensityTarget,
	type StepKind,
} from '#app/utils/workout-schema.ts'
import {
	getRecipe,
	listRecipesForDiscipline,
	resolveIntensity,
	type DisciplineProfileForResolver,
} from '#app/utils/zones/index.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepFieldset = any

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

export type DisciplineProfileShape = {
	discipline: string
	zoneSystem: string | null
	zoneOverrides: string | null
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
}

function parseIntensityTarget(
	json: string | undefined,
): IntensityTarget | undefined {
	if (!json) return undefined
	try {
		const result = IntensityTargetSchema.safeParse(JSON.parse(json))
		return result.success ? result.data : undefined
	} catch {
		return undefined
	}
}

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
		intensity: parseIntensityTarget(step.intensity),
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

// ——— Intensity picker ——————————————————————————————————————————————

type IntensityKind = IntensityTarget['kind'] | ''

interface IntensityState {
	kind: IntensityKind
	zoneLabel: string
	rpeMin: string
	rpeMax: string
	hrBpmMin: string
	hrBpmMax: string
	hrPctRef: 'max' | 'lthr'
	hrPctMin: string
	hrPctMax: string
	powerMin: string
	powerMax: string
	powerPctMin: string
	powerPctMax: string
	paceMin: string
	paceMax: string
}

const emptyIntensityState: IntensityState = {
	kind: '',
	zoneLabel: '',
	rpeMin: '',
	rpeMax: '',
	hrBpmMin: '',
	hrBpmMax: '',
	hrPctRef: 'lthr',
	hrPctMin: '',
	hrPctMax: '',
	powerMin: '',
	powerMax: '',
	powerPctMin: '',
	powerPctMax: '',
	paceMin: '',
	paceMax: '',
}

function intensityTargetToState(t: IntensityTarget): IntensityState {
	switch (t.kind) {
		case 'zoneLabel':
			return { ...emptyIntensityState, kind: 'zoneLabel', zoneLabel: t.label }
		case 'rpe':
			return {
				...emptyIntensityState,
				kind: 'rpe',
				rpeMin: String(t.min),
				rpeMax: t.max != null ? String(t.max) : '',
			}
		case 'hrBpm':
			return {
				...emptyIntensityState,
				kind: 'hrBpm',
				hrBpmMin: String(t.min),
				hrBpmMax: t.max != null ? String(t.max) : '',
			}
		case 'hrPct':
			return {
				...emptyIntensityState,
				kind: 'hrPct',
				hrPctRef: t.ref,
				hrPctMin: String(t.minPct),
				hrPctMax: t.maxPct != null ? String(t.maxPct) : '',
			}
		case 'power':
			return {
				...emptyIntensityState,
				kind: 'power',
				powerMin: String(t.minW),
				powerMax: t.maxW != null ? String(t.maxW) : '',
			}
		case 'powerPct':
			return {
				...emptyIntensityState,
				kind: 'powerPct',
				powerPctMin: String(t.minPct),
				powerPctMax: t.maxPct != null ? String(t.maxPct) : '',
			}
		case 'pace':
			return {
				...emptyIntensityState,
				kind: 'pace',
				paceMin: String(t.minSecPerKm),
				paceMax: t.maxSecPerKm != null ? String(t.maxSecPerKm) : '',
			}
	}
}

function stateToIntensityTarget(
	s: IntensityState,
): IntensityTarget | undefined {
	switch (s.kind) {
		case 'zoneLabel':
			return s.zoneLabel ? { kind: 'zoneLabel', label: s.zoneLabel } : undefined
		case 'rpe': {
			const min = Number(s.rpeMin)
			if (!s.rpeMin || isNaN(min)) return undefined
			return {
				kind: 'rpe',
				min,
				max: s.rpeMax ? Number(s.rpeMax) : undefined,
			}
		}
		case 'hrBpm': {
			const min = Number(s.hrBpmMin)
			if (!s.hrBpmMin || isNaN(min)) return undefined
			return {
				kind: 'hrBpm',
				min,
				max: s.hrBpmMax ? Number(s.hrBpmMax) : undefined,
			}
		}
		case 'hrPct': {
			const minPct = Number(s.hrPctMin)
			if (!s.hrPctMin || isNaN(minPct)) return undefined
			return {
				kind: 'hrPct',
				ref: s.hrPctRef,
				minPct,
				maxPct: s.hrPctMax ? Number(s.hrPctMax) : undefined,
			}
		}
		case 'power': {
			const minW = Number(s.powerMin)
			if (!s.powerMin || isNaN(minW)) return undefined
			return {
				kind: 'power',
				minW,
				maxW: s.powerMax ? Number(s.powerMax) : undefined,
			}
		}
		case 'powerPct': {
			const minPct = Number(s.powerPctMin)
			if (!s.powerPctMin || isNaN(minPct)) return undefined
			return {
				kind: 'powerPct',
				minPct,
				maxPct: s.powerPctMax ? Number(s.powerPctMax) : undefined,
			}
		}
		case 'pace': {
			const minSecPerKm = Number(s.paceMin)
			if (!s.paceMin || isNaN(minSecPerKm)) return undefined
			return {
				kind: 'pace',
				minSecPerKm,
				maxSecPerKm: s.paceMax ? Number(s.paceMax) : undefined,
			}
		}
		default:
			return undefined
	}
}

function formatResolvedRange(
	profile: DisciplineProfileForResolver,
	target: IntensityTarget,
): string | null {
	const resolved = resolveIntensity(target, profile)
	if (resolved.unavailable) return null
	const parts: string[] = []
	if (resolved.hrMin != null) {
		parts.push(
			`HR: ${resolved.hrMin}${resolved.hrMax != null ? `–${resolved.hrMax}` : '+'} bpm`,
		)
	}
	if (resolved.powerMin != null) {
		parts.push(
			`Power: ${resolved.powerMin}${resolved.powerMax != null ? `–${resolved.powerMax}` : '+'} W`,
		)
	}
	if (resolved.paceMin != null) {
		const fmt = (sec: number) => {
			const m = Math.floor(sec / 60)
			const s = sec % 60
			return `${m}:${String(s).padStart(2, '0')}`
		}
		parts.push(
			`Pace: ${fmt(resolved.paceMin)}${resolved.paceMax != null ? `–${fmt(resolved.paceMax)}` : '+'} /km`,
		)
	}
	return parts.length > 0 ? parts.join(' · ') : null
}

function IntensityPickerFields({
	sf,
	disciplineProfile,
	effectiveDiscipline,
}: {
	sf: StepFieldset
	disciplineProfile: DisciplineProfileForResolver | null
	effectiveDiscipline: string
}) {
	const [state, setState] = React.useState<IntensityState>(() => {
		const parsed = parseIntensityTarget(
			sf.intensity.value as string | undefined,
		)
		return parsed ? intensityTargetToState(parsed) : emptyIntensityState
	})

	const target = stateToIntensityTarget(state)
	const hiddenValue = target ? JSON.stringify(target) : ''

	const resolvedLabel =
		target && disciplineProfile
			? formatResolvedRange(disciplineProfile, target)
			: null

	// Zone labels from recipe for current discipline
	const recipe = disciplineProfile?.zoneSystem
		? getRecipe(disciplineProfile.zoneSystem)
		: listRecipesForDiscipline(
				effectiveDiscipline as (typeof CARDIO_DISCIPLINES)[number],
			)[0]

	const intensityKindId = React.useId()
	const hrPctRefId = React.useId()

	function update(patch: Partial<IntensityState>) {
		setState((prev) => ({ ...prev, ...patch }))
	}

	return (
		<div className="space-y-2">
			<label
				htmlFor={intensityKindId}
				className="text-body-2xs text-muted-foreground font-medium"
			>
				Intensity
			</label>

			{/* Hidden field that conform / the form action reads */}
			<input type="hidden" name={sf.intensity.name} value={hiddenValue} />

			<Select
				value={state.kind}
				onValueChange={(value) =>
					setState({
						...emptyIntensityState,
						kind: value as IntensityKind,
					})
				}
			>
				<SelectTrigger id={intensityKindId} className="w-full">
					<SelectValue placeholder="None" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="">None</SelectItem>
					{(
						Object.entries(INTENSITY_KIND_LABELS) as [
							IntensityTarget['kind'],
							string,
						][]
					).map(([k, label]) => (
						<SelectItem key={k} value={k}>
							{label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{state.kind === 'zoneLabel' ? (
				<div>
					{recipe ? (
						<Select
							value={state.zoneLabel}
							onValueChange={(value) => update({ zoneLabel: value as string })}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select zone…" />
							</SelectTrigger>
							<SelectContent>
								{recipe.zones.map((z) => (
									<SelectItem key={z.label} value={z.label}>
										{z.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<Input
							type="text"
							value={state.zoneLabel}
							onChange={(e) => update({ zoneLabel: e.target.value })}
							placeholder="e.g. Z2, threshold"
						/>
					)}
					{recipe ? (
						<p className="text-body-2xs text-muted-foreground mt-1">
							Recipe: {recipe.id}
						</p>
					) : null}
				</div>
			) : state.kind === 'rpe' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Min RPE (1-10)
						</label>
						<Input
							type="number"
							min={1}
							max={10}
							value={state.rpeMin}
							onChange={(e) => update({ rpeMin: e.target.value })}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Max RPE (optional)
						</label>
						<Input
							type="number"
							min={1}
							max={10}
							value={state.rpeMax}
							onChange={(e) => update({ rpeMax: e.target.value })}
							placeholder="—"
						/>
					</div>
				</div>
			) : state.kind === 'hrBpm' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Min HR (bpm)
						</label>
						<Input
							type="number"
							min={40}
							value={state.hrBpmMin}
							onChange={(e) => update({ hrBpmMin: e.target.value })}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Max HR (optional)
						</label>
						<Input
							type="number"
							min={40}
							value={state.hrBpmMax}
							onChange={(e) => update({ hrBpmMax: e.target.value })}
							placeholder="—"
						/>
					</div>
				</div>
			) : state.kind === 'hrPct' ? (
				<div className="space-y-2">
					<div className="space-y-1">
						<label
							htmlFor={hrPctRefId}
							className="text-body-2xs text-muted-foreground"
						>
							Reference
						</label>
						<Select
							value={state.hrPctRef}
							onValueChange={(value) =>
								update({ hrPctRef: value as 'max' | 'lthr' })
							}
						>
							<SelectTrigger id={hrPctRefId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="lthr">LTHR</SelectItem>
								<SelectItem value="max">Max HR</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1">
							<label className="text-body-2xs text-muted-foreground">
								Min %
							</label>
							<Input
								type="number"
								min={1}
								max={200}
								value={state.hrPctMin}
								onChange={(e) => update({ hrPctMin: e.target.value })}
							/>
						</div>
						<div className="space-y-1">
							<label className="text-body-2xs text-muted-foreground">
								Max % (optional)
							</label>
							<Input
								type="number"
								min={1}
								max={200}
								value={state.hrPctMax}
								onChange={(e) => update({ hrPctMax: e.target.value })}
								placeholder="—"
							/>
						</div>
					</div>
				</div>
			) : state.kind === 'power' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Min (W)
						</label>
						<Input
							type="number"
							min={1}
							value={state.powerMin}
							onChange={(e) => update({ powerMin: e.target.value })}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Max W (optional)
						</label>
						<Input
							type="number"
							min={1}
							value={state.powerMax}
							onChange={(e) => update({ powerMax: e.target.value })}
							placeholder="—"
						/>
					</div>
				</div>
			) : state.kind === 'powerPct' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Min %FTP
						</label>
						<Input
							type="number"
							min={1}
							max={300}
							value={state.powerPctMin}
							onChange={(e) => update({ powerPctMin: e.target.value })}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Max %FTP (optional)
						</label>
						<Input
							type="number"
							min={1}
							max={300}
							value={state.powerPctMax}
							onChange={(e) => update({ powerPctMax: e.target.value })}
							placeholder="—"
						/>
					</div>
				</div>
			) : state.kind === 'pace' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Min sec/km
						</label>
						<Input
							type="number"
							min={1}
							value={state.paceMin}
							onChange={(e) => update({ paceMin: e.target.value })}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">
							Max sec/km (optional)
						</label>
						<Input
							type="number"
							min={1}
							value={state.paceMax}
							onChange={(e) => update({ paceMax: e.target.value })}
							placeholder="—"
						/>
					</div>
				</div>
			) : null}

			{resolvedLabel ? (
				<p className="text-body-2xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
					→ {resolvedLabel}
				</p>
			) : null}
		</div>
	)
}

export function CardioStepFields({
	sf,
	disciplineProfiles = [],
	workoutDiscipline = 'run',
}: {
	sf: StepFieldset
	disciplineProfiles?: DisciplineProfileShape[]
	workoutDiscipline?: string
}) {
	const stepDiscipline =
		(sf.discipline.value as string | undefined) || workoutDiscipline
	const profile =
		disciplineProfiles.find((p) => p.discipline === stepDiscipline) ?? null

	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<SelectField
					meta={sf.discipline}
					labelProps={{
						children: 'Discipline',
						className: 'text-body-2xs text-muted-foreground font-medium',
					}}
					items={[
						{ value: '', label: 'Inherit' },
						...CARDIO_DISCIPLINES.map((type) => ({
							value: type,
							label: getDisciplineLabel(type),
						})),
					]}
					errors={sf.discipline.errors as string[] | undefined}
				/>

				<IntensityPickerFields
					sf={sf}
					disciplineProfile={profile}
					effectiveDiscipline={stepDiscipline}
				/>
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
	const muscleId = React.useId()
	const exerciseControl = useInputControl({
		key: sf.exerciseId.key,
		name: sf.exerciseId.name,
		formId: sf.exerciseId.formId,
		initialValue: sf.exerciseId.initialValue,
	})

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
			exerciseControl.change(ex.id)
		}
	}, [createFetcher.data, newMuscle, exerciseControl])

	return (
		<>
			<div className="space-y-1">
				<label
					htmlFor={sf.exerciseId.id}
					className="text-body-2xs text-muted-foreground font-medium"
				>
					Exercise
				</label>
				<Select
					value={exerciseControl.value ?? ''}
					onValueChange={(value) =>
						exerciseControl.change((value as string) ?? '')
					}
				>
					<SelectTrigger
						id={sf.exerciseId.id}
						className="w-full"
						aria-invalid={sf.exerciseId.errors ? true : undefined}
						onFocus={() => exerciseControl.focus()}
						onBlur={() => exerciseControl.blur()}
					>
						<SelectValue placeholder="Select exercise…" />
					</SelectTrigger>
					<SelectContent>
						{exerciseList.map((ex) => (
							<SelectItem key={ex.id} value={ex.id}>
								{ex.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
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
							<label
								htmlFor={muscleId}
								className="text-body-2xs text-muted-foreground font-medium"
							>
								Primary muscle
							</label>
							<Select
								name="primaryMuscle"
								value={newMuscle}
								onValueChange={(value) => setNewMuscle(value as string)}
							>
								<SelectTrigger id={muscleId} className="w-full">
									<SelectValue placeholder="Select…" />
								</SelectTrigger>
								<SelectContent>
									{MUSCLE_GROUPS.map((mg) => (
										<SelectItem key={mg} value={mg}>
											{mg.charAt(0).toUpperCase() +
												mg.slice(1).replace('-', ' ')}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
				{setList.map((setField, setIndex) => (
					<StrengthSetRow
						key={setField.key}
						setField={setField}
						setIndex={setIndex}
						sf={sf}
						form={form}
						canRemove={setList.length > 1}
					/>
				))}
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

function StrengthSetRow({
	setField,
	setIndex,
	sf,
	form,
	canRemove,
}: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	setField: any
	setIndex: number
	sf: StepFieldset
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: any
	canRemove: boolean
}) {
	const setFs = setField.getFieldset()
	const kindId = React.useId()
	const kindControl = useInputControl({
		key: setFs.kind.key,
		name: setFs.kind.name,
		formId: setFs.kind.formId,
		initialValue: setFs.kind.initialValue,
	})
	const setKind = kindControl.value || 'reps'

	return (
		<div className="flex flex-wrap items-end gap-2 rounded border p-2">
			<input
				{...getInputProps(setFs.orderIndex, { type: 'hidden', value: false })}
				value={String(setIndex)}
				readOnly
			/>
			<div className="space-y-1">
				<label
					htmlFor={kindId}
					className="text-body-2xs text-muted-foreground font-medium"
				>
					Kind
				</label>
				<Select
					value={kindControl.value ?? ''}
					onValueChange={(value) => kindControl.change((value as string) ?? '')}
				>
					<SelectTrigger
						id={kindId}
						onFocus={() => kindControl.focus()}
						onBlur={() => kindControl.blur()}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{EXERCISE_SET_KINDS.map((k) => (
							<SelectItem key={k} value={k}>
								{k.charAt(0).toUpperCase() + k.slice(1)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
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
			{canRemove ? (
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
