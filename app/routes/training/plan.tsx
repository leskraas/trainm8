/**
 * The manual planning surface: the season the athlete authored, where they reshape
 * it, and where they author the progression into it.
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
 * Above all of it sits the **preset gallery** (#405, `__preset-gallery.tsx`): three
 * periodization shapes, each picked from an illustration of the load profile it lays
 * down. Applying one **copies it in** — it replaces the phase structure, says so
 * before the tap and again in the toast after it, and leaves nothing linked back.
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
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Alert, AlertDescription } from '#app/components/ui/alert.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatDate,
	formatEmphasisLabel,
	formatPct1RMBand,
	formatPct1RMs,
	formatRateField,
	formatSessionCounts,
	formatSignedPercent,
	formatVolumeTotal,
	formatWeeklyVolume,
	formatWeeklyVolumeField,
	formatWeekSpan,
	volumeFieldStep,
} from '#app/utils/format.ts'
import {
	ACCUMULATED_SPAN_LABELS,
	DISCIPLINE_LABELS,
	QUALITY_ZONE_LABELS,
	STRENGTH_GOAL_SENTENCE_LABELS,
	UNAVAILABLE_READING_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
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
	WeekVolumeOverrideClearSchema,
	WeekVolumeOverrideSetSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addPhase,
	addStrengthSegment,
	addTrack,
	addWeekPattern,
	addWeekPatternDay,
	applyPreset,
	clearWeekVolumeOverride,
	deletePlanOutline,
	movePhase,
	moveWeekPattern,
	moveWeekPatternDay,
	removePhase,
	removeSeasonAnchorSegment,
	removeStrengthSegment,
	removeTrack,
	removeWeekPattern,
	removeWeekPatternDay,
	renamePhase,
	renameWeekPattern,
	resizePhase,
	setEnduranceSegment,
	setPhaseRhythm,
	setQualitySessionMix,
	setSeasonAnchorValue,
	setStrengthSegment,
	setWeekVolumeOverride,
	type AddTrackRefusal,
	type ClearWeekVolumeOverrideResult,
	type PhaseEditRefusal,
	type RemoveTrackRefusal,
	type SeasonAnchorRefusal,
	type StrengthSegmentRefusal,
	type WeekPatternEditRefusal,
	type WeekVolumeOverrideRefusal,
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
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	RHYTHMS,
	VOLUME_CURRENCIES,
	type VolumeCurrency,
} from '#app/utils/plan-outline/derive.ts'
import { PRESET_KEYS } from '#app/utils/plan-outline/presets.ts'
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
	readStampedMixWarnings,
	stampWeekPattern,
	type StampReport,
	type StampRefusal,
} from '#app/utils/plan-outline/stamp.server.ts'
import {
	WeekPatternStampSchema,
	type StampSkipReason,
} from '#app/utils/plan-outline/stamp.ts'
import { type UnavailableReading } from '#app/utils/plan-outline/unavailable-readings.ts'
import { weekIndexOf } from '#app/utils/plan-outline/week-keys.ts'
import { PATTERN_DAY_KINDS } from '#app/utils/plan-outline/week-pattern.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	getActiveSeason,
	getAuthoredWorkouts,
	getSeasonForEvent,
	type AuthoredSeason,
	type SeasonAvailabilityWarning,
	type SeasonBandWarning,
} from '#app/utils/training.server.ts'
import {
	DISCIPLINES,
	isCardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.ts'
import { CopyWeekSection, type PendingCopy } from './__copy-week.tsx'
import {
	AddPhaseForm,
	DeletePlanSection,
	PhaseCard,
} from './__phase-editor.tsx'
import { PresetGallery } from './__preset-gallery.tsx'
import { StampSection, type PendingStamp } from './__stamp-pattern.tsx'
import {
	SeasonAnchorFormSchema,
	SeasonAnchorSection,
	type EditableAnchorTrack,
} from './__season-anchor-editor.tsx'
import {
	StrengthBlocksSection,
	StrengthSegmentFormSchema,
	type EditableStrengthTrack,
} from './__strength-segment-editor.tsx'
import { TrackRoster } from './__track-editor.tsx'
import { WeekPatternSection } from './__week-pattern-editor.tsx'

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
				message: 'Type a percentage, or leave it blank',
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
				message: 'A whole number of sessions, or blank for none',
			})
			return z.NEVER
		}
		if (count < 0 || count > MAX_QUALITY_SESSIONS_PER_WEEK) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Between 0 and ${MAX_QUALITY_SESSIONS_PER_WEEK} sessions a week`,
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
 * One week's hand-set target as the athlete types it: a number in the track's own
 * **Volume Currency**, or blank.
 *
 * **Blank reverts.** It is the athlete taking their hand off the week so the rule
 * answers again — the house "blank is a value" rule (ADR 0044 §4) applied to a
 * **Week Volume Override** — and it is a *third* meaning of blank on this page,
 * which is why the field says so where the athlete reads it.
 *
 * `0` is the other thing entirely: a week without training, which the vocabulary
 * says needs no flag of its own. So the empty string is tested **before** `Number`
 * is reached — `Number('')` is `0`, and that one coercion would collapse the revert
 * into the week off and make a week off unauthorable.
 *
 * No unit is parsed and none is offered: the currency is the track's, and hand-
 * setting a week changes value only (ADR 0043).
 */
const WeekTargetSchema = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		if (raw === '') return null
		const value = Number(raw)
		if (!Number.isFinite(value)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Type a weekly volume, or leave it blank to follow the rule',
			})
			return z.NEVER
		}
		return value
	})

/**
 * What one week's target form submits: the row it belongs to — a track and a week —
 * and the value.
 *
 * `weekKey` is only checked for *presence* here. Whether it is a Monday, and whether
 * the value is in range, are the authoring schemas' rules, and the action re-parses
 * through those so a violation reads as a sentence on the row rather than as a throw
 * from the service (ADR 0044 §8) — restating them here would put the same rule in
 * two places and let them drift.
 */
const WeekOverrideFormSchema = z.object({
	trackId: z.string().min(1),
	weekKey: z.string().min(1),
	value: WeekTargetSchema.default(''),
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
	const eventId = new URL(request.url).searchParams.get('event')
	const season = eventId
		? await getSeasonForEvent(userId, eventId)
		: await getActiveSeason(userId)
	// An Event with no plan of its own falls back to the active plan rather than
	// dead-ending; with no plan at all, the flow's first question is the honest
	// destination — not a hollow page.
	if (!season) throw redirect(eventId ? '/training/plan' : '/training/plan/new')

	// A **fixed** pattern day prescribes a Workout, and this app has no Workout
	// library: a Workout is authored inline with a session (`sessions.new.tsx`), so
	// the picker offers the athlete's own — and says so plainly when there are none
	// rather than rendering a control with nothing in it.
	const workouts = await getAuthoredWorkouts(userId)

	// Where the weeks the athlete has already stamped disagree with the mix their
	// segment authors — read here rather than derived on the client, because it is a
	// reading of the *sessions* and this page otherwise holds none (ADR 0042 §9).
	// Empty for a plan nobody has stamped yet, which is the ordinary state.
	const mixWarnings = await readStampedMixWarnings(userId, season.eventId)

	return {
		eventQuery: eventId,
		tab: tabFrom(request),
		week: chosenWeekKey(request, season.weeks),
		workouts,
		mixWarnings,
		strengthTracks: strengthTracksOf(season),
		anchorTracks: anchorTracksOf(season),
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
	errorMap: () => ({ message: 'Pick which discipline this track measures' }),
})
const CurrencyField = z.enum(VOLUME_CURRENCIES, {
	errorMap: () => ({ message: 'Pick the unit you plan this track in' }),
})
const AnchorValueField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({ message: 'A starting volume is required' }),
		})
		.positive('Your starting volume is more than zero'),
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
		.number({ errorMap: () => ({ message: 'Which day of the week?' }) })
		.pipe(PatternWeekdaySchema),
)

const ShareWeightField = z.preprocess(
	(value) => (isBlank(value) ? undefined : value),
	z.coerce
		.number({
			errorMap: () => ({
				message: 'How big is this day next to the others? e.g. 1, or 2.5',
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
					await addWeekPatternDay(userId, {
						kind: 'fixed',
						patternId: patternId.data,
						trackId: trackId.data,
						weekday: weekday.data,
						workoutId: workoutId.data,
					}),
				)
			}
			const weight = ShareWeightField.safeParse(formData.get('weight'))
			const shape = ShapeField.safeParse(formData.get('workoutId'))
			if (!weight.success) return refuse(firstIssue(weight.error))
			return reportPattern(
				await addWeekPatternDay(userId, {
					kind: 'share',
					patternId: patternId.data,
					trackId: trackId.data,
					weekday: weekday.data,
					weight: weight.data,
					workoutId: shape.success ? shape.data : null,
				}),
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
		// ── Stamping a pattern into the calendar (#412) ───────────────────────
		// The one action on this route that writes **Workout Sessions** rather than
		// the Outline, and the only one whose refusal can be a *question*: a week
		// that already holds sessions comes back asking, and the second submit is
		// this one plus a yes (ADR 0044 §6).
		case 'stamp-week-pattern':
			return stampPattern(userId, request, formData)
		// ── Copying a week onto another week (#415) ───────────────────────────
		// The other write that leaves Workout Sessions behind, and the same shape of
		// question: a target week that already holds sessions comes back asking, and
		// the second submit is this one plus a yes (ADR 0044 §6).
		case 'copy-week':
			return copyWeekOnto(userId, request, formData)
		// ── Hand-setting one week (#406) ──────────────────────────────────────
		// One week of one track, and nothing about the rest of the season: an override
		// is a leaf, so every later week is still derived from the anchor and the ramps
		// on the next read (ADR 0044 §5).
		case 'set-week-override':
			return authorWeekOverride(userId, formData)
		case 'clear-week-override': {
			const trackId = IdField.safeParse(formData.get('trackId'))
			if (!trackId.success) return refuse(TRACK_GONE)
			const reverted = await revertWeek(userId, {
				trackId: trackId.data,
				weekKey: formData.get('weekKey'),
			})
			// A body the storage schema refuses is a week no row of this plan is keyed to,
			// said here as the plan's own span rather than as a parse failure.
			if (!reverted.parsed) return refuse(WEEK_OUTSIDE_PLAN)
			// This control keeps the `override-not-found` refusal, where the blank field
			// in `authorWeekOverride` treats it as a success: pressing *this* button
			// claims there was something to revert.
			return reportWeekOverride(reverted.result)
		}
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
			if (!applied.ok) return report(applied)
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
				title: 'Copied into your plan',
				description:
					'It’s yours now — edit anything. Nothing stays linked to the shape you picked.',
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
const SHAPE_UNKNOWN = 'That is not a shape this app ships. Nothing was changed.'
const PATTERN_GONE = 'That week pattern is no longer part of this plan.'
const DAY_GONE = 'That day is no longer part of this pattern.'
/**
 * One sentence for a track that is gone, shared by a pattern day, a hand-set week
 * and a lifting block — the same absence, so it must not be worded three times and
 * drift.
 */
const TRACK_GONE = 'That training track is no longer part of this plan.'
const WEEK_OUTSIDE_PLAN = 'That week is not in your plan.'
/**
 * One sentence for a week the plan does not hold, shared by a lifting block's
 * opening and a **Season Anchor** segment's — the same fact about the same span, so
 * it must not be worded twice and drift. It names both ways out, because a week
 * outside the plan has two: pick another, or make the plan reach it.
 */
const WEEK_NOT_ONE_OF_THE_PLANS =
	'That week is not one of your plan’s weeks. Pick a week between your first and your last, or add weeks to your plan first.'
const ANCHOR_GONE = 'That anchor is no longer part of this plan.'
const WEEK_NOT_HAND_SET =
	'That week was not hand-set, so there is nothing to revert.'
const TRACK_MISSING = 'Choose which training track this day draws from.'
const WORKOUT_MISSING =
	'A fixed day prescribes a workout, so choose the session it stamps.'
const DAY_KIND_UNKNOWN =
	'A day is either a fixed session or a share of the week. Nothing was added.'
const BLOCK_GONE = 'That lifting block is no longer part of this plan.'

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
			return 'Your plan already measures that discipline. One training track each, so edit the one you have.'
		case 'last-track':
			return 'A plan measures at least one discipline. Delete the plan itself if you want none.'
	}
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
			return 'That workout is no longer one of yours. Pick another session for this day.'
		case 'workout-discipline-mismatch':
			// Not an absence: the session exists and is theirs, and it belongs to another
			// discipline. Said as the domain rule rather than as a validation failure,
			// because the rule is the reason (ADR 0041, ADR 0043 §5) — a day's volume comes
			// out of its own track, so a ride cannot spend a run week.
			return 'That session is a different discipline from this day’s track, and a day draws its volume from its own track. Pick a session on that track.'
		case 'at-the-edge':
			// One message for patterns and for days, in both directions: a pattern
			// moves through the plan's list and a day moves within its own weekday, and
			// naming either end would be the wrong word half the time.
			return 'That is already at that end of its order.'
	}
}

/**
 * One **Week Volume Override** service result, worded. A third pair beside `report`
 * and `reportPattern` for the reason those two are separate: the refusal unions are
 * separate vocabularies, and a week-scoped write can refuse over a week — which is
 * neither a phase nor a pattern. Typing the map to the union makes a refusal added
 * later a compile error here rather than a silent catch-all.
 */
function reportWeekOverride(
	result: { ok: true } | { ok: false; reason: WeekVolumeOverrideRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(weekOverrideRefusalMessage(result.reason))
}

function weekOverrideRefusalMessage(reason: WeekVolumeOverrideRefusal): string {
	switch (reason) {
		case 'track-not-found':
			// The same absence a pattern day's `track-gone` names, so the same sentence:
			// a row that is not the athlete's reads as gone rather than as forbidden.
			return TRACK_GONE
		case 'week-outside-plan':
			// Not an invalid week — a week of some other plan, or of none. Said as the
			// plan's own span, because resizing a phase is what would bring it in.
			return WEEK_OUTSIDE_PLAN
		case 'override-not-found':
			// Reachable from a stale reading, whose revert control was rendered before a
			// second tab reverted the week. Naming the state is the answer; there is
			// nothing to undo and nothing was changed.
			return WEEK_NOT_HAND_SET
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
			return 'Your season keeps its first anchor — every week up to your next re-anchor is derived from it. Change its value instead, or remove a later re-anchor.'
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
 * Revert one week to the rule: parse against the service's own schema, then clear.
 *
 * One path from "no value for this week" to the row being gone, because two controls
 * ask for it — the **blank field** and the explicit **revert button** — and a second
 * copy of the pair could drift in what it parses or what it calls.
 *
 * The parse belongs at this boundary because the service *throws* on a week key that
 * is not a Monday, and only a hand-made body can carry one (ADR 0044 §8). What each
 * caller does with a rejected parse differs — one words it on the row it was typed
 * into, the other at the top of the reading — so the issues come back rather than a
 * response, and the same is true of `override-not-found`: the two controls disagree
 * about it deliberately, so this hands the service's result over untouched.
 */
async function revertWeek(
	userId: string,
	fields: { trackId: string; weekKey: unknown },
): Promise<
	| { parsed: false; issues: string[] }
	| { parsed: true; result: ClearWeekVolumeOverrideResult }
> {
	const revert = WeekVolumeOverrideClearSchema.safeParse(fields)
	if (!revert.success) {
		return {
			parsed: false,
			issues: revert.error.issues.map((issue) => issue.message),
		}
	}
	return {
		parsed: true,
		result: await clearWeekVolumeOverride(userId, revert.data),
	}
}

/**
 * Stamp a **Week Pattern** into the weeks the athlete ticked (#412).
 *
 * The only write on this route that leaves **Workout Sessions** behind rather than
 * Outline rows, and the only one whose refusal can be a *question*. A week that
 * already holds sessions comes back as `weeks-already-filled` carrying the counts:
 * that is not an error and is deliberately **not** worded as one — nothing was
 * written, and the surface renders the counts with a confirm button that replays
 * this exact submission plus `replace`.
 *
 * A success redirects rather than falling through to the loader, for the reason
 * applying a preset does: something happened that the page cannot say by itself.
 * The athlete's calendar just changed, and the one thing they need told in words is
 * that those sessions are now ordinary sessions with nothing linked back.
 */
async function stampPattern(
	userId: string,
	request: Request,
	formData: FormData,
) {
	const submitted = WeekPatternStampSchema.safeParse({
		patternId: formData.get('patternId'),
		weekKeys: formData.getAll('weekKeys').map(String),
		replace: checked(formData, 'replace'),
	})
	if (!submitted.success) return refuse(firstIssue(submitted.error))

	const stamped = await stampWeekPattern(userId, submitted.data)
	if (!stamped.ok) {
		if (stamped.reason !== 'weeks-already-filled') {
			return refuse(stampRefusalMessage(stamped.reason))
		}
		// No `error` key: this is a question, not a refusal to word at the top of the
		// reading. The panel that renders it is the answer.
		return data(
			{
				stamp: {
					patternId: submitted.data.patternId,
					weekKeys: submitted.data.weekKeys,
					conflicts: stamped.conflicts,
				},
			},
			{ status: 400 },
		)
	}

	const url = new URL(request.url)
	return redirectWithToast(`${url.pathname}${url.search}`, {
		type: 'success',
		title: 'On your calendar',
		description: stampSentence(stamped.report),
	})
}

/**
 * What a stamp did, in one sentence — counts first, then the two things the athlete
 * has to know: the sessions are theirs to edit, and anything the stamp could not
 * write is named rather than left as a silent gap.
 */
function stampSentence(report: StampReport): string {
	const sessions = `${report.sessions} ${report.sessions === 1 ? 'session' : 'sessions'}`
	const weeks = `${report.weeks} ${report.weeks === 1 ? 'week' : 'weeks'}`
	const replaced =
		report.replaced > 0 ? ` ${report.replaced} were replaced.` : ''
	const skipped = skippedSentence(report.skipped)
	return `${sessions} across ${weeks}. Edit any of them — nothing stays linked to the pattern.${replaced}${skipped}`
}

/**
 * The days that produced no session, named by reason.
 *
 * Each reason is an **Unavailable Metric with its cause**, never a silent omission
 * and never a fabricated session: the athlete is told which day the app could not
 * write and why, so they can fix it or leave it (ADR 0008).
 */
function skippedSentence(skipped: StampReport['skipped']): string {
	const reasons = new Set(skipped.map((skip) => skip.reason))
	const clauses = [...reasons].map((reason) => STAMP_SKIP_COPY[reason])
	return clauses.length === 0 ? '' : ` ${clauses.join(' ')}`
}

const STAMP_SKIP_COPY: Record<StampSkipReason, string> = {
	'no-prescription':
		'A fixed day whose workout is gone was left out — pick a session for it.',
	'volume-unavailable':
		'A share day was left out where the week has no derived target for its track.',
	'no-volume-left':
		'A share day was left out where your fixed sessions already spend the week. Those stay exactly as you wrote them.',
	'not-prescribable':
		'A share day was left out because its track’s unit is not something a session can prescribe — give the day a shape and it will stamp.',
}

function stampRefusalMessage(
	reason: Exclude<StampRefusal, 'weeks-already-filled'>,
): string {
	switch (reason) {
		case 'pattern-gone':
			return PATTERN_GONE
		case 'pattern-empty':
			return 'That pattern has no days in it yet, so there is nothing to stamp.'
		case 'week-outside-plan':
			return WEEK_OUTSIDE_PLAN
		case 'nothing-to-stamp':
			// Not an absence and not a bug: every day of the pattern hit one of the
			// four reasons above, so the honest answer names that rather than
			// reporting a stamp of nothing as a success.
			return 'None of this pattern’s days could be written into those weeks. Nothing was changed.'
	}
}

/**
 * Copy one week of this plan onto another week of it (#415).
 *
 * The stamp's sibling, and deliberately the same shape: a target week that already
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
		title: 'Week copied',
		description: copySentence(copied.report),
	})
}

/**
 * What a copy did, in one sentence — the counts, then the two things the athlete has
 * to know: the weeks are independent, and the copy was not scaled to the week it
 * landed on.
 */
function copySentence(report: CopyWeekReport): string {
	const sessions = `${report.sessions} ${report.sessions === 1 ? 'session' : 'sessions'}`
	const replaced =
		report.replaced > 0
			? ` ${report.replaced} ${report.replaced === 1 ? 'session was' : 'sessions were'} replaced.`
			: ''
	const skipped = copySkippedSentence(report.skipped)
	return `${sessions} from week ${report.sourceWeekInPlan} onto week ${report.targetWeekInPlan}, exactly as you wrote them. Edit either week — the other does not move.${replaced}${skipped}`
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
	'no-prescription':
		'A session with no workout behind it was left out — there was nothing to copy.',
}

function copyRefusalMessage(
	reason: Exclude<CopyWeekRefusal, 'target-week-filled'>,
): string {
	switch (reason) {
		case 'plan-gone':
			return OUTLINE_GONE
		case 'week-outside-plan':
			return WEEK_OUTSIDE_PLAN
		case 'same-week':
			return 'That is the same week twice. Pick a different week to copy it onto.'
		case 'source-week-empty':
			return 'That week has no sessions in it, so there is nothing to copy. Pick a week you have already filled in.'
		case 'nothing-to-copy':
			// The week holds sessions, but every one of them is a recording with no
			// prescription behind it. Named rather than reported as a copy of nothing.
			return 'That week only holds recorded activities, which carry no workout to copy. Nothing was changed.'
	}
}

/**
 * Hand-set one week's volume target, or revert it — the write behind the Weeks
 * reading's per-week field (#406).
 *
 * **Blank reverts**, so both live in one function: the field is the whole control,
 * and "clear this box" has to mean something. It means the athlete taking their hand
 * off the week, distinct from the `0` that means a week without training — and the
 * two are separated *before* `Number` is reached, in `WeekTargetSchema`.
 *
 * A blank aimed at a week that already follows the rule is a **success**: the state
 * the athlete asked for holds, so there is nothing to act on and nothing to say. The
 * revert *control* keeps that refusal, because pressing it claims there was something
 * to revert.
 *
 * The reply is keyed by the intent **and the row** — `trackId` plus `weekKey` — for
 * the reason `authorSegmentRates` keys by `segmentId`: this page renders one of these
 * forms per week per track, and a reply read by the wrong one would blank a week it
 * says nothing about. Service refusals travel as a sentence at the top of the reading
 * instead, like every other one-button edit here; only the field's own problems are
 * the field's to report.
 */
async function authorWeekOverride(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: WeekOverrideFormSchema })
	// Off the body rather than off the parse, so a rejected submission still reports
	// on the row it was typed into.
	const row = {
		intent: 'set-week-override' as const,
		trackId: String(formData.get('trackId') ?? ''),
		weekKey: String(formData.get('weekKey') ?? ''),
	}
	if (submission.status !== 'success') {
		return data({ ...row, result: submission.reply() }, { status: 400 })
	}
	const { trackId, weekKey, value } = submission.value
	// A rejection the *field* reports, on the row it was typed into — written once for
	// the two schemas re-parsed below, the revert's and the target's, because both
	// land on the same week's field.
	const fieldErrors = (issues: string[]) =>
		data(
			{ ...row, result: submission.reply({ formErrors: issues }) },
			{ status: 400 },
		)

	if (value == null) {
		const reverted = await revertWeek(userId, { trackId, weekKey })
		if (!reverted.parsed) return fieldErrors(reverted.issues)
		const cleared = reverted.result
		// A blank aimed at a week that already follows the rule is a **success**: the
		// state the athlete asked for holds, so there is nothing to act on and nothing
		// to say. The revert *control* keeps that refusal — see `clear-week-override`.
		if (!cleared.ok && cleared.reason !== 'override-not-found') {
			return refuse(weekOverrideRefusalMessage(cleared.reason))
		}
		return { ...row, result: submission.reply() }
	}

	// The service's own gate, applied here first for the reason `authorSegmentRates`
	// gives: a target the storage schema refuses — a negative, an infinity, a week key
	// that is not a Monday — reads as a sentence on this row rather than as a throw
	// from the service that re-parses it (ADR 0044 §8).
	const authored = WeekVolumeOverrideSetSchema.safeParse({
		trackId,
		weekKey,
		value,
	})
	if (!authored.success) {
		return fieldErrors(authored.error.issues.map((issue) => issue.message))
	}

	const saved = await setWeekVolumeOverride(userId, authored.data)
	if (!saved.ok) return refuse(weekOverrideRefusalMessage(saved.reason))

	return { ...row, result: submission.reply() }
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
					formErrors: ['That block is no longer part of your plan.'],
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
					formErrors: ['That block is no longer part of your plan.'],
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
			return 'Lifting blocks belong to a strength track, and that one is an endurance track. Nothing was changed.'
		case 'segment-not-found':
			return BLOCK_GONE
		case 'start-week-outside-the-plan':
			return WEEK_NOT_ONE_OF_THE_PLANS
		case 'segment-runs-past-the-plan':
			return 'That block would run past the last week of your plan. Make it shorter, open it earlier, or add weeks to your plan.'
		case 'week-already-opens-a-segment':
			return 'Another lifting block already opens that week. Open this one on a different week.'
		case 'segments-overlap':
			return 'That block would overlap another lifting block. Blocks sit one after another, and the weeks between two of them are no lifting.'
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
		eventQuery,
		week,
		workouts,
		strengthTracks,
		mixWarnings,
		anchorTracks,
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
	// A stamp the service came back asking about. Not an `error`: nothing was
	// written and there is a question on the page rather than a refusal above it.
	const pendingStamp: PendingStamp | null =
		actionData && 'stamp' in actionData ? actionData.stamp : null
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
		if (eventQuery) params.set('event', eventQuery)
		if (name !== 'blocks') params.set('tab', name)
		if (weekQuery) params.set('week', weekQuery)
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
				{season.spanGroups.length > 0 ? (
					<SeasonSpanHeadline groups={season.spanGroups} weeks={season.weeks} />
				) : null}
				<p className="text-sm">{fitSentence(season.fit)}</p>
				<TrackRoster
					outlineId={season.outlineId}
					tracks={season.tracks}
					error={trackError}
				/>
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
				<BlocksReading
					season={season}
					error={error}
					actionData={actionData}
					strengthTracks={strengthTracks}
					anchorTracks={anchorTracks}
				/>
			) : (
				<WeeksReading
					season={season}
					error={error}
					chosenWeek={previewWeek}
					workouts={workouts}
					eventQuery={eventQuery}
					actionData={actionData}
					pendingStamp={pendingStamp}
					pendingCopy={pendingCopy}
					mixWarnings={mixWarnings}
				/>
			)}
		</main>
	)
}

type SeasonData = Route.ComponentProps['loaderData']['season']

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
		<ul className="space-y-4">
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
									{group.disciplines
										.map((discipline) => DISCIPLINE_LABELS[discipline])
										.join(' · ')}
								</span>
								{group.marker === 'derived' ? (
									// The marker is binary and shown on the figure it qualifies,
									// never as a footnote (ADR 0045 §9).
									<Badge variant="secondary">Derived</Badge>
								) : null}
							</p>
						) : null}
						<p className="text-2xl font-semibold tabular-nums">
							{formatWeeklyVolume(group.span.anchor, group.currency)} →{' '}
							{formatWeeklyVolume(group.span.peak, group.currency)}
						</p>
						<p className="text-muted-foreground text-sm">
							{group.marker === 'derived' &&
							accumulatesAcrossDisciplines(group.currency)
								? `${ACCUMULATED_SPAN_LABELS[group.currency]} `
								: null}
							Where you start to your peak loading week
							{peakWeek ? `, week ${peakWeek.weekInPlan}` : null} · read from
							your {several ? 'anchors' : 'anchor'} and your ramps, never added
							up from sessions
							{group.total == null
								? null
								: ` · ${formatVolumeTotal(group.total, group.currency)} across the season`}
						</p>
					</li>
				)
			})}
		</ul>
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
		<Alert className="mb-4">
			<AlertDescription className="space-y-2">
				<ul className="space-y-1">
					{warnings.map((warning, position) => {
						const phase = phases[warning.phaseIndex]?.name ?? 'A block'
						const rate =
							warning.subject === 'ramp'
								? `ramps ${formatSignedPercent(warning.authored)} a loading week`
								: `steps ${formatSignedPercent(warning.authored)} at its opening`
						return (
							// The position disambiguates: two tracks can warn about the same
							// phase and the same subject, once each.
							<li key={`${warning.phaseIndex}-${warning.subject}-${position}`}>
								{warning.lifting ? (
									<>
										<span className="font-medium">
											{DISCIPLINE_LABELS[warning.discipline]}
										</span>{' '}
										{rate}, in the block opening in {phase}.
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
					The convention is {formatSignedPercent(RAMP_GUARD_MAX)} — per loading
					week for a ramp, and in one go for a step at an opening. Bigger than
					that is unusual rather than unsafe: no volume rule has been shown to
					prevent injury, so this is a note and not a limit. Your numbers are
					saved exactly as you authored them.
					{anyStrength
						? ' A lifting block is dated rather than tied to a phase, so the phase named beside one is only where its opening week falls.'
						: null}
				</p>
			</AlertDescription>
		</Alert>
	)
}

/**
 * The **availability fit notice**, worded (ADR 0042 §9, ADR 0045 §8, ADR 0047 §4).
 *
 * Advisory, exactly like `RampGuardNotice` above and for the same reasons. Three
 * things the copy has to do. It names the **comparison** it made — sessions against
 * trainable weekdays, days against days — because that is the only fit check
 * **Training Availability** can support: it stores weekdays and a clock time and no
 * capacity at all, so this can never become an hours comparison. It makes **no injury
 * or safety claim** of any kind (ADR 0040 §13): more session days than trainable days
 * is a scheduling fact, and nothing is known about what it does to a body. And it says
 * the plan is stored as authored, because this notice cannot block a save and does not.
 *
 * **Two things changed with ADR 0047 §4** and the copy changed with them. The check
 * is now the *combined* one — quality sessions **plus** **Strength Frequency** —
 * because a session is a session whichever track prescribes it, and a hybrid athlete
 * shown an endurance-only notice beside a combined one would read two overlapping
 * claims about one week. And the locator is a **week span** rather than a phase name,
 * because a lifting block floats free of the phases, so no phase names the stretch a
 * combined warning is about. Both counts are named where both exist; a zero half is
 * dropped rather than printed, since "0 lifting sessions" is a sentence about nothing.
 *
 * The whole reading comes off `season.availabilityWarnings` — derived once at the
 * read boundary, never in here. Silence is the answer when the athlete never set
 * their availability: the reading is empty for a null count, so there is no list to
 * render rather than a guess to word.
 */
function AvailabilityFitNotice({
	warnings,
}: {
	warnings: SeasonAvailabilityWarning[]
}) {
	return (
		<Alert className="mb-4">
			<AlertDescription className="space-y-2">
				<ul className="space-y-1">
					{warnings.map((warning, position) => {
						const single = warning.fromWeekInPlan === warning.toWeekInPlan
						return (
							<li key={`${warning.fromWeekInPlan}-${position}`}>
								<span className="font-medium">
									{formatWeekSpan(warning.fromWeekInPlan, warning.toWeekInPlan)}
								</span>{' '}
								{single ? 'asks' : 'ask'} for {formatSessionCounts(warning)} a
								week, and you have {warning.trainableWeekdays} trainable{' '}
								{warning.trainableWeekdays === 1 ? 'weekday' : 'weekdays'}.
							</li>
						)
					})}
				</ul>
				<p>
					That is days against days — the only comparison your training
					availability can make, since it records which weekdays you train and
					no capacity at all. It may be exactly what you meant: two sessions can
					share a day, and the days you listed are a setting rather than a fact
					about your week. Your mix is saved exactly as you authored it.
				</p>
			</AlertDescription>
		</Alert>
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
}: {
	warnings: SeasonBandWarning[]
	timezone: string
}) {
	return (
		<Alert className="mb-4">
			<AlertDescription className="space-y-2">
				<ul className="space-y-1">
					{warnings.map((warning) => (
						<li key={warning.sessionId}>
							<Link
								to={`/training/sessions/${warning.sessionId}`}
								className="font-medium hover:underline"
							>
								Week {warning.weekInPlan},{' '}
								{formatDate(warning.scheduledAt, timezone)}
							</Link>{' '}
							is authored at {formatPct1RMs(warning.outsidePct1RMs)}, outside
							the {formatPct1RMBand(warning.band)} that{' '}
							{STRENGTH_GOAL_SENTENCE_LABELS[warning.goal]} works in.
						</li>
					))}
				</ul>
				<p>
					That band is <strong>derived</strong> from the Strength Goal you
					authored on the block, never typed beside it — change the goal and the
					band moves with it, or leave the session as it is. This is a note and
					not a limit: your blocks and your sessions are saved exactly as you
					authored them.
				</p>
			</AlertDescription>
		</Alert>
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
 */
function UnavailableReadingsNotice({
	readings,
}: {
	readings: UnavailableReading[]
}) {
	return (
		<section aria-labelledby="unavailable-readings" className="space-y-2">
			<h2 id="unavailable-readings" className="text-lg font-semibold">
				What this plan cannot tell you
			</h2>
			<ul className="text-muted-foreground space-y-2 text-sm">
				{readings.map((reading) => (
					<li key={reading}>{UNAVAILABLE_READING_LABELS[reading]}</li>
				))}
			</ul>
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
}: {
	season: SeasonData
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
	// Read off the season rather than derived here: the fit check is the **combined**
	// one across both tracks (ADR 0047 §4), and a component that recomputed the
	// endurance half of it would put two overlapping claims about one week on the
	// same page.
	const availability = season.availabilityWarnings

	return (
		<div className="space-y-8">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}
			{warnings.length > 0 ? (
				<RampGuardNotice
					warnings={warnings}
					phases={season.phases}
					anyStrength={warnings.some((warning) => warning.lifting)}
				/>
			) : null}
			{availability.length > 0 ? (
				<AvailabilityFitNotice warnings={availability} />
			) : null}
			{season.bandWarnings.length > 0 ? (
				<BandFitNotice
					warnings={season.bandWarnings}
					timezone={season.timezone}
				/>
			) : null}

			{/* The gallery opens the reading, so an athlete who does not want to build a
			    season block by block is offered a shape before being handed the
			    controls — and so it sits directly under the header's `fitSentence`,
			    which is where "your plan ends N weeks before your event" is said.
			    Applying re-derives that sentence rather than stretching anything, and
			    there is deliberately no second copy of it down here. */}
			<PresetGallery outlineId={season.outlineId} />

			{/* The anchors sit above the phase cards because the anchor is the level
			    their ramps multiply — reading the number first and the progression
			    second is the order the formula has (ADR 0040 §3) — and because
			    re-anchoring is a statement about the *season*, not about a phase: it
			    takes effect from a week the athlete picks and floats free of where the
			    blocks happen to fall (ADR 0040 §5). */}
			<SeasonAnchorSection
				tracks={anchorTracks}
				weeks={season.weeks}
				timezone={season.timezone}
				actionData={actionData}
			/>

			<ol aria-label="Phases" className="space-y-3">
				{season.phases.map((phase, position) => (
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
						>
							{enduranceTracks.map((track) => {
								const segment = track.segments.find(
									(candidate) => candidate.phaseIndex === position,
								)
								// Named only where there is more than one track to tell apart;
								// one runner reads one form, unlabelled.
								const trackLabel =
									enduranceTracks.length > 1
										? DISCIPLINE_LABELS[track.discipline]
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
											// The step applies where a boundary is *crossed*, and the
											// season's opening block crosses none (ADR 0040 §3).
											opensTheSeason={position === 0}
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
				))}
			</ol>

			{/* The lifting blocks sit *beside* the phase list rather than inside it,
			    because a dated block has no phase card to belong to (ADR 0047 §6) —
			    it is laid out along the plan's own weeks instead. */}
			<StrengthBlocksSection
				tracks={strengthTracks}
				weeks={season.weeks}
				timezone={season.timezone}
				actionData={actionData}
			/>

			<AddPhaseForm outlineId={season.outlineId} phases={season.phases} />
			<DeletePlanSection
				outlineId={season.outlineId}
				eventName={season.eventName}
			/>
		</div>
	)
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
	opensTheSeason,
	trackLabel,
	actionData,
}: {
	segment: SegmentData
	phase: SeasonPhaseData
	opensTheSeason: boolean
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
				<p className="text-sm font-medium">{trackLabel} progression</p>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2">
				<RateField
					meta={fields.ramp}
					label="Volume ramp, % a loading week"
					meaning={
						segment.ramp == null
							? 'Blank — volume holds level through this block.'
							: `${formatSignedPercent(segment.ramp)} on every loading week. Recovery weeks and tapers do not step.`
					}
				/>

				{opensTheSeason ? (
					// The season's first block opens on the Season Anchor itself, so there
					// is nothing for a step to step from. Said out loud rather than shown as
					// a field that would do nothing (ADR 0044 §8's rule against dead
					// controls).
					<>
						<CarriedRate
							meta={fields.boundaryStep}
							fraction={segment.boundaryStep}
						/>
						<p className="text-muted-foreground self-end text-sm">
							Your season opens here, so there is no boundary to step at.
						</p>
					</>
				) : (
					<RateField
						meta={fields.boundaryStep}
						label="Boundary step at this block’s opening, %"
						meaning={
							segment.boundaryStep == null
								? 'Blank — this block opens continuous with the week before it.'
								: `${formatSignedPercent(segment.boundaryStep)} once, at the opening. A deliberate drop into an intensity block belongs here rather than in the ramp.`
						}
					/>
				)}

				{hasRecoveryWeeks ? (
					<RateField
						meta={fields.recoveryCut}
						label="Recovery week cut, %"
						nonNegative
						meaning={
							segment.recoveryCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_RECOVERY_CUT)} off your last loading week. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.recoveryCut)} off your last loading week.`
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
						label="Taper cut by the event, %"
						nonNegative
						meaning={`${
							segment.taperCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_TAPER_CUT)} by your event. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.taperCut)} by your event.`
						} The taper descends across the block rather than dropping in its last week.`}
					/>
				) : (
					<CarriedRate meta={fields.taperCut} fraction={segment.taperCut} />
				)}
			</div>

			<ErrorList errors={form.errors as string[] | undefined} />

			{/* Full-width on phones, inline from `sm` (ui-conventions §1.8), and no
			    `size` override: a route file does not set control heights (§2.1). */}
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				Save {trackLabel ? `${trackLabel} ` : ''}progression
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
	const emphasis = formatEmphasisLabel(emphasisTerms(segment.mix))
	const count = qualitySessionCount(segment.mix)

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			<input type="hidden" name="intent" value="set-quality-mix" />
			<input type="hidden" name="segmentId" value={segment.segmentId} />
			<p className="text-sm font-medium">
				{trackLabel ? `${trackLabel} quality ` : 'Quality '}session mix
			</p>
			<p className="text-muted-foreground text-sm">
				Sessions a week in each quality zone. <strong>Blank or 0</strong> leaves
				a zone out of the mix — all three blank is a block with no quality
				sessions, which is a plan and not a gap. This blank is not the
				ramp&rsquo;s blank above: there is no convention for a mix to fall back
				on.
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
								children: `Zone ${zone} ${QUALITY_ZONE_LABELS[zone]}, sessions a week`,
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
					<dt className="text-muted-foreground">Intensity emphasis, derived</dt>
					<dd className="font-medium">{emphasis}</dd>
				</div>
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground">
						Quality sessions a week, derived
					</dt>
					<dd className="font-medium tabular-nums">{count}</dd>
				</div>
			</dl>
			<p className="text-muted-foreground text-sm">
				Both are read off the mix you saved, which is why there is nothing to
				type here: a block is named for the work it holds, so the name follows
				the mix rather than the other way round. It keeps reading the mix once
				the weeks fill with real sessions, so this block does not change
				character as the season goes on.
			</p>

			<ErrorList errors={form.errors as string[] | undefined} />

			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				Save {trackLabel ? `${trackLabel} ` : ''}quality mix
			</Button>
		</Form>
	)
}

type WeekData = SeasonData['weeks'][number]
type WeekTargetData = WeekData['targets'][number]

/**
 * One week's target for one track, hand-settable — the **Week Volume Override**
 * control (#406).
 *
 * Three things this component has to keep straight, and they are the whole of it.
 *
 * - **The box holds the athlete's number, or nothing.** A week nobody hand-set reads
 *   as **blank**, with the rule's own figure stated beside it as text. Pre-filling the
 *   derived number would make the rule look like an edit to the athlete's plan, which
 *   is the mistake ADR 0044 §4 rules out for the recovery and taper cuts and rules out
 *   here for the same reason.
 * - **A hand-set week is marked, in words.** A `Badge` reading *hand-set* — the
 *   vocabulary's own word — plus a muted sentence naming what the rule would give, so
 *   the revert is legible before it is pressed rather than a leap.
 * - **The revert is one action**, its own single-button form, and it appears only on a
 *   week that has something to revert.
 *
 * A track whose week is Unavailable is still hand-settable: it is a real track with a
 * real currency, and the athlete knowing what they want for a week the rule cannot
 * price is exactly the case an override exists for. Only the derived sentence goes
 * quiet, because there is no number to name.
 *
 * On a strength track the figure also carries the week's place in the **lifting
 * block** holding it — a `· Deload` on the block's own tail, and the gap between
 * blocks read as "No lifting" rather than as the `0` the rule gives (ADR 0047 §6).
 * Both come off the same target that priced the week, so the marker and the number
 * beside it cannot disagree.
 */
function WeekTargetField({
	week,
	target,
	actionData,
}: {
	week: WeekData
	target: WeekTargetData
	actionData: SegmentActionData
}) {
	const discipline = DISCIPLINE_LABELS[target.discipline]
	const unit = VOLUME_CURRENCY_UNITS[target.currency]
	// The row named once, for the accessible names below: there is one of these forms
	// per week *per track*, so "Target" or "Save" alone would repeat dozens of times
	// in a row and name nothing.
	const row = `week ${week.weekInPlan} ${discipline}`
	// A gap between lifting blocks reads as the sentence rather than as the `0` the
	// rule gives — but only while the figure *is* the rule's. Hand-set a gap week and
	// the athlete has said there is lifting in it, so their number is what shows.
	const gap = target.strengthRole === 'gap' && !target.overridden
	const [form, fields] = useForm({
		id: `week-target-${target.trackId}-${week.weekKey}`,
		// Keyed by the intent **and the row** — see `authorWeekOverride`. A reply read
		// by the wrong week would blank a box the athlete never touched.
		lastResult:
			actionData &&
			'weekKey' in actionData &&
			actionData.intent === 'set-week-override' &&
			actionData.trackId === target.trackId &&
			actionData.weekKey === week.weekKey
				? actionData.result
				: undefined,
		defaultValue: {
			// The athlete's own number where they hand-set one, and **blank** otherwise.
			// `target.value` is not what goes in the box: on a derived week that is the
			// rule's number, and the rule belongs in the prose beside the field.
			value: formatWeeklyVolumeField(
				target.overridden ? target.value : null,
				target.currency,
			),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: WeekOverrideFormSchema })
		},
	})

	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				{/* The label carries what the box takes — the track and its unit — and the
				    input's own `aria-label` carries the week as well, so every one of these
				    fields is distinguishable in a list of dozens. The visible words are the
				    tail of the accessible name rather than different words. */}
				<label htmlFor={fields.value.id} className="font-medium">
					{discipline}, {unit}
				</label>
				<span className="tabular-nums">
					{target.value == null ? (
						<span className="text-muted-foreground">Unavailable</span>
					) : gap ? (
						// A gap week on a strength track is the athlete's own "no lifting
						// these weeks", so the rule's `0` reads as that sentence and never as
						// a dash, a blank or an Unavailable — it is something they said rather
						// than something the app failed to work out. Read off the target
						// rather than worked out here, so this row and the figure on it come
						// from one derivation (ADR 0047 §6).
						<span className="font-normal">No lifting</span>
					) : (
						<>
							{formatWeeklyVolume(target.value, target.currency)}
							{/* The block's own tail, named on the row where the cut shows up.
							    Beside the week's `WeekRole` rather than instead of it: a week
							    can carry one of each, and they are roles in two different
							    things (ADR 0047 §6). */}
							{target.strengthRole === 'deload' ? (
								<span className="text-muted-foreground font-normal">
									{' '}
									· Deload
								</span>
							) : null}
						</>
					)}
				</span>
				{target.overridden ? <Badge variant="secondary">Hand-set</Badge> : null}
			</div>

			<Form
				method="POST"
				{...getFormProps(form)}
				className="flex flex-wrap items-start gap-2"
			>
				{/* Named, because this page's action dispatches on `intent`; the track and
				    the week are the row this write addresses. */}
				<input type="hidden" name="intent" value="set-week-override" />
				<input type="hidden" name="trackId" value={target.trackId} />
				<input type="hidden" name="weekKey" value={week.weekKey} />
				<Input
					{...getInputProps(fields.value, { type: 'number' })}
					// `0` is a week without training and needs no flag of its own, so the
					// floor is zero rather than anything above it.
					min={0}
					step={volumeFieldStep(target.currency)}
					inputMode="decimal"
					aria-label={`Week ${week.weekInPlan} ${discipline}, ${unit}`}
					className="w-28"
				/>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					aria-label={`Save ${row}`}
				>
					Save
				</Button>
			</Form>

			<ErrorList
				id={fields.value.errorId}
				errors={fields.value.errors as string[] | undefined}
			/>
			<ErrorList errors={form.errors as string[] | undefined} />

			{target.overridden ? (
				<div className="flex flex-wrap items-center gap-2">
					<p className="text-muted-foreground text-sm">
						{target.derivedValue == null
							? 'The rule has no number for this week, so reverting would leave it Unavailable.'
							: `The rule gives ${formatWeeklyVolume(target.derivedValue, target.currency)}.`}
					</p>
					{/* Its own form, because a submit carries one name/value pair and the
					    revert is a different act from the save above — one action, per the
					    vocabulary, and no value at all: reverting deletes the athlete's
					    statement rather than storing what the rule happens to give. */}
					<Form method="POST">
						<input type="hidden" name="intent" value="clear-week-override" />
						<input type="hidden" name="trackId" value={target.trackId} />
						<input type="hidden" name="weekKey" value={week.weekKey} />
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							aria-label={`Revert to the rule for ${row}`}
						>
							Revert to the rule
						</Button>
					</Form>
				</div>
			) : null}
		</div>
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
	eventQuery,
	actionData,
	pendingStamp,
	pendingCopy,
	mixWarnings,
}: {
	season: SeasonData
	/** A refused pattern edit, said once above the patterns it was aimed at. */
	error?: string
	/** The week the **Pattern Preview** is read against (`?week=`). */
	chosenWeek: SeasonData['weeks'][number] | null
	workouts: Route.ComponentProps['loaderData']['workouts']
	eventQuery: string | null
	/** A rejected hand-set week's reply, read by that week's field and no other. */
	actionData: SegmentActionData
	/** A stamp waiting on the athlete's yes, with what it would replace. */
	pendingStamp: PendingStamp | null
	/** A week copy waiting on the athlete's yes, with what it would replace. */
	pendingCopy: PendingCopy | null
	mixWarnings: Route.ComponentProps['loaderData']['mixWarnings']
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
			<div className="space-y-3">
				{/* Said once for the whole list rather than under every box, the way the
				    preset gallery states its convention once: **blank is a third meaning of
				    blank on this page**, and the one number an athlete is most likely to
				    doubt — `0` — is spelled out beside it. */}
				<p className="text-muted-foreground text-sm">
					Type a number to hand-set that week. It is that week&rsquo;s final
					target — no recovery or taper cut on top — and it changes that week
					only: the rest of your season still follows your anchor and your
					ramps. Leave the box <strong>blank</strong> to hand the week back to
					the rule. <strong>0</strong> is a week without training, which is a
					plan and not a gap.
				</p>
				<ul aria-label="Training weeks" className="divide-border divide-y">
					{season.weeks.map((week) => (
						<li key={week.weekKey} className="space-y-2 py-3">
							<div className="text-sm">
								<span className="font-medium">Week {week.weekInPlan}</span>{' '}
								<span className="text-muted-foreground">
									· {formatDate(week.startsAt, season.timezone)} ·{' '}
									{season.phases[week.phaseIndex]?.name} ·{' '}
									{WEEK_ROLE_LABELS[week.role]}
								</span>
							</div>
							{/* One field per track, stacked at every width: this row now carries
							    an input apiece, and a phone has no second column to put them in
							    (ADR 0028). */}
							<div className="space-y-3">
								{week.targets.map((target) => (
									<WeekTargetField
										// Re-keyed on the stored value, for the reason
										// `__phase-editor.tsx` re-keys a phase's name field: a save that
										// lands changes the field's default, and an uncontrolled input
										// would keep showing the old one. Remounting shows what the plan
										// now says — and a *rejected* save leaves the key alone, so what
										// the athlete typed survives to be corrected.
										key={`${target.trackId}-${target.overridden ? target.value : ''}`}
										week={week}
										target={target}
										actionData={actionData}
									/>
								))}
							</div>
						</li>
					))}
				</ul>
				{/* Each track's reason sits with the list it is about, which is why the
				    two share a tighter group inside the section ladder.

				    Since ADR 0047 §1 **both** walks price their weeks — a strength track
				    derives its target from the same anchor and ramp an endurance one does
				    — so the only way a whole column is `null` is that no Season Anchor
				    covers the plan. The old reason, that a strength track's weekly sets
				    were not derived yet, is false and gone with it. */}
				{unpricedTracks.map((track) => (
					<p key={track.discipline} className="text-muted-foreground text-sm">
						{DISCIPLINE_LABELS[track.discipline]} weeks read Unavailable — no
						Season Anchor covers this plan yet.
					</p>
				))}
				{anyDeload ? (
					<p className="text-muted-foreground text-sm">
						<strong>Deload</strong> is a lifting block&rsquo;s own tail: it
						comes from the weeks you gave that block, and your phases&rsquo;
						rhythm does not reach it. So it can land on a different week from a
						recovery week in your plan — that is what a dated block is for, not
						the two disagreeing.
					</p>
				) : null}
			</div>

			{season.unavailableReadings.length > 0 ? (
				<UnavailableReadingsNotice readings={season.unavailableReadings} />
			) : null}

			{/* The pattern, read against one of the weeks above. It is handed the
			    week's *derived* targets — the same rows the list just rendered — so a
			    preview and the week it claims to be about cannot disagree. */}
			<WeekPatternSection
				outlineId={season.outlineId}
				patterns={season.patterns}
				tracks={season.tracks}
				weeks={season.weeks}
				week={chosenWeek}
				workouts={workouts}
				eventQuery={eventQuery}
			/>

			{/* The stamp sits under the pattern it writes, because reading the pattern
			    against a week is what an athlete does immediately before deciding which
			    weeks to put it in. It is handed the plan's own weeks, so nothing here
			    can offer a week the plan does not have. */}
			<StampSection
				patterns={season.patterns}
				weeks={season.weeks}
				timezone={season.timezone}
				pending={pendingStamp}
				mixNotices={mixWarnings}
			/>

			{/* The other way to fill a week, last because it is the one that needs a
			    week already filled in. ADR 0044 §6 called it out as the action a Week
			    Pattern was never the free alternative to, and the two read better
			    together than apart: a pattern absorbs the week's derived volume, a copy
			    carries the week as authored. */}
			<CopyWeekSection
				outlineId={season.outlineId}
				weeks={season.weeks}
				timezone={season.timezone}
				pending={pendingCopy}
			/>
		</div>
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
