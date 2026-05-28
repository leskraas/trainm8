import { http, HttpResponse, type HttpHandler } from 'msw'

const { json } = HttpResponse

/**
 * Default happy-path Strava mocks. Tests override these with `server.use(...)`
 * to exercise error branches (e.g. a non-200 token exchange).
 */
export const handlers: Array<HttpHandler> = [
	http.post('https://www.strava.com/oauth/token', async ({ request }) => {
		const body = (await request.json().catch(() => ({}))) as Record<
			string,
			unknown
		>
		const nowSec = Math.floor(Date.now() / 1000)
		return json({
			token_type: 'Bearer',
			access_token: `mock_access_${body.code ?? body.refresh_token ?? 'token'}`,
			refresh_token: 'mock_refresh_token',
			expires_at: nowSec + 6 * 60 * 60,
			athlete: { id: 12345678, username: 'mock_athlete' },
		})
	}),

	http.get('https://www.strava.com/api/v3/athlete', () =>
		json({ id: 12345678, username: 'mock_athlete' }),
	),
]
