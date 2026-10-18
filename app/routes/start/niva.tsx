import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useMemo, useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { ErrorList, RadioGroupField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	readPlanStartWeekKey,
	requireSimpleStartAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	levelDefaults,
	MAX_START_HOURS,
	MIN_START_HOURS,
	START_HOURS_STEP,
	TRAINING_LEVELS,
	weekSketch,
	type TrainingLevel,
} from '#app/utils/first-run/start-draft.ts'
import {
	LevelStepSchema,
	otherSportsOf,
	readStartAnswers,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
import { nbHoursWords, SIMPLE_START_LABELS } from '#app/utils/labels.ts'
import { type Route } from './+types/niva.ts'
import { QUESTION_LEGEND } from './__first-run-fields.tsx'
import { FirstRunFrame, SIMPLE_START_STEP_COUNT } from './__first-run-frame.tsx'
import { WeekSketch } from './__week-sketch.tsx'

/**
 * The simple start, screen 1 (#558 _Levende start_, #563): _Hvor er du nå?_ —
 * the **Training Level** — and on the same screen _Omtrent hvor mye tid i
 * uka?_, pre-filled by the level and changed in half hours with a large − and
 * +. _Uka di_ fills in above as the athlete answers, laid by the same draft the
 * plan is made from (`draftStart`).
 *
 * Built beside the old first run (expand): `/start` stays the entry until the
 * simple start replaces it.
 */

const L = SIMPLE_START_LABELS

export const meta: Route.MetaFunction = () => [
	{ title: `${L.level.title} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireSimpleStartAthlete(request)
	return {
		// Back from the next screen: every answer given comes back with it.
		answers: readStartAnswers(new URL(request.url).searchParams),
		startWeekKey: await readPlanStartWeekKey(userId),
	}
}

export async function action({ request }: Route.ActionArgs) {
	await requireSimpleStartAthlete(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: LevelStepSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	const { level, hours, discipline, sports, activities, days, strength } =
		submission.value
	throw redirect(
		`/start/trening?${startSearch({
			level,
			hours: hours ?? levelDefaults(level).hours,
			discipline,
			activities,
			otherSports: discipline ? otherSportsOf(discipline, sports) : undefined,
			days,
			strength,
		})}`,
	)
}

function clampHours(hours: number): number {
	return Math.min(MAX_START_HOURS, Math.max(MIN_START_HOURS, hours))
}

export default function LevelStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { answers, startWeekKey } = loaderData
	const [level, setLevel] = useState<TrainingLevel | null>(
		answers.level ?? null,
	)
	const [hours, setHours] = useState<number | null>(
		answers.hours ??
			(answers.level ? levelDefaults(answers.level).hours : null),
	)
	// The next screen's answers ride along while the level is the one they
	// were given for; a new level brings its own days.
	const sameLevel = level != null && level === answers.level
	const carriedDays = sameLevel ? answers.days : undefined
	const activities = sameLevel ? answers.activities : undefined
	const discipline = answers.discipline ?? (activities ? null : 'run')
	const otherSports = sameLevel ? answers.otherSports : undefined

	const sketch = useMemo(
		() =>
			weekSketch(
				level && hours != null
					? draftStart({
							level,
							discipline,
							activities,
							otherSports,
							hours,
							days: carriedDays ?? levelDefaults(level).days,
							startWeekKey,
						})
					: null,
			),
		[
			level,
			hours,
			discipline,
			otherSports,
			activities,
			carriedDays,
			startWeekKey,
		],
	)

	const [form, fields] = useForm({
		id: 'simple-start-level',
		constraint: getZodConstraint(LevelStepSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: LevelStepSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	const hoursNote =
		level == null || hours == null
			? null
			: hours <= MIN_START_HOURS
				? L.level.atMin
				: hours >= MAX_START_HOURS
					? L.level.atMax
					: L.level.typical[level]

	return (
		<FirstRunFrame
			step={1}
			stepCount={SIMPLE_START_STEP_COUNT}
			title={L.level.title}
		>
			<WeekSketch sketch={sketch} />
			<Form
				method="POST"
				className="space-y-8"
				// _Uka di_ stays with the athlete to the next screen (#582).
				viewTransition
				{...getFormProps(form)}
			>
				<RadioGroupField
					name={fields.level.name}
					legend={<span className="sr-only">{L.level.legend}</span>}
					value={level ?? ''}
					onValueChange={(next) => {
						const picked = TRAINING_LEVELS.find((value) => value === next)
						if (!picked) return
						setLevel(picked)
						setHours(
							picked === answers.level && answers.hours != null
								? answers.hours
								: levelDefaults(picked).hours,
						)
					}}
					options={TRAINING_LEVELS.map((value) => ({
						value,
						label: L.levels[value].name,
						description: L.levels[value].description,
					}))}
					errorId={fields.level.errorId}
					errors={fields.level.errors}
				/>

				{level != null && hours != null ? (
					<fieldset className="space-y-3" data-start-hours>
						<legend className={QUESTION_LEGEND}>{L.level.hours}</legend>
						<input type="hidden" name={fields.hours.name} value={hours} />
						<div className="flex items-center justify-between gap-3">
							<Button
								type="button"
								variant="outline"
								className="size-14 shrink-0 rounded-full p-0"
								aria-label={L.level.fewer}
								disabled={hours <= MIN_START_HOURS}
								onClick={() => setHours(clampHours(hours - START_HOURS_STEP))}
							>
								<Icon name="minus" size="lg" />
							</Button>
							<output
								aria-live="polite"
								className="text-display min-w-0 text-center tabular-nums"
								data-start-hours-value
							>
								{nbHoursWords(hours)}
							</output>
							<Button
								type="button"
								variant="outline"
								className="size-14 shrink-0 rounded-full p-0"
								aria-label={L.level.more}
								disabled={hours >= MAX_START_HOURS}
								onClick={() => setHours(clampHours(hours + START_HOURS_STEP))}
							>
								<Icon name="plus" size="lg" />
							</Button>
						</div>
						<p
							className="text-footnote text-muted-foreground"
							data-start-hours-note
						>
							{hoursNote} {L.level.meaning}
						</p>
						<ErrorList errors={fields.hours.errors} id={fields.hours.errorId} />
					</fieldset>
				) : null}

				{answers.discipline && sameLevel ? (
					<input
						type="hidden"
						name={fields.discipline.name}
						value={answers.discipline}
					/>
				) : null}
				{activities?.map((kind) => (
					<input key={kind} type="hidden" name="activities" value={kind} />
				))}
				{answers.discipline && otherSports?.length
					? [answers.discipline, ...otherSports].map((sport) => (
							<input
								key={sport}
								type="hidden"
								name={fields.sports.name}
								value={sport}
							/>
						))
					: null}
				{carriedDays?.map((day) => (
					<input key={day} type="hidden" name={fields.days.name} value={day} />
				))}
				{answers.strength != null ? (
					<input
						type="hidden"
						name={fields.strength.name}
						value={answers.strength}
					/>
				) : null}

				<ErrorList errors={form.errors} id={form.errorId} />
				{/* In the thumb's reach while the answers scroll under it. */}
				<div className="bg-background sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<Button type="submit" className="text-callout w-full">
						{L.level.next}
					</Button>
				</div>
			</Form>
		</FirstRunFrame>
	)
}
