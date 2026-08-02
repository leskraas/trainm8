/**
 * Step two of authoring a plan: **the shape of the season**, the size of its
 * weeks, and the week it opens in.
 *
 * The order is the whole point of this screen. It used to open with a unit, a
 * weekly volume and six blank *Phase name / Weeks* rows — three expert questions
 * before the athlete had seen a season at all, and the three built-in shapes were
 * offered only *afterwards*, on the plan page, behind a closed section. So an
 * athlete who does not plan for a living had to invent a periodization scheme to
 * get to the screen that would have offered them one. Now the shapes lead: pick a
 * picture, and the phases, the **Volume Ramp**, the **Block Boundary Step** and
 * the **Quality Session Mix** all land with it (`createPlanOutline`). Laying out
 * your own blocks is still here, one tap away, for the athlete who wants it.
 *
 * Everything else on the screen is a decision the app only *proposes*:
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
 * **One section per Discipline the Event names**, not one for its first. A
 * triathlon is one season measured three ways over one shared phase timeline
 * (ADR 0043 §1), so a triathlete leaves this screen with swim, bike and run tracks
 * — each with its own proposed unit and its own anchor read from its own history —
 * rather than with one plan they then have to author twice more.
 *
 * Two rules the shape step inherits from the gallery it shares its pictures with,
 * and does not get to soften because it is an onboarding screen:
 *
 * - **A shape carries no size and no horizon.** It says nothing about the start
 *   week, the tracks, their currencies or their anchors — those are asked for
 *   below it and never inferred from the picture (ADR 0043 §1).
 * - **A shape is a fixed length.** Each card says where it would land against
 *   *this* Event — on its week, before it, past it — because that is the one thing
 *   the illustration cannot show, and it is the difference between the three
 *   shapes for an athlete with 12 weeks to race day. Nothing here stretches a
 *   block to close that gap; the plan says where it ends and the athlete decides
 *   (ADR 0044 §3).
 *
 * Phases carry a name and a week count and nothing else (ADR 0041); their spans
 * are derived from the start week, which is what makes them contiguous by
 * construction.
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type FieldMetadata,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	addDays,
	dayBoundsUTC,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDate } from '#app/utils/format.ts'
import { DISCIPLINE_LABELS, VOLUME_CURRENCY_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
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
import { eventFit, type EventFit } from '#app/utils/plan-outline/event-fit.ts'
import { readAnchorContext } from '#app/utils/plan-outline/history.server.ts'
import {
	PRESET_KEYS,
	presetWeeks,
	type PeriodizationPreset,
} from '#app/utils/plan-outline/presets.ts'
import {
	ANCHOR_WINDOW_WEEKS,
	proposeTrack,
	trackDisciplinesFor,
	type TrackProposal,
} from '#app/utils/plan-outline/proposal.ts'
import { DISCIPLINES, type Discipline } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.new.$eventId.ts'
import {
	LoadProfile,
	presetProfiles,
	rhythmSentence,
} from './__preset-gallery.tsx'
import { anchorSentence } from './__track-editor.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Lay out your season | Trainm8' },
]

/** How many Mondays either side of this week the start-week picker offers. */
const WEEKS_BACK = 4
const WEEKS_FORWARD = 16
/** Phase rows the form renders. Blank rows are ignored, so fewer phases is fine. */
const PHASE_ROWS = 6

/**
 * The answer to "how should this season be built": one of the shapes the app
 * ships, or `own` — the athlete's own blocks, typed below.
 *
 * `own` is a member of the same enum rather than a checkbox beside it, because
 * the two are one choice with four answers. A radio group also makes the escape
 * hatch as visible as the shapes: an athlete who wants to lay out their own
 * season should not have to discover that the shapes were optional.
 */
const STRUCTURE_OPTIONS = [...PRESET_KEYS, 'own'] as const
type StructureOption = (typeof STRUCTURE_OPTIONS)[number]

/**
 * One track's two answers, plus the Discipline they belong to.
 *
 * A field *list* rather than three flat fields, because the Event decides how many
 * of them there are: a triathlete answers this three times over one phase
 * structure, and each answer is its own unit and its own number (ADR 0043 §1, §2).
 * The Discipline rides along hidden — the Event named it, the athlete does not pick
 * it — so the action reads a whole track off one row instead of zipping three
 * parallel lists back together.
 */
const TrackFieldSchema = z.object({
	discipline: z.enum(DISCIPLINES),
	currency: z.enum(VOLUME_CURRENCIES, {
		errorMap: () => ({ message: 'Pick the unit you plan in' }),
	}),
	anchorValue: z.coerce
		.number({ errorMap: () => ({ message: 'A starting volume is required' }) })
		.positive('Your starting volume is more than zero'),
})

/**
 * One row as the *form* holds it, which is not what the schema parses it into: the
 * browser posts strings, and the unit's enum and the anchor's coercion are what the
 * parse turns them into. Written out rather than derived, so a row the athlete has
 * half-filled is still a row `TrackSection` can render.
 */
type TrackFieldValue = {
	discipline: Discipline
	currency: string
	anchorValue: string | number
}

const PlanFormSchema = z.object({
	structure: z.enum(STRUCTURE_OPTIONS, {
		errorMap: () => ({ message: 'Pick a shape, or lay out your own blocks' }),
	}),
	// The shared `WeekKeySchema`, not a looser string: the Monday rule then reports
	// as a *field* error on this form, and a tampered body is refused by the same
	// rule the service applies rather than by a second, weaker one.
	startWeekKey: WeekKeySchema,
	tracks: z
		.array(TrackFieldSchema)
		.min(1, 'A plan has at least one Training Track'),
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
	// Every Discipline the Event names gets a track proposed for it, each read from
	// its own history: a triathlete's swim anchor is their swim history's, and the
	// bike unit is whatever their rides are measured in (ADR 0043 §1).
	const proposals = trackDisciplinesFor(event.disciplines, volumes).map(
		(discipline) =>
			// Every Discipline comes back from the read, the untrained ones included.
			proposeTrack(volumes.find((entry) => entry.discipline === discipline)!),
	)

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
		// The Event's own Training Week, so each shape can say where it would land.
		// Read the same way `getActivePlan` reads it, so the sentence here and the
		// one on the plan page afterwards cannot disagree.
		eventWeekKey: weekMonday(event.startDate, timezone),
		weekOptions,
		proposals,
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, { schema: PlanFormSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const names = formData.getAll('phaseName').map(String)
	const weeks = formData.getAll('phaseWeeks').map(String)
	const phases = names
		.map((name, index) => ({ name: name.trim(), weeks: weeks[index] ?? '' }))
		// A row with neither field filled is a row the athlete did not use. A row
		// with one of the two is a mistake, and is kept so the schema can say so.
		.filter((row) => row.name !== '' || row.weeks !== '')
		.map((row) => ({ name: row.name, weeks: Number(row.weeks) }))

	const chosen = submission.value.structure
	// A shape names a preset and posts none of it: the phases, the ramps and the
	// mixes are read from `presets.ts` by the service, so nothing the browser sends
	// can author a season the app never shipped.
	const structure: PlanOutlineCreateInput['structure'] =
		chosen === 'own' ? { phases } : { presetKey: chosen }

	// An athlete who chose their own blocks and typed none of them gets the
	// question back rather than the schema's generic complaint, and gets it on the
	// field that decides it.
	if (chosen === 'own' && phases.length === 0) {
		return data(
			{
				result: submission.reply({
					fieldErrors: {
						structure: ['Name at least one block, or start from a shape'],
					},
				}),
			},
			{ status: 400 },
		)
	}

	const input: PlanOutlineCreateInput = {
		eventId: params.eventId,
		startWeekKey: submission.value.startWeekKey,
		structure,
		// Every track the form carried, in one create: `createPlanOutline` writes them
		// against the same phases, so a triathlete's three tracks share one timeline
		// rather than each needing a plan of its own (ADR 0043 §1).
		tracks: submission.value.tracks,
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
		eventWeekKey,
		weekOptions,
		proposals,
	} = loaderData

	const { profiles, ceiling, longest } = presetProfiles()
	// The shape that lands closest to the Event *from this week*, which is the
	// start week the form opens on. A default and never a recommendation: it is the
	// one figure that distinguishes the shapes for this athlete, and starting on the
	// one that fits means the athlete who taps Create without reading gets a season
	// that ends near their race rather than one that ends six weeks past it.
	const bestFitKey = closestFit(
		profiles.map(({ preset }) => preset),
		currentWeekKey,
		eventWeekKey,
	)

	const [form, fields] = useForm({
		id: 'plan-structure',
		constraint: getZodConstraint(PlanFormSchema),
		lastResult: actionData?.result,
		defaultValue: {
			structure: bestFitKey,
			startWeekKey: currentWeekKey,
			// One row per Discipline the Event names, each opening on its own
			// proposal — and on nothing at all where its own history says nothing.
			tracks: proposals.map((proposal) => ({
				discipline: proposal.discipline,
				currency: proposal.currency ?? '',
				anchorValue: proposal.currency
					? (proposal.anchors[proposal.currency]?.value ?? '')
					: '',
			})),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PlanFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	const trackFields = fields.tracks.getFieldList()
	// Read live: a shape's fit is a claim about *this* season, and moving the start
	// week moves every one of them.
	const startWeekKey = fields.startWeekKey.value ?? currentWeekKey
	const chosenStructure = (fields.structure.value ??
		bestFitKey) as StructureOption

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

			{proposals.length === 0 ? (
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
					<div className="space-y-8">
						{/* The shape leads. Everything under it is size, and a size means
						    nothing until there is a season to size (ADR 0043 §1). */}
						<fieldset className="space-y-4">
							<legend className="text-lg font-semibold">
								How should your season be built?
							</legend>
							<p className="text-muted-foreground text-sm">
								Pick a shape and its blocks, its climb and its quality sessions
								all land with it — yours to change afterwards. Each picture is
								drawn from the shape&rsquo;s own numbers, so it shows what
								applying it produces.
							</p>

							<ul className="space-y-3">
								{profiles.map(({ preset, profile }) => (
									<li key={preset.key}>
										<ShapeChoice
											name={fields.structure.name}
											value={preset.key}
											defaultChecked={chosenStructure === preset.key}
											title={preset.name}
											detail={preset.provenance}
										>
											<LoadProfile
												preset={preset}
												profile={profile}
												ceiling={ceiling}
												slots={longest}
											/>
											<p className="text-sm">
												<span className="font-medium tabular-nums">
													{presetWeeks(preset)} weeks
												</span>{' '}
												<span className="text-muted-foreground">
													·{' '}
													{fitSentence(
														eventFit(
															startWeekKey,
															presetWeeks(preset),
															eventWeekKey,
														),
													)}
												</span>
											</p>
											<p className="text-muted-foreground text-sm">
												{rhythmSentence(preset)}
											</p>
										</ShapeChoice>
									</li>
								))}

								{/* The escape hatch, as the fourth option rather than as a link
								    out: an athlete who knows what they want types it here and
								    submits the same form. The rows stay in the DOM whichever
								    option is checked — the action reads them only for `own`, so
								    a shape cannot pick up a stray row, and a mis-tap does not
								    lose what was typed — but they are *shown* only while this
								    option is, by CSS on the checked state rather than by React
								    state, so the choice still works before hydration. Six blank
								    rows are 700 px of empty form on a phone, and an athlete
								    picking a shape should never scroll past them. */}
								<li>
									<ShapeChoice
										name={fields.structure.name}
										value="own"
										defaultChecked={chosenStructure === 'own'}
										title="I’ll lay out my own blocks"
										detail="A phase says when and why, never how much. They sit end to end from your start week."
										revealWhenChecked
									>
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
															placeholder:
																index === 0 ? 'e.g. Base' : undefined,
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
										<p className="text-muted-foreground text-sm">
											Every 4th week is a recovery week by the documented
											convention, and nothing climbs until you say so on a
											block.
										</p>
									</ShapeChoice>
								</li>
							</ul>
							<ErrorList
								errors={fields.structure.errors as string[] | undefined}
							/>

							<p className="text-muted-foreground text-sm">
								A shape is a fixed length, so it is never stretched to reach
								your event. Whichever you pick, your plan says where it ends and
								you decide whether to add weeks.
							</p>
						</fieldset>

						{/* Said once, above the sections it explains: the athlete is about to
						    answer the same two questions three times, and the reason they are
						    not authoring three plans is that the blocks above are shared
						    (ADR 0043 §1). Silent for a single-discipline event, where there is
						    nothing to explain. */}
						{proposals.length > 1 ? (
							<p className="text-muted-foreground text-sm">
								Your event names{' '}
								{proposals
									.map((proposal) =>
										DISCIPLINE_LABELS[proposal.discipline].toLowerCase(),
									)
									.join(', ')}
								, so your season gets a track for each — over the same blocks,
								peaking together. Each keeps its own unit for life.
							</p>
						) : null}

						{trackFields.map((trackField, index) => (
							<TrackSection
								key={trackField.key}
								field={trackField}
								proposal={proposals[index]!}
							/>
						))}
						<ErrorList errors={fields.tracks.errors as string[] | undefined} />

						<section aria-labelledby="start-week" className="space-y-4">
							<h2 id="start-week" className="text-lg font-semibold">
								Which week does your plan start?
							</h2>
							<p className="text-muted-foreground text-sm">
								Your blocks lay forward from here. Nothing counts back from your
								event, so adding a block later never moves your start.
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
 * One Discipline's two answers: the unit it is planned in, and the weekly volume
 * it starts at.
 *
 * A component per track rather than one loop body inline, because each section
 * carries its own live currency and its own pre-fill: a triathlete switching their
 * bike track to hours must get the bike hours figure, and nothing about the swim
 * section may move with it (ADR 0043 §2).
 *
 * The Discipline itself is never a control here. The Event named it, and offering
 * it as a picker would invite an athlete to author a swim track for a running race
 * — the track set is the Event's, and it is editable afterwards on the plan page.
 */
function TrackSection({
	field,
	proposal,
}: {
	/** The row's own three fields, as the form holds them before the parse. */
	field: FieldMetadata<TrackFieldValue>
	/** What this Discipline's own history proposes — its unit and its anchor. */
	proposal: TrackProposal
}) {
	const fields = field.getFieldset()
	const { discipline } = proposal
	const label = DISCIPLINE_LABELS[discipline].toLowerCase()

	// Strength authors `sets` and is offered nothing else (ADR 0043 §2), so its
	// currency is stated rather than picked — a one-option select would be the dead
	// control ADR 0044 §8 argues against.
	const soleCurrency =
		proposal.offered.length === 1 ? proposal.offered[0] : undefined
	// The currency currently chosen, and *its* pre-fill — read from the live field
	// so the two move together rather than both freezing on the proposal.
	const currency = (soleCurrency ??
		fields.currency.value ??
		proposal.currency) as VolumeCurrency | undefined
	const prefill = currency ? proposal.anchors[currency] : undefined

	return (
		<section aria-labelledby={`your-${discipline}-track`} className="space-y-4">
			<h2 id={`your-${discipline}-track`} className="text-lg font-semibold">
				How big are your {label} weeks?
			</h2>

			{soleCurrency ? (
				// Strength is offered `sets` and no choice at all (ADR 0043 §2), so
				// there is no field here to make dead — the unit is stated.
				<>
					<input
						type="hidden"
						name={fields.currency.name}
						value={soleCurrency}
					/>
					<p className="text-sm">
						Your {label} track is planned in{' '}
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
					labelProps={{ children: `What do you plan your ${label} in?` }}
					placeholder="Pick the unit you plan in"
					items={proposal.offered.map((option) => ({
						value: option,
						label: VOLUME_CURRENCY_LABELS[option],
					}))}
					errors={fields.currency.errors as string[] | undefined}
				/>
			)}
			{/* The Event named the Discipline; the athlete never typed it, so it rides
			    along hidden and the action reads a whole track off one row. */}
			<input type="hidden" name={fields.discipline.name} value={discipline} />
			<p className="text-muted-foreground text-sm">
				{/* Nothing was read for a sole-currency track and nothing was chosen:
				    `sets` is a fact about the Discipline (ADR 0043 §2), so neither "we
				    proposed this" nor "you pick" is a true sentence about it. The add
				    form on the plan page drops the clause for the same reason, and one
				    unit must not be explained two ways on two surfaces. */}
				{soleCurrency ? null : proposal.currency ? (
					<>Proposed from your own history. </>
				) : (
					<>
						Nothing in your last {ANCHOR_WINDOW_WEEKS} weeks to read a unit
						from, so this one is yours to choose.{' '}
					</>
				)}
				This is locked once the track exists — changing units would rewrite the
				unit of every week you have already trained.
			</p>

			{/* The anchor is re-keyed on the currency so switching units brings that
			    unit's own pre-fill and derivation: anchor value and Volume Currency are
			    one act (ADR 0043 §2), and a distance figure relabelled as hours would be
			    a number nobody authored. */}
			<Field
				key={currency ?? 'unset'}
				labelProps={{
					children: `Where you are starting from, per ${label} week`,
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
			<p className="text-muted-foreground text-sm">{anchorSentence(prefill)}</p>
		</section>
	)
}

/**
 * One answer to "how should your season be built": a radio the whole card
 * belongs to.
 *
 * A `<label>` wrapping the control and its contents, so the tap target is the
 * card and not a 16px dot beside it (ADR 0028 §2.2), and so the choice works
 * before hydration. The checked state is drawn with a ring rather than colour
 * alone — the radio itself stays visible and is what a screen reader reads.
 */
function ShapeChoice({
	name,
	value,
	defaultChecked,
	title,
	detail,
	revealWhenChecked = false,
	children,
}: {
	name: string
	value: string
	defaultChecked: boolean
	title: string
	detail: string
	/**
	 * Show the body only while this option is checked. For the one option whose
	 * body is a *form* rather than an illustration: the fields stay submitted
	 * either way, so this hides a control the athlete is not using rather than
	 * gating one they are.
	 */
	revealWhenChecked?: boolean
	children: React.ReactNode
}) {
	return (
		<label
			className={cn(
				'group border-border/70 bg-card block cursor-pointer rounded-3xl border p-4 shadow-xs transition-colors',
				'has-[:checked]:border-primary has-[:checked]:ring-primary/40 has-[:checked]:ring-2',
			)}
		>
			<span className="flex items-start gap-3">
				<input
					type="radio"
					name={name}
					value={value}
					defaultChecked={defaultChecked}
					className="mt-1 size-4 shrink-0"
				/>
				<span className="min-w-0 flex-1">
					<span className="block text-base font-medium">{title}</span>
					<span className="text-muted-foreground block text-sm">{detail}</span>
				</span>
			</span>
			<div
				className={cn(
					'mt-4 space-y-3',
					revealWhenChecked && 'hidden group-has-[:checked]:block',
				)}
			>
				{children}
			</div>
		</label>
	)
}

/**
 * Where a shape of this length would end against the Event, in the fragment that
 * follows its week count.
 *
 * The same three readings `eventFit` produces and the plan page prints, worded to
 * sit after "18 weeks ·" rather than as a sentence of its own — one vocabulary for
 * one fact, so an athlete meets the same words before and after they create.
 */
function fitSentence(fit: EventFit): string {
	if (fit.kind === 'ends-on-event-week') return 'ends on your event’s week'
	const plural = fit.weeks === 1 ? 'week' : 'weeks'
	return fit.kind === 'ends-before'
		? `ends ${fit.weeks} ${plural} before your event`
		: `runs ${fit.weeks} ${plural} past your event`
}

/**
 * The shape whose end lands nearest the Event's week, ties going to the earlier
 * one in the shipped order.
 *
 * Nearest in **absolute** weeks, so a shape that overshoots by one beats one that
 * falls three short: neither direction is a defect (ADR 0044 §3) and the athlete
 * is choosing what to edit least. It decides a *default*, never a label — no card
 * is marked "recommended", because the app has no evidence that a shape fitting
 * the calendar is the right season for this athlete.
 */
function closestFit(
	presets: PeriodizationPreset[],
	startWeekKey: string,
	eventWeekKey: string,
): StructureOption {
	let best: { key: StructureOption; gap: number } | null = null
	for (const preset of presets) {
		const fit = eventFit(startWeekKey, presetWeeks(preset), eventWeekKey)
		const gap = fit.kind === 'ends-on-event-week' ? 0 : fit.weeks
		if (best == null || gap < best.gap) best = { key: preset.key, gap }
	}
	return best?.key ?? 'own'
}

export { GeneralErrorBoundary as ErrorBoundary }
