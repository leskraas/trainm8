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

export const STEP_SELECT_CLASS =
	'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'

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

function parseIntensityTarget(json: string | undefined): IntensityTarget | undefined {
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

function stateToIntensityTarget(s: IntensityState): IntensityTarget | undefined {
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

function formatResolvedRange(profile: DisciplineProfileForResolver, target: IntensityTarget): string | null {
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
		const parsed = parseIntensityTarget(sf.intensity.value as string | undefined)
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

	function update(patch: Partial<IntensityState>) {
		setState((prev) => ({ ...prev, ...patch }))
	}

	return (
		<div className="space-y-2">
			<label className="text-body-2xs text-muted-foreground font-medium">
				Intensity
			</label>

			{/* Hidden field that conform / the form action reads */}
			<input type="hidden" name={sf.intensity.name} value={hiddenValue} />

			<select
				value={state.kind}
				onChange={(e) =>
					setState({ ...emptyIntensityState, kind: e.target.value as IntensityKind })
				}
				className={STEP_SELECT_CLASS}
			>
				<option value="">None</option>
				{(Object.entries(INTENSITY_KIND_LABELS) as [IntensityTarget['kind'], string][]).map(
					([k, label]) => (
						<option key={k} value={k}>
							{label}
						</option>
					),
				)}
			</select>

			{state.kind === 'zoneLabel' ? (
				<div>
					{recipe ? (
						<select
							value={state.zoneLabel}
							onChange={(e) => update({ zoneLabel: e.target.value })}
							className={STEP_SELECT_CLASS}
						>
							<option value="">Select zone…</option>
							{recipe.zones.map((z) => (
								<option key={z.label} value={z.label}>
									{z.label}
								</option>
							))}
						</select>
					) : (
						<input
							type="text"
							value={state.zoneLabel}
							onChange={(e) => update({ zoneLabel: e.target.value })}
							placeholder="e.g. Z2, threshold"
							className={STEP_SELECT_CLASS}
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
						<label className="text-body-2xs text-muted-foreground">Min RPE (1-10)</label>
						<input
							type="number"
							min={1}
							max={10}
							value={state.rpeMin}
							onChange={(e) => update({ rpeMin: e.target.value })}
							className={STEP_SELECT_CLASS}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Max RPE (optional)</label>
						<input
							type="number"
							min={1}
							max={10}
							value={state.rpeMax}
							onChange={(e) => update({ rpeMax: e.target.value })}
							placeholder="—"
							className={STEP_SELECT_CLASS}
						/>
					</div>
				</div>
			) : state.kind === 'hrBpm' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Min HR (bpm)</label>
						<input
							type="number"
							min={40}
							value={state.hrBpmMin}
							onChange={(e) => update({ hrBpmMin: e.target.value })}
							className={STEP_SELECT_CLASS}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Max HR (optional)</label>
						<input
							type="number"
							min={40}
							value={state.hrBpmMax}
							onChange={(e) => update({ hrBpmMax: e.target.value })}
							placeholder="—"
							className={STEP_SELECT_CLASS}
						/>
					</div>
				</div>
			) : state.kind === 'hrPct' ? (
				<div className="space-y-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Reference</label>
						<select
							value={state.hrPctRef}
							onChange={(e) =>
								update({ hrPctRef: e.target.value as 'max' | 'lthr' })
							}
							className={STEP_SELECT_CLASS}
						>
							<option value="lthr">LTHR</option>
							<option value="max">Max HR</option>
						</select>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1">
							<label className="text-body-2xs text-muted-foreground">Min %</label>
							<input
								type="number"
								min={1}
								max={200}
								value={state.hrPctMin}
								onChange={(e) => update({ hrPctMin: e.target.value })}
								className={STEP_SELECT_CLASS}
							/>
						</div>
						<div className="space-y-1">
							<label className="text-body-2xs text-muted-foreground">Max % (optional)</label>
							<input
								type="number"
								min={1}
								max={200}
								value={state.hrPctMax}
								onChange={(e) => update({ hrPctMax: e.target.value })}
								placeholder="—"
								className={STEP_SELECT_CLASS}
							/>
						</div>
					</div>
				</div>
			) : state.kind === 'power' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Min (W)</label>
						<input
							type="number"
							min={1}
							value={state.powerMin}
							onChange={(e) => update({ powerMin: e.target.value })}
							className={STEP_SELECT_CLASS}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Max W (optional)</label>
						<input
							type="number"
							min={1}
							value={state.powerMax}
							onChange={(e) => update({ powerMax: e.target.value })}
							placeholder="—"
							className={STEP_SELECT_CLASS}
						/>
					</div>
				</div>
			) : state.kind === 'powerPct' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Min %FTP</label>
						<input
							type="number"
							min={1}
							max={300}
							value={state.powerPctMin}
							onChange={(e) => update({ powerPctMin: e.target.value })}
							className={STEP_SELECT_CLASS}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Max %FTP (optional)</label>
						<input
							type="number"
							min={1}
							max={300}
							value={state.powerPctMax}
							onChange={(e) => update({ powerPctMax: e.target.value })}
							placeholder="—"
							className={STEP_SELECT_CLASS}
						/>
					</div>
				</div>
			) : state.kind === 'pace' ? (
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Min sec/km</label>
						<input
							type="number"
							min={1}
							value={state.paceMin}
							onChange={(e) => update({ paceMin: e.target.value })}
							className={STEP_SELECT_CLASS}
						/>
					</div>
					<div className="space-y-1">
						<label className="text-body-2xs text-muted-foreground">Max sec/km (optional)</label>
						<input
							type="number"
							min={1}
							value={state.paceMax}
							onChange={(e) => update({ paceMax: e.target.value })}
							placeholder="—"
							className={STEP_SELECT_CLASS}
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
	const stepDiscipline = (sf.discipline.value as string | undefined) || workoutDiscipline
	const profile = disciplineProfiles.find((p) => p.discipline === stepDiscipline) ?? null

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
