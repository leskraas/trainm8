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
import {
	buildDayStamp,
	buildWrittenSession,
	isStampableDiscipline,
} from './day-stamp.ts'
import { prisma } from './db.server.ts'
import { type CardioDiscipline, type Discipline } from './workout-schema.ts'
import { createWorkoutSession, deleteWorkoutSession } from './workout.server.ts'

export type DayStampResult =
	| { ok: true; sessionId: string }
	| { ok: false; reason: 'not-stampable' }

/**
 * A day's instant: `dateKey` in the athlete's own timezone at their Default
 * Training Time — the resolution the Plan Outline's stamp and the Catalogue's
 * place use too.
 */
async function scheduledAtOn(
	userId: string,
	dateKey: string,
	knownTimezone?: string,
): Promise<Date> {
	const [timezone, profile] = await Promise.all([
		knownTimezone ?? getAthleteTimezone(userId),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { defaultTrainingTime: true },
		}),
	])
	return localTimeUTC(
		dateKey,
		profile?.defaultTrainingTime ?? DEFAULT_TRAINING_TIME,
		timezone,
	)
}

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
	timezone,
}: {
	userId: string
	dateKey: string
	discipline: Discipline
	/** The Athlete Timezone, when the caller has already read it. */
	timezone?: string
}): Promise<DayStampResult> {
	if (!isStampableDiscipline(discipline))
		return { ok: false, reason: 'not-stampable' }

	const scheduledAt = await scheduledAtOn(userId, dateKey, timezone)
	const input = buildDayStamp({ discipline, scheduledAt })

	const session = await createWorkoutSession(userId, input)
	return { ok: true, sessionId: session.id }
}

export type WrittenSessionResult =
	| { ok: true; sessionId: string }
	| { ok: false; reason: 'not-understood' }

/**
 * Write a session the athlete typed on the **writing line** onto a day (#505
 * stories 35–40). The same day resolution and the same `createWorkoutSession`
 * as a stamp, so a written session is an authored session like every other —
 * and, like every other, it never touches the Week Target: nothing on this path
 * reads or writes the Plan Outline.
 *
 * Any day I dag renders takes it, past the Planning Horizon included
 * (`timeline-window.ts`); the horizon limits what the app lays, never what the
 * athlete writes.
 */
export async function writeSessionOnDay({
	userId,
	dateKey,
	discipline,
	sentence,
	timezone,
}: {
	userId: string
	dateKey: string
	/** The chip; a discipline word in the sentence wins over it. */
	discipline: CardioDiscipline | null
	sentence: string
	/** The Athlete Timezone, when the caller has already read it. */
	timezone?: string
}): Promise<WrittenSessionResult> {
	const scheduledAt = await scheduledAtOn(userId, dateKey, timezone)
	const input = buildWrittenSession({ sentence, discipline, scheduledAt })
	if (!input) return { ok: false, reason: 'not-understood' }
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
