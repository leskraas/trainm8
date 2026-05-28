import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import {
	connectAccountConnection,
	disconnectAccountConnection,
	getAccountConnection,
} from './account-connection.server.ts'
import { prisma } from './db.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'

const STRAVA = 'strava'

async function createAthlete(tz = 'UTC') {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			athleteProfile: {
				create: {
					timezone: tz,
					disciplineProfiles: {
						create: [{ discipline: 'run', lthr: 160, maxHr: 185 }],
					},
				},
			},
		},
	})
	return user
}

function connectStrava(athleteId: string) {
	return connectAccountConnection({
		athleteId,
		provider: STRAVA,
		externalAthleteId: faker.string.numeric(8),
		accessToken: faker.string.alphanumeric(24),
		refreshToken: faker.string.alphanumeric(24),
		expiresAt: new Date(Date.now() + 3_600_000),
	})
}

function createInboxImport(
	athleteId: string,
	provider = STRAVA,
	discipline = 'run',
) {
	const startedAt = new Date()
	return prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: provider,
			externalId: faker.string.uuid(),
			startedAt,
			endedAt: new Date(startedAt.getTime() + 3_600_000),
			durationSec: 3600,
			discipline,
			rawJson: '{}',
		},
		select: { id: true },
	})
}

async function createPromotedImport(
	athleteId: string,
	scheduledAt: Date,
	discipline = 'run',
	hrAvg = 160,
) {
	const imp = await prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: STRAVA,
			externalId: faker.string.uuid(),
			startedAt: scheduledAt,
			endedAt: new Date(scheduledAt.getTime() + 3_600_000),
			durationSec: 3600,
			discipline,
			hrAvg,
			rawJson: '{}',
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId: athleteId,
			scheduledAt,
			status: 'completed',
			recordingId: imp.id,
		},
		select: { id: true },
	})
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: { promotedSessionId: session.id },
	})
	return { importId: imp.id, sessionId: session.id }
}

test('disconnect removes the Account Connection row', async () => {
	const athlete = await createAthlete()
	await connectStrava(athlete.id)

	const result = await disconnectAccountConnection({
		athleteId: athlete.id,
		provider: STRAVA,
	})

	expect(result.disconnected).toBe(true)
	expect(await getAccountConnection(athlete.id, STRAVA)).toBeNull()
})

test('non-promoted inbox imports are removed on disconnect', async () => {
	const athlete = await createAthlete()
	await connectStrava(athlete.id)
	await createInboxImport(athlete.id)
	await createInboxImport(athlete.id)

	const result = await disconnectAccountConnection({
		athleteId: athlete.id,
		provider: STRAVA,
	})

	expect(result.removedImports).toBe(2)
	const remaining = await prisma.activityImport.count({
		where: { athleteId: athlete.id, externalProvider: STRAVA },
	})
	expect(remaining).toBe(0)
})

test('promoted Recordings survive disconnect and stay resolvable', async () => {
	const athlete = await createAthlete()
	await connectStrava(athlete.id)
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const { importId, sessionId } = await createPromotedImport(athlete.id, today)
	// plus an inbox item that should be cleaned up
	await createInboxImport(athlete.id)

	const result = await disconnectAccountConnection({
		athleteId: athlete.id,
		provider: STRAVA,
	})

	// Only the non-promoted import was removed.
	expect(result.removedImports).toBe(1)

	// The promoted import row survives, still pointing at its session.
	const promoted = await prisma.activityImport.findUnique({
		where: { id: importId },
	})
	expect(promoted).not.toBeNull()
	expect(promoted!.promotedSessionId).toBe(sessionId)

	// The Workout Session's recording linkage still resolves to the import.
	const session = await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		include: { recording: true },
	})
	expect(session!.recordingId).toBe(importId)
	expect(session!.recording!.id).toBe(importId)
})

test('Load Snapshots are unchanged for days containing promoted imports', async () => {
	const athlete = await createAthlete()
	await connectStrava(athlete.id)
	const today = new Date()
	today.setUTCHours(12, 0, 0, 0)
	const todayStr = today.toISOString().slice(0, 10)
	await createPromotedImport(athlete.id, today)
	await recomputeLoadFrom(athlete.id, todayStr)

	const before = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: athlete.id, date: todayStr } },
	})
	expect(before).not.toBeNull()
	expect(before!.tssTotal).toBeGreaterThan(0)

	await disconnectAccountConnection({ athleteId: athlete.id, provider: STRAVA })

	const after = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: athlete.id, date: todayStr } },
	})
	// Disconnect must not retroactively recompute Training Load.
	expect(after).not.toBeNull()
	expect(after!.tssTotal).toBe(before!.tssTotal)
	expect(after!.computedAt.getTime()).toBe(before!.computedAt.getTime())
})

test('disconnect leaves other providers and other athletes untouched', async () => {
	const athlete = await createAthlete()
	const other = await createAthlete()
	await connectStrava(athlete.id)
	await createInboxImport(athlete.id, 'manual') // different provider
	const othersImport = await createInboxImport(other.id, STRAVA) // different athlete

	await disconnectAccountConnection({ athleteId: athlete.id, provider: STRAVA })

	const manualSurvives = await prisma.activityImport.count({
		where: { athleteId: athlete.id, externalProvider: 'manual' },
	})
	expect(manualSurvives).toBe(1)
	const othersSurvives = await prisma.activityImport.findUnique({
		where: { id: othersImport.id },
	})
	expect(othersSurvives).not.toBeNull()
})

test('disconnect is a no-op when there is no connection', async () => {
	const athlete = await createAthlete()

	const result = await disconnectAccountConnection({
		athleteId: athlete.id,
		provider: STRAVA,
	})

	expect(result.disconnected).toBe(false)
	expect(result.removedImports).toBe(0)
})

test('reconnect after disconnect creates a fresh Account Connection', async () => {
	const athlete = await createAthlete()
	const first = await connectStrava(athlete.id)
	await disconnectAccountConnection({ athleteId: athlete.id, provider: STRAVA })

	const second = await connectStrava(athlete.id)

	expect(second.id).not.toBe(first.id)
	const connection = await getAccountConnection(athlete.id, STRAVA)
	expect(connection!.status).toBe('active')
})
