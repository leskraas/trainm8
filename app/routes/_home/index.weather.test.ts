/**
 * I dag's weather through the `/` loader (#433, ADR 0115 §3 and §6): read
 * beside the timeline, only with a Home Place, never an error, and the same
 * forecast `get_today` hands an Assistant.
 */
import { http, HttpResponse } from 'msw'
import { type AppLoadContext } from 'react-router'
import { afterEach, expect, test } from 'vitest'
import { runAction } from '#app/actions/run.server.ts'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { cache } from '#app/utils/cache.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { removeHomePlace, setHomePlace } from '#app/utils/home-place.server.ts'
import { forecastCacheKey } from '#app/utils/weather/forecast.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { MET_FORECAST_URL } from '#tests/mocks/met-norway.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './index.tsx'

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/',
}

const TROMSØ = {
	name: 'Tromsø',
	kind: 'Kommune',
	municipality: 'Tromsø',
	county: 'Troms',
	latitude: 69.65455,
	longitude: 18.96366,
}

afterEach(async () => {
	await cache.delete(forecastCacheKey(TROMSØ))
})

async function signedIn() {
	const user = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...user,
					password: { create: createPassword(user.username) },
					athleteProfile: { create: { timezone: 'Europe/Oslo' } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

async function load(cookie: string) {
	const headers = new Headers({ cookie })
	const data = await loader({
		request: new Request(new URL('/', BASE_URL), { headers }),
		...ARGS,
	})
	if (!data.isAuthenticated) throw new Error('not signed in')
	return data
}

test('with a Home Place, I dag gets today’s forecast and the days ahead, never the past', async () => {
	const { userId, cookie } = await signedIn()
	await setHomePlace(userId, TROMSØ)
	const { weather } = await load(cookie)
	const today = localDate(new Date(), 'Europe/Oslo')
	expect(weather).not.toBeNull()
	const days = Object.keys(weather ?? {})
	expect(days).toContain(today)
	expect(days.every((day) => day >= today)).toBe(true)
})

test('the today card and get_today say the same weather', async () => {
	const { userId, cookie } = await signedIn()
	await setHomePlace(userId, TROMSØ)
	const { weather } = await load(cookie)
	const today = localDate(new Date(), 'Europe/Oslo')
	const result = await runAction(
		{
			userId,
			caller: 'mcp',
			scopes: ['training:read'],
			now: new Date(),
			timezone: 'Europe/Oslo',
			origin: BASE_URL,
		},
		'get_today',
		{},
	)
	if (result.outcome !== 'done') throw new Error(result.outcome)
	const card = weather?.[today]
	expect(result.value.weather).toEqual({
		status: 'available',
		value: {
			at: card?.at,
			symbol: card?.symbol,
			label: expect.any(String),
			temperatureC: card?.temperatureC,
			precipitationMm: card?.precipitationMm,
		},
	})
})

test('after Fjern, the next load of I dag has no weather and asks MET nothing', async () => {
	const { userId, cookie } = await signedIn()
	await setHomePlace(userId, TROMSØ)
	expect((await load(cookie)).weather).not.toBeNull()
	await removeHomePlace(userId)
	let asked = false
	server.use(
		http.get(MET_FORECAST_URL, () => {
			asked = true
			return HttpResponse.json({})
		}),
	)
	expect((await load(cookie)).weather).toBeNull()
	expect(asked).toBe(false)
})

test('MET down with nothing cached: I dag loads as normal, without weather', async () => {
	server.use(
		http.get(MET_FORECAST_URL, () => new HttpResponse(null, { status: 503 })),
	)
	const { userId, cookie } = await signedIn()
	await setHomePlace(userId, TROMSØ)
	const data = await load(cookie)
	expect(data.weather).toEqual({})
	expect(data.ledger).toEqual([])
})
