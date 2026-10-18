// Every Training Track's **Pinned days** on the athlete's active plan, by
// Discipline (#597, ADR 0104 §4) — what Week Replan prefers for a track's
// make-up when one of its days is free (spec #588 story 32).

import { prisma } from '../db.server.ts'
import { findActiveOutline } from '../training.server.ts'
import {
	type PlannedDiscipline,
	readPlannedDiscipline,
} from '../planned-discipline.ts'
import { parsePinnedDays, strengthPinnedDays } from './pinned-days.ts'
import { type PatternWeekday } from './week-pattern.ts'

/**
 * The active plan's tracks that name their own days, keyed by Discipline,
 * Monday first. A strength track reads its stored `fixed` days as pinned
 * where it names none (ADR 0104 §4). Empty without a plan.
 */
export async function readPinnedDaysByDiscipline(
	userId: string,
	now: Date = new Date(),
): Promise<Map<PlannedDiscipline, PatternWeekday[]>> {
	const pinned = new Map<PlannedDiscipline, PatternWeekday[]>()
	const active = await findActiveOutline(userId, now)
	if (!active) return pinned
	const [tracks, pattern] = await Promise.all([
		prisma.trainingTrack.findMany({
			where: { outlineId: active.outline.id },
			select: { id: true, discipline: true, pinnedDays: true },
		}),
		prisma.weekPattern.findFirst({
			where: { outlineId: active.outline.id, days: { some: {} } },
			orderBy: { orderIndex: 'asc' },
			select: {
				days: { select: { trackId: true, kind: true, weekday: true } },
			},
		}),
	])
	for (const track of tracks) {
		const days =
			track.discipline === 'strength'
				? strengthPinnedDays(
						track,
						(pattern?.days ?? []).filter((day) => day.trackId === track.id),
					)
				: parsePinnedDays(track.pinnedDays)
		const discipline = readPlannedDiscipline(track.discipline)
		if (days && discipline) pinned.set(discipline, days)
	}
	return pinned
}
