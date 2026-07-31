/**
 * The manual planning surface: the season the athlete authored, and where they
 * reshape it.
 *
 * Two readings of one object (spec #399 story 67) — **Blocks** shapes the season
 * and **Weeks** audits it — selected by a `?tab=` search param rather than nested
 * routes — the same URL-state rule the **Discipline Query** follows — because they
 * are two views and not two pages.
 *
 * **Blocks is the write surface for the phase structure (#402).** Every edit is
 * one action on one phase — add, rename, resize, move, remove — and never a
 * whole-season save, so an athlete who mistypes one week count does not re-submit
 * their season to fix it. The phases stay contiguous because a phase stores a
 * position and a week count and no dates at all (ADR 0044 §3), and the **Plan
 * Start Week** never moves because it is authored on the Outline rather than
 * counted back from the Event.
 *
 * Every number here is **derived** on read from the **Season Anchor** and the
 * phases (ADR 0040 §1) — nothing on this page is stored per week, so every target
 * and every week role is recomputed by the next read after a structural edit and
 * none of them can go stale. Where a track's rule cannot price a week the surface
 * says **Unavailable** with its reason, and never a fabricated figure.
 */
import { data, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDate, formatWeeklyVolume } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
import {
	PhaseNameSchema,
	PhaseWeeksSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addPhase,
	deletePlanOutline,
	movePhase,
	removePhase,
	renamePhase,
	resizePhase,
	setPhaseRhythm,
	type PhaseEditRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import { RHYTHMS } from '#app/utils/plan-outline/derive.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	getActiveSeason,
	getSeasonForEvent,
} from '#app/utils/training.server.ts'
import { type Route } from './+types/plan.ts'
import {
	AddPhaseForm,
	DeletePlanSection,
	PhaseCard,
} from './__phase-editor.tsx'

export const meta: Route.MetaFunction = () => [{ title: 'Plan | Trainm8' }]

const TABS = ['blocks', 'weeks'] as const
type Tab = (typeof TABS)[number]

/**
 * The two readings' own names. Not a domain enum — **Block** is a UI word only
 * (CONTEXT.md, Plan Outline phase) and these label a view, so they live beside
 * the view rather than in `labels.ts`.
 */
const TAB_LABELS: Record<Tab, string> = { blocks: 'Blocks', weeks: 'Weeks' }

function tabFrom(request: Request): Tab {
	const raw = new URL(request.url).searchParams.get('tab')
	return TABS.includes(raw as Tab) ? (raw as Tab) : 'blocks'
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// `?event=` addresses one Event's season — the plan just authored, or the one
	// an Event linked to. Without it the surface shows the active plan: the nearest
	// upcoming outlined Event (ADR 0018), which is the plan the athlete is living
	// in but not necessarily the one they just asked for.
	const eventId = new URL(request.url).searchParams.get('event')
	const season = eventId
		? await getSeasonForEvent(userId, eventId)
		: await getActiveSeason(userId)
	// An Event with no plan of its own falls back to the active plan rather than
	// dead-ending; with no plan at all, the flow's first question is the honest
	// destination — not a hollow page.
	if (!season) throw redirect(eventId ? '/training/plan' : '/training/plan/new')

	return {
		eventQuery: eventId,
		tab: tabFrom(request),
		season: {
			...season,
			/**
			 * Each week's Monday as the instant of local midnight, so the display layer
			 * formats the calendar day the athlete's week actually opens on.
			 */
			weeks: season.weeks.map((week) => ({
				...week,
				startsAt: dayBoundsUTC(week.weekKey, season.timezone).start,
			})),
			phases: season.phases.map((phase) => ({
				...phase,
				startsAt: dayBoundsUTC(phase.fromWeekKey, season.timezone).start,
			})),
		},
	}
}

/**
 * What the phase forms submit, per field.
 *
 * A form body is strings, and these coerce them into the shapes the authoring
 * schemas take. The service re-parses everything it is handed, so no write reaches
 * the database without passing the same rules twice; what these add is *wording* —
 * an athlete who clears the weeks box reads a sentence rather than "expected
 * number, received nan".
 */
const WeeksField = z.preprocess(
	// A cleared box arrives as `''`, and `Number('')` is 0 — which would read back as
	// "a phase runs at least one week" when what happened is that nothing was typed.
	(value) =>
		value == null || (typeof value === 'string' && value.trim() === '')
			? undefined
			: value,
	z.coerce
		.number({ errorMap: () => ({ message: 'How many weeks is this phase?' }) })
		// The bounds and their wording are the authoring schema's, piped rather than
		// restated, so a rule cannot move on one side of the form only.
		.pipe(PhaseWeeksSchema),
)
const NameField = z.preprocess((value) => value ?? '', PhaseNameSchema)
const AtIndexField = z.coerce.number().int().min(0)
/**
 * The rhythm as submitted. **Not** defaulted: a body missing its rhythm is refused
 * rather than written as `3:1`, which would record a convention as though the
 * athlete had chosen it — and would overwrite the `none` they had chosen before
 * (ADR 0044 §4, the rule `authoring-schema.ts` states).
 */
const RhythmField = z.enum(RHYTHMS, {
	errorMap: () => ({ message: 'Pick how this phase recovers' }),
})
const IdField = z.string().min(1)

/** A checkbox that is absent from the body when unchecked, as HTML has it. */
function checked(formData: FormData, name: string): boolean {
	return formData.get(name) === 'on'
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const phaseId = IdField.safeParse(formData.get('phaseId'))
	const outlineId = IdField.safeParse(formData.get('outlineId'))

	switch (intent) {
		case 'add-phase': {
			const name = NameField.safeParse(formData.get('name'))
			const weeks = WeeksField.safeParse(formData.get('weeks'))
			const atIndex = AtIndexField.safeParse(formData.get('atIndex'))
			const rhythm = RhythmField.safeParse(formData.get('rhythm'))
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			if (!weeks.success) return refuse(firstIssue(weeks.error))
			// A garbled position is refused rather than clamped to 0: falling back to
			// "at the start" would put the phase in the most disruptive place in the
			// season, which is nowhere the athlete pointed at.
			if (!atIndex.success) return refuse(POSITION_UNREADABLE)
			if (!rhythm.success) return refuse(firstIssue(rhythm.error))
			return report(
				await addPhase(userId, {
					outlineId: outlineId.data,
					atIndex: atIndex.data,
					name: name.data,
					weeks: weeks.data,
					rhythm: rhythm.data,
					tapers: checked(formData, 'tapers'),
				}),
			)
		}
		case 'rename-phase': {
			const name = NameField.safeParse(formData.get('name'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			return report(
				await renamePhase(userId, { phaseId: phaseId.data, name: name.data }),
			)
		}
		case 'resize-phase': {
			const weeks = WeeksField.safeParse(formData.get('weeks'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!weeks.success) return refuse(firstIssue(weeks.error))
			return report(
				await resizePhase(userId, { phaseId: phaseId.data, weeks: weeks.data }),
			)
		}
		case 'set-phase-rhythm': {
			const rhythm = RhythmField.safeParse(formData.get('rhythm'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!rhythm.success) return refuse(firstIssue(rhythm.error))
			return report(
				await setPhaseRhythm(userId, {
					phaseId: phaseId.data,
					rhythm: rhythm.data,
					tapers: checked(formData, 'tapers'),
				}),
			)
		}
		case 'move-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(
				await movePhase(userId, {
					phaseId: phaseId.data,
					direction:
						formData.get('direction') === 'later' ? 'later' : 'earlier',
				}),
			)
		}
		case 'remove-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(await removePhase(userId, { phaseId: phaseId.data }))
		}
		case 'delete-plan': {
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			const deleted = await deletePlanOutline(userId, {
				outlineId: outlineId.data,
			})
			if (!deleted.ok) return report(deleted)
			// Home, not back here: this athlete may have no plan left to render, and the
			// Plan card is where the absence reads honestly.
			return redirectWithToast('/', {
				type: 'success',
				title: 'Plan deleted',
				description: 'Your event and your trained sessions are untouched.',
			})
		}
	}

	return refuse('That is not something this page can do.')
}

const PHASE_GONE = 'That phase is no longer part of this plan.'
const OUTLINE_GONE = 'That plan is not available to edit.'
const POSITION_UNREADABLE = 'Choose where the new phase goes.'

/** A refusal the athlete reads, at the top of the reading that produced it. */
function refuse(error: string) {
	return data({ error }, { status: 400 })
}

function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? 'That is not a value this phase can take.'
}

/**
 * One service result, worded. Every refusal is a state the athlete can act on, so
 * each is a sentence and none is an exception; typing the map to the union makes a
 * refusal added later a compile error here rather than a silent catch-all.
 */
function report(
	result: { ok: true } | { ok: false; reason: PhaseEditRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(refusalMessage(result.reason))
}

function refusalMessage(reason: PhaseEditRefusal): string {
	switch (reason) {
		case 'outline-not-found':
			return OUTLINE_GONE
		case 'phase-not-found':
			return PHASE_GONE
		case 'plan-too-long':
			return 'That would run your plan past two years. Shorten a phase first.'
		case 'last-phase':
			return 'A plan keeps at least one phase. Delete the plan itself if that is what you want.'
		case 'at-the-edge':
			// Either end, since one message serves both directions: naming "start" for a
			// Move later would be the wrong word half the time.
			return 'That phase is already at that end of your season.'
	}
}

export default function PlanRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { season, tab, eventQuery } = loaderData
	const error =
		actionData && 'error' in actionData ? actionData.error : undefined
	const timezone = season.timezone
	const totalWeeks = season.weeks.length

	// The tab is URL state, and it must not drop the season the athlete is looking
	// at: both params travel together, with the default tab kept out of the URL.
	function readingHref(name: Tab): string {
		const params = new URLSearchParams()
		if (eventQuery) params.set('event', eventQuery)
		if (name !== 'blocks') params.set('tab', name)
		const search = params.toString()
		return search ? `/training/plan?${search}` : '/training/plan'
	}

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Season plan"
				back={{ to: '/', label: 'Home' }}
				className="mb-4"
			/>

			<div className="mb-8 space-y-3">
				<div className="space-y-1">
					<p className="font-medium">
						<Link
							to={`/training/events/${season.eventId}`}
							className="hover:underline"
						>
							{season.eventName}
						</Link>
					</p>
					{/* The Event's date is a calendar day anchor, formatted in UTC like
					    every other Event date in the app (ADR 0023). */}
					<p className="text-muted-foreground text-sm">
						{formatDate(season.eventDate, 'UTC')} ·{' '}
						{totalWeeks === 1 ? '1 week' : `${totalWeeks} weeks`} from{' '}
						{formatDate(season.phases[0]!.startsAt, timezone)}
					</p>
				</div>
				<p className="text-sm">{fitSentence(season.fit)}</p>
				<ul className="space-y-1">
					{season.tracks.map((track) => (
						<li key={track.discipline} className="text-sm">
							<span className="font-medium">
								{DISCIPLINE_LABELS[track.discipline]}
							</span>{' '}
							<span className="text-muted-foreground">
								· authored in {VOLUME_CURRENCY_UNITS[track.currency]} · starts
								at {formatWeeklyVolume(track.anchors[0]!.value, track.currency)}
							</span>
						</li>
					))}
				</ul>
			</div>

			<nav aria-label="Season views" className="mb-4 flex gap-2">
				{TABS.map((name) => (
					<Link
						key={name}
						to={readingHref(name)}
						aria-current={tab === name ? 'page' : undefined}
						className={buttonVariants({
							variant: tab === name ? 'default' : 'outline',
							size: 'sm',
						})}
					>
						{TAB_LABELS[name]}
					</Link>
				))}
			</nav>

			{tab === 'blocks' ? (
				<BlocksReading season={season} error={error} />
			) : (
				<WeeksReading season={season} />
			)}
		</main>
	)
}

type SeasonData = Route.ComponentProps['loaderData']['season']

/**
 * The Blocks reading: the phases in authored order, each editable in place.
 *
 * One card per phase and one action per control — rename, resize, rhythm, move,
 * remove — because the athlete's mistake is usually one field of one phase, and a
 * whole-season save makes them re-submit everything to fix it. Nothing on this
 * reading is a volume quantity: a phase says *when* and *why* (ADR 0041), so the
 * deepest cut a rhythm implies belongs to the track segment and is not authored
 * here.
 */
function BlocksReading({
	season,
	error,
}: {
	season: SeasonData
	error?: string
}) {
	return (
		<div className="space-y-8">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}

			<ol aria-label="Phases" className="space-y-3">
				{season.phases.map((phase, position) => (
					// Keyed by the phase's own id: position orders the season and identity
					// edits it, and an index key would carry a card's local state onto its
					// neighbour the moment two phases swap places.
					<li key={phase.id}>
						<PhaseCard
							phase={phase}
							position={position}
							phaseCount={season.phases.length}
							// Compared by *position*, so a season with two phases named "Base"
							// lights up one of them rather than both (ADR 0044 §2).
							isCurrent={position === season.currentPhaseIndex}
							timezone={season.timezone}
						/>
					</li>
				))}
			</ol>

			<AddPhaseForm outlineId={season.outlineId} phases={season.phases} />
			<DeletePlanSection
				outlineId={season.outlineId}
				eventName={season.eventName}
			/>
		</div>
	)
}

/**
 * The Weeks reading: every Training Week with its role and its derived target per
 * track. One column per track in **that track's** own currency — never a total
 * across them, which would need an exchange rate the app refuses to invent
 * (ADR 0043 §5).
 */
function WeeksReading({ season }: { season: SeasonData }) {
	// A track whose every week reads Unavailable gets its reason said once, rather
	// than a column of dashes the athlete has to interpret (Unavailable Metric).
	const unpricedTracks = season.tracks.filter((track) =>
		season.weeks.every(
			(week) =>
				week.targets.find((target) => target.discipline === track.discipline)
					?.value == null,
		),
	)

	return (
		<>
			<ul aria-label="Training weeks" className="divide-border divide-y">
				{season.weeks.map((week) => (
					<li
						key={week.weekKey}
						className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
					>
						<div className="text-sm">
							<span className="font-medium">Week {week.weekInPlan}</span>{' '}
							<span className="text-muted-foreground">
								· {formatDate(week.startsAt, season.timezone)} ·{' '}
								{season.phases[week.phaseIndex]?.name} ·{' '}
								{WEEK_ROLE_LABELS[week.role]}
							</span>
						</div>
						<dl className="flex flex-wrap gap-x-4 text-sm">
							{week.targets.map((target) => (
								<div key={target.discipline} className="flex gap-1.5">
									<dt className="text-muted-foreground">
										{DISCIPLINE_LABELS[target.discipline]}
									</dt>
									<dd className="font-medium tabular-nums">
										{target.value == null ? (
											<span className="text-muted-foreground font-normal">
												Unavailable
											</span>
										) : (
											formatWeeklyVolume(target.value, target.currency)
										)}
									</dd>
								</div>
							))}
						</dl>
					</li>
				))}
			</ul>
			{unpricedTracks.map((track) => (
				<p
					key={track.discipline}
					className="text-muted-foreground mt-3 text-sm"
				>
					{DISCIPLINE_LABELS[track.discipline]} weeks read Unavailable — a
					strength track&rsquo;s weekly sets are not derived yet.
				</p>
			))}
		</>
	)
}

/**
 * Where the season ends against the Event, said plainly. The plan is never
 * stretched to meet the Event: the athlete decides whether to add weeks (ADR 0044
 * §3, spec #399 story 4).
 */
function fitSentence(fit: SeasonData['fit']): string {
	const weeks = fit.kind === 'ends-on-event-week' ? 0 : fit.weeks
	const plural = weeks === 1 ? 'week' : 'weeks'
	if (fit.kind === 'ends-on-event-week') {
		return 'Your plan ends on your event’s week.'
	}
	return fit.kind === 'ends-before'
		? `Your plan ends ${weeks} ${plural} before your event’s week. Add weeks if you want it to reach the event.`
		: `Your plan runs ${weeks} ${plural} past your event’s week.`
}

export { GeneralErrorBoundary as ErrorBoundary }
