import { invariant } from '@epic-web/invariant'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import {
	STRAVA_OAUTH_STATE_COOKIE,
} from '#app/integrations/strava/oauth.server.ts'
import { STRAVA_SCOPE } from '#app/integrations/strava/types.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './integrations.strava.connect.tsx'

const ROUTE_PATH = '/integrations/strava/connect'
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

test('redirects to Strava authorize with scope and a CSRF state cookie', async () => {
	const session = await setupUser()
	const request = new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie: await getSessionCookieHeader(session) },
	})

	const response = await action({ request, ...ACTION_ARGS_BASE })
	invariant(response instanceof Response, 'expected a redirect Response')

	const location = response.headers.get('location')
	invariant(location, 'expected a Location header')
	const redirectUrl = new URL(location)
	expect(redirectUrl.origin + redirectUrl.pathname).toBe(
		'https://www.strava.com/oauth/authorize',
	)
	expect(redirectUrl.searchParams.get('scope')).toBe(STRAVA_SCOPE)
	expect(redirectUrl.searchParams.get('response_type')).toBe('code')
	const state = redirectUrl.searchParams.get('state')
	invariant(state, 'expected a state param')

	const setCookie = response.headers.get('set-cookie')
	invariant(setCookie, 'expected a Set-Cookie header')
	expect(setCookie).toContain(`${STRAVA_OAUTH_STATE_COOKIE}=${state}`)
	expect(setCookie.toLowerCase()).toContain('httponly')
})
