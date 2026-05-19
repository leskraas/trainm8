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
			discipline: true,
			intent: true,
			blocks: {
				orderBy: { orderIndex: 'asc' as const },
				select: {
					id: true,
					name: true,
					orderIndex: true,
					repeatCount: true,
					steps: {
						orderBy: { orderIndex: 'asc' as const },
						select: {
							id: true,
							description: true,
							discipline: true,
							intensity: true,
							orderIndex: true,
							durationSec: true,
							distanceM: true,
						},
					},
				},
			},
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type UpcomingSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof upcomingSessionSelect
}>

export async function getUpcomingSessions(
	userId: string,
): Promise<UpcomingSession[]> {
	const now = new Date()
	const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
	return prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: now, lte: horizon },
		},
		orderBy: { scheduledAt: 'asc' },
		select: upcomingSessionSelect,
	})
}

const sessionDetailSelect = {
	...upcomingSessionSelect,
	sessionLog: {
		select: {
			id: true,
			content: true,
			rpe: true,
			createdAt: true,
			updatedAt: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type SessionDetail = Prisma.WorkoutSessionGetPayload<{
	select: typeof sessionDetailSelect
}>

export async function getSessionByIdForUser(
	userId: string,
	sessionId: string,
): Promise<SessionDetail | null> {
	return prisma.workoutSession.findFirst({
		where: {
			id: sessionId,
			userId,
		},
		select: sessionDetailSelect,
	})
}
