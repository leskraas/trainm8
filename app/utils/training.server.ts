import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'

const upcomingSessionSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	workout: {
		select: {
			id: true,
			title: true,
			description: true,
			activityType: true,
			blocks: {
				orderBy: { orderIndex: 'asc' as const },
				select: {
					id: true,
					name: true,
					orderIndex: true,
					steps: {
						orderBy: { orderIndex: 'asc' as const },
						select: {
							id: true,
							description: true,
							activity: true,
							intensity: true,
							orderIndex: true,
						},
					},
				},
			},
		},
	},
} satisfies Prisma.ScheduledSessionSelect

export type UpcomingSession = Prisma.ScheduledSessionGetPayload<{
	select: typeof upcomingSessionSelect
}>

export async function getUpcomingSessions(
	userId: string,
): Promise<UpcomingSession[]> {
	const now = new Date()
	const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
	return prisma.scheduledSession.findMany({
		where: {
			userId,
			status: 'scheduled',
			scheduledAt: { gte: now, lte: horizon },
		},
		orderBy: { scheduledAt: 'asc' },
		select: upcomingSessionSelect,
	})
}
