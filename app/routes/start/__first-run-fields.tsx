import { RadioGroupField, ToggleGroupField } from '#app/components/forms.tsx'
import {
	FIRST_RUN_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_WEEKDAY_LABELS,
} from '#app/utils/labels.ts'
import { CARDIO_DISCIPLINES } from '#app/utils/workout-schema.ts'

/** What a field needs from conform's metadata: its name and its errors. */
type FieldMeta = { name: string; errorId: string; errors?: string[] }

/** A legend that reads as one of the three questions, not a field label. */
export const QUESTION_LEGEND = 'text-heading'

/**
 * The days the first run asks for, as a row of seven pills (Arket J3) —
 * Monday first, the Training Week's own order and the Week Pattern's
 * (0 = mandag). Each pill says `ma`…`sø` and is read out by its full name;
 * the pressed ones post as `days`, as the checkboxes they replace did.
 */
export function DaysField({
	meta,
	legend,
	defaultDays,
	note,
	asQuestion = false,
}: {
	meta: FieldMeta
	legend: string
	defaultDays: readonly number[]
	note?: string
	/** Read as one of the three questions, headed like the other two. */
	asQuestion?: boolean
}) {
	return (
		<ToggleGroupField
			name={meta.name}
			legend={legend}
			legendClassName={asQuestion ? QUESTION_LEGEND : 'text-callout'}
			note={note}
			options={NB_WEEKDAY_LABELS.map((label, weekday) => ({
				value: String(weekday),
				label: FIRST_RUN_LABELS.dayShort[weekday]!,
				ariaLabel: label,
			}))}
			defaultValue={defaultDays.map(String)}
			errorId={meta.errorId}
			errors={meta.errors}
		/>
	)
}

/** Which endurance sport the plan is for, as choice cards. */
export function DisciplineField({
	meta,
	legend,
	defaultDiscipline,
}: {
	meta: FieldMeta
	legend: string
	defaultDiscipline: string
}) {
	return (
		<RadioGroupField
			name={meta.name}
			legend={legend}
			legendClassName="text-callout"
			options={CARDIO_DISCIPLINES.map((discipline) => ({
				value: discipline,
				label: NB_DISCIPLINE_LABELS[discipline],
			}))}
			defaultValue={defaultDiscipline}
			errorId={meta.errorId}
			errors={meta.errors}
		/>
	)
}
