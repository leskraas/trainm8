import fs from 'node:fs'
import path from 'node:path'
import { http, HttpResponse, passthrough, type HttpHandler } from 'msw'

/**
 * Polar AccessLink mocks (ADR 0108): one run exercise whose FIT is the
 * `run-with-laps.fit` fixture. Tests override with `server.use(...)`.
 */
export const MOCK_POLAR_EXERCISE_ID = 'aQlC83'

const API = 'https://www.polaraccesslink.com/v3'

function fixtureFit() {
	return fs.readFileSync(
		path.join(process.cwd(), 'tests', 'fixtures', 'fit', 'run-with-laps.fit'),
	)
}

export const handlers: Array<HttpHandler> = [
	http.post('https://polarremote.com/v2/oauth2/token', () =>
		HttpResponse.json({
			access_token: 'mock_polar_access_token',
			token_type: 'bearer',
			expires_in: 31535999,
			x_user_id: 475,
		}),
	),
	http.post(`${API}/users`, () =>
		HttpResponse.json({ 'polar-user-id': 475, 'member-id': 'mock' }),
	),
	http.get(`${API}/exercises`, () =>
		HttpResponse.json([{ id: MOCK_POLAR_EXERCISE_ID, sport: 'RUNNING' }]),
	),
	http.get(`${API}/exercises/:id/fit`, ({ params }) =>
		params.id === MOCK_POLAR_EXERCISE_ID
			? new HttpResponse(fixtureFit(), {
					headers: { 'content-type': 'application/octet-stream' },
				})
			: new HttpResponse(null, { status: 404 }),
	),
]

export const passthroughHandlers: Array<HttpHandler> = [
	http.all('https://www.polaraccesslink.com/*', () => passthrough()),
	http.all('https://polarremote.com/*', () => passthrough()),
]
