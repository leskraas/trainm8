import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { addDays, isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import {
	answersSearch,
	FirstRunCreateSchema,
	readAnswers,
} from '#app/utils/first-run/first-run-schema.ts'
import {
	createFirstRunPlan,
	readFirstRunPlan,
	requireFirstRunAthlete,
} from '#app/utils/first-run/plan.server.ts'
import { formatNbDayMonth } from '#app/utils/format.ts'
import {
	FIRST_RUN_LABELS,
	FIRST_RUN_REFUSAL_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_WEEKDAY_LABELS,
	nbDurationLabel,
	nbHoursLabel,
	nbWeekdayList,
} from '#app/utils/labels.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/uker.ts'
import { FirstRunFrame, SECONDARY_ACTION } from './__first-run-frame.tsx'

/**
 * The first run, step 5 (#505 stories 68–69): the first two weeks, day by
 * day, as the stamp will lay them on the chosen days and at the chosen hours —
 * then the plan is made and the athlete lands on I dag, or, by "Jeg vil heller
 * sette opp sesongen selv", the same plan is made and opens in Sesong.
 */

const L = FIRST_RUN_LABELS.weeks

export const meta: Route.MetaFunction = () => [
	{ title: 'De to første ukene | Trainm8' },
]

async function readAnswersOrBack(request: Request) {
	const answers = readAnswers(new URL(request.url).searchParams)
	if (!answers) throw redirect('/start/sporsmal')
	return answers
}

/** A day of the plan as a date the athlete reads: `14. jan`. */
function dayLabel(dayKey: string): string {
	return formatNbDayMonth(new Date(`${dayKey}T12:00:00Z`), 'UTC')
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireFirstRunAthlete(request)
	const answers = await readAnswersOrBack(request)
	const read = await readFirstRunPlan(userId, answers)
	if (!read.ok) throw redirect(`/start/sporsmal?${answersSearch(answers)}`)
	const { draft } = read.plan
	const sport = NB_DISCIPLINE_LABELS[answers.discipline]
	const longDay = draft.pattern.find((day) => day.role === 'long')

	return {
		intro: L.intro(
			nbWeekdayList(answers.days),
			nbHoursLabel(draft.weeks[0]?.target ?? answers.hours),
		),
		weeks: draft.weeks.map((week) => ({
			weekKey: week.weekKey,
			heading: L.weekHeading(
				isoWeekNumber(week.weekKey),
				dayLabel(week.weekKey),
			),
			total: L.weekTotal(
				nbHoursLabel(Math.round(week.planned * 10) / 10),
				week.target == null ? '–' : nbHoursLabel(week.target),
			),
			sessions: week.sessions.map((session) => ({
				key: `${session.dayId}-${session.weekKey}`,
				day: `${NB_WEEKDAY_LABELS[session.weekday]} ${dayLabel(addDays(week.weekKey, session.weekday))}`,
				title: `${session.weekday === longDay?.weekday ? L.long : L.easy} · ${sport}`,
				duration: nbDurationLabel(
					Math.round(((session.volume ?? 0) * 3600) / 60) * 60,
				),
			})),
		})),
		dayWarning: draft.dayWarnings[0]
			? L.tooManyHardSessions(
					draft.dayWarnings[0].qualitySessions,
					draft.dayWarnings[0].trainableWeekdays,
				)
			: null,
		planLink: `/start/plan?${answersSearch(answers)}`,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireFirstRunAthlete(request)
	const answers = await readAnswersOrBack(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: FirstRunCreateSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	const created = await createFirstRunPlan(userId, answers)
	if (!created.ok) {
		return data(
			{
				result: submission.reply({
					formErrors: [FIRST_RUN_REFUSAL_LABELS[created.reason]],
				}),
			},
			{ status: 409 },
		)
	}
	// "Sette opp selv" opens the same plan in Sesong, fully editable; there is
	// no separate empty-season start (#505 story 69).
	if (submission.value.intent === 'self') {
		throw redirect(`/training/plan?outline=${created.outlineId}`)
	}
	return redirectWithToast('/', {
		title: L.created,
		description: L.createdDescription,
		type: 'success',
	})
}

export default function WeeksStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form] = useForm({
		id: 'first-run-create',
		constraint: getZodConstraint(FirstRunCreateSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FirstRunCreateSchema })
		},
	})

	return (
		<FirstRunFrame step={5} title={L.title} intro={loaderData.intro}>
			{loaderData.weeks.map((week) => (
				<section
					key={week.weekKey}
					aria-labelledby={`first-run-week-${week.weekKey}`}
					className="space-y-2"
					data-first-run-week={week.weekKey}
				>
					<h2
						id={`first-run-week-${week.weekKey}`}
						className="text-base font-semibold"
					>
						{week.heading}
					</h2>
					<ul className="divide-border divide-y">
						{week.sessions.map((session) => (
							<li
								key={session.key}
								className="flex items-baseline justify-between gap-3 py-2.5"
							>
								<span>
									<span className="text-muted-foreground block text-[13px] first-letter:uppercase">
										{session.day}
									</span>
									<span className="block text-[15px] font-medium">
										{session.title}
									</span>
								</span>
								<span className="text-[15px] tabular-nums">
									{session.duration}
								</span>
							</li>
						))}
					</ul>
					<p className="text-muted-foreground text-[13px]">{week.total}</p>
				</section>
			))}
			{loaderData.dayWarning ? (
				<p className="bg-muted rounded-xl p-3 text-sm">
					{loaderData.dayWarning}
				</p>
			) : null}

			<Form method="POST" className="space-y-3" {...getFormProps(form)}>
				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					name="intent"
					value="create"
					className="min-h-11 w-full text-[15px]"
					status={isPending ? 'pending' : 'idle'}
					disabled={isPending}
				>
					{L.create}
				</StatusButton>
				<button
					type="submit"
					name="intent"
					value="self"
					disabled={isPending}
					className={SECONDARY_ACTION}
				>
					{L.selfSetUp}
				</button>
				<p className="text-muted-foreground text-center text-[13px]">
					{L.selfSetUpHelp}
				</p>
			</Form>
			<Link
				to={loaderData.planLink}
				className="text-muted-foreground block text-center text-sm underline"
			>
				{L.back}
			</Link>
		</FirstRunFrame>
	)
}
