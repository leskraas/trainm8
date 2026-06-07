import { createId } from '@paralleldrive/cuid2'
import { prisma } from '#app/utils/db.server.ts'
import { recomputeIntensityRanges } from '#app/utils/workout.server.ts'
import { buildBlocksCreate } from './approve.server.ts'
import { type ScheduledSession } from './schedule.ts'

export type ExtendDetailWindowParams = {
	/** The Event whose stored Plan Outline is being detailed further. */
	eventId: string
	/** The next window of dated sessions to materialize. */
	sessions: ScheduledSession[]
	/** Model id stamped onto every persisted session (provenance). */
	generatedByModel: string
	/** Generation timestamp stamped onto every session; defaults to `now`. */
	generatedAt?: Date
}

export type ExtendDetailWindowResult = {
	generationId: string
	sessionIds: string[]
}

/**
 * Persist the next detailed window of an existing plan (PRD #103, #110).
 *
 * "Extend" details the next phase of a stored Plan Outline into concrete
 * Generated Sessions when the athlete is ready, instead of materializing the
 * whole horizon up front. This is the persistence half of that path — the same
 * write as approve, minus creating the Event or rewriting the Outline: the
 * supplied sessions land as one Workout + one Workout Session each, anchored to
 * the same Target Event, carrying `generated` provenance and a fresh
 * `generationId` (this is a distinct generation from the approve that created the
 * Event). Existing sessions are never read for mutation, so extending can only
 * add sessions — it cannot disturb or duplicate already-materialized ones.
 *
 * The Event must already own a Plan Outline; a foreign or Outline-less Event
 * fails fast before anything is written.
 */
export async function persistExtendedWindow(
	userId: string,
	params: ExtendDetailWindowParams,
): Promise<ExtendDetailWindowResult> {
	const { eventId, sessions, generatedByModel } = params
	const generatedAt = params.generatedAt ?? new Date()
	const generationId = createId()

	// Verify ownership and that the Event actually carries a Plan Outline to
	// extend, before opening the transaction — a foreign or unanchored Event fails
	// fast rather than half-persisting.
	const event = await prisma.event.findFirst({
		where: { id: eventId, athleteId: userId },
		select: { id: true, planOutline: true },
	})
	if (!event) {
		throw new Error('Target Event not found for this athlete.')
	}
	if (!event.planOutline) {
		throw new Error('Event has no Plan Outline to extend.')
	}

	if (sessions.length === 0) {
		return { generationId, sessionIds: [] }
	}

	const sessionIds = await prisma.$transaction(async (tx) => {
		const ids: string[] = []
		for (const session of sessions) {
			const workout = await tx.workout.create({
				data: {
					title: session.title,
					discipline: session.discipline,
					intent: session.intent,
					ownerId: userId,
					blocks: { create: buildBlocksCreate(session.blocks) },
				},
				select: { id: true },
			})

			const created = await tx.workoutSession.create({
				data: {
					userId,
					workoutId: workout.id,
					scheduledAt: session.scheduledAt,
					status: 'scheduled',
					source: 'generated',
					generationId,
					generatedByModel,
					generatedAt,
					targetEventId: eventId,
				},
				select: { id: true },
			})
			ids.push(created.id)
		}
		return ids
	})

	// Resolve cached intensity ranges through the same post-write hook authored
	// and approved sessions use; concrete ranges appear where a threshold exists.
	await recomputeIntensityRanges(userId)

	return { generationId, sessionIds }
}
