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
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod/v3'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { RadioGroup } from '#app/components/ui/radio-group.tsx'
import {
	addDays,
	dayBoundsUTC,
	isoWeekNumber,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatNbDate } from '#app/utils/format.ts'
import {
	APP_TAB_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_VOLUME_CURRENCY_LABELS,
	nbAuthoringMessage,
	nbPhaseName,
	nbWeeks,
	PLAN_SHAPE_STEP_LABELS,
	SESONG_TRACK_LABELS,
} from '#app/utils/labels.ts'
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
import { proposeFit } from '#app/utils/plan-outline/fit-proposal.ts'
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
import { PillLink, PlanCard } from './__plan-chrome.tsx'
import { ChoiceCard } from './__plan-new-parts.tsx'
import {
	LoadProfile,
	nbPresetName,
	nbPresetNote,
	presetProfiles,
	rhythmSentence,
} from './__preset-gallery.tsx'
import { nbAnchorSentence } from './__track-editor.tsx'

const L = PLAN_SHAPE_STEP_LABELS

export const meta: Route.MetaFunction = () => [{ title: L.metaTitle }]

/** How many Mondays either side of this week the start-week picker offers. */
const WEEKS_BACK = 4
const WEEKS_FORWARD = 16
/** Phase rows the form renders. Blank rows are ignored, so fewer phases is fine. */
const PHASE_ROWS = 6
/**
 * How many shapes the step shows before the rest go behind a disclosure.
 *
 * Three, matching the number of families the app ships: the nine lengths
 * interleave, so the three nearest-landing shapes are in practice one season per
 * family at the length that suits this Event.
 */
const SHAPES_SHOWN = 3

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
		errorMap: () => ({ message: L.unitRequired }),
	}),
	anchorValue: z.coerce
		.number({ errorMap: () => ({ message: L.anchorRequired }) })
		.positive(L.anchorPositive),
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
		errorMap: () => ({ message: L.structureRequired }),
	}),
	// The shared `WeekKeySchema`, not a looser string: the Monday rule then reports
	// as a *field* error on this form, and a tampered body is refused by the same
	// rule the service applies rather than by a second, weaker one. Its English
	// message is worded at the field (`nbAuthoringMessage`).
	startWeekKey: WeekKeySchema,
	tracks: z.array(TrackFieldSchema).min(1, L.tracksRequired),
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
					fieldErrors: { structure: [L.ownEmpty] },
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
	return L.refusals[reason]
}

/** A list of form errors, the domain's English ones worded for the athlete. */
function worded(errors: unknown): string[] | undefined {
	return Array.isArray(errors)
		? errors.map((error) => nbAuthoringMessage(String(error)))
		: undefined
}

/** A sport mid-sentence: `løping`, `sykling`. */
function sportWord(discipline: Discipline): string {
	return NB_DISCIPLINE_LABELS[discipline].toLowerCase()
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
	// Nine shapes, ordered by how close each lands to *this* Event, from the start
	// week the form opens on. Computed from `currentWeekKey` rather than from the
	// live field so the list cannot reorder under the athlete's finger while they
	// change their start week — a picker that rearranges itself as you use it is
	// worse than one that is slightly out of order.
	//
	// Nine cards is a long scroll at 390 px (ADR 0028), and leaving the checked
	// default eight cards down would be the shape step asking the athlete to read
	// every season before it shows them the one it already picked. Order is **not**
	// a label: no card says "recommended", because fitting the calendar is still not
	// evidence that a shape is the right season for this athlete (ADR 0048 §2).
	const shapes = byFit(profiles, currentWeekKey, eventWeekKey)
	// The three that land nearest lead; the rest sit behind one tap. Three because
	// the app ships three families and the lengths interleave, so the head of this
	// list is in practice one season per family at the length that suits this Event.
	const nearest = shapes.slice(0, SHAPES_SHOWN)
	const rest = shapes.slice(SHAPES_SHOWN)
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

	// The choice is the radio group's own state: the group posts it as
	// `structure`, and it decides whether the athlete's own rows are open.
	const [structure, setStructure] = useState<StructureOption>(bestFitKey)
	// The other lengths open on their own when the chosen shape is one of them,
	// so a reply that comes back with it checked never hides the answer.
	const [moreOpen, setMoreOpen] = useState(() =>
		rest.some(({ preset }) => preset.key === bestFitKey),
	)

	const trackFields = fields.tracks.getFieldList()
	// Read live: a shape's fit is a claim about *this* season, and moving the start
	// week moves every one of them.
	const startWeekKey = fields.startWeekKey.value ?? currentWeekKey

	const shapeCard = ({
		preset,
		profile,
	}: {
		preset: PeriodizationPreset
		profile: number[]
	}) => (
		<li key={preset.key}>
			<ShapeOption
				preset={preset}
				profile={profile}
				ceiling={ceiling}
				slots={longest}
				startWeekKey={startWeekKey}
				eventWeekKey={eventWeekKey}
			/>
		</li>
	)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={L.title}
				back={{ to: '/training/plan/new', label: APP_TAB_LABELS.plan }}
				className="mb-4"
			/>

			{/* Page prose sits on the page background, not in a card (§1.6). */}
			<div className="mb-6 space-y-1">
				<p className="text-heading flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
					{event.name}
					{createdGoal ? (
						<Badge variant="secondary">{L.goalCreated}</Badge>
					) : null}
				</p>
				<p className="text-footnote text-muted-foreground tabular-nums">
					{formatNbDate(event.startDate, 'UTC')}
					{createdGoal ? ` · ${L.goalCreatedNote}` : null}
				</p>
			</div>

			{/* The way in that does not ask the athlete to author a periodization
			    model (#456). It sits above the form rather than replacing it: the
			    authoring ladder stays whole and stops being the *only* way in. A
			    quiet section with a pill, not a card, so the shapes stay the
			    page's first card. */}
			<section
				aria-labelledby="generate-season"
				className="border-border/60 mb-6 space-y-2 border-b pb-6"
			>
				<h2 id="generate-season" className="text-callout font-semibold">
					{L.generateTitle}
				</h2>
				<p className="text-footnote text-muted-foreground">{L.generateBody}</p>
				<PillLink to={`/training/plan/generate/${event.id}`}>
					{L.generateAction}
				</PillLink>
			</section>

			{proposals.length === 0 ? (
				<p className="text-footnote">
					{L.noDiscipline}{' '}
					<Link
						to={`/training/events/${event.id}/edit`}
						className="text-foreground relative inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
					>
						{L.noDisciplineLink}
					</Link>{' '}
					{L.noDisciplineTail}
				</p>
			) : (
				<Form method="POST" {...getFormProps(form)} className="space-y-6">
					{/* The shape leads. Everything under it is size, and a size means
					    nothing until there is a season to size (ADR 0043 §1). */}
					<PlanCard titleId="season-shape" title={L.shapeTitle}>
						<div className="space-y-4">
							<p className="text-footnote text-muted-foreground">
								{L.shapeIntro}
							</p>

							<RadioGroup
								name={fields.structure.name}
								value={structure}
								onValueChange={(next) =>
									setStructure(String(next) as StructureOption)
								}
								aria-labelledby="season-shape"
								aria-invalid={fields.structure.errors ? true : undefined}
								className="gap-3"
							>
								<ul className="space-y-3">
									{nearest.map(shapeCard)}

									{/* The rest, one tap away. Fifteen illustrated options is a
									    very long page at 390 px and the last four fifths of it
									    are the shapes that land furthest from this Event — the
									    page-height defect ADR 0048's evidence recorded, arriving
									    from the other side. Nothing is removed and nothing is
									    unreachable: the panel stays mounted while closed
									    (`keepMounted`), so every radio is in the same group and
									    posts the same field. What is hidden is only *other
									    lengths of the same shapes* — a variant differs from its
									    family in length alone — so the closed state cannot
									    conceal a season the athlete has not already seen the
									    shape of. */}
									{rest.length > 0 ? (
										<li>
											<Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
												<CollapsibleTrigger className="hover:bg-muted/50 active:bg-muted motion-safe:duration-press -mx-2 flex min-h-11 w-[calc(100%+1rem)] touch-manipulation items-center gap-3 rounded-2xl px-2 py-2.5 text-left motion-safe:transition-colors motion-safe:ease-out">
													<span className="min-w-0 flex-1">
														<span className="text-callout block">
															{L.moreLengths(rest.length)}
														</span>
														<span className="text-footnote text-muted-foreground block">
															{L.moreLengthsDetail}
														</span>
													</span>
													<Icon
														name="chevron-down"
														size="sm"
														className="text-muted-foreground motion-safe:duration-press shrink-0 motion-safe:transition-transform motion-safe:ease-out [[data-panel-open]>&]:rotate-180"
													/>
												</CollapsibleTrigger>
												<CollapsibleContent keepMounted>
													<ul className="space-y-3 pt-2">
														{rest.map(shapeCard)}
													</ul>
												</CollapsibleContent>
											</Collapsible>
										</li>
									) : null}

									{/* The escape hatch, as the last option rather than as a
									    link out: an athlete who knows what they want types it
									    here and submits the same form. The rows stay mounted
									    whichever option is checked — the action reads them only
									    for `own`, so a shape cannot pick up a stray row, and a
									    mis-tap does not lose what was typed — but they open only
									    while this option is chosen. Six blank rows are 700 px of
									    empty form on a phone, and an athlete picking a shape
									    should never scroll past them. */}
									<li className="space-y-3">
										<ChoiceCard
											value="own"
											title={L.ownTitle}
											detail={L.ownDetail}
										/>
										<Collapsible open={structure === 'own'}>
											<CollapsibleContent keepMounted>
												<OwnBlocks />
											</CollapsibleContent>
										</Collapsible>
									</li>
								</ul>
							</RadioGroup>
							<ErrorList errors={worded(fields.structure.errors)} />

							<p className="text-footnote text-muted-foreground">
								{L.fixedLength}
							</p>
						</div>
					</PlanCard>

					{/* Said once, above the sections it explains: the athlete is about
					    to answer the same two questions three times, and the reason
					    they are not authoring three plans is that the blocks above are
					    shared (ADR 0043 §1). Silent for a single-discipline event,
					    where there is nothing to explain. */}
					{proposals.length > 1 ? (
						<p className="text-footnote text-muted-foreground">
							{L.multiTrack(
								proposals.map((proposal) => sportWord(proposal.discipline)),
							)}
						</p>
					) : null}

					{trackFields.map((trackField, index) => (
						<TrackSection
							key={trackField.key}
							field={trackField}
							proposal={proposals[index]!}
						/>
					))}
					<ErrorList errors={worded(fields.tracks.errors)} />

					<PlanCard titleId="start-week" title={L.startTitle}>
						<div className="space-y-4">
							<p className="text-footnote text-muted-foreground">
								{L.startIntro}
							</p>
							{/* Every option is a Monday in the Athlete Timezone, which is
							    how the week is stored (ADR 0044 §3) — so an invalid Plan
							    Start Week is unrepresentable rather than validated against.
							    Named by its ISO week, as every week on Sesong is
							    (ADR 0090 §4). */}
							<SelectField
								meta={fields.startWeekKey}
								labelProps={{ children: L.startLabel, className: 'sr-only' }}
								items={weekOptions.map((option) => ({
									value: option.weekKey,
									label: L.weekOption(
										isoWeekNumber(option.weekKey),
										formatNbDate(option.startsAt, timezone),
										option.isCurrent,
									),
								}))}
								triggerClassName="tabular-nums"
								errors={worded(fields.startWeekKey.errors)}
							/>
						</div>
					</PlanCard>

					<ErrorList errors={worded(form.errors)} />

					<Button type="submit" className="w-full sm:w-auto">
						{L.create}
					</Button>
				</Form>
			)}
		</main>
	)
}

/**
 * The athlete's own blocks: six name-and-weeks rows. Blank rows are ignored, so
 * three phases and six are the same form. A phase carries a name and a week
 * count and nothing else (ADR 0041).
 */
function OwnBlocks() {
	return (
		<div className="space-y-3 pt-1">
			<ul className="space-y-2">
				{Array.from({ length: PHASE_ROWS }, (_, index) => (
					<li key={index} className="flex items-start gap-2">
						<Field
							className="min-w-0 flex-1"
							labelProps={{
								children: L.phaseName(index + 1),
								className: index === 0 ? undefined : 'sr-only',
							}}
							inputProps={{
								id: `phaseName-${index}`,
								name: 'phaseName',
								type: 'text',
								placeholder: index === 0 ? L.phaseNamePlaceholder : undefined,
							}}
						/>
						<Field
							className="w-24 shrink-0"
							labelProps={{
								children: L.phaseWeeks,
								className: index === 0 ? undefined : 'sr-only',
							}}
							inputProps={{
								id: `phaseWeeks-${index}`,
								name: 'phaseWeeks',
								type: 'number',
								min: 1,
								inputMode: 'numeric',
								className: 'tabular-nums',
							}}
						/>
					</li>
				))}
			</ul>
			<p className="text-footnote text-muted-foreground">{L.ownNote}</p>
		</div>
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
	const sport = sportWord(discipline)

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
		<PlanCard titleId={`your-${discipline}-track`} title={L.trackTitle(sport)}>
			<div className="space-y-4">
				{soleCurrency ? (
					// Strength is offered `sets` and no choice at all (ADR 0043 §2), so
					// there is no field here to make dead — the unit is stated.
					<>
						<input
							type="hidden"
							name={fields.currency.name}
							value={soleCurrency}
						/>
						<p className="text-footnote">
							{L.plannedIn(sport)}{' '}
							<span className="font-semibold">
								{NB_VOLUME_CURRENCY_LABELS[soleCurrency].toLowerCase()}
							</span>{' '}
							<span className="text-muted-foreground">
								{SESONG_TRACK_LABELS.ownUnit}
							</span>
						</p>
					</>
				) : (
					<SelectField
						meta={fields.currency}
						labelProps={{ children: L.unitLabel(sport) }}
						placeholder={SESONG_TRACK_LABELS.pickUnit}
						items={proposal.offered.map((option) => ({
							value: option,
							label: NB_VOLUME_CURRENCY_LABELS[option],
						}))}
						errors={worded(fields.currency.errors)}
					/>
				)}
				{/* The Event named the Discipline; the athlete never typed it, so it
				    rides along hidden and the action reads a whole track off one row. */}
				<input type="hidden" name={fields.discipline.name} value={discipline} />
				<p className="text-footnote text-muted-foreground">
					{/* Nothing was read for a sole-currency track and nothing was
					    chosen: `sets` is a fact about the Discipline (ADR 0043 §2), so
					    neither "we proposed this" nor "you pick" is a true sentence
					    about it. The add form on the plan page drops the clause for the
					    same reason, and one unit must not be explained two ways on two
					    surfaces. */}
					{soleCurrency
						? null
						: proposal.currency
							? SESONG_TRACK_LABELS.proposed
							: SESONG_TRACK_LABELS.noHistoryUnit(ANCHOR_WINDOW_WEEKS)}
					{SESONG_TRACK_LABELS.unitFixed}
				</p>

				{/* The anchor is re-keyed on the currency so switching units brings that
				    unit's own pre-fill and derivation: anchor value and Volume Currency
				    are one act (ADR 0043 §2), and a distance figure relabelled as hours
				    would be a number nobody authored. */}
				<div className="space-y-1.5">
					<Field
						key={currency ?? 'unset'}
						className="sm:max-w-xs"
						labelProps={{ children: L.anchorLabel(sport) }}
						inputProps={{
							...getInputProps(fields.anchorValue, { type: 'number' }),
							defaultValue: prefill?.value ?? '',
							step: 'any',
							min: 0,
							inputMode: 'decimal',
							className: 'tabular-nums',
						}}
						errors={worded(fields.anchorValue.errors)}
					/>
					<p className="text-footnote text-muted-foreground">
						{nbAnchorSentence(prefill)}
					</p>
				</div>
			</div>
		</PlanCard>
	)
}

/**
 * One shape as a choice: its picture, where it lands against this Event, and what
 * the fitting rule would cost if it were applied.
 *
 * A component rather than an inlined block because the step renders the same card
 * in two places — the three that lead and the rest behind the disclosure — and a
 * shape that described itself differently depending on which side of a fold it
 * fell on would be a different shape. Named and described as the gallery under
 * Sesong's _Avansert_ names it (`nbPresetName`, `nbPresetNote`), so one method
 * has one name before and after the plan exists (audit B7).
 */
function ShapeOption({
	preset,
	profile,
	ceiling,
	slots,
	startWeekKey,
	eventWeekKey,
}: {
	preset: PeriodizationPreset
	profile: number[]
	ceiling: number
	slots: number
	startWeekKey: string
	eventWeekKey: string
}) {
	const weeks = presetWeeks(preset)
	return (
		<ChoiceCard
			value={preset.key}
			title={nbPresetName(preset.key)}
			detail={nbPresetNote(preset.key)}
		>
			<LoadProfile
				preset={preset}
				profile={profile}
				ceiling={ceiling}
				slots={slots}
			/>
			<div className="text-footnote space-y-1">
				<p>
					<span className="font-semibold tabular-nums">{nbWeeks(weeks)}</span>{' '}
					<span className="text-muted-foreground">
						·{' '}
						{landingSentence(
							preset,
							eventFit(startWeekKey, weeks, eventWeekKey),
						)}
					</span>
				</p>
				<p className="text-muted-foreground">{rhythmSentence(preset)}</p>
			</div>
		</ChoiceCard>
	)
}

/**
 * Where a shape of this length would end against the Event, in the fragment that
 * follows its week count.
 *
 * The same three readings `eventFit` produces and the plan page prints, worded to
 * sit after "18 uker ·" rather than as a sentence of its own — one vocabulary for
 * one fact, so an athlete meets the same words before and after they create.
 */
function fitSentence(fit: EventFit): string {
	if (fit.kind === 'ends-on-event-week') return L.landsOnEvent
	return fit.kind === 'ends-before'
		? L.endsBefore(fit.weeks)
		: L.runsPast(fit.weeks)
}

/**
 * Where this shape lands against the Event **and**, where it misses, what the
 * documented fitting rule would do about it — `går 3 uker forbi løpet · å
 * tilpasse den korter ned Grunntrening med 3 uker`.
 *
 * The second clause is the point of stating a rule at all. The shapes cover the
 * common run-ins, so most of the time it is absent; where it appears, the athlete
 * is choosing between shapes *knowing which block each one would cost them*, which
 * is the difference between a fitting rule and a surprise. Nothing here applies
 * anything — the shape still lands at its own length (ADR 0048 §1) and fitting
 * stays the athlete's tap on the plan page (§3). Every block the proposal touches
 * is named, as `fitRuleSummary` names it in the domain's English.
 *
 * Where no proposal exists the shape simply cannot be fitted without deleting a
 * block, and that is said rather than left blank: an absence the athlete would
 * discover by tapping is worse than one stated here.
 */
function landingSentence(preset: PeriodizationPreset, fit: EventFit): string {
	const landing = fitSentence(fit)
	if (fit.kind === 'ends-on-event-week') return landing
	const proposal = proposeFit(preset.phases, fit)
	if (!proposal) return `${landing} · ${L.fitTooLong}`
	const changes = proposal.changes.map((change) =>
		L.fitChange(nbPhaseName(change.name), Math.abs(change.to - change.from)),
	)
	return `${landing} · ${L.fitWould(proposal.delta > 0, changes)}`
}

/**
 * The shapes, nearest-landing first, ties in the shipped order.
 *
 * Nearest in **absolute** weeks, the same measure `closestFit` picks the default
 * with — a shape that overshoots by one is no worse than one that falls one short,
 * because neither direction is a defect (ADR 0044 §3) and the athlete is choosing
 * what to edit least. `sort` is stable, so a family's shapes keep their shipped
 * order among equals.
 */
function byFit<T extends { preset: PeriodizationPreset }>(
	shapes: T[],
	startWeekKey: string,
	eventWeekKey: string,
): T[] {
	const gap = ({ preset }: T) => {
		const fit = eventFit(startWeekKey, presetWeeks(preset), eventWeekKey)
		return fit.kind === 'ends-on-event-week' ? 0 : fit.weeks
	}
	return [...shapes].sort((a, b) => gap(a) - gap(b))
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
