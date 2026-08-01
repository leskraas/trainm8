// What a plan may do to a week of the calendar it already wrote (#412, #415).
//
// Two writes now materialize weeks — stamping a **Week Pattern** and copying a week
// — and both have to answer the same two questions the same way: *which* sessions of
// a week is the plan allowed to remove, and *what would be lost* if it did. Stating
// that once is the point of this module. A rule that lived in two places would drift,
// and the direction it would drift is toward deleting something the athlete trained.
//
// The policy, in one sentence: a session is the plan's to replace only while it is
// still merely **scheduled**, anchored to **this Event**, with no **Session Log** and
// no **Recording** behind it.
//
// - **Scoped to this Event.** A session the athlete authored outside the plan is none
//   of the plan's business, and deleting it would be the app removing something it
//   never wrote.
// - **A trained week is never rewritten.** Completed, skipped or missed sessions,
//   anything carrying a Session Log, and anything backed by a Recording are left
//   exactly alone — and that is a *hard* rule, enforced here rather than at the
//   confirmation, so no confirmation can override it (ADR 0012's "recordings are
//   preserved" posture, applied to the reflection and the status too).

import { type Prisma } from '@prisma/client'
import { weekBoundsFromMondayUTC } from '../athlete-calendar.ts'
import { prisma } from '../db.server.ts'

/**
 * What makes a session the plan's to replace. Kept as a `where` fragment rather than
 * a predicate so the delete and the count are the *same* clause, not two readings of
 * one rule.
 */
export const REPLACEABLE_SESSION = {
	status: 'scheduled',
	recordingId: null,
	sessionLog: { is: null },
} satisfies Prisma.WorkoutSessionWhereInput

/** What one week of the plan already holds, split by what a rewrite may touch. */
export type WeekOccupancy = {
	/** Scheduled, untrained sessions of this plan that a rewrite deletes. */
	replacing: number
	/** Sessions a rewrite leaves exactly alone, whatever the athlete confirms. */
	keeping: number
}

/**
 * How many sessions one week of this plan would lose, and how many it would keep.
 *
 * Read **before** anything is written, so the athlete is told what a rewrite costs
 * while it still costs nothing.
 */
export async function readWeekOccupancy(
	userId: string,
	eventId: string,
	weekKey: string,
	timezone: string,
): Promise<WeekOccupancy> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			targetEventId: eventId,
			scheduledAt: { gte: start, lte: end },
		},
		select: {
			status: true,
			recordingId: true,
			sessionLog: { select: { id: true } },
		},
	})
	const replacing = sessions.filter(
		(session) =>
			session.status === 'scheduled' &&
			session.recordingId == null &&
			session.sessionLog == null,
	).length
	return { replacing, keeping: sessions.length - replacing }
}

/**
 * Delete this plan's replaceable sessions in one week, returning how many went.
 *
 * The sessions first, then their Workouts: the `workoutId` FK cascades, so deleting a
 * Workout while its session still pointed at it would take the session with it — the
 * ordering `deleteWorkoutSession` established.
 */
export async function clearPlanWeek(
	tx: Prisma.TransactionClient,
	userId: string,
	eventId: string,
	weekKey: string,
	timezone: string,
): Promise<number> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const doomed = await tx.workoutSession.findMany({
		where: {
			userId,
			targetEventId: eventId,
			scheduledAt: { gte: start, lte: end },
			...REPLACEABLE_SESSION,
		},
		select: { id: true, workoutId: true },
	})
	if (doomed.length === 0) return 0

	await tx.workoutSession.deleteMany({
		where: { id: { in: doomed.map((session) => session.id) } },
	})
	const workoutIds = doomed.flatMap((session) =>
		session.workoutId ? [session.workoutId] : [],
	)
	if (workoutIds.length > 0) {
		await tx.workout.deleteMany({ where: { id: { in: workoutIds } } })
	}
	return doomed.length
}
