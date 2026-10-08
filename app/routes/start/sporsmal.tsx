import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect } from 'react-router'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { readFirstRunFindings } from '#app/utils/first-run/findings.server.ts'
import {
	answersSearch,
	QuestionsSchema,
	readAnswers,
	readCorrections,
	type FirstRunAnswers,
} from '#app/utils/first-run/first-run-schema.ts'
import { questionPrefill } from '#app/utils/first-run/first-run.ts'
import {
	readFirstRunPlan,
	requireFirstRunAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	FINDING_ABSENCE_LABELS,
	FIRST_RUN_LABELS,
	FIRST_RUN_REFUSAL_LABELS,
	hoursEstimateLabel,
	NB_DISCIPLINE_LABELS,
} from '#app/utils/labels.ts'
import { type Route } from './+types/sporsmal.ts'
import { DaysField } from './__first-run-fields.tsx'
import { FirstRunFrame } from './__first-run-frame.tsx'

/**
 * The first run, step 3 (#505 stories 64–65): three questions — what the
 * athlete trains toward, hours a week, and which days — each pre-filled from
 * the history (or from "Noe er feil"), the hours with their arithmetic shown.
 */

const L = FIRST_RUN_LABELS.questions

export const meta: Route.MetaFunction = () => [
	{ title: 'Tre spørsmål | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireFirstRunAthlete(request)
	const search = new URL(request.url).searchParams
	const { findings } = await readFirstRunFindings(userId)
	const corrections = readCorrections(search)
	const prefill = questionPrefill(findings, corrections)
	// Back from the plan screen: the answers already given come back with it.
	const given = readAnswers(search)

	return {
		discipline: prefill.discipline,
		disciplineLabel: NB_DISCIPLINE_LABELS[prefill.discipline],
		hours: prefill.hours,
		hoursNote:
			corrections.hours != null
				? null
				: findings.volume.measured
					? L.hoursFromHistory(hoursEstimateLabel(findings.volume.value))
					: L.hoursUnmeasured(FINDING_ABSENCE_LABELS[findings.volume.reason]),
		days: prefill.days,
		daysNote:
			prefill.daysSource === 'history'
				? L.daysFromHistory
				: prefill.daysSource === 'corrected'
					? L.daysCorrected
					: L.daysDefault,
		goal: given?.goal ?? { kind: 'active' as const },
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireFirstRunAthlete(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: QuestionsSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	const { goal, eventName, eventDate, ...rest } = submission.value
	const answers: FirstRunAnswers = {
		...rest,
		goal:
			goal === 'event' && eventName && eventDate
				? { kind: 'event', name: eventName, date: eventDate }
				: { kind: 'active' },
		family: null,
	}
	// A race needs weeks to lay toward it; said on the date, before the plan.
	const plan = await readFirstRunPlan(userId, answers)
	if (!plan.ok && plan.reason === 'event-too-soon') {
		return data(
			{
				result: submission.reply({
					fieldErrors: {
						eventDate: [FIRST_RUN_REFUSAL_LABELS['event-too-soon']],
					},
				}),
			},
			{ status: 400 },
		)
	}
	throw redirect(`/start/plan?${answersSearch(answers)}`)
}

export default function QuestionsStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const [goal, setGoal] = useState<'active' | 'event'>(loaderData.goal.kind)
	const [form, fields] = useForm({
		id: 'first-run-questions',
		constraint: getZodConstraint(QuestionsSchema),
		lastResult: actionData?.result,
		defaultValue: {
			eventName:
				loaderData.goal.kind === 'event' ? loaderData.goal.name : undefined,
			eventDate:
				loaderData.goal.kind === 'event' ? loaderData.goal.date : undefined,
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: QuestionsSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FirstRunFrame step={3} title={L.title} intro={L.intro}>
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<input
					type="hidden"
					name={fields.discipline.name}
					value={loaderData.discipline}
				/>
				<p className="text-[15px]">
					<span className="text-muted-foreground">{L.discipline}: </span>
					<span className="font-medium">{loaderData.disciplineLabel}</span>
				</p>

				<fieldset className="space-y-2" aria-describedby={fields.goal.errorId}>
					<legend className="text-base font-semibold">{L.goal}</legend>
					<label className="flex min-h-11 cursor-pointer items-start gap-3 pt-2">
						<input
							type="radio"
							name={fields.goal.name}
							value="active"
							checked={goal === 'active'}
							onChange={() => setGoal('active')}
							className="mt-0.5 size-5"
						/>
						<span>
							<span className="block text-[15px] font-medium">
								{L.goalActive}
							</span>
							<span className="text-muted-foreground block text-[13px]">
								{L.goalActiveHelp}
							</span>
						</span>
					</label>
					<label className="flex min-h-11 cursor-pointer items-center gap-3">
						<input
							type="radio"
							name={fields.goal.name}
							value="event"
							checked={goal === 'event'}
							onChange={() => setGoal('event')}
							className="size-5"
						/>
						<span className="text-[15px] font-medium">{L.goalEvent}</span>
					</label>
					{goal === 'event' ? (
						<div className="space-y-3 pl-8">
							<Field
								labelProps={{ children: L.eventName }}
								inputProps={{
									...getInputProps(fields.eventName, { type: 'text' }),
									className: 'text-base',
								}}
								errors={fields.eventName.errors}
							/>
							<Field
								labelProps={{ children: L.eventDate }}
								inputProps={{
									...getInputProps(fields.eventDate, { type: 'date' }),
									className: 'text-base',
								}}
								errors={fields.eventDate.errors}
							/>
						</div>
					) : null}
					<ErrorList id={fields.goal.errorId} errors={fields.goal.errors} />
				</fieldset>

				<div className="space-y-1.5">
					<Field
						labelProps={{
							children: L.hours,
							className: 'text-base font-semibold',
						}}
						inputProps={{
							...getInputProps(fields.hours, { type: 'number' }),
							step: '0.5',
							min: '0.5',
							inputMode: 'decimal',
							defaultValue: loaderData.hours ?? '',
							className: 'text-base',
						}}
						errors={fields.hours.errors}
					/>
					{loaderData.hoursNote ? (
						<p
							className="text-muted-foreground text-[13px]"
							data-hours-arithmetic
						>
							{loaderData.hoursNote}
						</p>
					) : null}
				</div>

				<DaysField
					meta={fields.days}
					legend={L.days}
					defaultDays={loaderData.days}
					note={loaderData.daysNote}
					asQuestion
				/>

				<ErrorList errors={form.errors} id={form.errorId} />
				<Button type="submit" className="min-h-11 w-full text-[15px]">
					{L.next}
				</Button>
			</Form>
		</FirstRunFrame>
	)
}
