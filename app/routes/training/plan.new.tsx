/**
 * Step one of authoring a plan: **what are you building toward?**
 *
 * The athlete either picks an **Event** they already have, sets a named, dated
 * goal that **visibly** creates a `fitness-goal` Event — an explicit step they
 * take, never a record the app writes behind their back the way Plan Generation
 * used to (ADR 0039, spec #399 stories 1–2) — or builds toward nothing at all:
 * _Hold meg aktiv_ makes an **open-ended** plan, with no Event and no end date
 * (ADR 0079, #505 story 1). That one is made here in one step, and no Event is
 * invented for it.
 *
 * An Event that already carries a Plan Outline stays on the list, saying so and
 * linking to its plan, rather than vanishing — the athlete came looking for it.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod/v3'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatNbDate } from '#app/utils/format.ts'
import {
	APP_TAB_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_EVENT_KIND_LABELS,
	nbDisciplineLabel,
	OPEN_ENDED_FORM_LABELS,
	OPEN_ENDED_PLAN_LABEL,
	PLAN_LEAD_LABELS,
	PLAN_NEW_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	createFitnessGoalEvent,
	createKeepMeActivePlan,
	listPlanAnchorCandidates,
	readOpenEndedPlanDefaults,
} from '#app/utils/plan-outline/authoring.server.ts'
import { OpenEndedFieldsSchema } from '#app/utils/plan-outline/open-ended-schema.ts'
import { OPEN_ENDED_ROUND_WEEKS } from '#app/utils/plan-outline/presets.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	type CardioDiscipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.new.ts'
import { readLibraryLifts } from './__library-section.server.ts'
import { LibrarySection } from './__library-section.tsx'
import { PillLink, PlanCard } from './__plan-chrome.tsx'
import { SportChoice } from './__plan-new-parts.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: `${APP_TAB_LABELS.plan} | Trainm8` },
]

/**
 * The goal step's own form: a name, a date and the discipline it is in. The
 * discipline is asked for because it is what the Event needs to be a real Event —
 * and it is what proposes the plan's first Training Track in the next step.
 */
const GoalFormSchema = z.object({
	name: z.string().trim().min(1, PLAN_NEW_LABELS.nameRequired).max(120),
	startDate: z.coerce.date({
		errorMap: () => ({ message: PLAN_NEW_LABELS.dateRequired }),
	}),
	discipline: z.enum(DISCIPLINES, {
		errorMap: () => ({ message: PLAN_NEW_LABELS.disciplineRequired }),
	}),
})

/** _Hold meg aktiv_'s own form: the open-ended plan's two questions. */
const OpenEndedFormSchema = OpenEndedFieldsSchema.extend({
	intent: z.literal('open-ended'),
})

const O = OPEN_ENDED_FORM_LABELS

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [candidates, openEnded, libraryLifts, active] = await Promise.all([
		listPlanAnchorCandidates(userId),
		readOpenEndedPlanDefaults(userId),
		// Bibliotek is a section of Plan (ADR 0101 §1), and with no plan this is
		// where Plan lands — so the catalogue is here too.
		readLibraryLifts(userId),
		findActiveOutline(userId, new Date()),
	])
	return {
		// With no plan, Plan invites to the start as I dag does (ADR 0101 §4); an
		// athlete with one came here for another plan, and the start would only
		// send them home.
		startInvite: active == null,
		candidates,
		libraryLifts,
		defaultDate: new Date().toISOString().slice(0, 10),
		openEnded,
		// Read here, not imported by the component: the constant lives in a
		// `.server` module, and a client-side visit (the Plan tab, ADR 0101)
		// cannot load one.
		roundWeeks: OPEN_ENDED_ROUND_WEEKS,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	if (formData.get('intent') === 'open-ended') {
		const submission = parseWithZod(formData, { schema: OpenEndedFormSchema })
		if (submission.status !== 'success') {
			return data({ result: submission.reply() }, { status: 400 })
		}
		// Klassisk 3:1 whole (climb and hard sessions), from the first week not
		// yet begun: what this form and the plan's Filosofi card say it is.
		const created = await createKeepMeActivePlan(userId, {
			discipline: submission.value.discipline,
			weeklyHours: submission.value.hours,
		})
		if (!created.ok) {
			return data(
				{
					result: submission.reply({
						formErrors: [
							created.reason === 'open-ended-already-active'
								? O.alreadyActive
								: O.createFailed,
						],
					}),
				},
				{ status: 400 },
			)
		}
		// To *this* plan by its own id: it has no Event to be addressed by, and the
		// active plan may be one toward a race.
		throw redirect(`/training/plan?outline=${created.outlineId}`)
	}

	const submission = parseWithZod(formData, { schema: GoalFormSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const goal = await createFitnessGoalEvent(userId, {
		name: submission.value.name,
		startDate: submission.value.startDate,
		disciplines: [submission.value.discipline],
	})
	// Straight to step two *for that Event*, which opens by naming the Event it
	// just created — so the athlete sees what was written, not just its effect.
	throw redirect(`/training/plan/new/${goal.id}?created=goal`)
}

export default function NewPlanRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const {
		candidates,
		defaultDate,
		openEnded,
		roundWeeks,
		libraryLifts,
		startInvite,
	} = loaderData
	const plannable = candidates.filter(
		(candidate) => candidate.plannedOutlineId == null,
	)
	const alreadyPlanned = candidates.filter(
		(candidate) => candidate.plannedOutlineId != null,
	)

	const [form, fields] = useForm({
		id: 'plan-goal',
		constraint: getZodConstraint(GoalFormSchema),
		// Each form reads only its own reply: the open-ended one carries its intent.
		lastResult:
			actionData?.result?.initialValue?.intent === 'open-ended'
				? undefined
				: actionData?.result,
		defaultValue: { name: '', startDate: defaultDate, discipline: 'run' },
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: GoalFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			{/* Plan's own landing while there is no plan (ADR 0101, ADR 0083): a
			    tab's landing page, so no back affordance — the tab bar is the way
			    out. */}
			<PageHeader title={APP_TAB_LABELS.plan} className="mb-2" />
			{startInvite ? <StartInvite /> : null}
			{/* Page prose sits on the page, not in a card (ui-conventions §1.6). */}
			<div className="mb-6 space-y-1">
				<h2 className="text-heading">{PLAN_NEW_LABELS.heading}</h2>
				<p className="text-footnote text-muted-foreground">
					{PLAN_NEW_LABELS.intro}
				</p>
			</div>

			{/* Three ways in, each a card on Sesong's own chrome (ADR 0090 §4): the
			    athlete's Events, a plan with no end, and a dated goal. */}
			<div className="space-y-6">
				<PlanCard
					titleId="your-events"
					title={PLAN_NEW_LABELS.yourEvents}
					// The full Events list is reached from here as it is from the plan.
					aside={
						<Link
							to="/training/events"
							className="text-foreground relative inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
						>
							{PLAN_NEW_LABELS.allEvents}
						</Link>
					}
				>
					{candidates.length === 0 ? (
						<p className="text-footnote text-muted-foreground">
							{PLAN_NEW_LABELS.noEventsBefore}
							<Link
								to="/training/events/new"
								className="text-foreground font-semibold underline underline-offset-4"
							>
								{PLAN_NEW_LABELS.addEvent}
							</Link>
							.
						</p>
					) : (
						<ul className="divide-border/60 divide-y">
							{plannable.map((candidate) => (
								<EventRow
									key={candidate.id}
									name={candidate.name}
									badge={NB_EVENT_KIND_LABELS[candidate.kind]}
									meta={`${formatNbDate(candidate.startDate, 'UTC')}${
										candidate.disciplines.length > 0
											? ` · ${candidate.disciplines
													.map((discipline) => nbDisciplineLabel(discipline))
													.join(', ')}`
											: ''
									}`}
									action={
										<Link
											to={`/training/plan/new/${candidate.id}`}
											className={cn(
												buttonVariants({ size: 'sm' }),
												'rounded-full px-4',
											)}
										>
											{PLAN_NEW_LABELS.planForEvent}
										</Link>
									}
								/>
							))}
							{alreadyPlanned.map((candidate) => (
								<EventRow
									key={candidate.id}
									name={candidate.name}
									meta={`${formatNbDate(candidate.startDate, 'UTC')} · ${PLAN_NEW_LABELS.alreadyPlanned}`}
									action={
										<PillLink to={`/training/plan?event=${candidate.id}`}>
											{PLAN_NEW_LABELS.openItsPlan}
										</PillLink>
									}
								/>
							))}
						</ul>
					)}
				</PlanCard>

				<OpenEndedSection
					{...openEnded}
					roundWeeks={roundWeeks}
					lastResult={
						actionData?.result?.initialValue?.intent === 'open-ended'
							? actionData.result
							: undefined
					}
				/>

				<PlanCard titleId="set-a-goal" title={PLAN_NEW_LABELS.setAGoal}>
					<div className="space-y-4">
						<p className="text-footnote text-muted-foreground">
							{PLAN_NEW_LABELS.setAGoalIntro}
						</p>
						<Form method="POST" {...getFormProps(form)} className="space-y-4">
							<Field
								labelProps={{ children: PLAN_NEW_LABELS.goal }}
								inputProps={{
									...getInputProps(fields.name, { type: 'text' }),
									placeholder: PLAN_NEW_LABELS.goalPlaceholder,
								}}
								errors={fields.name.errors as string[] | undefined}
							/>
							<Field
								className="sm:max-w-xs"
								labelProps={{ children: PLAN_NEW_LABELS.date }}
								inputProps={{
									...getInputProps(fields.startDate, { type: 'date' }),
								}}
								errors={fields.startDate.errors as string[] | undefined}
							/>
							<SportChoice
								name={fields.discipline.name}
								legend={PLAN_NEW_LABELS.discipline}
								defaultValue="run"
								options={DISCIPLINES.map((discipline) => ({
									value: discipline,
									label: NB_DISCIPLINE_LABELS[discipline],
								}))}
								errors={fields.discipline.errors as string[] | undefined}
							/>
							<ErrorList errors={form.errors as string[] | undefined} />
							<Button type="submit" className="w-full sm:w-auto">
								{PLAN_NEW_LABELS.create}
							</Button>
						</Form>
					</div>
				</PlanCard>
			</div>

			<LibrarySection lifts={libraryLifts} className="mt-10" />
		</main>
	)
}

/**
 * No plan yet: the simple start first, the way I dag's no-plan card asks
 * (ADR 0101 §4), and setting a season up by hand below it — the expert path
 * stays, one scroll further.
 */
function StartInvite() {
	return (
		<PlanCard
			titleId="start-invite"
			title={PLAN_LEAD_LABELS.noPlanTitle}
			className="mb-8"
			contentClassName="space-y-3"
		>
			<p className="text-body text-muted-foreground [text-wrap:pretty]">
				{PLAN_LEAD_LABELS.noPlanBody}
			</p>
			<Link
				to="/start"
				data-plan-start-invite
				className={cn(
					buttonVariants({ size: 'default' }),
					'h-12 w-full text-base font-semibold sm:w-auto sm:px-8',
				)}
			>
				{PLAN_LEAD_LABELS.noPlanAction}
			</Link>
		</PlanCard>
	)
}

/**
 * One Event on the list: its name and kind, when it is, and the one thing to do
 * with it. A row in the card, not a card of its own — cards inside a card are
 * the nesting the luma direction separates by tone instead.
 */
function EventRow({
	name,
	badge,
	meta,
	action,
}: {
	name: string
	badge?: string
	meta: string
	action: React.ReactNode
}) {
	return (
		<li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
			<div className="min-w-0 flex-1 space-y-0.5">
				<p className="text-callout flex flex-wrap items-center gap-2 font-semibold [overflow-wrap:anywhere]">
					{name}
					{badge ? <Badge variant="secondary">{badge}</Badge> : null}
				</p>
				<p className="text-footnote text-muted-foreground tabular-nums">
					{meta}
				</p>
			</div>
			<div className="shrink-0">{action}</div>
		</li>
	)
}

/**
 * _Hold meg aktiv_: a plan with no Event and no end date (ADR 0079). Two
 * questions and nothing else — which endurance Discipline, and how many hours a
 * week, pre-filled from the athlete's own last four weeks where there are any.
 * The plan it makes runs in rounds, and says so before it is made.
 */
function OpenEndedSection({
	outlineId,
	hoursByDiscipline,
	defaultDiscipline,
	roundWeeks,
	lastResult,
}: {
	outlineId: string | null
	roundWeeks: number
	hoursByDiscipline: Partial<Record<CardioDiscipline, number>>
	defaultDiscipline: CardioDiscipline
	lastResult: Parameters<typeof useForm>[0]['lastResult']
}) {
	const [discipline, setDiscipline] =
		useState<CardioDiscipline>(defaultDiscipline)
	const [form, fields] = useForm({
		id: 'plan-open-ended',
		constraint: getZodConstraint(OpenEndedFormSchema),
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: OpenEndedFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const prefill = hoursByDiscipline[discipline]

	return (
		<PlanCard titleId="open-ended" title={OPEN_ENDED_PLAN_LABEL}>
			<div className="space-y-4">
				<p className="text-footnote text-muted-foreground">
					{O.intro(roundWeeks)}
				</p>
				{outlineId ? (
					<p className="text-footnote">
						{O.alreadyActive}{' '}
						<Link
							to={`/training/plan?outline=${outlineId}`}
							className="text-foreground relative inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
						>
							{O.openPlan}
						</Link>
					</p>
				) : (
					<Form method="POST" {...getFormProps(form)} className="space-y-4">
						<input type="hidden" name="intent" value="open-ended" />
						<SportChoice
							name={fields.discipline.name}
							legend={O.discipline}
							value={discipline}
							onValueChange={(next) => setDiscipline(next as CardioDiscipline)}
							options={CARDIO_DISCIPLINES.map((option) => ({
								value: option,
								label: NB_DISCIPLINE_LABELS[option],
							}))}
							errors={fields.discipline.errors as string[] | undefined}
						/>
						<div className="space-y-1.5">
							<Field
								// Keyed on the Discipline so its own pre-fill lands when it
								// changes.
								key={discipline}
								className="sm:max-w-xs"
								labelProps={{ children: O.hours }}
								inputProps={{
									...getInputProps(fields.hours, { type: 'number' }),
									step: '0.5',
									min: '0.5',
									inputMode: 'decimal',
									defaultValue: prefill ?? '',
								}}
								errors={fields.hours.errors as string[] | undefined}
							/>
							<p className="text-footnote text-muted-foreground">
								{prefill != null ? O.hoursFromHistory : O.hoursUnmeasured}
							</p>
						</div>
						<ErrorList errors={form.errors as string[] | undefined} />
						<Button type="submit" className="w-full sm:w-auto">
							{O.create}
						</Button>
					</Form>
				)}
			</div>
		</PlanCard>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
