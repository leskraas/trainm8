import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { getPersonalRecords } from './personal-records.server.ts'

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	return user
}

/**
 * A completed Workout Session backed by a Recording (a promoted Activity
 * Import), carrying the achieved distance and a Load Confidence. Mirrors how the
 * import→promotion pipeline links a Recording to its session.
 */
async function createRecordedEffort(
	userId: string,
	{
		discipline,
		distanceM,
		scheduledAt,
		confidence = 'high',
		status = 'completed',
	}: {
		discipline: string
		distanceM: number | null
		scheduledAt: Date
		confidence?: 'high' | 'medium' | 'low' | null
		status?: string
	},
) {
	const imp = await prisma.activityImport.create({
		data: {
			athleteId: userId,
			externalProvider: 'strava',
			externalId: faker.string.uuid(),
			startedAt: scheduledAt,
			endedAt: new Date(scheduledAt.getTime() + 3600 * 1000),
			durationSec: 3600,
			distanceM,
			discipline,
			tssConfidence: confidence,
			rawJson: '{}',
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt,
			status,
			recordingId: imp.id,
			tssConfidence: confidence,
		},
		select: { id: true },
	})
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: { promotedSessionId: session.id },
	})
	return session
}

test('returns no records for an athlete with no qualifying efforts', async () => {
	const user = await createAthlete()
	expect(await getPersonalRecords(user.id)).toEqual([])
})

test('derives the farthest effort per discipline from recorded efforts', async () => {
	const user = await createAthlete()
	await createRecordedEffort(user.id, {
		discipline: 'run',
		distanceM: 10_000,
		scheduledAt: new Date('2030-01-01T08:00:00Z'),
	})
	const longest = await createRecordedEffort(user.id, {
		discipline: 'run',
		distanceM: 21_100,
		scheduledAt: new Date('2030-02-01T08:00:00Z'),
	})
	await createRecordedEffort(user.id, {
		discipline: 'bike',
		distanceM: 60_000,
		scheduledAt: new Date('2030-01-15T08:00:00Z'),
	})

	const records = await getPersonalRecords(user.id)
	const run = records.find((r) => r.discipline === 'run')
	expect(run).toMatchObject({
		value: 21_100,
		sessionId: longest.id,
		previousValue: 10_000,
		delta: 11_100,
	})
	expect(records.find((r) => r.discipline === 'bike')).toMatchObject({
		value: 60_000,
		previousValue: null,
		delta: null,
	})
})

test('excludes low-confidence efforts (the load trust gate, ADR 0008)', async () => {
	const user = await createAthlete()
	await createRecordedEffort(user.id, {
		discipline: 'run',
		distanceM: 12_000,
		scheduledAt: new Date('2030-01-01T08:00:00Z'),
		confidence: 'medium',
	})
	// A longer but RPE-only (low confidence) effort must not set the record.
	await createRecordedEffort(user.id, {
		discipline: 'run',
		distanceM: 30_000,
		scheduledAt: new Date('2030-02-01T08:00:00Z'),
		confidence: 'low',
	})

	const records = await getPersonalRecords(user.id)
	expect(records).toHaveLength(1)
	expect(records[0]).toMatchObject({ value: 12_000, delta: null })
})

test('excludes sessions that are not completed', async () => {
	const user = await createAthlete()
	await createRecordedEffort(user.id, {
		discipline: 'run',
		distanceM: 18_000,
		scheduledAt: new Date('2030-01-01T08:00:00Z'),
		status: 'scheduled',
	})
	expect(await getPersonalRecords(user.id)).toEqual([])
})

test("does not leak another athlete's records", async () => {
	const me = await createAthlete()
	const other = await createAthlete()
	await createRecordedEffort(other.id, {
		discipline: 'run',
		distanceM: 42_000,
		scheduledAt: new Date('2030-01-01T08:00:00Z'),
	})
	expect(await getPersonalRecords(me.id)).toEqual([])
})
