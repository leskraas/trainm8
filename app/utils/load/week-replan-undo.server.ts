/**
 * Undoing an applied Week Replan proposal from its before-image (#564, spec
 * #558 "Autopilot"): the engine the autopilot's _Angre_ calls.
 *
 * One call, `undoProposal`, for every kind. What it does is read off the
 * before-image the apply engine stored with `appliedAt`
 * (`week-replan-proposals.server.ts`, `BeforeImageSchema`), never re-derived
 * from the payload, so an undo restores exactly rather than guessing:
 *
 * - every session the change wrote to gets back its placement, its Replan Note
 *   and the quantities of the steps it scaled;
 * - every session the change placed (an `add`, a make-up) is removed;
 * - a next round is **re-laid at factor 1**, never removed, so an open-ended
 *   plan never ends: the round's endurance segments lose their boundary step,
 *   and its weeks not yet begun are laid again at those targets.
 *
 * **Refuse rather than trample** (ADR 0088's rule). Nothing is written, and the
 * refusal says why, once the week the change landed in has begun (a round:
 * the week it opens on), once a session it changed has been trained
 * (completed, skipped or missed, logged, or backed by a Recording), or when
 * the athlete took one of them over after the change (Session Adoption).
 *
 * **Idempotent** (ADR 0076 §3): the undo is claimed on `undoneAt` inside the
 * same transaction as its writes, so a second call — or a concurrent one —
 * writes nothing and says so (`undone: false`).
 */

import { type Prisma } from '@prisma/client'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { relayPlanFrom } from '#app/utils/plan-outline/open-ended.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import { readFirstUnbegunWeekKey } from './week-begun.server.ts'
import { type BeforeImage, parseBeforeImage } from './week-replan-proposal.ts'
import { repriceSessions } from './week-replan-proposals.server.ts'

export type UndoRefusal =
	| 'not-found'
	/** Never applied (pending, declined, or held): there is nothing to undo. */
	| 'not-applied'
	/** Applied before before-images were kept: an undo would be a guess. */
	| 'no-before-image'
	/** The week the change landed in has begun. */
	| 'week-begun'
	/** A session the change wrote to or placed has been trained. */
	| 'session-trained'
	/** The athlete took a session the change wrote to over, after it. */
	| 'session-taken-over'

export type UndoProposalResult =
	| { ok: true; undone: boolean }
	| { ok: false; reason: UndoRefusal }

class Refused extends Error {
	constructor(readonly reason: UndoRefusal) {
		super(reason)
	}
}

/**
 * Put the week back exactly as it was before this proposal applied. `undone`
 * is false when it had been undone already (nothing is written twice).
 */
export async function undoProposal(
	userId: string,
	proposalId: string,
	now: Date = new Date(),
): Promise<UndoProposalResult> {
	const proposal = await prisma.weekReplanProposal.findFirst({
		where: { id: proposalId, athleteId: userId },
		select: {
			id: true,
			appliedAt: true,
			undoneAt: true,
			beforeImage: true,
			targetWeekKey: true,
		},
	})
	if (!proposal) return { ok: false, reason: 'not-found' }
	if (!proposal.appliedAt) return { ok: false, reason: 'not-applied' }
	if (proposal.undoneAt) return { ok: true, undone: false }
	if (!proposal.beforeImage) return { ok: false, reason: 'no-before-image' }
	const image = parseBeforeImage(proposal.beforeImage)

	const timezone = await getAthleteTimezone(userId)
	const weekKey = image.round?.opensWeekKey ?? proposal.targetWeekKey
	if (weekKey < (await readFirstUnbegunWeekKey(userId, now, timezone))) {
		return { ok: false, reason: 'week-begun' }
	}

	let restored: string[] | null
	try {
		restored = await prisma.$transaction(async (tx) => {
			// Claimed first, so a second undo (or a concurrent one) finds it taken
			// and writes nothing; a refusal below rolls the claim back with the rest.
			const claimed = await tx.weekReplanProposal.updateMany({
				where: { id: proposal.id, undoneAt: null },
				data: { undoneAt: now },
			})
			if (claimed.count === 0) return null

			const touchedIds = [
				...image.sessions.map((session) => session.id),
				...image.placed,
			]
			const touched = await tx.workoutSession.findMany({
				where: { id: { in: touchedIds }, userId },
				select: {
					id: true,
					status: true,
					recordingId: true,
					source: true,
					adoptedAt: true,
					releasedAt: true,
					workoutId: true,
					sessionLog: { select: { id: true } },
				},
			})
			for (const session of touched) {
				if (
					session.status !== 'scheduled' ||
					session.recordingId != null ||
					session.sessionLog != null
				) {
					throw new Refused('session-trained')
				}
				// The athlete's now, and not when the change applied: they took it
				// over since, and an undo would write over their session. A placed
				// session was the machine's when it was placed.
				const was =
					image.sessions.find((before) => before.id === session.id)?.owner ??
					'machine'
				if (was === 'machine' && sessionOwner(session) === 'athlete') {
					throw new Refused('session-taken-over')
				}
			}
			const present = new Set(touched.map((session) => session.id))

			await restoreSessions(tx, image, present)

			const placed = touched.filter((s) => image.placed.includes(s.id))
			if (placed.length > 0) {
				// The sessions first, then their Workouts: the FK cascades the other
				// way (`clearPlanWeek`'s ordering).
				await tx.workoutSession.deleteMany({
					where: { id: { in: placed.map((session) => session.id) } },
				})
				const workoutIds = placed.flatMap((s) =>
					s.workoutId ? [s.workoutId] : [],
				)
				if (workoutIds.length > 0) {
					await tx.workout.deleteMany({ where: { id: { in: workoutIds } } })
				}
			}

			if (image.round && image.round.factor !== 1) {
				await tx.trainingTrackSegment.updateMany({
					where: { phaseId: image.round.phaseId, kind: 'endurance' },
					data: { boundaryStep: null },
				})
			}

			return image.sessions
				.filter((session) => present.has(session.id))
				.map((session) => session.id)
		})
	} catch (error) {
		if (error instanceof Refused) return { ok: false, reason: error.reason }
		throw error
	}
	if (restored == null) return { ok: true, undone: false }

	await repriceSessions(userId, restored)
	if (image.round && image.round.factor !== 1) {
		// The round stays; its weeks not yet begun are laid again at factor 1.
		// Contained like the apply's own fill: the plan is already right, and the
		// next close lays from it.
		try {
			await relayPlanFrom(
				userId,
				image.round.outlineId,
				image.round.opensWeekKey,
				timezone,
				now,
			)
		} catch (error) {
			console.error('[week-replan] re-laying an undone round failed', error)
		}
	}
	return { ok: true, undone: true }
}

/**
 * Each changed session back to its before-image: its placement, its Replan
 * Note and the quantities of the steps the change scaled. A session gone since
 * has nothing to restore.
 */
async function restoreSessions(
	tx: Prisma.TransactionClient,
	image: BeforeImage,
	present: Set<string>,
) {
	for (const session of image.sessions) {
		if (!present.has(session.id)) continue
		await tx.workoutSession.update({
			where: { id: session.id },
			data: {
				scheduledAt: new Date(session.scheduledAt),
				replanReason: session.replanReason,
			},
		})
		for (const step of session.steps ?? []) {
			await tx.workoutStep.updateMany({
				where: {
					id: step.id,
					block: { workout: { sessions: { some: { id: session.id } } } },
				},
				data: { durationSec: step.durationSec, distanceM: step.distanceM },
			})
		}
	}
}
