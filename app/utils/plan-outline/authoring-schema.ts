// The authoring service's input contracts (ADR 0044 §8).
//
// Pure and shared: the routes parse forms against these schemas with Conform and
// the service re-parses what it is handed, so no write reaches the database
// without passing the same gate twice. Split from `authoring.server.ts` the way
// `event-schema.ts` is split from `event.server.ts`.
//
// **The Volume Currency lock lives here, in the type system.** `currency`
// appears in `TrackCreateSchema` and in **no update schema**, so changing a
// track's currency is a compile error rather than a runtime check — ADR 0044 §8's
// requirement on this module. Every update schema is additionally `.strict()`,
// which refuses a stray `currency` key at runtime too, and
// `PlanOutlineUpdateInput` collects them so the rule is asserted over the set
// rather than one schema at a time.

import { z } from 'zod'
import { DISCIPLINES } from '../workout-schema.ts'
import { RHYTHMS, STRENGTH_GOALS, VOLUME_CURRENCIES } from './derive.ts'
import { PRESET_KEYS, presetFor, presetWeeks } from './presets.ts'
import { currencyOptionsFor } from './proposal.ts'
import { QUALITY_ZONES } from './quality-mix.ts'
import { PATTERN_WEEKDAYS } from './week-pattern.ts'

/** The longest season the surface will author — two years of phases. */
export const MAX_PLAN_WEEKS = 104

/**
 * A `weekKey`: `YYYY-MM-DD` **and a Monday**, since every week-scoped row is
 * keyed by the Monday opening its Training Week (ADR 0044 §3). Parsed as a UTC
 * midnight, matching `week-keys.ts` — both keys are plain date strings of the
 * same kind, so the comparison is timezone-independent.
 */
export const WeekKeySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'A week key is a YYYY-MM-DD date')
	.refine(
		(key) => new Date(`${key}T00:00:00.000Z`).getUTCDay() === 1,
		'A Training Week starts on a Monday',
	)

/**
 * A phase's name: **free text**, because nothing in the app branches on the word
 * (ADR 0044 §2). "Off-season", "Return to run" and "Accumulation" store exactly as
 * well as "Base", and two phases may share a name — position, not the name,
 * decides which phase is current.
 *
 * One schema, so the rule is identical whether the name arrives at creation or in
 * a rename.
 */
export const PhaseNameSchema = z
	.string()
	.trim()
	.min(1, 'Name the phase')
	.max(60)

/** A phase's span. At least a week, and no phase alone outruns a season. */
export const PhaseWeeksSchema = z
	.number()
	.int('A phase runs in whole weeks')
	.min(1, 'A phase runs at least one week')
	.max(52, 'A phase runs at most 52 weeks')

/**
 * One phase: a name and a week count, and nothing about volume (ADR 0041).
 *
 * `rhythm` and `tapers` are **optional and carry no default here**. Where the
 * athlete has not authored them the column's own documented default applies, so
 * this layer never records a convention as though the athlete had chosen it — the
 * rule ADR 0044 §4 sets for the cuts, held to for the rhythm as far as a
 * non-nullable column allows.
 */
export const PhaseCreateSchema = z.object({
	name: PhaseNameSchema,
	weeks: PhaseWeeksSchema,
	rhythm: z.enum(RHYTHMS).optional(),
	tapers: z.boolean().optional(),
})

/**
 * One Training Track at creation: its Discipline, its **Volume Currency** and
 * its first **Season Anchor** value.
 *
 * The currency must be one the Discipline can actually author — strength speaks
 * `sets` and only `sets` (ADR 0043 §2) — so `currencyOptionsFor` is the single
 * source for that rule rather than a second list written out here.
 */
export const TrackCreateSchema = z
	.object({
		discipline: z.enum(DISCIPLINES),
		currency: z.enum(VOLUME_CURRENCIES),
		/**
		 * The anchor is positive: ADR 0040 §3's derivation is multiplicative, so an
		 * anchor of 0 makes every week of the season 0 for the plan's whole life.
		 */
		anchorValue: z.number().positive('Your starting volume is more than zero'),
	})
	.refine(
		(track) => currencyOptionsFor(track.discipline).includes(track.currency),
		{
			message: 'That unit is not one this discipline authors',
			path: ['currency'],
		},
	)

/**
 * A new plan's phase structure, and there are exactly **two** ways to say it: the
 * key of a **Periodization Preset**, or the phases the athlete typed.
 *
 * A shape names a preset rather than posting one, exactly as `PresetApplySchema`
 * does and for the same reason — the numbers are code constants, so a shape the
 * app never shipped is unrepresentable rather than validated against. It also
 * means a preset lands **whole** at creation: the phases *and* each endurance
 * segment's **Volume Ramp**, **Block Boundary Step** and **Quality Session Mix**,
 * which is the half a route expanding a preset into `phases` would silently drop.
 *
 * A union rather than two optional fields, so "both" and "neither" are compile
 * errors at the call site instead of refinements the caller can trip over.
 */
export const PlanStructureSchema = z.union([
	z.object({ presetKey: z.enum(PRESET_KEYS) }),
	z.object({
		phases: z.array(PhaseCreateSchema).min(1, 'A plan has at least one phase'),
	}),
])

/** The weeks a structure comes to, for the season-length bound below. */
function structureWeeks(
	structure: z.infer<typeof PlanStructureSchema>,
): number {
	return 'presetKey' in structure
		? presetWeeks(presetFor(structure.presetKey))
		: structure.phases.reduce((sum, phase) => sum + phase.weeks, 0)
}

export const PlanOutlineCreateSchema = z
	.object({
		eventId: z.string().min(1),
		startWeekKey: WeekKeySchema,
		structure: PlanStructureSchema,
		tracks: z
			.array(TrackCreateSchema)
			.min(1, 'A plan has at least one Training Track')
			.max(DISCIPLINES.length),
	})
	.refine(
		(input) =>
			new Set(input.tracks.map((track) => track.discipline)).size ===
			input.tracks.length,
		{
			// One track per Discipline (ADR 0043 §1) — a unique index enforces it too;
			// catching it here turns a constraint violation into a field error.
			message: 'One Training Track per discipline',
			path: ['tracks'],
		},
	)
	.refine((input) => structureWeeks(input.structure) <= MAX_PLAN_WEEKS, {
		message: `A plan runs at most ${MAX_PLAN_WEEKS} weeks`,
		path: ['structure'],
	})

/**
 * Add one **Training Track** to a plan that already exists — the second Discipline
 * a runner who takes up lifting authors, and the third and fourth a triathlete
 * authors over the *same* phase timeline (ADR 0043 §1).
 *
 * The three fields of `TrackCreateSchema` and no others, for one reason: a track
 * added later is not a lesser track. It states its Discipline, its **Volume
 * Currency** and its first **Season Anchor** in one act, exactly as a track
 * authored with the plan does, because "anchor value and Volume Currency are one
 * act" (ADR 0043 §2) whenever that act happens.
 *
 * The anchor takes effect from the plan's own **Plan Start Week** and is not a
 * field here: a track that started mid-season would be an anchor dated to a week
 * the athlete never chose, and dating one is a **re-anchor**, which is its own
 * operation (ADR 0040 §5).
 *
 * `.strict()`, like every update input, so a body carrying a stray key — a
 * `currency` aimed at some other track, say — is rejected rather than ignored.
 */
export const TrackAddSchema = z
	.object({
		outlineId: z.string().min(1),
		discipline: z.enum(DISCIPLINES),
		currency: z.enum(VOLUME_CURRENCIES),
		anchorValue: z.number().positive('Your starting volume is more than zero'),
	})
	.strict()
	.refine(
		(track) => currencyOptionsFor(track.discipline).includes(track.currency),
		{
			message: 'That unit is not one this discipline authors',
			path: ['currency'],
		},
	)

/**
 * Remove a **Training Track** and everything authored on it.
 *
 * A whole track and not a currency change wearing a different hat: ADR 0044 §8
 * makes changing a currency *re-authoring*, and this is the half of re-authoring
 * that removes. Its counterpart is {@link TrackAddSchema}, and the pair is
 * deliberately two acts rather than one edit, so nothing can look like a unit
 * quietly changing under weeks already lived.
 */
export const TrackRemoveSchema = z
	.object({ trackId: z.string().min(1) })
	.strict()

/**
 * Set a Season Anchor segment's value — the first of the service's update
 * operations, and the one ADR 0044 §8's lock is asserted against.
 *
 * **Three fields, and the third is not one of them.** A segment is
 * `(fromWeekKey, value)`: it carries **no unit**, because the unit is the track's
 * **Volume Currency** and a re-anchor changes value only (ADR 0040 §5 as amended,
 * ADR 0043). `.strict()` makes a stray `currency` key a runtime rejection as well
 * as a compile error — changing what a track is measured in is re-authoring, not
 * an edit (ADR 0044 §8).
 *
 * `fromWeekKey` is the *identity* of the segment rather than a fourth editable
 * field: the write is keyed on `@@unique([trackId, fromWeekKey])`, so submitting an
 * existing week edits that segment's value and submitting a new one adds a segment.
 * Moving a re-anchor to a different week is therefore a remove and an add, which is
 * the honest shape — a re-anchor *is* the week it takes effect from.
 */
export const SeasonAnchorSetSchema = z
	.object({
		trackId: z.string().min(1),
		fromWeekKey: WeekKeySchema,
		value: z.number().positive('An anchor is more than zero'),
	})
	.strict()

/**
 * Remove a **Season Anchor** segment — the athlete taking a re-anchor back.
 *
 * The track and the week it takes effect from, and no value: that pair is the row's
 * own key, so a re-anchor is addressed by **when it takes effect** rather than by an
 * id the surface would have to carry — the shape `WeekVolumeOverrideClearSchema`
 * takes, for the same reason.
 *
 * Which segment may be removed is the service's rule and not this schema's: the
 * *earliest* one stays, because it is the level every week before the next
 * re-anchor is derived from, and a season with no anchor at all can price no week
 * (ADR 0040 §5).
 */
export const SeasonAnchorRemoveSchema = z
	.object({ trackId: z.string().min(1), fromWeekKey: WeekKeySchema })
	.strict()

/**
 * Hand-set one week's volume target — a **Week Volume Override** (ADR 0044 §5).
 *
 * The value **admits zero**, and that is the one place this departs from
 * `SeasonAnchorSetSchema`'s `.positive()` beside it: `0` expresses a week without
 * training and needs no separate flag, so a floor of "more than zero" would make a
 * week off unauthorable. The anchor's floor is a different rule for a different
 * reason — the derivation is multiplicative, so an anchor of 0 takes the whole
 * season to nothing, where an override of 0 is a leaf on one week.
 *
 * Finite, because the value *is* the week's final target: an `Infinity` would flow
 * into every share of the week and into the season total behind it.
 *
 * It carries **no unit**: the unit is the track's **Volume Currency** and a
 * hand-set week changes value only (ADR 0043). `.strict()` makes a stray
 * `currency` key a runtime rejection as well as a compile error (ADR 0044 §8).
 *
 * There is no bound above, unlike the ramp's and the share weight's typo guards: a
 * target is an absolute quantity in a currency this schema cannot see, so any
 * ceiling written here would be a guess about which one — and `sets`, `km` and
 * `tss` do not share an order of magnitude.
 */
export const WeekVolumeOverrideSetSchema = z
	.object({
		trackId: z.string().min(1),
		weekKey: WeekKeySchema,
		value: z
			.number()
			.finite('A hand-set target is a number')
			.min(0, 'A hand-set target is zero or more, and zero is a week off'),
	})
	.strict()

/**
 * Revert one week to the rule — remove its **Week Volume Override**.
 *
 * The week and its track, and no value: reverting is not setting the derived
 * number, it is deleting the athlete's statement so the derivation answers again
 * (ADR 0044 §5). Storing what the rule happened to give would freeze a number that
 * every later re-anchor and ramp edit is supposed to move.
 */
export const WeekVolumeOverrideClearSchema = z
	.object({ trackId: z.string().min(1), weekKey: WeekKeySchema })
	.strict()

/**
 * Add a phase to an existing season, at a position.
 *
 * The position is where the phase *lands*, not a range to be validated: an insert
 * is between phases, and the service clamps a position past the last phase to an
 * append. There is no start week here and there is no end week — a phase carries
 * neither (ADR 0044 §3), which is what keeps the season contiguous through an
 * insert and keeps the **Plan Start Week** where the athlete authored it.
 */
export const PhaseAddSchema = z
	.object({
		outlineId: z.string().min(1),
		/** The 0-based position the new phase takes among its siblings. */
		atIndex: z.number().int().min(0),
		name: PhaseNameSchema,
		weeks: PhaseWeeksSchema,
		rhythm: z.enum(RHYTHMS).optional(),
		tapers: z.boolean().optional(),
	})
	.strict()

/** Rename a phase. Free text, and never a vocabulary (ADR 0044 §2). */
export const PhaseRenameSchema = z
	.object({ phaseId: z.string().min(1), name: PhaseNameSchema })
	.strict()

/**
 * Resize a phase. Weeks only: the phases after it slide with it because none of
 * them stores a date, and the plan's start does not move because it is authored
 * on the Outline rather than counted back from the Event (ADR 0044 §3).
 */
export const PhaseResizeSchema = z
	.object({ phaseId: z.string().min(1), weeks: PhaseWeeksSchema })
	.strict()

/**
 * A phase's loading rhythm and whether it tapers — the phase's *time* structure,
 * authored per phase so one stretch can carry more recovery than the rest without
 * touching the season around it (ADR 0044 §4).
 *
 * Both are required here, unlike at creation: the athlete is looking at the
 * control and its recovery weeks are drawn beside it, so what comes back is a
 * choice rather than an omission. The *magnitude* of any cut is absent by design —
 * that is the track segment's, never the phase's.
 */
export const PhaseRhythmSetSchema = z
	.object({
		phaseId: z.string().min(1),
		rhythm: z.enum(RHYTHMS),
		tapers: z.boolean(),
	})
	.strict()

/**
 * Move a phase one position earlier or later.
 *
 * A direction rather than a target index: the season is a sequence the athlete
 * nudges, and a submitted absolute position could be computed from a stale reading
 * and land the phase somewhere nobody asked for.
 */
export const PhaseMoveSchema = z
	.object({
		phaseId: z.string().min(1),
		direction: z.enum(['earlier', 'later']),
	})
	.strict()

/** Remove a phase. The phases after it close the gap, by renumbering. */
export const PhaseRemoveSchema = z
	.object({ phaseId: z.string().min(1) })
	.strict()

/** Delete a whole Plan Outline. The Event and its sessions are not this action's. */
export const PlanOutlineDeleteSchema = z
	.object({ outlineId: z.string().min(1) })
	.strict()

/**
 * Resize the blocks so the season lands on the Event's week.
 *
 * The Outline and nothing else — no week count, no per-phase target. Which blocks
 * change and by how much is **recomputed** from the stored rows (`proposeFit`), so
 * a stale proposal cannot be posted back and land an edit the athlete was never
 * shown, the same reason `PhaseMoveSchema` takes a direction rather than an index.
 */
export const PlanOutlineFitSchema = z
	.object({ outlineId: z.string().min(1) })
	.strict()

/**
 * How steep a **Volume Ramp** or **Block Boundary Step** the schema will store.
 *
 * Deliberately far wider than the **ramp guard**'s `RAMP_GUARD_MAX`: the guard
 * warns and never blocks (ADR 0040 §12), so the bound here exists only to keep a
 * typo — a `50` meant as `5` — out of the database, and must never be mistaken for
 * the convention. A drop is allowed to be deeper than a rise is allowed to be
 * steep, because the published boundary steps go to −41% (Rønnestad 2025).
 */
export const MAX_RAMP = 0.5
export const MIN_BOUNDARY_STEP = -0.9
export const MAX_BOUNDARY_STEP = 1

/**
 * A cut's depth as a fraction: `0.3` is −30%. Bounded below 1 because a full cut
 * is a week without training, which a **Week Volume Override** of `0` expresses
 * exactly and a role factor of zero would express by making every following week's
 * reference disappear.
 */
const CutSchema = z
	.number()
	.min(0, 'A cut takes volume away, so it is not negative')
	.max(0.9, 'A cut deeper than 90% is a week off — override the week instead')
	.nullable()

/**
 * A segment's **Volume Ramp**: the fraction per *loading* week it progresses by.
 *
 * One schema for both kinds of segment, because ADR 0047 §1 gave a strength
 * segment the same anchor-and-ramp progression an endurance one has — so the two
 * cannot come to disagree about what a storable rate is. The real minus sign
 * matches the display layer's own convention for a signed rate
 * (`formatSignedPercent`): these messages reach the athlete as form errors, so
 * they read the way every other rate on the page does.
 */
const RampSchema = z
	.number()
	.min(-MAX_RAMP, `A ramp past −${MAX_RAMP * 100}% a week is a typo`)
	.max(MAX_RAMP, `A ramp past +${MAX_RAMP * 100}% a week is a typo`)
	.nullable()

/**
 * A segment's **Block Boundary Step**: the volume change at its opening. Shared
 * by both kinds for {@link RampSchema}'s reason — it applies at each strength
 * segment's opening exactly as it does at each endurance phase boundary.
 */
const BoundaryStepSchema = z
	.number()
	.min(MIN_BOUNDARY_STEP, 'A boundary step cannot take the whole block away')
	.max(MAX_BOUNDARY_STEP, 'A boundary step that doubles the block is a typo')
	.nullable()

/**
 * Author one endurance **Training Track segment**'s progression: its **Volume
 * Ramp**, its **Block Boundary Step**, and how deep its recovery week and its
 * taper cut.
 *
 * Every field is **nullable and required to be present**, because `null` is a
 * value the athlete can choose and not an absent one: an unset cut means "follow
 * the documented convention", which stays deliberately distinguishable from an
 * authored number of the same size, so moving a convention later leaves the
 * athlete's own numbers untouched (ADR 0044 §4). A partial update would make
 * "clear this back to the convention" unexpressible.
 *
 * `.strict()`, and carrying no `currency`: the Volume Currency lock (ADR 0044 §8)
 * holds over every member of `PlanOutlineUpdateInput`, this one included.
 */
export const EnduranceSegmentSetSchema = z
	.object({
		segmentId: z.string().min(1),
		ramp: RampSchema,
		boundaryStep: BoundaryStepSchema,
		recoveryCut: CutSchema,
		taperCut: CutSchema,
	})
	.strict()

/**
 * How many sessions in one zone the schema will store for a single week.
 *
 * A **typo guard** in the tradition of `MAX_RAMP` and `MAX_BOUNDARY_STEP` above,
 * and nothing more: a week has seven days, so `70` meant as `7` is the mistake this
 * catches. It says nothing about how many quality sessions are *wise* — that is the
 * soft availability warning's business, and ADR 0042 §9 has it warn and never block.
 */
export const MAX_QUALITY_SESSIONS_PER_WEEK = 7

/**
 * A segment's whole **Quality Session Mix**, replaced in one write.
 *
 * A multiset is one value, so the whole of it is authored at once: a partial,
 * per-zone write would leave "remove the last zone 5 session" unexpressible, the
 * same argument `EnduranceSegmentSetSchema` makes for writing all four rates
 * together. An empty `entries` is therefore a valid, meaningful save — the positive
 * statement that the segment has no quality sessions (ADR 0042 §6), never
 * "unknown".
 *
 * The zones are spelled out as literals rather than `min(3).max(5)` so that zone 1,
 * zone 2 and anything neuromuscular are **unrepresentable in the input type** rather
 * than merely rejected at runtime: ADR 0042 §3 admits zones 3–5 only, and §7 keeps
 * neuromuscular work off the metabolic axis altogether.
 *
 * `.strict()`, and carrying no `currency`: the Volume Currency lock (ADR 0044 §8)
 * holds over every member of `PlanOutlineUpdateInput`, this one included.
 */
export const QualitySessionMixSetSchema = z
	.object({
		segmentId: z.string().min(1),
		entries: z
			.array(
				z
					.object({
						zone: z.union([z.literal(3), z.literal(4), z.literal(5)]),
						sessionsPerWeek: z
							.number()
							.int('A session count is a whole number')
							.min(1, 'A zone in the mix carries at least one session')
							.max(
								MAX_QUALITY_SESSIONS_PER_WEEK,
								`More than ${MAX_QUALITY_SESSIONS_PER_WEEK} sessions in one zone a week is a typo`,
							),
					})
					.strict(),
			)
			.max(QUALITY_ZONES.length)
			.refine(
				(entries) =>
					new Set(entries.map((entry) => entry.zone)).size === entries.length,
				// The mix is a multiset by *count*, so a zone appears once carrying its
				// number. `@@unique([segmentId, zone])` enforces it too; catching it here
				// turns a constraint violation into a field error.
				'A zone appears once in the mix, carrying its session count',
			),
	})
	.strict()

// ── The strength Training Track segment (#409) ───────────────────────────────
// Three schemas rather than one, because a strength segment is the one segment
// the athlete **adds and removes explicitly**. An endurance track's segments are
// laid down one per phase by the service (ADR 0042 §8), so authoring one is only
// ever a `set`; a strength segment is dated and floats free of the phases
// (ADR 0047 §6), so nothing lays one down and nothing takes it away with a phase.
//
// What is deliberately absent from every one of them: a `%1RM` band and a rep
// range. Both **derive** from the **Strength Goal** and neither may be authored
// beside it (ADR 0047 §3, `strength-goal.ts`), so they are not fields anyone can
// leave out — they are fields that do not exist, which is what makes
// `30 sets/wk at 90% 1RM` unauthorable rather than merely guarded. `.strict()`
// turns a smuggled `minPct1RM` into a rejection rather than a dropped key, and no
// member carries `currency` (ADR 0044 §8).

/**
 * How long a strength segment runs — its **authored** duration, a choice and
 * never a consequence of reaching a ceiling (ADR 0047 §6; the ceiling was MRV,
 * retired by §8).
 *
 * Bounded above by `MAX_PLAN_WEEKS` rather than by a bound of its own: a segment
 * cannot outrun the longest season the surface authors, and the service refuses a
 * window that runs past the end of the particular plan it is in.
 */
export const StrengthSegmentWeeksSchema = z
	.number()
	.int('A segment runs in whole weeks')
	.min(1, 'A segment runs at least one week')
	.max(MAX_PLAN_WEEKS, `A segment runs at most ${MAX_PLAN_WEEKS} weeks`)

/**
 * A segment's **Strength Frequency**: the sessions per week it authors (ADR 0047
 * §4) — the strength track's authored counterpart to the endurance track's
 * *derived* **Quality Session Count**.
 *
 * At least one, because a block with no lifting in it is a block that does not
 * exist — "no lifting these weeks" is the gap between segments, which is why a gap
 * is a meaningful state. The upper bound is `MAX_QUALITY_SESSIONS_PER_WEEK`'s and
 * is the same **typo guard** for the same reason: a week has seven days, so `70`
 * meant as `7` is the mistake it catches.
 *
 * ACSM 2026 prescribes **≥2 sessions/wk**, and that figure is deliberately *not*
 * a bound here. It is a convention, and a convention warns where it is worth
 * saying and never blocks (ADR 0040 §12) — an athlete lifting once a week has
 * authored a real plan, not an invalid one.
 */
export const StrengthSessionsPerWeekSchema = z
	.number()
	.int('A session count is a whole number')
	.min(1, 'A block with no sessions in it is a block that is not there')
	.max(
		MAX_QUALITY_SESSIONS_PER_WEEK,
		`More than ${MAX_QUALITY_SESSIONS_PER_WEEK} strength sessions a week is a typo`,
	)

/**
 * How many of a segment's tail weeks deload. Null means the documented
 * convention (one week at −50%; Bell 2025), and `0` is the athlete positively
 * saying this block has no deload — two different states, which is the whole
 * reason this is nullable-and-present rather than optional (ADR 0044 §4).
 */
const DeloadWeeksSchema = z
	.number()
	.int('A deload runs in whole weeks')
	.min(0, 'A deload cannot be negative')
	.max(MAX_PLAN_WEEKS)
	.nullable()

/**
 * Everything a strength segment authors, shared by the add and the set so the two
 * cannot drift apart on what a segment *is*.
 *
 * `ramp`, `boundaryStep`, `deloadCut` and `deloadWeeks` are **nullable and
 * required to be present**, exactly as `EnduranceSegmentSetSchema`'s rates are:
 * `null` is the athlete choosing "follow the documented convention", and clearing
 * an authored number back to the convention has to be expressible.
 *
 * `goal` and `sessionsPerWeek` are **not** nullable, because they are what the
 * segment authors (ADR 0047 §3/§4) — the strength counterpart to the endurance
 * segment's **Quality Session Mix**, and there is no convention for either to fall
 * back to. A block the athlete has not decided the purpose of is a block they have
 * not authored yet.
 */
const strengthSegmentFields = {
	startWeekKey: WeekKeySchema,
	weeks: StrengthSegmentWeeksSchema,
	ramp: RampSchema,
	boundaryStep: BoundaryStepSchema,
	goal: z.enum(STRENGTH_GOALS),
	sessionsPerWeek: StrengthSessionsPerWeekSchema,
	deloadCut: CutSchema,
	deloadWeeks: DeloadWeeksSchema,
}

/**
 * The deload is the segment's **tail**, so it cannot be longer than the segment
 * (ADR 0047 §6). A cross-field rule, which is why it sits on the object rather
 * than on `DeloadWeeksSchema`: only here are both numbers in view.
 */
function deloadFitsTheSegment(segment: {
	weeks: number
	deloadWeeks: number | null
}): boolean {
	return segment.deloadWeeks == null || segment.deloadWeeks <= segment.weeks
}

const DELOAD_TOO_LONG = {
	message: 'A deload is the segment’s tail, so it fits inside the segment',
	path: ['deloadWeeks'],
}

/**
 * Add a strength segment to a track: its window, its progression, its **Strength
 * Goal** and its **Strength Frequency**.
 *
 * A `trackId` and not an `outlineId`, because a segment belongs to one track and
 * a plan may carry several. The service checks what this cannot: that the track is
 * the caller's, that it is a *strength* track, that the window falls inside the
 * plan, and that it collides with no sibling.
 */
export const StrengthSegmentAddSchema = z
	.object({ trackId: z.string().min(1), ...strengthSegmentFields })
	.strict()
	.refine(deloadFitsTheSegment, DELOAD_TOO_LONG)

/**
 * Re-author a strength segment, **whole**: the window moves and the rates are
 * rewritten in one save, for `EnduranceSegmentSetSchema`'s reason — a partial
 * update would make "clear this back to the convention" the one edit the surface
 * could not perform.
 */
export const StrengthSegmentSetSchema = z
	.object({ segmentId: z.string().min(1), ...strengthSegmentFields })
	.strict()
	.refine(deloadFitsTheSegment, DELOAD_TOO_LONG)

/**
 * Remove a strength segment. The weeks it held become a **gap** — the positive
 * statement "no lifting these weeks" rather than a hole in the plan (ADR 0047 §6).
 */
export const StrengthSegmentRemoveSchema = z
	.object({ segmentId: z.string().min(1) })
	.strict()

/**
 * Apply a **periodization preset** to an existing Outline.
 *
 * The Outline and a key, and nothing else. A preset's numbers are code constants
 * (`presets.ts`), so the caller *names* a shape rather than posting one and the
 * surface cannot apply a preset the app never shipped. It carries no `currency`,
 * no anchor value and no `startWeekKey` — the same three a preset itself refuses,
 * for the same reasons, and the Volume Currency lock (ADR 0044 §8) besides.
 */
export const PresetApplySchema = z
	.object({
		outlineId: z.string().min(1),
		presetKey: z.enum(PRESET_KEYS),
	})
	.strict()

// ── The Week Pattern: the microcycle the athlete authors (#410) ───────────────
// Every schema below holds one rule the storage cannot: **a pattern carries no
// absolute quantity.** The week's target is derived and changes week to week
// (ADR 0040 §1), so nothing here has a field for volume — a day is a `fixed`
// Workout stamped as authored or a `share` carrying a *relative* weight, and
// there is no third kind (ADR 0044 §7). The absence of that field is the point,
// which is why every member is `.strict()`: a `volume` or a `km` smuggled in
// from a form body is refused rather than dropped.
//
// Positions are the service's, never the caller's: neither `orderIndex` nor
// `orderInDay` appears in any input, so a pattern appends and a day appends
// within its weekday, and a reorder is a *direction*.

/**
 * A Week Pattern's name: **free text**, the same reading a phase's name gets
 * (ADR 0044 §2). Nothing in the app branches on the word — "Standard week" and
 * "Race week" store equally well, and two patterns may share a name, because
 * position and not the name says which one the surface lists first.
 *
 * Its own schema rather than a reuse of `PhaseNameSchema`: the bounds are the
 * same today, and the message names the thing being named.
 */
export const WeekPatternNameSchema = z
	.string()
	.trim()
	.min(1, 'Name the pattern')
	.max(60)

/**
 * How large a relative weight the schema will store.
 *
 * A **typo guard** in the tradition of `MAX_RAMP` and
 * `MAX_QUALITY_SESSIONS_PER_WEEK`, and nothing more. Weights are normalised at
 * resolve time (`week-pattern.ts`), so `1` against `2.5` and `100` against `250`
 * describe exactly the same week and this bound rules out nothing an athlete
 * could mean by a ratio. It exists to keep a `250` typed for `2.5` from becoming
 * the day that swallows the week.
 */
export const MAX_SHARE_WEIGHT = 100

/**
 * One share day's relative weight — "the long run is 2.5× a weekday run", which
 * holds at any volume because the weight is a ratio and never a quantity.
 *
 * Strictly positive, matching the migration's own `weight > 0`: a weight of zero
 * absorbs nothing, and a day that absorbs nothing is a day that is not there.
 * Finite, because `normaliseWeights` divides by the sum — one `Infinity` would
 * take every other share day to `NaN`.
 */
export const ShareWeightSchema = z
	.number()
	.finite('A weight is a number')
	.positive('A share carries a weight above zero')
	.max(MAX_SHARE_WEIGHT, `A weight past ${MAX_SHARE_WEIGHT} is a typo`)

/**
 * A pattern day's weekday: **Monday-first**, 0–6 — the Training Week's own
 * ordering (ADR 0019), which is also the CHECK the migration wrote.
 *
 * The bounds are read off `PATTERN_WEEKDAYS` rather than written out again, so
 * the input gate and the pure resolution module cannot come to disagree about
 * which end of the week is which. The Sunday-first index the rest of the app
 * stores (ADR 0005) is a *different number for the same day*; every crossing goes
 * through `calendarWeekdayOf` and none through here.
 */
export const PatternWeekdaySchema = z
	.number()
	.int('A weekday is a whole number')
	.min(PATTERN_WEEKDAYS[0], 'A Training Week starts on Monday')
	.max(PATTERN_WEEKDAYS.length - 1, 'A Training Week ends on Sunday')

/**
 * Add a Week Pattern to an Outline: a name, and nothing else.
 *
 * No position — the service appends, so two tabs cannot both claim index 2. No
 * week binding either: which weeks a pattern governs is the stamp's business, and
 * the pattern itself is a shape (ADR 0044 §6).
 */
export const WeekPatternAddSchema = z
	.object({ outlineId: z.string().min(1), name: WeekPatternNameSchema })
	.strict()

/** Rename a pattern. Free text, and never a vocabulary. */
/**
 * Author a starter **Week Pattern**: the Outline, and nothing else.
 *
 * No weekdays, no day count and no weights — every one of them is *computed* from
 * the athlete's own **Training Availability** and the plan's tracks
 * (`starter-pattern.ts`), so a posted week cannot claim to be a reading of the
 * athlete. Its counterpart is {@link WeekPatternAddSchema}, which opens an empty
 * pattern; this one opens a proposed week, and both leave every day editable.
 */
export const WeekPatternStarterSchema = z
	.object({ outlineId: z.string().min(1) })
	.strict()

export const WeekPatternRenameSchema = z
	.object({ patternId: z.string().min(1), name: WeekPatternNameSchema })
	.strict()

/**
 * Move a pattern one position earlier or later.
 *
 * A direction rather than a target index, for `PhaseMoveSchema`'s reason: an
 * absolute position could be computed from a stale reading and land the pattern
 * somewhere nobody asked for.
 */
export const WeekPatternMoveSchema = z
	.object({
		patternId: z.string().min(1),
		direction: z.enum(['earlier', 'later']),
	})
	.strict()

/** Remove a pattern. Its days go with it, and the survivors close the gap. */
export const WeekPatternRemoveSchema = z
	.object({ patternId: z.string().min(1) })
	.strict()

/**
 * What every pattern day carries, whichever kind it is: the pattern it belongs
 * to, the **track** whose volume it draws from — a foreign key, since the pattern
 * lives on the same Outline as the track — and the weekday it falls on.
 *
 * `orderInDay` is deliberately absent: a day appends within its weekday and is
 * reordered by direction, so the position is never submitted.
 */
const weekPatternDayFields = {
	patternId: z.string().min(1),
	trackId: z.string().min(1),
	weekday: PatternWeekdaySchema,
}

/**
 * Add a day to a pattern — a **discriminated union on `kind`**, because the two
 * kinds carry different things and neither may borrow the other's field.
 *
 * - `fixed` carries a `workoutId` and **has no `weight` key at all**. Intervals
 *   are prescribed, not scaled, so there is no share of the week to take — and
 *   "a fixed day cannot carry a weight" is therefore a compile error and a parse
 *   failure rather than a rule someone remembered to check. The migration's
 *   `kind_fields` CHECK says the same thing one layer down.
 * - `share` carries a `weight` and *may* carry a `workoutId`, which is an
 *   optional **shape to scale** rather than a prescription (ADR 0044 §7).
 *
 * Neither member carries an absolute volume in any currency, and `.strict()`
 * refuses one at runtime: the week's target is derived, so a quantity stored
 * here would be a second, staler answer to a question the derivation already
 * answers (ADR 0040 §1).
 *
 * One rule about `workoutId` is deliberately **not** here: the Workout's Discipline
 * must be the day's track's, for a prescription and for a shape alike, because a day
 * draws its volume from its track and no figure spans incommensurable disciplines
 * (ADR 0041, ADR 0043 §5). That compares two rows this schema never sees — a
 * `trackId` and a `workoutId` are ids here — so `addWeekPatternDay` owns it and
 * refuses with `workout-discipline-mismatch`.
 */
export const WeekPatternDayAddSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('fixed'),
			...weekPatternDayFields,
			workoutId: z.string().min(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal('share'),
			...weekPatternDayFields,
			weight: ShareWeightSchema,
			workoutId: z.string().min(1).nullish(),
		})
		.strict(),
])

/**
 * Move a day one position earlier or later **within its own weekday**.
 *
 * There is no `weekday` here: moving a session to another day is not a reorder,
 * and `orderInDay` is what makes two sessions on one Tuesday orderable at all.
 */
export const WeekPatternDayMoveSchema = z
	.object({ dayId: z.string().min(1), direction: z.enum(['earlier', 'later']) })
	.strict()

/** Remove a day. Its weekday's survivors close the gap, by renumbering. */
export const WeekPatternDayRemoveSchema = z
	.object({ dayId: z.string().min(1) })
	.strict()

export type PhaseCreateInput = z.infer<typeof PhaseCreateSchema>
export type TrackCreateInput = z.infer<typeof TrackCreateSchema>
export type PlanOutlineCreateInput = z.input<typeof PlanOutlineCreateSchema>
export type TrackAddInput = z.infer<typeof TrackAddSchema>
export type TrackRemoveInput = z.infer<typeof TrackRemoveSchema>
export type SeasonAnchorSetInput = z.infer<typeof SeasonAnchorSetSchema>
export type SeasonAnchorRemoveInput = z.infer<typeof SeasonAnchorRemoveSchema>
export type WeekVolumeOverrideSetInput = z.infer<
	typeof WeekVolumeOverrideSetSchema
>
export type WeekVolumeOverrideClearInput = z.infer<
	typeof WeekVolumeOverrideClearSchema
>
export type PhaseAddInput = z.infer<typeof PhaseAddSchema>
export type PhaseRenameInput = z.infer<typeof PhaseRenameSchema>
export type PhaseResizeInput = z.infer<typeof PhaseResizeSchema>
export type PhaseRhythmSetInput = z.infer<typeof PhaseRhythmSetSchema>
export type PhaseMoveInput = z.infer<typeof PhaseMoveSchema>
export type PhaseRemoveInput = z.infer<typeof PhaseRemoveSchema>
export type PlanOutlineDeleteInput = z.infer<typeof PlanOutlineDeleteSchema>
export type PlanOutlineFitInput = z.infer<typeof PlanOutlineFitSchema>
export type EnduranceSegmentSetInput = z.infer<typeof EnduranceSegmentSetSchema>
export type QualitySessionMixSetInput = z.infer<
	typeof QualitySessionMixSetSchema
>
export type StrengthSegmentAddInput = z.infer<typeof StrengthSegmentAddSchema>
export type StrengthSegmentSetInput = z.infer<typeof StrengthSegmentSetSchema>
export type StrengthSegmentRemoveInput = z.infer<
	typeof StrengthSegmentRemoveSchema
>
export type PresetApplyInput = z.infer<typeof PresetApplySchema>
export type WeekPatternAddInput = z.infer<typeof WeekPatternAddSchema>
export type WeekPatternStarterInput = z.infer<typeof WeekPatternStarterSchema>
export type WeekPatternRenameInput = z.infer<typeof WeekPatternRenameSchema>
export type WeekPatternMoveInput = z.infer<typeof WeekPatternMoveSchema>
export type WeekPatternRemoveInput = z.infer<typeof WeekPatternRemoveSchema>
export type WeekPatternDayAddInput = z.infer<typeof WeekPatternDayAddSchema>
export type WeekPatternDayMoveInput = z.infer<typeof WeekPatternDayMoveSchema>
export type WeekPatternDayRemoveInput = z.infer<
	typeof WeekPatternDayRemoveSchema
>

/**
 * Every input the authoring service accepts for **changing** an existing Plan
 * Outline. `currency` appears in `TrackCreateInput` and in no member of this
 * union, so a track's Volume Currency cannot be rewritten through any update
 * path — the compile-error half of ADR 0044 §8, pinned by
 * `authoring.server.test.ts`. Later tickets widen the union; they cannot widen
 * it with `currency` without failing that test.
 *
 * **`TrackAddInput` is deliberately not a member**, and its absence is the rule
 * rather than an oversight: adding a track *creates* one, so it states a currency
 * for the same reason {@link TrackCreateSchema} does — a track's currency is
 * authored once, at the moment the track begins (ADR 0043 §2). Listing it here
 * would fail the lock test, correctly, by claiming a create is an edit.
 * {@link TrackRemoveSchema} is a member, carries no currency, and is the other
 * half of what re-authoring a unit actually costs (ADR 0044 §8).
 */
export type PlanOutlineUpdateInput =
	| TrackRemoveInput
	| SeasonAnchorSetInput
	| WeekVolumeOverrideSetInput
	| WeekVolumeOverrideClearInput
	| PhaseAddInput
	| PhaseRenameInput
	| PhaseResizeInput
	| PhaseRhythmSetInput
	| PhaseMoveInput
	| PhaseRemoveInput
	| PlanOutlineFitInput
	| EnduranceSegmentSetInput
	| QualitySessionMixSetInput
	| StrengthSegmentAddInput
	| StrengthSegmentSetInput
	| StrengthSegmentRemoveInput
	| PresetApplyInput
	| WeekPatternAddInput
	| WeekPatternStarterInput
	| WeekPatternRenameInput
	| WeekPatternMoveInput
	| WeekPatternRemoveInput
	| WeekPatternDayAddInput
	| WeekPatternDayMoveInput
	| WeekPatternDayRemoveInput
