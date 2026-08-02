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
import { weekBoundsFromMondayUTC, weekMonday } from '../athlete-calendar.ts'
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
	// The plan's own sessions in this week, and — through the *same* clause the
	// delete uses — how many of them a rewrite may touch. Counted in the database
	// rather than filtered in JS on purpose: a predicate here would be the second
	// reading of one rule that {@link REPLACEABLE_SESSION} exists to prevent, and
	// the number this returns is the number the athlete is asked to confirm.
	const inWeek = {
		userId,
		targetEventId: eventId,
		scheduledAt: { gte: start, lte: end },
	}
	const [total, replacing] = await Promise.all([
		prisma.workoutSession.count({ where: inWeek }),
		prisma.workoutSession.count({
			where: { ...inWeek, ...REPLACEABLE_SESSION },
		}),
	])
	return { replacing, keeping: total - replacing }
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

/**
 * How many of the plan's own weeks already hold at least one session.
 *
 * The one figure the surface needs to answer "have I actually put this plan on my
 * calendar yet?" — the last step of authoring a season, and the one an athlete who
 * has never planned before does not know is a step at all. Counted in *weeks* and
 * not in sessions, because that is the unit the question is asked in and the unit
 * the week list is drawn in.
 *
 * Every session anchored to this Event inside the plan's span counts, whatever
 * wrote it: a stamped pattern, a copied week, or a session the athlete authored by
 * hand against the Event. A week with training in it is a week with training in
 * it, and {@link REPLACEABLE_SESSION}'s narrower rule is about what a *rewrite* may
 * touch, which is a different question.
 */
export async function countWeeksWithSessions(
	userId: string,
	eventId: string,
	weekKeys: readonly string[],
	timezone: string,
): Promise<number> {
	const first = weekKeys[0]
	const last = weekKeys.at(-1)
	if (!first || !last) return 0

	const { start } = weekBoundsFromMondayUTC(first, timezone)
	const { end } = weekBoundsFromMondayUTC(last, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			targetEventId: eventId,
			scheduledAt: { gte: start, lte: end },
		},
		select: { scheduledAt: true },
	})

	// Bucketed by the athlete's own week, so a Sunday session late in the local
	// evening lands in the week it was trained in rather than the next one.
	const weeks = new Set(
		sessions.map((session) => weekMonday(session.scheduledAt, timezone)),
	)
	return weeks.size
}
