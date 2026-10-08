/**
 * Which Training Week is the first not yet begun, read against the athlete's
 * own sessions (#505 S7 review): a week is begun once its Monday is past or a
 * session in it is completed, so a Monday morning's run makes this week a
 * lived one, and nothing re-cuts or re-lays it.
 */

import { type Prisma } from '@prisma/client'
import {
	firstUnbegunWeekKey,
	weekBoundsFromMondayUTC,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'

export async function readFirstUnbegunWeekKey(
	userId: string,
	now: Date,
	timezone: string,
	db: Prisma.TransactionClient = prisma,
): Promise<string> {
	const monday = weekMonday(now, timezone)
	const { start, end } = weekBoundsFromMondayUTC(monday, timezone)
	const completed = await db.workoutSession.count({
		where: {
			userId,
			status: 'completed',
			scheduledAt: { gte: start, lte: end },
		},
	})
	return firstUnbegunWeekKey(now, timezone, {
		completedThisWeek: completed > 0,
	})
}
