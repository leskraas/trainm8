import { delay, http, HttpResponse } from 'msw'
import { afterEach, expect, test } from 'vitest'
import { cache, lruCache } from '#app/utils/cache.server.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MET_FORECAST_URL,
	metForecast,
	metForecastHandler,
	mockStep,
} from '#tests/mocks/met-norway.ts'
import {
	FORECAST_BACKOFF_MS,
	FORECAST_STALE_MS,
	forecastBackoffKey,
	forecastCacheKey,
	readDayForecasts,
} from './forecast.server.ts'

const HOUR = 60 * 60 * 1000
const START = new Date(Math.floor(Date.now() / HOUR) * HOUR)
const at = (hours: number) => new Date(START.getTime() + hours * HOUR)

const used: { latitude: number; longitude: number }[] = []
let next = 0
/** A point of its own per test, so no test reads another's cache. */
function freshPoint() {
	const point = { latitude: 60 + next++ / 10, longitude: 10.123 }
	used.push(point)
	return point
}
afterEach(async () => {
	for (const point of used.splice(0)) {
		await cache.delete(forecastCacheKey(point))
		lruCache.delete(forecastBackoffKey(point))
	}
})

function countRequests() {
	const seen: Request[] = []
	const listener = ({ request }: { request: Request }) => {
		if (request.url.startsWith(MET_FORECAST_URL)) seen.push(request.clone())
	}
	server.events.on('request:start', listener)
	return {
		seen,
		stop: () => server.events.removeListener('request:start', listener),
	}
}

test('each day reads the one step covering its hour: hourly near, 6-hourly far (precipitation per hour), nothing beyond', async () => {
	server.use(metForecastHandler({ from: START }))
	const forecasts = await readDayForecasts(
		freshPoint(),
		new Map([
			['near', at(3)],
			['far', at(70)],
			['night', at(7)],
			['beyond', at(300)],
		]),
	)
	expect(forecasts.get('near')).toEqual({
		at: at(3).toISOString(),
		symbol: 'rain',
		night: false,
		temperatureC: mockStep(3).temperatureC,
		precipitationMm: 2.4,
	})
	// 70 h out is the 6-hourly step that starts at 66 h: the pattern's 61st.
	// Its 12.4 mm fall over six hours: per hour, as every day's figure is.
	expect(mockStep(61).precipitationMm).toBe(12.4)
	expect(forecasts.get('far')).toEqual({
		at: at(70).toISOString(),
		symbol: 'heavy-snow-and-thunder',
		night: false,
		temperatureC: mockStep(61).temperatureC,
		precipitationMm: 2.1,
	})
	expect(forecasts.get('night')).toMatchObject({ symbol: 'fair', night: true })
	expect(forecasts.get('beyond')).toEqual({ reason: 'beyond-forecast' })
})

test('one call per rounded point, asked with the rounded point and trainm8’s User-Agent', async () => {
	server.use(metForecastHandler({ from: START }))
	const point = freshPoint()
	const requests = countRequests()
	await readDayForecasts(point, new Map([['a', at(2)]]))
	// 3 m away: the same rounded point, so the same cached forecast.
	await readDayForecasts(
		{ latitude: point.latitude + 0.00003, longitude: point.longitude },
		new Map([['b', at(5)]]),
	)
	requests.stop()
	expect(requests.seen).toHaveLength(1)
	const url = new URL(requests.seen[0]!.url)
	expect(url.searchParams.get('lat')).toBe(point.latitude.toFixed(2))
	expect(url.searchParams.get('lon')).toBe('10.12')
	expect(requests.seen[0]!.headers.get('user-agent')).toMatch(/^trainm8\//)
})

test('MET erroring with nothing cached: every day is forecast-unavailable, never a throw', async () => {
	server.use(
		http.get(MET_FORECAST_URL, () => new HttpResponse(null, { status: 500 })),
	)
	const forecasts = await readDayForecasts(
		freshPoint(),
		new Map([
			['a', at(2)],
			['b', at(30)],
		]),
	)
	expect([...forecasts.values()]).toEqual([
		{ reason: 'forecast-unavailable' },
		{ reason: 'forecast-unavailable' },
	])
})

test('MET answering nonsense is forecast-unavailable too', async () => {
	server.use(http.get(MET_FORECAST_URL, () => HttpResponse.json({ nope: 1 })))
	const forecasts = await readDayForecasts(
		freshPoint(),
		new Map([['a', at(2)]]),
	)
	expect(forecasts.get('a')).toEqual({ reason: 'forecast-unavailable' })
})

test('a slow MET is cut at about 2 seconds', async () => {
	server.use(
		http.get(MET_FORECAST_URL, async () => {
			await delay(6_000)
			return HttpResponse.json(metForecast(START))
		}),
	)
	const started = Date.now()
	const forecasts = await readDayForecasts(
		freshPoint(),
		new Map([['a', at(2)]]),
	)
	expect(Date.now() - started).toBeLessThan(3_500)
	expect(forecasts.get('a')).toEqual({ reason: 'forecast-unavailable' })
})

async function seedCache(
	point: { latitude: number; longitude: number },
	ageMs: number,
) {
	server.use(metForecastHandler({ from: START }))
	await readDayForecasts(point, new Map([['seed', at(1)]]))
	const key = forecastCacheKey(point)
	const entry = (await cache.get(key))!
	await cache.set(key, {
		...entry,
		metadata: {
			...entry.metadata,
			createdTime: Date.now() - ageMs,
			ttl: 30 * 60 * 1000,
		},
	})
}

test('a stale forecast is served while MET errors, up to 24 hours past Expires', async () => {
	const point = freshPoint()
	await seedCache(point, 5 * HOUR)
	server.use(
		http.get(MET_FORECAST_URL, () => new HttpResponse(null, { status: 503 })),
	)
	const forecasts = await readDayForecasts(point, new Map([['a', at(3)]]))
	expect(forecasts.get('a')).toMatchObject({
		symbol: 'rain',
		precipitationMm: 2.4,
	})
})

test('past 24 hours stale, a forecast is not served', async () => {
	const point = freshPoint()
	await seedCache(point, FORECAST_STALE_MS + 2 * HOUR)
	server.use(
		http.get(MET_FORECAST_URL, () => new HttpResponse(null, { status: 503 })),
	)
	const forecasts = await readDayForecasts(point, new Map([['a', at(3)]]))
	expect(forecasts.get('a')).toEqual({ reason: 'forecast-unavailable' })
})

test('a refresh asks If-Modified-Since, and a 304 keeps the cached forecast', async () => {
	const point = freshPoint()
	await seedCache(point, FORECAST_STALE_MS + 2 * HOUR)
	const asked: (string | null)[] = []
	server.use(
		http.get(MET_FORECAST_URL, ({ request }) => {
			asked.push(request.headers.get('if-modified-since'))
			return new HttpResponse(null, {
				status: 304,
				headers: { Expires: new Date(Date.now() + HOUR).toUTCString() },
			})
		}),
	)
	const forecasts = await readDayForecasts(point, new Map([['a', at(3)]]))
	expect(asked).toEqual([START.toUTCString()])
	expect(forecasts.get('a')).toMatchObject({ symbol: 'rain' })
})

test('no days asked: no call at all', async () => {
	const requests = countRequests()
	const forecasts = await readDayForecasts(freshPoint(), new Map())
	requests.stop()
	expect(forecasts.size).toBe(0)
	expect(requests.seen).toHaveLength(0)
})

test('MET down with nothing cached: one wait, then no call and no wait until the back-off ends', async () => {
	const point = freshPoint()
	server.use(
		http.get(MET_FORECAST_URL, async () => {
			await delay(6_000)
			return HttpResponse.json(metForecast(START))
		}),
	)
	await readDayForecasts(point, new Map([['a', at(2)]]))
	const requests = countRequests()
	const started = Date.now()
	const forecasts = await readDayForecasts(point, new Map([['a', at(2)]]))
	requests.stop()
	expect(Date.now() - started).toBeLessThan(200)
	expect(requests.seen).toHaveLength(0)
	expect(forecasts.get('a')).toEqual({ reason: 'forecast-unavailable' })
})

test('a 429 is not asked again before its Retry-After, and the back-off is per point', async () => {
	const point = freshPoint()
	server.use(
		http.get(
			MET_FORECAST_URL,
			() =>
				new HttpResponse(null, {
					status: 429,
					headers: { 'Retry-After': '3600' },
				}),
		),
	)
	await readDayForecasts(point, new Map([['a', at(2)]]))
	const entry = lruCache.get(forecastBackoffKey(point))
	expect(entry?.metadata.ttl).toBe(HOUR)
	server.use(metForecastHandler({ from: START }))
	const requests = countRequests()
	const same = await readDayForecasts(point, new Map([['a', at(3)]]))
	const other = await readDayForecasts(freshPoint(), new Map([['a', at(3)]]))
	requests.stop()
	expect(requests.seen).toHaveLength(1)
	expect(same.get('a')).toEqual({ reason: 'forecast-unavailable' })
	expect(other.get('a')).toMatchObject({ symbol: 'rain' })
})

test('without Retry-After a failure backs off for the default period', async () => {
	const point = freshPoint()
	server.use(
		http.get(MET_FORECAST_URL, () => new HttpResponse(null, { status: 500 })),
	)
	await readDayForecasts(point, new Map([['a', at(2)]]))
	expect(lruCache.get(forecastBackoffKey(point))?.metadata.ttl).toBe(
		FORECAST_BACKOFF_MS,
	)
})

test('a stale forecast is still served during a back-off', async () => {
	const point = freshPoint()
	await seedCache(point, 5 * HOUR)
	server.use(
		http.get(MET_FORECAST_URL, () => new HttpResponse(null, { status: 503 })),
	)
	await readDayForecasts(point, new Map([['a', at(3)]]))
	const requests = countRequests()
	const forecasts = await readDayForecasts(point, new Map([['a', at(3)]]))
	requests.stop()
	expect(requests.seen).toHaveLength(0)
	expect(forecasts.get('a')).toMatchObject({ symbol: 'rain' })
})
