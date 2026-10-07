// Which Plan Outline is the athlete's active one, said once (ADR 0018, ADR 0079).
//
// The rule: the nearest upcoming, uncancelled Target Event carrying a phased
// Outline wins, and the athlete's open-ended Outline is the fallback. While a
// plan toward a race is active the open-ended plan **rests**: nothing lays
// sessions for it, by hand or by the horizon fill, because two plans would
// then claim the same weeks. `findActiveOutline` (training.server.ts) reads the
// rows; the writers ask `isOutlineResting` before they write.

import { type Prisma } from '@prisma/client'
import { prisma } from '#app/utils/db.server.ts'

/**
 * The anchored Outlines that can be active: the athlete's own, on an Event that
 * is not cancelled and not yet past, with at least one phase. A multi-day
 * Event counts until its end date passes, a single-day one until its start.
 */
export function anchoredActiveOutlineWhere(
	userId: string,
	now: Date,
): Prisma.PlanOutlineWhereInput {
	return {
		athleteId: userId,
		phases: { some: {} },
		event: {
			is: {
				status: { not: 'cancelled' },
				OR: [
					{ endDate: null, startDate: { gte: now } },
					{ endDate: { gte: now } },
				],
			},
		},
	}
}

/**
 * Whether this Outline is an open-ended plan resting behind an active plan
 * toward a race. An anchored Outline never rests: it is either the active one
 * or a plan for a later season, which the athlete may lay weeks for.
 */
export async function isOutlineResting(
	userId: string,
	outline: { eventId: string | null },
	now: Date,
): Promise<boolean> {
	if (outline.eventId != null) return false
	const anchored = await prisma.planOutline.findFirst({
		where: anchoredActiveOutlineWhere(userId, now),
		select: { id: true },
	})
	return anchored != null
}
