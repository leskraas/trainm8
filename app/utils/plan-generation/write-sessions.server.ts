/**
 * **The one writer of generated sessions** (ADR 0120, restructuring 4): approval
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
 * The **Stock Workouts** the sessions copy, by id, read once before the writing
 * transaction: the columns and rows `copyWorkout` writes (`workoutCopySelect`),
 * plus the block and step ids the Workout Shape keys its bars by, which a copy
 * never writes. One reader for the preview, the approval and a re-lay, so the
 * figure the athlete reviews is read off the very rows the approval copies
 * (ADR 0121 §2).
 */
export async function readStockWorkouts(
	sessions: readonly Pick<GeneratedSession, 'workoutId'>[],
): Promise<Map<string, StockWorkout>> {
	const ids = [...new Set(sessions.map((session) => session.workoutId))]
	if (ids.length === 0) return new Map()
	const rows = await prisma.workout.findMany({
		// Stock rows only, as the corpus read: an id the seam hands back is never
		// trusted to be one, so no athlete's own Workout is read or copied.
		where: { id: { in: ids }, authorship: 'system' },
		select: stockWorkoutSelect,
	})
	const byId = new Map(rows.map((row) => [row.id, row]))
	// A dropped session leaves the week's figure short of the rows under it, so
	// the drop is said, with its ids, rather than left silent.
	const dropped = ids.filter((id) => !byId.has(id))
	if (dropped.length > 0) {
		console.warn(
			`Season generation: ${dropped.length} placed Workout id(s) are not Stock Workouts, so their sessions are left out: ${dropped.join(', ')}`,
		)
	}
	return byId
}

const stockWorkoutSelect = {
	...workoutCopySelect,
	blocks: {
		...workoutCopySelect.blocks,
		select: {
			...workoutCopySelect.blocks.select,
			id: true,
			steps: {
				...workoutCopySelect.blocks.select.steps,
				select: { ...workoutCopySelect.blocks.select.steps.select, id: true },
			},
		},
	},
} satisfies Prisma.WorkoutSelect

export type StockWorkout = Prisma.WorkoutGetPayload<{
	select: typeof stockWorkoutSelect
}>

/** The status a placed session is written with, and previewed as. */
export const PLACED_STATUS = 'scheduled'

/**
 * When a placed session is written: its weekday in its week, at the athlete's
 * training time. A pattern weekday is Monday-first and so is the Training Week,
 * so the weekday *is* the offset from the week's own Monday (ADR 0019). The
 * preview reads a session on the day and with the status this gives it.
 */
export function placedAt(
	session: Pick<GeneratedSession, 'weekKey' | 'weekday'>,
	trainingTime: string,
	timezone: string,
): Date {
	return localTimeUTC(
		addDays(session.weekKey, session.weekday),
		trainingTime,
		timezone,
	)
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
				scheduledAt: placedAt(session, target.trainingTime, target.timezone),
				status: PLACED_STATUS,
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
