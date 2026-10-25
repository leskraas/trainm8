import { faker } from '@faker-js/faker/locale/en'
import { http, HttpResponse } from 'msw'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { STRAVA_OAUTH_STATE_COOKIE } from '#app/integrations/strava/oauth.server.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { INTEGRATION_TOAST_LABELS } from '#app/utils/labels.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as callback } from './integrations.strava.callback.tsx'
import { action as sync } from './integrations.strava.sync.tsx'
import { action as hubSync } from './integrations.sync.tsx'

/**
 * The request paths that call Strava answer at once when its read budget is
 * spent, and say when to try again (#638).
 */

const ARGS = { params: {}, context: {} as AppLoadContext }

/** Strava's answer once the day's reads are spent. */
const daySpent = () =>
	new HttpResponse(null, {
		status: 429,
		headers: {
			'X-ReadRateLimit-Limit': '100,1000',
			'X-ReadRateLimit-Usage': '30,1000',
		},
	})

/** The day resets at midnight UTC: about some hours from now, or minutes. */
const TRY_AGAIN_LATER = /Prøv igjen om (ca\. \d+ t|\d+ min)\.$/

async function setupUser() {
	return prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: { create: { ...createUser() } },
		},
		select: { id: true, userId: true },
	})
}

test('the rate-limited copy says when to try again, relative', () => {
	const now = new Date('2026-10-24T17:20:00Z')
	const T = INTEGRATION_TOAST_LABELS

	// Usually it's trainm8's own share of the budget that is spent, not
	// Strava's limit for the athlete: the copy says the sync quota is used up.
	expect(T.stravaRateLimited(new Date('2026-10-24T17:30:00Z'), now)).toBe(
		'Strava-kvoten for synk er brukt opp for nå. Prøv igjen om 10 min.',
	)
	// Over an hour, whole hours read better than "6 t 40 min".
	expect(T.stravaRateLimited(new Date('2026-10-25T00:00:00Z'), now)).toBe(
		'Strava-kvoten for synk er brukt opp for nå. Prøv igjen om ca. 7 t.',
	)
	expect(T.stravaRateLimited(new Date('2026-10-25T02:30:00Z'), now)).toBe(
		'Strava-kvoten for synk er brukt opp for nå. Prøv igjen om ca. 9 t.',
	)
	expect(T.stravaRateLimited(new Date('2026-10-24T18:20:00Z'), now)).toBe(
		'Strava-kvoten for synk er brukt opp for nå. Prøv igjen om ca. 1 t.',
	)
	// Never "om 0 min": a reset seconds away still reads as a minute.
	expect(T.stravaRateLimited(new Date('2026-10-24T17:20:05Z'), now)).toBe(
		'Strava-kvoten for synk er brukt opp for nå. Prøv igjen om 1 min.',
	)
})

test('the OAuth callback answers at once when the /athlete fetch is rate limited', async () => {
	server.use(
		http.post('https://www.strava.com/oauth/token', () =>
			HttpResponse.json({
				token_type: 'Bearer',
				access_token: 'mock_access_no_athlete',
				refresh_token: 'mock_refresh_token',
				expires_at: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
			}),
		),
		http.get('https://www.strava.com/api/v3/athlete', daySpent),
	)
	const session = await setupUser()
	const state = faker.string.uuid()
	const url = new URL('/integrations/strava/callback', BASE_URL)
	url.searchParams.set('code', faker.string.uuid())
	url.searchParams.set('state', state)
	url.searchParams.set('scope', 'read,activity:read_all')
	const request = new Request(url.toString(), {
		headers: {
			cookie: `${await getSessionCookieHeader(session)}; ${STRAVA_OAUTH_STATE_COOKIE}=${state}`,
		},
	})

	const response = await callback({
		request,
		...ARGS,
		unstable_pattern: '/integrations/strava/callback',
	})

	expect(response).toHaveRedirect('/settings/integrations')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Kunne ikke koble til Strava',
			description: expect.stringMatching(TRY_AGAIN_LATER),
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

test('a rate-limited manual sync says when to try again', async () => {
	server.use(
		http.get('https://www.strava.com/api/v3/athlete/activities', daySpent),
	)
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
	const request = new Request(
		new URL('/integrations/strava/sync', BASE_URL).toString(),
		{
			method: 'POST',
			headers: { cookie: await getSessionCookieHeader(session) },
		},
	)

	const response = await sync({
		request,
		...ARGS,
		unstable_pattern: '/integrations/strava/sync',
	})

	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Synkroniseringen feilet',
			description: expect.stringMatching(TRY_AGAIN_LATER),
			type: 'error',
		}),
	)
})

test("the hub's Sync now says when to try again when Strava is rate limited", async () => {
	server.use(
		http.get('https://www.strava.com/api/v3/athlete/activities', daySpent),
	)
	const session = await setupUser()
	await prisma.accountConnection.create({
		data: {
			athleteId: session.userId,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	const request = new Request(
		new URL('/integrations/sync', BASE_URL).toString(),
		{
			method: 'POST',
			headers: { cookie: await getSessionCookieHeader(session) },
		},
	)

	const response = await hubSync({
		request,
		...ARGS,
		unstable_pattern: '/integrations/sync',
	})

	expect(response).toHaveRedirect('/settings/integrations')
	await expect(response).toSendToast(
		expect.objectContaining({
			title: 'Synkroniseringen feilet',
			description: expect.stringMatching(TRY_AGAIN_LATER),
			type: 'error',
		}),
	)
})
