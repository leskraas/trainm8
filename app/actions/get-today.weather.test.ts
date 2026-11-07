import { http, HttpResponse } from 'msw'
import { afterEach, expect, test } from 'vitest'
import { cache } from '#app/utils/cache.server.ts'
import { setHomePlace } from '#app/utils/home-place.server.ts'
import { forecastCacheKey } from '#app/utils/weather/forecast.server.ts'
import {
	createAthlete,
	createWorld,
	ctxFor,
	NOW,
	TODAY,
} from '#tests/actions-world.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MET_FORECAST_URL,
	metForecastHandler,
	mockStep,
} from '#tests/mocks/met-norway.ts'
import { runAction } from './run.server.ts'

// get_today's weather (#433, ADR 0113 §5): today's Day Forecast as one
// Reading, the same the today card shows, with MET Norway credited.

const HOUR = 60 * 60 * 1000
const LILLEHAMMER = {
	name: 'Lillehammer',
	kind: 'By',
	municipality: 'Lillehammer',
	county: 'Innlandet',
	latitude: 61.11514,
	longitude: 10.46628,
}

afterEach(async () => {
	await cache.delete(forecastCacheKey(LILLEHAMMER))
})

async function getToday(userId: string, caller: 'web' | 'mcp' = 'mcp') {
	const result = await runAction(ctxFor(userId, caller), 'get_today', {})
	if (result.outcome !== 'done') throw new Error(result.outcome)
	return result
}

test('with a Home Place: the forecast at today’s first open session, credited to MET Norway', async () => {
	server.use(metForecastHandler({ from: NOW }))
	const world = await createWorld()
	await setHomePlace(world.userId, LILLEHAMMER)
	const result = await getToday(world.userId)
	// Today's 07:00 is done; the planned run at 18:00 is the Forecast Hour,
	// six hours into the forecast.
	const step = mockStep(6)
	expect(result.value.weather).toEqual({
		status: 'available',
		value: {
			at: `${TODAY}T18:00:00.000Z`,
			symbol: 'fog',
			label: 'Tåke',
			temperatureC: step.temperatureC,
			precipitationMm: step.precipitationMm,
		},
	})
	expect(result.credits).toContainEqual({
		platform: 'met-norway',
		text: 'Værvarsel fra MET Norway',
	})
	// The web reads the same as a model.
	expect((await getToday(world.userId, 'web')).value.weather).toEqual(
		result.value.weather,
	)
})

test('no Home Place: unavailable as no-home-place, MET never asked, no credit', async () => {
	let asked = false
	server.use(
		http.get(MET_FORECAST_URL, () => {
			asked = true
			return HttpResponse.json({})
		}),
	)
	const { id } = await createAthlete()
	const result = await getToday(id)
	expect(result.value.weather).toMatchObject({
		status: 'unavailable',
		reason: 'no-home-place',
		label: 'Ikke satt: du har ikke valgt et hjemsted i Meg.',
	})
	expect(asked).toBe(false)
	expect(result.credits.map((c) => c.platform)).not.toContain('met-norway')
})

test('a forecast that ends before today’s hour: beyond-forecast', async () => {
	server.use(
		metForecastHandler({ from: new Date(NOW.getTime() - 20 * 24 * HOUR) }),
	)
	const { id } = await createAthlete()
	await setHomePlace(id, LILLEHAMMER)
	expect((await getToday(id)).value.weather).toMatchObject({
		status: 'unavailable',
		reason: 'beyond-forecast',
	})
})

test('MET down with nothing cached: forecast-unavailable, and get_today still answers', async () => {
	server.use(
		http.get(MET_FORECAST_URL, () => new HttpResponse(null, { status: 500 })),
	)
	const { id } = await createAthlete()
	await setHomePlace(id, LILLEHAMMER)
	const result = await getToday(id)
	expect(result.value.weather).toMatchObject({
		status: 'unavailable',
		reason: 'forecast-unavailable',
	})
	expect(result.credits.map((c) => c.platform)).not.toContain('met-norway')
})
