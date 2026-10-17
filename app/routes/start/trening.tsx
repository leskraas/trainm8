import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useMemo, useState } from 'react'
import { data, Form, redirect } from 'react-router'
import {
	ErrorList,
	RadioGroupField,
	ToggleGroupField,
} from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	readPlanStartWeekKey,
	requireSimpleStartAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	levelDefaults,
	startStrengthPerWeek,
	weekSketch,
	type StrengthPerWeek,
} from '#app/utils/first-run/start-draft.ts'
import {
	ActivitiesStepSchema,
	readStartAnswers,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
import { readStartStrength } from '#app/utils/first-run/start-strength.server.ts'
import {
	FIRST_RUN_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_WEEKDAY_LABELS,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import { patternWeekdaysOf } from '#app/utils/plan-outline/week-pattern.ts'
import {
	CARDIO_DISCIPLINES,
	type CardioDiscipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/trening.ts'
import { QUESTION_LEGEND } from './__first-run-fields.tsx'
import { FirstRunFrame, SIMPLE_START_STEP_COUNT } from './__first-run-frame.tsx'
import { StrengthField } from './__strength-field.tsx'
import { WeekSketch } from './__week-sketch.tsx'

/**
 * The simple start, screen 2 (#558 _Levende start_, #563): _Hva liker du å
 * trene?_ — one modelled endurance sport, the plan's main sport — and the days
 * the athlete can train, as seven buttons with a sentence saying how many were
 * picked. _Uka di_ fills in above as they answer. When they finish, the
 * **Start Options** follow (`/start/valg`, #566); every picked day is kept as
 * their **Training Availability** when the plan is made
 * (`createFirstRunPlan`).
 */

const L = SIMPLE_START_LABELS

export const meta: Route.MetaFunction = () => [
	{ title: `${L.activities.title} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const answers = readStartAnswers(new URL(request.url).searchParams)
	const { level, hours } = answers
	// The level and hours come first; without them, back to where they are
	// asked, with whatever was given.
	if (!level || hours == null) {
		const search = startSearch(answers)
		throw redirect(search ? `/start/niva?${search}` : '/start/niva')
	}
	// _Styrke_ (#574): the session a lifting day copies and the history's
	// frequency the tap is pre-set from. With no session to copy there is no
	// strength to offer.
	const lifting = await readStartStrength(userId)
	return {
		level,
		hours,
		discipline: answers.discipline ?? ('run' as const),
		days: answers.days ?? levelDefaults(level).days,
		startWeekKey: await readPlanStartWeekKey(userId),
		strength: lifting
			? {
					session: lifting.session,
					fromHistory: lifting.fromHistory,
					preset: startStrengthPerWeek(level, lifting.fromHistory),
					picked: answers.strength ?? null,
				}
			: null,
	}
}

export async function action({ request }: Route.ActionArgs) {
	await requireSimpleStartAthlete(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: ActivitiesStepSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	throw redirect(`/start/valg?${startSearch(submission.value)}`)
}

export default function ActivitiesStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { level, hours, startWeekKey } = loaderData
	const [discipline, setDiscipline] = useState<CardioDiscipline>(
		loaderData.discipline,
	)
	const [days, setDays] = useState<string[]>(loaderData.days.map(String))
	const weekdays = useMemo(() => patternWeekdaysOf(days.map(Number)), [days])
	const [strength, setStrength] = useState<StrengthPerWeek | null>(() => {
		const picked = loaderData.strength?.picked
		return picked == null ? null : startStrengthPerWeek(level, picked)
	})
	const lifting = loaderData.strength

	const start = useMemo(
		() =>
			draftStart({
				level,
				discipline,
				hours,
				days: weekdays,
				startWeekKey,
				strength:
					lifting && strength != null
						? { perWeek: strength, session: lifting.session }
						: null,
			}),
		[level, discipline, hours, weekdays, startWeekKey, lifting, strength],
	)
	const sketch = useMemo(() => weekSketch(start), [start])

	const [form, fields] = useForm({
		id: 'simple-start-activities',
		constraint: getZodConstraint(ActivitiesStepSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ActivitiesStepSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	// Back keeps every answer, the ones on this screen too.
	const back = `/start/niva?${startSearch({
		level,
		hours,
		discipline,
		days: weekdays,
		strength: strength ?? undefined,
	})}`
	const { sessionCap } = levelDefaults(level)

	return (
		<FirstRunFrame
			step={2}
			stepCount={SIMPLE_START_STEP_COUNT}
			title={L.activities.title}
			back={{ to: back, label: L.backTo.level }}
		>
			<WeekSketch sketch={sketch} discipline={discipline} />
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<input type="hidden" name={fields.level.name} value={level} />
				<input type="hidden" name={fields.hours.name} value={hours} />

				<RadioGroupField
					name={fields.discipline.name}
					legend={L.activities.sport}
					legendClassName={QUESTION_LEGEND}
					value={discipline}
					onValueChange={(next) => {
						const picked = CARDIO_DISCIPLINES.find((value) => value === next)
						if (picked) setDiscipline(picked)
					}}
					options={CARDIO_DISCIPLINES.map((value) => ({
						value,
						label: NB_DISCIPLINE_LABELS[value],
					}))}
					errorId={fields.discipline.errorId}
					errors={fields.discipline.errors}
				/>

				{lifting ? (
					<StrengthField
						name={fields.strength.name}
						value={strength}
						preset={lifting.preset}
						fromHistory={lifting.fromHistory}
						onValueChange={setStrength}
						errorId={fields.strength.errorId}
						errors={fields.strength.errors}
					/>
				) : null}

				<div className="space-y-2">
					<ToggleGroupField
						name={fields.days.name}
						legend={L.activities.days}
						legendClassName={QUESTION_LEGEND}
						options={NB_WEEKDAY_LABELS.map((label, weekday) => ({
							value: String(weekday),
							label: FIRST_RUN_LABELS.dayShort[weekday]!,
							ariaLabel: label,
						}))}
						defaultValue={loaderData.days.map(String)}
						value={days}
						onValueChange={setDays}
						errorId={fields.days.errorId}
						errors={fields.days.errors}
					/>
					<div
						aria-live="polite"
						className="text-footnote text-muted-foreground space-y-1 tabular-nums"
						data-start-days-note
					>
						<p>{L.activities.daysPicked(weekdays.length)}</p>
						{start?.capped ? (
							<p data-start-days-capped>
								{L.activities.beginnerCap(sessionCap)}
							</p>
						) : start?.restDayKept ? (
							<p data-start-days-rest>{L.activities.restDay}</p>
						) : null}
					</div>
				</div>

				<ErrorList errors={form.errors} id={form.errorId} />
				{/* In the thumb's reach while the answers scroll under it. */}
				<div className="bg-background sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<Button type="submit" className="text-callout w-full">
						{L.activities.next}
					</Button>
				</div>
			</Form>
		</FirstRunFrame>
	)
}
