/**
 * What the Bibliotek section of Plan reads (ADR 0101 §1): the lifts the
 * athlete has actually put in a session, most recent first. Read on both of
 * Plan's landings — the plan, and plan creation while there is no plan — so the
 * catalogue, programs and exercises are one tap away whichever one Plan opens.
 */
import { prisma } from '#app/utils/db.server.ts'
import { getRecentExerciseIds } from '#app/utils/workout.server.ts'

/** How many of the athlete's own lifts the section lists. */
const RECENT_LIFTS = 12

export type LibraryLift = { id: string; name: string }

export async function readLibraryLifts(userId: string): Promise<LibraryLift[]> {
	const ids = await getRecentExerciseIds(userId, RECENT_LIFTS)
	const rows = await prisma.exercise.findMany({
		where: { id: { in: ids } },
		select: { id: true, name: true },
	})
	// Back into recency order: `findMany` returns its own.
	const byId = new Map(rows.map((row) => [row.id, row]))
	return ids.flatMap((id) => {
		const row = byId.get(id)
		return row ? [row] : []
	})
}
