/**
 * Step one of authoring a plan: **what are you building toward?**
 *
 * The athlete either picks an **Event** they already have, or sets a named, dated
 * goal that **visibly** creates a `fitness-goal` Event — an explicit step they
 * take, never a record the app writes behind their back the way Plan Generation
 * used to (ADR 0039, spec #399 stories 1–2). Either way the next step opens
 * against a real Event, so the plan has an anchor before it has any structure.
 *
 * An Event that already carries a Plan Outline stays on the list, saying so and
 * linking to its plan, rather than vanishing — the athlete came looking for it.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
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
import { EVENT_KIND_LABELS } from '#app/utils/labels.ts'
import {
	createFitnessGoalEvent,
	listPlanAnchorCandidates,
} from '#app/utils/plan-outline/authoring.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { DISCIPLINES, type Discipline } from '#app/utils/workout-schema.ts'
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

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const candidates = await listPlanAnchorCandidates(userId)
	return {
		candidates,
		defaultDate: new Date().toISOString().slice(0, 10),
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

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
	const { candidates, defaultDate } = loaderData
	const plannable = candidates.filter(
		(candidate) => candidate.plannedOutlineId == null,
	)
	const alreadyPlanned = candidates.filter(
		(candidate) => candidate.plannedOutlineId != null,
	)

	const [form, fields] = useForm({
		id: 'plan-goal',
		constraint: getZodConstraint(GoalFormSchema),
		lastResult: actionData?.result,
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

export { GeneralErrorBoundary as ErrorBoundary }
