import { http, HttpResponse, passthrough, type HttpHandler } from 'msw'

const { json } = HttpResponse

/**
 * The API key the default happy-path mock accepts. Intervals.icu personal API
 * keys authenticate with HTTP Basic — username `API_KEY`, password = the key
 * (ADR 0026 #3) — so the mock checks the Authorization header the way the
 * real API would and 401s on anything else. Tests exercising the rejected-key
 * branch just send a different key.
 */
export const MOCK_INTERVALSICU_API_KEY = 'mock_intervalsicu_key'

/** The external athlete id the mocked athlete-self endpoint reports. */
export const MOCK_INTERVALSICU_ATHLETE_ID = 'i9876543'

function authorizedKey(request: Request): string | null {
	const header = request.headers.get('authorization')
	if (!header?.startsWith('Basic ')) return null
	let decoded: string
	try {
		decoded = atob(header.slice('Basic '.length))
	} catch {
		return null
	}
	const separator = decoded.indexOf(':')
	if (separator === -1) return null
	const username = decoded.slice(0, separator)
	if (username !== 'API_KEY') return null
	return decoded.slice(separator + 1)
}

/**
 * The activity list's `oldest`/`newest` are "Local ISO-8601 date or date and
 * time e.g. 2019-07-22T16:18:49 or 2019-07-22" per the real API's OpenAPI
 * docs — no zone suffix, no milliseconds. The real API 422s on anything else
 * (notably `Date.toISOString()` output), so the mock does too and returns the
 * offending parameter name.
 */
const LOCAL_ISO_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/

function rejectedWindowParam(request: Request): string | null {
	const params = new URL(request.url).searchParams
	for (const name of ['oldest', 'newest']) {
		const value = params.get(name)
		if (value != null && !LOCAL_ISO_DATE_OR_DATE_TIME.test(value)) {
			return `${name}=${value}`
		}
	}
	return null
}

/**
 * Default happy-path Intervals.icu mocks. Tests override these with
 * `server.use(...)` to exercise other branches (e.g. a 5xx outage).
 */
export const handlers: Array<HttpHandler> = [
	// Athlete-self: `/athlete/0` resolves to the athlete who owns the key.
	http.get('https://intervals.icu/api/v1/athlete/0', ({ request }) => {
		const key = authorizedKey(request)
		if (key !== MOCK_INTERVALSICU_API_KEY) {
			return new HttpResponse('Unauthorized', { status: 401 })
		}
		return json({ id: MOCK_INTERVALSICU_ATHLETE_ID, name: 'Mock Athlete' })
	}),

	// Default activity list for the Backfill Window (#204): the `oldest`/
	// `newest` window parameters replace pagination. Spans multiple
	// disciplines, including one unmodeled type ('Yoga' → 'other'), and carries
	// Intervals.icu's computed load fields so tests can prove they are never
	// imported. Tests override this to exercise window/count-target branches.
	http.get(
		'https://intervals.icu/api/v1/athlete/:athleteId/activities',
		({ request }) => {
			const key = authorizedKey(request)
			if (key !== MOCK_INTERVALSICU_API_KEY) {
				return new HttpResponse('Unauthorized', { status: 401 })
			}
			const badWindowParam = rejectedWindowParam(request)
			if (badWindowParam) {
				return json(
					{ status: 422, error: `Unable to parse ${badWindowParam}` },
					{ status: 422 },
				)
			}
			return json([
				{
					id: 'i2001',
					name: 'Morning Run',
					type: 'Run',
					distance: 10000,
					moving_time: 3000,
					elapsed_time: 3100,
					start_date: '2026-05-20T06:00:00Z',
					start_date_local: '2026-05-20T08:00:00',
					average_heartrate: 150,
					max_heartrate: 178,
					average_cadence: 86,
					total_elevation_gain: 120,
					max_speed: 4.8,
					// Computed-at-source load numbers: must never be imported.
					icu_training_load: 87,
					icu_ctl: 54.2,
					icu_atl: 61.9,
				},
				{
					id: 'i2002',
					name: 'Lunch Ride',
					type: 'Ride',
					distance: 40000,
					moving_time: 4800,
					elapsed_time: 5000,
					start_date: '2026-05-21T11:00:00Z',
					icu_average_watts: 210,
					max_watts: 540,
					icu_weighted_avg_watts: 235,
					icu_joules: 1008000,
					total_elevation_gain: 410,
				},
				{
					id: 'i2003',
					name: 'Pool Swim',
					type: 'Swim',
					distance: 2000,
					moving_time: 2400,
					elapsed_time: 2500,
					start_date: '2026-05-22T07:00:00Z',
				},
				{
					id: 'i2004',
					name: 'Evening Yoga',
					type: 'Yoga',
					moving_time: 3600,
					elapsed_time: 3600,
					start_date: '2026-05-23T17:00:00Z',
				},
			])
		},
	),

	// Default activity streams: `{ type, data }` channels with a 15-minute
	// warmup/main/cooldown HR profile so phase-bar derivation has multiple
	// zones to coalesce. Tests override to exercise power/absent-stream
	// branches.
	http.get(
		'https://intervals.icu/api/v1/activity/:id/streams',
		({ request }) => {
			const key = authorizedKey(request)
			if (key !== MOCK_INTERVALSICU_API_KEY) {
				return new HttpResponse('Unauthorized', { status: 401 })
			}
			const time: number[] = []
			const heartrate: number[] = []
			for (let t = 0; t < 900; t++) {
				time.push(t)
				heartrate.push(t < 300 ? 120 : t < 600 ? 168 : 110)
			}
			return json([
				{ type: 'time', data: time },
				{ type: 'heartrate', data: heartrate },
			])
		},
	),

	// Default interval breakdown (#356): none, so lap ingest is exercised (no
	// real-network leak) but yields no markers. Tests that need an interval
	// breakdown override this handler.
	http.get(
		'https://intervals.icu/api/v1/activity/:id/intervals',
		({ request }) => {
			const key = authorizedKey(request)
			if (key !== MOCK_INTERVALSICU_API_KEY) {
				return new HttpResponse('Unauthorized', { status: 401 })
			}
			return json({ icu_intervals: [] })
		},
	),
]

export const passthroughHandlers: Array<HttpHandler> = [
	http.all('https://intervals.icu/*', () => passthrough()),
]
