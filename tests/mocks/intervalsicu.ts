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
]

export const passthroughHandlers: Array<HttpHandler> = [
	http.all('https://intervals.icu/*', () => passthrough()),
]
