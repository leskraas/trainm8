import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './integrations.intervalsicu.sync.tsx'

const ROUTE_PATH = '/integrations/intervalsicu/sync'
const ACTION_ARGS_BASE = {
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

async function connect(userId: string, accessToken = MOCK_INTERVALSICU_API_KEY) {
	return prisma.accountConnection.create({
		data: {
			athleteId: userId,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken,
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
}

async function request(session: { id: string }, search = '') {
	return new Request(new URL(ROUTE_PATH + search, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie: await getSessionCookieHeader(session) },
	})
}

test('syncs a connected athlete on demand and reports success', async () => {
	const session = await setupUser()
	await connect(session.userId)

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Synced with Intervals.icu',
			type: 'success',
		}),
	)
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: session.userId, externalProvider: 'intervalsicu' },
	})
	expect(imports.length).toBeGreaterThan(0)
})

test('the hub can ask to land back on the hub after syncing', async () => {
	const session = await setupUser()
	await connect(session.userId)

	const response = await action({
		request: await request(session, '?redirectTo=/settings/integrations'),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/settings/integrations')
})

test('a rejected key flips the connection to revoked and asks for a new key', async () => {
	const session = await setupUser()
	const connection = await connect(session.userId, 'regenerated_away_key')

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Sync failed',
			type: 'error',
			description: expect.stringContaining('paste a new one'),
		}),
	)
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.status).toBe('revoked')
})

test('asks the athlete to connect first when there is no connection', async () => {
	const session = await setupUser()

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Sync failed',
			type: 'error',
			description: expect.stringContaining('Connect your Intervals.icu'),
		}),
	)
})
