/**
 * Writing the **Day Stamp**, and taking it back (ADR 0065 §5, ADR 0076).
 *
 * Two calls, both owner-scoped, both going through the paths the full authoring
 * route already goes through — `createWorkoutSession` and `deleteWorkoutSession`
 * — because a session authored from a cell is meant to be indistinguishable from
 * one authored on the full route, and a second write path is how two things stop
 * being the same thing.
 */
import { localTimeUTC } from './athlete-calendar.ts'
import { DEFAULT_TRAINING_TIME } from './athlete-schema.ts'
import { getAthleteTimezone } from './athlete.server.ts'
import { buildDayStamp, isStampableDiscipline } from './day-stamp.ts'
import { prisma } from './db.server.ts'
import { type Discipline } from './workout-schema.ts'
import { createWorkoutSession, deleteWorkoutSession } from './workout.server.ts'

export type DayStampResult =
	| { ok: true; sessionId: string }
	| { ok: false; reason: 'not-stampable' }

/**
 * Stamp a session onto a calendar day.
 *
 * `dateKey` is `YYYY-MM-DD` in the **athlete's own timezone** and the time of day
 * is their **Default Training Time**, so a stamped Thursday lands on Thursday
 * morning wherever they are and whichever side of a DST boundary it falls — the
 * same resolution the Plan Outline's own stamp and the Catalogue's place use.
 *
 * A past day takes the identical call and writes the identical thing: a
 * **Workout Session**, which is a prescription that happens to carry a date in
 * the past. It is not an actual and it claims nothing about what the athlete
 * did — `GOAL.md`'s no-in-app-recorder non-goal is about capturing executed
 * cardio, and executed cardio still arrives only by Activity Import.
 */
export async function stampSessionOnDay({
	userId,
	dateKey,
	discipline,
}: {
	userId: string
	dateKey: string
	discipline: Discipline
}): Promise<DayStampResult> {
	if (!isStampableDiscipline(discipline))
		return { ok: false, reason: 'not-stampable' }

	const [timezone, profile] = await Promise.all([
		getAthleteTimezone(userId),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { defaultTrainingTime: true },
		}),
	])
	const scheduledAt = localTimeUTC(
		dateKey,
		profile?.defaultTrainingTime ?? DEFAULT_TRAINING_TIME,
		timezone,
	)

	const input = buildDayStamp({ discipline, scheduledAt })

	const session = await createWorkoutSession(userId, input)
	return { ok: true, sessionId: session.id }
}

/**
 * Take the stamp back — ADR 0076's way out, and the reason a mistap on a row
 * that is now a write target is not a database row the athlete has to leave the
 * timeline to be rid of.
 *
 * The same owner-scoped delete the Workout Detail View's own delete uses, so the
 * prescription and its orphaned lineage go together. Returns `null` when there
 * is nothing to undo, which is the honest answer to a double tap.
 */
export async function undoDayStamp(userId: string, sessionId: string) {
	return deleteWorkoutSession(userId, sessionId)
}
