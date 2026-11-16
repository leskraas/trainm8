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
	startStrengthPerWeek,
	startSports,
	weekSketch,
	type StrengthPerWeek,
} from '#app/utils/first-run/start-draft.ts'
import {
	ActivitiesStepSchema,
	otherSportsOf,
	readStartAnswers,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
import { readStartStrength } from '#app/utils/first-run/start-strength.server.ts'
import {
	FIRST_RUN_LABELS,
	NB_WEEKDAY_LABELS,
	SIMPLE_START_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from '#app/utils/labels.ts'
import { patternWeekdaysOf } from '#app/utils/plan-outline/week-pattern.ts'
import { CARDIO_DISCIPLINES } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/trening.ts'
import {
	ActivityChips,
	MainSportLine,
	pressActivities,
	pressedOf,
	type ActivityPicks,
} from './__activity-chips.tsx'
import { QUESTION_LEGEND } from './__first-run-fields.tsx'
import { FirstRunFrame, SIMPLE_START_STEP_COUNT } from './__first-run-frame.tsx'
import { StrengthField } from './__strength-field.tsx'
import { WeekSketch } from './__week-sketch.tsx'

/**
 * The simple start, screen 2 (#558 _Levende start_, #563): _Hva liker du å
 * trene?_ — one list (#584) of the modelled endurance sports, the Simple
 * Activities and _Styrke_, each with its mark; the first sport picked is the
 * plan's main sport (_Hovedidrett_, #573), which a tap on its line hands to
 * the next — and the days
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
		// Back from the cards with only Simple Activities picked, no sport.
		discipline:
			answers.discipline ?? (answers.activities ? null : ('run' as const)),
		otherSports: answers.otherSports ?? [],
		activities: answers.activities ?? [],
		days: answers.days ?? levelDefaults(level).days,
		preferences: answers.preferences ?? [],
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
	const { sports, ...answers } = submission.value
	throw redirect(
		`/start/okter?${startSearch({
			...answers,
			otherSports: answers.discipline
				? otherSportsOf(answers.discipline, sports)
				: undefined,
		})}`,
	)
}

export default function ActivitiesStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { level, hours, startWeekKey } = loaderData
	// Every sport picked, in the order picked: the first is the main sport;
	// the Simple Activities likewise, and Styrke at its frequency.
	const lifting = loaderData.strength
	const [picks, setPicks] = useState<ActivityPicks>(() => {
		const picked = lifting?.picked
		return {
			sports: loaderData.discipline
				? startSports(loaderData.discipline, loaderData.otherSports)
				: [],
			activities: loaderData.activities,
			strength: picked == null ? null : startStrengthPerWeek(level, picked),
		}
	})
	const picked = picks.sports
	const activities = picks.activities
	const strength = picks.strength as StrengthPerWeek | null
	const main = picked[0] ?? null
	// The others in the fixed order the server reads them in, so the week
	// shown here is the week the plan is made from.
	const otherSports = useMemo(
		() => (main ? otherSportsOf(main, picked) : []),
		[main, picked],
	)
	const [days, setDays] = useState<string[]>(loaderData.days.map(String))
	const weekdays = useMemo(() => patternWeekdaysOf(days.map(Number)), [days])

	const start = useMemo(
		() =>
			draftStart({
				level,
				discipline: main,
				otherSports,
				activities,
				hours,
				days: weekdays,
				startWeekKey,
				strength:
					lifting && strength != null
						? { perWeek: strength, session: lifting.session }
						: null,
			}),
		[
			level,
			main,
			otherSports,
			activities,
			hours,
			weekdays,
			startWeekKey,
			lifting,
			strength,
		],
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
		discipline: main ?? undefined,
		otherSports,
		activities,
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
			<WeekSketch sketch={sketch} />
			<Form
				method="POST"
				className="space-y-8"
				// _Uka di_ stays with the athlete to the next screen (#582).
				viewTransition
				{...getFormProps(form)}
			>
				<input type="hidden" name={fields.level.name} value={level} />
				<input type="hidden" name={fields.hours.name} value={hours} />
				{/* Back from the preferences, they ride along (#571). */}
				{loaderData.preferences.map((preference) => (
					<input
						key={preference}
						type="hidden"
						name={fields.preferences.name}
						value={preference}
					/>
				))}

				<fieldset
					className="space-y-2"
					data-start-activities
					aria-describedby={
						fields.discipline.errors?.length
							? fields.discipline.errorId
							: undefined
					}
				>
					<legend className="sr-only">{L.activities.list}</legend>
					<p className="text-footnote text-muted-foreground">
						{L.activities.listHelp}
					</p>
					<ActivityChips
						pressed={pressedOf(picks)}
						onPressedChange={(next) =>
							setPicks((before) =>
								pressActivities(before, next, lifting?.preset ?? null),
							)
						}
						withStrength={lifting != null}
						invalid={Boolean(fields.discipline.errors?.length)}
					/>
					{CARDIO_DISCIPLINES.filter((sport) => picked.includes(sport)).map(
						(sport) => (
							<input
								key={sport}
								type="hidden"
								name={fields.sports.name}
								value={sport}
							/>
						),
					)}
					<input
						type="hidden"
						name={fields.discipline.name}
						value={main ?? ''}
					/>
					{activities.map((kind) => (
						<input key={kind} type="hidden" name="activities" value={kind} />
					))}
					<ErrorList
						id={fields.discipline.errorId}
						errors={fields.discipline.errors}
					/>
					<MainSportLine
						sports={picked}
						onSwitch={() =>
							// The main sport hands over to the next one picked.
							setPicks((before) => ({
								...before,
								sports: [...before.sports.slice(1), before.sports[0]!],
							}))
						}
					/>
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
				{lifting ? (
					<StrengthField
						name={fields.strength.name}
						value={strength}
						fromHistory={lifting.fromHistory}
						onValueChange={(next) =>
							setPicks((before) => ({ ...before, strength: next }))
						}
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
