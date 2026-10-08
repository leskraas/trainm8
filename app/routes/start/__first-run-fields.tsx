import { type FieldMetadata } from '@conform-to/react'
import { ErrorList } from '#app/components/forms.tsx'
import { NB_DISCIPLINE_LABELS, NB_WEEKDAY_LABELS } from '#app/utils/labels.ts'
import { CARDIO_DISCIPLINES } from '#app/utils/workout-schema.ts'

/**
 * The weekday checkboxes the first run asks its days with — Monday first, the
 * Training Week's own order, and the Week Pattern's (0 = mandag).
 */
export function DaysField({
	meta,
	legend,
	defaultDays,
	note,
	asQuestion = false,
}: {
	meta: FieldMetadata<number[] | undefined>
	legend: string
	defaultDays: readonly number[]
	note?: string
	/** Read as one of the three questions, headed like the other two. */
	asQuestion?: boolean
}) {
	return (
		<fieldset className="space-y-2" aria-describedby={meta.errorId}>
			<legend
				className={
					asQuestion ? 'text-base font-semibold' : 'text-sm font-medium'
				}
			>
				{legend}
			</legend>
			{note ? (
				<p className="text-muted-foreground text-[13px]">{note}</p>
			) : null}
			<div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
				{NB_WEEKDAY_LABELS.map((label, weekday) => (
					<label
						key={label}
						className="flex min-h-11 cursor-pointer items-center gap-2"
					>
						<input
							type="checkbox"
							name={meta.name}
							value={weekday}
							defaultChecked={defaultDays.includes(weekday)}
							className="size-5"
						/>
						<span className="text-[15px] capitalize">{label}</span>
					</label>
				))}
			</div>
			<ErrorList id={meta.errorId} errors={meta.errors} />
		</fieldset>
	)
}

/** Which endurance sport the plan is for, as radios. */
export function DisciplineField({
	meta,
	legend,
	defaultDiscipline,
}: {
	meta: FieldMetadata<string | undefined>
	legend: string
	defaultDiscipline: string
}) {
	return (
		<fieldset className="space-y-1.5" aria-describedby={meta.errorId}>
			<legend className="text-sm font-medium">{legend}</legend>
			<div className="flex flex-wrap gap-x-4">
				{CARDIO_DISCIPLINES.map((discipline) => (
					<label
						key={discipline}
						className="flex min-h-11 cursor-pointer items-center gap-2"
					>
						<input
							type="radio"
							name={meta.name}
							value={discipline}
							defaultChecked={discipline === defaultDiscipline}
							className="size-5"
						/>
						<span className="text-[15px]">
							{NB_DISCIPLINE_LABELS[discipline]}
						</span>
					</label>
				))}
			</div>
			<ErrorList id={meta.errorId} errors={meta.errors} />
		</fieldset>
	)
}
