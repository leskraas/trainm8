import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useMemo, useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { ErrorList, ToggleGroupField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	readPlanStartWeekKey,
	requireSimpleStartAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	levelDefaults,
	startSports,
	weekSketch,
} from '#app/utils/first-run/start-draft.ts'
import {
	ActivitiesStepSchema,
	otherSportsOf,
	readStartAnswers,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
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
import { WeekSketch } from './__week-sketch.tsx'

/**
 * The simple start, screen 2 (#558 _Levende start_, #563): _Hva liker du å
 * trene?_ — the modelled endurance sports, the first picked the plan's main
 * sport (_Hovedidrett_, #573), which a tap on its line hands to the next — and
 * the days
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
		discipline: answers.discipline ?? ('run' as const),
		otherSports: answers.otherSports ?? [],
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
	const { sports, ...answers } = submission.value
	throw redirect(
		`/start/valg?${startSearch({
			...answers,
			otherSports: otherSportsOf(answers.discipline, sports),
		})}`,
	)
}

export default function ActivitiesStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { level, hours, startWeekKey } = loaderData
	// Every sport picked, in the order picked: the first is the main sport.
	const [picked, setPicked] = useState<CardioDiscipline[]>(() =>
		startSports(loaderData.discipline, loaderData.otherSports),
	)
	const main = picked[0] ?? null
	// The others in the fixed order the server reads them in, so the week
	// shown here is the week the plan is made from.
	const otherSports = useMemo(
		() => (main ? otherSportsOf(main, picked) : []),
		[main, picked],
	)
	const discipline = main ?? loaderData.discipline
	const [days, setDays] = useState<string[]>(loaderData.days.map(String))
	const weekdays = useMemo(() => patternWeekdaysOf(days.map(Number)), [days])

	const start = useMemo(
		() =>
			main
				? draftStart({
						level,
						discipline: main,
						otherSports,
						hours,
						days: weekdays,
						startWeekKey,
					})
				: null,
		[level, main, otherSports, hours, weekdays, startWeekKey],
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
		otherSports,
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
			<WeekSketch sketch={sketch} discipline={discipline} />
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<input type="hidden" name={fields.level.name} value={level} />
				<input type="hidden" name={fields.hours.name} value={hours} />

				<div className="space-y-1">
					<ToggleGroupField
						name={fields.sports.name}
						legend={L.activities.sports}
						legendClassName={QUESTION_LEGEND}
						note={L.activities.sportsHelp}
						options={CARDIO_DISCIPLINES.map((value) => ({
							value,
							label: NB_DISCIPLINE_LABELS[value],
						}))}
						defaultValue={picked}
						value={picked}
						onValueChange={(next) =>
							// Kept in the order picked: an unpicked sport goes, a new one
							// joins at the end, so the first picked stays the main sport.
							setPicked((before) => [
								...before.filter((sport) => next.includes(sport)),
								...CARDIO_DISCIPLINES.filter(
									(sport) => next.includes(sport) && !before.includes(sport),
								),
							])
						}
						errorId={fields.discipline.errorId}
						errors={fields.discipline.errors}
					/>
					<input
						type="hidden"
						name={fields.discipline.name}
						value={main ?? ''}
					/>
					<div aria-live="polite" className="min-h-11" data-start-main-sport>
						{main && picked.length > 1 ? (
							<Button
								type="button"
								variant="ghost"
								aria-label={L.activities.switchMainSport(
									NB_DISCIPLINE_LABELS[main],
									NB_DISCIPLINE_LABELS[picked[1]!],
								)}
								onClick={() =>
									// The main sport hands over to the next one picked.
									setPicked((before) => [...before.slice(1), before[0]!])
								}
								className="text-footnote -mx-3 max-w-full gap-2"
							>
								<span className="text-muted-foreground truncate">
									{L.activities.mainSportLead}{' '}
									<span className="text-foreground font-semibold">
										{NB_DISCIPLINE_LABELS[main]}
									</span>
								</span>
								<span className="text-primary">{L.activities.switchHint}</span>
							</Button>
						) : main ? (
							<p className="text-footnote text-muted-foreground flex min-h-11 items-center">
								<span>
									{L.activities.mainSportLead}{' '}
									<span className="text-foreground font-semibold">
										{NB_DISCIPLINE_LABELS[main]}
									</span>
								</span>
							</p>
						) : null}
					</div>
				</div>

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
