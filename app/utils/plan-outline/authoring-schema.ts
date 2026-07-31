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
import { currencyOptionsFor } from './proposal.ts'

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
 * One phase: a name and a week count, and nothing about volume (ADR 0041).
 *
 * `rhythm` and `tapers` are **optional and carry no default here**. Where the
 * athlete has not authored them the column's own documented default applies, so
 * this layer never records a convention as though the athlete had chosen it — the
 * rule ADR 0044 §4 sets for the cuts, held to for the rhythm as far as a
 * non-nullable column allows.
 */
export const PhaseCreateSchema = z.object({
	name: z.string().trim().min(1, 'Name the phase').max(60),
	weeks: z.number().int().min(1, 'A phase runs at least one week').max(52),
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
		ramp: z
			.number()
			.min(
				-MAX_RAMP,
				`A ramp steeper than −${MAX_RAMP * 100}% a week is a typo`,
			)
			.max(MAX_RAMP, `A ramp steeper than ${MAX_RAMP * 100}% a week is a typo`)
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

export type PhaseCreateInput = z.infer<typeof PhaseCreateSchema>
export type TrackCreateInput = z.infer<typeof TrackCreateSchema>
export type PlanOutlineCreateInput = z.input<typeof PlanOutlineCreateSchema>
export type SeasonAnchorSetInput = z.infer<typeof SeasonAnchorSetSchema>
export type EnduranceSegmentSetInput = z.infer<typeof EnduranceSegmentSetSchema>

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
	| EnduranceSegmentSetInput
