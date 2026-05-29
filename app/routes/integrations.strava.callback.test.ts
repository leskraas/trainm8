import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { STRAVA_OAUTH_STATE_COOKIE } from '#app/integrations/strava/oauth.server.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './integrations.strava.callback.tsx'

const ROUTE_PATH = '/integrations/strava/callback'
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

async function setupRequest({
	session,
	code = faker.string.uuid(),
	state = faker.string.uuid(),
	cookieState = state,
	error,
}: {
	session: { id: string }
	code?: string | null
	state?: string | null
	cookieState?: string | null
	error?: string
}) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	if (code != null) url.searchParams.set('code', code)
	if (state != null) url.searchParams.set('state', state)
	if (error) url.searchParams.set('error', error)

	const sessionCookie = await getSessionCookieHeader(session)
	const cookies = [sessionCookie]
	if (cookieState != null) {
		cookies.push(`${STRAVA_OAUTH_STATE_COOKIE}=${cookieState}`)
	}
	return new Request(url.toString(), {
		method: 'GET',
		headers: { cookie: cookies.join('; ') },
	})
}

test('happy path: persists an active Strava Account Connection', async () => {
	const session = await setupUser()
	const request = await setupRequest({ session })

	const response = await loader({ request, ...LOADER_ARGS_BASE })

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({ title: 'Connected to Strava', type: 'success' }),
	)

	const connection = await prisma.accountConnection.findUnique({
		where: {
			athleteId_provider: { athleteId: session.userId, provider: 'strava' },
		},
	})
	invariant(connection, 'expected an Account Connection to be created')
	expect(connection.status).toBe('active')
	expect(connection.externalAthleteId).toBe('12345678')
	expect(connection.accessToken).toBeTruthy()
	expect(connection.refreshToken).toBeTruthy()
	expect(connection.connectedAt).toBeInstanceOf(Date)
})

test('enqueues a strava-backfill job for the athlete on connect', async () => {
	const session = await setupUser()
	const request = await setupRequest({ session })

	await loader({ request, ...LOADER_ARGS_BASE })

	const jobs = await prisma.job.findMany({ where: { kind: 'strava-backfill' } })
	expect(jobs).toHaveLength(1)
	expect(JSON.parse(jobs[0]!.payload)).toEqual({ athleteId: session.userId })
	expect(jobs[0]!.status).toBe('pending')
})

test('rejects a state mismatch (CSRF) without creating a connection', async () => {
	const session = await setupUser()
	const request = await setupRequest({
		session,
		state: 'returned-state',
		cookieState: 'different-cookie-state',
	})

	const response = await loader({ request, ...LOADER_ARGS_BASE })

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Strava connection failed',
			type: 'error',
		}),
	)
	const connection = await prisma.accountConnection.findUnique({
		where: {
			athleteId_provider: { athleteId: session.userId, provider: 'strava' },
		},
	})
	expect(connection).toBeNull()
})

test('handles a non-200 from the Strava token exchange', async () => {
	server.use(
		http.post('https://www.strava.com/oauth/token', () =>
			HttpResponse.json({ message: 'Bad Request' }, { status: 400 }),
		),
	)
	const session = await setupUser()
	const request = await setupRequest({ session })

	const response = await loader({ request, ...LOADER_ARGS_BASE })

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Strava connection failed',
			type: 'error',
		}),
	)
	const connection = await prisma.accountConnection.findUnique({
		where: {
			athleteId_provider: { athleteId: session.userId, provider: 'strava' },
		},
	})
	expect(connection).toBeNull()
	// no console.error expected — the failure is handled gracefully
	expect(consoleError).not.toHaveBeenCalled()
})

test('denied consent at Strava redirects with an error toast', async () => {
	const session = await setupUser()
	const request = await setupRequest({ session, error: 'access_denied' })

	const response = await loader({ request, ...LOADER_ARGS_BASE })

	expect(response).toHaveRedirect('/imports')
	await expect(response).toSendToast(expect.objectContaining({ type: 'error' }))
})
