import { http, HttpResponse } from 'msw'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './integrations.strava.sync.tsx'

const ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities'

const ROUTE_PATH = '/integrations/strava/sync'
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

async function request(session: { id: string }) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie: await getSessionCookieHeader(session) },
	})
}

test('syncs a connected athlete and reports success', async () => {
	const session = await setupUser()
	await prisma.accountConnection.create({
		data: {
			athleteId: session.userId,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({ title: 'Synced with Strava', type: 'success' }),
	)
	const imports = await prisma.activityImport.findMany({
		where: { athleteId: session.userId },
	})
	expect(imports.length).toBeGreaterThan(0)
})

test('surfaces a reconnect toast when Strava 403s on activities (missing scope)', async () => {
	const session = await setupUser()
	await prisma.accountConnection.create({
		data: {
			athleteId: session.userId,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	server.use(
		http.get(ACTIVITIES_URL, () => new HttpResponse(null, { status: 403 })),
	)

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Sync failed',
			type: 'error',
			description: expect.stringContaining('activity access'),
		}),
	)
})

test('surfaces an app-inactive toast (not a reconnect prompt) on that 403', async () => {
	const session = await setupUser()
	await prisma.accountConnection.create({
		data: {
			athleteId: session.userId,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json(
				{
					message: 'Forbidden',
					errors: [
						{ resource: 'Application', field: 'Status', code: 'Inactive' },
					],
				},
				{ status: 403 },
			),
		),
	)

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Sync failed',
			type: 'error',
			description: expect.stringContaining('inactive'),
		}),
	)
})

test('reports an error when the athlete is not connected', async () => {
	const session = await setupUser()

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({ title: 'Sync failed', type: 'error' }),
	)
})
