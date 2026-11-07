import { http, HttpResponse } from 'msw'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { PLACE_SEARCH_URL } from '#tests/mocks/kartverket.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as meLoader } from '../me.tsx'
import { action, loader } from './hjemsted.tsx'

// _Hjemsted_ in Meg (#433, ADR 0112 §2): search, choose, change and remove
// the Home Place, through the route's own actions.

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/settings/hjemsted',
}

async function setUp() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
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

function request(cookie: string | null, entries?: Array<[string, string]>) {
	return new Request(new URL('/settings/hjemsted', BASE_URL).toString(), {
		...(entries
			? { method: 'POST', body: new URLSearchParams(entries).toString() }
			: {}),
		headers: {
			...(cookie ? { cookie } : {}),
			...(entries
				? { 'content-type': 'application/x-www-form-urlencoded' }
				: {}),
		},
	})
}

async function post(cookie: string, entries: Array<[string, string]>) {
	const result = await action({ request: request(cookie, entries), ...ARGS })
	return 'data' in (result as object)
		? (result as unknown as { data: unknown }).data
		: result
}

const LILLEHAMMER: Array<[string, string]> = [
	['intent', 'set'],
	['name', 'Lillehammer'],
	['kind', 'By'],
	['municipality', 'Lillehammer'],
	['county', 'Innlandet'],
	['latitude', '61.11514'],
	['longitude', '10.46628'],
]

async function meDetail(cookie: string) {
	const me = await meLoader({
		request: request(cookie),
		...ARGS,
		unstable_pattern: '/me',
	})
	return me.homePlaceDetail
}

test('the search requires a signed-in athlete', async () => {
	await expect(
		action({
			request: request(null, [
				['intent', 'search'],
				['q', 'Lille'],
			]),
			...ARGS,
		}),
	).rejects.toMatchObject({ status: 302 })
})

test('a search answers with matches that tell same-named places apart, and stores nothing', async () => {
	const { cookie, userId } = await setUp()
	const reply = await post(cookie, [
		['intent', 'search'],
		['q', '  Lillehammer '],
	])
	expect(reply).toMatchObject({
		intent: 'search',
		text: 'Lillehammer',
		result: {
			status: 'found',
			places: [
				{
					name: 'Lillehammer',
					municipality: 'Lillehammer',
					county: 'Innlandet',
				},
				{ name: 'Lillehammer', municipality: 'Marker', county: 'Østfold' },
			],
		},
	})
	expect(
		await prisma.homePlace.count({ where: { athleteProfile: { userId } } }),
	).toBe(0)
})

test('no match keeps the text; a silent Kartverket is unavailable and the place unchanged', async () => {
	const { cookie } = await setUp()
	await post(cookie, LILLEHAMMER)
	expect(
		await post(cookie, [
			['intent', 'search'],
			['q', 'Xyzzy'],
		]),
	).toEqual({
		intent: 'search',
		text: 'Xyzzy',
		result: { status: 'found', places: [] },
	})
	server.use(
		http.get(PLACE_SEARCH_URL, () => new HttpResponse(null, { status: 503 })),
	)
	expect(
		await post(cookie, [
			['intent', 'search'],
			['q', 'Tromsø'],
		]),
	).toMatchObject({
		result: { status: 'unavailable' },
	})
	expect(
		(await loader({ request: request(cookie), ...ARGS })).place?.name,
	).toBe('Lillehammer')
})

test('choosing saves at once, rounded; Meg then shows the place by name', async () => {
	const { cookie } = await setUp()
	expect(await meDetail(cookie)).toBe('Ikke valgt. Gir værvarsel på I dag.')
	expect(await post(cookie, LILLEHAMMER)).toEqual({
		intent: 'set',
		ok: true,
		message: 'Lagret. I dag viser været for Lillehammer.',
	})
	expect((await loader({ request: request(cookie), ...ARGS })).place).toEqual({
		name: 'Lillehammer',
		kind: 'By',
		municipality: 'Lillehammer',
		county: 'Innlandet',
		latitude: 61.12,
		longitude: 10.47,
	})
	expect(await meDetail(cookie)).toBe('Lillehammer')
})

test('changing replaces the place; Fjern removes it', async () => {
	const { cookie } = await setUp()
	await post(cookie, LILLEHAMMER)
	await post(cookie, [
		['intent', 'set'],
		['name', 'Tromsø'],
		['kind', 'Kommune'],
		['municipality', 'Tromsø'],
		['county', 'Troms'],
		['latitude', '69.65455'],
		['longitude', '18.96366'],
	])
	expect(
		(await loader({ request: request(cookie), ...ARGS })).place?.name,
	).toBe('Tromsø')
	expect(await post(cookie, [['intent', 'remove']])).toEqual({
		intent: 'remove',
		ok: true,
		message: 'Hjemstedet er fjernet. I dag viser ikke vær lenger.',
	})
	expect((await loader({ request: request(cookie), ...ARGS })).place).toBeNull()
})

test('a point outside Norway, or a broken form, is refused and changes nothing', async () => {
	const { cookie } = await setUp()
	await post(cookie, LILLEHAMMER)
	expect(
		await post(cookie, [
			...LILLEHAMMER.filter(
				([key]) => key !== 'latitude' && key !== 'longitude',
			),
			['latitude', '45.92'],
			['longitude', '6.87'],
		]),
	).toMatchObject({
		ok: false,
		error: expect.stringContaining('utenfor Norge'),
	})
	expect(
		await post(cookie, [
			['intent', 'set'],
			['name', 'X'],
		]),
	).toMatchObject({
		ok: false,
	})
	expect(
		(await loader({ request: request(cookie), ...ARGS })).place?.latitude,
	).toBe(61.12)
})
