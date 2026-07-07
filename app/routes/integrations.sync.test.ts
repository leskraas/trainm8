import { http, HttpResponse } from 'msw'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './integrations.sync.tsx'

const ROUTE_PATH = '/integrations/sync'
const ACTION_ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

const STRAVA_ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities'
const ICU_ACTIVITIES_URL =
	'https://intervals.icu/api/v1/athlete/:athleteId/activities'
const ICU_STREAMS_URL = 'https://intervals.icu/api/v1/activity/:id/streams'

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

function connectStrava(userId: string, status = 'active') {
	return prisma.accountConnection.create({
		data: {
			athleteId: userId,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status,
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
}

function connectIntervalsIcu(userId: string, status = 'active') {
	return prisma.accountConnection.create({
		data: {
			athleteId: userId,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken: MOCK_INTERVALSICU_API_KEY,
			status,
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
}

async function request(session: { id: string }) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie: await getSessionCookieHeader(session) },
	})
}

test('one action syncs every active connection', async () => {
	const session = await setupUser()
	await connectStrava(session.userId)
	await connectIntervalsIcu(session.userId)
	server.use(
		http.get(STRAVA_ACTIVITIES_URL, () =>
			HttpResponse.json([
				{
					id: 8001,
					name: 'Strava Run',
					sport_type: 'Run',
					type: 'Run',
					distance: 10000,
					moving_time: 3000,
					elapsed_time: 3100,
					start_date: '2026-05-21T06:00:00Z',
				},
			]),
		),
		http.get(ICU_ACTIVITIES_URL, () =>
			HttpResponse.json([
				{
					id: 'i8002',
					name: 'Intervals Ride',
					type: 'Ride',
					distance: 40000,
					moving_time: 4800,
					elapsed_time: 5000,
					start_date: '2026-05-22T11:00:00Z',
				},
			]),
		),
		http.get(ICU_STREAMS_URL, () => new HttpResponse(null, { status: 404 })),
	)

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Synced',
			type: 'success',
			description: expect.stringContaining('2'),
		}),
	)
	const providers = (
		await prisma.activityImport.findMany({
			where: { athleteId: session.userId },
			select: { externalProvider: true },
		})
	)
		.map((i) => i.externalProvider)
		.sort()
	expect(providers).toEqual(['intervalsicu', 'strava'])
})

test('skips non-active connections rather than failing the whole action', async () => {
	const session = await setupUser()
	await connectStrava(session.userId, 'revoked')
	await connectIntervalsIcu(session.userId)
	let stravaFetched = false
	server.use(
		http.get(STRAVA_ACTIVITIES_URL, () => {
			stravaFetched = true
			return HttpResponse.json([])
		}),
		http.get(ICU_ACTIVITIES_URL, () => HttpResponse.json([])),
	)

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	await expect(response).toSendToast(
		expect.objectContaining({ title: 'Synced', type: 'success' }),
	)
	expect(stravaFetched).toBe(false)
})

test('asks the athlete to connect a source when nothing is active', async () => {
	const session = await setupUser()

	const response = await action({
		request: await request(session),
		...ACTION_ARGS_BASE,
	})

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Sync failed',
			type: 'error',
			description: expect.stringContaining('Connect a source'),
		}),
	)
})
