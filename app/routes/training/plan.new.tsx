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
import { formatDate } from '#app/utils/format.ts'
import { EVENT_KIND_LABELS, OPEN_ENDED_PLAN_LABEL } from '#app/utils/labels.ts'
import {
	createFitnessGoalEvent,
	createOpenEndedPlan,
	listPlanAnchorCandidates,
	readOpenEndedPlanDefaults,
} from '#app/utils/plan-outline/authoring.server.ts'
import { OPEN_ENDED_ROUND_WEEKS } from '#app/utils/plan-outline/presets.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	CARDIO_DISCIPLINES,
	DISCIPLINES,
	type CardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.new.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Plan a season | Trainm8' },
]

/**
 * The goal step's own form: a name, a date and the discipline it is in. The
 * discipline is asked for because it is what the Event needs to be a real Event —
 * and it is what proposes the plan's first Training Track in the next step.
 */
const GoalFormSchema = z.object({
	name: z.string().trim().min(1, 'Name what you are building toward').max(120),
	startDate: z.coerce.date({
		errorMap: () => ({ message: 'A valid date is required' }),
	}),
	discipline: z.enum(DISCIPLINES, {
		errorMap: () => ({ message: 'Pick the discipline' }),
	}),
})

/**
 * _Hold meg aktiv_'s own form: which endurance Discipline, and how many hours a
 * week. Endurance only, because the plan's one track is measured in hours, and a
 * strength track speaks sets (ADR 0043 §2).
 */
const OpenEndedFormSchema = z.object({
	intent: z.literal('open-ended'),
	discipline: z.enum(CARDIO_DISCIPLINES, {
		errorMap: () => ({ message: 'Velg en aktivitet' }),
	}),
	weeklyHours: z.coerce
		.number({ errorMap: () => ({ message: 'Skriv hvor mange timer i uka' }) })
		.positive('Mer enn null timer i uka')
		.max(40, 'Høyst 40 timer i uka'),
})

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
		const created = await createOpenEndedPlan(userId, {
			discipline: submission.value.discipline,
			weeklyHours: submission.value.weeklyHours,
		})
		if (!created.ok) {
			return data(
				{
					result: submission.reply({
						formErrors: [
							created.reason === 'open-ended-already-active'
								? 'Du har allerede en plan uten slutt.'
								: 'Planen kunne ikke lages.',
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
	const { candidates, defaultDate, openEnded } = loaderData
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
			<PageHeader
				title="What are you building toward?"
				back={{ to: '/', label: 'Home' }}
				className="mb-2"
			/>
			<p className="text-muted-foreground mb-6 text-sm">
				Pick the event your season builds toward, or set a dated goal instead.
			</p>

			<section aria-labelledby="your-events" className="mb-8 space-y-4">
				<h2 id="your-events" className="text-lg font-semibold">
					Your upcoming events
				</h2>
				{candidates.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nothing on the calendar yet — set a goal below, or{' '}
						<Link to="/training/events/new" className="underline">
							add an event
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
									{EVENT_KIND_LABELS[candidate.kind]}
								</Badge>
							</CardTitle>
							<p className="text-muted-foreground text-sm">
								{formatDate(candidate.startDate, 'UTC')}
								{candidate.disciplines.length > 0
									? ` · ${candidate.disciplines
											.map((discipline) => getDisciplineLabel(discipline))
											.join(', ')}`
									: null}
							</p>
						</CardHeader>
						<CardContent>
							<Link
								to={`/training/plan/new/${candidate.id}`}
								className={buttonVariants({ size: 'sm' })}
							>
								Plan for this event
							</Link>
						</CardContent>
					</Card>
				))}
				{alreadyPlanned.map((candidate) => (
					<Card key={candidate.id} className="opacity-80">
						<CardHeader className="gap-1">
							<CardTitle className="text-base">{candidate.name}</CardTitle>
							<p className="text-muted-foreground text-sm">
								{formatDate(candidate.startDate, 'UTC')} · this already has a
								plan
							</p>
						</CardHeader>
						<CardContent>
							<Link
								to={`/training/plan?event=${candidate.id}`}
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								Open its plan
							</Link>
						</CardContent>
					</Card>
				))}
			</section>

			<OpenEndedSection
				{...openEnded}
				lastResult={
					actionData?.result?.initialValue?.intent === 'open-ended'
						? actionData.result
						: undefined
				}
			/>

			<section aria-labelledby="set-a-goal" className="space-y-4">
				<h2 id="set-a-goal" className="text-lg font-semibold">
					Or set a goal
				</h2>
				<p className="text-muted-foreground text-sm">
					This creates a dated fitness goal on your calendar, so the season has
					something real to build toward.
				</p>
				<Form method="POST" {...getFormProps(form)}>
					<div className="space-y-4">
						<Field
							labelProps={{ children: 'Goal' }}
							inputProps={{
								...getInputProps(fields.name, { type: 'text' }),
								placeholder: 'e.g. Sub-40 10k shape',
							}}
							errors={fields.name.errors as string[] | undefined}
						/>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Field
								labelProps={{ children: 'Date' }}
								inputProps={{
									...getInputProps(fields.startDate, { type: 'date' }),
								}}
								errors={fields.startDate.errors as string[] | undefined}
							/>
							<fieldset className="space-y-1.5">
								<legend className="text-sm font-medium">Discipline</legend>
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
												{getDisciplineLabel(discipline as Discipline)}
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
							Create goal and continue
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
	lastResult,
}: {
	outlineId: string | null
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
			<p className="text-muted-foreground text-sm">
				Ingen løp og ingen sluttdato. Planen går i blokker på{' '}
				{OPEN_ENDED_ROUND_WEEKS} uker, tre som bygger og én lett, og fortsetter
				blokk for blokk.
			</p>
			{outlineId ? (
				<p className="text-sm">
					Du har allerede en plan uten slutt.{' '}
					<Link
						to={`/training/plan?outline=${outlineId}`}
						className="underline"
					>
						Åpne planen
					</Link>
				</p>
			) : (
				<Form method="POST" {...getFormProps(form)}>
					<input type="hidden" name="intent" value="open-ended" />
					<div className="space-y-4">
						<fieldset className="space-y-1.5">
							<legend className="text-sm font-medium">
								Hva trener du mest?
							</legend>
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
											{getDisciplineLabel(option)}
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
							labelProps={{ children: 'Timer i uka' }}
							inputProps={{
								...getInputProps(fields.weeklyHours, { type: 'number' }),
								step: '0.5',
								min: '0.5',
								inputMode: 'decimal',
								defaultValue: prefill ?? '',
							}}
							errors={fields.weeklyHours.errors as string[] | undefined}
						/>
						<p className="text-muted-foreground -mt-2 text-sm">
							{prefill != null
								? 'Snittet ditt de siste 4 ukene. Endre det om du vil.'
								: 'Vi fant ingen økter å regne fra, så skriv det du har tid til.'}
						</p>
						<ErrorList errors={form.errors as string[] | undefined} />
						<Button type="submit" className="w-full sm:w-auto">
							Lag planen
						</Button>
					</div>
				</Form>
			)}
		</section>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
