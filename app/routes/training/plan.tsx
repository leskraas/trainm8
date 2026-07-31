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
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
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
	formatWeekSpan,
} from '#app/utils/format.ts'
import {
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
	ShareWeightSchema,
	StrengthSegmentAddSchema,
	StrengthSegmentSetSchema,
	WeekPatternNameSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addPhase,
	addStrengthSegment,
	addWeekPattern,
	addWeekPatternDay,
	applyPreset,
	deletePlanOutline,
	movePhase,
	moveWeekPattern,
	moveWeekPatternDay,
	removePhase,
	removeStrengthSegment,
	removeWeekPattern,
	removeWeekPatternDay,
	renamePhase,
	renameWeekPattern,
	resizePhase,
	setEnduranceSegment,
	setPhaseRhythm,
	setQualitySessionMix,
	setStrengthSegment,
	type PhaseEditRefusal,
	type StrengthSegmentRefusal,
	type WeekPatternEditRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import {
	DEFAULT_DELOAD_WEEKS,
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	RHYTHMS,
	type StrengthWeekRole,
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
import { PATTERN_DAY_KINDS } from '#app/utils/plan-outline/week-pattern.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	getActiveSeason,
	getAuthoredWorkouts,
	getSeasonForEvent,
	type AuthoredSeason,
	type SeasonAvailabilityWarning,
	type SeasonBandWarning,
	type UnavailableReading,
} from '#app/utils/training.server.ts'
import {
	isCardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.ts'
import {
	AddPhaseForm,
	DeletePlanSection,
	PhaseCard,
} from './__phase-editor.tsx'
import { PresetGallery } from './__preset-gallery.tsx'
import {
	StrengthBlocksSection,
	StrengthSegmentFormSchema,
	type EditableStrengthTrack,
} from './__strength-segment-editor.tsx'
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

	return {
		eventQuery: eventId,
		tab: tabFrom(request),
		week: chosenWeekKey(request, season.weeks),
		workouts,
		strengthTracks: strengthTracksOf(season),
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
const TRACK_MISSING = 'Choose which training track this day draws from.'
const WORKOUT_MISSING =
	'A fixed day prescribes a workout, so choose the session it stamps.'
const DAY_KIND_UNKNOWN =
	'A day is either a fixed session or a share of the week. Nothing was added.'
const TRACK_GONE = 'That training track is no longer part of this plan.'
const BLOCK_GONE = 'That lifting block is no longer part of this plan.'

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
			return 'That week is not one of your plan’s weeks. Pick a week between your first and your last, or add weeks to your plan first.'
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
	const { season, tab, eventQuery, week, workouts, strengthTracks } = loaderData
	const error =
		actionData && 'error' in actionData ? actionData.error : undefined
	const timezone = season.timezone
	const totalWeeks = season.weeks.length
	// The **Season Span** headline, for a single-track plan. Several tracks means
	// several spans — one per commensurability group, never one fabricated total
	// (ADR 0043 §5) — and that grouping is a later ticket's, so a multi-track plan
	// reads its tracks below and no headline at all rather than a wrong one.
	const soleTrack = season.tracks.length === 1 ? season.tracks[0]! : null

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
				{soleTrack?.span ? (
					<SeasonSpanHeadline
						span={soleTrack.span}
						currency={soleTrack.currency}
						total={soleTrack.total}
						weeks={season.weeks}
					/>
				) : null}
				<p className="text-sm">{fitSentence(season.fit)}</p>
				<ul className="space-y-1">
					{season.tracks.map((track) => (
						<li key={track.discipline} className="text-sm">
							<span className="font-medium">
								{DISCIPLINE_LABELS[track.discipline]}
							</span>{' '}
							{/* The track's currency and where it starts, and deliberately no
							    per-track **Season Span**: a span belongs to a
							    **commensurability group** rather than to a track (CONTEXT.md,
							    _Season Span_), and rendering one per track here would settle
							    that grouping on the page before the model has it. The headline
							    above carries the span where a sole track makes it honest; a
							    strength track's span is derived and read, just not stated
							    here. */}
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
				<BlocksReading
					season={season}
					error={error}
					actionData={actionData}
					strengthTracks={strengthTracks}
				/>
			) : (
				<WeeksReading
					season={season}
					error={error}
					chosenWeek={previewWeek}
					workouts={workouts}
					eventQuery={eventQuery}
					strengthTracks={strengthTracks}
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
 * The **Season Span**: `55 → 78 km/wk`, the anchor and the peak loading week.
 *
 * A span and not a season total, because a total conflates how big a plan is with
 * how long it is and hides the **Volume Ramp** that is half of what the athlete
 * authored (ADR 0043). The total is available underneath as a **secondary** figure,
 * which is exactly where it belongs.
 *
 * Both figures are read from the authored guideline level — the anchor and the
 * ramps, through the same derivation the weeks use — and never summed from
 * materialized **Workout Sessions**, so neither changes character with how far into
 * the season the athlete is.
 */
function SeasonSpanHeadline({
	// Taken as a non-null span rather than as the track, so the caller's guard is
	// the only guard: there is no second place that could disagree about whether a
	// span exists.
	span,
	currency,
	total,
	weeks,
}: {
	span: NonNullable<SeasonTrack['span']>
	currency: SeasonTrack['currency']
	total: SeasonTrack['total']
	weeks: SeasonData['weeks']
}) {
	const peakWeek = weeks[span.peakWeekIndex]

	return (
		<div className="space-y-1">
			<p className="text-2xl font-semibold tabular-nums">
				{formatWeeklyVolume(span.anchor, currency)} →{' '}
				{formatWeeklyVolume(span.peak, currency)}
			</p>
			<p className="text-muted-foreground text-sm">
				Where you start to your peak loading week
				{peakWeek ? `, week ${peakWeek.weekInPlan}` : null} · read from your
				anchor and your ramps, never added up from sessions
				{total == null
					? null
					: ` · ${formatVolumeTotal(total, currency)} across the season`}
			</p>
		</div>
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
}: {
	season: SeasonData
	/** A refused *structural* edit, said once above the phases it was aimed at. */
	error?: string
	actionData: SegmentActionData
	strengthTracks: EditableStrengthTrack[]
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

/**
 * The Weeks reading: every Training Week with its role and its derived target per
 * track. One column per track in **that track's** own currency — never a total
 * across them, which would need an exchange rate the app refuses to invent
 * (ADR 0043 §5).
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
	strengthTracks,
}: {
	season: SeasonData
	/** A refused pattern edit, said once above the patterns it was aimed at. */
	error?: string
	/** The week the **Pattern Preview** is read against (`?week=`). */
	chosenWeek: SeasonData['weeks'][number] | null
	workouts: Route.ComponentProps['loaderData']['workouts']
	eventQuery: string | null
	strengthTracks: EditableStrengthTrack[]
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
	const liftingWeeks = strengthWeekRoles(strengthTracks)
	// Said once, under the list, and only where a deload is actually on it.
	const anyDeload = season.weeks.some((week) =>
		week.targets.some(
			(target) =>
				liftingWeeks.get(target.trackId)?.get(week.weekInPlan) === 'deload',
		),
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
								{week.targets.map((target) => {
									// A gap week on a strength track is the athlete's own "no
									// lifting these weeks", so it reads as that sentence and never
									// as a dash, a blank or an Unavailable — it is something they
									// said rather than something the app failed to work out.
									const lifting = liftingWeeks.get(target.trackId)
									const role = lifting?.get(week.weekInPlan)
									const inAGap = lifting != null && role == null
									return (
										<div key={target.discipline} className="flex gap-1.5">
											<dt className="text-muted-foreground">
												{DISCIPLINE_LABELS[target.discipline]}
											</dt>
											<dd className="font-medium tabular-nums">
												{target.value == null ? (
													<span className="text-muted-foreground font-normal">
														Unavailable
													</span>
												) : inAGap ? (
													<span className="font-normal">No lifting</span>
												) : (
													<>
														{formatWeeklyVolume(target.value, target.currency)}
														{/* The block's own tail, named on the row where the
														    cut shows up. Beside the week's `WeekRole` rather
														    than instead of it: a week can carry one of each,
														    and they are roles in two different things
														    (ADR 0047 §6). */}
														{role === 'deload' ? (
															<span className="text-muted-foreground font-normal">
																{' '}
																· Deload
															</span>
														) : null}
													</>
												)}
											</dd>
										</div>
									)
								})}
							</dl>
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
		</div>
	)
}

/**
 * Which weeks each strength track lifts in, and which of those are a block's own
 * **deload** — one map per track, keyed by the 1-based week the athlete counts in.
 *
 * A week inside the plan and outside every block gets **no entry**, which is what
 * the row reads as the authored "no lifting these weeks" rather than as a `0`
 * (ADR 0047 §6). Taken from the windows and not from the derived figure, because a
 * `0` could in principle arrive some other way and only a gap means this.
 *
 * The deload is the **block's** tail and never the phase rhythm's: the last
 * `deloadWeeks` weeks of the window, the documented convention where the athlete
 * left the box blank, clamped into the block so a deload longer than its block
 * covers all of it rather than reaching back before it — the same clamp
 * `derive.ts` applies when it prices those weeks.
 */
function strengthWeekRoles(
	tracks: EditableStrengthTrack[],
): Map<string, Map<number, StrengthWeekRole>> {
	return new Map(
		tracks.map((track) => [
			track.trackId,
			new Map(
				track.segments.flatMap((segment) => {
					const start = segment.startWeekInPlan
					if (start == null) return []
					const deloadWeeks = Math.min(
						Math.max(segment.deloadWeeks ?? DEFAULT_DELOAD_WEEKS, 0),
						segment.weeks,
					)
					return Array.from(
						{ length: segment.weeks },
						(_, offset) =>
							[
								start + offset,
								offset >= segment.weeks - deloadWeeks ? 'deload' : 'loading',
							] as const,
					)
				}),
			),
		]),
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
