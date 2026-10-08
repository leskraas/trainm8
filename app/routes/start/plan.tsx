import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	answersSearch,
	FamilySwitchSchema,
	readAnswers,
	type FirstRunAnswers,
} from '#app/utils/first-run/first-run-schema.ts'
import {
	readFirstRunCalendar,
	readFirstRunPlan,
	requireFirstRunAthlete,
} from '#app/utils/first-run/plan.server.ts'
import { formatNbDayMonth } from '#app/utils/format.ts'
import {
	familyChoiceSentence,
	FIRST_RUN_LABELS,
	nbHoursLabel,
	nbPhaseName,
	PHILOSOPHY_DESCRIPTIONS,
	PHILOSOPHY_LABELS,
} from '#app/utils/labels.ts'
import { PRESET_FAMILIES } from '#app/utils/plan-outline/presets.ts'
import { type Route } from './+types/plan.ts'
import {
	FirstRunFrame,
	PRIMARY_ACTION,
	SECONDARY_ACTION,
} from './__first-run-frame.tsx'

/**
 * The first run, step 4 (#505 stories 66, 67 and 70): the plan the answers
 * make, "Vi valgte X fordi …" in plain words, and a switch to any of the five
 * philosophies — the plan redrawn at once, nothing made yet.
 */

const L = FIRST_RUN_LABELS.plan

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

/** The questions' answers as "Endre svarene" hands them back. */
function questionsLink(answers: FirstRunAnswers): string {
	return `/start/sporsmal?${answersSearch({ ...answers, family: null })}`
}

async function readPlan(request: Request) {
	const userId = await requireFirstRunAthlete(request)
	const answers = readAnswers(
		new URL(request.url).searchParams,
		await readFirstRunCalendar(userId),
	)
	if (!answers) throw redirect('/start/sporsmal')
	const read = await readFirstRunPlan(userId, answers)
	if (!read.ok) throw redirect(questionsLink(answers))
	return { answers, plan: read.plan }
}

export async function loader({ request }: Route.LoaderArgs) {
	const { answers, plan } = await readPlan(request)
	const { draft, family, proposed } = plan
	const weeks = draft.targets.length
	const hours = draft.targets.filter((value): value is number => value != null)
	const monday = new Date(`${plan.startWeekKey}T12:00:00Z`)

	return {
		family,
		familyLabel: PHILOSOPHY_LABELS[family],
		description: PHILOSOPHY_DESCRIPTIONS[family],
		reason: familyChoiceSentence(proposed),
		switched: family !== proposed.family,
		shape:
			answers.goal.kind === 'event'
				? L.towardEvent(answers.goal.name, weeks)
				: L.openEnded(weeks),
		phases:
			answers.goal.kind === 'event'
				? draft.phases.map((phase) =>
						L.phase(nbPhaseName(phase.name), phase.weeks),
					)
				: [],
		firstWeek: hours[0] != null ? L.firstWeek(nbHoursLabel(hours[0])) : null,
		peakWeek:
			hours.length > 1 ? L.peakWeek(nbHoursLabel(Math.max(...hours))) : null,
		capNote: [
			L.withinHours(nbHoursLabel(answers.hours)),
			draft.anchor < answers.hours ? L.startsLower : null,
		]
			.filter(Boolean)
			.join(' '),
		strengthNote:
			plan.strengthPerWeek != null ? L.strength(plan.strengthPerWeek) : null,
		startsOn: L.startsOn(`mandag ${formatNbDayMonth(monday, 'UTC')}`),
		weeksLink: `/start/uker?${answersSearch({ ...answers, family })}`,
		questionsLink: questionsLink(answers),
	}
}

export async function action({ request }: Route.ActionArgs) {
	const { answers } = await readPlan(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: FamilySwitchSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	throw redirect(
		`/start/plan?${answersSearch({ ...answers, family: submission.value.family })}`,
	)
}

export default function PlanStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const [form, fields] = useForm({
		id: 'first-run-philosophy',
		constraint: getZodConstraint(FamilySwitchSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FamilySwitchSchema })
		},
	})

	return (
		<FirstRunFrame step={4} title={L.title}>
			<section aria-labelledby="first-run-family" className="space-y-2">
				<h2 id="first-run-family" className="text-lg font-semibold">
					{loaderData.familyLabel}
				</h2>
				{loaderData.switched ? (
					<>
						<p className="text-[15px]">{L.youChose(loaderData.familyLabel)}</p>
						<p className="text-muted-foreground text-sm">
							{L.weSuggested(loaderData.reason)}
						</p>
					</>
				) : (
					<p className="text-[15px]" data-family-reason>
						{loaderData.reason}
					</p>
				)}
				<p className="text-muted-foreground text-sm">
					{loaderData.description}
				</p>
			</section>

			<ul className="divide-border divide-y text-[15px]">
				<li className="py-2">{loaderData.shape}</li>
				{loaderData.phases.map((phase) => (
					<li key={phase} className="py-2">
						{phase}
					</li>
				))}
				{loaderData.firstWeek ? (
					<li className="py-2">{loaderData.firstWeek}</li>
				) : null}
				{loaderData.peakWeek ? (
					<li className="py-2">{loaderData.peakWeek}</li>
				) : null}
				<li className="py-2">{loaderData.startsOn}</li>
			</ul>
			<p className="text-muted-foreground text-sm" data-hours-cap>
				{loaderData.capNote}
			</p>
			{loaderData.strengthNote ? (
				<p className="text-muted-foreground text-sm">
					{loaderData.strengthNote}
				</p>
			) : null}

			<details
				className="border-border rounded-xl border p-4"
				open={actionData?.result.status === 'error' ? true : undefined}
			>
				<summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">
					{L.switchTitle}
				</summary>
				<Form method="POST" className="mt-3 space-y-3" {...getFormProps(form)}>
					<fieldset aria-describedby={fields.family.errorId}>
						<legend className="sr-only">{L.switchTitle}</legend>
						{PRESET_FAMILIES.map((family) => (
							<label
								key={family}
								className="flex min-h-11 cursor-pointer items-start gap-3 py-2"
							>
								<input
									type="radio"
									name={fields.family.name}
									value={family}
									defaultChecked={family === loaderData.family}
									className="mt-0.5 size-5 shrink-0"
								/>
								<span>
									<span className="block text-[15px] font-medium">
										{PHILOSOPHY_LABELS[family]}
									</span>
									<span className="text-muted-foreground block text-[13px]">
										{PHILOSOPHY_DESCRIPTIONS[family]}
									</span>
								</span>
							</label>
						))}
					</fieldset>
					<ErrorList id={fields.family.errorId} errors={fields.family.errors} />
					<Button type="submit" className="min-h-11 w-full">
						{L.switchSubmit}
					</Button>
				</Form>
			</details>

			<div className="space-y-3">
				<Link to={loaderData.weeksLink} className={PRIMARY_ACTION}>
					{L.next}
				</Link>
				<Link to={loaderData.questionsLink} className={SECONDARY_ACTION}>
					{L.back}
				</Link>
			</div>
		</FirstRunFrame>
	)
}
