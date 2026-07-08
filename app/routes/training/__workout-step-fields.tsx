import { getInputProps, useInputControl } from '@conform-to/react'
import React from 'react'
import {
	ErrorList,
	Field,
	SelectField,
	TextareaField,
} from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { emptySet } from '#app/utils/workout-authoring.ts'
import {
	CARDIO_DISCIPLINES,
	EXERCISE_SET_KINDS,
	type StepKind,
} from '#app/utils/workout-schema.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/index.ts'
import { ExerciseCombobox, type ExerciseItem } from './__exercise-combobox.tsx'
import { IntensityEditor } from './__intensity-editor.tsx'

type StepFieldset = any

export const STEP_KIND_LABELS: Record<StepKind, string> = {
	cardio: 'Cardio',
	strength: 'Strength',
	rest: 'Rest',
}

// The form Zod schema and the form → Step/Block mapper live in the UI-free
// workout-authoring module. Re-export the pieces existing consumers
// (sessions.new, upcoming.$sessionId.edit) read from this form file so they
// keep a single import site for both the UI fields and the mapper.
export {
	buildBlocksInput,
	buildStepInput,
	emptyBlock,
	emptyStep,
	FormSchema,
} from '#app/utils/workout-authoring.ts'

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

export { type ExerciseItem } from './__exercise-combobox.tsx'

// ——— Intensity picker ——————————————————————————————————————————————
//
// The per-kind IntensityTarget inputs live in the shared `IntensityEditor`
// (ADR 0027, slice 5/9), bound here to the step's intensity field through
// Conform. This replaces the old out-of-Conform pattern (ad-hoc `useState`
// mirrored to a hidden JSON input): the editor serializes the IntensityTarget
// JSON the server already accepts, and an incomplete draft surfaces as a
// Conform validation error instead of being silently dropped. The same editor
// backs the Token Sentence's intensity popover, so both surfaces stay in sync.

function IntensityPickerFields({
	sf,
	disciplineProfile,
	effectiveDiscipline,
}: {
	sf: StepFieldset
	disciplineProfile: DisciplineProfileForResolver | null
	effectiveDiscipline: string
}) {
	const control = useInputControl(sf.intensity)
	return (
		<IntensityEditor
			value={typeof control.value === 'string' ? control.value : ''}
			onChange={(serialized) => control.change(serialized)}
			profile={disciplineProfile}
			effectiveDiscipline={effectiveDiscipline}
		/>
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
					labelProps={{ children: 'Duration' }}
					inputProps={{
						...getInputProps(sf.duration, { type: 'text' }),
						placeholder: 'e.g. 10 min',
					}}
					errors={sf.duration.errors as string[] | undefined}
				/>
				<Field
					labelProps={{ children: 'Distance' }}
					inputProps={{
						...getInputProps(sf.distance, { type: 'text' }),
						placeholder: 'e.g. 400 m or 1.2 km',
					}}
					errors={sf.distance.errors as string[] | undefined}
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
	recentExerciseIds = [],
	setList,
	form,
}: {
	sf: StepFieldset
	exercises: ExerciseItem[]
	recentExerciseIds?: string[]

	setList: any[]

	form: any
}) {
	const exerciseControl = useInputControl({
		key: sf.exerciseId.key,
		name: sf.exerciseId.name,
		formId: sf.exerciseId.formId,
		initialValue: sf.exerciseId.initialValue,
	})

	return (
		<>
			<div className="space-y-1">
				<label
					htmlFor={sf.exerciseId.id}
					className="text-body-2xs text-muted-foreground font-medium"
				>
					Exercise
				</label>
				<ExerciseCombobox
					id={sf.exerciseId.id}
					exercises={exercises}
					recentExerciseIds={recentExerciseIds}
					value={exerciseControl.value ?? ''}
					onChange={(exerciseId) => exerciseControl.change(exerciseId)}
					invalid={sf.exerciseId.errors ? true : undefined}
					onFocus={() => exerciseControl.focus()}
					onBlur={() => exerciseControl.blur()}
				/>
				<ErrorList errors={sf.exerciseId.errors as string[] | undefined} />
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
					type="submit"
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
	setField: any
	setIndex: number
	sf: StepFieldset

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
					type="submit"
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
				labelProps={{ children: 'Duration' }}
				inputProps={{
					...getInputProps(sf.duration, { type: 'text' }),
					placeholder: 'e.g. 90 s or 2 min',
				}}
				errors={sf.duration.errors as string[] | undefined}
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
