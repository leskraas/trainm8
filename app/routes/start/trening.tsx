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
	ToggleGroup,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import {
	readPlanStartWeekKey,
	requireSimpleStartAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	levelDefaults,
	weekSketch,
} from '#app/utils/first-run/start-draft.ts'
import {
	ActivitiesStepSchema,
	readStartAnswers,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
import {
	FIRST_RUN_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_WEEKDAY_LABELS,
	SIMPLE_ACTIVITY_LABELS,
	SIMPLE_START_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from '#app/utils/labels.ts'
import { patternWeekdaysOf } from '#app/utils/plan-outline/week-pattern.ts'
import {
	ACTIVITY_KINDS,
	type ActivityKind,
} from '#app/utils/simple-activity.ts'
import {
	CARDIO_DISCIPLINES,
	type CardioDiscipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/trening.ts'
import { QUESTION_LEGEND } from './__first-run-fields.tsx'
import { FirstRunFrame, SIMPLE_START_STEP_COUNT } from './__first-run-frame.tsx'
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
	return {
		level,
		hours,
		// Back from the cards with only Simple Activities picked, no sport.
		discipline:
			answers.discipline ?? (answers.activities ? null : ('run' as const)),
		activities: answers.activities ?? [],
		days: answers.days ?? levelDefaults(level).days,
		startWeekKey: await readPlanStartWeekKey(userId),
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
	const [discipline, setDiscipline] = useState<CardioDiscipline | null>(
		loaderData.discipline,
	)
	const [activities, setActivities] = useState<ActivityKind[]>(
		loaderData.activities,
	)
	const [days, setDays] = useState<string[]>(loaderData.days.map(String))
	const weekdays = useMemo(() => patternWeekdaysOf(days.map(Number)), [days])

	const start = useMemo(
		() =>
			draftStart({
				level,
				discipline,
				activities,
				hours,
				days: weekdays,
				startWeekKey,
			}),
		[level, discipline, activities, hours, weekdays, startWeekKey],
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
		discipline: discipline ?? undefined,
		activities,
		days: weekdays,
	})}`
	const { sessionCap } = levelDefaults(level)

	return (
		<FirstRunFrame
			step={2}
			stepCount={SIMPLE_START_STEP_COUNT}
			title={L.activities.title}
			back={{ to: back, label: L.backTo.level }}
		>
			<WeekSketch sketch={sketch} />
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<input type="hidden" name={fields.level.name} value={level} />
				<input type="hidden" name={fields.hours.name} value={hours} />

				<RadioGroupField
					name={fields.discipline.name}
					legend={L.activities.sport}
					legendClassName={QUESTION_LEGEND}
					value={discipline ?? ''}
					onValueChange={(next) => {
						setDiscipline(
							CARDIO_DISCIPLINES.find((value) => value === next) ?? null,
						)
					}}
					options={[
						...CARDIO_DISCIPLINES.map((value) => ({
							value,
							label: NB_DISCIPLINE_LABELS[value],
						})),
						// Only Simple Activities: one simple week (#572).
						{ value: '', label: START_SIMPLE_ACTIVITY_LABELS.noSport },
					]}
					errorId={fields.discipline.errorId}
					errors={fields.discipline.errors}
				/>

				<fieldset className="space-y-2" data-start-activities>
					<legend className={QUESTION_LEGEND}>
						{START_SIMPLE_ACTIVITY_LABELS.legend}
					</legend>
					<p className="text-footnote text-muted-foreground">
						{START_SIMPLE_ACTIVITY_LABELS.help}
					</p>
					<ToggleGroup
						multiple
						variant="outline"
						spacing={2}
						value={activities}
						onValueChange={(next) => {
							const pressed = next as string[]
							// Kept in the order picked: the first goes in first when the
							// week has no room for all.
							setActivities([
								...activities.filter((kind) => pressed.includes(kind)),
								...ACTIVITY_KINDS.filter(
									(kind) =>
										pressed.includes(kind) && !activities.includes(kind),
								),
							])
						}}
						className="w-full flex-wrap"
					>
						{ACTIVITY_KINDS.map((kind) => (
							<ToggleGroupItem
								key={kind}
								value={kind}
								className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground text-callout h-11 max-w-full rounded-full px-4"
							>
								{SIMPLE_ACTIVITY_LABELS.kind[kind]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					{activities.map((kind) => (
						<input key={kind} type="hidden" name="activities" value={kind} />
					))}
					<div
						aria-live="polite"
						className="text-footnote text-muted-foreground"
					>
						{start?.simpleOnly ? (
							<p data-start-simple-only>
								{START_SIMPLE_ACTIVITY_LABELS.simpleOnly}
							</p>
						) : null}
					</div>
				</fieldset>

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
