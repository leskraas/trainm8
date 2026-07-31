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
	SeasonAnchorSetSchema,
	type EnduranceSegmentSetInput,
	type PhaseAddInput,
	type PhaseMoveInput,
	type PhaseRemoveInput,
	type PhaseRenameInput,
	type PhaseResizeInput,
	type PhaseRhythmSetInput,
	type PlanOutlineCreateInput,
	type PlanOutlineDeleteInput,
	type SeasonAnchorSetInput,
} from './authoring-schema.ts'

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
 * Written in one transaction, so a half-authored season — phases with no track,
 * or a track with no anchor — is never left behind for the derivation to read.
 * Phases are stored by position and week count with no dates of their own, which
 * is what makes them contiguous by construction (ADR 0044 §3).
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

	try {
		// Two writes rather than one nested create, because an endurance segment
		// references the phase it spans and no phase has an id until it exists. Both
		// are inside one transaction, so the alternative — an Outline whose tracks
		// carry no segments — is never left behind.
		const outline = await prisma.$transaction(async (tx) => {
			const created = await tx.planOutline.create({
				data: {
					eventId: event.id,
					startWeekKey: plan.startWeekKey,
					phases: {
						// `rhythm` and `tapers` are passed only where the athlete authored
						// them: omitted, the column's documented default applies, so no
						// convention is stored as though it had been chosen (ADR 0044 §4).
						create: plan.phases.map((phase, orderIndex) => ({
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
						// An endurance track gets one segment per phase, 1:1 (ADR 0042 §8),
						// so the progression is authorable from the moment the plan exists
						// rather than after a second act the athlete has to discover. Each
						// opens with every rate **unset** — the ramp is a choice, and a
						// convention stored as though it had been authored is exactly what
						// ADR 0044 §4 forbids.
						//
						// A strength track gets none: its segments are dated and float free
						// of the phases (ADR 0047 §6), so there is no 1:1 to lay down here.
						...(isCardioDiscipline(track.discipline)
							? {
									segments: {
										create: created.phases.map((phase) => ({
											kind: 'endurance',
											phaseId: phase.id,
										})),
									},
								}
							: {}),
					},
				})
			}

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

export type SetSeasonAnchorResult =
	| { ok: true }
	| { ok: false; reason: 'track-not-found' }

/**
 * Set a **Season Anchor** segment's value for a track, adding the segment where
 * that week has none.
 *
 * Value only: the unit is the track's **Volume Currency** and is not this
 * operation's to touch (ADR 0043, ADR 0044 §8). `SeasonAnchorSetSchema` is
 * `.strict()`, so a caller that smuggles a `currency` key in at runtime — from a
 * form body, say — is rejected rather than silently ignored.
 */
export async function setSeasonAnchorValue(
	athleteId: string,
	input: SeasonAnchorSetInput,
): Promise<SetSeasonAnchorResult> {
	const anchor = SeasonAnchorSetSchema.parse(input)

	const track = await prisma.trainingTrack.findFirst({
		where: { id: anchor.trackId, outline: { event: { athleteId } } },
		select: { id: true },
	})
	if (!track) return { ok: false, reason: 'track-not-found' }

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
 * Write `orderedIds`' positions as 0…n−1 — the whole of how the season stays
 * contiguous through an insert, a move or a removal.
 *
 * Two passes, and the reason is `@@unique([outlineId, orderIndex])`: SQLite has no
 * deferred uniqueness, so a single shift collides with whichever sibling still
 * holds the position being written. Parking every row at a negative index first — a
 * range no stored phase uses — makes any permutation writable.
 */
async function renumberPhases(
	tx: Prisma.TransactionClient,
	orderedIds: string[],
): Promise<void> {
	for (const [index, id] of orderedIds.entries()) {
		await tx.planOutlinePhase.update({
			where: { id },
			data: { orderIndex: -1 - index },
		})
	}
	for (const [index, id] of orderedIds.entries()) {
		await tx.planOutlinePhase.update({
			where: { id },
			data: { orderIndex: index },
		})
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

function seasonWeeks(phases: PhaseRow[]): number {
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

		// The new phase joins the endurance tracks' 1:1 (ADR 0042 §8), the same way
		// `createPlanOutline` lays the first segments down: one segment per cardio
		// track, every rate **unset**, so the phase's progression is authorable the
		// moment it exists and no convention is stored as though it had been chosen
		// (ADR 0044 §4). A strength track gets none — its segments are dated and float
		// free of the phases (ADR 0047 §6).
		const tracks = await tx.trainingTrack.findMany({
			where: { outlineId: add.outlineId },
			select: { id: true, discipline: true },
		})
		for (const track of tracks) {
			if (!isCardioDiscipline(track.discipline as Discipline)) continue
			await tx.trainingTrackSegment.create({
				data: { kind: 'endurance', trackId: track.id, phaseId: created.id },
			})
		}

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
