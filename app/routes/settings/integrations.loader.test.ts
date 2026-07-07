import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './integrations.tsx'

const ROUTE_PATH = '/settings/integrations'
const LOADER_ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

async function setupUser() {
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: { create: { ...createUser() } },
		},
		select: { id: true, userId: true },
	})
	return session
}

async function runLoader(session: { id: string }) {
	return loader({
		request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
			headers: { cookie: await getSessionCookieHeader(session) },
		}),
		...LOADER_ARGS_BASE,
	})
}

function connectionData(userId: string) {
	return {
		athleteId: userId,
		provider: 'strava',
		externalAthleteId: '12345678',
		accessToken: 'tok',
		refreshToken: 'ref',
		expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
	}
}

test('reports a connected Strava with its last-sync time', async () => {
	const session = await setupUser()
	const lastSyncedAt = new Date('2026-07-06T18:04:00.000Z')
	await prisma.accountConnection.create({
		data: {
			...connectionData(session.userId),
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
			backfillCompletedAt: new Date('2026-05-01T00:05:00.000Z'),
			lastSyncedAt,
		},
	})

	const { strava } = await runLoader(session)

	expect(strava.status).toBe('connected')
	expect(strava.lastSyncedAt).toBe(lastSyncedAt.toISOString())
})

test('reports "backfilling" while the initial Backfill Window is running', async () => {
	const session = await setupUser()
	await prisma.accountConnection.create({
		data: {
			...connectionData(session.userId),
			connectedAt: new Date(), // just connected, backfill not yet completed
		},
	})

	const { strava } = await runLoader(session)

	expect(strava.status).toBe('backfilling')
})

test('reports "revoked" (needs re-authorization) for a revoked connection', async () => {
	const session = await setupUser()
	await prisma.accountConnection.create({
		data: {
			...connectionData(session.userId),
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
			status: 'revoked',
		},
	})

	const { strava } = await runLoader(session)

	expect(strava.status).toBe('revoked')
})

test('reports "disconnected" when the athlete has no Strava connection', async () => {
	const session = await setupUser()

	const { strava } = await runLoader(session)

	expect(strava.status).toBe('disconnected')
	expect(strava.lastSyncedAt).toBeNull()
})

function intervalsIcuConnectionData(userId: string) {
	return {
		athleteId: userId,
		provider: 'intervalsicu',
		externalAthleteId: 'i9876543',
		accessToken: 'personal-api-key',
	}
}

test('reports "backfilling" while the Intervals.icu Backfill Window is running (#204)', async () => {
	const session = await setupUser()
	await prisma.accountConnection.create({
		data: {
			...intervalsIcuConnectionData(session.userId),
			connectedAt: new Date(), // just connected, backfill not yet completed
		},
	})

	const { intervalsicu } = await runLoader(session)

	expect(intervalsicu.status).toBe('backfilling')
})

test('settles to connected + last-sync once the Intervals.icu backfill completes', async () => {
	const session = await setupUser()
	const lastSyncedAt = new Date('2026-07-06T18:04:00.000Z')
	await prisma.accountConnection.create({
		data: {
			...intervalsIcuConnectionData(session.userId),
			connectedAt: new Date('2026-07-01T00:00:00.000Z'),
			backfillCompletedAt: new Date('2026-07-01T00:05:00.000Z'),
			lastSyncedAt,
		},
	})

	const { intervalsicu } = await runLoader(session)

	expect(intervalsicu.status).toBe('connected')
	expect(intervalsicu.lastSyncedAt).toBe(lastSyncedAt.toISOString())
})
