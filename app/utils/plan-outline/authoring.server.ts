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
import { type Discipline } from '../workout-schema.ts'
import {
	PlanOutlineCreateSchema,
	SeasonAnchorSetSchema,
	type PlanOutlineCreateInput,
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
		const outline = await prisma.planOutline.create({
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
				tracks: {
					create: plan.tracks.map((track) => ({
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
					})),
				},
			},
			select: { id: true },
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
