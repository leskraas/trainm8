/**
 * Step two of authoring a plan: the **Plan Start Week**, the first **Training
 * Track**, and the phases.
 *
 * Three things happen here, and each is an athlete's decision the app only
 * proposes:
 *
 * - The **Plan Start Week** is *authored*, never counted back from the Event, so
 *   adding a phase later can never move the plan's start into weeks already lived
 *   (ADR 0044 §3). It is offered as a list of Mondays in the **Athlete Timezone**,
 *   which is how it is stored — so an invalid start week cannot be submitted.
 * - The track's **Volume Currency** is proposed from the athlete's own logged
 *   history and then **locked** for the life of the track (ADR 0043 §2): distance
 *   where their history measures distance, `sets` and no choice for strength, and
 *   an honest "you pick" where there is no history to read.
 * - The **Season Anchor**'s first value is pre-filled from that same history with
 *   the derivation shown, and is theirs to change before saving (ADR 0040 §6).
 *   Once saved it is authored and never re-read, so the plan does not mutate as
 *   activities import in the background.
 *
 * Phases carry a name and a week count and nothing else (ADR 0041); their spans
 * are derived from the start week, which is what makes them contiguous by
 * construction.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { addDays, dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatDate,
	formatVolumeTotal,
	formatWeeklyVolume,
} from '#app/utils/format.ts'
import { DISCIPLINE_LABELS, VOLUME_CURRENCY_LABELS } from '#app/utils/labels.ts'
import {
	PlanOutlineCreateSchema,
	WeekKeySchema,
	type PlanOutlineCreateInput,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	createPlanOutline,
	getPlanAnchorCandidate,
	type CreateOutlineRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import {
	VOLUME_CURRENCIES,
	type VolumeCurrency,
} from '#app/utils/plan-outline/derive.ts'
import { readAnchorContext } from '#app/utils/plan-outline/history.server.ts'
import {
	ANCHOR_WINDOW_WEEKS,
	defaultTrackDiscipline,
	proposeTrack,
	type AnchorDerivation,
} from '#app/utils/plan-outline/proposal.ts'
import { type Route } from './+types/plan.new.$eventId.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Lay out your season | Trainm8' },
]

/** How many Mondays either side of this week the start-week picker offers. */
const WEEKS_BACK = 4
const WEEKS_FORWARD = 16
/** Phase rows the form renders. Blank rows are ignored, so fewer phases is fine. */
const PHASE_ROWS = 6

const PlanFormSchema = z.object({
	// The shared `WeekKeySchema`, not a looser string: the Monday rule then reports
	// as a *field* error on this form, and a tampered body is refused by the same
	// rule the service applies rather than by a second, weaker one.
	startWeekKey: WeekKeySchema,
	currency: z.enum(VOLUME_CURRENCIES, {
		errorMap: () => ({ message: 'Pick the unit you plan in' }),
	}),
	anchorValue: z.coerce
		.number({ errorMap: () => ({ message: 'A starting volume is required' }) })
		.positive('Your starting volume is more than zero'),
})

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const event = await getPlanAnchorCandidate(userId, params.eventId)
	// Not the athlete's, cancelled, or already run: back to the first question,
	// which is where the athlete can see what *is* plannable.
	if (!event) throw redirect('/training/plan/new')
	// Already planned — the plan itself is the honest destination.
	if (event.plannedOutlineId) {
		throw redirect(`/training/plan?event=${params.eventId}`)
	}

	const { timezone, currentWeekKey, volumes } = await readAnchorContext(userId)
	const discipline = defaultTrackDiscipline(event.disciplines, volumes)
	const volume = volumes.find((entry) => entry.discipline === discipline)
	const proposal = volume ? proposeTrack(volume) : null

	const weekOptions = Array.from(
		{ length: WEEKS_BACK + WEEKS_FORWARD + 1 },
		(_, index) => {
			const weekKey = addDays(currentWeekKey, (index - WEEKS_BACK) * 7)
			return {
				weekKey,
				startsAt: dayBoundsUTC(weekKey, timezone).start,
				isCurrent: weekKey === currentWeekKey,
			}
		},
	)

	return {
		event,
		createdGoal: new URL(request.url).searchParams.get('created') === 'goal',
		timezone,
		currentWeekKey,
		weekOptions,
		discipline,
		proposal,
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, { schema: PlanFormSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const discipline = String(formData.get('discipline') ?? '')
	const names = formData.getAll('phaseName').map(String)
	const weeks = formData.getAll('phaseWeeks').map(String)
	const phases = names
		.map((name, index) => ({ name: name.trim(), weeks: weeks[index] ?? '' }))
		// A row with neither field filled is a row the athlete did not use. A row
		// with one of the two is a mistake, and is kept so the schema can say so.
		.filter((row) => row.name !== '' || row.weeks !== '')
		.map((row) => ({ name: row.name, weeks: Number(row.weeks) }))

	const input: PlanOutlineCreateInput = {
		eventId: params.eventId,
		startWeekKey: submission.value.startWeekKey,
		phases,
		tracks: [
			{
				discipline:
					discipline as PlanOutlineCreateInput['tracks'][number]['discipline'],
				currency: submission.value.currency,
				anchorValue: submission.value.anchorValue,
			},
		],
	}

	const parsed = PlanOutlineCreateSchema.safeParse(input)
	if (!parsed.success) {
		return data(
			{
				result: submission.reply({
					formErrors: parsed.error.issues.map((issue) => issue.message),
				}),
			},
			{ status: 400 },
		)
	}

	const created = await createPlanOutline(userId, input)
	if (!created.ok) {
		return data(
			{
				result: submission.reply({
					formErrors: [refusalMessage(created.reason)],
				}),
			},
			{ status: 400 },
		)
	}

	// To *this* plan, not to the nearest one: authoring a season for a race two
	// seasons out must land on the season just authored.
	throw redirect(`/training/plan?event=${params.eventId}`)
}

/**
 * Each refusal the service can return, worded. Typed to the union rather than to
 * `string`, so a refusal added later is a compile error here instead of falling
 * into a catch-all the athlete cannot act on.
 */
function refusalMessage(reason: CreateOutlineRefusal): string {
	switch (reason) {
		case 'event-not-found':
			return 'That event is not available to plan against.'
		case 'event-past':
			return 'That event has already happened, so it cannot anchor a new plan.'
		case 'event-cancelled':
			return 'That event is cancelled, so it cannot anchor a plan.'
		case 'event-already-planned':
			return 'That event already has a plan.'
	}
}

export default function NewPlanStructureRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const {
		event,
		createdGoal,
		timezone,
		currentWeekKey,
		weekOptions,
		discipline,
		proposal,
	} = loaderData

	// Strength authors `sets` and is offered nothing else (ADR 0043 §2), so its
	// currency is stated rather than picked — a one-option select would be the dead
	// control ADR 0044 §8 argues against.
	const soleCurrency =
		proposal?.offered.length === 1 ? proposal.offered[0] : undefined

	const [form, fields] = useForm({
		id: 'plan-structure',
		constraint: getZodConstraint(PlanFormSchema),
		lastResult: actionData?.result,
		defaultValue: {
			startWeekKey: currentWeekKey,
			currency: soleCurrency ?? proposal?.currency ?? '',
			anchorValue: proposal?.currency
				? (proposal.anchors[proposal.currency]?.value ?? '')
				: '',
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PlanFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	// The currency currently chosen, and *its* pre-fill — read from the live field
	// so the two move together rather than both freezing on the proposal.
	const currency = (soleCurrency ??
		fields.currency.value ??
		proposal?.currency) as VolumeCurrency | undefined
	const prefill = currency ? proposal?.anchors[currency] : undefined

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Lay out your season"
				back={{ to: '/training/plan/new', label: 'Choose a goal' }}
				className="mb-4"
			/>

			{/* Page prose sits on the page background, not in a card (§1.6). */}
			<div className="mb-8 space-y-1">
				<p className="flex flex-wrap items-center gap-2 font-medium">
					{event.name}
					{createdGoal ? <Badge variant="secondary">Goal created</Badge> : null}
				</p>
				<p className="text-muted-foreground text-sm">
					{formatDate(event.startDate, 'UTC')}
					{createdGoal ? ' · added to your calendar as a fitness goal' : null}
				</p>
			</div>

			{discipline == null || proposal == null ? (
				<p className="text-sm">
					This event names no discipline, so there is nothing to build a
					training track from.{' '}
					<Link to={`/training/events/${event.id}/edit`} className="underline">
						Add one to the event
					</Link>{' '}
					and come back.
				</p>
			) : (
				<Form method="POST" {...getFormProps(form)}>
					<input type="hidden" name="discipline" value={discipline} />
					<div className="space-y-8">
						<section aria-labelledby="start-week" className="space-y-4">
							<h2 id="start-week" className="text-lg font-semibold">
								Which week does your plan start?
							</h2>
							<p className="text-muted-foreground text-sm">
								Your phases lay forward from here. Nothing counts back from your
								event, so adding a phase later never moves your start.
							</p>
							{/* Every option is a Monday in the Athlete Timezone, which is how
							    the week is stored (ADR 0044 §3) — so an invalid Plan Start Week
							    is unrepresentable rather than validated against. */}
							<SelectField
								meta={fields.startWeekKey}
								labelProps={{
									children: 'Plan start week',
									className: 'sr-only',
								}}
								items={weekOptions.map((option) => ({
									value: option.weekKey,
									label: `${formatDate(option.startsAt, timezone)}${
										option.isCurrent ? ' · this week' : ''
									}`,
								}))}
								errors={fields.startWeekKey.errors as string[] | undefined}
							/>
						</section>

						<section aria-labelledby="your-track" className="space-y-4">
							<h2 id="your-track" className="text-lg font-semibold">
								Your {DISCIPLINE_LABELS[discipline]} training track
							</h2>

							{soleCurrency ? (
								// Strength is offered `sets` and no choice at all (ADR 0043 §2),
								// so there is no field here to make dead — the unit is stated.
								<>
									<input
										type="hidden"
										name={fields.currency.name}
										value={soleCurrency}
									/>
									<p className="text-sm">
										Planned in{' '}
										<span className="font-medium">
											{VOLUME_CURRENCY_LABELS[soleCurrency].toLowerCase()}
										</span>{' '}
										<span className="text-muted-foreground">
											· strength&rsquo;s own unit, not a choice
										</span>
									</p>
								</>
							) : (
								<SelectField
									meta={fields.currency}
									labelProps={{ children: 'What do you plan in?' }}
									placeholder="Pick the unit you plan in"
									items={proposal.offered.map((option) => ({
										value: option,
										label: VOLUME_CURRENCY_LABELS[option],
									}))}
									errors={fields.currency.errors as string[] | undefined}
								/>
							)}
							<p className="text-muted-foreground text-sm">
								{proposal.currency
									? 'Proposed from your own history. '
									: 'Nothing in your last 4 weeks to read a unit from, so this one is yours to choose. '}
								This is locked once the track exists — changing units would
								rewrite the unit of every week you have already trained.
							</p>

							{/* The anchor is re-keyed on the currency so switching units brings
							    that unit's own pre-fill and derivation: anchor value and Volume
							    Currency are one act (ADR 0043 §2), and a distance figure
							    relabelled as hours would be a number nobody authored. */}
							<Field
								key={currency ?? 'unset'}
								labelProps={{
									children: 'Where you are starting from, per week',
								}}
								inputProps={{
									...getInputProps(fields.anchorValue, { type: 'number' }),
									defaultValue: prefill?.value ?? '',
									step: 'any',
									min: 0,
									inputMode: 'decimal',
								}}
								errors={fields.anchorValue.errors as string[] | undefined}
							/>
							<p className="text-muted-foreground text-sm">
								{prefill
									? derivationSentence(prefill.derivation)
									: `Nothing in your last ${ANCHOR_WINDOW_WEEKS} weeks to read this from — type the weekly volume you are starting at.`}
							</p>
						</section>

						<section aria-labelledby="your-phases" className="space-y-4">
							<h2 id="your-phases" className="text-lg font-semibold">
								Name your phases
							</h2>
							<p className="text-muted-foreground text-sm">
								A phase says when and why, never how much. They sit end to end
								from your start week, and every 4th week is a recovery week by
								the documented convention.
							</p>
							<ul className="space-y-2">
								{Array.from({ length: PHASE_ROWS }, (_, index) => (
									<li key={index} className="flex items-start gap-2">
										<Field
											className="flex-1"
											labelProps={{
												children: `Phase ${index + 1} name`,
												className: index === 0 ? undefined : 'sr-only',
											}}
											inputProps={{
												id: `phaseName-${index}`,
												name: 'phaseName',
												type: 'text',
												placeholder: index === 0 ? 'e.g. Base' : undefined,
											}}
										/>
										<Field
											className="w-24"
											labelProps={{
												children: 'Weeks',
												className: index === 0 ? undefined : 'sr-only',
											}}
											inputProps={{
												id: `phaseWeeks-${index}`,
												name: 'phaseWeeks',
												type: 'number',
												min: 1,
												inputMode: 'numeric',
											}}
										/>
									</li>
								))}
							</ul>
						</section>

						<ErrorList errors={form.errors as string[] | undefined} />

						<Button type="submit" className="w-full sm:w-auto">
							Create plan
						</Button>
					</div>
				</Form>
			)}
		</main>
	)
}

/**
 * The pre-fill's derivation, worded. The numbers travel as a value object
 * (`AnchorDerivation`) and every one of them is the athlete's own training, so the
 * sentence names what it read rather than asserting a figure (ADR 0040 §6).
 */
function derivationSentence(derivation: AnchorDerivation): string {
	const average = derivation.total / derivation.windowWeeks
	const trained =
		derivation.weeksTrained === derivation.windowWeeks
			? ''
			: ` — you trained ${derivation.weeksTrained} of them`
	return `Your last ${derivation.windowWeeks} weeks averaged ${formatWeeklyVolume(
		average,
		derivation.currency,
	)} (${formatVolumeTotal(derivation.total, derivation.currency)} in total)${trained}.`
}

export { GeneralErrorBoundary as ErrorBoundary }
