import { getInputProps, useInputControl } from '@conform-to/react'
import {
	ErrorList,
	Field,
	SelectField,
	TextareaField,
} from '#app/components/forms.tsx'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { CARDIO_DISCIPLINES, type StepKind } from '#app/utils/workout-schema.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/index.ts'
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
		<>
			{/* The field's real in-form carrier (the detail editor's HiddenField
			    pattern). Without it every `useInputControl` on this field — here
			    and in the sentence's intensity popover — shares one auto-created
			    dummy carrier, and the popover's unmount cleanup sweeps ALL dummies
			    for the name, silently dropping the value from the next submit. */}
			<input
				{...getInputProps(sf.intensity, { type: 'text' })}
				className="sr-only"
				tabIndex={-1}
				aria-hidden
			/>
			<IntensityEditor
				value={typeof control.value === 'string' ? control.value : ''}
				onChange={(serialized) => control.change(serialized)}
				profile={disciplineProfile}
				effectiveDiscipline={effectiveDiscipline}
			/>
		</>
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
			{/* The field's real in-form carrier (the detail editor's HiddenField
			    pattern, as for intensity below): `SelectField` renders no input of
			    its own, and the Token Sentence's discipline select binds the same
			    field through a second `useInputControl` — without one real element
			    for both to register, each instance owns a conform dummy select
			    whose mount/unmount races can revert the other's write. */}
			<input
				{...getInputProps(sf.discipline, { type: 'text' })}
				className="sr-only"
				tabIndex={-1}
				aria-hidden
			/>
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

/**
 * The strength step's non-set fields. The exercise picker and the full set
 * list are authored through the Token Sentence now (ADR 0027 slice 9/9 — the
 * `exercise` and `sets` token popovers in `__token-sentence-editor.tsx`), so
 * the cramped fixed-width set-row inputs that used to live here are gone. Only
 * rest-between-sets (also surfaced as the sentence's rest facet) and notes
 * keep a classic field, so both stay addable when a fresh step has neither.
 */
export function StrengthStepFields({ sf }: { sf: StepFieldset }) {
	// Rest-between-sets is a controlled input bound through `useInputControl`
	// (like the intensity picker), not `getInputProps`: the sentence's rest
	// facet edits the same field, and an uncontrolled input silently reverts a
	// programmatic write from the facet's stepper. The control's shadow carrier
	// submits the value.
	const rest = useInputControl(sf.restBetweenSetsSec)
	// Display the live field value, not the control's own state — the sentence's
	// rest facet edits the same field through a separate control, and reading the
	// field keeps both surfaces in agreement (`value` falls back to the seed in
	// `initialValue` while the field is pristine).
	const restValue =
		typeof sf.restBetweenSetsSec.value === 'string'
			? sf.restBetweenSetsSec.value
			: typeof sf.restBetweenSetsSec.initialValue === 'string'
				? sf.restBetweenSetsSec.initialValue
				: ''
	return (
		<>
			<div className="space-y-1">
				<label
					htmlFor={sf.restBetweenSetsSec.id}
					className="text-body-2xs text-muted-foreground font-medium"
				>
					Rest between sets (seconds)
				</label>
				<input
					id={sf.restBetweenSetsSec.id}
					type="number"
					min={1}
					placeholder="e.g. 90"
					value={restValue}
					onChange={(event) => rest.change(event.target.value)}
					onFocus={() => rest.focus()}
					onBlur={() => rest.blur()}
					className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
				/>
				<ErrorList
					errors={sf.restBetweenSetsSec.errors as string[] | undefined}
				/>
			</div>

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
