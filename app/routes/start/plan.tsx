import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { data, Form, Link, redirect } from 'react-router'
import { RadioGroupField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type FirstRunDraft } from '#app/utils/first-run/draft.ts'
import {
	answersSearch,
	FamilySwitchSchema,
	questionsPath,
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
	STAMPED_SESSION_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type WeekRole, weekRole } from '#app/utils/plan-outline/derive.ts'
import { phaseSpecs } from '#app/utils/plan-outline/from-rows.ts'
import { PRESET_FAMILIES } from '#app/utils/plan-outline/presets.ts'
import { type QualityZone } from '#app/utils/plan-outline/quality-mix.ts'
import { type Route } from './+types/plan.ts'
import {
	DISCLOSURE_CHEVRON,
	DISCLOSURE_TRIGGER,
	FirstRunFrame,
	PRIMARY_ACTION,
} from './__first-run-frame.tsx'

/**
 * The first run, step 4 (#505 stories 66, 67 and 70): the plan the answers
 * make, "Vi valgte X fordi …" in plain words, and a switch to any of the five
 * philosophies — the plan redrawn at once, nothing made yet.
 *
 * What tells the philosophies apart is said, not left to the name (round-2
 * audit, story 67: Klassisk and Polarisert showed the same numbers): the
 * plan's weeks as a picture, its rhythm, and the week's hard sessions as the
 * stamp lays them — a tempo session on Klassisk, intervals on Polarisert,
 * threshold and tempo on Terskelfokus.
 */

const L = FIRST_RUN_LABELS.plan

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

/** The questions' answers as "Endre svarene" hands them back. */
function questionsLink(answers: FirstRunAnswers): string {
	return questionsPath(answers)
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

/**
 * The first week's hard sessions as the stamp laid them, hardest first —
 * `1 terskeløkt og 1 tempoøkt` — or, where the first weeks have none, when
 * they come: a race plan's Grunntrening is easy, its Oppbygging is not.
 */
function hardSessionsLine(draft: FirstRunDraft): string {
	const laid = new Map<QualityZone, number>()
	for (const session of draft.weeks[0]?.sessions ?? []) {
		if (session.zone != null) {
			laid.set(session.zone, (laid.get(session.zone) ?? 0) + 1)
		}
	}
	if (laid.size > 0) {
		const parts = [...laid]
			.sort(([a], [b]) => b - a)
			.map(([zone, count]) =>
				L.hardSession(count, STAMPED_SESSION_LABELS.zone[zone]),
			)
		const sessions =
			parts.length > 1
				? `${parts.slice(0, -1).join(', ')} og ${parts.at(-1)}`
				: parts[0]!
		return L.hardSessions(sessions)
	}
	let weeks = 0
	for (const phase of draft.phases) {
		if (phase.mix.some((entry) => entry.sessionsPerWeek > 0)) {
			return weeks > 0
				? L.hardLater(weeks, nbPhaseName(phase.name))
				: L.noHardSessions
		}
		weeks += phase.weeks
	}
	return L.noHardSessions
}

/** `3:1` → three weeks that build, then one easy; null for no rhythm. */
function rhythmLine(rhythm: string | undefined): string | null {
	const match = rhythm?.match(/^(\d+):(\d+)$/)
	return match ? L.rhythm(Number(match[1]), Number(match[2])) : null
}

export async function loader({ request }: Route.LoaderArgs) {
	const { answers, plan } = await readPlan(request)
	const { draft, family, proposed } = plan
	const weeks = draft.targets.length
	const hours = draft.targets.filter((value): value is number => value != null)
	const peak = hours.length > 0 ? Math.max(...hours) : null
	const monday = new Date(`${plan.startWeekKey}T12:00:00Z`)
	const specs = phaseSpecs(draft.rows)

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
		rhythm: rhythmLine(draft.phases[0]?.rhythm),
		firstWeek: hours[0] != null ? L.firstWeek(nbHoursLabel(hours[0])) : null,
		peakWeek:
			peak != null && hours.length > 1 ? L.peakWeek(nbHoursLabel(peak)) : null,
		hardSessions: hardSessionsLine(draft),
		// The plan's weeks as bars, each its share of the heaviest week; the
		// easy weeks lighter, so the rhythm shows (Arket J4).
		curve: draft.targets.map((target, index) => ({
			share: peak && target != null ? target / peak : 0,
			role: weekRole(specs, index),
		})),
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

/**
 * The plan's weeks as a row of bars (Arket J4): height is the week's hours
 * against the heaviest, the easy weeks a lighter green. Static on purpose —
 * the first run's one animated moment is "Dette fant vi" — and hidden from a
 * screen reader, which reads the same facts in the list beside it.
 */
function PlanCurve({
	curve,
	label,
}: {
	curve: ReadonlyArray<{ share: number; role: WeekRole }>
	label: string
}) {
	return (
		<div
			role="img"
			aria-label={label}
			className={cn(
				'flex h-20 items-end',
				curve.length > 30 ? 'gap-px' : 'gap-1',
			)}
			data-plan-curve
		>
			{curve.map((week, index) => (
				<span
					key={index}
					className={cn(
						'min-h-1 flex-1 rounded-t-sm',
						week.role === 'loading' ? 'bg-primary' : 'bg-primary/35',
					)}
					style={{ height: `${Math.round(week.share * 100)}%` }}
				/>
			))}
		</div>
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
		<FirstRunFrame
			step={4}
			title={L.title}
			back={{
				to: loaderData.questionsLink,
				label: FIRST_RUN_LABELS.backTo.plan,
			}}
		>
			<section aria-labelledby="first-run-family" className="space-y-2">
				<h2 id="first-run-family" className="text-heading">
					{loaderData.familyLabel}
				</h2>
				{loaderData.switched ? (
					<>
						<p className="text-body">{L.youChose(loaderData.familyLabel)}</p>
						<p className="text-footnote text-muted-foreground">
							{L.weSuggested(loaderData.reason)}
						</p>
					</>
				) : (
					<p className="text-body" data-family-reason>
						{loaderData.reason}
					</p>
				)}
				<p className="text-footnote text-muted-foreground">
					{loaderData.description}
				</p>
			</section>

			<section
				aria-label={L.title}
				className="bg-card space-y-4 rounded-4xl p-4 shadow-xs"
			>
				<PlanCurve
					curve={loaderData.curve}
					label={L.curveLabel(loaderData.curve.length)}
				/>
				<ul className="divide-border/60 text-callout divide-y font-normal tabular-nums">
					<li className="py-2">{loaderData.shape}</li>
					{loaderData.phases.map((phase) => (
						<li key={phase} className="py-2">
							{phase}
						</li>
					))}
					{loaderData.rhythm ? (
						<li className="py-2" data-plan-rhythm>
							{loaderData.rhythm}
						</li>
					) : null}
					{loaderData.firstWeek ? (
						<li className="py-2">{loaderData.firstWeek}</li>
					) : null}
					{loaderData.peakWeek ? (
						<li className="py-2">{loaderData.peakWeek}</li>
					) : null}
					<li className="py-2" data-plan-hard>
						{loaderData.hardSessions}
					</li>
					<li className="py-2">{loaderData.startsOn}</li>
				</ul>
			</section>
			{loaderData.strengthNote ? (
				<p className="text-footnote text-muted-foreground">
					{loaderData.strengthNote}
				</p>
			) : null}

			<Collapsible
				defaultOpen={actionData?.result.status === 'error'}
				className="bg-card rounded-4xl shadow-xs"
			>
				<CollapsibleTrigger className={DISCLOSURE_TRIGGER}>
					{L.switchTitle}
					<Icon name="chevron-down" size="md" className={DISCLOSURE_CHEVRON} />
				</CollapsibleTrigger>
				<CollapsibleContent>
					<Form
						method="POST"
						className="space-y-4 px-4 pt-1 pb-4"
						{...getFormProps(form)}
					>
						<RadioGroupField
							name={fields.family.name}
							legend={<span className="sr-only">{L.switchTitle}</span>}
							defaultValue={loaderData.family}
							options={PRESET_FAMILIES.map((family) => ({
								value: family,
								label: PHILOSOPHY_LABELS[family],
								description: PHILOSOPHY_DESCRIPTIONS[family],
							}))}
							errorId={fields.family.errorId}
							errors={fields.family.errors}
						/>
						<Button
							type="submit"
							variant="secondary"
							className="text-callout w-full"
						>
							{L.switchSubmit}
						</Button>
					</Form>
				</CollapsibleContent>
			</Collapsible>

			<Link to={loaderData.weeksLink} className={PRIMARY_ACTION}>
				{L.next}
			</Link>
		</FirstRunFrame>
	)
}
