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
 * device the shape step uses for its nine cards — because what is hidden is *more
 * of the same weeks*, never an absence and never a decision.
 */
import { data, Form, redirect, useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDate } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	PATTERN_WEEKDAY_LABELS,
	SESSION_ARCHETYPE_LABELS,
	VOLUME_CURRENCY_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	approveSeason,
	previewSeason,
	type GenerationAnswers,
	type GenerationRefusal,
	type SeasonPreview,
} from '#app/utils/plan-generation/generate.server.ts'
import {
	provenanceNonVouch,
	provenanceSentence,
} from '#app/utils/plan-generation/provenance.ts'
import {
	GENERATION_INTENTS,
	type GeneratedSession,
	type GenerationIntent,
	type UnfilledSlot,
} from '#app/utils/plan-generation/season.ts'
import { eventFit } from '#app/utils/plan-outline/event-fit.ts'
import {
	PERIODIZATION_PRESETS,
	PRESET_KEYS,
	presetWeeks,
	type PresetKey,
} from '#app/utils/plan-outline/presets.ts'
import { type Route } from './+types/plan.generate.$eventId.ts'
import { Disclosure } from './__plan-chrome.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Your season | Trainm8' },
]

/** How many weeks are open before the rest go behind a tap. */
const WEEKS_SHOWN = 4

/**
 * The one asked input, worded as the athlete would say it. Three sentences rather
 * than a slider, because they are three different situations and not three points
 * on a scale.
 */
const INTENT_LABELS: Record<GenerationIntent, string> = {
	'first-season': 'This is my first structured season',
	'returning-from-injury': 'I am coming back from injury or a long break',
	'deliberately-building': 'I am training consistently and building',
}

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
		presetKey: (PRESET_KEYS as readonly string[]).includes(shape ?? '')
			? (shape as PresetKey)
			: undefined,
		intent: (GENERATION_INTENTS as readonly string[]).includes(you ?? '')
			? (you as GenerationIntent)
			: undefined,
		anchors,
	}
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
			return { preview: null, refusal: result.reason }
		}
		throw redirect('/training/plan/new')
	}
	return { preview: result.preview, refusal: null }
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

/** Each refusal, worded. Typed to the union so a new one is a compile error here. */
function refusalMessage(reason: GenerationRefusal): string {
	switch (reason) {
		case 'event-not-found':
			return 'That event is not available to plan against.'
		case 'no-cardio-discipline':
			return 'This event names no run, bike or swim discipline, so there is no endurance track to build a season on.'
		case 'anchor-missing':
			return 'Say where each discipline is starting from before adding the season to your calendar — a track with no starting volume has no size, and nothing here will invent one.'
		case 'event-past':
			return 'That event has already happened, so it cannot anchor a new plan.'
		case 'event-cancelled':
			return 'That event is cancelled, so it cannot anchor a plan.'
		case 'event-already-planned':
			return 'That event already has a plan.'
	}
}

export default function GenerateSeasonRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { preview, refusal } = loaderData
	const [searchParams] = useSearchParams()

	if (!preview) {
		return (
			<main className="container mx-auto max-w-2xl py-6 md:py-8">
				<PageHeader
					title="Your season"
					back={{ to: '/training/plan/new', label: 'Choose a goal' }}
					className="mb-4"
				/>
				<p className="text-sm">{refusalMessage(refusal!)}</p>
			</main>
		)
	}

	const { event, season, choice } = preview
	const chosenPreset = PERIODIZATION_PRESETS.find(
		(preset) => preset.key === choice.presetKey,
	)!
	const weeks = season.weeks
	const fit = eventFit(season.startWeekKey, weeks.length, preview.eventWeekKey)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Your season, ready to review"
				back={{
					to: `/training/plan/new/${event.id}`,
					label: 'Lay it out myself',
				}}
				className="mb-4"
			/>

			<div className="mb-6 space-y-1">
				<p className="font-medium">{event.name}</p>
				<p className="text-muted-foreground text-sm">
					{formatDate(event.startDate, 'UTC')} · {season.sessions.length}{' '}
					sessions across {weeks.length} weeks · {fitSentence(fit)}
				</p>
				<p className="text-muted-foreground text-sm">
					Every session is retrieved from the Catalogue and shows where it came
					from. Nothing is on your calendar until you add it.
				</p>
			</div>

			{/* The absences, before the season rather than inside it. A source can wait
			    behind a tap; an absence cannot (#437). */}
			<Absences season={season} />

			<Form method="get" className="mb-8 space-y-6">
				<fieldset className="space-y-3">
					<legend className="text-lg font-semibold">
						Where are you right now?
					</legend>
					<p className="text-muted-foreground text-sm">
						The one thing your training history cannot tell us. It sets how far
						up the Catalogue&rsquo;s dose ladder we retrieve — a stated
						convention, not a judgement about you.
					</p>
					<ul className="space-y-2">
						{GENERATION_INTENTS.map((intent) => (
							<li key={intent}>
								<label className="border-border/70 bg-card has-[:checked]:border-primary has-[:checked]:ring-primary/40 flex cursor-pointer items-start gap-3 rounded-2xl border p-3 has-[:checked]:ring-2">
									<input
										type="radio"
										name="you"
										value={intent}
										defaultChecked={choice.intent === intent}
										className="mt-1 size-4 shrink-0"
									/>
									<span className="text-sm">{INTENT_LABELS[intent]}</span>
								</label>
							</li>
						))}
					</ul>
				</fieldset>

				{/* The shape is *pre-selected by fit* (#436), so it is a disclosure and
				    not a question: the closed state names the season the athlete is
				    about to read, and the nine radios behind it stay in the DOM and in
				    one group, so the choice works closed and before hydration. */}
				<Disclosure
					summary="The shape of the season"
					detail={`${chosenPreset.name} · ${presetWeeks(chosenPreset)} weeks · pre-selected because it lands nearest your event`}
				>
					<p className="text-muted-foreground mb-3 text-sm">
						A default and never a recommendation — a shape that fits your
						calendar is not thereby the right season for you.
					</p>
					<ul className="space-y-2">
						{PERIODIZATION_PRESETS.map((preset) => (
							<li key={preset.key}>
								<label className="border-border/70 bg-card has-[:checked]:border-primary has-[:checked]:ring-primary/40 flex cursor-pointer items-start gap-3 rounded-2xl border p-3 has-[:checked]:ring-2">
									<input
										type="radio"
										name="shape"
										value={preset.key}
										defaultChecked={choice.presetKey === preset.key}
										className="mt-1 size-4 shrink-0"
									/>
									<span className="min-w-0 flex-1 text-sm">
										<span className="block font-medium">{preset.name}</span>
										<span className="text-muted-foreground block">
											{presetWeeks(preset)} weeks · {preset.provenance}
										</span>
									</span>
								</label>
							</li>
						))}
					</ul>
				</Disclosure>

				{choice.tracks.map((track) => (
					<div key={track.discipline} className="space-y-2">
						<label
							htmlFor={`anchor-${track.discipline}`}
							className="text-sm font-medium"
						>
							Where your {DISCIPLINE_LABELS[track.discipline].toLowerCase()}{' '}
							weeks are starting from (
							{VOLUME_CURRENCY_LABELS[track.currency].toLowerCase()})
						</label>
						<input
							id={`anchor-${track.discipline}`}
							name={`anchor-${track.discipline}`}
							type="number"
							step="any"
							min={0}
							inputMode="decimal"
							defaultValue={track.anchorValue ?? ''}
							className="border-input bg-background h-12 w-full rounded-md border px-3 text-sm"
						/>
						{track.anchorValue == null ? (
							<p className="text-muted-foreground text-sm">
								Nothing in your recent training to read this from, so it is
								yours to state. Until you do, every week reads &ldquo;—&rdquo;.
							</p>
						) : (
							<p className="text-muted-foreground text-sm">
								Pre-filled from your own recent training, and yours to change.
							</p>
						)}
					</div>
				))}

				<Button type="submit" variant="secondary" className="w-full sm:w-auto">
					Rebuild the season
				</Button>
			</Form>

			<section aria-labelledby="the-season" className="space-y-2">
				<h2 id="the-season" className="text-lg font-semibold">
					The season
				</h2>
				<p className="text-muted-foreground text-sm">
					{season.phases
						.map((phase) => `${phase.name} ${phase.weeks}w`)
						.join(' · ')}
				</p>
				<ul className="space-y-3">
					{weeks.slice(0, WEEKS_SHOWN).map((week) => (
						<li key={week.weekKey}>
							<WeekCard week={week} season={season} />
						</li>
					))}
				</ul>
				{weeks.length > WEEKS_SHOWN ? (
					<Disclosure
						summary={`The remaining ${weeks.length - WEEKS_SHOWN} weeks`}
						detail="The same season, week by week, all the way to your event."
					>
						<ul className="space-y-3">
							{weeks.slice(WEEKS_SHOWN).map((week) => (
								<li key={week.weekKey}>
									<WeekCard week={week} season={season} />
								</li>
							))}
						</ul>
					</Disclosure>
				) : null}
			</section>

			<Form
				method="POST"
				action={`?${searchParams.toString()}`}
				className="mt-8 space-y-3"
			>
				{actionData?.refusal ? (
					<p className="text-destructive text-sm" role="alert">
						{refusalMessage(actionData.refusal)}
					</p>
				) : null}
				<Button type="submit" className="w-full sm:w-auto">
					Add these {season.sessions.length} sessions to my calendar
				</Button>
				<p className="text-muted-foreground text-sm">
					Everything lands editable, like any other session — and each one keeps
					a pointer back to the Catalogue row it came from.
				</p>
			</Form>
		</main>
	)
}

/**
 * What this season cannot say, stated once and up front.
 *
 * Two different absences with two different reasons, so two notices rather than
 * one: a **Discipline** generation declined outright, and the days its retrieval
 * could not fill.
 */
function Absences({ season }: { season: SeasonPreview['season'] }) {
	if (season.unavailable.length === 0 && season.unfilled.length === 0)
		return null
	return (
		<section
			aria-labelledby="what-is-missing"
			className="border-border/70 bg-muted/40 mb-8 space-y-2 rounded-2xl border p-4"
		>
			<h2 id="what-is-missing" className="text-base font-semibold">
				What this season does not include
			</h2>
			{season.unavailable.map((entry) => (
				<p key={entry.discipline} className="text-sm">
					<span className="font-medium">
						No {DISCIPLINE_LABELS[entry.discipline].toLowerCase()} track.
					</span>{' '}
					None of the season shapes carries a strength block, and a strength
					block needs a goal, a length and a number of sessions a week that
					nothing here can read. Rather than invent them, this season leaves it
					out — add one yourself on the plan page once the season lands.
				</p>
			))}
			{season.unfilled.length > 0 ? (
				<p className="text-sm">
					<span className="font-medium">
						{season.unfilled.length} training{' '}
						{season.unfilled.length === 1 ? 'day is' : 'days are'} empty.
					</span>{' '}
					The Catalogue has no session matching what those days asked for, and
					nothing was substituted in their place. They are marked in the weeks
					below.
				</p>
			) : null}
		</section>
	)
}

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
	return (
		<div className="border-border/70 bg-card space-y-3 rounded-3xl border p-4 shadow-xs">
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<span className="font-medium">Week {week.weekIndex + 1}</span>
				<span className="text-muted-foreground text-sm">{phase.name}</span>
				{week.role === 'loading' ? null : (
					<Badge variant="secondary">{week.role}</Badge>
				)}
				{week.isFinalWeek ? <Badge>Race week</Badge> : null}
			</div>
			<p className="text-muted-foreground text-body-xs">
				{week.targets
					.map(
						(target) =>
							`${DISCIPLINE_LABELS[target.discipline]} ${
								target.value == null
									? '—'
									: `${round(target.value)} ${VOLUME_CURRENCY_LABELS[target.currency].toLowerCase()}`
							}`,
					)
					.join(' · ')}
			</p>
			<ul className="space-y-3">
				{sessions.map((session) => (
					<li
						key={`${session.weekday}-${session.discipline}-${session.entryId}`}
					>
						<SessionRow session={session} />
					</li>
				))}
				{unfilled.map((slot) => (
					<li key={`${slot.weekday}-${slot.discipline}-${slot.slot}`}>
						<UnfilledRow slot={slot} />
					</li>
				))}
			</ul>
		</div>
	)
}

function SessionRow({ session }: { session: GeneratedSession }) {
	const nonVouch = provenanceNonVouch(session.provenance)
	return (
		<div className="space-y-1">
			<p className="text-body-xs text-muted-foreground flex flex-wrap items-baseline gap-x-1.5">
				<span className="font-medium">
					{PATTERN_WEEKDAY_LABELS[session.weekday]}
				</span>
				<span aria-hidden>·</span>
				<span>{DISCIPLINE_LABELS[session.discipline]}</span>
				<span aria-hidden>·</span>
				<span>{SESSION_ARCHETYPE_LABELS[session.archetype]}</span>
				{session.zone == null ? null : (
					<>
						<span aria-hidden>·</span>
						<span>zone {session.zone}</span>
					</>
				)}
			</p>
			<p className="text-sm font-medium">{session.title}</p>
			{/* The provenance slot: one position, four possible contents, and the
			    community one is the only one that says trainm8 is not standing behind
			    it. Read off the row rather than assumed to be a Citation. */}
			<p className="text-body-xs text-muted-foreground" data-provenance>
				{provenanceSentence(session.provenance)}
			</p>
			{nonVouch ? (
				<p className="text-body-xs text-muted-foreground" data-non-vouch>
					{nonVouch}
				</p>
			) : null}
		</div>
	)
}

function UnfilledRow({ slot }: { slot: UnfilledSlot }) {
	return (
		<div className={cn('space-y-1')} data-unfilled>
			<p className="text-body-xs text-muted-foreground flex flex-wrap items-baseline gap-x-1.5">
				<span className="font-medium">
					{PATTERN_WEEKDAY_LABELS[slot.weekday]}
				</span>
				<span aria-hidden>·</span>
				<span>{DISCIPLINE_LABELS[slot.discipline]}</span>
			</p>
			<p className="text-sm">
				Nothing to place —{' '}
				{slot.archetypes
					.map((archetype) => SESSION_ARCHETYPE_LABELS[archetype].toLowerCase())
					.join(' or ')}{' '}
				in {slot.cataloguePhase.replace('-', ' ')} is not in the Catalogue for
				this discipline.
			</p>
		</div>
	)
}

/** A week's target, at the grain the currency reads in. */
function round(value: number): string {
	return value >= 100 ? String(Math.round(value)) : value.toFixed(1)
}

/** Where the season lands against the Event — the plan page's own three readings. */
function fitSentence(fit: ReturnType<typeof eventFit>): string {
	if (fit.kind === 'ends-on-event-week') return 'ends on your event’s week'
	const plural = fit.weeks === 1 ? 'week' : 'weeks'
	return fit.kind === 'ends-before'
		? `ends ${fit.weeks} ${plural} before your event`
		: `runs ${fit.weeks} ${plural} past your event`
}

export { GeneralErrorBoundary as ErrorBoundary }
