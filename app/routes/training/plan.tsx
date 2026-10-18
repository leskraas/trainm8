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
import {
	getFormProps,
	getInputProps,
	useForm,
	type SubmissionResult,
} from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod/v3'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import {
	Alert,
	AlertAction,
	AlertDescription,
} from '#app/components/ui/alert.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	addDays,
	isoWeekNumber,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getEventsForUser } from '#app/utils/event.server.ts'
import { readPlanStartOptions } from '#app/utils/first-run/plan-start-options.server.ts'
import {
	formatNbDate,
	formatNbDayMonth,
	formatNbEmphasisLabel,
	formatNbPct1RMBand,
	formatNbPct1RMs,
	formatNbSignedPercent,
	formatNbVolumeTotal,
	formatNbWeeklyVolume,
	formatRateField,
} from '#app/utils/format.ts'
import {
	ATTACH_EVENT_LABELS,
	ATTACH_EVENT_REFUSAL_LABELS,
	attachedEventSentence,
	APP_TAB_LABELS,
	isoWeekSpanLabel,
	NB_ACCUMULATED_SPAN_LABELS,
	NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS,
	NB_QUALITY_ZONE_LABELS,
	NB_STRENGTH_GOAL_SENTENCE_LABELS,
	NB_UNAVAILABLE_READING_LABELS,
	NB_WEEK_ROLE_LABELS,
	NB_WEEKLY_UNITS,
	nbPhaseName,
	nbTrackName,
	SESONG_ENTRY_LABELS,
	PHILOSOPHY_SWITCH_LABELS,
	PRESET_GALLERY_LABELS,
	PHILOSOPHY_SWITCH_REFUSAL_LABELS,
	PLAN_LEAD_LABELS,
	SEASON_ADVANCED_LABELS,
	SEASON_EDIT_LABELS,
	SESONG_ANCHOR_LABELS,
	SESONG_COPY_LABELS,
	SESONG_LIFTING_LABELS,
	SESONG_NEXT_LABELS,
	SESONG_NOTICE_LABELS,
	SESONG_PAGE_LABELS,
	SESONG_PATTERN_LABELS,
	SESONG_PHASE_FIELD_LABELS,
	SESONG_PHASE_LABELS,
	SESONG_REFUSAL_LABELS,
	SESONG_SEGMENT_LABELS,
	SESONG_TRACK_LABELS,
	STRENGTH_OFFER_LABELS,
	switchedPhilosophySentence,
	TRENINGSFORM_LABELS,
	type BoundaryStepOutOfForce,
} from '#app/utils/labels.ts'
import { fillPlanWeeksToHorizon } from '#app/utils/load/horizon-fill.server.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { AttachEventFormSchema } from '#app/utils/plan-outline/attach-event-schema.ts'
import {
	EnduranceSegmentSetSchema,
	MAX_QUALITY_SESSIONS_PER_WEEK,
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
import {
	boundaryStepInForce,
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	RHYTHMS,
	VOLUME_CURRENCIES,
	type AnchorPlacement,
} from '#app/utils/plan-outline/derive.ts'
import {
	proposeFit,
	type FitProposal,
} from '#app/utils/plan-outline/fit-proposal.ts'
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
import {
	emphasisTerms,
	QUALITY_ZONES,
	qualitySessionCount,
	type QualityZone,
} from '#app/utils/plan-outline/quality-mix.ts'
import {
	RAMP_GUARD_MAX,
	type RampWarning,
} from '#app/utils/plan-outline/ramp-guard.ts'
import {
	readSeasonChartInputs,
	withWeekStarts,
} from '#app/utils/plan-outline/season-chart.server.ts'
import {
	readStampedMixWarnings,
	type StampedMixWarning,
} from '#app/utils/plan-outline/stamp.server.ts'
import { type StarterProposal } from '#app/utils/plan-outline/starter-pattern.ts'
import { addProposedStrengthTrack } from '#app/utils/plan-outline/strength-offer.server.ts'
import { type UnavailableReading } from '#app/utils/plan-outline/unavailable-readings.ts'
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
	type SeasonAvailabilityWarning,
	type SeasonBandWarning,
	type SeasonDayClashWarning,
	type SeasonHoursFitWarning,
} from '#app/utils/training.server.ts'
import {
	DISCIPLINES,
	isCardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.ts'
import { CopyWeekSection, type PendingCopy } from './__copy-week.tsx'
import { readLibraryLifts } from './__library-section.server.ts'
import { LibrarySection } from './__library-section.tsx'
import {
	AddPhaseForm,
	DeletePlanSection,
	PhaseCard,
} from './__phase-editor.tsx'
import {
	PhilosophyCard,
	StrengthTrackOfferCard,
	type PhilosophyPreviewView,
} from './__philosophy-switch.tsx'
import { PlanAdvanced } from './__plan-advanced.tsx'
import {
	CollapsibleSection,
	PhaseSpark,
	PillLink,
	PlanCard,
	SegmentedNav,
} from './__plan-chrome.tsx'
import { PlanLeadCard } from './__plan-lead-card.tsx'
import { nextEasyWeek as readNextEasyWeek } from './__plan-lead.ts'
import { PresetGallery } from './__preset-gallery.tsx'
import {
	SeasonAnchorFormSchema,
	SeasonAnchorSection,
	type EditableAnchorTrack,
} from './__season-anchor-editor.tsx'
import { SeasonChart, seasonFitnessOf } from './__season-chart.tsx'
import { seasonEditAction } from './__season-edits.server.ts'
import { SeasonEditLink, SeasonEditsCard } from './__season-edits.tsx'
import { SEASON_EVENTS_SHOWN, SeasonEvents } from './__season-events.tsx'
import { readSeasonPicture } from './__season-picture.server.ts'
import { SeasonPicture } from './__season-picture.tsx'
import {
	StrengthBlocksSection,
	StrengthSegmentFormSchema,
	type EditableStrengthTrack,
} from './__strength-segment-editor.tsx'
import { TrackRoster } from './__track-editor.tsx'
import { treningsformViewOf } from './__treningsform-view.ts'
import { TreningsformOffer } from './__treningsform.tsx'
import {
	type SeasonQuery,
	WeekPatternSection,
} from './__week-pattern-editor.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: SESONG_PAGE_LABELS.metaTitle },
]

const TABS = ['blocks', 'weeks'] as const
type Tab = (typeof TABS)[number]

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
 * One rate as the athlete types it: a **whole percent**, or blank.
 *
 * Blank is `null` and `null` is a *choice* — "no ramp", "no step", "follow the
 * documented convention" — so it travels as a value rather than as an omitted
 * field. Storage keeps fractions (ADR 0040 §10), and the division happens here at
 * the form boundary rather than anywhere the derivation can see it.
 */
const RatePercentSchema = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		if (raw === '') return null
		const percent = Number(raw)
		if (!Number.isFinite(percent)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: SESONG_SEGMENT_LABELS.typeRate,
			})
			return z.NEVER
		}
		return percent / 100
	})

/**
 * The progression form. The four rates are optional *fields* and required
 * *values*: an absent input reads as blank, which is the athlete clearing a rate
 * back to the convention rather than a field the form forgot.
 */
const SegmentFormSchema = z.object({
	segmentId: z.string().min(1),
	ramp: RatePercentSchema.default(''),
	boundaryStep: RatePercentSchema.default(''),
	recoveryCut: RatePercentSchema.default(''),
	taperCut: RatePercentSchema.default(''),
})

/**
 * One zone's field name in the **Quality Session Mix** form, from the zone itself.
 *
 * The form has exactly one field per member of `QUALITY_ZONES`, and both the schema
 * and the inputs are generated from that constant through this function — so the
 * offerable vocabulary has a single source, and the two rules ADR 0042 draws are
 * **structural** rather than validated:
 *
 * - a zone **cannot be submitted twice**, because there is one box per zone (the
 *   duplicate-zone refusal in `QualitySessionMixSetSchema` is a second line of
 *   defence against a hand-made request, not this form's rule);
 * - there is nowhere for a **speed / neuromuscular** field to appear, and none for
 *   zones 1–2 either. Neuromuscular work has no position on the metabolic zone axis
 *   at all (ADR 0042 §7) and zones 1–2 are not quality sessions (§3), so neither is
 *   a field this page hides — it is a field this page cannot have.
 */
function mixFieldName(zone: QualityZone): `zone${QualityZone}` {
	return `zone${zone}`
}

/**
 * One zone's session count as the athlete types it: a whole number, `0`, or blank.
 *
 * **Blank and `0` both mean "this zone is not in the mix."** That is the opposite of
 * what blank means in `RatePercentSchema` above, where it is "follow the documented
 * convention" (ADR 0044 §4) — a mix has no convention to fall back on, and an empty
 * mix is the positive statement that the segment has no quality sessions rather than
 * an unknown one (ADR 0042 §6). The surface says which blank it is where the athlete
 * reads it; here the shapes just have to differ.
 *
 * The upper bound is the storage schema's own typo guard, restated at the form
 * boundary so `70` meant as `7` reads as a sentence rather than as a thrown parse.
 */
const MixCountSchema = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		if (raw === '') return null
		const count = Number(raw)
		if (!Number.isInteger(count)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: SESONG_SEGMENT_LABELS.wholeSessions,
			})
			return z.NEVER
		}
		if (count < 0 || count > MAX_QUALITY_SESSIONS_PER_WEEK) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: SESONG_SEGMENT_LABELS.sessionRange(
					MAX_QUALITY_SESSIONS_PER_WEEK,
				),
			})
			return z.NEVER
		}
		return count
	})

const MixCountField = MixCountSchema.default('')

/**
 * The mix form: `segmentId` and one count per quality zone, always all of them.
 *
 * Every zone travels on every save, so the whole multiset is replaced in one write
 * and clearing a zone is expressible — which is why the mix needs no `CarriedRate`
 * equivalent. A field left out of the body reads as blank, and blank *is* a value
 * here: the zone leaving the mix.
 */
const MixFormSchema = z.object({
	segmentId: z.string().min(1),
	...(Object.fromEntries(
		QUALITY_ZONES.map((zone) => [mixFieldName(zone), MixCountField]),
	) as Record<`zone${QualityZone}`, typeof MixCountField>),
})

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

/**
 * A track's **Season Anchor** segments as the two boundary-step rules read them:
 * 0-based week indices counted off the **Plan Start Week** (ADR 0040 §3).
 *
 * **Not** {@link weekInPlanOf}, and the difference is the point. That one answers
 * "which week of the plan is this shown as" and returns `null` for a key the plan
 * no longer covers; this one answers "where does the derivation count this", and an
 * anchor keyed before the plan's first week is a **negative index** the rules read
 * as "in force from before week one" rather than as absent. Clamping or dropping it
 * here would hand the surface a different anchor list from the one that priced the
 * weeks — which is exactly the drift `boundaryStepInForce` exists to prevent.
 *
 * One helper for both readings, because both boundary-step questions are asked of
 * the same list: the endurance one on the Blocks reading, and the strength one
 * inside `__strength-segment-editor.tsx`.
 */
function anchorPlacementsOf(
	startWeekKey: string,
	anchors: ReadonlyArray<{ fromWeekKey: string }>,
): AnchorPlacement[] {
	return anchors.map((anchor) => ({
		fromWeekIndex: weekIndexOf(startWeekKey, anchor.fromWeekKey),
	}))
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
 * A plan week's number as every Sesong surface prints it: the ISO week, `Uke
 * 41`, the number I dag, the Sesong edits and a calendar use — never the
 * plan's own count from 1, which named one week two ways on one page (audit
 * B6, round 2).
 */
function weekNumberOf(week: { weekKey: string }): number {
	return isoWeekNumber(week.weekKey)
}

/** The ISO week of the plan's `weekInPlan`-th week (1-based). */
function isoWeekOfPlanWeek(startWeekKey: string, weekInPlan: number): number {
	return isoWeekNumber(addDays(startWeekKey, 7 * (weekInPlan - 1)))
}

/** `Uke 41–44`, or `Uke 41`: a run of plan weeks, by their ISO numbers. */
function weekSpan(startWeekKey: string, from: number, to: number): string {
	return isoWeekSpanLabel(
		isoWeekOfPlanWeek(startWeekKey, from),
		isoWeekOfPlanWeek(startWeekKey, to),
	)
}

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
				<div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[repeat(4,auto)_1fr] lg:items-start lg:space-y-0 lg:gap-x-6 lg:gap-y-6">
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

type SeasonData = Route.ComponentProps['loaderData']['season']

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

type SeasonTrack = SeasonData['tracks'][number]
type SeasonPhaseData = SeasonData['phases'][number]
type SegmentData = SeasonTrack['segments'][number]
type SegmentActionData = Route.ComponentProps['actionData']

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
 * A guard notice, open on arrival and closable once it has been read (#399 story
 * 95: *warnings are dismissible signals rather than blocked saves, so that the app
 * advises and I author*).
 *
 * **Dismissal is not progressive disclosure, and this page refuses one while
 * offering the other.** Disclosure hides a warning *before* it has been read, so
 * the athlete has to go looking for something they do not yet know is there — that
 * is a warning withheld, and it is why none of the three notices below ships behind
 * a `Disclosure`. Dismissal closes a warning the athlete has read and *decided
 * about*: "yes, four sessions a week is what I meant." Refusing them that is not
 * safety, it is the app arguing with an author it has already told everything it
 * knows — and every one of these notices ends by saying the plan is saved exactly
 * as authored, so there is nothing left for the open state to enforce.
 *
 * **Per visit, and stored nowhere.** It is component state: a reload brings every
 * notice back, and so does re-keying on what the notice *says* (each caller does
 * that below). A dismissal that outlived the words it was about would silence a
 * warning the athlete has never seen — and the alternative, a stored "seen" flag
 * per warning, is a schema column for a judgement that is only ever about the
 * sentence currently on screen.
 *
 * The control is a real button with a name that says what it closes, never a bare
 * ×: a screen-reader user meeting three of these in a row is owed which one they
 * are about to dismiss.
 *
 * **And the dismissal leaves something behind for focus to land on.** A notice that
 * unmounted into nothing would drop focus on `<body>`: the next Tab restarts at the
 * top of a long authoring page, and the athlete is told nothing about the button
 * they just pressed. Three of these can sit in a row, so losing your place on the
 * first is losing it before you have read the other two.
 */
function DismissibleNotice({
	name,
	children,
}: {
	/**
	 * What this notice *is*, mid-sentence — "ramp note". The dismiss control's
	 * accessible name and the line that replaces the notice are both built from it,
	 * so the two can never come to call one notice by two names. Never "close": a
	 * screen-reader user meeting three of these is owed which one they are closing.
	 */
	name: string
	children: ReactNode
}) {
	const [dismissed, setDismissed] = useState(false)
	const closed = useRef<HTMLParagraphElement>(null)
	useEffect(() => {
		if (dismissed) closed.current?.focus()
	}, [dismissed])

	if (dismissed) {
		return (
			// Focusable programmatically and never in the tab order, so nobody tabs onto
			// a sentence about a warning that is gone — it exists for the one moment
			// focus is moved onto it, and holds the reading position the notice had.
			// Visually hidden, because the space closing up *is* the sighted reading of
			// a dismissal.
			<p ref={closed} tabIndex={-1} className="sr-only">
				{SESONG_NOTICE_LABELS.dismissed(name)}
			</p>
		)
	}

	return (
		<Alert className="mb-4">
			<AlertDescription className="space-y-2">{children}</AlertDescription>
			{/* After the words it closes, not before them: `AlertAction` is positioned
			    absolutely, so the control sits top-right either way, and reading order
			    should be *warning, then the decision about it*. */}
			<AlertAction>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={SESONG_NOTICE_LABELS.dismiss(name)}
					// ~44px effective touch target on a 32px control (#280), the idiom
					// `OverlayHeader`'s close button uses.
					className="relative shrink-0 after:absolute after:-inset-1.5"
					onClick={() => setDismissed(true)}
				>
					<Icon name="cross-1" />
				</Button>
			</AlertAction>
		</Alert>
	)
}

/**
 * The **ramp guard**, worded (ADR 0040 §12–13).
 *
 * Three things this copy must do and does. It names the threshold as a
 * **convention** and makes **no injury claim** — the 10% rule's own RCT found no
 * difference (Buist 2008), so "steeper than usual" is the whole of what can
 * honestly be said. It says the numbers are saved, because the guard warns and never
 * blocks. And it speaks about the ramp and the step the athlete *authored*, never
 * about a week-over-week difference, so it stays silent on a recovery week's rebound
 * and on a taper.
 *
 * The two subjects are worded separately because they are different quantities. A
 * ramp is a rate *per loading week*; a boundary step happens **once**, at a
 * segment's opening. `RAMP_GUARD_MAX` is one constant measured against both — which
 * is what #403 asks for — so the copy must not describe the step with the ramp's
 * "a week", or it would state a per-week rule about a one-time number.
 *
 * **It guards both tracks now** (ADR 0047 §1), which the copy has to survive. A
 * strength warning's `phaseIndex` is the phase its **opening week** falls in — where
 * the athlete looks for the block, and never a claim that a dated block belongs to
 * that phase (ADR 0047 §6) — so a lifting warning says "opening in Base" rather than
 * naming the phase as its subject, and the closing paragraph says why.
 */
function RampGuardNotice({
	warnings,
	phases,
	anyStrength,
}: {
	warnings: Array<RampWarning & { discipline: Discipline; lifting: boolean }>
	phases: SeasonPhaseData[]
	/** Whether any line below is about a dated lifting block. */
	anyStrength: boolean
}) {
	return (
		<DismissibleNotice
			// Re-keyed on what the guard currently says, so an edit that changes the
			// warnings brings the notice back rather than leaving a dismissal standing
			// over sentences the athlete has not read. The same re-keying a hand-set
			// week's field uses when a save changes what it should show.
			key={warnings
				.map(
					(warning) =>
						`${warning.discipline}:${warning.phaseIndex}:${warning.subject}:${warning.authored}`,
				)
				.join('|')}
			name={SESONG_NOTICE_LABELS.rampName}
		>
			<ul className="space-y-1">
				{warnings.map((warning, position) => {
					const stored = phases[warning.phaseIndex]?.name
					const phase = stored
						? nbPhaseName(stored)
						: SESONG_NOTICE_LABELS.aBlock
					const rate =
						warning.subject === 'ramp'
							? SESONG_NOTICE_LABELS.rampRate(
									formatNbSignedPercent(warning.authored),
								)
							: SESONG_NOTICE_LABELS.stepRate(
									formatNbSignedPercent(warning.authored),
								)
					return (
						// The position disambiguates: two tracks can warn about the same
						// phase and the same subject, once each.
						<li key={`${warning.phaseIndex}-${warning.subject}-${position}`}>
							{warning.lifting ? (
								<>
									<span className="font-medium">
										{nbTrackName(warning.discipline)}
									</span>{' '}
									{SESONG_NOTICE_LABELS.rampLifting('', rate, phase).trim()}
								</>
							) : (
								<>
									<span className="font-medium">{phase}</span> {rate}.
								</>
							)}
						</li>
					)
				})}
			</ul>
			<p>
				{SESONG_NOTICE_LABELS.rampNote(formatNbSignedPercent(RAMP_GUARD_MAX))}
				{anyStrength ? SESONG_NOTICE_LABELS.rampLiftingNote : null}
			</p>
		</DismissibleNotice>
	)
}

/**
 * The **availability fit notice**, worded (ADR 0042 §9, ADR 0045 §8, ADR 0047 §4,
 * ADR 0050).
 *
 * Advisory, exactly like `RampGuardNotice` above and for the same reasons. Three
 * things the copy has to do. It names the **comparison** each line made — sessions
 * against trainable weekdays, or hours against the **Weekly Capacity** — because
 * neither number means anything without the other side of it. It makes **no injury
 * or safety claim** of any kind (ADR 0040 §13): more session days than trainable days
 * is a scheduling fact, and nothing is known about what it does to a body. And it says
 * the plan is stored as authored, because this notice cannot block a save and does not.
 *
 * **What ADR 0047 §4 fixed still holds.** The days check is the *combined* one —
 * quality sessions **plus** **Strength Frequency** — because a session is a session
 * whichever track prescribes it; both counts are named where both exist and a zero
 * half is dropped, since "0 lifting sessions" is a sentence about nothing; and the
 * locator is a **week span** rather than a phase name, because a lifting block floats
 * free of the phases. The hours lines take the same locator for the same reason.
 *
 * **Two comparisons, in one notice.** ADR 0050 gave Training Availability a capacity,
 * so the paragraph that used to say days-against-days is "the only comparison your
 * training availability can make" is retired: the two checks are independent, they
 * decline for different reasons, and a week can miss one without missing the other
 * (ADR 0050 §5). They share one notice rather than taking two, because two dismissible
 * cards about "does my week fit" would be one thought split across two dismissals.
 *
 * **What it will not say.** It never reports that the hours fit. An empty hours list
 * has three causes — no capacity authored, no week the conversion can price in hours,
 * or a plan that genuinely fits — and this component can tell only the first apart, so
 * a verdict would be a claim the reading does not carry (ADR 0043 §5). Where the
 * capacity is simply missing it says so and points at the field, which is a statement
 * about the *setting* rather than about the plan.
 *
 * The whole reading comes off `season` — derived once at the read boundary, never in
 * here. Silence is the answer when the athlete never set their availability: both
 * readings are empty for a null counterpart, so there is no list to render rather
 * than a guess to word.
 */
/**
 * One line per clash — the same reason on the same weekday — however many
 * stretches of the plan hold it: a season whose phases move the mix can
 * break one clash into several spans, and a line per span would say one
 * thing many times. In the order the clashes first appear.
 */
function clashLines(clashes: readonly SeasonDayClashWarning[]) {
	const lines = new Map<
		string,
		{ clash: SeasonDayClashWarning; spans: Array<[number, number]> }
	>()
	for (const clash of clashes) {
		const key = `${clash.weekday}|${clash.reason}|${clash.pinned}`
		const line = lines.get(key) ?? { clash, spans: [] }
		line.spans.push([clash.fromWeekInPlan, clash.toWeekInPlan])
		lines.set(key, line)
	}
	return [...lines.values()]
}

function AvailabilityFitNotice({
	warnings,
	hoursWarnings,
	dayClashes,
	weeklyCapacityHours,
	startWeekKey,
}: {
	/** The plan's first week, so a week in the plan reads as its ISO number. */
	startWeekKey: string
	warnings: SeasonAvailabilityWarning[]
	hoursWarnings: SeasonHoursFitWarning[]
	/**
	 * The day check (ADR 0104 §6): where the laid days clash, each naming its
	 * weekday and why, and whether a day the athlete chose is part of it. Its
	 * own list and paragraph under the counts, which stay exactly as they were.
	 */
	dayClashes: SeasonDayClashWarning[]
	/** `null` when the athlete has never authored one — unavailable, not passing. */
	weeklyCapacityHours: number | null
}) {
	const counted = warnings.length > 0 || hoursWarnings.length > 0
	return (
		<DismissibleNotice
			// Re-keyed on the spans and both comparisons, for `RampGuardNotice`'s
			// reason: a mix edit — or a capacity edit — that moves what is compared is a
			// new thing to read.
			key={[
				...warnings.map(
					(warning) =>
						`${warning.fromWeekInPlan}-${warning.toWeekInPlan}:${warning.qualitySessions}+${warning.strengthSessions}/${warning.trainableWeekdays}`,
				),
				...hoursWarnings.map(
					(warning) =>
						`${warning.fromWeekInPlan}-${warning.toWeekInPlan}:${warning.peakHours}/${warning.weeklyCapacityHours}h`,
				),
				...dayClashes.map(
					(clash) =>
						`${clash.fromWeekInPlan}-${clash.toWeekInPlan}:${clash.reason}@${clash.weekday}${clash.pinned ? '!' : ''}`,
				),
			].join('|')}
			name={SESONG_NOTICE_LABELS.availabilityName}
		>
			{counted ? (
				<>
					<ul className="space-y-1">
						{warnings.map((warning, position) => {
							const single = warning.fromWeekInPlan === warning.toWeekInPlan
							const span = weekSpan(
								startWeekKey,
								warning.fromWeekInPlan,
								warning.toWeekInPlan,
							)
							const [lead, ...rest] = SESONG_NOTICE_LABELS.daysAsk(
								span,
								single,
								SESONG_NOTICE_LABELS.sessionCounts(
									warning.qualitySessions,
									warning.strengthSessions,
								),
								warning.trainableWeekdays,
							).split(span)
							return (
								<li key={`days-${warning.fromWeekInPlan}-${position}`}>
									{lead}
									<span className="font-medium">{span}</span>
									{rest.join(span)}
								</li>
							)
						})}
						{hoursWarnings.map((warning, position) => {
							const single = warning.fromWeekInPlan === warning.toWeekInPlan
							const span = weekSpan(
								startWeekKey,
								warning.fromWeekInPlan,
								warning.toWeekInPlan,
							)
							// "opptil" for a span and never for a single week: the figure is
							// the run's worst week, so claiming it of every week in the run
							// would be a number nothing derived.
							const [lead, ...rest] = SESONG_NOTICE_LABELS.hoursAsk(
								span,
								single,
								formatNbWeeklyVolume(warning.peakHours, 'hours'),
								formatNbWeeklyVolume(warning.weeklyCapacityHours, 'hours'),
							).split(span)
							return (
								<li key={`hours-${warning.fromWeekInPlan}-${position}`}>
									{lead}
									<span className="font-medium">{span}</span>
									{rest.join(span)}
								</li>
							)
						})}
					</ul>
					<p>
						{warnings.length > 0 && hoursWarnings.length > 0
							? SESONG_NOTICE_LABELS.bothChecks
							: warnings.length > 0
								? SESONG_NOTICE_LABELS.daysCheck
								: SESONG_NOTICE_LABELS.hoursCheck}
						{SESONG_NOTICE_LABELS.fitNote}
					</p>
					{hoursWarnings.length === 0 && weeklyCapacityHours == null ? (
						<p>
							{SESONG_NOTICE_LABELS.noCapacity}{' '}
							<Link className="underline" to="/settings/profile">
								{SESONG_NOTICE_LABELS.noCapacityLink}
							</Link>{' '}
							{SESONG_NOTICE_LABELS.noCapacityEnd}
						</p>
					) : null}
				</>
			) : null}
			{dayClashes.length > 0 ? (
				<>
					<ul className="space-y-1">
						{clashLines(dayClashes).map(({ clash, spans }) => {
							const span = SESONG_NOTICE_LABELS.weekSpans(
								spans.map(([from, to]) => weekSpan(startWeekKey, from, to)),
							)
							const [lead, ...rest] = SESONG_NOTICE_LABELS.dayClashLine(
								span,
								SESONG_NOTICE_LABELS.dayClash(clash.reason, clash.weekday),
								clash.pinned,
							).split(span)
							return (
								<li
									key={`clash-${clash.weekday}-${clash.reason}-${clash.pinned}`}
								>
									{lead}
									<span className="font-medium">{span}</span>
									{rest.join(span)}
								</li>
							)
						})}
					</ul>
					<p>
						{SESONG_NOTICE_LABELS.dayClashCheck}
						{SESONG_NOTICE_LABELS.dayClashNote}
					</p>
				</>
			) : null}
		</DismissibleNotice>
	)
}

/**
 * The **band fit notice**: sessions already on the calendar whose authored `%1RM`
 * sits outside the band their block's **Strength Goal** derives (ADR 0042 §9,
 * ADR 0047 §3).
 *
 * The same `Alert` treatment as the ramp guard, because it has the same standing: it
 * **warns and never blocks**, and nothing on a write path consults it. Two things the
 * copy must do beyond that. It says the band is **derived from the goal you
 * authored** rather than typed beside it — the athlete has no band field, so a
 * warning about one is otherwise a warning about a number they never entered. And it
 * points at the *session*, since that is the thing to change if the athlete wants to
 * change something; the other way out is to change the goal, and the copy says both.
 */
function BandFitNotice({
	warnings,
	timezone,
	startWeekKey,
}: {
	/** The plan's first week, so a week in the plan reads as its ISO number. */
	startWeekKey: string
	warnings: SeasonBandWarning[]
	timezone: string
}) {
	return (
		<DismissibleNotice
			// Re-keyed on everything the lines below *say*, for `RampGuardNotice`'s
			// reason — and that is more than which sessions are named. The band is
			// derived from the block's Strength Goal, so changing the goal rewrites
			// every sentence here while the session ids stay exactly as they were: a key
			// of ids alone would hold a dismissal over a band the athlete has never
			// seen, which is the one failure the re-keying exists to prevent.
			key={warnings
				.map(
					(warning) =>
						`${warning.sessionId}:${warning.weekInPlan}:${warning.goal}:${warning.band.minPct1RM}-${warning.band.maxPct1RM}:${warning.outsidePct1RMs.join(',')}`,
				)
				.join('|')}
			name={SESONG_NOTICE_LABELS.bandName}
		>
			<ul className="space-y-1">
				{warnings.map((warning) => (
					<li key={warning.sessionId}>
						<Link
							to={`/training/sessions/${warning.sessionId}`}
							className="font-medium hover:underline"
						>
							{weekSpan(startWeekKey, warning.weekInPlan, warning.weekInPlan)},{' '}
							{formatNbDayMonth(warning.scheduledAt, timezone)}
						</Link>{' '}
						{SESONG_NOTICE_LABELS.bandLine(
							formatNbPct1RMs(warning.outsidePct1RMs),
							formatNbPct1RMBand(warning.band),
							NB_STRENGTH_GOAL_SENTENCE_LABELS[warning.goal],
						)}
					</li>
				))}
			</ul>
			<p>{SESONG_NOTICE_LABELS.bandNote}</p>
		</DismissibleNotice>
	)
}

/**
 * What a plan carrying a strength track **cannot** state, one sentence each
 * (ADR 0047 §5).
 *
 * The sentences themselves are `UNAVAILABLE_READING_LABELS`' in `labels.ts`, beside
 * every other athlete-facing word this app puts on an enum value: one sentence per
 * reading with its own reason, because a single "not available" would tell the
 * athlete that something is missing while hiding which of their own data would
 * change it (Unavailable Metric: the reason is the point). This component owns only
 * the heading and the list.
 *
 * Rendered **above both readings** rather than inside one — see where it is mounted
 * for why: the lifter these sentences are about is authoring blocks, not auditing
 * weeks.
 */
function UnavailableReadingsNotice({
	readings,
}: {
	readings: UnavailableReading[]
}) {
	// Behind a closed line since round 2 (#505 Look): three paragraphs of honesty
	// in the middle of the page pushed the edits below the fold. The line says
	// what is inside before it opens, so nothing is withheld unannounced — this
	// is a statement about the plan, not a warning about an edit.
	return (
		<section aria-label={SESONG_PAGE_LABELS.cannotTellTitle}>
			<CollapsibleSection
				summary={SESONG_PAGE_LABELS.cannotTellTitle}
				detail={SESONG_PAGE_LABELS.cannotTellDetail}
				className="border-b"
			>
				<ul className="text-footnote text-muted-foreground space-y-2">
					{readings.map((reading) => (
						<li key={reading}>{NB_UNAVAILABLE_READING_LABELS[reading]}</li>
					))}
				</ul>
			</CollapsibleSection>
		</section>
	)
}

/**
 * The Blocks reading: the phases in authored order, each with the progression its
 * endurance segments author.
 *
 * A phase still carries a name, a span and a rhythm and nothing about volume
 * (ADR 0041) — the ramp and the cuts belong to the **Training Track segment**
 * measured over it, which is why they are inside the card and not part of the
 * phase's own line.
 */
function BlocksReading({
	season,
	error,
	actionData,
	strengthTracks,
	anchorTracks,
	firstUnbegunWeekKey,
	conversionContexts,
	fitnessAnchor,
	seasonFitness,
}: {
	season: SeasonData
	/**
	 * The first week not yet begun: a plan whose start is before it has begun,
	 * and a shape would rewrite weeks lived (#505 story 14).
	 */
	firstUnbegunWeekKey: string
	/** The analytical chart's two inputs (#413), for its place under Avansert. */
	conversionContexts: Route.ComponentProps['loaderData']['conversionContexts']
	fitnessAnchor: Route.ComponentProps['loaderData']['fitnessAnchor']
	/** The chart's fitness layer, replayed by the loader. */
	seasonFitness: Route.ComponentProps['loaderData']['seasonFitness']
	/** A refused *structural* edit, said once above the phases it was aimed at. */
	error?: string
	actionData: SegmentActionData
	strengthTracks: EditableStrengthTrack[]
	/** Each track's **Season Anchor** segments, the level the ramps below multiply. */
	anchorTracks: EditableAnchorTrack[]
}) {
	// A track with no phase-bound segment authors no progression here: a strength
	// track's segments are dated and float free of the phases (ADR 0047 §6).
	const enduranceTracks = season.tracks.filter(
		(track) => track.segments.length > 0,
	)
	// **Every** track's guard, not the endurance half of it: ADR 0047 §1 gave a
	// strength segment the same ramp and the same boundary step, and the guard gained
	// a second track to guard with them. Each line carries the track it came from, so
	// a lifting warning can say where it opens instead of naming a phase as its
	// subject.
	const warnings = season.tracks.flatMap((track) =>
		track.warnings.map((warning) => ({
			...warning,
			discipline: track.discipline,
			lifting: !isCardioDiscipline(track.discipline),
		})),
	)
	// Both fit checks, read off the season rather than derived here: the days check is
	// the **combined** one across both tracks (ADR 0047 §4) and the hours one prices
	// the weeks through the **Volume Conversion** (ADR 0050), and a component that
	// recomputed either would put two overlapping claims about one week on the same
	// page.
	const availability = season.availabilityWarnings
	const hoursFit = season.hoursWarnings
	const dayClashes = season.dayClashWarnings

	// The spark on each phase's closed card, read off the *first* track that prices
	// its weeks. One track and never a sum: no figure spans two tracks in either
	// direction (ADR 0046 §1), and a shape drawn from two currencies added together
	// would be exactly that figure, drawn instead of printed.
	const sparkTrack = season.tracks.find((track) =>
		season.weeks.some(
			(week) =>
				week.targets.find((target) => target.trackId === track.trackId)
					?.value != null,
		),
	)

	return (
		<div className="space-y-6">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}
			{/* The guards **open** here, always, and above everything they are about:
			    they warn and never block (ADR 0040 §12), which only works if the athlete
			    reads them without asking, so none of the three sits behind a
			    `Disclosure`. Hiding a warning before it has been read is a warning
			    withheld — progressive disclosure is for controls, never for what the
			    plan is trying to tell you.

			    Closing one **after** reading it is the opposite act, and it is the
			    athlete's (#399 story 95): see `DismissibleNotice`, which is where the
			    distinction and the per-visit rule are written down. */}
			{warnings.length > 0 ? (
				<RampGuardNotice
					warnings={warnings}
					phases={season.phases}
					anyStrength={warnings.some((warning) => warning.lifting)}
				/>
			) : null}
			{availability.length > 0 ||
			hoursFit.length > 0 ||
			dayClashes.length > 0 ? (
				<AvailabilityFitNotice
					warnings={availability}
					hoursWarnings={hoursFit}
					dayClashes={dayClashes}
					weeklyCapacityHours={season.weeklyCapacityHours}
					startWeekKey={season.startWeekKey}
				/>
			) : null}
			{season.bandWarnings.length > 0 ? (
				<BandFitNotice
					warnings={season.bandWarnings}
					timezone={season.timezone}
					startWeekKey={season.startWeekKey}
				/>
			) : null}

			<ol aria-label={SESONG_PAGE_LABELS.phasesList} className="space-y-3">
				{season.phases.map((phase, position) => {
					// This phase's weeks, in plan order, as the track that prices them
					// reads them. Roles come from the week rather than from the rhythm, so
					// a hand-set week draws where the athlete put it.
					const phaseWeeks = season.weeks.filter(
						(week) => week.phaseIndex === position,
					)
					return (
						// Keyed by the phase's own id: position orders the season and identity
						// edits it, and an index key would carry a card's local state onto its
						// neighbour the moment two phases swap places.
						<li key={phase.id}>
							{/* The structure and the progression are two acts on one card: the
							    phase's own controls come from the editor module, and each
							    endurance track's rates are nested inside it. */}
							<PhaseCard
								phase={phase}
								position={position}
								phaseCount={season.phases.length}
								// Compared by *position*, so a season with two phases named "Base"
								// lights up one of them rather than both (ADR 0044 §2).
								isCurrent={position === season.currentPhaseIndex}
								timezone={season.timezone}
								spark={
									sparkTrack && phaseWeeks.length > 0 ? (
										<PhaseSpark
											label={SESONG_PHASE_LABELS.sparkLabel(
												nbPhaseName(phase.name),
												phaseWeeks.length,
												nbTrackName(sparkTrack.discipline),
											)}
											values={phaseWeeks.map(
												(week) =>
													week.targets.find(
														(target) => target.trackId === sparkTrack.trackId,
													)?.value ?? null,
											)}
											recovery={phaseWeeks.map(
												(week) => week.role !== 'loading',
											)}
										/>
									) : null
								}
								reading={phaseReading(enduranceTracks, position)}
							>
								{enduranceTracks.map((track) => {
									const segment = track.segments.find(
										(candidate) => candidate.phaseIndex === position,
									)
									// Named only where there is more than one track to tell apart;
									// one runner reads one form, unlabelled.
									const trackLabel =
										enduranceTracks.length > 1
											? nbTrackName(track.discipline)
											: null
									return segment ? (
										// The two authored axes of one segment, as two saves: volume
										// (#403) and the **Quality Session Mix** (ADR 0042 §3). Separate
										// forms because they are separate acts — fixing a ramp is not a
										// re-submission of the mix — and each reads only its own reply.
										<div key={track.discipline} className="space-y-4">
											<SegmentProgressionForm
												segment={segment}
												phase={phase}
												boundaryStep={boundaryStepStanding(
													season.phases,
													anchorPlacementsOf(
														season.startWeekKey,
														track.anchors,
													),
													position,
												)}
												trackLabel={trackLabel}
												actionData={actionData}
											/>
											<SegmentMixForm
												segment={segment}
												trackLabel={trackLabel}
												actionData={actionData}
											/>
										</div>
									) : null
								})}
							</PhaseCard>
						</li>
					)
				})}
			</ol>

			{/* Everything below the phases is something an athlete does **once, or
			    rarely** — pick a shape, say what they start from, lay out a lifting
			    block, add a phase, fit the season to its Event. None of them is one of
			    the four Sesong edits of #505 v1 (ADR 0084 §1): they apply directly,
			    with no preview, so they wait behind one closed _Avansert_ line that
			    says so before it opens. Inside, each is exactly the surface that
			    shipped. */}
			<div className="border-border/70 border-b">
				<CollapsibleSection
					summary={SEASON_ADVANCED_LABELS.title}
					detail={SEASON_ADVANCED_LABELS.note}
				>
					{/* Where the season misses its Event, the edit that would close the
					    gap, named in full before it is offered. The proposal is
					    recomputed server-side when it is applied, so a stale reading can
					    never land an edit the athlete was not shown. */}
					{season.fit ? (
						<FitToEventOffer
							outlineId={season.outlineId}
							proposal={proposeFit(season.phases, season.fit)}
						/>
					) : null}

					{/* The analytical season chart (#413) — layers, read-in, the
					    derivation behind each week — under Avansert since round 2
					    (decision 12): the season picture at the top is what the
					    athlete reads first, and this is the instrument behind it.
					    Mounted only once opened, so its replay costs nothing until
					    asked for. */}
					<CollapsibleSection
						summary={SESONG_PAGE_LABELS.advancedChart}
						detail={SESONG_PAGE_LABELS.advancedChartDetail}
					>
						<SeasonChart
							season={season}
							contexts={conversionContexts}
							fitnessAnchor={fitnessAnchor}
							fitness={seasonFitness}
							bare
						/>
					</CollapsibleSection>

					{/* A shape replaces every phase, so it is offered only while no week
					    of the plan has begun. After that the way to another method is
					    _Bytt filosofi_, which keeps the weeks lived and the athlete's
					    sessions and previews first (#505 stories 13–14). */}
					{season.startWeekKey < firstUnbegunWeekKey ? (
						<div
							className="border-border/70 space-y-1 border-t py-3"
							data-preset-gallery-begun
						>
							<p className="text-sm font-medium">
								{SESONG_PAGE_LABELS.shapeTitle}
							</p>
							<p className="text-muted-foreground text-sm">
								{PRESET_GALLERY_LABELS.begun}
							</p>
							{/* A line of text and the only way there, so it carries an
							    invisible box to 44px (ADR 0028 §2) without moving the
							    reading's rhythm. */}
							<a
								href="#philosophy"
								className="text-footnote relative inline-flex min-h-11 touch-manipulation items-center font-semibold underline underline-offset-4"
							>
								{PRESET_GALLERY_LABELS.switchLink}
							</a>
						</div>
					) : (
						<CollapsibleSection
							summary={SESONG_PAGE_LABELS.shapeTitle}
							detail={SESONG_PAGE_LABELS.shapeDetail}
						>
							<PresetGallery outlineId={season.outlineId} />
						</CollapsibleSection>
					)}

					{/* The anchor is the level the ramps above multiply, and re-anchoring
					    is a statement about the *season*, not about a phase: it takes
					    effect from a week the athlete picks and floats free of where the
					    blocks fall (ADR 0040 §5). */}
					<CollapsibleSection
						summary={SESONG_PAGE_LABELS.anchorsTitle}
						detail={anchorSummary(anchorTracks)}
					>
						<SeasonAnchorSection
							tracks={anchorTracks}
							weeks={season.weeks}
							timezone={season.timezone}
							actionData={actionData}
						/>
					</CollapsibleSection>

					{/* The lifting blocks sit *beside* the phase list rather than inside
					    it, because a dated block has no phase card to belong to (ADR 0047
					    §6) — it is laid out along the plan's own weeks instead. */}
					{strengthTracks.length > 0 ? (
						<CollapsibleSection
							summary={SESONG_PAGE_LABELS.liftingTitle}
							detail={strengthSummary(strengthTracks)}
						>
							<StrengthBlocksSection
								tracks={strengthTracks}
								weeks={season.weeks}
								timezone={season.timezone}
								actionData={actionData}
							/>
						</CollapsibleSection>
					) : null}

					<CollapsibleSection
						summary={SESONG_PAGE_LABELS.addPhaseTitle}
						detail={SESONG_PAGE_LABELS.addPhaseDetail}
					>
						<AddPhaseForm outlineId={season.outlineId} phases={season.phases} />
					</CollapsibleSection>
				</CollapsibleSection>

				<CollapsibleSection
					summary={SESONG_PAGE_LABELS.deleteTitle}
					detail={
						season.eventId
							? SESONG_PAGE_LABELS.deleteDetailEvent
							: SESONG_PAGE_LABELS.deleteDetail
					}
				>
					<DeletePlanSection
						outlineId={season.outlineId}
						eventName={season.eventName}
					/>
				</CollapsibleSection>
			</div>
		</div>
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
 * What a block *does*, in a sentence, for the top of its opened card.
 *
 * The card's controls say it in the vocabulary the model uses — a **Volume Ramp**
 * as a signed percentage, a **Quality Session Mix** as a count per **Training
 * Zone**. That vocabulary is exact and it is the right label on a field an athlete
 * is editing; it is the wrong thing to meet *first* on the block you opened to
 * understand. This is the same three facts as prose, and it is derived from the
 * same segments the forms below write, so it cannot describe a block the controls
 * would not produce.
 *
 * A ramp of `null` is said out loud rather than skipped: "does not climb" is the
 * fact an athlete is least likely to notice and most likely to have not meant,
 * and the app must not imply a convention was applied where none was (ADR 0044 §4).
 * Empty for a plan whose tracks have no segment over this phase — a strength-only
 * plan, whose blocks are dated and float free of the phases (ADR 0047 §6).
 */
function phaseReading(
	tracks: SeasonTrack[],
	phaseIndex: number,
): string | null {
	const sentences = tracks.flatMap((track) => {
		const segment = track.segments.find(
			(candidate) => candidate.phaseIndex === phaseIndex,
		)
		if (!segment) return []
		const subject = SESONG_SEGMENT_LABELS.readingSubject(
			tracks.length > 1 ? nbTrackName(track.discipline) : null,
		)
		const climb =
			segment.ramp == null
				? SESONG_SEGMENT_LABELS.readingFlat
				: SESONG_SEGMENT_LABELS.readingClimb(
						formatNbSignedPercent(segment.ramp),
					)
		const step =
			segment.boundaryStep == null
				? ''
				: SESONG_SEGMENT_LABELS.readingStep(
						formatNbSignedPercent(segment.boundaryStep),
					)
		const quality = SESONG_SEGMENT_LABELS.readingQuality(
			qualitySessionCount(segment.mix),
			formatNbEmphasisLabel(emphasisTerms(segment.mix)),
		)
		return [`${subject} ${climb}${step}, ${quality}.`]
	})
	return sentences.length === 0 ? null : sentences.join(' ')
}

/**
 * A closed anchor section, in one line: what each track starts at, and whether it
 * has been re-anchored.
 *
 * Its own function rather than inline because a summary line is a *reading* — it
 * has to stay true for one track and four, and for a track that has re-anchored
 * three times. Each figure is in its own track's currency, which is the same rule
 * the roster and the week grid follow and the reason no total appears here.
 */
function anchorSummary(tracks: EditableAnchorTrack[]): string {
	if (tracks.length === 0) return SESONG_ANCHOR_LABELS.summaryNone
	return tracks
		.map((track) => {
			const first = track.anchors[0]
			const opening = first
				? formatNbWeeklyVolume(first.value, track.currency)
				: SESONG_ANCHOR_LABELS.summaryNotSet
			return SESONG_ANCHOR_LABELS.summary(
				nbTrackName(track.discipline),
				opening,
				track.anchors.length - 1,
			)
		})
		.join(' · ')
}

/** The same, for the dated lifting blocks: how many, over how many weeks. */
function strengthSummary(tracks: EditableStrengthTrack[]): string {
	const blocks = tracks.reduce(
		(count, track) => count + track.segments.length,
		0,
	)
	if (blocks === 0) return SESONG_LIFTING_LABELS.summaryNone
	return SESONG_LIFTING_LABELS.summary(blocks)
}

/** One field of the progression form, and the Conform metadata behind it. */
type RateMeta = ReturnType<
	typeof useForm<RateFormValue>
>[1][keyof RateFormValue]
type RateFormValue = z.input<typeof SegmentFormSchema>

/**
 * One authored rate: a percent field, and underneath it what the field currently
 * *means* — either the athlete's own number read back, or what blank falls through
 * to.
 *
 * That pairing is the whole point and is why every rate goes through one component:
 * an unset rate must read as blank **plus** a stated convention, never as the
 * convention's number sitting in the box (ADR 0044 §4).
 */
function RateField({
	meta,
	label,
	meaning,
	nonNegative = false,
}: {
	meta: RateMeta
	label: string
	meaning: string
	/** Cuts are a depth and never a direction, so they take no negative. */
	nonNegative?: boolean
}) {
	return (
		<div>
			<Field
				labelProps={{ children: label }}
				inputProps={{
					...getInputProps(meta, { type: 'number' }),
					step: 'any',
					...(nonNegative ? { min: 0 } : {}),
					inputMode: 'decimal',
				}}
				errors={meta.errors as string[] | undefined}
			/>
			<p className="text-muted-foreground mt-1 text-sm">{meaning}</p>
		</div>
	)
}

/**
 * A rate this phase shows no field for, carried through the save anyway.
 *
 * `EnduranceSegmentSetSchema` writes all four rates every time — it has to, or
 * clearing one back to the convention would be unexpressible — so a missing input
 * would read as blank and silently wipe what is stored. A block that does not taper
 * must not clear the taper cut of one that does.
 */
function CarriedRate({
	meta,
	fraction,
}: {
	meta: RateMeta
	fraction: number | null
}) {
	return (
		<input type="hidden" name={meta.name} value={formatRateField(fraction)} />
	)
}

/**
 * Whether a phase may present its **Block Boundary Step** as a live field — and
 * where it may not, the reason the athlete is owed in its place.
 *
 * A union rather than a boolean plus a reason, because a reason is only ever a
 * reason for *not* offering the field: the shape makes "in force, and here is why
 * not" unstateable rather than merely unwritten.
 *
 * The member is the **token** and not the sentence, so the wording stays in
 * `labels.ts` where `__strength-segment-editor.tsx` reads the same three
 * ({@link BOUNDARY_STEP_OUT_OF_FORCE_LABELS}) — one athlete-facing string, one
 * place, whichever surface is asking.
 */
type BoundaryStepStanding =
	| { inForce: true }
	| { inForce: false; reason: BoundaryStepOutOfForce }

/**
 * That question answered for one phase, off the same rule the arithmetic uses.
 *
 * **The decision is `boundaryStepInForce`'s and is read from it**, never restated
 * here: `derivedWeekTarget` skips the step of the phase the **Season Anchor** in
 * force restarted in (ADR 0040 §5), and a field offered there is a control the
 * athlete can change that changes nothing (ADR 0044 §8). This used to ask
 * `position === 0`, which knew about the season's opening and nothing about
 * anchors — so re-anchoring into a later phase left that phase's step field
 * claiming "−10% once, at the opening" over a derivation that ignored it.
 *
 * **Three ways to be out of force, and the athlete gets the one that applies.** A
 * single sentence would have to be vague enough to cover a season opening, a plan
 * with no anchor over this phase yet, and a re-anchor landing on this phase's first
 * week — three different states of the athlete's own plan, with three different
 * edits that would change them (Unavailable Metric: the reason is the point). Two of
 * the three are situations `__strength-segment-editor.tsx` reaches as well, so all
 * three are worded once in `labels.ts` and named here by token: one situation said
 * two ways is two situations to the person reading.
 *
 * The "no anchor yet" test is an **existence** check and not a second copy of the
 * selection rule: which anchor is in force decides nothing about the wording, only
 * whether there is one at all, and whether the field renders was already decided
 * above.
 */
function boundaryStepStanding(
	phases: SeasonPhaseData[],
	anchors: AnchorPlacement[],
	position: number,
): BoundaryStepStanding {
	if (boundaryStepInForce(phases, anchors, position)) return { inForce: true }
	if (position === 0) return { inForce: false, reason: 'season-opens' }
	const opensAtWeekIndex = (phases[position]?.fromWeekInPlan ?? 1) - 1
	if (!anchors.some((anchor) => anchor.fromWeekIndex <= opensAtWeekIndex)) {
		return { inForce: false, reason: 'no-anchor-yet' }
	}
	return { inForce: false, reason: 'anchor-opens-here' }
}

/**
 * One endurance segment's progression, authored.
 *
 * The fields **are** the reading: a rate the athlete authored shows as the number
 * they typed, and one they have not shows as **blank** with what blank means said
 * underneath. That is the distinction ADR 0044 §4 requires — an unset cut is
 * "follows the documented convention" and never the convention's number in the box,
 * so a convention that moves later cannot look like an edit to the athlete's plan.
 *
 * Every rate is written on every save (`EnduranceSegmentSetSchema` takes all four),
 * so a rate this phase has no field for travels as a **hidden input** carrying what
 * is stored. Without that, opening a non-tapering block would silently clear the
 * taper cut of a block that does taper.
 */
function SegmentProgressionForm({
	segment,
	phase,
	boundaryStep,
	trackLabel,
	actionData,
}: {
	segment: SegmentData
	phase: SeasonPhaseData
	/** Whether the step is a step the walk applies — {@link boundaryStepStanding}. */
	boundaryStep: BoundaryStepStanding
	trackLabel: string | null
	actionData: SegmentActionData
}) {
	// Recovery weeks come from the phase's rhythm, and a tapering phase tapers
	// throughout instead of recovering (ADR 0044 §4) — so a cut with no week to
	// apply to gets no field, rather than a control that changes nothing.
	const hasRecoveryWeeks = phase.rhythm !== 'none' && !phase.tapers
	const [form, fields] = useForm({
		id: `segment-${segment.segmentId}`,
		// Only the form that was submitted reads the reply: a rejected save must
		// report on the card it was typed into and leave its siblings untouched. The
		// narrowing is on the `intent` *and* the `segmentId`, because the action answers
		// the structural edits too — those carry a sentence rather than a submission —
		// and this segment's own mix form, whose reply applied here would blank the
		// rates it says nothing about.
		lastResult:
			actionData &&
			'segmentId' in actionData &&
			actionData.intent === 'set-segment-rates' &&
			actionData.segmentId === segment.segmentId
				? actionData.result
				: undefined,
		defaultValue: {
			ramp: formatRateField(segment.ramp),
			boundaryStep: formatRateField(segment.boundaryStep),
			recoveryCut: formatRateField(segment.recoveryCut),
			taperCut: formatRateField(segment.taperCut),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SegmentFormSchema })
		},
	})

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			{/* Named, because this page's action dispatches on `intent`: the structural
			    edits and this progression save land on the same route. */}
			<input type="hidden" name="intent" value="set-segment-rates" />
			<input type="hidden" name="segmentId" value={segment.segmentId} />
			{trackLabel ? (
				<p className="text-sm font-medium">
					{SESONG_SEGMENT_LABELS.progression(trackLabel)}
				</p>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2">
				<RateField
					meta={fields.ramp}
					label={SESONG_SEGMENT_LABELS.ramp}
					meaning={
						segment.ramp == null
							? SESONG_SEGMENT_LABELS.rampBlank
							: SESONG_SEGMENT_LABELS.rampSet(
									formatNbSignedPercent(segment.ramp),
								)
					}
				/>

				{boundaryStep.inForce ? (
					<RateField
						meta={fields.boundaryStep}
						label={SESONG_SEGMENT_LABELS.step}
						meaning={
							segment.boundaryStep == null
								? SESONG_SEGMENT_LABELS.stepBlank
								: SESONG_SEGMENT_LABELS.stepSet(
										formatNbSignedPercent(segment.boundaryStep),
									)
						}
					/>
				) : (
					// A step the walk does not apply is the dead control ADR 0044 §8 rules
					// out, so the field goes and the reason takes its place. The stored rate
					// still travels: `EnduranceSegmentSetSchema` writes all four every time,
					// and a missing box would clear a step the athlete authored the moment
					// they saved anything else on the card — which must not happen while the
					// anchor sits on this block's opening week, ready to be moved off it.
					// The same treatment `__strength-segment-editor.tsx` gives a dated block.
					<>
						<CarriedRate
							meta={fields.boundaryStep}
							fraction={segment.boundaryStep}
						/>
						<p className="text-muted-foreground self-end text-sm">
							{NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS[boundaryStep.reason]}
						</p>
					</>
				)}

				{hasRecoveryWeeks ? (
					<RateField
						meta={fields.recoveryCut}
						label={SESONG_SEGMENT_LABELS.recoveryCut}
						nonNegative
						meaning={
							segment.recoveryCut == null
								? SESONG_SEGMENT_LABELS.recoveryBlank(
										formatNbSignedPercent(-DEFAULT_RECOVERY_CUT),
									)
								: SESONG_SEGMENT_LABELS.recoverySet(
										formatNbSignedPercent(-segment.recoveryCut),
									)
						}
					/>
				) : (
					<CarriedRate
						meta={fields.recoveryCut}
						fraction={segment.recoveryCut}
					/>
				)}

				{phase.tapers ? (
					<RateField
						meta={fields.taperCut}
						label={SESONG_SEGMENT_LABELS.taperCut}
						nonNegative
						meaning={`${
							segment.taperCut == null
								? SESONG_SEGMENT_LABELS.taperBlank(
										formatNbSignedPercent(-DEFAULT_TAPER_CUT),
									)
								: SESONG_SEGMENT_LABELS.taperSet(
										formatNbSignedPercent(-segment.taperCut),
									)
						}${SESONG_SEGMENT_LABELS.taperNote}`}
					/>
				) : (
					<CarriedRate meta={fields.taperCut} fraction={segment.taperCut} />
				)}
			</div>

			<ErrorList errors={form.errors as string[] | undefined} />

			{/* Full-width on phones, inline from `sm` (ui-conventions §1.8), and no
			    `size` override: a route file does not set control heights (§2.1). */}
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				{SESONG_SEGMENT_LABELS.saveProgression(trackLabel)}
			</Button>
		</Form>
	)
}

/**
 * One endurance segment's **Quality Session Mix**, authored — and the two readings
 * taken off it, shown as readings.
 *
 * **The shape of this form is the domain rule.** There is one integer field per member
 * of `QUALITY_ZONES` and no way to add a fourth, which makes three of ADR 0042's
 * decisions structural instead of validated:
 *
 * - a zone **cannot appear twice**, because it has exactly one box;
 * - there is **no speed / neuromuscular field and nowhere for one to go**.
 *   Neuromuscular work is high *mechanical* intensity at low metabolic strain, and the
 *   zone scale orders metabolic strain — so `speed` has no position on this axis at
 *   all and is authored as an Intensity Target on a step instead (ADR 0042 §7);
 * - zones **1 and 2 are not offerable** either: a quality session is an intensive one,
 *   and admitting easy sessions would change what the count means without anything
 *   changing in the training (§3).
 *
 * **Blank or `0` means the zone is not in the mix**, and the help text says so,
 * because the same empty box means the *opposite* thing a few fields up: an empty rate
 * is "follow the documented convention" (ADR 0044 §4). A mix has no convention to fall
 * back on — an empty mix is the positive statement "no quality sessions", never
 * "unknown" (ADR 0042 §6) — which is why these are plain number fields rather than
 * `RateField`/`CarriedRate`, and why every zone travels on every save.
 */
function SegmentMixForm({
	segment,
	trackLabel,
	actionData,
}: {
	segment: SegmentData
	trackLabel: string | null
	actionData: SegmentActionData
}) {
	const [form, fields] = useForm({
		id: `mix-${segment.segmentId}`,
		// Keyed by intent and segment, so this reply lands on this form only — see
		// `authorQualityMix`. A rates reply read here would blank the mix.
		lastResult:
			actionData &&
			'segmentId' in actionData &&
			actionData.intent === 'set-quality-mix' &&
			actionData.segmentId === segment.segmentId
				? actionData.result
				: undefined,
		defaultValue: Object.fromEntries(
			QUALITY_ZONES.map((zone) => [
				mixFieldName(zone),
				// A zone that is not in the mix reads back **blank** rather than `0`: the
				// row does not exist, and a typed 0 would be a number the athlete never
				// entered sitting in a box.
				String(
					segment.mix.find((entry) => entry.zone === zone)?.sessionsPerWeek ??
						'',
				),
			]),
		),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: MixFormSchema })
		},
	})

	// Both figures are read off the **mix** and nothing else — never off materialized
	// **Workout Sessions**, even for weeks that have them. That is automatic here
	// because `segment.mix` is the only input, and it must stay that way: sourcing the
	// label from sessions where they exist would make a segment's name change character
	// with how far into the season it sits (ADR 0042 §9).
	const emphasis = formatNbEmphasisLabel(emphasisTerms(segment.mix))
	const count = qualitySessionCount(segment.mix)

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			<input type="hidden" name="intent" value="set-quality-mix" />
			<input type="hidden" name="segmentId" value={segment.segmentId} />
			<p className="text-sm font-medium">
				{SESONG_SEGMENT_LABELS.mix(trackLabel)}
			</p>
			<p className="text-muted-foreground text-sm">
				{SESONG_SEGMENT_LABELS.mixIntro}
			</p>

			{/* One field per quality zone, generated from `QUALITY_ZONES` — so zones 3–5
			    are the whole vocabulary and there is no fourth box to fill. */}
			<div className="grid gap-4 sm:grid-cols-3">
				{QUALITY_ZONES.map((zone) => {
					// Non-null because the field list *is* `QUALITY_ZONES`: the schema and
					// the inputs are generated from the same constant, so a zone without a
					// field is unrepresentable rather than merely unlikely.
					const meta = fields[mixFieldName(zone)]!
					return (
						<Field
							key={zone}
							labelProps={{
								// "Zone 4 threshold" — the zone number carries the ordering and the
								// shared label carries the word, so this route spells neither
								// itself (ADR 0023).
								children: SESONG_SEGMENT_LABELS.mixField(
									zone,
									NB_QUALITY_ZONE_LABELS[zone],
								),
							}}
							inputProps={{
								...getInputProps(meta, { type: 'number' }),
								min: 0,
								max: MAX_QUALITY_SESSIONS_PER_WEEK,
								step: 1,
								inputMode: 'numeric',
							}}
							errors={meta.errors as string[] | undefined}
						/>
					)
				})}
			</div>

			{/* The two derived readings, as text and never as controls: there is no input
			    for either, because nobody can name a block for work it does not contain
			    (ADR 0042 §5) and nobody can hand-set a sum. Marked in the words rather
			    than in new chrome — the same way the Season Span says where it is read
			    from. */}
			<dl className="text-sm">
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground">
						{SESONG_SEGMENT_LABELS.emphasis}
					</dt>
					<dd className="font-medium">{emphasis}</dd>
				</div>
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground">
						{SESONG_SEGMENT_LABELS.count}
					</dt>
					<dd className="font-medium tabular-nums">{count}</dd>
				</div>
			</dl>
			<p className="text-muted-foreground text-sm">
				{SESONG_SEGMENT_LABELS.derivedNote}
			</p>

			<ErrorList errors={form.errors as string[] | undefined} />

			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				{SESONG_SEGMENT_LABELS.saveMix(trackLabel)}
			</Button>
		</Form>
	)
}

type WeekData = SeasonData['weeks'][number]
type WeekTargetData = WeekData['targets'][number]

/**
 * One track's target in one week, read-only, with the way to change it.
 *
 * The Weeks reading used to carry an input per week per track (#406). Every
 * week target is now changed in _Endre sesongen_, behind a preview (#505
 * story 75), so this says what the week reads — and, for a hand-set week, what
 * the rule would give — and links there, pre-filled. A week already begun is
 * history and offers no link.
 */
function WeekTargetLine({
	week,
	target,
	editable,
}: {
	week: WeekData
	target: WeekTargetData
	editable: boolean
}) {
	const discipline = nbTrackName(target.discipline)
	return (
		<div className="space-y-1">
			<p className="text-sm font-medium">
				{discipline}, {NB_WEEKLY_UNITS[target.currency]}
			</p>
			{target.overridden ? (
				<p className="text-muted-foreground text-sm">
					{target.derivedValue == null
						? SESONG_PAGE_LABELS.handSetNoRule
						: SESONG_PAGE_LABELS.handSetRule(
								formatNbWeeklyVolume(target.derivedValue, target.currency),
							)}
				</p>
			) : null}
			{editable ? (
				<SeasonEditLink
					edit="week-target"
					fields={{ weekKey: week.weekKey, trackId: target.trackId }}
					aria-label={`${SEASON_EDIT_LABELS.weekTargetOpen}: uke ${weekNumberOf(week)} ${discipline.toLowerCase()}`}
				>
					{SEASON_EDIT_LABELS.weekTargetOpen}
				</SeasonEditLink>
			) : null}
		</div>
	)
}

/**
 * One week's targets as a **reading**: the row's own line, and the whole of what a
 * closed week says.
 *
 * Split from the field below it so a figure appears once per week per track. The
 * week grid is the surface's dense half by design (#399: "dense only where density
 * is the point"), and density here means every week legible in one line — which it
 * is not if each track's number arrives attached to its own input.
 *
 * Every honesty rule the field used to carry is carried here instead, unchanged: an
 * Unavailable target says so rather than printing a dash, a strength gap reads as
 * the athlete's own "no lifting", a deload names itself beside — never instead of —
 * the week's own role, and a hand-set week is marked in words.
 */
function WeekTargetsReading({
	week,
	tracks,
}: {
	week: WeekData
	/** Whether the plan measures more than one track, so a figure needs naming. */
	tracks: number
}) {
	return (
		<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
			{week.targets.map((target) => (
				<span
					key={target.trackId}
					className="flex items-center gap-1.5 tabular-nums"
				>
					{/* Named only where there is a second track to tell it apart from. */}
					{tracks > 1 ? (
						<span className="text-muted-foreground text-caption">
							{nbTrackName(target.discipline)}
						</span>
					) : null}
					{target.value == null ? (
						<span className="text-muted-foreground">
							{SESONG_PAGE_LABELS.unavailable}
						</span>
					) : target.strengthRole === 'gap' && !target.overridden ? (
						// A gap week on a strength track is the athlete's own "no lifting
						// these weeks", so the rule's `0` reads as that sentence and never as
						// a dash, a blank or an Unavailable — it is something they said rather
						// than something the app failed to work out. Read off the target
						// rather than worked out here, so this row and the figure on it come
						// from one derivation (ADR 0047 §6).
						<span>{SESONG_PAGE_LABELS.noLifting}</span>
					) : (
						<>
							<span className="font-medium">
								{formatNbWeeklyVolume(target.value, target.currency)}
							</span>
							{/* The block's own tail, named on the row where the cut shows up.
							    Beside the week's `WeekRole` rather than instead of it: a week
							    can carry one of each, and they are roles in two different
							    things (ADR 0047 §6). */}
							{target.strengthRole === 'deload' ? (
								<span className="text-muted-foreground">
									· {SESONG_PAGE_LABELS.deload}
								</span>
							) : null}
						</>
					)}
					{target.overridden ? (
						<Badge variant="secondary">{SESONG_PAGE_LABELS.handSet}</Badge>
					) : null}
				</span>
			))}
		</span>
	)
}

/**
 * The Weeks reading: every Training Week with its role and its target per track, each
 * one hand-settable. One column per track in **that track's** own currency — never a
 * total across them, which would need an exchange rate the app refuses to invent
 * (ADR 0043 §5).
 *
 * This is the **write** surface for a **Week Volume Override**, and it belongs here
 * rather than on Blocks because hand-setting is a statement about one *week*, which is
 * what this reading audits. What the athlete types is that week's final target and
 * nothing else: an override is a leaf, so every later week still comes out of the
 * anchor and the ramps authored on Blocks (ADR 0044 §5).
 *
 * The **Week Pattern** lives here too, under the weeks it is read against (#410).
 * Not a third tab: Blocks and Weeks are two readings of one object and a tab is
 * for navigation only (#366) — and "what does my typical week come out as in week
 * 7" is a question about a week, which is what this reading audits.
 */
function WeeksReading({
	season,
	error,
	chosenWeek,
	workouts,
	seasonQuery,
	pendingCopy,
	mixWarnings,
	firstUnbegunWeekKey,
}: {
	season: SeasonData
	/** A refused pattern edit, said once above the patterns it was aimed at. */
	error?: string
	/** The week the **Pattern Preview** is read against (`?week=`). */
	chosenWeek: SeasonData['weeks'][number] | null
	workouts: Route.ComponentProps['loaderData']['workouts']
	seasonQuery: SeasonQuery
	/** A week copy waiting on the athlete's yes, with what it would replace. */
	pendingCopy: PendingCopy | null
	mixWarnings: Route.ComponentProps['loaderData']['mixWarnings']
	/** Weeks before it are history: their targets are shown, not offered to edit. */
	firstUnbegunWeekKey: string
}) {
	// A track whose every week reads Unavailable gets its reason said once, rather
	// than a column of dashes the athlete has to interpret (Unavailable Metric).
	const unpricedTracks = season.tracks.filter((track) =>
		season.weeks.every(
			(week) =>
				week.targets.find((target) => target.discipline === track.discipline)
					?.value == null,
		),
	)
	// Said once, under the list, and only where a deload is actually on it.
	const anyDeload = season.weeks.some((week) =>
		week.targets.some((target) => target.strengthRole === 'deload'),
	)

	return (
		// The section ladder, exactly as `BlocksReading` has it: the weeks and the
		// pattern read against them are two sections, separated by the `space-y-8` gap
		// and by no margins of their own (§1.7).
		<div className="space-y-8">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}
			{/* The audit half of the surface, and the one place density is the point
			    (#399): a season is 10–20 weeks and an athlete scanning for the week
			    that looks wrong needs them all on one screen. Each week reads as a
			    line — number, date, role, what it comes to — and opens onto its own
			    boxes. Before, every week rendered a labelled input per track whether
			    or not the athlete was hand-setting anything, which is what turned a
			    20-week season into a page of 40 empty fields. */}
			<PlanCard
				titleId="week-grid"
				contentClassName="space-y-3"
				title={SESONG_PAGE_LABELS.weekByWeek}
				aside={SESONG_PAGE_LABELS.weekCount(season.weeks.length)}
			>
				<ul
					aria-label={SESONG_PAGE_LABELS.weeksList}
					className="divide-border/70 divide-y"
				>
					{season.weeks.map((week, position) => {
						// The block's name once, over its own run of weeks, rather than on
						// every row: it is the same word for four rows running, and repeating
						// it is what pushes the figures off a phone's line.
						const phase = season.phases[week.phaseIndex]
						const opensBlock =
							position === 0 ||
							season.weeks[position - 1]?.phaseIndex !== week.phaseIndex
						return (
							<li key={week.weekKey}>
								{opensBlock && phase ? (
									<p className="text-muted-foreground text-overline pt-3 pb-1 uppercase">
										{nbPhaseName(phase.name)}
									</p>
								) : null}
								<Collapsible>
									<CollapsibleTrigger className="hover:bg-muted/50 active:bg-muted motion-safe:duration-press -mx-2 flex min-h-11 w-[calc(100%+1rem)] touch-manipulation items-center gap-3 rounded-2xl px-2 py-3 text-left motion-safe:transition-colors motion-safe:ease-out">
										{/* Wide enough for `12 Aug 2026` on one line: a date that wraps turns
										    every row into two, which is exactly the density this reading exists
										    for. */}
										<span className="w-[5.5rem] shrink-0">
											<span className="text-callout block font-semibold tabular-nums">
												Uke {weekNumberOf(week)}
											</span>
											<span className="text-muted-foreground text-caption block tabular-nums">
												{formatNbDayMonth(week.startsAt, season.timezone)}
											</span>
										</span>
										{/* The role drops off at 390 px rather than squeezing the figures: a
										    week's target is what the athlete scans for, and the rhythm is legible
										    from the chart above. */}
										<span className="text-muted-foreground text-caption hidden w-20 shrink-0 sm:block">
											{NB_WEEK_ROLE_LABELS[week.role]}
										</span>
										<span className="min-w-0 flex-1">
											<WeekTargetsReading
												week={week}
												tracks={season.tracks.length}
											/>
										</span>
										<Icon
											name="chevron-down"
											size="sm"
											className="text-muted-foreground motion-safe:duration-press shrink-0 motion-safe:transition-transform motion-safe:ease-out [[data-panel-open]>&]:rotate-180"
										/>
									</CollapsibleTrigger>

									{/* What each track's week reads, and the way to change it. The
									    Weeks reading edits nothing itself: every week target is
									    changed in _Endre sesongen_, behind a preview (#505 story 75),
									    and this link opens it on this week and this track. */}
									<CollapsibleContent>
										<div className="space-y-3 pt-1 pb-4 pl-2">
											{week.targets.map((target) => (
												<WeekTargetLine
													key={target.trackId}
													week={week}
													target={target}
													editable={week.weekKey >= firstUnbegunWeekKey}
												/>
											))}
										</div>
									</CollapsibleContent>
								</Collapsible>
							</li>
						)
					})}
				</ul>

				{/* The list's own footnotes, under it and inside its card: each says
				    something about the column above rather than about the page.

				    Said once for the whole list rather than inside every week, the way
				    the preset gallery states its convention once: **blank is a third
				    meaning of blank on this page**, and the one number an athlete is most
				    likely to doubt — `0` — is spelled out beside it. */}
				<div className="border-border/70 space-y-3 border-t pt-4">
					<p className="text-muted-foreground text-sm">
						{SESONG_PAGE_LABELS.weeksFootnote}
					</p>
					{/* Since ADR 0047 §1 **both** walks price their weeks — a strength track
					    derives its target from the same anchor and ramp an endurance one does
					    — so the only way a whole column is `null` is that no Season Anchor
					    covers the plan. The old reason, that a strength track's weekly sets
					    were not derived yet, is false and gone with it. */}
					{unpricedTracks.map((track) => (
						<p key={track.discipline} className="text-muted-foreground text-sm">
							{SESONG_PAGE_LABELS.unpricedTrack(nbTrackName(track.discipline))}
						</p>
					))}
					{anyDeload ? (
						<p className="text-muted-foreground text-sm">
							{SESONG_PAGE_LABELS.deloadFootnote}
						</p>
					) : null}
				</div>
			</PlanCard>

			{/* Where the weeks the plan has laid disagree with the mix their block
			    authors — a reading of the sessions, said under the weeks it is about.
			    It used to live in the stamp's section, which is gone (decision 14). */}
			{mixWarnings.length > 0 ? (
				<MixNotices notices={mixWarnings} startWeekKey={season.startWeekKey} />
			) : null}

			{/* Filling the weeks is the reading's second act. The weeks fill
			    themselves from the typical week as the horizon reaches them (round-2
			    decision 14, ADR 0090), so what is left to *do* is the typical week
			    itself and copying a week the athlete liked. The heading says the
			    ladder is a set of actions before one is opened. */}
			<div className="space-y-1">
				<h2 className="text-heading">{SESONG_PAGE_LABELS.fillTitle}</h2>
				<p className="text-footnote text-muted-foreground">
					{season.patterns.some((pattern) => pattern.days.length > 0)
						? SESONG_PAGE_LABELS.fillIntro
						: SESONG_PAGE_LABELS.fillWaiting}
				</p>
			</div>
			<div className="border-border/60 border-b">
				{/* The pattern, read against one of the weeks above. It is handed the
				    week's *derived* targets — the same rows the list just rendered — so a
				    preview and the week it claims to be about cannot disagree. */}
				<CollapsibleSection
					summary={SESONG_PAGE_LABELS.patternTitle}
					detail={patternSummary(season.patterns)}
					defaultOpen={season.patterns.length === 0}
				>
					<WeekPatternSection
						outlineId={season.outlineId}
						patterns={season.patterns}
						trainableWeekdays={season.trainableWeekdays}
						tracks={season.tracks}
						weeks={season.weeks}
						week={chosenWeek}
						workouts={workouts}
						seasonQuery={seasonQuery}
					/>
				</CollapsibleSection>

				{/* The other way to fill a week: a week the athlete liked, carried as
				    authored (ADR 0044 §6). It opens on its own whenever a copy came back
				    asking a question — re-keyed, because a confirmation the athlete has
				    to answer cannot sit behind a closed row. */}
				<CollapsibleSection
					key={pendingCopy ? 'pending' : 'quiet'}
					summary={SESONG_PAGE_LABELS.copyTitle}
					detail={SESONG_PAGE_LABELS.copyDetail}
					defaultOpen={pendingCopy !== null}
				>
					<CopyWeekSection
						outlineId={season.outlineId}
						weeks={season.weeks}
						timezone={season.timezone}
						pending={pendingCopy}
					/>
				</CollapsibleSection>
			</div>
		</div>
	)
}

/**
 * Where a week the plan laid disagrees with the **Quality Session Mix** its block
 * authors (ADR 0042 §9). Advisory, in the shape the ramp guard and the
 * availability notice take: it names the two figures and stops. Nothing here
 * suggests a fix, because there is nothing to fix — the mix says what the block
 * is for and the week says what the plan now is, and both are the athlete's.
 */
function MixNotices({
	notices,
	startWeekKey,
}: {
	notices: StampedMixWarning[]
	startWeekKey: string
}) {
	return (
		<section
			aria-labelledby="mix-notices"
			className="bg-muted/50 space-y-2 rounded-3xl px-4 py-3"
			data-mix-notices
		>
			<h2 id="mix-notices" className="text-callout font-semibold">
				{SESONG_PAGE_LABELS.mixNoticesTitle}
			</h2>
			<ul className="text-footnote space-y-1.5">
				{notices.map((notice) => (
					<li key={`${notice.weekKey}-${notice.discipline}`}>
						<span className="font-semibold tabular-nums">
							Uke {isoWeekOfPlanWeek(startWeekKey, notice.weekInPlan)}
						</span>
						<span className="text-muted-foreground">
							{' '}
							· {nbTrackName(notice.discipline).toLowerCase()} ·{' '}
							{notice.disagreements
								.map((disagreement) =>
									SESONG_PAGE_LABELS.mixDisagreement(
										NB_QUALITY_ZONE_LABELS[disagreement.zone],
										disagreement.authored,
										disagreement.stamped,
									),
								)
								.join('; ')}
						</span>
					</li>
				))}
			</ul>
			<p className="text-caption text-muted-foreground">
				{SESONG_PAGE_LABELS.mixNoticesNote}
			</p>
		</section>
	)
}

/**
 * A closed pattern section, in one line.
 *
 * Names the patterns rather than counting them: an athlete with "Typical week" and
 * "Race week" recognises the words and learns nothing from "2 patterns".
 */
function patternSummary(patterns: SeasonData['patterns']): string {
	if (patterns.length === 0) {
		// Deliberately not the section's own empty state, which says "No pattern yet"
		// inside: a summary that repeats the sentence it is hiding says it twice the
		// moment the section opens.
		return SESONG_PAGE_LABELS.patternEmpty
	}
	return patterns.map((pattern) => pattern.name).join(' · ')
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

/**
 * The offer to close that gap, and the whole of what tapping it would do.
 *
 * The sentence is the point. Nothing here resizes a season on its own — a shape
 * is a fixed length and the app never stretches one (ADR 0044 §3) — so what makes
 * this legitimate is that the athlete reads the exact edit *before* they ask for
 * it: every block that changes, from how many weeks to how many. It is offered
 * because "your plan runs 9 weeks past your event" is a true sentence that leaves
 * an athlete who does not plan for a living with no idea which block to shorten.
 *
 * A `null` proposal renders nothing at all rather than a disabled control: the
 * plan already lands on the event, or the trim would cost a whole block, and the
 * refusal for the second case arrives on the action rather than as a greyed-out
 * button nobody can interpret.
 */
function FitToEventOffer({
	outlineId,
	proposal,
}: {
	outlineId: string
	proposal: FitProposal | null
}) {
	if (!proposal) return null
	const weeks = Math.abs(proposal.delta)
	return (
		<Form method="POST" className="space-y-2">
			<input type="hidden" name="intent" value="fit-to-event" />
			<input type="hidden" name="outlineId" value={outlineId} />
			<p className="text-muted-foreground text-sm">
				{fitProposalSentence(proposal)}
			</p>
			<Button type="submit" variant="outline" size="sm">
				{proposal.delta > 0
					? SESONG_REFUSAL_LABELS.fitAdd(weeks)
					: SESONG_REFUSAL_LABELS.fitRemove(weeks)}
			</Button>
		</Form>
	)
}

/**
 * A proposal as a sentence naming **every** block it touches, used both to offer
 * the edit and to report it afterwards. One wording for both, so what the athlete
 * agreed to and what they are told happened cannot differ by a word.
 */
function fitProposalSentence(proposal: FitProposal): string {
	const changes = proposal.changes
		.map((change) =>
			SESONG_REFUSAL_LABELS.fitChange(
				nbPhaseName(change.name),
				change.from,
				change.to,
			),
		)
		.join(', ')
	return proposal.delta > 0
		? SESONG_REFUSAL_LABELS.fitLengthens(changes)
		: SESONG_REFUSAL_LABELS.fitShortens(changes)
}

export { GeneralErrorBoundary as ErrorBoundary }
