import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	createEvent,
	updateEvent,
	deleteEvent,
	getEventById,
	getEventsForUser,
	getCandidateSessionsForEvent,
	setEventResult,
	cancelEvent,
} from './event.server.ts'

async function setupUser() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return session
}

async function createWorkout(userId: string) {
	return prisma.workout.create({
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									description: 'Easy run',
									discipline: 'run',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
}

async function createWorkoutSession(userId: string, scheduledAt: Date) {
	const workout = await createWorkout(userId)
	return prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status: 'scheduled',
		},
		select: { id: true, scheduledAt: true },
	})
}

test('createEvent saves a minimal event', async () => {
	const { userId } = await setupUser()

	const event = await createEvent(userId, {
		name: 'Trondheim Marathon',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
	})

	expect(event.id).toBeTruthy()
	expect(event.name).toBe('Trondheim Marathon')
	expect(event.kind).toBe('race')
	expect(event.priority).toBe('A')
	expect(event.status).toBe('planned')
	expect(event.resultSessionId).toBeNull()
})

test('createEvent saves disciplines as JSON', async () => {
	const { userId } = await setupUser()

	const event = await createEvent(userId, {
		name: 'Sprint Tri',
		kind: 'race',
		priority: 'B',
		startDate: new Date('2026-07-01'),
		disciplines: ['run', 'swim', 'bike'],
		status: 'planned',
	})

	const raw = await prisma.event.findFirst({ where: { id: event.id }, select: { disciplines: true } })
	expect(JSON.parse(raw!.disciplines)).toEqual(['run', 'swim', 'bike'])
})

test('getEventsForUser returns only own events', async () => {
	const user1 = await setupUser()
	const user2 = await setupUser()

	await createEvent(user1.userId, {
		name: 'My Race',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-08-01'),
		disciplines: ['run'],
		status: 'planned',
	})

	const user2Events = await getEventsForUser(user2.userId)
	expect(user2Events).toHaveLength(0)

	const user1Events = await getEventsForUser(user1.userId)
	expect(user1Events).toHaveLength(1)
	expect(user1Events[0]!.name).toBe('My Race')
})

test('getEventById returns null for another user', async () => {
	const user1 = await setupUser()
	const user2 = await setupUser()

	const event = await createEvent(user1.userId, {
		name: 'Private Race',
		kind: 'race',
		priority: 'C',
		startDate: new Date('2026-09-01'),
		disciplines: ['bike'],
		status: 'planned',
	})

	const result = await getEventById(user2.userId, event.id)
	expect(result).toBeNull()
})

test('updateEvent changes mutable fields', async () => {
	const { userId } = await setupUser()

	const event = await createEvent(userId, {
		name: 'Old Name',
		kind: 'race',
		priority: 'C',
		startDate: new Date('2026-10-01'),
		disciplines: ['run'],
		status: 'planned',
	})

	const updated = await updateEvent(userId, event.id, {
		name: 'New Name',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-10-01'),
		disciplines: ['run'],
		status: 'planned',
	})

	expect(updated!.name).toBe('New Name')
	expect(updated!.priority).toBe('A')
})

test('deleteEvent removes the record and returns null for owner', async () => {
	const { userId } = await setupUser()

	const event = await createEvent(userId, {
		name: 'Doomed Race',
		kind: 'fitness-goal',
		priority: 'C',
		startDate: new Date('2026-11-01'),
		disciplines: ['strength'],
		status: 'planned',
	})

	await deleteEvent(userId, event.id)

	const gone = await getEventById(userId, event.id)
	expect(gone).toBeNull()
})

test('getCandidateSessionsForEvent returns sessions within date range and discipline', async () => {
	const { userId } = await setupUser()

	const inRange = await createWorkoutSession(userId, new Date('2026-06-15T08:00:00Z'))
	const outOfRange = await createWorkoutSession(userId, new Date('2026-07-01T08:00:00Z'))

	await createEvent(userId, {
		name: 'June Race',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-06-14'),
		endDate: new Date('2026-06-16'),
		disciplines: ['run'],
		status: 'planned',
	})

	const events = await getEventsForUser(userId)
	const event = events[0]!

	const candidates = await getCandidateSessionsForEvent(userId, event.id)
	const ids = candidates.map((s) => s.id)
	expect(ids).toContain(inRange.id)
	expect(ids).not.toContain(outOfRange.id)
})

test('setEventResult links a session and marks completed', async () => {
	const { userId } = await setupUser()

	const event = await createEvent(userId, {
		name: 'Race Day',
		kind: 'race',
		priority: 'A',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
	})

	const session = await createWorkoutSession(userId, new Date('2026-06-15T08:00:00Z'))

	const updated = await setEventResult(userId, event.id, session.id)
	expect(updated!.resultSessionId).toBe(session.id)
	expect(updated!.status).toBe('completed')
})

test('cancelEvent sets status to cancelled and clears resultSessionId', async () => {
	const { userId } = await setupUser()

	const session = await createWorkoutSession(userId, new Date('2026-06-15T08:00:00Z'))

	const event = await createEvent(userId, {
		name: 'Cancelled Race',
		kind: 'race',
		priority: 'B',
		startDate: new Date('2026-06-15'),
		disciplines: ['run'],
		status: 'planned',
	})

	await setEventResult(userId, event.id, session.id)
	const cancelled = await cancelEvent(userId, event.id)

	expect(cancelled!.status).toBe('cancelled')
	expect(cancelled!.resultSessionId).toBeNull()
})
