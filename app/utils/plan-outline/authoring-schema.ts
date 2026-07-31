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
import { RHYTHMS, VOLUME_CURRENCIES } from './derive.ts'
import { PRESET_KEYS } from './presets.ts'
import { currencyOptionsFor } from './proposal.ts'
import { QUALITY_ZONES } from './quality-mix.ts'

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

export const PlanOutlineCreateSchema = z
	.object({
		eventId: z.string().min(1),
		startWeekKey: WeekKeySchema,
		phases: z.array(PhaseCreateSchema).min(1, 'A plan has at least one phase'),
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
	.refine(
		(input) =>
			input.phases.reduce((sum, phase) => sum + phase.weeks, 0) <=
			MAX_PLAN_WEEKS,
		{
			message: `A plan runs at most ${MAX_PLAN_WEEKS} weeks`,
			path: ['phases'],
		},
	)

/**
 * Set a Season Anchor segment's value — the first of the service's update
 * operations, and the one ADR 0044 §8's lock is asserted against.
 *
 * It carries **no unit**: the unit is the track's **Volume Currency** and a
 * re-anchor changes value only (ADR 0043). `.strict()` makes a stray `currency`
 * key a runtime rejection as well as a compile error.
 */
export const SeasonAnchorSetSchema = z
	.object({
		trackId: z.string().min(1),
		fromWeekKey: WeekKeySchema,
		value: z.number().positive('An anchor is more than zero'),
	})
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
		// A real minus sign, matching the display layer's own convention for a signed
		// rate (`formatSignedPercent`): these messages reach the athlete as form
		// errors, so they read the way every other rate on the page does.
		ramp: z
			.number()
			.min(-MAX_RAMP, `A ramp past −${MAX_RAMP * 100}% a week is a typo`)
			.max(MAX_RAMP, `A ramp past +${MAX_RAMP * 100}% a week is a typo`)
			.nullable(),
		boundaryStep: z
			.number()
			.min(
				MIN_BOUNDARY_STEP,
				'A boundary step cannot take the whole block away',
			)
			.max(
				MAX_BOUNDARY_STEP,
				'A boundary step that doubles the block is a typo',
			)
			.nullable(),
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

export type PhaseCreateInput = z.infer<typeof PhaseCreateSchema>
export type TrackCreateInput = z.infer<typeof TrackCreateSchema>
export type PlanOutlineCreateInput = z.input<typeof PlanOutlineCreateSchema>
export type SeasonAnchorSetInput = z.infer<typeof SeasonAnchorSetSchema>
export type PhaseAddInput = z.infer<typeof PhaseAddSchema>
export type PhaseRenameInput = z.infer<typeof PhaseRenameSchema>
export type PhaseResizeInput = z.infer<typeof PhaseResizeSchema>
export type PhaseRhythmSetInput = z.infer<typeof PhaseRhythmSetSchema>
export type PhaseMoveInput = z.infer<typeof PhaseMoveSchema>
export type PhaseRemoveInput = z.infer<typeof PhaseRemoveSchema>
export type PlanOutlineDeleteInput = z.infer<typeof PlanOutlineDeleteSchema>
export type EnduranceSegmentSetInput = z.infer<typeof EnduranceSegmentSetSchema>
export type QualitySessionMixSetInput = z.infer<
	typeof QualitySessionMixSetSchema
>
export type PresetApplyInput = z.infer<typeof PresetApplySchema>

/**
 * Every input the authoring service accepts for **changing** an existing Plan
 * Outline. `currency` appears in `TrackCreateInput` and in no member of this
 * union, so a track's Volume Currency cannot be rewritten through any update
 * path — the compile-error half of ADR 0044 §8, pinned by
 * `authoring.server.test.ts`. Later tickets widen the union; they cannot widen
 * it with `currency` without failing that test.
 */
export type PlanOutlineUpdateInput =
	| SeasonAnchorSetInput
	| PhaseAddInput
	| PhaseRenameInput
	| PhaseResizeInput
	| PhaseRhythmSetInput
	| PhaseMoveInput
	| PhaseRemoveInput
	| EnduranceSegmentSetInput
	| QualitySessionMixSetInput
	| PresetApplyInput
