import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import {
	createActivityImport,
	getInboxImports,
	autoMatchImport,
	promoteToExistingSession,
	promoteToNewSession,
	unlinkImport,
} from './activity-import.server.ts'

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

async function createWorkoutForUser(userId: string, discipline = 'run') {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline,
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									description: '10 min easy',
									discipline,
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

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

function makeImportData(
	overrides: Partial<Parameters<typeof createActivityImport>[1]> = {},
) {
	const startedAt = daysAgo(1)
	const endedAt = new Date(startedAt.getTime() + 45 * 60 * 1000)
	return {
		externalProvider: 'manual' as const,
		externalId: faker.string.uuid(),
		startedAt,
		endedAt,
		durationSec: 2700,
		distanceM: 8000,
		discipline: 'run',
		rawJson: JSON.stringify({ source: 'test' }),
		...overrides,
	}
}

// ── dedup ──────────────────────────────────────────────────────────────────

test('dedup: rejects duplicate (externalProvider, externalId)', async () => {
	const user = await createUserWithPassword()
	const data = makeImportData()
	await createActivityImport(user.id, data)
	await expect(createActivityImport(user.id, data)).rejects.toThrow()
})

test('dedup: allows same externalId with different provider', async () => {
	const user = await createUserWithPassword()
	const id = faker.string.uuid()
	await createActivityImport(
		user.id,
		makeImportData({ externalProvider: 'manual', externalId: id }),
	)
	const second = await createActivityImport(
		user.id,
		makeImportData({ externalProvider: 'strava', externalId: id }),
	)
	expect(second.id).toBeDefined()
})

// ── inbox ──────────────────────────────────────────────────────────────────

test('inbox: returns only unpromoted imports for the athlete', async () => {
	const user = await createUserWithPassword()
	const other = await createUserWithPassword()

	await createActivityImport(user.id, makeImportData())
	await createActivityImport(user.id, makeImportData())
	await createActivityImport(other.id, makeImportData())

	const inbox = await getInboxImports(user.id)
	expect(inbox).toHaveLength(2)
})

test('inbox: promoted imports do not appear', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId: user.id, workoutId: workout.id, scheduledAt: daysAgo(2) },
	})
	const imported = await createActivityImport(user.id, makeImportData())
	await promoteToExistingSession(user.id, imported.id, session.id)

	const inbox = await getInboxImports(user.id)
	expect(inbox).toHaveLength(0)
})

// ── auto-match ─────────────────────────────────────────────────────────────

test('auto-match: links import to same-day same-discipline planned session', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id, 'run')
	// Session scheduled for "today" in UTC
	const today = new Date()
	today.setUTCHours(9, 0, 0, 0)
	await prisma.workoutSession.create({
		data: { userId: user.id, workoutId: workout.id, scheduledAt: today },
	})

	const startedAt = new Date()
	startedAt.setUTCHours(9, 30, 0, 0)
	const endedAt = new Date(startedAt.getTime() + 45 * 60 * 1000)

	const imported = await createActivityImport(
		user.id,
		makeImportData({ startedAt, endedAt, discipline: 'run' }),
	)
	const matched = await autoMatchImport(user.id, imported.id, 'UTC')

	expect(matched).not.toBeNull()
	expect(matched!.sessionId).toBeDefined()
	expect(matched!.importId).toBe(imported.id)
})

test('auto-match: skips when discipline does not match', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id, 'bike')
	const today = new Date()
	today.setUTCHours(9, 0, 0, 0)
	await prisma.workoutSession.create({
		data: { userId: user.id, workoutId: workout.id, scheduledAt: today },
	})

	const startedAt = new Date()
	startedAt.setUTCHours(9, 30, 0, 0)
	const endedAt = new Date(startedAt.getTime() + 45 * 60 * 1000)

	const imported = await createActivityImport(
		user.id,
		makeImportData({ startedAt, endedAt, discipline: 'run' }),
	)
	const matched = await autoMatchImport(user.id, imported.id, 'UTC')

	expect(matched).toBeNull()
})

test('auto-match: skips when multiple candidates exist (ambiguous)', async () => {
	const user = await createUserWithPassword()
	const workout1 = await createWorkoutForUser(user.id, 'run')
	const workout2 = await createWorkoutForUser(user.id, 'run')
	const today = new Date()
	today.setUTCHours(8, 0, 0, 0)
	const today2 = new Date()
	today2.setUTCHours(18, 0, 0, 0)
	await prisma.workoutSession.create({
		data: { userId: user.id, workoutId: workout1.id, scheduledAt: today },
	})
	await prisma.workoutSession.create({
		data: { userId: user.id, workoutId: workout2.id, scheduledAt: today2 },
	})

	const startedAt = new Date()
	startedAt.setUTCHours(10, 0, 0, 0)
	const endedAt = new Date(startedAt.getTime() + 45 * 60 * 1000)

	const imported = await createActivityImport(
		user.id,
		makeImportData({ startedAt, endedAt, discipline: 'run' }),
	)
	const matched = await autoMatchImport(user.id, imported.id, 'UTC')

	expect(matched).toBeNull()
})

test('auto-match: skips session that already has a recording', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id, 'run')
	const today = new Date()
	today.setUTCHours(9, 0, 0, 0)
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId: user.id, workoutId: workout.id, scheduledAt: today },
	})

	// First import gets promoted to that session
	const first = await createActivityImport(
		user.id,
		makeImportData({ discipline: 'run' }),
	)
	await promoteToExistingSession(user.id, first.id, session.id)

	// Second import same day, same discipline — should not auto-match (session taken)
	const startedAt = new Date()
	startedAt.setUTCHours(9, 30, 0, 0)
	const endedAt = new Date(startedAt.getTime() + 45 * 60 * 1000)
	const second = await createActivityImport(
		user.id,
		makeImportData({ startedAt, endedAt, discipline: 'run' }),
	)
	const matched = await autoMatchImport(user.id, second.id, 'UTC')
	expect(matched).toBeNull()
})

// ── promote to existing ────────────────────────────────────────────────────

test('promote-to-existing: links import to session bidirectionally', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId: user.id, workoutId: workout.id, scheduledAt: inDays(1) },
	})
	const imported = await createActivityImport(user.id, makeImportData())

	await promoteToExistingSession(user.id, imported.id, session.id)

	const updatedImport = await prisma.activityImport.findUnique({
		where: { id: imported.id },
	})
	const updatedSession = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})

	expect(updatedImport!.promotedSessionId).toBe(session.id)
	expect(updatedSession!.recordingId).toBe(imported.id)
})

// ── promote to new (recording-only) ───────────────────────────────────────

test('promote-to-new: creates recording-only session with null workoutId', async () => {
	const user = await createUserWithPassword()
	const imported = await createActivityImport(user.id, makeImportData())

	const { session } = await promoteToNewSession(user.id, imported.id)

	expect(session.workoutId).toBeNull()
	expect(session.recordingId).toBe(imported.id)

	const updatedImport = await prisma.activityImport.findUnique({
		where: { id: imported.id },
	})
	expect(updatedImport!.promotedSessionId).toBe(session.id)
})

test('promote-to-new: scheduledAt is set to import startedAt', async () => {
	const user = await createUserWithPassword()
	const startedAt = new Date('2026-05-10T08:00:00.000Z')
	const endedAt = new Date('2026-05-10T09:00:00.000Z')
	const imported = await createActivityImport(
		user.id,
		makeImportData({ startedAt, endedAt }),
	)

	const { session } = await promoteToNewSession(user.id, imported.id)
	const full = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})

	expect(full!.scheduledAt.toISOString()).toBe(startedAt.toISOString())
})

// ── unlink ─────────────────────────────────────────────────────────────────

test('unlink: removes linkage and returns import to inbox', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId: user.id, workoutId: workout.id, scheduledAt: inDays(1) },
	})
	const imported = await createActivityImport(user.id, makeImportData())
	await promoteToExistingSession(user.id, imported.id, session.id)

	await unlinkImport(user.id, imported.id)

	const updatedImport = await prisma.activityImport.findUnique({
		where: { id: imported.id },
	})
	const updatedSession = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})

	expect(updatedImport!.promotedSessionId).toBeNull()
	expect(updatedSession!.recordingId).toBeNull()
})

test('unlink: deletes recording-only session when unlinking', async () => {
	const user = await createUserWithPassword()
	const imported = await createActivityImport(user.id, makeImportData())
	const { session } = await promoteToNewSession(user.id, imported.id)

	await unlinkImport(user.id, imported.id)

	const deletedSession = await prisma.workoutSession.findUnique({
		where: { id: session.id },
	})
	const updatedImport = await prisma.activityImport.findUnique({
		where: { id: imported.id },
	})

	expect(deletedSession).toBeNull()
	expect(updatedImport!.promotedSessionId).toBeNull()
})
