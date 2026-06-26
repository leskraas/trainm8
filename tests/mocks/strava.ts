import { http, HttpResponse, passthrough, type HttpHandler } from 'msw'

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

	// Default activity feed spanning multiple disciplines, including one
	// unmodeled type ('Hike' → 'other'). Tests override this to exercise
	// pagination, 401-refresh, and revoked branches.
	http.get('https://www.strava.com/api/v3/athlete/activities', () =>
		json([
			{
				id: 1001,
				name: 'Morning Run',
				sport_type: 'Run',
				type: 'Run',
				distance: 10000,
				moving_time: 3000,
				elapsed_time: 3100,
				start_date: '2026-05-20T06:00:00Z',
				average_heartrate: 150,
				max_heartrate: 178,
				average_cadence: 86,
				total_elevation_gain: 120,
				max_speed: 4.8,
				// An unmodeled field: it must survive into rawJson verbatim.
				kudos_count: 7,
				map: { summary_polyline: 'abc' },
			},
			{
				id: 1002,
				name: 'Lunch Ride',
				sport_type: 'Ride',
				type: 'Ride',
				distance: 40000,
				moving_time: 4800,
				elapsed_time: 5000,
				start_date: '2026-05-21T11:00:00Z',
				average_watts: 210,
				max_watts: 540,
				weighted_average_watts: 235,
				kilojoules: 1008,
				total_elevation_gain: 410,
			},
			{
				id: 1003,
				name: 'Pool Swim',
				sport_type: 'Swim',
				type: 'Swim',
				distance: 2000,
				moving_time: 2400,
				elapsed_time: 2500,
				start_date: '2026-05-22T07:00:00Z',
			},
			{
				id: 1004,
				name: 'Evening Hike',
				sport_type: 'Hike',
				type: 'Hike',
				distance: 6000,
				moving_time: 5400,
				elapsed_time: 6000,
				start_date: '2026-05-23T17:00:00Z',
			},
		]),
	),
]

/**
 * Let every Strava request reach the real API instead of being mocked. Used in
 * local dev (`MOCKS=true` but `MOCK_STRAVA` unset) so the genuine OAuth + sync
 * flow runs against strava.com while the other integrations stay mocked.
 * Explicit `passthrough()` keeps these requests off the `onUnhandledRequest`
 * warning path.
 */
export const passthroughHandlers: Array<HttpHandler> = [
	http.all('https://www.strava.com/*', () => passthrough()),
]
