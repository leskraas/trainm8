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
	.int()
	.min(1, 'A phase runs at least one week')
	.max(52)

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
