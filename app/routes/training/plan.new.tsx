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
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatNbDate } from '#app/utils/format.ts'
import {
	APP_TAB_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_EVENT_KIND_LABELS,
	nbDisciplineLabel,
	OPEN_ENDED_FORM_LABELS,
	OPEN_ENDED_PLAN_LABEL,
	PLAN_NEW_LABELS,
} from '#app/utils/labels.ts'
import {
	createFitnessGoalEvent,
	createKeepMeActivePlan,
	listPlanAnchorCandidates,
	readOpenEndedPlanDefaults,
} from '#app/utils/plan-outline/authoring.server.ts'
import { OpenEndedFieldsSchema } from '#app/utils/plan-outline/open-ended-schema.ts'
import { OPEN_ENDED_ROUND_WEEKS } from '#app/utils/plan-outline/presets.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	type CardioDiscipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.new.ts'

export const meta: Route.MetaFunction = () => [
	{ title: `${APP_TAB_LABELS.season} | Trainm8` },
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
	const [candidates, openEnded] = await Promise.all([
		listPlanAnchorCandidates(userId),
		readOpenEndedPlanDefaults(userId),
	])
	return {
		candidates,
		defaultDate: new Date().toISOString().slice(0, 10),
		openEnded,
		// Read here, not imported by the component: the constant lives in a
		// `.server` module, and a client-side visit (the Sesong tab, ADR 0083)
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
	const { candidates, defaultDate, openEnded, roundWeeks } = loaderData
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
			{/* Sesong's own landing while there is no plan (ADR 0083): a tab's
			    landing page, so no back affordance — the tab bar is the way out. */}
			<PageHeader title={APP_TAB_LABELS.season} className="mb-2" />
			<p className="mb-1 text-base font-semibold">{PLAN_NEW_LABELS.heading}</p>
			<p className="text-muted-foreground mb-6 text-sm">
				{PLAN_NEW_LABELS.intro}
			</p>

			<section aria-labelledby="your-events" className="mb-8 space-y-4">
				{/* The full Events list is reached from here as it is from the plan. */}
				<div className="flex items-baseline justify-between gap-3">
					<h2 id="your-events" className="text-lg font-semibold">
						{PLAN_NEW_LABELS.yourEvents}
					</h2>
					<Link
						to="/training/events"
						className="text-muted-foreground text-sm underline"
					>
						{PLAN_NEW_LABELS.allEvents}
					</Link>
				</div>
				{candidates.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{PLAN_NEW_LABELS.noEventsBefore}
						<Link to="/training/events/new" className="underline">
							{PLAN_NEW_LABELS.addEvent}
						</Link>
						.
					</p>
				) : null}
				{plannable.map((candidate) => (
					<Card key={candidate.id}>
						<CardHeader className="gap-1">
							<CardTitle className="flex flex-wrap items-center gap-2 text-base">
								{candidate.name}
								<Badge variant="secondary">
									{NB_EVENT_KIND_LABELS[candidate.kind]}
								</Badge>
							</CardTitle>
							<p className="text-muted-foreground text-sm">
								{formatNbDate(candidate.startDate, 'UTC')}
								{candidate.disciplines.length > 0
									? ` · ${candidate.disciplines
											.map((discipline) => nbDisciplineLabel(discipline))
											.join(', ')}`
									: null}
							</p>
						</CardHeader>
						<CardContent>
							<Link
								to={`/training/plan/new/${candidate.id}`}
								className={buttonVariants({ size: 'sm' })}
							>
								{PLAN_NEW_LABELS.planForEvent}
							</Link>
						</CardContent>
					</Card>
				))}
				{alreadyPlanned.map((candidate) => (
					<Card key={candidate.id} className="opacity-80">
						<CardHeader className="gap-1">
							<CardTitle className="text-base">{candidate.name}</CardTitle>
							<p className="text-muted-foreground text-sm">
								{formatNbDate(candidate.startDate, 'UTC')} ·{' '}
								{PLAN_NEW_LABELS.alreadyPlanned}
							</p>
						</CardHeader>
						<CardContent>
							<Link
								to={`/training/plan?event=${candidate.id}`}
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								{PLAN_NEW_LABELS.openItsPlan}
							</Link>
						</CardContent>
					</Card>
				))}
			</section>

			<OpenEndedSection
				{...openEnded}
				roundWeeks={roundWeeks}
				lastResult={
					actionData?.result?.initialValue?.intent === 'open-ended'
						? actionData.result
						: undefined
				}
			/>

			<section aria-labelledby="set-a-goal" className="space-y-4">
				<h2 id="set-a-goal" className="text-lg font-semibold">
					{PLAN_NEW_LABELS.setAGoal}
				</h2>
				<p className="text-muted-foreground text-sm">
					{PLAN_NEW_LABELS.setAGoalIntro}
				</p>
				<Form method="POST" {...getFormProps(form)}>
					<div className="space-y-4">
						<Field
							labelProps={{ children: PLAN_NEW_LABELS.goal }}
							inputProps={{
								...getInputProps(fields.name, { type: 'text' }),
								placeholder: PLAN_NEW_LABELS.goalPlaceholder,
							}}
							errors={fields.name.errors as string[] | undefined}
						/>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Field
								labelProps={{ children: PLAN_NEW_LABELS.date }}
								inputProps={{
									...getInputProps(fields.startDate, { type: 'date' }),
								}}
								errors={fields.startDate.errors as string[] | undefined}
							/>
							<fieldset className="space-y-1.5">
								<legend className="text-sm font-medium">
									{PLAN_NEW_LABELS.discipline}
								</legend>
								<div className="flex flex-wrap gap-x-4">
									{DISCIPLINES.map((discipline) => (
										<label
											key={discipline}
											className="flex min-h-11 cursor-pointer items-center gap-2"
										>
											<input
												type="radio"
												name={fields.discipline.name}
												value={discipline}
												defaultChecked={discipline === 'run'}
												className="size-4"
											/>
											<span className="text-sm">
												{NB_DISCIPLINE_LABELS[discipline]}
											</span>
										</label>
									))}
								</div>
								<ErrorList
									errors={fields.discipline.errors as string[] | undefined}
								/>
							</fieldset>
						</div>
						<ErrorList errors={form.errors as string[] | undefined} />
						<Button type="submit" className="w-full sm:w-auto">
							{PLAN_NEW_LABELS.create}
						</Button>
					</div>
				</Form>
			</section>
		</main>
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
		<section aria-labelledby="open-ended" className="mb-8 space-y-4">
			<h2 id="open-ended" className="text-lg font-semibold">
				{OPEN_ENDED_PLAN_LABEL}
			</h2>
			<p className="text-muted-foreground text-sm">{O.intro(roundWeeks)}</p>
			{outlineId ? (
				<p className="text-sm">
					{O.alreadyActive}{' '}
					<Link
						to={`/training/plan?outline=${outlineId}`}
						className="underline"
					>
						{O.openPlan}
					</Link>
				</p>
			) : (
				<Form method="POST" {...getFormProps(form)}>
					<input type="hidden" name="intent" value="open-ended" />
					<div className="space-y-4">
						<fieldset className="space-y-1.5">
							<legend className="text-sm font-medium">{O.discipline}</legend>
							<div className="flex flex-wrap gap-x-4">
								{CARDIO_DISCIPLINES.map((option) => (
									<label
										key={option}
										className="flex min-h-11 cursor-pointer items-center gap-2"
									>
										<input
											type="radio"
											name={fields.discipline.name}
											value={option}
											checked={option === discipline}
											onChange={() => setDiscipline(option)}
											className="size-4"
										/>
										<span className="text-sm">
											{NB_DISCIPLINE_LABELS[option]}
										</span>
									</label>
								))}
							</div>
							<ErrorList
								errors={fields.discipline.errors as string[] | undefined}
							/>
						</fieldset>
						<Field
							// Keyed on the Discipline so its own pre-fill lands when it changes.
							key={discipline}
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
						<p className="text-muted-foreground -mt-2 text-sm">
							{prefill != null ? O.hoursFromHistory : O.hoursUnmeasured}
						</p>
						<ErrorList errors={form.errors as string[] | undefined} />
						<Button type="submit" className="w-full sm:w-auto">
							{O.create}
						</Button>
					</div>
				</Form>
			)}
		</section>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
