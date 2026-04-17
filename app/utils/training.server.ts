import { prisma } from './db.server.ts'

export async function getUpcomingSessions(userId: string) {
  const now = new Date()
  return prisma.scheduledSession.findMany({
    where: {
      userId,
      status: 'scheduled',
      scheduledAt: { gte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    select: {
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
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              name: true,
              orderIndex: true,
              steps: {
                orderBy: { orderIndex: 'asc' },
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
    },
  })
}
