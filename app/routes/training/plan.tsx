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
 */
import { type SubmissionResult } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { data, Link, redirect } from 'react-router'
import { z } from 'zod/v3'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { isoWeekNumber, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getEventsForUser } from '#app/utils/event.server.ts'
import { readPlanStartOptions } from '#app/utils/first-run/plan-start-options.server.ts'
import {
	formatNbDate,
	formatNbVolumeTotal,
	formatNbWeeklyVolume,
} from '#app/utils/format.ts'
import {
	ATTACH_EVENT_LABELS,
	ATTACH_EVENT_REFUSAL_LABELS,
	attachedEventSentence,
	APP_TAB_LABELS,
	NB_ACCUMULATED_SPAN_LABELS,
	nbTrackName,
	SESONG_ENTRY_LABELS,
	PHILOSOPHY_SWITCH_LABELS,
	PRESET_GALLERY_LABELS,
	PHILOSOPHY_SWITCH_REFUSAL_LABELS,
	PLAN_LEAD_LABELS,
	PLAN_TRACK_DAYS_LABELS,
	SEASON_EDIT_LABELS,
	SESONG_COPY_LABELS,
	SESONG_NEXT_LABELS,
	SESONG_PAGE_LABELS,
	SESONG_PATTERN_LABELS,
	SESONG_PHASE_FIELD_LABELS,
	SESONG_REFUSAL_LABELS,
	SESONG_SEGMENT_LABELS,
	SESONG_TRACK_LABELS,
	STRENGTH_OFFER_LABELS,
	switchedPhilosophySentence,
	TRENINGSFORM_LABELS,
} from '#app/utils/labels.ts'
import { fillPlanWeeksToHorizon } from '#app/utils/load/horizon-fill.server.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { AttachEventFormSchema } from '#app/utils/plan-outline/attach-event-schema.ts'
import {
	EnduranceSegmentSetSchema,
	PatternWeekdaySchema,
	PhaseNameSchema,
	PhaseWeeksSchema,
	QualitySessionMixSetSchema,
	SeasonAnchorRemoveSchema,
	SeasonAnchorSetSchema,
	ShareWeightSchema,
	StrengthSegmentAddSchema,
	StrengthSegmentSetSchema,
	WeekPatternNameSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addPhase,
	addStrengthSegment,
	addTrack,
	addWeekPattern,
	addWeekPatternDay,
	applyPreset,
	createStarterWeekPattern,
	deletePlanOutline,
	listPlanAnchorCandidates,
	movePhase,
	fitPlanToEvent,
	moveWeekPattern,
	moveWeekPatternDay,
	removePhase,
	removeSeasonAnchorSegment,
	removeStrengthSegment,
	removeTrack,
	removeWeekPattern,
	removeWeekPatternDay,
	renameWeekPattern,
	setEnduranceSegment,
	setQualitySessionMix,
	setSeasonAnchorValue,
	setStrengthSegment,
	type AddTrackRefusal,
	type FitToEventRefusal,
	type PhaseEditRefusal,
	type RemoveTrackRefusal,
	type SeasonAnchorRefusal,
	type StrengthSegmentRefusal,
	type WeekPatternEditRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import { accumulatesAcrossDisciplines } from '#app/utils/plan-outline/commensurability.ts'
import {
	copyWeek,
	type CopyWeekRefusal,
	type CopyWeekReport,
} from '#app/utils/plan-outline/copy-week.server.ts'
import {
	WeekCopySchema,
	type CopySkipReason,
} from '#app/utils/plan-outline/copy-week.ts'
import { RHYTHMS, VOLUME_CURRENCIES } from '#app/utils/plan-outline/derive.ts'
import {
	readAnchorContext,
	readStrengthTrackOffer,
} from '#app/utils/plan-outline/history.server.ts'
import {
	addRaceToOpenEndedPlan,
	attachEventToOutline,
} from '#app/utils/plan-outline/open-ended.server.ts'
import {
	PhilosophySwitchFormSchema,
	TRENINGSFORM_SURFACE,
	StrengthOfferFormSchema,
} from '#app/utils/plan-outline/philosophy-schema.ts'
import {
	readPhilosophySwitch,
	switchPhilosophy,
} from '#app/utils/plan-outline/philosophy.server.ts'
import { type PhilosophySwitchPreview } from '#app/utils/plan-outline/philosophy.ts'
import { PRESET_KEYS } from '#app/utils/plan-outline/presets.ts'
import {
	proposeTrack,
	type TrackProposal,
} from '#app/utils/plan-outline/proposal.ts'
import { QUALITY_ZONES } from '#app/utils/plan-outline/quality-mix.ts'
import {
	readSeasonChartInputs,
	withWeekStarts,
} from '#app/utils/plan-outline/season-chart.server.ts'
import { readStampedMixWarnings } from '#app/utils/plan-outline/stamp.server.ts'
import { type StarterProposal } from '#app/utils/plan-outline/starter-pattern.ts'
import { addProposedStrengthTrack } from '#app/utils/plan-outline/strength-offer.server.ts'
import { readTrackDays } from '#app/utils/plan-outline/track-days.server.ts'
import { weekIndexOf } from '#app/utils/plan-outline/week-keys.ts'
import { PATTERN_DAY_KINDS } from '#app/utils/plan-outline/week-pattern.ts'
import { countWeeksWithSessions } from '#app/utils/plan-outline/week-sessions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
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
import { BlocksReading } from './__blocks-reading.tsx'
import { type PendingCopy } from './__copy-week.tsx'
import { fitProposalSentence } from './__fit-to-event.tsx'
import { readLibraryLifts } from './__library-section.server.ts'
import { LibrarySection } from './__library-section.tsx'
import {
	PhilosophyCard,
	StrengthTrackOfferCard,
	type PhilosophyPreviewView,
} from './__philosophy-switch.tsx'
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
import {
	SeasonAnchorFormSchema,
	type EditableAnchorTrack,
} from './__season-anchor-editor.tsx'
import { seasonFitnessOf } from './__season-chart.tsx'
import { seasonEditAction } from './__season-edits.server.ts'
import { SeasonEditsCard } from './__season-edits.tsx'
import { SEASON_EVENTS_SHOWN, SeasonEvents } from './__season-events.tsx'
import { UnavailableReadingsNotice } from './__season-notices.tsx'
import { readSeasonPicture } from './__season-picture.server.ts'
import { SeasonPicture } from './__season-picture.tsx'
import {
	SegmentFormSchema,
	mixFieldName,
	MixFormSchema,
} from './__segment-editor.tsx'
import {
	StrengthSegmentFormSchema,
	type EditableStrengthTrack,
} from './__strength-segment-editor.tsx'
import { TrackDaysCard } from './__track-days.tsx'
import { TrackRoster } from './__track-editor.tsx'
import { treningsformViewOf } from './__treningsform-view.ts'
import { TreningsformOffer } from './__treningsform.tsx'
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

/**
 * The name of a shape, read straight off the body like every other field on this
 * page. `PRESET_KEYS` is the one list of shipped keys — the service's schema reads
 * the same constant — so the surface cannot ask for a preset the app never
 * shipped, and a body carrying anything else is refused before the service sees it.
 */
const PresetKeyField = z.enum(PRESET_KEYS)

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
	const workouts = await getAuthoredWorkouts(userId)

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

/**
 * A box the athlete left empty, as HTML delivers it: absent from the body, or a
 * string of nothing.
 *
 * Every field below preprocesses through this, because `Number('')` is 0 — which
 * would read back as a bound the athlete broke ("a phase runs at least one week")
 * when what happened is that nothing was typed. What each field maps a blank *to* is
 * its own business and deliberately not always the same: `undefined` where a blank
 * means "you have not answered yet", `null` where the blank is itself the answer.
 */
function isBlank(value: unknown): boolean {
	return value == null || (typeof value === 'string' && value.trim() === '')
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
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({ message: SESONG_PHASE_FIELD_LABELS.weeks }),
		})
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
	errorMap: () => ({ message: SESONG_PHASE_FIELD_LABELS.rhythm }),
})
const IdField = z.string().min(1)

/**
 * A new **Training Track**'s three fields (#414).
 *
 * The Discipline and the currency are the domain's own vocabularies, so a body
 * naming a fourth unit is refused here rather than reaching the service. The pair
 * is *not* cross-checked on this side — whether a Discipline may author a given
 * currency is `TrackAddSchema`'s refine, which is the same `currencyOptionsFor` the
 * form's picker is built from, so the rule has one home.
 */
const DisciplineField = z.enum(DISCIPLINES, {
	errorMap: () => ({ message: SESONG_TRACK_LABELS.disciplineRequired }),
})
const CurrencyField = z.enum(VOLUME_CURRENCIES, {
	errorMap: () => ({ message: SESONG_TRACK_LABELS.unitRequired }),
})
const AnchorValueField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({ message: SESONG_TRACK_LABELS.anchorRequired }),
		})
		.positive(SESONG_TRACK_LABELS.anchorPositive),
)

/**
 * A **Week Pattern**'s name, and a pattern day's three authored values, as the
 * forms submit them.
 *
 * Each pipes into the authoring schema rather than restating its bounds, for the
 * reason `WeeksField` does: the rule lives in one place and what these add is
 * wording. A pattern day carries **no volume field and no zone field** anywhere on
 * this route — not one that is validated away, one that has nowhere to be
 * submitted (ADR 0044 §7, ADR 0042 §9).
 */
const PatternNameField = z.preprocess(
	(value) => value ?? '',
	WeekPatternNameSchema,
)

const WeekdayField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({ message: SESONG_PATTERN_LABELS.whichDay }),
		})
		.pipe(PatternWeekdaySchema),
)

const ShareWeightField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({
				message: SESONG_PATTERN_LABELS.weightRequired,
			}),
		})
		.pipe(ShareWeightSchema),
)

/**
 * The kind of day, from the two the domain has — the domain's own list, so a third
 * kind cannot be invented on this surface and cannot be forgotten here either.
 */
const PatternDayKindField = z.enum(PATTERN_DAY_KINDS)

/**
 * A share day's optional **shape**. Blank is `null` and `null` is a *choice* —
 * "volume with no structure" — so it travels as a value rather than as an omitted
 * field, the way a blank rate does.
 */
const ShapeField = z.preprocess(
	(value) => (isBlank(value) ? null : value),
	z.string().min(1).nullable(),
)

/** A checkbox that is absent from the body when unchecked, as HTML has it. */
function checked(formData: FormData, name: string): boolean {
	return formData.get(name) === 'on'
}

/**
 * Which way a move goes — the one field every reorder on this route submits, for a
 * phase, a pattern and a pattern day alike.
 *
 * Anything that is not `later` reads as `earlier` rather than being refused: a move
 * is a nudge through a sequence with no destructive end, and the service refuses the
 * edge in either direction anyway, so there is no body that can move something
 * somewhere nobody asked for.
 */
function moveDirection(formData: FormData): 'earlier' | 'later' {
	return formData.get('direction') === 'later' ? 'later' : 'earlier'
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const phaseId = IdField.safeParse(formData.get('phaseId'))
	const outlineId = IdField.safeParse(formData.get('outlineId'))
	const patternId = IdField.safeParse(formData.get('patternId'))
	const dayId = IdField.safeParse(formData.get('dayId'))

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
		case 'move-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(
				await movePhase(userId, {
					phaseId: phaseId.data,
					direction: moveDirection(formData),
				}),
			)
		}
		case 'remove-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(await removePhase(userId, { phaseId: phaseId.data }))
		}
		// ── The set of Training Tracks (#414) ─────────────────────────────────
		// Adding and removing whole tracks, and nothing in between: a track's
		// **Volume Currency** is authored once and never edited (ADR 0044 §8), so
		// re-authoring a unit is these two acts and the athlete can see both.
		case 'add-track': {
			const discipline = DisciplineField.safeParse(formData.get('discipline'))
			const currency = CurrencyField.safeParse(formData.get('currency'))
			const anchorValue = AnchorValueField.safeParse(
				formData.get('anchorValue'),
			)
			if (!outlineId.success) return refuseTrack(OUTLINE_GONE)
			if (!discipline.success) return refuseTrack(firstIssue(discipline.error))
			if (!currency.success) return refuseTrack(firstIssue(currency.error))
			if (!anchorValue.success) {
				return refuseTrack(firstIssue(anchorValue.error))
			}
			const added = await addTrack(userId, {
				outlineId: outlineId.data,
				discipline: discipline.data,
				currency: currency.data,
				anchorValue: anchorValue.data,
			})
			return added.ok
				? { ok: true as const }
				: refuseTrack(trackRefusalMessage(added.reason))
		}
		case 'remove-track': {
			const trackId = IdField.safeParse(formData.get('trackId'))
			if (!trackId.success) return refuseTrack(TRACK_GONE)
			const removed = await removeTrack(userId, { trackId: trackId.data })
			return removed.ok
				? { ok: true as const }
				: refuseTrack(trackRefusalMessage(removed.reason))
		}
		// ── The Week Pattern (#410) ───────────────────────────────────────────
		// Authoring and previewing only: nothing here stamps a session, so no case
		// below writes to the calendar.
		case 'add-week-pattern': {
			const name = PatternNameField.safeParse(formData.get('name'))
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			return reportPattern(
				await addWeekPattern(userId, {
					outlineId: outlineId.data,
					name: name.data,
				}),
			)
		}
		case 'start-week-pattern': {
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			const started = await createStarterWeekPattern(userId, {
				outlineId: outlineId.data,
			})
			if (!started.ok) {
				return refuse(
					started.reason === 'outline-gone' ? OUTLINE_GONE : NO_STARTER_WEEK,
				)
			}
			// The weeks fill themselves from the typical week (decision 14): the
			// ones up to the horizon are laid now rather than at the next close.
			await fillToHorizon(userId)
			// A toast for `apply-preset`'s reason: a week the athlete did not type
			// just appeared, and they are owed where it came from in words — the
			// availability it read, or the convention it fell back to — before they
			// start editing it.
			const url = new URL(request.url)
			return redirectWithToast(`${url.pathname}${url.search}`, {
				type: 'success',
				title: SESONG_PATTERN_LABELS.starterToast,
				description: starterSentence(started.proposal),
			})
		}
		case 'rename-week-pattern': {
			const name = PatternNameField.safeParse(formData.get('name'))
			if (!patternId.success) return refuse(PATTERN_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			return reportPattern(
				await renameWeekPattern(userId, {
					patternId: patternId.data,
					name: name.data,
				}),
			)
		}
		case 'move-week-pattern': {
			if (!patternId.success) return refuse(PATTERN_GONE)
			return reportPattern(
				await moveWeekPattern(userId, {
					patternId: patternId.data,
					direction: moveDirection(formData),
				}),
			)
		}
		case 'remove-week-pattern': {
			if (!patternId.success) return refuse(PATTERN_GONE)
			return reportPattern(
				await removeWeekPattern(userId, { patternId: patternId.data }),
			)
		}
		case 'add-week-pattern-day': {
			const trackId = IdField.safeParse(formData.get('trackId'))
			const weekday = WeekdayField.safeParse(formData.get('weekday'))
			const kind = PatternDayKindField.safeParse(formData.get('kind'))
			if (!patternId.success) return refuse(PATTERN_GONE)
			if (!trackId.success) return refuse(TRACK_MISSING)
			if (!weekday.success) return refuse(firstIssue(weekday.error))
			if (!kind.success) return refuse(DAY_KIND_UNKNOWN)
			if (kind.data === 'fixed') {
				const workoutId = IdField.safeParse(formData.get('workoutId'))
				// A fixed day *is* its Workout, so a body without one is refused rather
				// than quietly stored as a share: that would be a different day than the
				// athlete asked for, and it would carry a weight nobody typed.
				if (!workoutId.success) return refuse(WORKOUT_MISSING)
				return reportPattern(
					await fillAfterDay(
						userId,
						await addWeekPatternDay(userId, {
							kind: 'fixed',
							patternId: patternId.data,
							trackId: trackId.data,
							weekday: weekday.data,
							workoutId: workoutId.data,
						}),
					),
				)
			}
			const weight = ShareWeightField.safeParse(formData.get('weight'))
			const shape = ShapeField.safeParse(formData.get('workoutId'))
			if (!weight.success) return refuse(firstIssue(weight.error))
			return reportPattern(
				await fillAfterDay(
					userId,
					await addWeekPatternDay(userId, {
						kind: 'share',
						patternId: patternId.data,
						trackId: trackId.data,
						weekday: weekday.data,
						weight: weight.data,
						workoutId: shape.success ? shape.data : null,
					}),
				),
			)
		}
		case 'move-week-pattern-day': {
			if (!dayId.success) return refuse(DAY_GONE)
			return reportPattern(
				await moveWeekPatternDay(userId, {
					dayId: dayId.data,
					direction: moveDirection(formData),
				}),
			)
		}
		case 'remove-week-pattern-day': {
			if (!dayId.success) return refuse(DAY_GONE)
			return reportPattern(
				await removeWeekPatternDay(userId, { dayId: dayId.data }),
			)
		}
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
			return authorSeasonAnchor(userId, formData, 'add')
		case 'set-season-anchor':
			return authorSeasonAnchor(userId, formData, 'set')
		case 'remove-season-anchor': {
			const trackId = IdField.safeParse(formData.get('trackId'))
			if (!trackId.success) return refuse(TRACK_GONE)
			// The service's own schema at the boundary: only a hand-made body can carry
			// a week key that is not a Monday, and it names a segment that cannot exist.
			const removing = SeasonAnchorRemoveSchema.safeParse({
				trackId: trackId.data,
				fromWeekKey: formData.get('fromWeekKey'),
			})
			if (!removing.success) return refuse(ANCHOR_GONE)
			return reportAnchor(
				await removeSeasonAnchorSegment(userId, removing.data),
			)
		}
		case 'set-segment-rates':
			return authorSegmentRates(userId, formData)
		case 'set-quality-mix':
			return authorQualityMix(userId, formData)
		// ── The strength Training Track's dated blocks (#409) ─────────────────
		case 'add-strength-segment':
			return authorStrengthSegment(userId, formData, 'add')
		case 'set-strength-segment':
			return authorStrengthSegment(userId, formData, 'set')
		case 'remove-strength-segment': {
			const segmentId = IdField.safeParse(formData.get('segmentId'))
			if (!segmentId.success) return refuse(BLOCK_GONE)
			return reportStrength(
				await removeStrengthSegment(userId, { segmentId: segmentId.data }),
			)
		}
		case 'apply-preset': {
			const presetKey = PresetKeyField.safeParse(formData.get('presetKey'))
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			if (!presetKey.success) return refuse(SHAPE_UNKNOWN)
			const applied = await applyPreset(userId, {
				outlineId: outlineId.data,
				presetKey: presetKey.data,
			})
			if (!applied.ok) {
				return applied.reason === 'plan-begun'
					? refuse(PRESET_GALLERY_LABELS.begun)
					: report(applied)
			}
			// A redirect rather than falling through to the loader, because there is
			// something to *say* that the page cannot say by itself. Applying copies the
			// shape in: nothing records where the blocks came from, no reference back
			// exists, and every value that just landed is editable through the controls
			// directly above the gallery (ADR 0044 §2, #371). An athlete who has just
			// watched their season change shape needs to be told that, in words, once.
			//
			// Back to the URL that was posted to, so the `?event=` season being read and
			// the reading it is on both survive applying. Whether the new shape now ends
			// before or after the Event is not settled here: it is `season.fit`,
			// re-derived on the next read and stated at the top of the page (ADR 0044
			// §3). Nothing stretches to fit.
			const url = new URL(request.url)
			return redirectWithToast(`${url.pathname}${url.search}`, {
				type: 'success',
				title: SESONG_REFUSAL_LABELS.presetDone,
				description: SESONG_REFUSAL_LABELS.presetDoneDetail,
			})
		}
		case 'fit-to-event': {
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			const fitted = await fitPlanToEvent(userId, {
				outlineId: outlineId.data,
			})
			if (!fitted.ok) return refuse(fitRefusalMessage(fitted.reason))
			// Said in a toast for `apply-preset`'s reason: several blocks just changed
			// length at once, and an athlete who tapped one button is owed the list of
			// what it did — the sentence names every block, so the edit is auditable
			// against the blocks below without diffing them by eye. They are ordinary
			// resizes and every one of them is editable back.
			const url = new URL(request.url)
			return redirectWithToast(`${url.pathname}${url.search}`, {
				type: 'success',
				title: SESONG_REFUSAL_LABELS.fitDone,
				description: `${fitProposalSentence(fitted.proposal)}${SESONG_REFUSAL_LABELS.fitTail}`,
			})
		}
		case 'attach-event': {
			const submission = parseWithZod(formData, {
				schema: AttachEventFormSchema,
			})
			if (submission.status !== 'success') {
				return data(
					{ intent: 'attach-event', result: submission.reply() },
					{ status: 400 },
				)
			}
			const { outlineId: attachTo, choice } = submission.value
			const attached =
				choice.kind === 'event'
					? await attachEventToOutline(userId, attachTo, choice.eventId)
					: await addRaceToOpenEndedPlan(userId, attachTo, choice)
			if (!attached.ok) {
				return data(
					{
						intent: 'attach-event',
						result: submission.reply({
							formErrors: [ATTACH_EVENT_REFUSAL_LABELS[attached.reason]],
						}),
					},
					{ status: 400 },
				)
			}
			// To the plan by its Event now: it is an ordinary plan toward it.
			return redirectWithToast(`/training/plan?event=${attached.eventId}`, {
				type: 'success',
				title: ATTACH_EVENT_LABELS.done,
				description: attachedEventSentence(attached.ended, attached.phases),
			})
		}
		case 'preview-philosophy':
		case 'switch-philosophy': {
			// The same preview and switch serve _Bytt filosofi_ in Avansert and
			// _Bytt treningsform_ in the lead (#581); each answers where it was
			// asked, under a key of its own.
			const lead = formData.get('surface') === TRENINGSFORM_SURFACE
			type Reply = ReturnType<typeof philosophyReply>
			const answer = (
				reply: Reply,
			): { treningsform: Reply } | { philosophy: Reply } =>
				lead ? { treningsform: reply } : { philosophy: reply }
			const submission = parseWithZod(formData, {
				schema: PhilosophySwitchFormSchema,
			})
			if (submission.status !== 'success') {
				return data(answer(philosophyReply({ result: submission.reply() })), {
					status: 400,
				})
			}
			const { intent: asked, outlineId: switching, family } = submission.value
			if (asked === 'preview-philosophy') {
				const preview = await readPhilosophySwitch(userId, switching, family)
				if (!preview.ok) {
					return data(
						answer(
							philosophyReply({
								result: submission.reply({
									formErrors: [
										PHILOSOPHY_SWITCH_REFUSAL_LABELS[preview.reason],
									],
								}),
							}),
						),
						{ status: 400 },
					)
				}
				// Nothing written: the preview, for the athlete to confirm under.
				return answer(
					philosophyReply({
						result: submission.reply(),
						preview: previewView(preview),
					}),
				)
			}
			const switched = await switchPhilosophy(
				userId,
				switching,
				family,
				new Date(),
				{ digest: submission.value.digest },
			)
			if (!switched.ok) {
				// Said under the preview as it stands now when there is one, so the
				// athlete reads what would land and confirms that instead.
				const message = PHILOSOPHY_SWITCH_REFUSAL_LABELS[switched.reason]
				const fresh = await readPhilosophySwitch(userId, switching, family)
				return data(
					answer(
						fresh.ok
							? philosophyReply({
									confirmResult: submission.reply({ formErrors: [message] }),
									preview: previewView(fresh),
								})
							: philosophyReply({
									result: submission.reply({ formErrors: [message] }),
								}),
					),
					{ status: 400 },
				)
			}
			const url = new URL(request.url)
			const from = formatNbDate(
				new Date(`${switched.fromWeekKey}T12:00:00Z`),
				'UTC',
			)
			return redirectWithToast(
				`${url.pathname}${url.search}`,
				lead
					? {
							type: 'success',
							title: TRENINGSFORM_LABELS.done,
							description: TRENINGSFORM_LABELS.switched(
								PLAN_LEAD_LABELS.plainName[family],
								from,
							),
						}
					: {
							type: 'success',
							title: PHILOSOPHY_SWITCH_LABELS.done,
							description: switchedPhilosophySentence(family, from),
						},
			)
		}
		// The Sesong edits (#505 stories 72–77): preview, then apply.
		case 'preview-season-edit':
		case 'apply-season-edit':
			return seasonEditAction(userId, request, formData)
		case 'add-strength-track': {
			const submission = parseWithZod(formData, {
				schema: StrengthOfferFormSchema,
			})
			if (submission.status !== 'success') {
				return data(
					{ strengthOffer: { result: submission.reply() } },
					{ status: 400 },
				)
			}
			const added = await addProposedStrengthTrack(
				userId,
				submission.value.outlineId,
			)
			if (!added.ok) {
				return data(
					{
						strengthOffer: {
							result: submission.reply({
								formErrors: [
									added.reason === 'no-strength-history'
										? STRENGTH_OFFER_LABELS.noHistory
										: trackRefusalMessage(added.reason),
								],
							}),
						},
					},
					{ status: 400 },
				)
			}
			const url = new URL(request.url)
			return redirectWithToast(`${url.pathname}${url.search}`, {
				type: 'success',
				title: STRENGTH_OFFER_LABELS.done,
				description: STRENGTH_OFFER_LABELS.doneDetail,
			})
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
				title: SESONG_REFUSAL_LABELS.deleted,
				description: SESONG_REFUSAL_LABELS.deletedDetail,
			})
		}
	}

	return refuse(SESONG_REFUSAL_LABELS.unknown)
}

const PHASE_GONE = SESONG_REFUSAL_LABELS.phaseGone
const OUTLINE_GONE = SESONG_REFUSAL_LABELS.outlineGone
const POSITION_UNREADABLE = SESONG_REFUSAL_LABELS.position
const SHAPE_UNKNOWN = SESONG_REFUSAL_LABELS.shapeUnknown
/**
 * Each way a fit can be declined, worded. The surface renders no control in any
 * of these states, so every one of them is a posted intent rather than a tap —
 * but each still gets its own sentence, because "nothing to do" and "this needs a
 * decision from you" are different answers.
 */
function fitRefusalMessage(reason: FitToEventRefusal): string {
	switch (reason) {
		case 'outline-not-found':
			return OUTLINE_GONE
		case 'no-event':
			return SESONG_REFUSAL_LABELS.noEvent
		case 'already-fits':
			return SESONG_REFUSAL_LABELS.alreadyFits
		case 'cannot-fit':
			return SESONG_REFUSAL_LABELS.cannotFit
	}
}
/** An open-ended plan resting behind a plan toward a race (ADR 0079). */
const PLAN_RESTING = SESONG_REFUSAL_LABELS.planResting
const PATTERN_GONE = SESONG_REFUSAL_LABELS.patternGone
/**
 * The one state a starter week declines in: an athlete whose availability says
 * they train on no days at all. Taken at their word rather than overruled — the
 * empty list is a statement they made, and a plan with no tracks cannot reach this
 * surface.
 */
const NO_STARTER_WEEK = SESONG_REFUSAL_LABELS.noStarterWeek
const DAY_GONE = SESONG_REFUSAL_LABELS.dayGone
/**
 * One sentence for a track that is gone, shared by a pattern day, a hand-set week
 * and a lifting block — the same absence, so it must not be worded three times and
 * drift.
 */
const TRACK_GONE = SESONG_REFUSAL_LABELS.trackGone
const WEEK_OUTSIDE_PLAN = SESONG_REFUSAL_LABELS.weekOutside
/**
 * One sentence for a week the plan does not hold, shared by a lifting block's
 * opening and a **Season Anchor** segment's — the same fact about the same span, so
 * it must not be worded twice and drift. It names both ways out, because a week
 * outside the plan has two: pick another, or make the plan reach it.
 */
const WEEK_NOT_ONE_OF_THE_PLANS = SESONG_REFUSAL_LABELS.weekNotInPlan
const ANCHOR_GONE = SESONG_REFUSAL_LABELS.anchorGone
const TRACK_MISSING = SESONG_REFUSAL_LABELS.trackMissing
const WORKOUT_MISSING = SESONG_REFUSAL_LABELS.workoutMissing
const DAY_KIND_UNKNOWN = SESONG_REFUSAL_LABELS.dayKindUnknown
const BLOCK_GONE = SESONG_REFUSAL_LABELS.blockGone

/**
 * Lay the active plan's weeks up to the Planning Horizon that it has not laid
 * yet — what a typical week that just gained its days owes the athlete now that
 * stamping is not their step (round-2 decision 14, ADR 0090). The fill never
 * lays a week the plan already laid, nor a week already begun, and lays only
 * the active plan (a resting one waits). Contained like every relay after a
 * plan write (ADR 0079 S6): the pattern is saved either way, and the week
 * change lays the horizon from the next close on.
 */
async function fillToHorizon(userId: string): Promise<void> {
	try {
		const timezone = await getAthleteTimezone(userId)
		await fillPlanWeeksToHorizon(userId, timezone, new Date())
	} catch (error) {
		console.error('Sesong: filling the weeks to the horizon failed', error)
	}
}

/** {@link fillToHorizon} after a pattern day lands, passing its result on. */
async function fillAfterDay<Result extends { ok: boolean }>(
	userId: string,
	result: Result,
): Promise<Result> {
	if (result.ok) await fillToHorizon(userId)
	return result
}

/** A refusal the athlete reads, at the top of the reading that produced it. */
function refuse(error: string) {
	return data({ error }, { status: 400 })
}

/**
 * A refusal about the **set of tracks**, tagged so it lands beside the roster
 * rather than at the top of whichever reading happens to be open.
 *
 * The roster sits *above* the tabs, so it is the one control on this page whose
 * refusal has nowhere to go: an untagged one would print inside Blocks or Weeks,
 * a scroll away from the button that earned it. `scope` is the smallest thing that
 * fixes that, and the component reads it rather than guessing from the wording.
 */
function refuseTrack(error: string) {
	return data({ error, scope: 'track' as const }, { status: 400 })
}

/**
 * _Bytt filosofi_'s reply, under a key of its own so the page narrows to it:
 * the preview form's result, the confirm form's, and the preview to show.
 */
function philosophyReply({
	result = null,
	confirmResult = null,
	preview = null,
}: {
	result?: SubmissionResult<string[]> | null
	confirmResult?: SubmissionResult<string[]> | null
	preview?: PhilosophyPreviewView | null
}) {
	return { result, confirmResult, preview }
}

/** The preview as the page shows it: the diff and its digest, not the rows. */
function previewView(preview: PhilosophySwitchPreview): PhilosophyPreviewView {
	const { rows: _rows, edit: _edit, ok: _ok, ...view } = preview
	return view
}

/** One track-set refusal, worded (#414). */
function trackRefusalMessage(
	reason: AddTrackRefusal | RemoveTrackRefusal,
): string {
	switch (reason) {
		case 'outline-not-found':
			return OUTLINE_GONE
		case 'track-not-found':
			return TRACK_GONE
		case 'discipline-already-tracked':
			// The rule, not the constraint: one track per discipline is what the
			// athlete needs to hear, and the second track they were about to author is
			// the one they already have (ADR 0043 §1).
			return SESONG_REFUSAL_LABELS.alreadyTracked
		case 'last-track':
			return SESONG_REFUSAL_LABELS.lastTrack
	}
}

function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? SESONG_REFUSAL_LABELS.badValue
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
			return SESONG_REFUSAL_LABELS.planTooLong
		case 'last-phase':
			return SESONG_REFUSAL_LABELS.lastPhase
		case 'at-the-edge':
			// Either end, since one message serves both directions: naming "start" for a
			// Move later would be the wrong word half the time.
			return SESONG_REFUSAL_LABELS.phaseAtEdge
	}
}

/**
 * One **Week Pattern** service result, worded. A separate pair from `report` above
 * because the two refusal unions are separate vocabularies — a pattern edit can
 * refuse over a day, a track or a Workout, and none of those is a phase — and
 * typing the map to the union makes a refusal added later a compile error here
 * rather than a silent catch-all.
 */
function reportPattern(
	result: { ok: true } | { ok: false; reason: WeekPatternEditRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(patternRefusalMessage(result.reason))
}

function patternRefusalMessage(reason: WeekPatternEditRefusal): string {
	switch (reason) {
		case 'outline-gone':
			return OUTLINE_GONE
		case 'pattern-gone':
			return PATTERN_GONE
		case 'day-gone':
			return DAY_GONE
		case 'track-gone':
			return TRACK_GONE
		case 'workout-gone':
			// The Workout, not the day: the day is fine and still there, and what the
			// athlete has to do is pick a session that still exists.
			return SESONG_REFUSAL_LABELS.workoutGone
		case 'workout-discipline-mismatch':
			// Not an absence: the session exists and is theirs, and it belongs to another
			// discipline. Said as the domain rule rather than as a validation failure,
			// because the rule is the reason (ADR 0041, ADR 0043 §5) — a day's volume comes
			// out of its own track, so a ride cannot spend a run week.
			return SESONG_REFUSAL_LABELS.workoutMismatch
		case 'at-the-edge':
			// One message for patterns and for days, in both directions: a pattern
			// moves through the plan's list and a day moves within its own weekday, and
			// naming either end would be the wrong word half the time.
			return SESONG_REFUSAL_LABELS.atEdge
	}
}

/**
 * One **Season Anchor** service result, worded — the pair `reportWeekOverride` is,
 * for a fourth vocabulary: an anchor edit refuses over a *segment*, which is neither
 * a phase, a pattern nor a week. Typing the map to the union makes a refusal added
 * later a compile error here rather than a silent catch-all.
 *
 * Only the **remove** control reports through this. Adding and editing report on
 * the form they were typed into, through `authorSeasonAnchor`.
 */
function reportAnchor(
	result: { ok: true } | { ok: false; reason: SeasonAnchorRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(anchorRefusalMessage(result.reason))
}

/**
 * Each way authoring an anchor segment can be refused, as a sentence about the plan.
 *
 * None of them is about a *unit*, and that absence is the point: a segment carries
 * no unit at all, so there is no state in which the athlete is told they may not
 * change one (ADR 0043, ADR 0044 §8).
 */
function anchorRefusalMessage(reason: SeasonAnchorRefusal): string {
	switch (reason) {
		case 'track-not-found':
			// The same absence a pattern day and a hand-set week name, so the same
			// sentence: a row that is not the athlete's reads as gone, not as forbidden.
			return TRACK_GONE
		case 'week-outside-plan':
			return WEEK_NOT_ONE_OF_THE_PLANS
		case 'anchor-not-found':
			// Reachable from a stale reading, whose remove control was rendered before
			// a second tab removed the segment. Nothing was changed.
			return ANCHOR_GONE
		case 'earliest-anchor':
			// Not a permission and not a bug: removing the first segment would leave
			// every week before the next one with nothing to derive from. Said as what
			// the athlete can do instead, since both alternatives are on the same card.
			return SESONG_REFUSAL_LABELS.earliestAnchor
	}
}

/**
 * Author one **Season Anchor** segment — added or re-authored, which is the same
 * two fields either way, because a segment *is* its `(from week, value)` pair.
 *
 * Reported through Conform, like the other multi-field forms on this page: the
 * reply carries the intent **and** both handles, so it lands on the one card or the
 * one re-anchor form it answers and leaves every sibling alone. The add form is
 * keyed by the track and an anchor card by the track and its week — see `replyFor`
 * in `__season-anchor-editor.tsx`.
 *
 * `SeasonAnchorSetSchema` is re-parsed here for `authorSegmentRates`' reason: a
 * value the storage schema refuses — zero, a negative, a week key that is not a
 * Monday — reads as a sentence on this form rather than as a throw from the service
 * that re-parses it (ADR 0044 §8). It is `.strict()`, so a body that smuggles a
 * `currency` key in is rejected rather than silently stripped.
 */
async function authorSeasonAnchor(
	userId: string,
	formData: FormData,
	mode: 'add' | 'set',
) {
	const intent =
		mode === 'add'
			? ('add-season-anchor' as const)
			: ('set-season-anchor' as const)
	const trackId = String(formData.get('trackId') ?? '')
	// A missing handle is a stale page rather than a typed value, so it is a
	// sentence at the top of the reading and not an error on a form the row behind
	// it no longer has.
	if (trackId === '') return refuse(TRACK_GONE)

	const submission = parseWithZod(formData, { schema: SeasonAnchorFormSchema })
	// Off the body rather than off the parse, so a rejected submission still
	// reports on the card it was typed into.
	const row = {
		intent,
		trackId,
		fromWeekKey: String(formData.get('fromWeekKey') ?? ''),
	}
	if (submission.status !== 'success') {
		return data({ ...row, result: submission.reply() }, { status: 400 })
	}

	const formErrors = (messages: string[]) =>
		data(
			{ ...row, result: submission.reply({ formErrors: messages }) },
			{ status: 400 },
		)

	const authored = SeasonAnchorSetSchema.safeParse({
		trackId,
		...submission.value,
	})
	if (!authored.success) return formErrors(issueMessages(authored.error))

	const saved = await setSeasonAnchorValue(userId, authored.data)
	if (!saved.ok) return formErrors([anchorRefusalMessage(saved.reason)])

	return { ...row, result: submission.reply() }
}

/**
 * Copy one week of this plan onto another week of it (#415).
 *
 * The shape the retired stamp had (decision 14): a target week that already
 * holds sessions comes back as a question carrying the counts rather than as an
 * error, and a success redirects because the calendar changed in a way the page
 * cannot state by itself.
 *
 * What is *different* is the one sentence the toast has to carry: a copy is copied as
 * authored. It is not stretched to meet the target week's derived figure, so an
 * athlete who copies a 40 km week onto a 55 km week gets 40 km and the Weeks reading
 * shows it against the 55 (ADR 0040 §1).
 */
async function copyWeekOnto(
	userId: string,
	request: Request,
	formData: FormData,
) {
	const submitted = WeekCopySchema.safeParse({
		outlineId: formData.get('outlineId'),
		sourceWeekKey: formData.get('sourceWeekKey'),
		targetWeekKey: formData.get('targetWeekKey'),
		replace: checked(formData, 'replace'),
	})
	if (!submitted.success) return refuse(firstIssue(submitted.error))

	const copied = await copyWeek(userId, submitted.data)
	if (!copied.ok) {
		if (copied.reason !== 'target-week-filled') {
			return refuse(copyRefusalMessage(copied.reason))
		}
		// No `error` key: this is a question, not a refusal to word at the top of the
		// reading. The panel that renders it is the answer.
		return data(
			{
				copy: {
					sourceWeekKey: submitted.data.sourceWeekKey,
					targetWeekKey: submitted.data.targetWeekKey,
					conflict: copied.conflict,
				},
			},
			{ status: 400 },
		)
	}

	const url = new URL(request.url)
	return redirectWithToast(`${url.pathname}${url.search}`, {
		type: 'success',
		title: SESONG_COPY_LABELS.done,
		description: copySentence(
			copied.report,
			submitted.data.sourceWeekKey,
			submitted.data.targetWeekKey,
		),
	})
}

/**
 * What a copy did, in one sentence — the counts, then the two things the athlete has
 * to know: the weeks are independent, and the copy was not scaled to the week it
 * landed on.
 */
function copySentence(
	report: CopyWeekReport,
	sourceWeekKey: string,
	targetWeekKey: string,
): string {
	const skipped = copySkippedSentence(report.skipped)
	// The ISO weeks, as every Sesong surface numbers them (audit B6).
	return `${SESONG_COPY_LABELS.sentence(
		report.sessions,
		isoWeekNumber(sourceWeekKey),
		isoWeekNumber(targetWeekKey),
		report.replaced,
	)}${skipped}`
}

/**
 * The sessions that produced no copy, named by reason — an absence with its cause
 * rather than a silent gap in the count (ADR 0008).
 */
function copySkippedSentence(skipped: CopyWeekReport['skipped']): string {
	const reasons = new Set(skipped.map((skip) => skip.reason))
	const clauses = [...reasons].map((reason) => COPY_SKIP_COPY[reason])
	return clauses.length === 0 ? '' : ` ${clauses.join(' ')}`
}

const COPY_SKIP_COPY: Record<CopySkipReason, string> = {
	'no-prescription': SESONG_COPY_LABELS.noPrescription,
}

function copyRefusalMessage(
	reason: Exclude<CopyWeekRefusal, 'target-week-filled'>,
): string {
	switch (reason) {
		case 'plan-resting':
			return PLAN_RESTING
		case 'plan-gone':
			return OUTLINE_GONE
		case 'week-outside-plan':
			return WEEK_OUTSIDE_PLAN
		case 'same-week':
			return SESONG_REFUSAL_LABELS.sameWeek
		case 'source-week-empty':
			return SESONG_REFUSAL_LABELS.sourceEmpty
		case 'nothing-to-copy':
			// The week holds sessions, but every one of them is a recording with no
			// prescription behind it. Named rather than reported as a copy of nothing.
			return SESONG_REFUSAL_LABELS.nothingToCopy
	}
}

/**
 * Author one endurance segment's progression.
 *
 * The reply carries the `segmentId` it belongs to **and the intent it answers**, so a
 * rejected save reports on the card it was typed into and leaves every other form
 * alone — including the *other* form on its own card, since a segment now carries two
 * (the progression and the mix) and a segment id alone can no longer tell them apart.
 * Success needs no redirect: the loader re-runs, and every figure on the page — the
 * derived weeks, the **Season Span**, the guard — is recomputed from the rows that
 * just changed.
 *
 * This one reports through Conform because it is four numeric fields with per-field
 * errors; the structural edits report a sentence, because a rename has one thing to
 * say. Both are reached through `intent`, so the dispatch reads the same either way.
 */
async function authorSegmentRates(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: SegmentFormSchema })
	if (submission.status !== 'success') {
		return data(
			{
				intent: 'set-segment-rates' as const,
				segmentId: String(formData.get('segmentId') ?? ''),
				result: submission.reply(),
			},
			{ status: 400 },
		)
	}

	// The service's own gate, applied here first so a rate outside the storable
	// range reports as a form error rather than throwing (ADR 0044 §8: the routes
	// parse against the same schema the service re-parses).
	const authored = EnduranceSegmentSetSchema.safeParse(submission.value)
	if (!authored.success) {
		return data(
			{
				intent: 'set-segment-rates' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: authored.error.issues.map((issue) => issue.message),
				}),
			},
			{ status: 400 },
		)
	}

	const saved = await setEnduranceSegment(userId, authored.data)
	if (!saved.ok) {
		return data(
			{
				intent: 'set-segment-rates' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: [SESONG_SEGMENT_LABELS.gone],
				}),
			},
			{ status: 400 },
		)
	}

	return {
		intent: 'set-segment-rates' as const,
		segmentId: submission.value.segmentId,
		result: submission.reply(),
	}
}

/**
 * Author one endurance segment's **Quality Session Mix**.
 *
 * Three fields in, a multiset out: the counts that are blank or `0` are **dropped**
 * rather than stored as zeros, because the mix holds the zones that are *in* it and
 * `QualitySessionMixSetSchema` takes at least one session per entry. Dropping every
 * one of them is a legitimate save — the empty mix, "no quality sessions in this
 * segment" (ADR 0042 §6) — and never a no-op.
 *
 * Nothing derived is written. The **Quality Session Count** and the emphasis label
 * are read back off these rows on the next load (ADR 0042 §4–§5), which is what keeps
 * a segment from being named for work it does not contain.
 *
 * Same reply shape as `authorSegmentRates`, keyed by intent *and* `segmentId`.
 */
async function authorQualityMix(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: MixFormSchema })
	if (submission.status !== 'success') {
		return data(
			{
				intent: 'set-quality-mix' as const,
				segmentId: String(formData.get('segmentId') ?? ''),
				result: submission.reply(),
			},
			{ status: 400 },
		)
	}

	const entries = QUALITY_ZONES.flatMap((zone) => {
		const sessionsPerWeek = submission.value[mixFieldName(zone)]
		return sessionsPerWeek == null || sessionsPerWeek === 0
			? []
			: [{ zone, sessionsPerWeek }]
	})

	// The storage schema, applied at the boundary for the reason `authorSegmentRates`
	// gives: a count outside the storable range reads as a sentence on the form rather
	// than as a throw from the service that re-parses it (ADR 0044 §8).
	const authored = QualitySessionMixSetSchema.safeParse({
		segmentId: submission.value.segmentId,
		entries,
	})
	if (!authored.success) {
		return data(
			{
				intent: 'set-quality-mix' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: authored.error.issues.map((issue) => issue.message),
				}),
			},
			{ status: 400 },
		)
	}

	const saved = await setQualitySessionMix(userId, authored.data)
	if (!saved.ok) {
		return data(
			{
				intent: 'set-quality-mix' as const,
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: [SESONG_SEGMENT_LABELS.gone],
				}),
			},
			{ status: 400 },
		)
	}

	return {
		intent: 'set-quality-mix' as const,
		segmentId: submission.value.segmentId,
		result: submission.reply(),
	}
}

/**
 * One strength segment service result, worded. A third pair beside `report` and
 * `reportPattern`, because the three refusal unions are three vocabularies — a
 * lifting block refuses over a *window*, which neither a phase nor a pattern has —
 * and typing the map to the union makes a refusal added later a compile error here
 * rather than a silent catch-all.
 */
function reportStrength(
	result: { ok: true } | { ok: false; reason: StrengthSegmentRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(strengthRefusalMessage(result.reason))
}

/**
 * Each way a lifting block can be refused, as a sentence about the plan.
 *
 * The four placement refusals are worded as facts about the **window** the athlete
 * drew, and each names the edit that resolves it: a block is start-plus-length, so
 * every collision has two ways out and saying only "invalid" would hide both. None
 * of them is a safety claim and none is about volume — the guard warns about that
 * separately and never blocks (ADR 0047 §1).
 */
function strengthRefusalMessage(reason: StrengthSegmentRefusal): string {
	switch (reason) {
		case 'track-not-found':
			return TRACK_GONE
		case 'not-a-strength-track':
			// Not an absence: the track is theirs and it is an endurance one. Said as
			// the domain rule, because the rule is the reason — an endurance track's
			// segments span its phases 1:1 and are authored on the phase cards above.
			return SESONG_REFUSAL_LABELS.notStrengthTrack
		case 'segment-not-found':
			return BLOCK_GONE
		case 'start-week-outside-the-plan':
			return WEEK_NOT_ONE_OF_THE_PLANS
		case 'segment-runs-past-the-plan':
			return SESONG_REFUSAL_LABELS.segmentPastPlan
		case 'week-already-opens-a-segment':
			return SESONG_REFUSAL_LABELS.weekOpensSegment
		case 'segments-overlap':
			return SESONG_REFUSAL_LABELS.segmentsOverlap
	}
}

/**
 * Author one lifting block — added or re-authored, which is the same eight fields
 * either way (ADR 0047 §6: a moved block and a resized one are one action on
 * start-plus-length).
 *
 * **Whole, every time.** `StrengthSegmentSetSchema` rewrites every column including
 * the nulls, because `null` is the athlete choosing the documented convention and
 * clearing an authored number back to it has to be expressible (ADR 0044 §4).
 *
 * Reported through Conform, like the two endurance forms and for the same reason —
 * eight fields with per-field errors. The reply carries the intent **and** both
 * handles, so it lands on the one card or the one add form it answers and leaves
 * every sibling alone.
 */
async function authorStrengthSegment(
	userId: string,
	formData: FormData,
	mode: 'add' | 'set',
) {
	const intent =
		mode === 'add'
			? ('add-strength-segment' as const)
			: ('set-strength-segment' as const)
	const trackId = String(formData.get('trackId') ?? '')
	const segmentId = String(formData.get('segmentId') ?? '')
	// A missing handle is a stale page rather than a typed value, so it is a
	// sentence at the top of the reading and not a field error on a form the row
	// behind it no longer has.
	if (mode === 'add' && trackId === '') return refuse(TRACK_GONE)
	if (mode === 'set' && segmentId === '') return refuse(BLOCK_GONE)

	const submission = parseWithZod(formData, {
		schema: StrengthSegmentFormSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ intent, trackId, segmentId, result: submission.reply() },
			{ status: 400 },
		)
	}
	const value = submission.value

	function formErrors(messages: string[]) {
		return data(
			{
				intent,
				trackId,
				segmentId,
				result: submission.reply({ formErrors: messages }),
			},
			{ status: 400 },
		)
	}

	// The service's own gate, applied here first for `authorSegmentRates`' reason: a
	// value outside the storable range reads as a sentence on the form rather than
	// as a throw from the service that re-parses it (ADR 0044 §8).
	if (mode === 'add') {
		const authored = StrengthSegmentAddSchema.safeParse({ trackId, ...value })
		if (!authored.success) return formErrors(issueMessages(authored.error))
		const saved = await addStrengthSegment(userId, authored.data)
		if (!saved.ok) return formErrors([strengthRefusalMessage(saved.reason)])
	} else {
		const authored = StrengthSegmentSetSchema.safeParse({ segmentId, ...value })
		if (!authored.success) return formErrors(issueMessages(authored.error))
		const saved = await setStrengthSegment(userId, authored.data)
		if (!saved.ok) return formErrors([strengthRefusalMessage(saved.reason)])
	}

	return { intent, trackId, segmentId, result: submission.reply() }
}

function issueMessages(error: z.ZodError): string[] {
	return error.issues.map((issue) => issue.message)
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
	// _Legg til et løp_ answers inside its own form, with what was typed kept.
	const attachResult =
		actionData && 'intent' in actionData && actionData.intent === 'attach-event'
			? actionData.result
			: undefined
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
		actionData && attachResult === undefined && treningsformReply == null
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
					lastResult: attachResult,
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
 * Where a starter week came from, in one sentence — said once, when it lands.
 *
 * It names the *source* rather than the shape, because the shape is now on the
 * page for the athlete to read: what they cannot see is whether the app read their
 * own availability or fell back to a convention, and that is exactly the claim
 * that must not be left ambiguous.
 */
function starterSentence(proposal: StarterProposal): string {
	const days = proposal.weekdays.length
	const built =
		proposal.source === 'availability'
			? SESONG_PATTERN_LABELS.starterFromProfile(days)
			: SESONG_PATTERN_LABELS.starterFromDefault
	return SESONG_PATTERN_LABELS.starterTail(built)
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
