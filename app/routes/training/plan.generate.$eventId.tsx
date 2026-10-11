/**
 * **The season, generated** — the review surface's first fragment (#456).
 *
 * The whole point of the map this ticket sits on is that an athlete should not
 * *author* a periodization model. So this screen opens with a season already in
 * it: the shape is pre-selected by fit against the **Target Event**, the **Season
 * Anchor** arrives pre-filled from the athlete's own history, and the **Plan Start
 * Week** is not a question. One thing is asked outright — what the athlete says
 * about themselves — because nothing in the model can read it (#436).
 *
 * Three rules this page holds, and each is visible in what it renders.
 *
 * **Nothing reaches the calendar unapproved.** The loader previews and writes
 * nothing; the one POST writes. And the action does not trust what the browser
 * sends back — it **regenerates** from the same answers, which the generator being
 * deterministic makes exact. The same rule `fitPlanToEvent` already holds.
 *
 * **An absence is never deferred** (#437). The strength **Unavailable Metric** and
 * every slot the **Catalogue** had nothing for are stated at the top, before the
 * season, where a source may sit behind a tap and an absence may not.
 *
 * **Provenance is available, not asserted.** Every placed session carries its
 * source line — a **Citation** on a corpus row, the convention or hand-written
 * notice on the two uncited kinds — in a quiet slot under the title rather than as
 * a badge competing with it.
 *
 * The season is long: 27 weeks × 4 days is over a hundred rows at 390 px (ADR
 * 0028). The first four weeks are open and the rest sit behind one tap — the same
 * device the shape step uses for its other lengths — because what is hidden is
 * *more of the same weeks*, never an absence and never a decision.
 *
 * **Norwegian, on the design system** (#505 round 2; ADR 0081, ADR 0085). The
 * page is the shape step's sibling — «Bygg sesongen for meg» on
 * `plan.new.$eventId.tsx` leads here, and «Legg den opp selv» leads back — so it
 * is built from the same parts: `PlanCard` for each question, `ChoiceCard` in a
 * `ui/radio-group` for each answer, the shapes named and drawn as Sesong names and
 * draws them (`nbPresetName`, `nbPresetNote`, `LoadProfile`), and the type steps,
 * 44px targets and 16px inputs of the system. Every word is in `labels.ts`
 * (`PLAN_GENERATE_LABELS`); the domain's English — a preset's `name` and
 * `provenance`, a phase's stored name, `provenanceSentence` — is never shown.
 */
import { useState } from 'react'
import { data, Form, redirect, useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { RadioGroup } from '#app/components/ui/radio-group.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatNbDate,
	formatNbDayMonth,
	formatNbVolumeTotal,
} from '#app/utils/format.ts'
import {
	APP_TAB_LABELS,
	NB_CATALOGUE_PHASE_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_PATTERN_WEEKDAY_LABELS,
	NB_SESSION_ARCHETYPE_LABELS,
	NB_VOLUME_UNITS,
	NB_WEEK_ROLE_LABELS,
	nbPhaseName,
	PLAN_GENERATE_LABELS,
	PLAN_SHAPE_STEP_LABELS,
} from '#app/utils/labels.ts'
import {
	approveSeason,
	defaultPresetFor,
	previewSeason,
	type GenerationAnswers,
	type GenerationRefusal,
	type SeasonPreview,
} from '#app/utils/plan-generation/generate.server.ts'
import {
	GENERATION_INTENTS,
	type GeneratedSession,
	type GenerationIntent,
	type UnfilledSlot,
} from '#app/utils/plan-generation/season.ts'
import { eventFit, type EventFit } from '#app/utils/plan-outline/event-fit.ts'
import {
	PRESET_KEYS,
	presetWeeks,
	type PresetKey,
} from '#app/utils/plan-outline/presets.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.generate.$eventId.ts'
import {
	nbProvenanceNonVouch,
	nbProvenanceSentence,
} from './__catalogue-card.ts'
import { CollapsibleSection, PlanCard } from './__plan-chrome.tsx'
import { ChoiceCard } from './__plan-new-parts.tsx'
import {
	LoadProfile,
	nbPresetName,
	nbPresetNote,
	presetProfiles,
} from './__preset-gallery.tsx'

const L = PLAN_GENERATE_LABELS

export const meta: Route.MetaFunction = () => [{ title: L.metaTitle }]

/** How many weeks are open before the rest go behind a tap. */
const WEEKS_SHOWN = 4

/**
 * Read the athlete's answers off the URL.
 *
 * They live in the query string rather than in component state so that the
 * preview, a reload and the approving POST all read the *same* answers — a POST
 * to this route keeps its search params, so the action needs no hidden fields to
 * mirror what the form above it showed.
 */
function readAnswers(url: URL): GenerationAnswers {
	const shape = url.searchParams.get('shape')
	const you = url.searchParams.get('you')
	const anchors: Record<string, number | null> = {}
	for (const [key, value] of url.searchParams) {
		if (!key.startsWith('anchor-')) continue
		const discipline = key.slice('anchor-'.length)
		const parsed = Number(value)
		// A blank or unreadable box is "no anchor", which prices the track's weeks
		// Unavailable — never a number nobody typed.
		anchors[discipline] =
			value.trim() === '' || !Number.isFinite(parsed) || parsed <= 0
				? null
				: parsed
	}
	return {
		presetKey: isPresetKey(shape) ? shape : undefined,
		intent: (GENERATION_INTENTS as readonly string[]).includes(you ?? '')
			? (you as GenerationIntent)
			: undefined,
		anchors,
	}
}

function isPresetKey(value: string | null): value is PresetKey {
	return (PRESET_KEYS as readonly string[]).includes(value ?? '')
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const result = await previewSeason(userId, params.eventId, readAnswers(url))
	if (!result.ok) {
		// Nothing here is a dead end the athlete cannot act on: an Event that is
		// gone, not theirs or already planned sends them where the answer is.
		if (result.reason === 'event-already-planned') {
			throw redirect(`/training/plan?event=${params.eventId}`)
		}
		if (result.reason === 'no-cardio-discipline') {
			return { preview: null, refusal: result.reason, nearestFit: false }
		}
		throw redirect('/training/plan/new')
	}
	const { choice, eventWeekKey } = result.preview
	return {
		preview: result.preview,
		refusal: null,
		// Whether the season is built on the shape that lands nearest the Event —
		// the default `resolveChoice` picks — whoever chose it. Read here, not off
		// the URL: the rebuild always posts `shape`, so its presence says nothing
		// about whether the athlete moved it.
		nearestFit:
			choice.presetKey ===
			defaultPresetFor(choice.startWeekKey, eventWeekKey, PRESET_KEYS),
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	// The answers come from the URL, not the body: the season that is written is
	// regenerated from exactly what the preview was built from.
	const result = await approveSeason(
		userId,
		params.eventId,
		readAnswers(new URL(request.url)),
	)
	if (!result.ok) {
		return data({ refusal: result.reason }, { status: 400 })
	}
	throw redirect(`/training/plan?event=${params.eventId}`)
}

/**
 * Each refusal, worded. Typed to the union (`satisfies` in `labels.ts`), so a new
 * one is a compile error there rather than a blank here.
 */
function refusalMessage(reason: GenerationRefusal): string {
	return L.refusals[reason]
}

/** A sport mid-sentence: `løping`, `styrke`. */
function sportWord(discipline: Discipline): string {
	return NB_DISCIPLINE_LABELS[discipline].toLowerCase()
}

export default function GenerateSeasonRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { preview, refusal, nearestFit } = loaderData
	const [searchParams] = useSearchParams()

	if (!preview) {
		return (
			<main className="container mx-auto max-w-2xl py-6 md:py-8">
				<PageHeader
					title={L.refusedTitle}
					back={{ to: '/training/plan/new', label: APP_TAB_LABELS.season }}
					className="mb-4"
				/>
				<p className="text-body">{refusalMessage(refusal!)}</p>
			</main>
		)
	}

	const { event, season, choice } = preview
	const weeks = season.weeks
	const fit = eventFit(season.startWeekKey, weeks.length, preview.eventWeekKey)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={L.title}
				back={{
					to: `/training/plan/new/${event.id}`,
					label: L.layOutMyself,
				}}
				className="mb-4"
			/>

			{/* Page prose sits on the page background, not in a card (§1.6). */}
			<div className="mb-6 space-y-1">
				<p className="text-heading [overflow-wrap:anywhere]">{event.name}</p>
				<p className="text-footnote text-muted-foreground tabular-nums">
					{formatNbDate(event.startDate, 'UTC')} ·{' '}
					{L.summary(season.sessions.length, weeks.length)} · {fitSentence(fit)}
				</p>
				<p className="text-footnote text-muted-foreground">{L.intro}</p>
			</div>

			{/* The absences, before the season rather than inside it. A source can wait
			    behind a tap; an absence cannot (#437). */}
			<Absences season={season} />

			<Form method="get" className="mb-8 space-y-6">
				<PlanCard titleId="where-you-are" title={L.youTitle}>
					<div className="space-y-4">
						<p className="text-footnote text-muted-foreground">{L.youIntro}</p>
						<RadioGroup
							name="you"
							defaultValue={choice.intent}
							aria-labelledby="where-you-are"
						>
							<ul className="space-y-3">
								{GENERATION_INTENTS.map((intent) => (
									<li key={intent}>
										<ChoiceCard value={intent} title={L.intents[intent]} />
									</li>
								))}
							</ul>
						</RadioGroup>
					</div>
				</PlanCard>

				<ShapeCard chosen={choice.presetKey} nearestFit={nearestFit} />

				<PlanCard titleId="anchors" title={L.anchorTitle}>
					<ul className="space-y-4">
						{choice.tracks.map((track) => (
							<li key={track.discipline} className="space-y-1.5">
								<Field
									className="sm:max-w-xs"
									labelProps={{
										children: L.anchorLabel(
											sportWord(track.discipline),
											NB_VOLUME_UNITS[track.currency],
										),
									}}
									inputProps={{
										id: `anchor-${track.discipline}`,
										name: `anchor-${track.discipline}`,
										type: 'number',
										step: 'any',
										min: 0,
										inputMode: 'decimal',
										defaultValue: track.anchorValue ?? '',
										className: 'tabular-nums',
									}}
								/>
								<p className="text-footnote text-muted-foreground">
									{track.anchorValue == null
										? L.anchorNone
										: // Read off their history only while it is still the
											// history's figure: the rebuild posts every box, so the
											// URL cannot tell a typed figure from an untouched one.
											track.anchorValue ===
											  preview.proposals.find(
													(proposal) =>
														proposal.discipline === track.discipline,
											  )?.anchors[track.currency]?.value
											? L.anchorFromHistory
											: L.anchorOwn}
								</p>
							</li>
						))}
					</ul>
				</PlanCard>

				<Button type="submit" variant="secondary" className="w-full sm:w-auto">
					{L.rebuild}
				</Button>
			</Form>

			<section aria-labelledby="the-season" className="space-y-3">
				<div className="space-y-1">
					<h2 id="the-season" className="text-heading">
						{L.seasonTitle}
					</h2>
					<p className="text-footnote text-muted-foreground tabular-nums">
						{season.phases
							.map((phase) => L.phase(nbPhaseName(phase.name), phase.weeks))
							.join(' · ')}
					</p>
				</div>
				<ul className="space-y-3">
					{weeks.slice(0, WEEKS_SHOWN).map((week) => (
						<li key={week.weekKey}>
							<WeekCard week={week} season={season} />
						</li>
					))}
				</ul>
				{weeks.length > WEEKS_SHOWN ? (
					<CollapsibleSection
						summary={L.remaining(weeks.length - WEEKS_SHOWN)}
						detail={L.remainingDetail}
						contentClassName="space-y-3"
					>
						<ul className="space-y-3">
							{weeks.slice(WEEKS_SHOWN).map((week) => (
								<li key={week.weekKey}>
									<WeekCard week={week} season={season} />
								</li>
							))}
						</ul>
					</CollapsibleSection>
				) : null}
			</section>

			<Form
				method="POST"
				action={`?${searchParams.toString()}`}
				className="mt-8 space-y-3"
			>
				{actionData?.refusal ? (
					<p className="text-footnote text-foreground-destructive" role="alert">
						{refusalMessage(actionData.refusal)}
					</p>
				) : null}
				<Button type="submit" className="w-full sm:w-auto">
					{L.approve(season.sessions.length)}
				</Button>
				<p className="text-footnote text-muted-foreground">{L.approveNote}</p>
			</Form>
		</main>
	)
}

/**
 * The shape the season was built on, and the other eight one tap away.
 *
 * The shape is *pre-selected by fit* (#436), so it is a closed row and not a
 * question: closed, it names the season the athlete is about to read. The cards
 * behind it are the shape step's own — `ChoiceCard`, the Sesong name and note,
 * the picture drawn to the gallery's shared scale — so one method looks the same
 * on both ways into a plan. The panel stays mounted while closed
 * (`keepMounted`), so every radio is in the one group and posts `shape` with the
 * rebuild whether or not the athlete opened it.
 */
function ShapeCard({
	chosen,
	nearestFit,
}: {
	chosen: PresetKey
	/** True while the season is built on the shape that lands nearest the Event. */
	nearestFit: boolean
}) {
	const [open, setOpen] = useState(false)
	const { profiles, ceiling, longest } = presetProfiles()
	const chosenPreset = profiles.find(
		({ preset }) => preset.key === chosen,
	)!.preset
	const chosenWeeks = presetWeeks(chosenPreset)
	return (
		<PlanCard titleId="season-shape" title={L.shapeTitle}>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger className="hover:bg-muted/50 active:bg-muted motion-safe:duration-press -mx-2 flex min-h-11 w-[calc(100%+1rem)] touch-manipulation items-center gap-3 rounded-2xl px-2 py-2.5 text-left motion-safe:transition-colors motion-safe:ease-out">
					<span className="min-w-0 flex-1">
						<span className="text-callout block font-semibold [overflow-wrap:anywhere]">
							{nbPresetName(chosen)}
						</span>
						<span className="text-footnote text-muted-foreground block tabular-nums">
							{nearestFit
								? L.shapeDetail(chosenWeeks)
								: L.shapeDetailOwn(chosenWeeks)}
						</span>
					</span>
					<Icon
						name="chevron-down"
						size="sm"
						className="text-muted-foreground motion-safe:duration-press shrink-0 motion-safe:transition-transform motion-safe:ease-out [[data-panel-open]>&]:rotate-180"
					/>
				</CollapsibleTrigger>
				<CollapsibleContent keepMounted>
					<div className="space-y-3 pt-3">
						<p className="text-footnote text-muted-foreground">{L.shapeNote}</p>
						<RadioGroup
							name="shape"
							defaultValue={chosen}
							aria-labelledby="season-shape"
						>
							<ul className="space-y-3">
								{profiles.map(({ preset, profile }) => (
									<li key={preset.key}>
										<ChoiceCard
											value={preset.key}
											title={nbPresetName(preset.key)}
											detail={L.shapeOption(
												presetWeeks(preset),
												nbPresetNote(preset.key),
											)}
										>
											<LoadProfile
												preset={preset}
												profile={profile}
												ceiling={ceiling}
												slots={longest}
											/>
										</ChoiceCard>
									</li>
								))}
							</ul>
						</RadioGroup>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</PlanCard>
	)
}

/**
 * What this season cannot say, stated once and up front.
 *
 * Two different absences with two different reasons, so two notices rather than
 * one: a **Discipline** generation declined outright, and the days its retrieval
 * could not fill. A sunken well rather than a card: it is a statement about the
 * season, not a thing to act on, so it separates by tone (ADR 0085 §2).
 */
function Absences({ season }: { season: SeasonPreview['season'] }) {
	if (season.unavailable.length === 0 && season.unfilled.length === 0)
		return null
	return (
		<section
			aria-labelledby="what-is-missing"
			className="bg-muted/60 mb-6 space-y-2 rounded-4xl p-4 md:p-6"
		>
			<h2 id="what-is-missing" className="text-callout font-semibold">
				{L.absencesTitle}
			</h2>
			{season.unavailable.map((entry) => (
				<p key={entry.discipline} className="text-footnote">
					<span className="font-semibold">
						{L.noTrack(sportWord(entry.discipline))}
					</span>{' '}
					{L.noTrackBody}
				</p>
			))}
			{season.unfilled.length > 0 ? (
				<p className="text-footnote">
					<span className="font-semibold tabular-nums">
						{L.emptyDays(season.unfilled.length)}
					</span>{' '}
					{L.emptyDaysBody}
				</p>
			) : null}
		</section>
	)
}

/**
 * One week of the season: a luma card, because a week is a repeated unit. Named
 * by its ISO week as every week on Sesong is (ADR 0090 §4), with where it sits in
 * this season, its phase and role, and its target per track underneath.
 */
function WeekCard({
	week,
	season,
}: {
	week: SeasonPreview['season']['weeks'][number]
	season: SeasonPreview['season']
}) {
	const phase = season.phases[week.phaseIndex]!
	const sessions = season.sessions.filter(
		(session) => session.weekIndex === week.weekIndex,
	)
	const unfilled = season.unfilled.filter(
		(slot) => slot.weekIndex === week.weekIndex,
	)
	const titleId = `week-${week.weekKey}`
	return (
		<Card
			role="article"
			aria-labelledby={titleId}
			className="gap-3 [--card-spacing:--spacing(4)] md:[--card-spacing:--spacing(5)]"
		>
			<div className="space-y-1 px-(--card-spacing)">
				<div className="flex items-baseline gap-2">
					<h3
						id={titleId}
						className="text-callout flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 font-semibold tabular-nums"
					>
						{L.week(isoWeekNumber(week.weekKey))}
						{week.role === 'loading' ? null : (
							<Badge variant="secondary">
								{NB_WEEK_ROLE_LABELS[week.role]}
							</Badge>
						)}
						{week.isFinalWeek ? <Badge>{L.raceWeek}</Badge> : null}
					</h3>
					<span className="text-footnote text-muted-foreground shrink-0 tabular-nums">
						{formatNbDayMonth(new Date(`${week.weekKey}T00:00:00Z`), 'UTC')}
					</span>
				</div>
				<p className="text-footnote text-muted-foreground tabular-nums">
					{L.weekOf(week.weekIndex + 1, season.weeks.length)} ·{' '}
					{nbPhaseName(phase.name)}
				</p>
				{/* One figure per track, each kept whole on its line: a sport and its
				    figure split across a wrap read as two facts (`1 270,5 km`). */}
				<p className="text-footnote flex flex-wrap gap-x-1.5 tabular-nums">
					{week.targets.map((target, index) => (
						<span key={target.discipline} className="contents">
							{index > 0 ? <span aria-hidden>·</span> : null}
							<span className="whitespace-nowrap">
								{`${NB_DISCIPLINE_LABELS[target.discipline]} ${
									target.value == null
										? '—'
										: formatNbVolumeTotal(target.value, target.currency)
								}`}
							</span>
						</span>
					))}
				</p>
			</div>
			{sessions.length + unfilled.length > 0 ? (
				<ul className="divide-border/60 divide-y px-(--card-spacing)">
					{sessions.map((session) => (
						<li
							key={`${session.weekday}-${session.discipline}-${session.entryId}`}
							className="py-3 first:pt-1 last:pb-0"
						>
							<SessionRow session={session} />
						</li>
					))}
					{unfilled.map((slot) => (
						<li
							key={`${slot.weekday}-${slot.discipline}-${slot.slot}`}
							className="py-3 first:pt-1 last:pb-0"
						>
							<UnfilledRow slot={slot} />
						</li>
					))}
				</ul>
			) : null}
		</Card>
	)
}

/** `Mandag · Løping` — the day and the sport a row sits on. */
function DayLine({
	weekday,
	discipline,
	extra,
}: {
	weekday: UnfilledSlot['weekday']
	discipline: Discipline
	extra?: readonly string[]
}) {
	return (
		<p className="text-footnote text-muted-foreground flex flex-wrap items-baseline gap-x-1.5">
			<span className="text-foreground font-semibold">
				{NB_PATTERN_WEEKDAY_LABELS[weekday]}
			</span>
			<span aria-hidden>·</span>
			<span>{NB_DISCIPLINE_LABELS[discipline]}</span>
			{extra?.map((part) => (
				<span key={part} className="contents">
					<span aria-hidden>·</span>
					<span>{part}</span>
				</span>
			))}
		</p>
	)
}

function SessionRow({ session }: { session: GeneratedSession }) {
	const nonVouch = nbProvenanceNonVouch(session.provenance)
	return (
		<div className="space-y-0.5">
			<DayLine
				weekday={session.weekday}
				discipline={session.discipline}
				extra={[
					NB_SESSION_ARCHETYPE_LABELS[session.archetype],
					...(session.zone == null ? [] : [L.zone(session.zone)]),
				]}
			/>
			<p className="text-callout [overflow-wrap:anywhere]">{session.title}</p>
			{/* The provenance slot: one position, four possible contents, and the
			    community one is the only one that says trainm8 is not standing behind
			    it. Read off the row rather than assumed to be a Citation. */}
			<p
				className="text-footnote text-muted-foreground [overflow-wrap:anywhere]"
				data-provenance
			>
				{nbProvenanceSentence(session.provenance)}
			</p>
			{nonVouch ? (
				<p className="text-footnote text-muted-foreground" data-non-vouch>
					{nonVouch}
				</p>
			) : null}
		</div>
	)
}

function UnfilledRow({ slot }: { slot: UnfilledSlot }) {
	return (
		<div className="space-y-0.5" data-unfilled>
			<DayLine weekday={slot.weekday} discipline={slot.discipline} />
			<p className="text-footnote">
				{L.nothingToPlace(
					slot.archetypes.map((archetype) =>
						NB_SESSION_ARCHETYPE_LABELS[archetype].toLowerCase(),
					),
					NB_CATALOGUE_PHASE_LABELS[slot.cataloguePhase].toLowerCase(),
				)}
			</p>
		</div>
	)
}

/**
 * Where the season lands against the Event — the shape step's own three
 * readings, in its own words, so the athlete meets one sentence for one fact
 * before and after they choose how to build.
 */
function fitSentence(fit: EventFit): string {
	if (fit.kind === 'ends-on-event-week')
		return PLAN_SHAPE_STEP_LABELS.landsOnEvent
	return fit.kind === 'ends-before'
		? PLAN_SHAPE_STEP_LABELS.endsBefore(fit.weeks)
		: PLAN_SHAPE_STEP_LABELS.runsPast(fit.weeks)
}

export { GeneralErrorBoundary as ErrorBoundary }
