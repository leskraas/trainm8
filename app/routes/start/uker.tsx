import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { data, Form, redirect } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { addDays, isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { MAX_SESSION_DAYS } from '#app/utils/first-run/draft.ts'
import {
	answersSearch,
	FirstRunCreateSchema,
	questionsPath,
	readAnswers,
} from '#app/utils/first-run/first-run-schema.ts'
import {
	createFirstRunPlan,
	readFirstRunCalendar,
	readFirstRunPlan,
	requireFirstRunAthlete,
} from '#app/utils/first-run/plan.server.ts'
import { levelDefaults } from '#app/utils/first-run/start-draft.ts'
import { formatNbDayMonth } from '#app/utils/format.ts'
import {
	FIRST_RUN_LABELS,
	FIRST_RUN_REFUSAL_LABELS,
	NB_WEEKDAY_LABELS,
	nbDurationLabel,
	nbHoursLabel,
	nbWeekdayList,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { stampedSessionTitle } from '#app/utils/session-title.ts'
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
	{ title: `${L.title} | Trainm8` },
]

async function readAnswersOrBack(request: Request, userId: string) {
	const answers = readAnswers(
		new URL(request.url).searchParams,
		await readFirstRunCalendar(userId),
	)
	if (!answers) throw redirect('/start/sporsmal')
	return answers
}

/** A day of the plan as a date the athlete reads: `14. jan`. */
function dayLabel(dayKey: string): string {
	return formatNbDayMonth(new Date(`${dayKey}T12:00:00Z`), 'UTC')
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireFirstRunAthlete(request)
	const answers = await readAnswersOrBack(request, userId)
	const read = await readFirstRunPlan(userId, answers)
	if (!read.ok) throw redirect(questionsPath(answers))
	const { draft } = read.plan
	const chosen = new Set(answers.days).size
	const used = draft.patternDays.length
	const cap = answers.level
		? levelDefaults(answers.level).sessionCap
		: MAX_SESSION_DAYS

	return {
		intro: L.intro(
			nbWeekdayList(draft.patternDays),
			nbHoursLabel(draft.weeks[0]?.target ?? answers.hours),
		),
		// Fewer days than chosen: said, with the reason (`patternDaysFor`).
		daysNote:
			used >= chosen
				? null
				: cap < MAX_SESSION_DAYS && chosen > cap && used === cap
					? SIMPLE_START_LABELS.activities.beginnerCap(cap)
					: chosen > MAX_SESSION_DAYS && used === MAX_SESSION_DAYS
						? L.restDay(chosen, used)
						: L.fewerDays(chosen, used),
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
				// The title the stamp will store (`stampedSessionTitle`), so the
				// session on I dag is called what it was called here.
				title: stampedSessionTitle({
					discipline: answers.discipline,
					role: session.role,
					zone: session.zone,
				}),
				hard: session.zone != null,
				duration: nbDurationLabel(
					Math.round(((session.volume ?? 0) * 3600) / 60) * 60,
				),
			})),
		})),
		planLink: `/start/plan?${answersSearch(answers)}`,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireFirstRunAthlete(request)
	const answers = await readAnswersOrBack(request, userId)
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
		<FirstRunFrame
			step={5}
			title={L.title}
			intro={loaderData.intro}
			back={{ to: loaderData.planLink, label: FIRST_RUN_LABELS.backTo.uker }}
		>
			{loaderData.daysNote ? (
				<p className="text-footnote text-muted-foreground" data-days-note>
					{loaderData.daysNote}
				</p>
			) : null}
			{loaderData.weeks.map((week) => (
				<section
					key={week.weekKey}
					aria-labelledby={`first-run-week-${week.weekKey}`}
					className="space-y-2"
					data-first-run-week={week.weekKey}
				>
					<h2
						id={`first-run-week-${week.weekKey}`}
						className="text-heading tabular-nums"
					>
						{week.heading}
					</h2>
					<ul className="bg-card divide-border/60 divide-y rounded-4xl px-4 shadow-xs">
						{week.sessions.map((session) => (
							<li
								key={session.key}
								className="flex items-center justify-between gap-3 py-3"
							>
								<span className="min-w-0">
									<span className="text-footnote text-muted-foreground block first-letter:uppercase">
										{session.day}
									</span>
									<span className="text-callout flex items-center gap-2">
										{session.hard ? (
											<span
												aria-hidden
												className="bg-primary size-2 shrink-0 rounded-full"
											/>
										) : null}
										<span className="min-w-0">
											{session.title}
											{session.hard ? (
												<span className="sr-only"> ({L.hard})</span>
											) : null}
										</span>
									</span>
								</span>
								<span className="text-callout shrink-0 font-normal tabular-nums">
									{session.duration}
								</span>
							</li>
						))}
					</ul>
					<p className="text-footnote text-muted-foreground tabular-nums">
						{week.total}
					</p>
				</section>
			))}

			<Form method="POST" className="space-y-3" {...getFormProps(form)}>
				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					name="intent"
					value="create"
					className="text-callout w-full"
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
				<p className="text-footnote text-muted-foreground text-center">
					{L.selfSetUpHelp}
				</p>
			</Form>
		</FirstRunFrame>
	)
}
