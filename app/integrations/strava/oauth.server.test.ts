import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '#tests/mocks/index.ts'
import { connectStravaAccount } from './oauth.server.ts'

test('connectStravaAccount returns domain connection metadata, not Strava JSON', async () => {
	const connection = await connectStravaAccount('auth-code-123')

	// Domain shape: externalAthleteId + tokens + a real Date expiry — never the
	// parsed Strava `/athlete` wire object.
	expect(connection).toEqual({
		externalAthleteId: '12345678',
		accessToken: 'mock_access_auth-code-123',
		refreshToken: 'mock_refresh_token',
		expiresAt: expect.any(Date),
	})
})

test('connectStravaAccount falls back to the /athlete fetch when no inline athlete', async () => {
	// Token exchange without the inline athlete summary forces the follow-up
	// `/athlete` lookup; the wire shape stays contained inside this module.
	server.use(
		http.post('https://www.strava.com/oauth/token', () => {
			const nowSec = Math.floor(Date.now() / 1000)
			return HttpResponse.json({
				token_type: 'Bearer',
				access_token: 'mock_access_no_athlete',
				refresh_token: 'mock_refresh_token',
				expires_at: nowSec + 6 * 60 * 60,
			})
		}),
		http.get('https://www.strava.com/api/v3/athlete', () =>
			HttpResponse.json({ id: 99887766, username: 'fetched_athlete' }),
		),
	)

	const connection = await connectStravaAccount('auth-code-456')

	expect(connection.externalAthleteId).toBe('99887766')
	expect(connection.accessToken).toBe('mock_access_no_athlete')
	expect(connection.expiresAt).toBeInstanceOf(Date)
})
