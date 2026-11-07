import { http, HttpResponse, passthrough, type HttpHandler } from 'msw'

/**
 * MET Norway's Locationforecast 2.0 `compact` (ADR 0113), mocked: a forecast
 * shaped like MET's own — hourly steps for 60 hours, then 6-hourly to about
 * nine days — from a fixed pattern, so a test knows every value. Mocked in
 * tests; in dev only with `MOCK_WEATHER=true` (else the real MET answers).
 *
 * A test with a fixed clock builds its own with `metForecastHandler({ from })`;
 * the default answers from the current hour.
 */
export const MET_FORECAST_URL =
	'https://api.met.no/weatherapi/locationforecast/2.0/compact'

const HOUR_MS = 60 * 60 * 1000
const HOURLY_STEPS = 60
const SIX_HOURLY_STEPS = 26

/** MET symbol codes the pattern walks through, one per step. */
const SYMBOLS = [
	'partlycloudy_day',
	'lightrain',
	'cloudy',
	'rain',
	'clearsky_day',
	'heavysnowshowersandthunder_day',
	'fog',
	'fair_night',
] as const
const PRECIPITATION = [0, 0.6, 0, 2.4, 0, 12.4, 0, 0] as const

/** The pattern's step `index`: what the mock says for it. */
export function mockStep(index: number) {
	const at = index % SYMBOLS.length
	return {
		symbolCode: SYMBOLS[at]!,
		precipitationMm: PRECIPITATION[at]!,
		temperatureC: Math.round((6 - (index % 30)) * 10) / 10,
	}
}

export function metForecast(from: Date) {
	const start = Math.floor(from.getTime() / HOUR_MS) * HOUR_MS
	const timeseries = []
	for (let index = 0; index < HOURLY_STEPS + SIX_HOURLY_STEPS; index++) {
		const hourly = index < HOURLY_STEPS
		const time = hourly
			? start + index * HOUR_MS
			: start + (HOURLY_STEPS + (index - HOURLY_STEPS) * 6) * HOUR_MS
		const step = mockStep(index)
		const period = {
			summary: { symbol_code: step.symbolCode },
			details: { precipitation_amount: step.precipitationMm },
		}
		timeseries.push({
			time: new Date(time).toISOString().replace('.000Z', 'Z'),
			data: {
				instant: { details: { air_temperature: step.temperatureC } },
				...(hourly ? { next_1_hours: period } : {}),
				next_6_hours: period,
			},
		})
	}
	return {
		type: 'Feature',
		geometry: { type: 'Point', coordinates: [10.47, 61.12, 180] },
		properties: {
			meta: { updated_at: new Date(start).toISOString() },
			timeseries,
		},
	}
}

/**
 * A handler answering MET's forecast from `from` (default: the hour of each
 * request), with MET's cache headers. MET refuses a client that does not say
 * who it is (its terms), and so does the mock.
 */
export function metForecastHandler({
	from,
	expiresInMs = 30 * 60 * 1000,
}: {
	from?: Date
	expiresInMs?: number
} = {}): HttpHandler {
	return http.get(MET_FORECAST_URL, ({ request }) => {
		if (!request.headers.get('user-agent')?.startsWith('trainm8/')) {
			return new HttpResponse(null, { status: 403 })
		}
		const start = from ?? new Date()
		return HttpResponse.json(metForecast(start), {
			headers: {
				Expires: new Date(Date.now() + expiresInMs).toUTCString(),
				'Last-Modified': start.toUTCString(),
			},
		})
	})
}

export const handlers: Array<HttpHandler> = [metForecastHandler()]

export const passthroughHandlers: Array<HttpHandler> = [
	http.all('https://api.met.no/*', () => passthrough()),
]
