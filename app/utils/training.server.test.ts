import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { getUpcomingSessions } from './training.server.ts'

async function createUserWithPassword() {
  const userData = createUser()
  return prisma.user.create({
    select: { id: true },
    data: { ...userData, password: { create: createPassword(userData.username) } },
  })
}

async function createWorkoutForUser(userId: string) {
  return prisma.workout.create({
    select: { id: true },
    data: {
      title: faker.lorem.words(3),
      activityType: 'run',
      ownerId: userId,
      blocks: {
        create: [{
          orderIndex: 0,
          steps: {
            create: [{ description: '10 min easy', activity: 'run', intensity: 'easy', orderIndex: 0 }],
          },
        }],
      },
    },
  })
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

test('returns sessions scheduled in the future', async () => {
  const user = await createUserWithPassword()
  const workout = await createWorkoutForUser(user.id)
  await prisma.scheduledSession.create({
    data: { userId: user.id, workoutId: workout.id, scheduledAt: inDays(2), status: 'scheduled' },
  })
  const sessions = await getUpcomingSessions(user.id)
  expect(sessions).toHaveLength(1)
  expect(sessions[0]?.workout.id).toBe(workout.id)
})

test('excludes sessions in the past', async () => {
  const user = await createUserWithPassword()
  const workout = await createWorkoutForUser(user.id)
  await prisma.scheduledSession.create({
    data: { userId: user.id, workoutId: workout.id, scheduledAt: daysAgo(1), status: 'scheduled' },
  })
  const sessions = await getUpcomingSessions(user.id)
  expect(sessions).toHaveLength(0)
})

test('excludes sessions belonging to another user', async () => {
  const userA = await createUserWithPassword()
  const userB = await createUserWithPassword()
  const workout = await createWorkoutForUser(userA.id)
  await prisma.scheduledSession.create({
    data: { userId: userA.id, workoutId: workout.id, scheduledAt: inDays(3), status: 'scheduled' },
  })
  const sessions = await getUpcomingSessions(userB.id)
  expect(sessions).toHaveLength(0)
})

test('returns sessions ordered soonest-first', async () => {
  const user = await createUserWithPassword()
  const workout = await createWorkoutForUser(user.id)
  await prisma.scheduledSession.createMany({
    data: [
      { userId: user.id, workoutId: workout.id, scheduledAt: inDays(5), status: 'scheduled' },
      { userId: user.id, workoutId: workout.id, scheduledAt: inDays(1), status: 'scheduled' },
    ],
  })
  const sessions = await getUpcomingSessions(user.id)
  expect(sessions[0]!.scheduledAt.getTime()).toBeLessThan(sessions[1]!.scheduledAt.getTime())
})

test('excludes completed sessions', async () => {
  const user = await createUserWithPassword()
  const workout = await createWorkoutForUser(user.id)
  await prisma.scheduledSession.create({
    data: { userId: user.id, workoutId: workout.id, scheduledAt: inDays(2), status: 'completed' },
  })
  const sessions = await getUpcomingSessions(user.id)
  expect(sessions).toHaveLength(0)
})
