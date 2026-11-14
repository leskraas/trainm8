/**
 * **The one writer of generated sessions** (ADR 0119, restructuring 4): approval
 * and a re-lay of a generated plan's weeks write identical rows through it.
 *
 * Every placed session gets a **fresh** copy of its **Stock Workout** (never a
 * reference to the system row, ADR 0044 §6), with `copiedFromId` pointing back at
 * it, so the session's provenance survives and an edit adopts the copy rather
 * than the corpus. The row is the machine's (`source: 'generated'`, ADR 0080),
 * scoped to its plan and its Event, scheduled at the athlete's default training
 * time in their timezone.
 */
import { type Prisma } from '@prisma/client'
import { addDays, localTimeUTC } from '../athlete-calendar.ts'
import { trainingTimeOf } from '../athlete-schema.ts'
import { prisma } from '../db.server.ts'
import { recomputePlannedTssForSession } from '../load/planned-tss.server.ts'
import {
	copyWorkout,
	workoutCopySelect,
	type CopyableWorkout,
} from '../workout.server.ts'
import { type GeneratedSession } from './season.ts'

/** Where the written sessions go: whose, which plan, which Event, when. */
export type GeneratedSessionTarget = {
	athleteId: string
	eventId: string | null
	planOutlineId: string
	timezone: string
	trainingTime: string
}

/** The athlete's default training time, or the app's. */
export async function defaultTrainingTime(athleteId: string): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: { defaultTrainingTime: true },
	})
	return trainingTimeOf(profile)
}

/**
 * The Stock Workouts the sessions copy, read once before the writing
 * transaction (through the shared `workoutCopySelect`).
 */
export async function readStockWorkouts(
	sessions: readonly GeneratedSession[],
): Promise<Map<string, CopyableWorkout>> {
	const workoutIds = [...new Set(sessions.map((session) => session.workoutId))]
	if (workoutIds.length === 0) return new Map()
	const sources = await prisma.workout.findMany({
		where: { id: { in: workoutIds } },
		select: workoutCopySelect,
	})
	return new Map(sources.map((source) => [source.id, source]))
}

/**
 * Write the placed sessions inside the caller's transaction; returns the new
 * session ids. A session whose Stock Workout is gone is skipped.
 */
export async function writeGeneratedSessions(
	tx: Prisma.TransactionClient,
	target: GeneratedSessionTarget,
	sessions: readonly GeneratedSession[],
	sources: ReadonlyMap<string, CopyableWorkout>,
): Promise<string[]> {
	const ids: string[] = []
	for (const session of sessions) {
		const source = sources.get(session.workoutId)
		if (!source) continue
		const copy = await copyWorkout(tx, source, target.athleteId, {
			copiedFromId: source.id,
		})
		const created = await tx.workoutSession.create({
			data: {
				userId: target.athleteId,
				workoutId: copy.id,
				scheduledAt: localTimeUTC(
					addDays(session.weekKey, session.weekday),
					target.trainingTime,
					target.timezone,
				),
				status: 'scheduled',
				source: 'generated',
				targetEventId: target.eventId,
				planOutlineId: target.planOutlineId,
			},
			select: { id: true },
		})
		ids.push(created.id)
	}
	return ids
}

/**
 * Planned TSS is materialized on the session (ADR 0019): after the writing
 * transaction commits, every new session gets its own figure.
 */
export async function recomputeWrittenSessions(
	athleteId: string,
	sessionIds: readonly string[],
): Promise<void> {
	for (const sessionId of sessionIds) {
		await recomputePlannedTssForSession(athleteId, sessionId)
	}
}
