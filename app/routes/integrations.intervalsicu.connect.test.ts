import { invariant } from '@epic-web/invariant'
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
import { action } from './integrations.intervalsicu.connect.tsx'

const ROUTE_PATH = '/integrations/intervalsicu/connect'
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

async function setupRequest({
	session,
	apiKey,
}: {
	session: { id: string }
	apiKey: string
}) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const body = new URLSearchParams({ apiKey })
	return new Request(url.toString(), {
		method: 'POST',
		headers: {
			cookie: await getSessionCookieHeader(session),
			'content-type': 'application/x-www-form-urlencoded',
		},
		body,
	})
}

function findConnection(athleteId: string) {
	return prisma.accountConnection.findUnique({
		where: { athleteId_provider: { athleteId, provider: 'intervalsicu' } },
	})
}

test('valid key creates an active Intervals.icu Account Connection and enqueues the backfill', async () => {
	const session = await setupUser()
	const request = await setupRequest({
		session,
		apiKey: MOCK_INTERVALSICU_API_KEY,
	})

	const response = await action({ request, ...ACTION_ARGS_BASE })

	expect(response).toHaveRedirect('/settings/integrations')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Connected to Intervals.icu',
			type: 'success',
		}),
	)

	const connection = await findConnection(session.userId)
	invariant(connection, 'expected an Account Connection to be created')
	expect(connection.status).toBe('active')
	expect(connection.externalAthleteId).toBe(MOCK_INTERVALSICU_ATHLETE_ID)
	// The API key is the credential: stored in accessToken, no rotation, no
	// expiry (ADR 0026 #4).
	expect(connection.accessToken).toBe(MOCK_INTERVALSICU_API_KEY)
	expect(connection.refreshToken).toBeNull()
	expect(connection.expiresAt).toBeNull()

	const jobs = await prisma.job.findMany({
		where: { kind: 'intervalsicu-backfill' },
	})
	expect(jobs).toHaveLength(1)
	expect(JSON.parse(jobs[0]!.payload)).toEqual({ athleteId: session.userId })
	expect(jobs[0]!.status).toBe('pending')
})

test('rejected key returns an inline error and stores nothing', async () => {
	const session = await setupUser()
	const request = await setupRequest({ session, apiKey: 'not-a-real-key' })

	const result = await action({ request, ...ACTION_ARGS_BASE })

	invariant(
		result && typeof result === 'object' && 'data' in result,
		'expected an inline form error, not a redirect',
	)
	expect(result.data.error).toMatch(/Intervals\.icu rejected/i)
	// Regenerating a key at Intervals.icu invalidates the old one — the error
	// must say so, since a stale key is the most likely cause.
	expect(result.data.error).toMatch(/new key|regenerat/i)

	expect(await findConnection(session.userId)).toBeNull()
	expect(
		await prisma.job.count({ where: { kind: 'intervalsicu-backfill' } }),
	).toBe(0)
})

test('an empty key fails inline without calling Intervals.icu', async () => {
	const session = await setupUser()
	const request = await setupRequest({ session, apiKey: '   ' })

	const result = await action({ request, ...ACTION_ARGS_BASE })

	invariant(
		result && typeof result === 'object' && 'data' in result,
		'expected an inline form error, not a redirect',
	)
	expect(result.data.error).toBeTruthy()
	expect(await findConnection(session.userId)).toBeNull()
})

test('an Intervals.icu outage fails inline as a temporary problem, storing nothing', async () => {
	server.use(
		http.get(
			'https://intervals.icu/api/v1/athlete/0',
			() => new HttpResponse('boom', { status: 500 }),
		),
	)
	const session = await setupUser()
	const request = await setupRequest({
		session,
		apiKey: MOCK_INTERVALSICU_API_KEY,
	})

	const result = await action({ request, ...ACTION_ARGS_BASE })

	invariant(
		result && typeof result === 'object' && 'data' in result,
		'expected an inline form error, not a redirect',
	)
	// Not the athlete's fault: must not blame the key.
	expect(result.data.error).not.toMatch(/rejected/i)
	expect(await findConnection(session.userId)).toBeNull()
})

test('reconnect after revocation re-activates the same row, no duplicates', async () => {
	const session = await setupUser()
	const revoked = await prisma.accountConnection.create({
		data: {
			athleteId: session.userId,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken: 'old-regenerated-away-key',
			status: 'revoked',
		},
	})

	const request = await setupRequest({
		session,
		apiKey: MOCK_INTERVALSICU_API_KEY,
	})
	const response = await action({ request, ...ACTION_ARGS_BASE })

	expect(response).toHaveRedirect('/settings/integrations')

	const connections = await prisma.accountConnection.findMany({
		where: { athleteId: session.userId, provider: 'intervalsicu' },
	})
	expect(connections).toHaveLength(1)
	expect(connections[0]!.id).toBe(revoked.id)
	expect(connections[0]!.status).toBe('active')
	expect(connections[0]!.accessToken).toBe(MOCK_INTERVALSICU_API_KEY)
})
