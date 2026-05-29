import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { runStravaBackfill } from './backfill.server.ts'

/**
 * An athlete with an active Strava connection and a run threshold profile so
 * HR-based TSS is computable for the mock "Morning Run" (avg HR 150).
 */
async function setupBackfillAthlete() {
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [{ discipline: 'run', lthr: 160, maxHr: 185 }],
					},
				},
			},
		},
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'initial_access',
			refreshToken: 'initial_refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-28T00:00:00.000Z'),
		},
	})
	return { user, connection }
}

async function createRunWorkout(userId: string) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
		},
	})
}

test('backfill imports the activities in the window', async () => {
	const { user } = await setupBackfillAthlete()

	const result = await runStravaBackfill(user.id)

	invariant(result.ok, 'expected a successful backfill')
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(4)
	expect(imports.map((i) => i.discipline).sort()).toEqual([
		'bike',
		'other',
		'run',
		'swim',
	])
})

test('an unmatched modeled activity is auto-promoted to a recording-only session', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)

	const bike = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'bike' },
	})
	expect(bike!.promotedSessionId).not.toBeNull()

	const session = await prisma.workoutSession.findUnique({
		where: { id: bike!.promotedSessionId! },
	})
	expect(session!.workoutId).toBeNull()
	expect(session!.status).toBe('completed')
	expect(session!.recordingId).toBe(bike!.id)
})

test('a matched activity links to the planned session instead of creating one', async () => {
	const { user } = await setupBackfillAthlete()
	const workout = await createRunWorkout(user.id)
	// Planned run on the same UTC day as the mock "Morning Run" (2026-05-20).
	const planned = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-20T09:00:00.000Z'),
		},
	})

	await runStravaBackfill(user.id)

	const run = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'run' },
	})
	expect(run!.promotedSessionId).toBe(planned.id)

	// No extra recording-only run session was created.
	const runSessions = await prisma.workoutSession.count({
		where: { userId: user.id, recordingId: run!.id },
	})
	expect(runSessions).toBe(1)
})

test('an "other" activity stays in the inbox, never auto-promoted', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)

	const other = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, discipline: 'other' },
	})
	expect(other!.promotedSessionId).toBeNull()
	const otherSessions = await prisma.workoutSession.count({
		where: { userId: user.id, recordingId: other!.id },
	})
	expect(otherSessions).toBe(0)
})

test('watermarks are stamped: lastSyncedAt to the latest activity, backfillCompletedAt set', async () => {
	const { user, connection } = await setupBackfillAthlete()
	const now = new Date('2026-05-28T12:00:00.000Z')

	await runStravaBackfill(user.id, { now })

	const after = await prisma.accountConnection.findUniqueOrThrow({
		where: { id: connection.id },
	})
	// Latest mock activity is the Hike at 2026-05-23T17:00:00Z.
	expect(after.lastSyncedAt!.toISOString()).toBe('2026-05-23T17:00:00.000Z')
	expect(after.backfillCompletedAt!.toISOString()).toBe(now.toISOString())
})

test('Training Load is recomputed across the window after backfill', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)

	// The auto-promoted "Morning Run" (avg HR 150, LTHR 160) contributes hrTSS.
	const snapshot = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: '2026-05-20' } },
	})
	expect(snapshot).not.toBeNull()
	expect(snapshot!.tssTotal).toBeGreaterThan(0)
})

test('backfill is idempotent on retry', async () => {
	const { user } = await setupBackfillAthlete()

	await runStravaBackfill(user.id)
	const second = await runStravaBackfill(user.id)

	invariant(second.ok, 'expected a successful re-run')
	expect(second.created).toBe(0)
	expect(second.promoted).toBe(0)

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(4)
	// run + bike + swim auto-promoted (3 recording-only sessions); 'other' is not.
	const sessions = await prisma.workoutSession.count({
		where: { userId: user.id },
	})
	expect(sessions).toBe(3)
})
