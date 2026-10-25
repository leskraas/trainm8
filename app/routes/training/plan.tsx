/**
 * Sesong (`/training/plan`): the season the athlete authored, where they reshape
 * it, and where they author the progression into it — in Norwegian, on the design
 * system, since round 2 (ADR 0090).
 *
 * **The page leads with the season picture** (decision 12): I dag's curve and
 * season table for this plan (`__season-picture.tsx`), where a row opens that
 * week's target in _Endre sesongen_. Then the edits, the philosophy and the
 * Events (the right column from `lg`, decision 13), what the season comes to,
 * and the two readings below. **The weeks fill themselves** (decision 14): the
 * week change lays them as the horizon reaches them, and a typical week that
 * gains days lays the weeks up to the horizon at once — stamping is no longer the
 * athlete's step. The analytical season chart lives under Blokker's _Avansert_.
 *
 * Two readings of one object (spec #399 story 67) — **Blocks** shapes the season
 * and **Weeks** audits it — selected by a `?tab=` search param rather than nested
 * routes — the same URL-state rule the **Discipline Query** follows — because they
 * are two views and not two pages.
 *
 * **Blocks is the write surface.** Two kinds of edit meet on it, and they stay
 * separate acts. The **structure** (#402) — add, rename, resize, move, remove — is
 * one action per phase and never a whole-season save; the phases stay contiguous
 * because a phase stores a position and a week count and no dates at all (ADR 0044
 * §3), and the **Plan Start Week** never moves because it is authored on the Outline
 * rather than counted back from the Event. The **progression** (#403) is each
 * endurance segment's **Volume Ramp**, its **Block Boundary Step** and how deep its
 * recovery week and taper cut, plus its **Quality Session Mix** (#404) — the sessions
 * a week it asks for in zones 3, 4 and 5. The mix is authored here, and the segment's
 * **Intensity Emphasis** label and its **Quality Session Count** are *read off* that
 * mix rather than typed anywhere (ADR 0042 §4–§5).
 * Under _Avansert_ sits the **preset gallery** (#405, `__preset-gallery.tsx`): the
 * periodization shapes, each picked from an illustration of the load profile it
 * lays down, offered only before the plan has begun. Applying one **copies it in**
 * — it replaces the phase structure, says so before the tap and again in the toast
 * after it, and leaves nothing linked back.
 *
 * Every number here is **derived** on read from the **Season Anchor** and the
 * phases (ADR 0040 §1) — nothing on this page is stored per week, so every target
 * and every week role is recomputed by the next read after a structural edit and
 * none of them can go stale. Where a track's rule cannot price a week the surface
 * says **Unavailable** with its reason, and never a fabricated figure.
 *
 * Two rules this page's copy is bound by:
 *
 * - **An unset cut reads as the convention**, visibly distinct from an authored
 *   number of the same size, so a convention that moves later cannot look like an
 *   edit to the athlete's plan (ADR 0044 §4).
 * - **The ramp guard is a convention and never an injury claim.** The 10% rule has
 *   a failed RCT behind it, so the warning says "steeper than the convention" and
 *   stops there (ADR 0040 §13). It warns; nothing here refuses a save. The mix's
 *   availability notice takes the same posture, comparing days against days and
 *   claiming nothing about safety (ADR 0042 §9, ADR 0045 §8).
 *
 * And one trap this page's copy has to keep out of: **blank means two different
 * things here.** An empty rate box is "follow the documented convention" (ADR 0044
 * §4); an empty box in the **Quality Session Mix** is the zone being **absent from
 * the mix**, because a mix has no convention to fall back on. Each set of fields
 * therefore says which blank it is, and the mix's fields are deliberately not built
 * out of the rate fields' components.
 *
 * **Where the code lives** (#533). This route reads the season and dispatches
 * each posted `intent` to its editor's action, a `.server.ts` beside the editor's
 * component (`__phase-editor.server.ts`, `__week-pattern-editor.server.ts`, …),
 * the shape `__season-edits.server.ts` set. The two readings are
 * `__blocks-reading.tsx` and `__weeks-reading.tsx`; what they share is
 * `__plan-season.ts`.
 */

import { Link, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getEventsForUser } from '#app/utils/event.server.ts'
import { readPlanStartOptions } from '#app/utils/first-run/plan-start-options.server.ts'
import { formatNbVolumeTotal, formatNbWeeklyVolume } from '#app/utils/format.ts'
import {
	APP_TAB_LABELS,
	NB_ACCUMULATED_SPAN_LABELS,
	nbTrackName,
	SESONG_ENTRY_LABELS,
	PHILOSOPHY_SWITCH_LABELS,
	PLAN_TRACK_DAYS_LABELS,
	SEASON_EDIT_LABELS,
	SESONG_NEXT_LABELS,
	SESONG_PAGE_LABELS,
	SESONG_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { listPlanAnchorCandidates } from '#app/utils/plan-outline/authoring.server.ts'
import { accumulatesAcrossDisciplines } from '#app/utils/plan-outline/commensurability.ts'
import {
	readAnchorContext,
	readStrengthTrackOffer,
} from '#app/utils/plan-outline/history.server.ts'
import {
	proposeTrack,
	type TrackProposal,
} from '#app/utils/plan-outline/proposal.ts'
import {
	readSeasonChartInputs,
	withWeekStarts,
} from '#app/utils/plan-outline/season-chart.server.ts'
import { readStampedMixWarnings } from '#app/utils/plan-outline/stamp.server.ts'
import { readTrackDays } from '#app/utils/plan-outline/track-days.server.ts'
import { weekIndexOf } from '#app/utils/plan-outline/week-keys.ts'
import { countWeeksWithSessions } from '#app/utils/plan-outline/week-sessions.server.ts'
import {
	getActiveSeason,
	getAuthoredWorkouts,
	getSeasonForEvent,
	getSeasonForOutline,
	type AuthoredSeason,
} from '#app/utils/training.server.ts'
import {
	DISCIPLINES,
	isCardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.ts'
import { attachEventAction } from './__attach-event.server.ts'
import { BlocksReading } from './__blocks-reading.tsx'
import { copyWeekOnto } from './__copy-week.server.ts'
import { type PendingCopy } from './__copy-week.tsx'
import { fitToEventAction } from './__fit-to-event.server.ts'
import { readLibraryLifts } from './__library-section.server.ts'
import { LibrarySection } from './__library-section.tsx'
import { phaseEditAction } from './__phase-editor.server.ts'
import {
	philosophySwitchAction,
	strengthOfferAction,
} from './__philosophy-switch.server.ts'
import {
	PhilosophyCard,
	StrengthTrackOfferCard,
} from './__philosophy-switch.tsx'
import { refuse } from './__plan-action.server.ts'
import { PlanAdvanced } from './__plan-advanced.tsx'
import { PillLink, PlanCard, SegmentedNav } from './__plan-chrome.tsx'
import { PlanLeadCard } from './__plan-lead-card.tsx'
import { nextEasyWeek as readNextEasyWeek } from './__plan-lead.ts'
import {
	TABS,
	type Tab,
	anchorPlacementsOf,
	weekNumberOf,
	type SeasonData,
} from './__plan-season.ts'
import { applyPresetAction } from './__preset-gallery.server.ts'
import { seasonAnchorAction } from './__season-anchor-editor.server.ts'
import { type EditableAnchorTrack } from './__season-anchor-editor.tsx'
import { seasonFitnessOf } from './__season-chart.tsx'
import { seasonEditAction } from './__season-edits.server.ts'
import { SeasonEditsCard } from './__season-edits.tsx'
import { SEASON_EVENTS_SHOWN, SeasonEvents } from './__season-events.tsx'
import { UnavailableReadingsNotice } from './__season-notices.tsx'
import { readSeasonPicture } from './__season-picture.server.ts'
import { SeasonPicture } from './__season-picture.tsx'
import {
	authorQualityMix,
	authorSegmentRates,
} from './__segment-editor.server.ts'
import { strengthSegmentAction } from './__strength-segment-editor.server.ts'
import { type EditableStrengthTrack } from './__strength-segment-editor.tsx'
import { TrackDaysCard } from './__track-days.tsx'
import { trackEditAction } from './__track-editor.server.ts'
import { TrackRoster } from './__track-editor.tsx'
import { treningsformViewOf } from './__treningsform-view.ts'
import { TreningsformOffer } from './__treningsform.tsx'
import { weekPatternAction } from './__week-pattern-editor.server.ts'
import { type SeasonQuery } from './__week-pattern-editor.tsx'
import { WeeksReading } from './__weeks-reading.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: SESONG_PAGE_LABELS.metaTitle },
]

/** The two readings' own names, in the page's Norwegian (`labels.ts`). */
const TAB_LABELS: Record<Tab, string> = {
	blocks: SESONG_PAGE_LABELS.blocks,
	weeks: SESONG_PAGE_LABELS.weeks,
}

function tabFrom(request: Request): Tab {
	const raw = new URL(request.url).searchParams.get('tab')
	return TABS.includes(raw as Tab) ? (raw as Tab) : 'blocks'
}

/**
 * Which Training Week the **Pattern Preview** is read against: `?week=<weekKey>`,
 * that week's Monday, alongside `?tab=` and `?event=` and travelling with them.
 *
 * URL state for the same reason the tab is: the week an athlete is reading their
 * pattern against is worth reloading into and worth linking. A key that is not a
 * week of *this* plan — a stale link, or a week of another season — falls back to
 * the plan's first week, because the preview must read a real derived target and
 * an unknown key has none.
 */
function chosenWeekKey(
	request: Request,
	weeks: ReadonlyArray<{ weekKey: string }>,
): string | null {
	const asked = new URL(request.url).searchParams.get('week')
	const chosen = weeks.find((week) => week.weekKey === asked)
	return chosen?.weekKey ?? weeks[0]?.weekKey ?? null
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// `?event=` addresses one Event's season — the plan just authored, or the one
	// an Event linked to. Without it the surface shows the active plan: the nearest
	// upcoming outlined Event (ADR 0018), which is the plan the athlete is living
	// in but not necessarily the one they just asked for.
	//
	// `?outline=` addresses an open-ended plan the same way, which has no Event to
	// be named by (ADR 0079) — the plan just authored with "Hold meg aktiv", or one
	// resting while a plan toward a race is the active one.
	const searchParams = new URL(request.url).searchParams
	const eventId = searchParams.get('event')
	const outlineId = eventId ? null : searchParams.get('outline')
	const seasonQuery: SeasonQuery = eventId
		? { name: 'event', value: eventId }
		: outlineId
			? { name: 'outline', value: outlineId }
			: null
	const season = eventId
		? await getSeasonForEvent(userId, eventId)
		: outlineId
			? await getSeasonForOutline(userId, outlineId)
			: await getActiveSeason(userId)
	// An Event with no plan of its own falls back to the active plan rather than
	// dead-ending; with no plan at all, the flow's first question is the honest
	// destination — not a hollow page.
	if (!season) {
		throw redirect(seasonQuery ? '/training/plan' : '/training/plan/new')
	}

	// A **fixed** pattern day prescribes a Workout, and this app has no Workout
	// library: a Workout is authored inline with a session (`sessions.new.tsx`), so
	// the picker offers the athlete's own — and says so plainly when there are none
	// rather than rendering a control with nothing in it.
	const workouts = await getAuthoredWorkouts(userId, [
		...new Set(season.tracks.map((track) => track.discipline)),
	])

	// Where the weeks the athlete has already stamped disagree with the mix their
	// segment authors — read here rather than derived on the client, because it is a
	// reading of the *sessions* and this page otherwise holds none (ADR 0042 §9).
	// Empty for a plan nobody has stamped yet, which is the ordinary state.
	const mixWarnings = await readStampedMixWarnings(userId, season.outlineId)

	// How much of the season is actually on the calendar — the last step of
	// authoring a plan, and the one an athlete planning for the first time does not
	// know is a step (`NextSteps`). A count of weeks and not of sessions, because
	// that is the unit the week list below is drawn in.
	const weeksWithSessions = await countWeeksWithSessions(
		userId,
		season.outlineId,
		season.weeks.map((week) => week.weekKey),
		season.timezone,
	)

	// An open-ended plan may gain an Event (ADR 0079 §4): the athlete's upcoming
	// Events that have no plan of their own are the ones it can take.
	const attachableEvents =
		season.eventId == null
			? (await listPlanAnchorCandidates(userId))
					.filter((event) => event.plannedOutlineId == null)
					.map(({ id, name, startDate }) => ({ id, name, startDate }))
			: []

	// A strength track proposed from the athlete's own lifting (#505 story 15),
	// for a plan that measures no lifting yet. No lifting habit, no offer.
	const strengthOffer = season.tracks.some(
		(track) => track.discipline === 'strength',
	)
		? null
		: await readStrengthTrackOffer(userId)

	// The first week not yet begun: the Sesong edits offer no week before it,
	// since a week already begun is history (#505 S13).
	const firstUnbegunWeekKey = await readFirstUnbegunWeekKey(
		userId,
		new Date(),
		season.timezone,
	)

	// The Events the season is planned around, on Sesong itself (ADR 0083). The
	// same "upcoming" the Events page reads: planned, and not yet started.
	const now = new Date()
	const upcomingEvents = (await getEventsForUser(userId)).filter(
		(event) => event.status === 'planned' && event.startDate >= now,
	)

	// The analytical chart's inputs, and the season with its weeks' Mondays.
	const chartInputs = await readSeasonChartInputs(userId, season)
	const datedSeason = withWeekStarts(season)

	// The season picture (round-2 decision 12): I dag's curve and table, read
	// for this plan as I dag reads the active one (`__season-picture.server.ts`).
	const seasonPicture = await readSeasonPicture(
		userId,
		season.outlineId,
		season.timezone,
		now,
	)

	// An open-ended plan resting behind this race plan (ADR 0079): the page
	// links back to it, which only `?outline=` reached before (audit B12).
	const restingOpenEnded =
		season.eventId == null
			? null
			: await prisma.planOutline.findFirst({
					where: {
						athleteId: userId,
						eventId: null,
						phases: { some: {} },
					},
					select: { id: true },
				})

	// Bibliotek, a section of Plan since it gave up its tab (ADR 0101 §1).
	const libraryLifts = await readLibraryLifts(userId)

	// _Bytt treningsform_ (ADR 0101 §2, #581): the Start Options again, laid
	// from the week a switch would begin in for this plan's tracks and days.
	const startOptions = await readPlanStartOptions(
		userId,
		season,
		firstUnbegunWeekKey,
		now,
	)
	const treningsform = startOptions ? treningsformViewOf(startOptions) : null

	return {
		// What Plan leads with beside the curve (ADR 0101 §2): the easy week the
		// rhythm prescribes next, from the week the athlete is in.
		nextEasyWeek: readNextEasyWeek(
			season.weeks,
			weekMonday(now, season.timezone),
		),
		seasonQuery,
		attachableEvents,
		treningsform,
		strengthOffer,
		firstUnbegunWeekKey,
		libraryLifts,
		seasonEvents: {
			events: upcomingEvents.slice(0, SEASON_EVENTS_SHOWN),
			upcomingCount: upcomingEvents.length,
		},
		seasonPicture,
		restingOpenEnded: restingOpenEnded
			? { outlineId: restingOpenEnded.id }
			: null,
		tab: tabFrom(request),
		week: chosenWeekKey(request, season.weeks),
		workouts,
		mixWarnings,
		weeksWithSessions,
		strengthTracks: strengthTracksOf(season),
		// _Dagene i uka_ (#598): the days of each endurance track and Simple
		// Activity, chosen or the app's.
		trackDays: await readTrackDays(userId, season.outlineId),
		anchorTracks: anchorTracksOf(season),
		/**
		 * The **season chart**'s two server-side inputs (#413), read the way every
		 * surface that mounts the chart reads them (`season-chart.server.ts`).
		 */
		...chartInputs,
		/**
		 * The chart's fitness layer, replayed here once rather than on the
		 * phone's main thread the moment the athlete taps it (audit §7).
		 */
		seasonFitness: seasonFitnessOf(
			datedSeason,
			chartInputs.conversionContexts,
			chartInputs.fitnessAnchor,
		),
		/**
		 * What the add-track form proposes for the Disciplines this plan does not
		 * measure yet. Read here because a proposal is a reading of the *athlete's*
		 * history and not of the plan — the same read the creation flow makes, so
		 * authoring the second track is not a thinner act than authoring the first
		 * (ADR 0043 §2, ADR 0040 §6).
		 */
		trackProposals: await readTrackProposals(
			userId,
			season.tracks.map((track) => track.discipline),
		),
		season: datedSeason,
	}
}

/**
 * The **Volume Currency** and first **Season Anchor** the add-track form proposes,
 * one per Discipline this plan does not measure yet.
 *
 * The same two functions the creation flow uses — `readAnchorContext` for the
 * window and `proposeTrack` for the reading of it — so the second track an athlete
 * authors meets the same proposal, the same pre-fill and the same honest silence as
 * the first. Nothing here re-reads afterwards: the value is proposed once, and what
 * the athlete submits is what is authored (ADR 0040 §6).
 *
 * A plan already measuring every Discipline renders no add form at all, so the
 * history read is skipped rather than made and thrown away.
 */
async function readTrackProposals(
	athleteId: string,
	tracked: Discipline[],
): Promise<TrackProposal[]> {
	const untracked = DISCIPLINES.filter(
		(discipline) => !tracked.includes(discipline),
	)
	if (untracked.length === 0) return []

	const { volumes } = await readAnchorContext(athleteId)
	return untracked.map((discipline) =>
		// Every Discipline comes back from the read, the untrained ones included, so
		// "no entry" and "no training" never have to be told apart here.
		proposeTrack(volumes.find((volume) => volume.discipline === discipline)!),
	)
}

/**
 * This plan's strength tracks and the dated blocks authored on them, off the same
 * authorized read as everything else on this page.
 *
 * A **reshape and not a read**: `AuthoredSeason` hands each track its dated blocks as
 * `strengthSegments`, beside the endurance `segments` a phase card consumes — the two
 * are different readings of one union, because a `SegmentReading` carries a phase and
 * a **Quality Session Mix** and a dated block carries neither (ADR 0047 §6). All this
 * does is group them the way the editor's props are shaped.
 *
 * Selected by **Discipline** rather than by "has blocks", so a strength track with
 * nothing on it still gets its section, its honest empty state and its add form.
 */
/**
 * Every track's **Season Anchor** segments as the anchor section edits them, off the
 * same authorized read as everything else on this page.
 *
 * A **reshape and not a read**, exactly like `strengthTracksOf`: `AuthoredSeason`
 * already hands each track its segments sorted earliest-first, and all this adds is
 * the two things a *surface* needs and the domain does not store — which week of the
 * plan each one lands on, and which of them is the earliest. Both are computed here,
 * at the read boundary where the **Plan Start Week** is in hand, because the
 * derivation counts 0-based week indices and knows nothing about dates (ADR 0040 §3).
 *
 * **Every** track, endurance and strength alike: ADR 0047 §1 gives both the same
 * anchor, so a lifter re-anchors their weekly sets exactly as a runner re-anchors
 * their kilometres.
 */
function anchorTracksOf(season: AuthoredSeason): EditableAnchorTrack[] {
	return season.tracks.map((track) => ({
		trackId: track.trackId,
		discipline: track.discipline,
		currency: track.currency,
		anchors: track.anchors.map((anchor, index) => ({
			fromWeekKey: anchor.fromWeekKey,
			weekInPlan: weekInPlanOf(season, anchor.fromWeekKey),
			value: anchor.value,
			// The list arrives sorted by week key, so the earliest is the first — the
			// same ordering `removeSeasonAnchorSegment` refuses on, rather than a second
			// reading of "which one is first" that could disagree with it.
			earliest: index === 0,
		})),
	}))
}

/**
 * Which week of the plan a stored week key lands on, 1-based, or null for a key the
 * plan no longer covers — a phase can shrink under a dated row, and nothing
 * cascades to one (ADR 0044 §3).
 */
function weekInPlanOf(season: AuthoredSeason, weekKey: string): number | null {
	const index = weekIndexOf(season.startWeekKey, weekKey)
	return index >= 0 && index < season.weeks.length ? index + 1 : null
}

function strengthTracksOf(season: AuthoredSeason): EditableStrengthTrack[] {
	return season.tracks
		.filter((track) => !isCardioDiscipline(track.discipline))
		.map((track) => ({
			trackId: track.trackId,
			discipline: track.discipline,
			currency: track.currency,
			segments: track.strengthSegments,
			// Handed over so the section can tell a live **Block Boundary Step** from a
			// dead one: the walk skips the step of the block the anchor in force restarted
			// in (ADR 0040 §5), and the editor cannot see that without the anchors. Read
			// at this boundary because the conversion from week *keys* to week *indices*
			// needs the Plan Start Week, which a component is not given.
			anchors: anchorPlacementsOf(season.startWeekKey, track.anchors),
		}))
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	// Each editor's action lives beside its component (#533); this only
	// dispatches on the intent.
	switch (intent) {
		case 'add-phase':
		case 'move-phase':
		case 'remove-phase':
		case 'delete-plan':
			return phaseEditAction(userId, intent, formData)
		// ── The set of Training Tracks (#414) ─────────────────────────────────
		// Adding and removing whole tracks, and nothing in between: a track's
		// **Volume Currency** is authored once and never edited (ADR 0044 §8), so
		// re-authoring a unit is these two acts and the athlete can see both.
		case 'add-track':
		case 'remove-track':
			return trackEditAction(userId, intent, formData)
		// ── The Week Pattern (#410) ───────────────────────────────────────────
		// Authoring and previewing only: nothing here stamps a session, so no case
		// below writes to the calendar.
		case 'add-week-pattern':
		case 'start-week-pattern':
		case 'rename-week-pattern':
		case 'move-week-pattern':
		case 'remove-week-pattern':
		case 'add-week-pattern-day':
		case 'move-week-pattern-day':
		case 'remove-week-pattern-day':
			return weekPatternAction(userId, intent, request, formData)
		// ── Copying a week onto another week (#415) ───────────────────────────
		// The one write on this route that leaves Workout Sessions behind, and the
		// one whose refusal can be a question: a target week that already holds
		// sessions comes back asking, and the second submit is this one plus a yes
		// (ADR 0044 §6).
		case 'copy-week':
			return copyWeekOnto(userId, request, formData)
		// ── Re-anchoring a track mid-season (#407) ────────────────────────────
		// One track's **Season Anchor** list. Adding and editing are one write on
		// `(trackId, fromWeekKey)` — the pair is the segment's identity — and the two
		// intents differ only in which form the reply lands on.
		case 'add-season-anchor':
		case 'set-season-anchor':
		case 'remove-season-anchor':
			return seasonAnchorAction(userId, intent, formData)
		case 'set-segment-rates':
			return authorSegmentRates(userId, formData)
		case 'set-quality-mix':
			return authorQualityMix(userId, formData)
		// ── The strength Training Track's dated blocks (#409) ─────────────────
		case 'add-strength-segment':
		case 'set-strength-segment':
		case 'remove-strength-segment':
			return strengthSegmentAction(userId, intent, formData)
		case 'apply-preset':
			return applyPresetAction(userId, request, formData)
		case 'fit-to-event':
			return fitToEventAction(userId, request, formData)
		// _Legg til et løp_ (#505 stories 7–8, #518): preview, then attach.
		case 'preview-attach-event':
		case 'attach-event':
			return attachEventAction(userId, formData)
		case 'preview-philosophy':
		case 'switch-philosophy':
			return philosophySwitchAction(userId, request, formData)
		// The Sesong edits (#505 stories 72–77): preview, then apply.
		case 'preview-season-edit':
		case 'apply-season-edit':
			return seasonEditAction(userId, request, formData)
		case 'add-strength-track':
			return strengthOfferAction(userId, request, formData)
	}

	return refuse(SESONG_REFUSAL_LABELS.unknown)
}

export default function PlanRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const {
		season,
		tab,
		seasonQuery,
		libraryLifts,
		week,
		workouts,
		strengthTracks,
		mixWarnings,
		weeksWithSessions,
		anchorTracks,
		conversionContexts,
		fitnessAnchor,
		trackProposals,
		attachableEvents,
		strengthOffer,
		firstUnbegunWeekKey,
		seasonEvents,
		seasonPicture,
		restingOpenEnded,
		seasonFitness,
		nextEasyWeek,
		trackDays,
	} = loaderData
	// A refused add or remove of a whole **Training Track** belongs beside the
	// roster, which sits above the tabs; every other refusal belongs at the top of
	// the reading that produced it. Split here rather than rendered twice, so one
	// refusal is said once (#414).
	const trackError =
		actionData && 'scope' in actionData && 'error' in actionData
			? actionData.error
			: undefined
	const error =
		actionData && 'error' in actionData && trackError === undefined
			? actionData.error
			: undefined
	// _Legg til et løp_ answers inside its own form, with what was typed kept,
	// and its preview under it (#518).
	const attachReply =
		actionData && 'attachEvent' in actionData ? actionData.attachEvent : null
	// _Bytt filosofi_ and the strength offer answer inside their own forms.
	const philosophy =
		actionData && 'philosophy' in actionData ? actionData.philosophy : null
	// _Bytt treningsform_ answers in the lead, under the card that asked (#581).
	const treningsformReply =
		actionData && 'treningsform' in actionData
			? (actionData.treningsform ?? null)
			: null
	// The Sesong edits answer inside their own forms too.
	const seasonEdit =
		actionData && 'seasonEdit' in actionData ? actionData.seasonEdit : null
	const strengthOfferResult =
		actionData && 'strengthOffer' in actionData
			? actionData.strengthOffer.result
			: undefined
	// Every other answer was asked inside Avansert, so it opens Avansert: a
	// refusal or a preview is read where it was asked (`__plan-advanced.tsx`).
	// The lead's own two answer in the lead and leave Avansert closed.
	const advancedReply =
		actionData && attachReply == null && treningsformReply == null
			? actionData
			: null
	// The same, for a week copy aimed at a week that already holds sessions (#415).
	const pendingCopy: PendingCopy | null =
		actionData && 'copy' in actionData ? actionData.copy : null
	const timezone = season.timezone
	const totalWeeks = season.weeks.length

	// The chosen week, as a row rather than a key — the preview needs that week's own
	// derived targets. `null` only for a plan with no weeks at all.
	const previewWeek =
		season.weeks.find((entry) => entry.weekKey === week) ?? null
	// Kept in the URL only when it is not the default, exactly like the tab: the
	// plan's first week is what an athlete gets without asking, so naming it in the
	// query would put a param on every link for nothing.
	const weekQuery = week && week !== season.weeks[0]?.weekKey ? week : null

	// The tab is URL state, and it must not drop the season the athlete is looking
	// at or the week they are reading their pattern against: all three params travel
	// together, with the defaults kept out of the URL.
	function readingHref(name: Tab): string {
		const params = new URLSearchParams()
		if (seasonQuery) params.set(seasonQuery.name, seasonQuery.value)
		if (name !== 'blocks') params.set('tab', name)
		if (weekQuery) params.set('week', weekQuery)
		const search = params.toString()
		return search ? `/training/plan?${search}` : '/training/plan'
	}

	return (
		// One column to `lg`, then two (decision 13): wide enough for both
		// columns to keep a phone's reading width rather than one long line.
		<main className="container mx-auto max-w-2xl py-6 md:py-8 lg:max-w-6xl">
			{/* Plan is a tab's landing page (ADR 0101, ADR 0083), so it carries no
			    back affordance (ui-conventions §3.3): the tab bar is the way out. */}
			<PageHeader
				title={APP_TAB_LABELS.plan}
				className="mb-2"
				// Owner decision 6: "+ Ny" on I dag makes sessions only; a race and a
				// plan are started here.
				actions={
					<nav
						aria-label={SESONG_ENTRY_LABELS.group}
						className="flex flex-wrap justify-end gap-2"
					>
						<PillLink to="/training/events/new" className="px-3">
							<Icon name="plus" size="sm" />
							{SESONG_ENTRY_LABELS.newEvent}
						</PillLink>
						<PillLink to="/training/plan/new" className="px-3">
							<Icon name="plus" size="sm" />
							{SESONG_ENTRY_LABELS.newPlan}
						</PillLink>
					</nav>
				}
			/>

			{/* Plan leads with the plan in plain words (ADR 0101 §2): the plain
			    name and the family small, the curve with this week marked, the next
			    easy week and Legg til et løp. Then Bibliotek, then everything else
			    behind a closed Avansert. One column at the phone's reading width on
			    every screen; only Avansert's inside widens to two from `lg`. */}
			<PlanLeadCard
				family={season.family}
				toward={
					season.eventId != null && season.eventDate != null
						? {
								kind: 'event',
								eventId: season.eventId,
								name: season.eventName ?? '',
								date: season.eventDate,
								weeks: totalWeeks,
							}
						: { kind: 'open-ended', round: season.round ?? 1 }
				}
				startsAt={season.phases[0]!.startsAt}
				timezone={timezone}
				picture={seasonPicture}
				nextEasyWeek={nextEasyWeek}
				attach={{
					outlineId: season.outlineId,
					events: attachableEvents,
					reply: attachReply,
				}}
				resting={
					season.resting ? (
						// A plan toward a race is the active one, so this plan lays no weeks
						// until that race has passed (ADR 0079).
						<p
							data-plan-resting
							className="text-footnote text-muted-foreground text-center"
						>
							{SESONG_PAGE_LABELS.resting}{' '}
							<Link
								to="/training/plan"
								className="text-foreground relative inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
							>
								{SESONG_PAGE_LABELS.restingLink}
							</Link>
						</p>
					) : restingOpenEnded ? (
						// The way back to the athlete's open-ended plan while it rests behind
						// this one (audit B12): otherwise only `?outline=` reached it.
						<p
							data-plan-resting-elsewhere
							className="text-footnote text-muted-foreground text-center"
						>
							{SESONG_PAGE_LABELS.restingElsewhere}{' '}
							<Link
								to={`/training/plan?outline=${restingOpenEnded.outlineId}`}
								className="text-foreground relative inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
							>
								{SESONG_PAGE_LABELS.restingElsewhereLink}
							</Link>
						</p>
					) : null
				}
				className="lg:mx-auto lg:max-w-2xl"
			>
				{/* Bytt treningsform, after Legg til et løp (ADR 0101 §2): the Start
				    Options again for this plan, switching only behind the preview. */}
				{loaderData.treningsform ? (
					<TreningsformOffer
						outlineId={season.outlineId}
						view={loaderData.treningsform}
						reply={treningsformReply}
					/>
				) : null}
			</PlanLeadCard>

			{/* Bibliotek, which had its own tab (ADR 0101 §1): under the lead and
			    above Avansert (ADR 0101 §2's order). */}
			<LibrarySection
				lifts={libraryLifts}
				className="mt-10 lg:mx-auto lg:max-w-2xl"
			/>

			<PlanAdvanced reply={advancedReply} className="mt-10">
				{/* The surface's order (round-2 decisions 12 and 13, ADR 0090): the season
			    as a picture first — I dag's curve and table, where a week is read and
			    opened — then the edits and the philosophy that change it, the Events
			    it is planned around, what it adds up to, and the two readings that
			    author its rules. */}
				{/* From `lg`, two columns (round-2 decision 13, ADR 0090): the season —
			    picture and table, what it comes to, the readings — on the left, and
			    the edits, the philosophy and the Events on the right. Not the full
			    spreadsheet (Arket N). One DOM order for both widths, so the phone's
			    order and the keyboard's are the same: the right column is one
			    element spanning every row, and the left items flow down the rows
			    beside it. The last row is `1fr`, so a tall right column grows that
			    row (the readings', which run longest) rather than opening gaps
			    between the left column's cards. */}
				<div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[repeat(5,auto)_1fr] lg:items-start lg:space-y-0 lg:gap-x-6 lg:gap-y-6">
					{seasonPicture ? (
						<div className="lg:col-start-1">
							<SeasonPicture
								picture={seasonPicture}
								firstUnbegunWeekKey={firstUnbegunWeekKey}
							/>
						</div>
					) : null}

					<div className="space-y-6 lg:col-start-2 lg:row-span-full lg:row-start-1">
						{/* The Sesong edits (#505 stories 72–77): a week's target, a phase's
					    name and length, and the easy week — each behind a preview. A row
					    of the season table opens the first of them on its week. */}
						<PlanCard
							titleId="season-edits"
							title={SEASON_EDIT_LABELS.title}
							contentClassName="space-y-3"
							className="scroll-mt-4"
						>
							<SeasonEditsCard
								outlineId={season.outlineId}
								weeks={season.weeks}
								phases={season.phases}
								tracks={season.tracks}
								firstUnbegunWeekKey={firstUnbegunWeekKey}
								reply={seasonEdit}
							/>
						</PlanCard>

						{/* The philosophy the plan follows, and the way to another one behind
					    a preview (#505 stories 10–14). Its own card: it is a choice about
					    the whole season, not a figure of it. */}
						<PlanCard
							titleId="philosophy"
							title={PHILOSOPHY_SWITCH_LABELS.title}
							contentClassName="space-y-3"
							className="scroll-mt-4"
						>
							<PhilosophyCard
								key={philosophy?.preview?.digest ?? 'none'}
								outlineId={season.outlineId}
								family={season.family}
								preview={philosophy?.preview ?? null}
								lastResult={philosophy?.result}
								confirmResult={philosophy?.confirmResult}
							/>
						</PlanCard>

						{/* The Events the season is planned around, and the ways to plan
					    another race or another plan (spec #505 story 57, decision 6). */}
						<SeasonEvents
							events={seasonEvents.events}
							upcomingCount={seasonEvents.upcomingCount}
						/>
					</div>

					{/* What the plan comes to, as figures rather than as a paragraph. The
				    **Season Span** is the headline #399 asks for, and it keeps its own
				    per-group honesty in here — the card is a frame around the figures and
				    decides nothing about which of them may be added to which. */}
					<PlanCard
						titleId="season-summary"
						title={SESONG_PAGE_LABELS.summaryTitle}
						contentClassName="space-y-5"
						className="lg:col-start-1"
					>
						{season.spanGroups.length > 0 ? (
							<SeasonSpanHeadline
								groups={season.spanGroups}
								weeks={season.weeks}
							/>
						) : null}
						{/* Where the season lands against the Event. No Event, nothing to fit
					    to: an open-ended plan says nothing here rather than measuring
					    itself against a race it does not have. */}
						{season.fit ? (
							<p className="border-border/60 text-footnote text-muted-foreground border-t pt-4">
								{fitSentence(season.fit)}
							</p>
						) : null}
						{strengthOffer ? (
							<StrengthTrackOfferCard
								outlineId={season.outlineId}
								offer={strengthOffer}
								lastResult={strengthOfferResult}
							/>
						) : null}
						<TrackRoster
							outlineId={season.outlineId}
							tracks={season.tracks}
							proposals={trackProposals}
							error={trackError}
						/>
					</PlanCard>

					{/* Which days each sport and Simple Activity trains on, and who
				    chose them (#598, ADR 0104 §4): beside what the plan consists of,
				    since a track's days are part of its week. */}
					{trackDays ? (
						<PlanCard
							titleId="track-days"
							title={PLAN_TRACK_DAYS_LABELS.title}
							className="scroll-mt-4 lg:col-start-1"
						>
							<TrackDaysCard state={trackDays} />
						</PlanCard>
					) : null}

					{/* What is left to set up, above the two readings that do it — gone
				    once nothing is outstanding: a way in, not a scoreboard. */}
					<div className="lg:col-start-1">
						<NextSteps
							season={season}
							weeksWithSessions={weeksWithSessions}
							hrefFor={readingHref}
						/>
					</div>

					{/* What the plan **cannot** tell you (#399 story 49, ADR 0047 §5): about
				    the plan, not a control, so said once beside its figures — behind a
				    closed line that names it, rather than three paragraphs in the way
				    of the edits. */}
					{season.unavailableReadings.length > 0 ? (
						<div className="lg:col-start-1">
							<UnavailableReadingsNotice
								readings={season.unavailableReadings}
							/>
						</div>
					) : null}

					<div className="space-y-6 lg:col-start-1">
						<SegmentedNav
							label={SESONG_PAGE_LABELS.readings}
							options={TABS.map((name) => ({
								key: name,
								label: TAB_LABELS[name],
							}))}
							current={tab}
							hrefFor={readingHref}
						/>

						{tab === 'blocks' ? (
							<BlocksReading
								season={season}
								error={error}
								actionData={actionData}
								strengthTracks={strengthTracks}
								anchorTracks={anchorTracks}
								firstUnbegunWeekKey={firstUnbegunWeekKey}
								conversionContexts={conversionContexts}
								fitnessAnchor={fitnessAnchor}
								seasonFitness={seasonFitness}
							/>
						) : (
							<WeeksReading
								season={season}
								error={error}
								chosenWeek={previewWeek}
								workouts={workouts}
								seasonQuery={seasonQuery}
								pendingCopy={pendingCopy}
								mixWarnings={mixWarnings}
								firstUnbegunWeekKey={firstUnbegunWeekKey}
							/>
						)}
					</div>
				</div>
			</PlanAdvanced>
		</main>
	)
}

/**
 * What is left to set up, and where to do it.
 *
 * **Why a planning surface has a to-do list on it at all.** Every control this
 * page owns is discoverable *if you know a season has these parts*. An athlete
 * who has not authored a season starts with blocks and no idea that a typical
 * week exists. This is the sequence, and nothing more: it computes no new figure
 * and owns no control, it names the next act and links to the reading that
 * performs it.
 *
 * **Two steps, since the weeks fill themselves** (round-2 decision 14, ADR
 * 0090). Stamping is no longer the athlete's: the week change lays each week as
 * the Planning Horizon reaches it (ADR 0080 §1), and a new typical week lays the
 * weeks up to the horizon at once. So what a plan can still be missing is:
 *
 *   1. **A climb.** A plan whose segments carry no **Volume Ramp** has every week
 *      the size of its first — valid (ADR 0044 §4), but almost never meant.
 *   2. **A typical week.** The **Week Pattern** the horizon fills the weeks from.
 *
 * **It disappears.** With both there, the athlete reads one quiet line saying
 * how much of the season is on the calendar and that the rest fills itself.
 */
function NextSteps({
	season,
	weeksWithSessions,
	hrefFor,
}: {
	season: SeasonData
	weeksWithSessions: number
	hrefFor: (tab: Tab) => string
}) {
	// Any segment on any track: ADR 0047 §1 gave a strength segment the same ramp
	// an endurance one has, so a lifter's plan climbs or does not climb by the same
	// reading a runner's does.
	const climbs = season.tracks.some((track) =>
		track.segments.some((segment) => segment.ramp != null),
	)
	const totalWeeks = season.weeks.length
	const steps = [
		{
			key: 'climb',
			done: climbs,
			title: SESONG_NEXT_LABELS.climbTitle,
			detail: SESONG_NEXT_LABELS.climbDetail,
			href: hrefFor('blocks'),
			action: SESONG_NEXT_LABELS.climbAction,
		},
		{
			key: 'pattern',
			done: season.patterns.some((pattern) => pattern.days.length > 0),
			title: SESONG_NEXT_LABELS.patternTitle,
			detail: SESONG_NEXT_LABELS.patternDetail,
			href: hrefFor('weeks'),
			action: SESONG_NEXT_LABELS.patternAction,
		},
	].filter((step) => !step.done)

	if (steps.length === 0) {
		return (
			<p className="text-footnote text-muted-foreground" data-plan-filled>
				{SESONG_PAGE_LABELS.fillFilled(weeksWithSessions, totalWeeks)}
			</p>
		)
	}

	return (
		<PlanCard
			titleId="next-steps"
			title={SESONG_NEXT_LABELS.title}
			aside={SESONG_NEXT_LABELS.left(steps.length)}
			contentClassName="divide-border/60 divide-y"
		>
			{steps.map((step) => (
				<div
					key={step.key}
					// Stacked on a phone and side by side from `sm`: a pill pinned beside
					// three lines of wrapping prose reads as though it belonged to the
					// first line of it (ADR 0028 §1.5's rule for a phone's single column).
					className="flex flex-col items-start gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3"
				>
					<span className="min-w-0 flex-1">
						<span className="text-callout block font-semibold">
							{step.title}
						</span>
						<span className="text-footnote text-muted-foreground block">
							{step.detail}
						</span>
					</span>
					<PillLink to={step.href} className="shrink-0">
						{step.action}
					</PillLink>
				</div>
			))}
		</PlanCard>
	)
}

/**
 * The **Season Span**: `55 → 78 km/wk`, the anchor and the peak loading week — and
 * **one figure per commensurability group**, never one per track (ADR 0043 §5).
 *
 * A pure runner reads one line. A runner who lifts reads two, because no number
 * spans an endurance and a strength track in either direction (ADR 0046 §1). A
 * triathlete reads their three endurance tracks added into one, because a TSS is
 * the same hour of threshold work in each of them — and *that* figure is marked
 * **derived**, since nobody typed it.
 *
 * The headline needs no **Unavailable Metric** for any combination of tracks, and
 * the reason is structural rather than lucky: every group is a currency the tracks
 * in it were *authored* in, so nothing is converted and no track is asked a
 * question it cannot answer. A derived currency *view* is a different reading and
 * is explicitly never the headline (ADR 0043 §8).
 *
 * A span and not a season total, because a total conflates how big a plan is with
 * how long it is and hides the **Volume Ramp** that is half of what the athlete
 * authored (ADR 0043 §4). The total rides underneath as a **secondary** figure,
 * which is exactly where it belongs.
 *
 * Every figure is read from the authored guideline level — the anchors and the
 * ramps, through the same derivation the weeks use — and never summed from
 * materialized **Workout Sessions**, so none changes character with how far into
 * the season the athlete is.
 */
function SeasonSpanHeadline({
	// Taken as the groups rather than as the tracks, so the grouping has one home
	// and this component cannot become a second opinion about what may be added to
	// what.
	groups,
	weeks,
}: {
	groups: SeasonData['spanGroups']
	weeks: SeasonData['weeks']
}) {
	return (
		// One span per group, side by side rather than stacked, because a runner who
		// lifts is meant to read *two figures about one season* — and a vertical stack
		// of two headlines reads as the second correcting the first. The derivation
		// sentence stays under its own figure, where the number it qualifies is.
		<ul className="grid gap-5 sm:grid-cols-2">
			{groups.map((group) => {
				const peakWeek = weeks[group.span.peakWeekIndex]
				// Named whenever there is more than one figure to tell apart, and always
				// on a derived one: an accumulated number has to say which tracks it
				// covers, or it would read as the athlete's whole week.
				const named = groups.length > 1 || group.marker === 'derived'
				const several = group.disciplines.length > 1
				return (
					<li key={group.key} className="space-y-1">
						{named ? (
							<p className="flex flex-wrap items-center gap-2 text-sm font-medium">
								<span>
									{SESONG_PAGE_LABELS.spanTracks(
										group.disciplines.map(nbTrackName),
									)}
								</span>
								{group.marker === 'derived' ? (
									// The marker is binary and shown on the figure it qualifies,
									// never as a footnote (ADR 0045 §9).
									<Badge variant="secondary">
										{SESONG_PAGE_LABELS.derived}
									</Badge>
								) : null}
							</p>
						) : null}
						{/* `text-xl`, not the page title's size: two spans sit side by side on
						    this card, and at 24px a figure like `55.0 km/wk → 73.8 km/wk` wraps
						    mid-arrow in a half-width column — which reads as two numbers rather
						    than as one span. */}
						<p className="text-xl font-semibold tracking-tight text-balance tabular-nums">
							{formatNbWeeklyVolume(group.span.anchor, group.currency)} →{' '}
							{formatNbWeeklyVolume(group.span.peak, group.currency)}
						</p>
						<p className="text-muted-foreground text-sm">
							{group.marker === 'derived' &&
							accumulatesAcrossDisciplines(group.currency)
								? `${NB_ACCUMULATED_SPAN_LABELS[group.currency]} `
								: null}
							{SESONG_PAGE_LABELS.spanNote(
								peakWeek ? weekNumberOf(peakWeek) : null,
								several,
							)}
							{group.total == null
								? null
								: SESONG_PAGE_LABELS.spanTotal(
										formatNbVolumeTotal(group.total, group.currency),
									)}
						</p>
					</li>
				)
			})}
		</ul>
	)
}

/**
 * Where the season ends against the Event, said plainly. The plan is never
 * stretched to meet the Event: the athlete decides whether to add weeks (ADR 0044
 * §3, spec #399 story 4).
 */
function fitSentence(fit: NonNullable<SeasonData['fit']>): string {
	if (fit.kind === 'ends-on-event-week') return SESONG_PAGE_LABELS.fitEnds
	return fit.kind === 'ends-before'
		? SESONG_PAGE_LABELS.fitBefore(fit.weeks)
		: SESONG_PAGE_LABELS.fitPast(fit.weeks)
}

export { GeneralErrorBoundary as ErrorBoundary }
