import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import {
	createSessionLog,
	getSessionLog,
	upsertSessionLog,
	validateRpe,
} from './session-log.server.ts'

async function createUserWithPassword() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
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
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									description: '10 min easy',
									activity: 'run',
									intensity: 'easy',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
		},
	})
}

async function createScheduledSession(userId: string, workoutId: string) {
	return prisma.scheduledSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId,
			scheduledAt: new Date(),
			status: 'completed',
		},
	})
}

test('validateRpe accepts null/undefined', () => {
	expect(validateRpe(null)).toEqual({ valid: true, value: null })
	expect(validateRpe(undefined)).toEqual({ valid: true, value: null })
})

test('validateRpe accepts integers 1 through 10', () => {
	for (let i = 1; i <= 10; i++) {
		expect(validateRpe(i)).toEqual({ valid: true, value: i })
	}
})

test('validateRpe rejects 0', () => {
	expect(validateRpe(0)).toEqual({
		valid: false,
		error: 'RPE must be an integer between 1 and 10',
	})
})

test('validateRpe rejects 11', () => {
	expect(validateRpe(11)).toEqual({
		valid: false,
		error: 'RPE must be an integer between 1 and 10',
	})
})

test('validateRpe rejects negative numbers', () => {
	expect(validateRpe(-1)).toEqual({
		valid: false,
		error: 'RPE must be an integer between 1 and 10',
	})
})

test('validateRpe rejects non-integer numbers', () => {
	expect(validateRpe(5.5)).toEqual({
		valid: false,
		error: 'RPE must be an integer between 1 and 10',
	})
})

test('creates a session log with content and RPE', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await createScheduledSession(user.id, workout.id)

	const log = await createSessionLog({
		sessionId: session.id,
		content: 'Felt strong today',
		rpe: 7,
	})

	expect(log.content).toBe('Felt strong today')
	expect(log.rpe).toBe(7)
	expect(log.sessionId).toBe(session.id)
})

test('creates a session log without RPE', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await createScheduledSession(user.id, workout.id)

	const log = await createSessionLog({
		sessionId: session.id,
		content: 'Quick recovery run',
	})

	expect(log.content).toBe('Quick recovery run')
	expect(log.rpe).toBeNull()
})

test('enforces one-to-one: cannot create two logs for the same session', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await createScheduledSession(user.id, workout.id)

	await createSessionLog({
		sessionId: session.id,
		content: 'First log',
	})

	await expect(
		createSessionLog({
			sessionId: session.id,
			content: 'Second log',
		}),
	).rejects.toThrow()
})

test('retrieves an existing session log', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await createScheduledSession(user.id, workout.id)

	await createSessionLog({
		sessionId: session.id,
		content: 'Great tempo run',
		rpe: 8,
	})

	const log = await getSessionLog(session.id)
	expect(log).not.toBeNull()
	expect(log!.content).toBe('Great tempo run')
	expect(log!.rpe).toBe(8)
})

test('returns null when no session log exists', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await createScheduledSession(user.id, workout.id)

	const log = await getSessionLog(session.id)
	expect(log).toBeNull()
})

test('upserts: creates a new session log when none exists', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await createScheduledSession(user.id, workout.id)

	const log = await upsertSessionLog({
		sessionId: session.id,
		content: 'New log entry',
		rpe: 6,
	})

	expect(log.content).toBe('New log entry')
	expect(log.rpe).toBe(6)
	expect(log.sessionId).toBe(session.id)
})

test('upserts: updates existing session log instead of duplicating', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await createScheduledSession(user.id, workout.id)

	await upsertSessionLog({
		sessionId: session.id,
		content: 'First version',
		rpe: 5,
	})

	const updated = await upsertSessionLog({
		sessionId: session.id,
		content: 'Updated version',
		rpe: 8,
	})

	expect(updated.content).toBe('Updated version')
	expect(updated.rpe).toBe(8)

	const all = await prisma.sessionLog.findMany({
		where: { sessionId: session.id },
	})
	expect(all).toHaveLength(1)
})
