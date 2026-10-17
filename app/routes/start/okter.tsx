import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { useMemo, useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { CheckboxCardsField, ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	readPlanStartWeekKey,
	requireSimpleStartAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	SESSION_PREFERENCES,
	weekSketch,
	type SessionPreference,
} from '#app/utils/first-run/start-draft.ts'
import {
	ActivitiesStepSchema,
	readStartAnswers,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
import { SESSION_PREFERENCE_LABELS } from '#app/utils/labels.ts'
import { type Route } from './+types/okter.ts'
import { QUESTION_LEGEND } from './__first-run-fields.tsx'
import { FirstRunFrame, SIMPLE_START_STEP_COUNT } from './__first-run-frame.tsx'
import { WeekSketch } from './__week-sketch.tsx'

/**
 * The simple start, screen 3 (#558 _Levende start_, #571): _Hva slags økter
 * liker du?_ — the **Session Preferences**, several or none. They order the
 * **Start Options** that follow (`/start/valg`), and _Korte økter_ keeps the
 * weekday sessions to 45 minutes, which _Uka di_ above shows as they tick it.
 * The way on with nothing ticked is the skip (_Hopp over_), one tap.
 */

const L = SESSION_PREFERENCE_LABELS

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const answers = readStartAnswers(new URL(request.url).searchParams)
	const { level, hours, discipline, days } = answers
	if (!level || hours == null) {
		const search = startSearch(answers)
		throw redirect(search ? `/start/niva?${search}` : '/start/niva')
	}
	if (!discipline || !days) {
		throw redirect(`/start/trening?${startSearch(answers)}`)
	}
	return {
		level,
		hours,
		discipline,
		days,
		preferences: answers.preferences ?? [],
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

export default function PreferencesStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { level, hours, discipline, days, startWeekKey } = loaderData
	const [preferences, setPreferences] = useState<SessionPreference[]>(
		loaderData.preferences,
	)

	const sketch = useMemo(
		() =>
			weekSketch(
				draftStart({
					level,
					discipline,
					hours,
					days,
					startWeekKey,
					preferences,
				}),
			),
		[level, discipline, hours, days, startWeekKey, preferences],
	)

	const [form] = useForm({
		id: 'simple-start-preferences',
		lastResult: actionData?.result,
	})

	// Back keeps every answer, the ones on this screen too.
	const back = `/start/trening?${startSearch({
		level,
		hours,
		discipline,
		days,
		preferences,
	})}`

	return (
		<FirstRunFrame
			step={3}
			stepCount={SIMPLE_START_STEP_COUNT}
			title={L.title}
			intro={L.intro}
			back={{ to: back, label: L.back }}
		>
			<WeekSketch sketch={sketch} discipline={discipline} />
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<input type="hidden" name="level" value={level} />
				<input type="hidden" name="hours" value={hours} />
				<input type="hidden" name="discipline" value={discipline} />
				{days.map((day) => (
					<input key={day} type="hidden" name="days" value={day} />
				))}

				<CheckboxCardsField
					name="preferences"
					legend={<span className="sr-only">{L.legend}</span>}
					legendClassName={QUESTION_LEGEND}
					value={preferences}
					onValueChange={(next) =>
						setPreferences(
							SESSION_PREFERENCES.filter((value) => next.includes(value)),
						)
					}
					options={SESSION_PREFERENCES.map((value) => ({
						value,
						label: L.options[value].name,
						description: L.options[value].description,
					}))}
				/>
				<div aria-live="polite" className="text-footnote text-muted-foreground">
					{preferences.includes('short') && preferences.includes('long') ? (
						<p data-start-short-and-long>{L.shortAndLong}</p>
					) : null}
				</div>

				<ErrorList errors={form.errors} id={form.errorId} />
				{/* In the thumb's reach while the answers scroll under it. */}
				<div className="bg-background sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<Button type="submit" className="text-callout w-full">
						{L.next(preferences.length)}
					</Button>
				</div>
			</Form>
		</FirstRunFrame>
	)
}
