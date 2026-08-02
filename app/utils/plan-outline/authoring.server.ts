// Every **Plan Outline** write goes through this module.
//
// One write path, mirroring the pure derivation next to it and following the
// repo's `X.server.ts` convention. It exists partly because ADR 0044 §8 requires
// it: `currency` appears in the create input and in no update input (see
// `authoring-schema.ts`), so changing a track's **Volume Currency** is a compile
// error rather than a runtime check. Changing currency is *re-authoring*, so the
// action offered is "author a new track", never a greyed-out field.
//
// Every operation authorises by owning athlete: an Outline hangs off an Event,
// and an Event hangs off its athlete, so ownership is one join away from every
// row here. A row that is not the caller's reads as absent rather than
// forbidden — the caller learns nothing about another athlete's season.
//
// What this module does **not** do: derive anything. Per-week targets, week
// roles and phase spans are computed from these rows by the pure modules beside
// it and are never stored (ADR 0040 §1).

import { Prisma } from '@prisma/client'
import { weekMonday } from '../athlete-calendar.ts'
import { parseTrainableWeekdays } from '../athlete-schema.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { parseEventDisciplines, type EventKind } from '../event-schema.ts'
import { createEvent } from '../event.server.ts'
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	EnduranceSegmentSetSchema,
	MAX_PLAN_WEEKS,
	PhaseAddSchema,
	PhaseMoveSchema,
	PhaseRemoveSchema,
	PhaseRenameSchema,
	PhaseResizeSchema,
	PhaseRhythmSetSchema,
	PlanOutlineCreateSchema,
	PlanOutlineDeleteSchema,
	PlanOutlineFitSchema,
	PresetApplySchema,
	QualitySessionMixSetSchema,
	SeasonAnchorRemoveSchema,
	SeasonAnchorSetSchema,
	StrengthSegmentAddSchema,
	StrengthSegmentRemoveSchema,
	StrengthSegmentSetSchema,
	TrackAddSchema,
	TrackRemoveSchema,
	WeekPatternAddSchema,
	WeekPatternDayAddSchema,
	WeekPatternDayMoveSchema,
	WeekPatternDayRemoveSchema,
	WeekPatternMoveSchema,
	WeekPatternRemoveSchema,
	WeekPatternRenameSchema,
	WeekPatternStarterSchema,
	WeekVolumeOverrideClearSchema,
	WeekVolumeOverrideSetSchema,
	type EnduranceSegmentSetInput,
	type PhaseAddInput,
	type PhaseCreateInput,
	type PhaseMoveInput,
	type PhaseRemoveInput,
	type PhaseRenameInput,
	type PhaseResizeInput,
	type PhaseRhythmSetInput,
	type PlanOutlineCreateInput,
	type PlanOutlineDeleteInput,
	type PlanOutlineFitInput,
	type PresetApplyInput,
	type QualitySessionMixSetInput,
	type SeasonAnchorRemoveInput,
	type SeasonAnchorSetInput,
	type StrengthSegmentAddInput,
	type StrengthSegmentRemoveInput,
	type StrengthSegmentSetInput,
	type TrackAddInput,
	type TrackRemoveInput,
	type WeekPatternAddInput,
	type WeekPatternDayAddInput,
	type WeekPatternDayMoveInput,
	type WeekPatternDayRemoveInput,
	type WeekPatternMoveInput,
	type WeekPatternRemoveInput,
	type WeekPatternRenameInput,
	type WeekPatternStarterInput,
	type WeekVolumeOverrideClearInput,
	type WeekVolumeOverrideSetInput,
} from './authoring-schema.ts'
import { eventFit } from './event-fit.ts'
import { proposeFit, type FitProposal } from './fit-proposal.ts'
import { presetFor, type PresetPhase } from './presets.ts'
import {
	proposeStarterPattern,
	type StarterProposal,
} from './starter-pattern.ts'
import { weekIndexOf } from './week-keys.ts'

/**
 * Why a create was refused. Each is a state the athlete can see and act on, so
 * none of them is an exception: the surface words them.
 *
 * `event-not-found` covers another athlete's Event as well as a missing one —
 * planning against someone else's season is indistinguishable from planning
 * against nothing.
 */
export type CreateOutlineRefusal =
	| 'event-not-found'
	| 'event-past'
	| 'event-cancelled'
	| 'event-already-planned'

export type CreateOutlineResult =
	| { ok: true; outlineId: string }
	| { ok: false; reason: CreateOutlineRefusal }

/** An Event's own Plan Outline, as the anchor list needs to read it. */
export type PlanAnchorCandidate = {
	id: string
	name: string
	kind: EventKind
	startDate: Date
	endDate: Date | null
	disciplines: Discipline[]
	/**
	 * The Outline this Event already anchors, or null. Present rather than
	 * filtered out, so the surface can say "this already has a plan" and link to
	 * it instead of quietly hiding the Event the athlete came looking for.
	 */
	plannedOutlineId: string | null
}

/**
 * The Events a new plan could be built toward: the athlete's own, not cancelled,
 * not yet past. An Event is still upcoming while its end date — or its start
 * date, for a single-day Event — has not passed, the same reading `getActivePlan`
 * uses.
 */
export async function listPlanAnchorCandidates(
	athleteId: string,
	now: Date = new Date(),
): Promise<PlanAnchorCandidate[]> {
	const events = await prisma.event.findMany({
		where: {
			athleteId,
			status: { not: 'cancelled' },
			OR: [
				{ endDate: null, startDate: { gte: now } },
				{ endDate: { gte: now } },
			],
		},
		orderBy: { startDate: 'asc' },
		select: {
			id: true,
			name: true,
			kind: true,
			startDate: true,
			endDate: true,
			disciplines: true,
			planOutline: { select: { id: true } },
		},
	})

	return events.map(toCandidate)
}

/**
 * One Event as a plan anchor, or null when it is not the athlete's, is cancelled,
 * or has already happened — the same reading `listPlanAnchorCandidates` applies,
 * so the authoring flow's second step cannot open against an Event the first step
 * would not have offered.
 */
export async function getPlanAnchorCandidate(
	athleteId: string,
	eventId: string,
	now: Date = new Date(),
): Promise<PlanAnchorCandidate | null> {
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			athleteId,
			status: { not: 'cancelled' },
			OR: [
				{ endDate: null, startDate: { gte: now } },
				{ endDate: { gte: now } },
			],
		},
		select: {
			id: true,
			name: true,
			kind: true,
			startDate: true,
			endDate: true,
			disciplines: true,
			planOutline: { select: { id: true } },
		},
	})
	return event ? toCandidate(event) : null
}

function toCandidate(event: {
	id: string
	name: string
	kind: string
	startDate: Date
	endDate: Date | null
	disciplines: string
	planOutline: { id: string } | null
}): PlanAnchorCandidate {
	return {
		id: event.id,
		name: event.name,
		kind: event.kind as EventKind,
		startDate: event.startDate,
		endDate: event.endDate,
		disciplines: parseEventDisciplines(event.disciplines),
		plannedOutlineId: event.planOutline?.id ?? null,
	}
}

/**
 * Create the dated `fitness-goal` **Event** an athlete with no race plans
 * toward.
 *
 * It goes through the ordinary Event write path and it is an *explicit step the
 * athlete takes* — never created silently behind their back the way Plan
 * Generation used to (ADR 0039, spec #399 story 2). Priority `A`: a goal a whole
 * season is built toward is the season's A-target by construction.
 */
export async function createFitnessGoalEvent(
	athleteId: string,
	input: { name: string; startDate: Date; disciplines: Discipline[] },
): Promise<{ id: string }> {
	const event = await createEvent(athleteId, {
		name: input.name,
		kind: 'fitness-goal',
		priority: 'A',
		startDate: input.startDate,
		endDate: null,
		disciplines: input.disciplines,
		status: 'planned',
	})
	return { id: event.id }
}

/**
 * Author a **Plan Outline** against an Event: its **Plan Start Week**, its
 * phases, and one **Training Track** per Discipline carrying that track's
 * **Volume Currency** and first **Season Anchor** value.
 *
 * The phases arrive one of two ways (`PlanStructureSchema`), and the difference
 * is the whole of what an athlete who does not plan for a living has to do here:
 *
 *   - **A shape they picked.** The preset's phases land, *and so does each
 *     endurance segment's* **Volume Ramp**, **Block Boundary Step** and **Quality
 *     Session Mix** — the same act `applyPreset` performs on a plan that already
 *     exists, moved to where the plan begins. A first plan is therefore a season
 *     with a progression in it rather than a structure waiting to be given one.
 *   - **Phases they typed.** Unchanged: a segment per phase with every rate
 *     **unset**, because a ramp is a choice and a convention stored as though it
 *     had been authored is what ADR 0044 §4 forbids.
 *
 * Both paths lay their segments through {@link layEnduranceSegments}, so "one
 * endurance segment per phase, 1:1" (ADR 0042 §8) has one implementation and a
 * preset cannot land a season shaped differently from a hand-authored one.
 *
 * Written in one transaction, so a half-authored season — phases with no track,
 * or a track with no anchor — is never left behind for the derivation to read.
 * Phases are stored by position and week count with no dates of their own, which
 * is what makes them contiguous by construction (ADR 0044 §3).
 *
 * What a shape still does **not** carry, at creation as everywhere else: the
 * **Plan Start Week**, the tracks, their **Volume Currencies** and their **Season
 * Anchors** are all the athlete's, asked for on the same form and never inferred
 * from the shape. A preset is shape and never size (ADR 0043 §1), and phases stay
 * fixed length — a plan that ends before or after the Event is *shown* by
 * `eventFit` rather than stretched to fit.
 *
 * Malformed input **throws**: the routes parse against the same schema first, so
 * a rejection here means a caller skipped the gate rather than an athlete typing
 * something odd. The refusals in `CreateOutlineRefusal` are the athlete-visible
 * cases, and those come back as results.
 */
export async function createPlanOutline(
	athleteId: string,
	input: PlanOutlineCreateInput,
	now: Date = new Date(),
): Promise<CreateOutlineResult> {
	const plan = PlanOutlineCreateSchema.parse(input)

	const event = await prisma.event.findFirst({
		where: { id: plan.eventId, athleteId },
		select: {
			id: true,
			status: true,
			startDate: true,
			endDate: true,
			planOutline: { select: { id: true } },
		},
	})
	if (!event) return { ok: false, reason: 'event-not-found' }
	if (event.status === 'cancelled') {
		return { ok: false, reason: 'event-cancelled' }
	}
	if ((event.endDate ?? event.startDate) < now) {
		return { ok: false, reason: 'event-past' }
	}
	if (event.planOutline) return { ok: false, reason: 'event-already-planned' }

	// The phases to write, whichever way the athlete said them. A shape's phases are
	// read from `presets.ts` — the same constants `applyPreset` reads — so the two
	// ways into a season cannot drift apart.
	const phases: PhaseLay[] =
		'presetKey' in plan.structure
			? presetFor(plan.structure.presetKey).phases.map((phase) => ({
					name: phase.name,
					weeks: phase.weeks,
					// A preset *chooses* its rhythm and where the taper falls — most of
					// what tells one shape from another — so both are written rather than
					// left to the column defaults. The two **cuts** are written nowhere:
					// unset, the documented convention applies and stays visible as a
					// convention (ADR 0044 §4).
					rhythm: phase.rhythm,
					tapers: phase.tapers,
					ramp: phase.ramp,
					boundaryStep: phase.boundaryStep,
					mix: phase.mix,
				}))
			: plan.structure.phases.map((phase) => ({
					...phase,
					// Every rate unset, which is what a hand-authored phase has always
					// opened with.
					ramp: null,
					boundaryStep: null,
					mix: [],
				}))

	try {
		// Three writes rather than one nested create, because an endurance segment
		// references the phase it spans and no phase has an id until it exists, and
		// `layEnduranceSegments` reads the tracks it lays under. All inside one
		// transaction, so the alternative — an Outline whose tracks carry no segments
		// — is never left behind.
		const outline = await prisma.$transaction(async (tx) => {
			const created = await tx.planOutline.create({
				data: {
					eventId: event.id,
					startWeekKey: plan.startWeekKey,
					phases: {
						// `rhythm` and `tapers` are passed only where they were authored or
						// chosen by a shape: omitted, the column's documented default
						// applies, so no convention is stored as though it had been chosen
						// (ADR 0044 §4).
						create: phases.map((phase, orderIndex) => ({
							orderIndex,
							name: phase.name,
							weeks: phase.weeks,
							...(phase.rhythm == null ? {} : { rhythm: phase.rhythm }),
							...(phase.tapers == null ? {} : { tapers: phase.tapers }),
						})),
					},
				},
				select: {
					id: true,
					phases: { select: { id: true }, orderBy: { orderIndex: 'asc' } },
				},
			})

			for (const track of plan.tracks) {
				await tx.trainingTrack.create({
					data: {
						outlineId: created.id,
						discipline: track.discipline,
						currency: track.currency,
						// The first anchor takes effect from the plan's own first week; a
						// later re-anchor is a second dated segment, never an edit of this
						// one (ADR 0040 §5).
						anchors: {
							create: [
								{ fromWeekKey: plan.startWeekKey, value: track.anchorValue },
							],
						},
					},
				})
			}

			// An endurance track gets one segment per phase, 1:1 (ADR 0042 §8), so the
			// progression is authorable from the moment the plan exists rather than
			// after a second act the athlete has to discover. A strength track gets
			// none: its segments are dated and float free of the phases (ADR 0047 §6),
			// and the helper holds that rule for every caller.
			await layEnduranceSegments(
				tx,
				created.id,
				created.phases.map((phase, index) => ({
					phaseId: phase.id,
					ramp: phases[index]!.ramp,
					boundaryStep: phases[index]!.boundaryStep,
					mix: phases[index]!.mix,
				})),
			)

			return created
		})

		return { ok: true, outlineId: outline.id }
	} catch (error) {
		// Two submissions can race past the check above — a double-tapped Create, or
		// two tabs — and `PlanOutline.eventId` is unique, so the loser's insert
		// aborts. That is the same athlete-visible state the check found, so it comes
		// back as the same refusal rather than as an exception: one plan per Event
		// either way, and the second submission is told why.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === 'P2002'
		) {
			return { ok: false, reason: 'event-already-planned' }
		}
		throw error
	}
}

// ── Authoring a second Training Track, and taking one away (#414) ────────────
// A plan's tracks are not fixed at creation. A runner who takes up lifting authors
// a strength track over the season they already have; a triathlete authors four
// over **one** shared phase timeline (ADR 0043 §1). Both operations here are about
// the *set* of tracks and never about what one track authors — a currency is still
// immutable, and neither of these is a way to change one.
//
// The pair is deliberately add-and-remove rather than an edit. ADR 0044 §8 makes
// changing a **Volume Currency** re-authoring; offering "remove this track, author
// another" is that, said in operations the athlete can see, rather than a field
// that silently rewrites the unit of weeks already lived.

export type AddTrackRefusal =
	/** Not this athlete's plan, or no plan at all — the same reading either way. */
	| 'outline-not-found'
	/**
	 * The plan already measures this Discipline. One track per Discipline is the
	 * database's rule (`@@unique([outlineId, discipline])`, ADR 0043 §1); this is
	 * that constraint said in a sentence the athlete can act on.
	 */
	| 'discipline-already-tracked'

export type AddTrackResult =
	| { ok: true; trackId: string }
	| { ok: false; reason: AddTrackRefusal }

/**
 * Add one **Training Track** to an existing plan: its Discipline, its **Volume
 * Currency** and its first **Season Anchor**, in one act (ADR 0043 §2).
 *
 * The new track joins the phase timeline the plan already has — an endurance one
 * gets a segment per phase, the 1:1 of ADR 0042 §8, every rate unset so no
 * convention is stored as though it had been authored (ADR 0044 §4); a strength
 * track gets none, because its blocks are dated and float free of the phases
 * (ADR 0047 §6) and are added one at a time.
 *
 * The anchor is dated to the **Plan Start Week** rather than to today, for the
 * reason the derivation is over 0-based week indices at all: a track anchored
 * mid-season would price nothing before that week, and the athlete has not said
 * their season started later. Re-anchoring is `setSeasonAnchorValue`'s.
 */
export async function addTrack(
	athleteId: string,
	input: TrackAddInput,
): Promise<AddTrackResult> {
	const track = TrackAddSchema.parse(input)

	const outline = await prisma.planOutline.findFirst({
		where: { id: track.outlineId, event: { athleteId } },
		select: {
			id: true,
			startWeekKey: true,
			phases: { select: { id: true }, orderBy: { orderIndex: 'asc' } },
			tracks: { select: { discipline: true } },
		},
	})
	if (!outline) return { ok: false, reason: 'outline-not-found' }
	if (outline.tracks.some((row) => row.discipline === track.discipline)) {
		return { ok: false, reason: 'discipline-already-tracked' }
	}

	try {
		const created = await prisma.trainingTrack.create({
			data: {
				outlineId: outline.id,
				discipline: track.discipline,
				currency: track.currency,
				anchors: {
					create: [
						{ fromWeekKey: outline.startWeekKey, value: track.anchorValue },
					],
				},
				...(isCardioDiscipline(track.discipline)
					? {
							segments: {
								create: outline.phases.map((phase) => ({
									kind: 'endurance',
									phaseId: phase.id,
								})),
							},
						}
					: {}),
			},
			select: { id: true },
		})
		return { ok: true, trackId: created.id }
	} catch (error) {
		// Two tabs, or a double-tapped Add: the unique index is what actually holds
		// one track per Discipline, and the loser's insert aborts. Reported as the
		// same refusal the check above found, because it is the same athlete-visible
		// state.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === 'P2002'
		) {
			return { ok: false, reason: 'discipline-already-tracked' }
		}
		throw error
	}
}

export type RemoveTrackRefusal =
	| 'track-not-found'
	/**
	 * The plan's last track. A Plan Outline with no track measures nothing — the
	 * create schema requires one for the same reason — so the honest action for an
	 * athlete who wants none is to delete the plan, which is its own operation and
	 * says what it takes with it.
	 */
	| 'last-track'

export type RemoveTrackResult =
	| { ok: true }
	| { ok: false; reason: RemoveTrackRefusal }

/**
 * Remove a **Training Track** and everything authored on it — its **Season
 * Anchor** segments, its segments and their **Quality Session Mix**, its hand-set
 * weeks, and any **Week Pattern** day that drew from it.
 *
 * All of that goes by cascade rather than by a walk here, which is the schema's
 * statement that none of those rows means anything without the track: a mix
 * belongs to a segment, a segment to a track, and a pattern day that draws from a
 * track the plan no longer has is a day with no volume to take a share of
 * (ADR 0044 §7).
 *
 * The plan's **phases** are untouched. They carry no volume, no unit and no
 * Discipline (ADR 0041), so a season keeps its shape when one of the things
 * measured over it goes away — which is what makes the **Season Span** headline
 * re-group rather than collapse (ADR 0043 §5).
 */
export async function removeTrack(
	athleteId: string,
	input: TrackRemoveInput,
): Promise<RemoveTrackResult> {
	const removal = TrackRemoveSchema.parse(input)

	const track = await prisma.trainingTrack.findFirst({
		where: { id: removal.trackId, outline: { event: { athleteId } } },
		select: {
			id: true,
			outline: { select: { _count: { select: { tracks: true } } } },
		},
	})
	if (!track) return { ok: false, reason: 'track-not-found' }
	if (track.outline._count.tracks <= 1) {
		return { ok: false, reason: 'last-track' }
	}

	await prisma.trainingTrack.delete({ where: { id: track.id } })
	return { ok: true }
}

// ── Re-anchoring a track mid-season (#407) ───────────────────────────────────
// Seasons do not go to plan, and the **Season Anchor** is an ordered list of dated
// segments precisely so that saying "from this week on, I am starting from here"
// never rewrites the weeks the athlete already lived (ADR 0040 §5). The two
// operations below are the whole of authoring that list, and between them they hold
// the three rules the storage cannot:
//
// - **A segment is `(fromWeekKey, value)` and never a unit.** The unit is the
//   track's **Volume Currency**, fixed for the track's life, so a re-anchor is not
//   an escape hatch for changing it — that stays re-authoring (ADR 0043, ADR 0044
//   §8).
// - **Two anchors cannot take effect in the same week.** That is
//   `@@unique([trackId, fromWeekKey])`, which is why setting is an *upsert*: a
//   second thought about the same week is an edit of that segment rather than a
//   second statement about it, and two tabs cannot leave two answers behind.
// - **The earliest segment stays.** Removing it would leave every week before the
//   next one with no anchor in force — an **Unavailable Metric** across the opening
//   of a season the athlete never asked to un-plan (see
//   {@link removeSeasonAnchorSegment}).
//
// Nothing per week is written by either. The ramp restarting at a re-anchor, the
// boundary step it swallows and the weeks before it holding still are all
// `derive.ts`'s, re-derived on the next read (ADR 0040 §1, §3).

/**
 * Why authoring a **Season Anchor** segment was refused — athlete-visible states,
 * all wordable, so none is an exception.
 *
 * `track-not-found` covers another athlete's track as well as a missing one, the
 * same reading every other write in this module gives it.
 *
 * Neither operation can refuse for every reason in it, and the two results below
 * say which by subtraction rather than by re-listing members: `week-outside-plan`
 * is the *set* path's alone, and the two absences are the *remove* path's.
 */
export type SeasonAnchorRefusal =
	| 'track-not-found'
	| 'week-outside-plan'
	| 'anchor-not-found'
	| 'earliest-anchor'

export type SetSeasonAnchorResult =
	| { ok: true }
	| {
			ok: false
			reason: Exclude<
				SeasonAnchorRefusal,
				'anchor-not-found' | 'earliest-anchor'
			>
	  }

export type RemoveSeasonAnchorResult =
	| { ok: true }
	| { ok: false; reason: Exclude<SeasonAnchorRefusal, 'week-outside-plan'> }

/**
 * Set a **Season Anchor** segment's value for a track, adding the segment where
 * that week has none — the write behind both authoring the season's opening level
 * and re-anchoring it mid-season (ADR 0040 §5).
 *
 * Value only: the unit is the track's **Volume Currency** and is not this
 * operation's to touch (ADR 0043, ADR 0044 §8). `SeasonAnchorSetSchema` is
 * `.strict()`, so a caller that smuggles a `currency` key in at runtime — from a
 * form body, say — is rejected rather than silently ignored.
 *
 * **The week has to be one of the plan's**, which is the one check
 * `setWeekVolumeOverride` and this share, and it matters more here: an anchor keyed
 * *before* the **Plan Start Week** would be in force over every week of the season
 * while appearing on none of them, quietly governing a plan from outside it. An
 * anchor keyed past the last week would govern nothing at all. Neither is a state
 * the athlete can see, so neither is one they can undo.
 *
 * Nothing else is written. A **Week Volume Override** the athlete authored before
 * this call survives it untouched — an override is a leaf and outranks the rule
 * (ADR 0044 §5), so deleting one because the rule underneath it moved would be
 * exactly the silent overwrite dated anchors exist to stop.
 */
export async function setSeasonAnchorValue(
	athleteId: string,
	input: SeasonAnchorSetInput,
): Promise<SetSeasonAnchorResult> {
	const anchor = SeasonAnchorSetSchema.parse(input)

	const track = await ownedTrackWithSpan(athleteId, anchor.trackId)
	if (!track) return { ok: false, reason: 'track-not-found' }
	if (!weekWithinPlan(track.outline, anchor.fromWeekKey)) {
		return { ok: false, reason: 'week-outside-plan' }
	}

	await prisma.seasonAnchorSegment.upsert({
		where: {
			trackId_fromWeekKey: {
				trackId: track.id,
				fromWeekKey: anchor.fromWeekKey,
			},
		},
		create: {
			trackId: track.id,
			fromWeekKey: anchor.fromWeekKey,
			value: anchor.value,
		},
		update: { value: anchor.value },
	})

	return { ok: true }
}

/**
 * Remove a **Season Anchor** segment — the athlete taking a re-anchor back.
 *
 * **The earliest segment refuses.** Every week from a season's opening to its next
 * re-anchor is derived from it, so removing it would not "undo a re-anchor": it
 * would leave the whole opening stretch of the plan Unavailable, which is the one
 * outcome a delete button must not produce by surprise. Lowering the opening level
 * is an *edit* of that segment's value, and undoing a re-anchor is removing the
 * later one — both are reachable, and neither is this.
 *
 * That rule lives here and not in the database because SQLite cannot express it
 * without a trigger, and this repo has none: a CHECK cannot see the other rows of
 * the table. The unique index still carries the rule it *can* enforce — one anchor
 * per week per track — so the two halves sit at the level each can be stated at.
 *
 * **No span check, unlike `setSeasonAnchorValue`.** The two are not symmetric,
 * because removing takes state away: a re-anchor left outside the plan by a
 * shortened phase is the case that most needs taking back, and a span-checked
 * delete would strand it. This is `clearWeekVolumeOverride`'s reasoning exactly.
 */
export async function removeSeasonAnchorSegment(
	athleteId: string,
	input: SeasonAnchorRemoveInput,
): Promise<RemoveSeasonAnchorResult> {
	const remove = SeasonAnchorRemoveSchema.parse(input)

	// The track's whole anchor list, because "is this the earliest one" is a
	// question about the siblings and not about the row. Ordered by the week key,
	// which sorts chronologically because it is `YYYY-MM-DD`.
	const track = await prisma.trainingTrack.findFirst({
		where: { id: remove.trackId, outline: { event: { athleteId } } },
		select: {
			id: true,
			anchors: {
				select: { fromWeekKey: true },
				orderBy: { fromWeekKey: 'asc' },
			},
		},
	})
	if (!track) return { ok: false, reason: 'track-not-found' }

	const held = track.anchors.some(
		(anchor) => anchor.fromWeekKey === remove.fromWeekKey,
	)
	if (!held) return { ok: false, reason: 'anchor-not-found' }
	if (track.anchors[0]?.fromWeekKey === remove.fromWeekKey) {
		return { ok: false, reason: 'earliest-anchor' }
	}

	await prisma.seasonAnchorSegment.deleteMany({
		where: { trackId: track.id, fromWeekKey: remove.fromWeekKey },
	})

	return { ok: true }
}

// ── Hand-setting one week: the Week Volume Override (#406) ───────────────────
// The athlete overruling the rule for a single week (ADR 0044 §5). Both operations
// below are one action on one week of one track, and between them they hold the two
// rules the storage cannot:
//
// - **`0` is a value, not a clear.** A week without training is a thing an athlete
//   means, so `WeekVolumeOverrideSetSchema` floors the value at zero and reverting
//   is its own operation rather than a magic number.
// - **A row is keyed to a week the plan contains.** `weekTarget`'s short-circuit is
//   total, so it hands back an override's value for *any* week the row exists on.
//   That is right for the derivation — an override outranks the rule, and the rule
//   is what knows about spans — and it is why the span check belongs here, where
//   the Outline's `startWeekKey` and phase lengths are in hand. It gates **authoring
//   only**: clearing removes state, and a hand-set week must always be clearable
//   (see {@link clearWeekVolumeOverride}).
//
// Nothing about the *rest* of the season is written: an override is a leaf, so the
// following weeks are re-derived from the anchor and the ramps on the next read.

/**
 * Why hand-setting or reverting a week was refused — athlete-visible states, all
 * wordable, so none is an exception.
 *
 * `track-not-found` covers another athlete's track as well as a missing one, the
 * same reading `setSeasonAnchorValue` gives it. `override-not-found` is the only
 * one here that is not an absence of the *track*: the week simply was never
 * hand-set, which a stale reading's revert button can hit.
 *
 * Neither operation can refuse for every reason in it, and the two results below say
 * which by subtraction rather than by re-listing members: `week-outside-plan` is the
 * *set* path's alone, and `override-not-found` the *clear* path's.
 */
export type WeekVolumeOverrideRefusal =
	| 'track-not-found'
	| 'week-outside-plan'
	| 'override-not-found'

export type SetWeekVolumeOverrideResult =
	| { ok: true }
	| {
			ok: false
			reason: Exclude<WeekVolumeOverrideRefusal, 'override-not-found'>
	  }

export type ClearWeekVolumeOverrideResult =
	| { ok: true }
	| {
			ok: false
			reason: Exclude<WeekVolumeOverrideRefusal, 'week-outside-plan'>
	  }

/**
 * One track with the span of the plan it belongs to, or null when the track is not
 * the caller's — the ownership join every write here makes, widened by what
 * **authoring** a week-scoped row has to check the week against. Shared by the two
 * writes that key a row to a week: a **Week Volume Override** and a **Season
 * Anchor** segment.
 *
 * The phases come along rather than a stored length, because a plan has none: its
 * span is the sum of its phases' weeks (ADR 0044 §3), which is the same reading
 * `seasonWeeks` gives every phase edit in this module.
 */
async function ownedTrackWithSpan(
	athleteId: string,
	trackId: string,
): Promise<{
	id: string
	outline: { startWeekKey: string; phases: Array<{ weeks: number }> }
} | null> {
	return prisma.trainingTrack.findFirst({
		where: { id: trackId, outline: { event: { athleteId } } },
		select: {
			id: true,
			outline: {
				select: { startWeekKey: true, phases: { select: { weeks: true } } },
			},
		},
	})
}

/**
 * Whether `weekKey` is one of the plan's own Training Weeks: at or after the **Plan
 * Start Week**, and before the week the phases run out on.
 *
 * Half-open on purpose — a thirteen-week plan holds weeks 0…12, so the week at
 * index 13 is the first one outside it.
 */
function weekWithinPlan(
	outline: { startWeekKey: string; phases: Array<{ weeks: number }> },
	weekKey: string,
): boolean {
	const weekIndex = weekIndexOf(outline.startWeekKey, weekKey)
	return weekIndex >= 0 && weekIndex < seasonWeeks(outline.phases)
}

/**
 * Hand-set one week's volume target — author a **Week Volume Override**.
 *
 * The value is the week's *final* target and takes no role factor on top, which is
 * the derivation's business rather than this write's: what is stored is exactly the
 * number the athlete typed, `0` included.
 *
 * Upserted on `@@unique([trackId, weekKey])`, so a second thought about the same
 * week is an edit rather than a second statement about it — and two tabs cannot
 * leave two answers behind.
 */
export async function setWeekVolumeOverride(
	athleteId: string,
	input: WeekVolumeOverrideSetInput,
): Promise<SetWeekVolumeOverrideResult> {
	const set = WeekVolumeOverrideSetSchema.parse(input)

	const track = await ownedTrackWithSpan(athleteId, set.trackId)
	if (!track) return { ok: false, reason: 'track-not-found' }
	if (!weekWithinPlan(track.outline, set.weekKey)) {
		return { ok: false, reason: 'week-outside-plan' }
	}

	await prisma.weekVolumeOverride.upsert({
		where: { trackId_weekKey: { trackId: track.id, weekKey: set.weekKey } },
		create: { trackId: track.id, weekKey: set.weekKey, value: set.value },
		update: { value: set.value },
	})

	return { ok: true }
}

/**
 * Revert one week to the rule — remove its **Week Volume Override**.
 *
 * The row is deleted rather than blanked, so the week is derived again by the
 * anchor and the ramps in force at the time it is next read (ADR 0044 §5). A week
 * that was never hand-set refuses: there is nothing to revert, and saying so is how
 * a revert offered from a stale reading gets an answer instead of a false success.
 *
 * **No span check, unlike `setWeekVolumeOverride`.** The two are not symmetric,
 * because clearing *removes* state: a week the plan no longer contains is exactly
 * the case that has to stay clearable. A phase shrinking can leave a legally
 * authored override outside the span, where the Weeks reading no longer shows it —
 * and a span-checked clear would make that row unrevertible and let it silently
 * re-apply the moment the season lengthened again. "An override can be cleared,
 * restoring the derived value" is unconditional. Ownership is still checked; only
 * the *week* goes unquestioned.
 */
export async function clearWeekVolumeOverride(
	athleteId: string,
	input: WeekVolumeOverrideClearInput,
): Promise<ClearWeekVolumeOverrideResult> {
	const clear = WeekVolumeOverrideClearSchema.parse(input)

	// Ownership only — the plan's span is none of a delete's business, so this is a
	// bare join rather than `ownedTrackWithSpan`'s, exactly as
	// `removeSeasonAnchorSegment`'s is.
	const track = await prisma.trainingTrack.findFirst({
		where: { id: clear.trackId, outline: { event: { athleteId } } },
		select: { id: true },
	})
	if (!track) return { ok: false, reason: 'track-not-found' }

	const deleted = await prisma.weekVolumeOverride.deleteMany({
		where: { trackId: track.id, weekKey: clear.weekKey },
	})
	return deleted.count === 0
		? { ok: false, reason: 'override-not-found' }
		: { ok: true }
}

// ── Editing the phase structure (#402) ───────────────────────────────────────
// The season's shape is the athlete's, not whatever they typed on the way in. Each
// operation below is *one* action on *one* phase — never a whole-season save — and
// each holds the two invariants the structure rests on:
//
// - **Contiguity.** A phase stores a position and a week count, so a gap or an
//   overlap is unrepresentable (ADR 0044 §3). Every edit that changes the sequence
//   renumbers it to 0…n−1, which is the only shape the season can be stored in.
// - **The Plan Start Week does not move.** It is authored on the Outline and never
//   touched here, so adding or resizing a phase grows the season *forward* rather
//   than backward over weeks the athlete has already lived.
//
// Nothing per week is written by any of them: the targets, the week roles and the
// phase spans are re-derived on the next read (ADR 0040 §1).

/**
 * Why a phase edit was refused — the athlete-visible states, all of them
 * wordable, so none is an exception.
 *
 * `phase-not-found` and `outline-not-found` cover another athlete's rows as well
 * as missing ones: a row that is not the caller's reads as absent rather than as
 * forbidden.
 */
export type PhaseEditRefusal =
	| 'outline-not-found'
	| 'phase-not-found'
	| 'plan-too-long'
	| 'last-phase'
	| 'at-the-edge'

type Refused<Reason extends PhaseEditRefusal> = { ok: false; reason: Reason }

export type AddPhaseResult =
	| { ok: true; phaseId: string }
	| Refused<'outline-not-found' | 'plan-too-long'>
export type RenamePhaseResult = { ok: true } | Refused<'phase-not-found'>
export type ResizePhaseResult =
	| { ok: true }
	| Refused<'phase-not-found' | 'plan-too-long'>
export type SetPhaseRhythmResult = { ok: true } | Refused<'phase-not-found'>
export type MovePhaseResult =
	| { ok: true }
	| Refused<'phase-not-found' | 'at-the-edge'>
export type RemovePhaseResult =
	| { ok: true }
	| Refused<'phase-not-found' | 'last-phase'>
export type DeleteOutlineResult = { ok: true } | Refused<'outline-not-found'>

/** One phase as every edit here reads it: its identity and its span. */
type PhaseRow = { id: string; weeks: number }

/**
 * Write `orderedIds`' positions as 0…n−1 through `setPosition` — **in two passes**.
 *
 * The two passes are the whole point, and the reason is uniqueness: **SQLite defers
 * no uniqueness**, so writing a permutation one row at a time collides with whichever
 * sibling still holds the position being written. Parking every row at a negative
 * index first — a range no stored row uses — makes any permutation writable.
 *
 * One walk for all three sequences that need it (the season's phases, an Outline's
 * Week Patterns, a weekday's pattern days), because the two-pass dance is the whole
 * of what they share; each caller keeps its own docstring naming the unique index it
 * is dodging.
 */
async function renumber(
	orderedIds: string[],
	setPosition: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
	for (const [index, id] of orderedIds.entries()) {
		await setPosition(id, -1 - index)
	}
	for (const [index, id] of orderedIds.entries()) {
		await setPosition(id, index)
	}
}

/**
 * Write `orderedIds`' positions as 0…n−1 — the whole of how the season stays
 * contiguous through an insert, a move or a removal.
 *
 * Two passes ({@link renumber}), and the reason is `@@unique([outlineId,
 * orderIndex])`: SQLite has no deferred uniqueness, so a single shift collides with
 * whichever sibling still holds the position being written.
 */
async function renumberPhases(
	tx: Prisma.TransactionClient,
	orderedIds: string[],
): Promise<void> {
	await renumber(orderedIds, (id, orderIndex) =>
		tx.planOutlinePhase.update({ where: { id }, data: { orderIndex } }),
	)
}

/**
 * One phase of the athlete's endurance progression, as it is laid down: the phase
 * it spans, and whatever the caller has to say about the rate over it.
 *
 * A bare `{ phaseId }` is the ordinary case — a phase added by hand opens with
 * every rate unset, so the progression is authorable the moment it exists and no
 * convention is stored as though it had been chosen (ADR 0044 §4). A preset fills
 * the rest in.
 */
/**
 * A phase as {@link createPlanOutline} lays it: what the phase itself stores, plus
 * what its endurance segment authors. The two halves travel together because an
 * endurance segment spans exactly one phase (ADR 0042 §8) — the same pairing
 * `PresetPhase` keeps, which is what lets a shape land through this type unchanged.
 */
type PhaseLay = PhaseCreateInput &
	Pick<EnduranceSegmentLay, 'ramp' | 'boundaryStep' | 'mix'>

type EnduranceSegmentLay = {
	phaseId: string
	ramp?: number | null
	boundaryStep?: number | null
	mix?: Array<{ zone: number; sessionsPerWeek: number }>
}

/**
 * Lay one endurance segment per phase on every **endurance** track of an Outline
 * — the 1:1 of ADR 0042 §8.
 *
 * The three callers that reach here — a plan being created, a phase added by hand
 * and a preset applied — differ only in what they have to say about the rate, so
 * they share the walk rather than each keeping their own copy of "find the tracks,
 * skip the strength ones, create a segment". A strength track gets none: its
 * segments are dated and float free of the phases (ADR 0047 §6).
 */
async function layEnduranceSegments(
	tx: Prisma.TransactionClient,
	outlineId: string,
	phases: EnduranceSegmentLay[],
): Promise<void> {
	const tracks = await tx.trainingTrack.findMany({
		where: { outlineId },
		select: { id: true, discipline: true },
	})
	for (const track of tracks) {
		if (!isCardioDiscipline(track.discipline as Discipline)) continue
		for (const phase of phases) {
			await tx.trainingTrackSegment.create({
				data: {
					kind: 'endurance',
					trackId: track.id,
					phaseId: phase.phaseId,
					ramp: phase.ramp ?? null,
					boundaryStep: phase.boundaryStep ?? null,
					...(phase.mix?.length ? { mix: { create: phase.mix } } : {}),
				},
			})
		}
	}
}

/** One Outline's phases in authored order — the sequence every edit renumbers. */
async function phasesOf(
	tx: Prisma.TransactionClient,
	outlineId: string,
): Promise<PhaseRow[]> {
	return tx.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: { id: true, weeks: true },
	})
}

/** The Outline's phases in authored order, or null when it is not the athlete's. */
async function ownedPhases(
	tx: Prisma.TransactionClient,
	athleteId: string,
	outlineId: string,
): Promise<PhaseRow[] | null> {
	const outline = await tx.planOutline.findFirst({
		where: { id: outlineId, event: { athleteId } },
		select: { id: true },
	})
	if (!outline) return null
	return phasesOf(tx, outlineId)
}

/** One phase with its siblings in order, or null when it is not the athlete's. */
async function ownedPhaseWithSiblings(
	tx: Prisma.TransactionClient,
	athleteId: string,
	phaseId: string,
): Promise<{ phase: PhaseRow; siblings: PhaseRow[] } | null> {
	const phase = await tx.planOutlinePhase.findFirst({
		where: { id: phaseId, outline: { event: { athleteId } } },
		select: { id: true, weeks: true, outlineId: true },
	})
	if (!phase) return null
	return {
		phase: { id: phase.id, weeks: phase.weeks },
		siblings: await phasesOf(tx, phase.outlineId),
	}
}

/**
 * The season's length: the sum of its phases' weeks, since a phase stores a count
 * and no dates and the plan's length is their consequence (ADR 0044 §3).
 *
 * Takes anything carrying a week count rather than a {@link PhaseRow}, because
 * every caller reads the phases for their spans alone — a week-scoped write needs
 * the season's span without needing the phases' identities.
 */
function seasonWeeks(phases: Array<{ weeks: number }>): number {
	return phases.reduce((sum, phase) => sum + phase.weeks, 0)
}

/**
 * Add a phase at a position in the season.
 *
 * The new phase is created at the one position that is certainly free — the end —
 * and then renumbered into place, so an insert never needs a hole to be opened
 * first. A position past the last phase appends: an insert is *between* phases, and
 * there is no such thing as a gap to fall into.
 */
export async function addPhase(
	athleteId: string,
	input: PhaseAddInput,
): Promise<AddPhaseResult> {
	const add = PhaseAddSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const phases = await ownedPhases(tx, athleteId, add.outlineId)
		if (!phases) return { ok: false as const, reason: 'outline-not-found' }
		if (seasonWeeks(phases) + add.weeks > MAX_PLAN_WEEKS) {
			return { ok: false as const, reason: 'plan-too-long' }
		}

		const created = await tx.planOutlinePhase.create({
			data: {
				outlineId: add.outlineId,
				orderIndex: phases.length,
				name: add.name,
				weeks: add.weeks,
				// Passed only where the athlete authored them, so the column's documented
				// default applies rather than a convention stored as a choice (ADR 0044 §4).
				...(add.rhythm == null ? {} : { rhythm: add.rhythm }),
				...(add.tapers == null ? {} : { tapers: add.tapers }),
			},
			select: { id: true },
		})

		// The new phase joins the endurance tracks' 1:1 with every rate unset, the
		// same way `createPlanOutline` lays the first segments down.
		await layEnduranceSegments(tx, add.outlineId, [{ phaseId: created.id }])

		const order = phases.map((phase) => phase.id)
		order.splice(Math.min(add.atIndex, order.length), 0, created.id)
		await renumberPhases(tx, order)

		return { ok: true as const, phaseId: created.id }
	})
}

/** Rename a phase. The name is intent, and no derived quantity depends on it. */
export async function renamePhase(
	athleteId: string,
	input: PhaseRenameInput,
): Promise<RenamePhaseResult> {
	const rename = PhaseRenameSchema.parse(input)
	const updated = await prisma.planOutlinePhase.updateMany({
		where: { id: rename.phaseId, outline: { event: { athleteId } } },
		data: { name: rename.name },
	})
	return updated.count === 0
		? { ok: false, reason: 'phase-not-found' }
		: { ok: true }
}

/**
 * Resize a phase. The phases after it slide, because none of them stores a date;
 * the plan's start stays where it was authored (ADR 0044 §3).
 */
export async function resizePhase(
	athleteId: string,
	input: PhaseResizeInput,
): Promise<ResizePhaseResult> {
	const resize = PhaseResizeSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const owned = await ownedPhaseWithSiblings(tx, athleteId, resize.phaseId)
		if (!owned) return { ok: false as const, reason: 'phase-not-found' }
		const after = seasonWeeks(owned.siblings) - owned.phase.weeks + resize.weeks
		if (after > MAX_PLAN_WEEKS) {
			return { ok: false as const, reason: 'plan-too-long' }
		}

		await tx.planOutlinePhase.update({
			where: { id: owned.phase.id },
			data: { weeks: resize.weeks },
		})
		return { ok: true as const }
	})
}

/**
 * Set a phase's loading rhythm and whether it tapers — *when* its weeks recover,
 * never how deeply, which is the track segment's (ADR 0044 §4).
 */
export async function setPhaseRhythm(
	athleteId: string,
	input: PhaseRhythmSetInput,
): Promise<SetPhaseRhythmResult> {
	const set = PhaseRhythmSetSchema.parse(input)
	const updated = await prisma.planOutlinePhase.updateMany({
		where: { id: set.phaseId, outline: { event: { athleteId } } },
		data: { rhythm: set.rhythm, tapers: set.tapers },
	})
	return updated.count === 0
		? { ok: false, reason: 'phase-not-found' }
		: { ok: true }
}

/** Move a phase one position earlier or later, swapping with its neighbour. */
export async function movePhase(
	athleteId: string,
	input: PhaseMoveInput,
): Promise<MovePhaseResult> {
	const move = PhaseMoveSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const owned = await ownedPhaseWithSiblings(tx, athleteId, move.phaseId)
		if (!owned) return { ok: false as const, reason: 'phase-not-found' }

		const order = owned.siblings.map((phase) => phase.id)
		const from = order.indexOf(owned.phase.id)
		const to = move.direction === 'earlier' ? from - 1 : from + 1
		// The first phase has nothing earlier and the last has nothing later. Refused
		// rather than silently ignored, so a stale reading's button says why.
		if (to < 0 || to >= order.length) {
			return { ok: false as const, reason: 'at-the-edge' }
		}

		order[from] = order[to]!
		order[to] = owned.phase.id
		await renumberPhases(tx, order)

		return { ok: true as const }
	})
}

/**
 * Remove a phase. The phases after it close the gap by renumbering, so the season
 * is contiguous the moment the row is gone.
 *
 * The endurance **Training Track segments** measured over this phase go with it —
 * the schema cascades them, and a segment spans exactly one phase (ADR 0042 §8), so
 * there is nothing for them to span once the phase is removed. The **Plan Start
 * Week**, the tracks and their **Season Anchors** are untouched.
 */
export async function removePhase(
	athleteId: string,
	input: PhaseRemoveInput,
): Promise<RemovePhaseResult> {
	const remove = PhaseRemoveSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const owned = await ownedPhaseWithSiblings(tx, athleteId, remove.phaseId)
		if (!owned) return { ok: false as const, reason: 'phase-not-found' }
		// A plan has at least one phase — the rule `PlanOutlineCreateSchema` holds at
		// creation, held here too. An athlete who wants no phases wants no plan, and
		// that is `deletePlanOutline`.
		if (owned.siblings.length === 1) {
			return { ok: false as const, reason: 'last-phase' }
		}

		await tx.planOutlinePhase.delete({ where: { id: owned.phase.id } })
		await renumberPhases(
			tx,
			owned.siblings
				.filter((phase) => phase.id !== owned.phase.id)
				.map((phase) => phase.id),
		)
		return { ok: true as const }
	})
}

export type ApplyPresetResult =
	| { ok: true }
	| { ok: false; reason: 'outline-not-found' }

/**
 * Apply a **periodization preset**: replace the Outline's phase structure with the
 * preset's, and lay each endurance track's segments down under it.
 *
 * **It copies the shape in, and nothing stays linked.** What lands is ordinary
 * phases and ordinary segments, editable afterwards through every path on this
 * module. Nothing records where they came from — no `presetKey` column, no
 * reference back (ADR 0044 §2, #371) — so a later edit to the constants in
 * `presets.ts` cannot reach a season that was authored from them. That is the
 * property the surface states out loud: it's yours now, edit anything.
 *
 * **One transaction**, because the half-applied state is a real one: phases with
 * no segments under them would leave the progression unauthorable on exactly the
 * weeks the preset exists to shape.
 *
 * What the preset **replaces**: the phases, and by cascade the endurance segments
 * measured over them together with their **Quality Session Mix** entries. Picking
 * a shape is picking a shape, so there is nothing of the old one left to reconcile
 * against the new.
 *
 * What it **leaves alone**, because a preset asserts none of them:
 *
 *   - the **Plan Start Week** and the Event — a preset carries no `startWeekKey`,
 *     and the plan ending before or after the Event is a reading the surface
 *     shows (`eventFit`) rather than something applying corrects;
 *   - the tracks, their **Volume Currencies** and their **Season Anchors** — a
 *     preset is shape and never size;
 *   - any **Week Volume Override** the athlete hand-set, which is a leaf they
 *     authored about a particular week (ADR 0044 §5);
 *   - a strength segment, which carries no `phaseId` and floats free of the
 *     phases (ADR 0047 §6), so no phase's removal reaches it.
 *
 * Phases are **fixed length**: the preset's own week counts land as authored, and
 * nothing here stretches them to fill the run-in to the Event.
 */
export async function applyPreset(
	athleteId: string,
	input: PresetApplyInput,
): Promise<ApplyPresetResult> {
	const apply = PresetApplySchema.parse(input)
	// Total over the parsed key: `PresetApplySchema` admits the shipped keys and
	// nothing else, so there is no unknown-preset case for a caller to handle.
	const preset = presetFor(apply.presetKey)

	return prisma.$transaction(async (tx) => {
		const outline = await tx.planOutline.findFirst({
			where: { id: apply.outlineId, event: { athleteId } },
			select: { id: true },
		})
		if (!outline) return { ok: false as const, reason: 'outline-not-found' }

		await tx.planOutlinePhase.deleteMany({ where: { outlineId: outline.id } })

		// Created in order, so `orderIndex` needs no renumbering pass: the phases
		// that would have collided are already gone.
		const created: Array<{ id: string; phase: PresetPhase }> = []
		for (const [orderIndex, phase] of preset.phases.entries()) {
			const row = await tx.planOutlinePhase.create({
				data: {
					outlineId: outline.id,
					orderIndex,
					name: phase.name,
					// `rhythm` and `tapers` are written explicitly rather than left to the
					// column defaults, because a preset *chooses* them — the rhythm and
					// where the taper falls are most of what distinguishes one shape from
					// another. The two **cuts** are the opposite case and are written
					// nowhere below: unset, the documented convention applies and stays
					// visible as a convention (ADR 0044 §4).
					weeks: phase.weeks,
					rhythm: phase.rhythm,
					tapers: phase.tapers,
				},
				select: { id: true },
			})
			created.push({ id: row.id, phase })
		}

		// A preset says nothing about lifting, so a strength track gets nothing — the
		// same rule the hand-added phase follows, held in one place.
		await layEnduranceSegments(
			tx,
			outline.id,
			created.map(({ id, phase }) => ({
				phaseId: id,
				ramp: phase.ramp,
				boundaryStep: phase.boundaryStep,
				mix: phase.mix,
			})),
		)

		return { ok: true as const }
	})
}

/**
 * Delete a Plan Outline.
 *
 * What goes: the Outline and everything hanging off it — phases, tracks, anchors,
 * segments, overrides and week patterns, all by cascade.
 *
 * What stays: the **Event**, which is the Outline's *parent* rather than its child,
 * and every **Workout Session** already stamped. A stamped session anchors to the
 * Event through `targetEventId` and never to a phase — #365 §2's "no live link" — so
 * there is no session-shaped hole to repair here. An Event without an Outline is a
 * calendar marker, which the read path already handles.
 */
export type FitToEventRefusal =
	/** Not this athlete's plan, or no plan at all — the same reading either way. */
	| 'outline-not-found'
	/** The season already ends on the Event's week, so there is no edit to make. */
	| 'already-fits'
	/**
	 * The gap cannot be closed by resizing: a block would have to disappear, or
	 * the season is nothing but a taper. Removing a block is a decision, so it
	 * stays the athlete's.
	 */
	| 'cannot-fit'

export type FitToEventResult =
	| { ok: true; proposal: FitProposal }
	| { ok: false; reason: FitToEventRefusal }

/**
 * Resize the plan's blocks so the season ends on the Event's week — the edit
 * `proposeFit` names, applied because the athlete asked for it.
 *
 * **Why this exists beside a rule that says nothing is stretched.** ADR 0044 §3
 * and `presets.ts` keep the *app* from resizing a shape to fill a run-in: a
 * preset's week counts are what it recommends, and an app that quietly rewrote
 * them would be recommending something else. That rule is about the app acting
 * unasked. It says nothing about an athlete deciding their 21-week shape should be
 * a 12-week season — which is an ordinary resize of each block, one they can
 * already type, and the only thing this adds is that they do not have to work out
 * *which* blocks. The proposal is stated in full before the tap and the blocks
 * stay theirs to edit after it.
 *
 * **Recomputed here, never posted.** The input is the Outline and nothing else:
 * the phases, the Event and the fit are all read fresh inside the transaction, so
 * a proposal computed against a season that has since changed cannot land. What
 * comes back is the proposal that was *applied*, which is what the surface says
 * afterwards.
 *
 * The two refusals are kept apart because they are different sentences: a season
 * that already lands needs no edit, and one that cannot be resized without losing
 * a block needs a decision the athlete makes.
 */
export async function fitPlanToEvent(
	athleteId: string,
	input: PlanOutlineFitInput,
): Promise<FitToEventResult> {
	const fitInput = PlanOutlineFitSchema.parse(input)
	const timezone = await getAthleteTimezone(athleteId)

	return prisma.$transaction(async (tx) => {
		const outline = await tx.planOutline.findFirst({
			where: { id: fitInput.outlineId, event: { athleteId } },
			select: {
				id: true,
				startWeekKey: true,
				event: { select: { startDate: true } },
				phases: {
					orderBy: { orderIndex: 'asc' },
					select: { id: true, name: true, weeks: true, tapers: true },
				},
			},
		})
		if (!outline) return { ok: false as const, reason: 'outline-not-found' }

		const fit = eventFit(
			outline.startWeekKey,
			outline.phases.reduce((sum, phase) => sum + phase.weeks, 0),
			weekMonday(outline.event.startDate, timezone),
		)
		if (fit.kind === 'ends-on-event-week') {
			return { ok: false as const, reason: 'already-fits' as const }
		}
		const proposal = proposeFit(outline.phases, fit)
		if (!proposal) return { ok: false as const, reason: 'cannot-fit' as const }

		for (const change of proposal.changes) {
			await tx.planOutlinePhase.update({
				// Addressed by the row the proposal was computed from, so a phase that
				// moved position between the read and the write is still the phase the
				// athlete was shown.
				where: { id: outline.phases[change.index]!.id },
				data: { weeks: change.to },
			})
		}

		return { ok: true as const, proposal }
	})
}

export async function deletePlanOutline(
	athleteId: string,
	input: PlanOutlineDeleteInput,
): Promise<DeleteOutlineResult> {
	const remove = PlanOutlineDeleteSchema.parse(input)
	const deleted = await prisma.planOutline.deleteMany({
		where: { id: remove.outlineId, event: { athleteId } },
	})
	return deleted.count === 0
		? { ok: false, reason: 'outline-not-found' }
		: { ok: true }
}

export type SetEnduranceSegmentResult =
	| { ok: true }
	| { ok: false; reason: 'segment-not-found' }

/**
 * Author an endurance segment's progression: its **Volume Ramp**, its **Block
 * Boundary Step** and its recovery and taper cuts.
 *
 * All four are written every time, `null` included, because `null` is the athlete
 * choosing "follow the documented convention" rather than a field they left out.
 * Clearing an authored cut back to the convention has to be expressible, and a
 * partial update would make it the one edit the surface could not perform.
 *
 * Nothing here consults the **ramp guard**: it warns and never blocks (ADR 0040
 * §12), so a steep ramp is stored exactly as authored and the warning is a reading
 * of what was saved.
 *
 * A segment that is not the caller's — or is a strength segment, whose progression
 * is authored by its own dated path — reads as absent.
 */
export async function setEnduranceSegment(
	athleteId: string,
	input: EnduranceSegmentSetInput,
): Promise<SetEnduranceSegmentResult> {
	const authored = EnduranceSegmentSetSchema.parse(input)

	const segment = await prisma.trainingTrackSegment.findFirst({
		where: {
			id: authored.segmentId,
			kind: 'endurance',
			track: { outline: { event: { athleteId } } },
		},
		select: { id: true },
	})
	if (!segment) return { ok: false, reason: 'segment-not-found' }

	await prisma.trainingTrackSegment.update({
		where: { id: segment.id },
		data: {
			ramp: authored.ramp,
			boundaryStep: authored.boundaryStep,
			recoveryCut: authored.recoveryCut,
			taperCut: authored.taperCut,
		},
	})

	return { ok: true }
}

export type SetQualitySessionMixResult =
	| { ok: true }
	| { ok: false; reason: 'segment-not-found' }

/**
 * Author an endurance segment's **Quality Session Mix**: the intensive sessions per
 * week it carries, as a multiset of Training Zone → count (ADR 0042 §3).
 *
 * The **whole** mix is written every time, because a multiset is one value. An empty
 * `entries` is not a no-op and not a clear-to-convention: it is the positive
 * statement that the segment has no quality sessions (ADR 0042 §6), which is how the
 * prototype's `focus: 'recovery'` dissolves. Delete-then-insert inside one
 * transaction is what makes it atomic — a reader never sees a half-replaced mix, and
 * an empty save leaves the segment with no rows rather than with the old ones.
 *
 * Nothing here consults the **availability warning**: like the ramp guard beside it,
 * it warns and never blocks (ADR 0042 §9), so the mix is stored exactly as authored
 * and the warning is a reading of what was saved. Nor does a recovery week reduce
 * it — the mix is untouched by the rhythm (ADR 0044 §4), so there is nothing per week
 * to write here either.
 *
 * A segment that is not the caller's — or is a strength segment, which authors its
 * intensity as a **Strength Goal** instead (ADR 0047 §3) — reads as absent. The
 * mix's foreign key already makes the strength case structurally impossible; the
 * `kind` here is what turns it into a refusal the surface can word rather than a
 * constraint violation.
 */
export async function setQualitySessionMix(
	athleteId: string,
	input: QualitySessionMixSetInput,
): Promise<SetQualitySessionMixResult> {
	const authored = QualitySessionMixSetSchema.parse(input)

	const segment = await prisma.trainingTrackSegment.findFirst({
		where: {
			id: authored.segmentId,
			kind: 'endurance',
			track: { outline: { event: { athleteId } } },
		},
		select: { id: true },
	})
	if (!segment) return { ok: false, reason: 'segment-not-found' }

	await prisma.$transaction(async (tx) => {
		await tx.qualitySessionMixEntry.deleteMany({
			where: { segmentId: segment.id },
		})
		if (authored.entries.length > 0) {
			await tx.qualitySessionMixEntry.createMany({
				data: authored.entries.map((entry) => ({
					segmentId: segment.id,
					zone: entry.zone,
					sessionsPerWeek: entry.sessionsPerWeek,
				})),
			})
		}
	})

	return { ok: true }
}

// ── Authoring a strength Training Track segment (#409) ───────────────────────
// A strength segment is the one segment the athlete **adds and removes
// explicitly**. An endurance track's segments are laid down one per phase by
// `layEnduranceSegments` and go with the phase when it goes (ADR 0042 §8), so
// authoring one is only ever a `set`. A strength segment is dated and floats free
// of the phases (ADR 0047 §6): nothing lays one down, no phase's removal reaches
// it, and a gap between two of them is the positive statement "no lifting these
// weeks" rather than a hole for something to fill.
//
// Three things none of these operations does:
//
// - **Consult the ramp guard.** It warns and never blocks (ADR 0040 §12, and
//   ADR 0047 §1 gives it a second track to guard), so the rate is stored exactly
//   as authored, the way `setEnduranceSegment` stores it.
// - **Propose a higher opening volume for a new block, or read a flat anchor
//   across blocks as an incomplete plan.** ADR 0047 §7's refusal to build: the
//   ratchet lived on per-athlete landmark numbers and §1 leaves none, so two
//   blocks that both open flat are an ordinary authored plan.
// - **Store anything derived.** No `%1RM` band, no rep range — those come from
//   the **Strength Goal** (`strength-goal.ts`) — and no per-week target.

/**
 * Why authoring a strength segment was refused. Every one is a state the athlete
 * can see and act on, so none of them is an exception: the surface words them.
 *
 * `track-not-found` and `segment-not-found` cover another athlete's row as well as
 * a missing one, and `segment-not-found` covers an *endurance* segment besides — a
 * row that is not the caller's, or is not the kind this path authors, reads as
 * absent rather than as forbidden.
 *
 * A `startWeekKey` that is not a Monday is **not** here: `WeekKeySchema` holds that
 * for a segment exactly as it does for the **Plan Start Week**, so it is a parse
 * rejection at the gate rather than a refusal the surface has to word twice.
 */
export type StrengthSegmentRefusal =
	| 'track-not-found'
	| 'not-a-strength-track'
	| 'segment-not-found'
	| 'start-week-outside-the-plan'
	| 'segment-runs-past-the-plan'
	| 'week-already-opens-a-segment'
	| 'segments-overlap'

/** The refusals that are about *where* a window lands, shared by the add and the set. */
type StrengthPlacementRefusal = Extract<
	StrengthSegmentRefusal,
	| 'start-week-outside-the-plan'
	| 'segment-runs-past-the-plan'
	| 'week-already-opens-a-segment'
	| 'segments-overlap'
>

export type AddStrengthSegmentResult =
	| { ok: true; segmentId: string }
	| {
			ok: false
			reason:
				| StrengthPlacementRefusal
				| 'track-not-found'
				| 'not-a-strength-track'
	  }

export type SetStrengthSegmentResult =
	| { ok: true }
	| { ok: false; reason: StrengthPlacementRefusal | 'segment-not-found' }

export type RemoveStrengthSegmentResult =
	| { ok: true }
	| { ok: false; reason: 'segment-not-found' }

/** A plan's own span, as the two week checks read it: where it opens and how long. */
type PlanSpan = { startWeekKey: string; weeks: number }

/** One segment's dated window. Its span is `[startWeekKey, +weeks)`, half-open. */
type SegmentWindow = { startWeekKey: string; weeks: number }

/**
 * The dated windows among some segment rows.
 *
 * The `TrainingTrackSegment_kind_position` CHECK already guarantees a strength row
 * carries both columns, so this is the type narrowing and not a second rule.
 */
function strengthWindows(
	segments: Array<{ startWeekKey: string | null; weeks: number | null }>,
): SegmentWindow[] {
	return segments.flatMap((segment) =>
		segment.startWeekKey != null && segment.weeks != null
			? [{ startWeekKey: segment.startWeekKey, weeks: segment.weeks }]
			: [],
	)
}

/**
 * Whether a proposed window may be authored, given the plan it sits in and the
 * segments already on its track — or which refusal it earns.
 *
 * Four rules, in the order the athlete would meet them:
 *
 * 1. **The opening week is one of the plan's.** A segment before the **Plan Start
 *    Week** or after the last Training Week is dated against a season that is not
 *    there.
 * 2. **The window ends inside the plan.** Refused rather than allowed, because the
 *    weeks past the plan's last are an **Unavailable Metric** by construction —
 *    `strengthWeekTarget` reads them as null — so the tail would store an intent
 *    nothing can price. Ending *before* the event is the opposite case and is
 *    freely allowed: a segment that stops early is one of the three ways a
 *    strength track peaks, since it has no taper mechanism (ADR 0047 §6).
 * 3. **No two segments open in the same week.** `@@unique([trackId, startWeekKey])`
 *    makes it structural; checking it here turns a constraint violation into a
 *    refusal the surface can word.
 * 4. **No two windows overlap**, even where their opening weeks differ. This goes
 *    a step beyond the same-week rule: `strengthSegmentForWeek` resolves a shared
 *    week only by a documented latest-start-wins tie-break, which exists so the
 *    derivation is deterministic on a state the authoring path refuses — not so
 *    the state can be authored.
 */
function placeStrengthSegment(
	plan: PlanSpan,
	proposed: SegmentWindow,
	siblings: SegmentWindow[],
): StrengthPlacementRefusal | null {
	const start = weekIndexOf(plan.startWeekKey, proposed.startWeekKey)
	if (start < 0 || start >= plan.weeks) return 'start-week-outside-the-plan'
	if (start + proposed.weeks > plan.weeks) return 'segment-runs-past-the-plan'

	const windows = siblings.map((sibling) => ({
		start: weekIndexOf(plan.startWeekKey, sibling.startWeekKey),
		weeks: sibling.weeks,
	}))
	// The same opening week first, and over all the siblings before overlap is
	// considered: it is the sharper statement about the same collision, and the one
	// the athlete recognises.
	if (windows.some((sibling) => sibling.start === start)) {
		return 'week-already-opens-a-segment'
	}
	const overlaps = windows.some(
		(sibling) =>
			start < sibling.start + sibling.weeks &&
			sibling.start < start + proposed.weeks,
	)
	return overlaps ? 'segments-overlap' : null
}

/** The columns a strength segment authors, as one write — window, rates and all. */
function strengthSegmentData(authored: {
	startWeekKey: string
	weeks: number
	ramp: number | null
	boundaryStep: number | null
	goal: string
	sessionsPerWeek: number
	deloadCut: number | null
	deloadWeeks: number | null
}) {
	return {
		startWeekKey: authored.startWeekKey,
		weeks: authored.weeks,
		// Written every time, `null` included: `null` is the athlete choosing "follow
		// the documented convention" rather than a field they left out, so clearing
		// one back has to be expressible (ADR 0044 §4).
		ramp: authored.ramp,
		boundaryStep: authored.boundaryStep,
		goal: authored.goal,
		sessionsPerWeek: authored.sessionsPerWeek,
		deloadCut: authored.deloadCut,
		deloadWeeks: authored.deloadWeeks,
	}
}

/**
 * Two submissions can race past the placement check — a double-tapped Add, or two
 * tabs — and `@@unique([trackId, startWeekKey])` makes the loser's insert abort.
 * That is the same athlete-visible state the check found, so it comes back as the
 * same refusal rather than as an exception.
 */
function isSameWeekCollision(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === 'P2002'
	)
}

/**
 * Add a strength **Training Track segment** to a track: its dated window, the
 * **Volume Ramp** and **Block Boundary Step** it now shares with endurance
 * (ADR 0047 §1), its **Strength Goal**, its **Strength Frequency** and its tail
 * deload.
 *
 * Explicit because nothing can lay one down: `layEnduranceSegments` skips a
 * strength track deliberately, and correctly — there is no 1:1 with the phases to
 * lay a dated segment into (ADR 0047 §6).
 *
 * The track must be the caller's and must be a **strength** track. The row's shape
 * is structural — the `TrainingTrackSegment_kind_position` CHECK — but nothing
 * structural stops a run track carrying a lift block, so the service refuses it
 * cleanly rather than authoring one.
 */
export async function addStrengthSegment(
	athleteId: string,
	input: StrengthSegmentAddInput,
): Promise<AddStrengthSegmentResult> {
	const add = StrengthSegmentAddSchema.parse(input)

	try {
		return await prisma.$transaction(async (tx) => {
			const track = await tx.trainingTrack.findFirst({
				where: { id: add.trackId, outline: { event: { athleteId } } },
				select: {
					id: true,
					discipline: true,
					outline: {
						select: {
							startWeekKey: true,
							phases: { select: { weeks: true } },
						},
					},
					segments: {
						where: { kind: 'strength' },
						select: { startWeekKey: true, weeks: true },
					},
				},
			})
			if (!track) return { ok: false as const, reason: 'track-not-found' }
			if (isCardioDiscipline(track.discipline as Discipline)) {
				return { ok: false as const, reason: 'not-a-strength-track' }
			}

			const refusal = placeStrengthSegment(
				{
					startWeekKey: track.outline.startWeekKey,
					weeks: seasonWeeks(track.outline.phases),
				},
				add,
				strengthWindows(track.segments),
			)
			if (refusal) return { ok: false as const, reason: refusal }

			const created = await tx.trainingTrackSegment.create({
				data: {
					kind: 'strength',
					trackId: track.id,
					...strengthSegmentData(add),
				},
				select: { id: true },
			})
			return { ok: true as const, segmentId: created.id }
		})
	} catch (error) {
		if (isSameWeekCollision(error)) {
			return { ok: false, reason: 'week-already-opens-a-segment' }
		}
		throw error
	}
}

/**
 * Re-author a strength segment, **whole**: the window moves and every rate is
 * rewritten in one save.
 *
 * All of it every time, `null` included, for `setEnduranceSegment`'s reason —
 * `null` is "follow the documented convention" and clearing an authored number
 * back to it has to be expressible. The window is part of the save because
 * start-plus-length is what the athlete edits (ADR 0047 §6), so a moved block and
 * a resized one are the same action.
 *
 * The placement rules are checked against the segment's **siblings**, so a segment
 * cannot collide with itself: re-authoring in place is the ordinary case.
 *
 * A segment that is not the caller's — or is an endurance segment, whose
 * progression is authored by its own phase-bound path — reads as absent.
 */
export async function setStrengthSegment(
	athleteId: string,
	input: StrengthSegmentSetInput,
): Promise<SetStrengthSegmentResult> {
	const authored = StrengthSegmentSetSchema.parse(input)

	try {
		return await prisma.$transaction(async (tx) => {
			const segment = await tx.trainingTrackSegment.findFirst({
				where: {
					id: authored.segmentId,
					kind: 'strength',
					track: { outline: { event: { athleteId } } },
				},
				select: {
					id: true,
					trackId: true,
					track: {
						select: {
							outline: {
								select: {
									startWeekKey: true,
									phases: { select: { weeks: true } },
								},
							},
						},
					},
				},
			})
			if (!segment) return { ok: false as const, reason: 'segment-not-found' }

			const siblings = await tx.trainingTrackSegment.findMany({
				where: {
					trackId: segment.trackId,
					kind: 'strength',
					id: { not: segment.id },
				},
				select: { startWeekKey: true, weeks: true },
			})
			const refusal = placeStrengthSegment(
				{
					startWeekKey: segment.track.outline.startWeekKey,
					weeks: seasonWeeks(segment.track.outline.phases),
				},
				authored,
				strengthWindows(siblings),
			)
			if (refusal) return { ok: false as const, reason: refusal }

			await tx.trainingTrackSegment.update({
				where: { id: segment.id },
				data: strengthSegmentData(authored),
			})
			return { ok: true as const }
		})
	} catch (error) {
		if (isSameWeekCollision(error)) {
			return { ok: false, reason: 'week-already-opens-a-segment' }
		}
		throw error
	}
}

/**
 * Remove a strength segment.
 *
 * Explicit for the reason adding is: no phase's removal reaches a segment that
 * floats free of the phases (ADR 0047 §6), so this is the only way one goes. The
 * weeks it held become a **gap** — the authored "no lifting these weeks", which
 * the derivation reads as `0` rather than as an **Unavailable Metric** — and the
 * week it opened on is free to be authored again.
 *
 * An endurance segment is not removable here: it spans exactly one phase and goes
 * with it (ADR 0042 §8), so it reads as absent the way another athlete's does.
 */
export async function removeStrengthSegment(
	athleteId: string,
	input: StrengthSegmentRemoveInput,
): Promise<RemoveStrengthSegmentResult> {
	const remove = StrengthSegmentRemoveSchema.parse(input)
	const deleted = await prisma.trainingTrackSegment.deleteMany({
		where: {
			id: remove.segmentId,
			kind: 'strength',
			track: { outline: { event: { athleteId } } },
		},
	})
	return deleted.count === 0
		? { ok: false, reason: 'segment-not-found' }
		: { ok: true }
}

// ── Authoring a Week Pattern (#410) ──────────────────────────────────────────
// A **Week Pattern** is the microcycle the athlete authors once instead of
// scheduling eighteen weeks of sessions by hand (ADR 0044 §6). The seven
// operations below are the whole of how one is built, and each is *one* action on
// *one* row — a pattern, or a day of it — never a whole-pattern save.
//
// Three invariants they hold between them:
//
// - **A pattern stores no absolute quantity.** Nothing written here is a volume:
//   a `fixed` day carries the Workout it stamps and a `share` day carries a
//   relative weight, and the fractions are computed at resolve time by
//   `week-pattern.ts` (ADR 0044 §7). "The shares sum to 97%" is unrepresentable
//   because no share is stored.
// - **Positions are contiguous, and they are the service's.** A pattern appends
//   at the end of its Outline's list; a day appends within its own weekday, which
//   is what makes two sessions on one Tuesday orderable. Every removal renumbers
//   from 0, so `orderIndex` and `orderInDay` are dense by construction rather than
//   by convention.
// - **A day and the track it draws from live on the same Outline.** The foreign
//   key cannot say that — it only says the track exists — so `addWeekPatternDay`
//   says it, and a track from another season reads as absent.
//
// The parameter is named `userId` rather than `athleteId` because these
// operations authorise against two owners at once: the Outline's athlete
// (`pattern.outline.event.athleteId`, the same join every operation above uses)
// and the **Workout**'s owner (`Workout.ownerId`). They are the same person, and
// naming them the same thing is what makes that visible.

/**
 * Why a Week Pattern edit was refused — athlete-visible states, all wordable, so
 * none is an exception.
 *
 * Every `*-gone` covers *another athlete's row as well as a missing one*: a
 * pattern, day, track or Workout that is not the caller's reads as absent rather
 * than as forbidden, so nothing here tells a stranger that someone else's season
 * exists. `track-gone` additionally covers a track that exists and is the
 * caller's but belongs to a **different Outline** — from where the pattern is
 * standing, a track in another season is not there.
 *
 * `workout-discipline-mismatch` is the one refusal here that is not an absence: the
 * Workout exists and is the caller's, and it is the *wrong discipline* for the day's
 * track. That has to be refused rather than stored, because a day draws its volume
 * from its track and nothing spans two disciplines (ADR 0041, ADR 0043 §5) — a bike
 * session on a run-track day would count its hours as that track's kilometres.
 */
export type WeekPatternEditRefusal =
	| 'outline-gone'
	| 'pattern-gone'
	| 'day-gone'
	| 'track-gone'
	| 'workout-gone'
	| 'workout-discipline-mismatch'
	| 'at-the-edge'

export type WeekPatternEditResult =
	| { ok: true }
	| { ok: false; reason: WeekPatternEditRefusal }

function refuse(reason: WeekPatternEditRefusal): WeekPatternEditResult {
	return { ok: false, reason }
}

/** One pattern as every edit here reads it: its identity and its Outline. */
type WeekPatternRow = { id: string; outlineId: string }

/**
 * Write `orderedIds`' positions as 0…n−1, the same two-pass walk ({@link renumber})
 * `renumberPhases` needs and for the same reason: `@@unique([outlineId,
 * orderIndex])` with no deferred uniqueness in SQLite, so a single shift collides
 * with whichever sibling still holds the position being written.
 */
async function renumberWeekPatterns(
	tx: Prisma.TransactionClient,
	orderedIds: string[],
): Promise<void> {
	await renumber(orderedIds, (id, orderIndex) =>
		tx.weekPattern.update({ where: { id }, data: { orderIndex } }),
	)
}

/**
 * The same two passes for a weekday's days, against `@@unique([patternId,
 * weekday, orderInDay])`. Only ever called with the days of **one** weekday of
 * one pattern, which is the scope the uniqueness is over.
 */
async function renumberPatternDays(
	tx: Prisma.TransactionClient,
	orderedIds: string[],
): Promise<void> {
	await renumber(orderedIds, (id, orderInDay) =>
		tx.weekPatternDay.update({ where: { id }, data: { orderInDay } }),
	)
}

/** One Outline's patterns in authored order — the sequence every edit renumbers. */
async function patternsOf(
	tx: Prisma.TransactionClient,
	outlineId: string,
): Promise<string[]> {
	const patterns = await tx.weekPattern.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: { id: true },
	})
	return patterns.map((pattern) => pattern.id)
}

/** One pattern, or null when it is not the caller's — the join every op shares. */
async function ownedPattern(
	tx: Prisma.TransactionClient,
	userId: string,
	patternId: string,
): Promise<WeekPatternRow | null> {
	return tx.weekPattern.findFirst({
		where: { id: patternId, outline: { event: { athleteId: userId } } },
		select: { id: true, outlineId: true },
	})
}

/** One weekday's days of one pattern, in authored order within that day. */
async function daysOfWeekday(
	tx: Prisma.TransactionClient,
	patternId: string,
	weekday: number,
): Promise<string[]> {
	const days = await tx.weekPatternDay.findMany({
		where: { patternId, weekday },
		orderBy: { orderInDay: 'asc' },
		select: { id: true },
	})
	return days.map((day) => day.id)
}

/**
 * Add a Week Pattern to an Outline, appended.
 *
 * The position is counted here rather than submitted, so the athlete's second tab
 * cannot claim a position the first already took. It opens with **no days**: a
 * pattern with a default week in it would be a shape nobody authored, which is the
 * same objection ADR 0044 §4 makes to storing a convention as a choice.
 */
export async function addWeekPattern(
	userId: string,
	input: WeekPatternAddInput,
): Promise<WeekPatternEditResult> {
	const add = WeekPatternAddSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const outline = await tx.planOutline.findFirst({
			where: { id: add.outlineId, event: { athleteId: userId } },
			select: { id: true },
		})
		if (!outline) return refuse('outline-gone')

		await tx.weekPattern.create({
			data: {
				outlineId: outline.id,
				name: add.name,
				orderIndex: await tx.weekPattern.count({
					where: { outlineId: outline.id },
				}),
			},
		})
		return { ok: true as const }
	})
}

/** What a starter week is called when the app proposes one. Free text after that. */
const STARTER_PATTERN_NAME = 'Typical week'

export type StarterPatternResult =
	| { ok: true; proposal: StarterProposal }
	| { ok: false; reason: 'outline-gone' | 'nothing-to-propose' }

/**
 * Author a **Week Pattern** from what the app already knows about the athlete —
 * their **Training Availability** and the plan's own tracks — instead of handing
 * them an empty one.
 *
 * `addWeekPattern` deliberately opens a pattern with **no days**, because "a
 * pattern with a default week in it would be a shape nobody authored". This does
 * not contradict that rule; it is the other side of it. The days here are not a
 * default that appears because a pattern exists — they are a *proposal the athlete
 * asked for by name*, computed from their own stated availability, described
 * before they tap and editable through every ordinary path afterwards. An athlete
 * who wants the empty pattern still has the button that makes one.
 *
 * Everything the proposal is and is not — shares and never volumes, one long day,
 * no intensity, lifting days beside the endurance week rather than instead of it —
 * is `starter-pattern.ts`'s, and stated there. This function reads the rows it
 * needs, writes what comes back, and decides nothing about the week's shape.
 *
 * One transaction, because a pattern whose days half-landed is a week the athlete
 * would have to audit against a proposal they can no longer see.
 */
export async function createStarterWeekPattern(
	userId: string,
	input: WeekPatternStarterInput,
): Promise<StarterPatternResult> {
	const start = WeekPatternStarterSchema.parse(input)
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { trainableWeekdays: true },
	})
	// `null` — never set — is distinct from an explicit empty list, and the two get
	// different answers: a default week, or none at all. Mapped straight through
	// rather than parsed to `[]`, which is `countTrainableWeekdays`' rule for the
	// same column and the same reason.
	const trainableWeekdays =
		profile?.trainableWeekdays == null
			? null
			: parseTrainableWeekdays(profile.trainableWeekdays)

	return prisma.$transaction(async (tx) => {
		const outline = await tx.planOutline.findFirst({
			where: { id: start.outlineId, event: { athleteId: userId } },
			select: {
				id: true,
				tracks: {
					select: {
						id: true,
						discipline: true,
						segments: {
							where: { kind: 'strength' },
							select: { sessionsPerWeek: true },
							orderBy: { startWeekKey: 'asc' },
						},
					},
				},
			},
		})
		if (!outline) return { ok: false as const, reason: 'outline-gone' as const }

		const proposal = proposeStarterPattern({
			trainableWeekdays,
			tracks: outline.tracks.map((track) => ({
				trackId: track.id,
				discipline: track.discipline as Discipline,
				// The first block's **Strength Frequency** stands for the track: a
				// pattern is one week and the blocks may each ask for a different
				// number, so the season's opening figure is the honest one to start
				// from — and the athlete moves days from there.
				sessionsPerWeek: track.segments[0]?.sessionsPerWeek ?? null,
			})),
		})
		if (!proposal) {
			return { ok: false as const, reason: 'nothing-to-propose' as const }
		}

		const pattern = await tx.weekPattern.create({
			data: {
				outlineId: outline.id,
				name: STARTER_PATTERN_NAME,
				orderIndex: await tx.weekPattern.count({
					where: { outlineId: outline.id },
				}),
			},
			select: { id: true },
		})

		// `orderInDay` counted per weekday as the days are laid, which is the same
		// rule `addWeekPatternDay` applies one day at a time — so a Tuesday holding a
		// lift and a run keeps them in the order they were proposed in.
		const placed = new Map<number, number>()
		for (const day of proposal.days) {
			const orderInDay = placed.get(day.weekday) ?? 0
			placed.set(day.weekday, orderInDay + 1)
			await tx.weekPatternDay.create({
				data: {
					patternId: pattern.id,
					trackId: day.trackId,
					weekday: day.weekday,
					orderInDay,
					kind: 'share',
					weight: day.weight,
				},
			})
		}

		return { ok: true as const, proposal }
	})
}

/** Rename a pattern. The name is intent, and nothing derived depends on it. */
export async function renameWeekPattern(
	userId: string,
	input: WeekPatternRenameInput,
): Promise<WeekPatternEditResult> {
	const rename = WeekPatternRenameSchema.parse(input)
	const updated = await prisma.weekPattern.updateMany({
		where: {
			id: rename.patternId,
			outline: { event: { athleteId: userId } },
		},
		data: { name: rename.name },
	})
	return updated.count === 0 ? refuse('pattern-gone') : { ok: true }
}

/** Move a pattern one position earlier or later, swapping with its neighbour. */
export async function moveWeekPattern(
	userId: string,
	input: WeekPatternMoveInput,
): Promise<WeekPatternEditResult> {
	const move = WeekPatternMoveSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const pattern = await ownedPattern(tx, userId, move.patternId)
		if (!pattern) return refuse('pattern-gone')

		const order = await patternsOf(tx, pattern.outlineId)
		const from = order.indexOf(pattern.id)
		const to = move.direction === 'earlier' ? from - 1 : from + 1
		// The first pattern has nothing earlier and the last has nothing later.
		// Refused rather than silently ignored, so a stale reading's button says why.
		if (to < 0 || to >= order.length) return refuse('at-the-edge')

		order[from] = order[to]!
		order[to] = pattern.id
		await renumberWeekPatterns(tx, order)

		return { ok: true as const }
	})
}

/**
 * Remove a pattern. Its days go with it by cascade, and the survivors renumber so
 * the list is contiguous from 0 the moment the row is gone.
 *
 * There is no `last-pattern` refusal to match `removePhase`'s: a plan needs at
 * least one phase to have a season at all, but a plan with no pattern is an
 * ordinary state — the athlete has authored a season and not yet a week.
 */
export async function removeWeekPattern(
	userId: string,
	input: WeekPatternRemoveInput,
): Promise<WeekPatternEditResult> {
	const remove = WeekPatternRemoveSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const pattern = await ownedPattern(tx, userId, remove.patternId)
		if (!pattern) return refuse('pattern-gone')

		await tx.weekPattern.delete({ where: { id: pattern.id } })
		await renumberWeekPatterns(tx, await patternsOf(tx, pattern.outlineId))

		return { ok: true as const }
	})
}

/**
 * Add a day to a pattern, appended **within its weekday**.
 *
 * `orderInDay` is the count of that pattern's days already on that weekday, which
 * is the whole of how a Tuesday can hold a morning swim and an evening run and
 * keep them in the order the athlete put them.
 *
 * Three things are checked that no foreign key can:
 *
 * - the pattern is the caller's — `pattern-gone` otherwise, and that is also the
 *   answer for another athlete's pattern;
 * - the **track lives on the same Outline as the pattern** — `track-gone`
 *   otherwise. The FK only says the track exists somewhere; a day drawing from
 *   another season's track would draw from a target that has nothing to do with
 *   this week (ADR 0044 §7);
 * - the Workout, where one is supplied, is the caller's own — `workout-gone`
 *   otherwise. A `share` day's `workoutId` is optional and is a *shape to scale*
 *   rather than a prescription, but it is checked the same way: a stranger's
 *   Workout reads as absent;
 * - the Workout's **Discipline is the track's** — `workout-discipline-mismatch`
 *   otherwise. A day draws its volume from its track and no figure spans
 *   incommensurable disciplines (ADR 0041, ADR 0043 §5), so a bike session on a
 *   run-track day would count bike duration as run volume. Checked for a `fixed`
 *   day's prescription and a `share` day's *shape* alike: a shape is scaled to the
 *   share this day takes off its own track, so a shape from another discipline is
 *   the same cross-discipline funding by another name. The surface filters the
 *   picker to the track's own discipline, and this is the defence behind it.
 *
 * A `fixed` day stores `weight: null` and a `share` day stores its weight — the
 * schema makes the other combinations unrepresentable, and the migration's
 * `kind_fields` CHECK holds the same line one layer down.
 */
export async function addWeekPatternDay(
	userId: string,
	input: WeekPatternDayAddInput,
): Promise<WeekPatternEditResult> {
	const add = WeekPatternDayAddSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const pattern = await ownedPattern(tx, userId, add.patternId)
		if (!pattern) return refuse('pattern-gone')

		// Same-Outline rather than same-athlete: the pattern is already known to be
		// the caller's, so this is the invariant the FK cannot express.
		const track = await tx.trainingTrack.findFirst({
			where: { id: add.trackId, outlineId: pattern.outlineId },
			select: { id: true, discipline: true },
		})
		if (!track) return refuse('track-gone')

		const workoutId = add.workoutId ?? null
		if (workoutId != null) {
			const workout = await tx.workout.findFirst({
				where: { id: workoutId, ownerId: userId },
				select: { id: true, discipline: true },
			})
			if (!workout) return refuse('workout-gone')
			// The cross-discipline check the FK cannot make, and the reason it is here
			// rather than only in the picker: a day's volume comes out of its track, so a
			// Workout of another Discipline would fund one track's week with another
			// discipline's work.
			if (workout.discipline !== track.discipline) {
				return refuse('workout-discipline-mismatch')
			}
		}

		await tx.weekPatternDay.create({
			data: {
				patternId: pattern.id,
				trackId: track.id,
				weekday: add.weekday,
				orderInDay: await tx.weekPatternDay.count({
					where: { patternId: pattern.id, weekday: add.weekday },
				}),
				kind: add.kind,
				weight: add.kind === 'share' ? add.weight : null,
				workoutId,
			},
		})
		return { ok: true as const }
	})
}

/**
 * Move a day one position earlier or later **within its own weekday**.
 *
 * It never changes `weekday`: moving a session to another day is authoring a
 * different week, not reordering this one. The ends of the weekday refuse, so a
 * Tuesday's only session has nothing to swap with in either direction.
 */
export async function moveWeekPatternDay(
	userId: string,
	input: WeekPatternDayMoveInput,
): Promise<WeekPatternEditResult> {
	const move = WeekPatternDayMoveSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const day = await tx.weekPatternDay.findFirst({
			where: {
				id: move.dayId,
				pattern: { outline: { event: { athleteId: userId } } },
			},
			select: { id: true, patternId: true, weekday: true },
		})
		if (!day) return refuse('day-gone')

		const order = await daysOfWeekday(tx, day.patternId, day.weekday)
		const from = order.indexOf(day.id)
		const to = move.direction === 'earlier' ? from - 1 : from + 1
		if (to < 0 || to >= order.length) return refuse('at-the-edge')

		order[from] = order[to]!
		order[to] = day.id
		await renumberPatternDays(tx, order)

		return { ok: true as const }
	})
}

/**
 * Remove a day. Its weekday's survivors renumber from 0, and the other weekdays
 * are untouched — `orderInDay` is scoped to the day it orders, so Saturday's
 * positions are none of Tuesday's business.
 */
export async function removeWeekPatternDay(
	userId: string,
	input: WeekPatternDayRemoveInput,
): Promise<WeekPatternEditResult> {
	const remove = WeekPatternDayRemoveSchema.parse(input)

	return prisma.$transaction(async (tx) => {
		const day = await tx.weekPatternDay.findFirst({
			where: {
				id: remove.dayId,
				pattern: { outline: { event: { athleteId: userId } } },
			},
			select: { id: true, patternId: true, weekday: true },
		})
		if (!day) return refuse('day-gone')

		await tx.weekPatternDay.delete({ where: { id: day.id } })
		await renumberPatternDays(
			tx,
			await daysOfWeekday(tx, day.patternId, day.weekday),
		)

		return { ok: true as const }
	})
}
