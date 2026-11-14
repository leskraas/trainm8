import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '#tests/mocks/index.ts'
import { PLACE_SEARCH_URL } from '#tests/mocks/kartverket.ts'
import { searchPlaces } from './search.server.ts'

test('matches carry municipality and county, so same-named places can be told apart', async () => {
	const result = await searchPlaces('Lillehammer')
	expect(result).toEqual({
		status: 'found',
		places: [
			{
				id: '311824',
				name: 'Lillehammer',
				kind: 'By',
				municipality: 'Lillehammer',
				county: 'Innlandet',
				latitude: 61.11514,
				longitude: 10.46628,
			},
			{
				id: '355893',
				name: 'Lillehammer',
				kind: 'Annen kulturdetalj',
				municipality: 'Marker',
				county: 'Østfold',
				latitude: 59.60456,
				longitude: 11.58673,
			},
		],
	})
})

test('a county in three languages is said in the first', async () => {
	const result = await searchPlaces('tromsø')
	expect(result.status === 'found' && result.places[0]?.county).toBe('Troms')
})

test('no match is found with no places; empty text asks nobody', async () => {
	expect(await searchPlaces('Xyzzy')).toEqual({ status: 'found', places: [] })
	let asked = false
	const listener = () => {
		asked = true
	}
	server.events.on('request:start', listener)
	expect(await searchPlaces('   ')).toEqual({ status: 'found', places: [] })
	server.events.removeListener('request:start', listener)
	expect(asked).toBe(false)
})

test('Kartverket erroring or answering nonsense: unavailable, never a throw', async () => {
	server.use(
		http.get(PLACE_SEARCH_URL, () => new HttpResponse(null, { status: 502 })),
	)
	expect(await searchPlaces('Lillehammer')).toEqual({ status: 'unavailable' })
	server.use(http.get(PLACE_SEARCH_URL, () => HttpResponse.text('<html>')))
	expect(await searchPlaces('Lillehammer')).toEqual({ status: 'unavailable' })
	server.use(http.get(PLACE_SEARCH_URL, () => HttpResponse.error()))
	expect(await searchPlaces('Lillehammer')).toEqual({ status: 'unavailable' })
})

test('Kartverket gets the text and trainm8’s User-Agent, nothing about the athlete', async () => {
	let seen: Request | null = null
	server.use(
		http.get(PLACE_SEARCH_URL, ({ request }) => {
			seen = request
			return HttpResponse.json({ navn: [] })
		}),
	)
	await searchPlaces('Lillehammer')
	const request = seen as unknown as Request
	expect(new URL(request.url).searchParams.get('sok')).toBe('Lillehammer')
	expect(request.headers.get('user-agent')).toMatch(/^trainm8\//)
	expect(request.headers.get('cookie')).toBeNull()
})
