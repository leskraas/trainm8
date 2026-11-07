import { expect, test } from 'vitest'
import { PLACE_SEARCH_URL } from '#app/utils/place-search/search.server.ts'
import { MET_FORECAST_URL } from '#app/utils/weather/forecast.server.ts'
import {
	PRIVATE_QUERY_HOSTS,
	scrubBreadcrumb,
	scrubSpan,
} from './outbound-privacy.ts'

const SEARCH = `${PLACE_SEARCH_URL}?sok=Lillehammer&fuzzy=true`
const FORECAST = `${MET_FORECAST_URL}?lat=61.12&lon=10.47`

test('the hosts that get a search text or a point are both scrubbed', () => {
	expect(PRIVATE_QUERY_HOSTS).toEqual(
		expect.arrayContaining([
			new URL(PLACE_SEARCH_URL).host,
			new URL(MET_FORECAST_URL).host,
		]),
	)
})

test('a fetch breadcrumb to Kartverket or MET keeps the call, not the query', () => {
	for (const url of [SEARCH, FORECAST]) {
		const crumb = scrubBreadcrumb({
			category: 'fetch',
			data: {
				method: 'GET',
				url: url.split('?')[0],
				'http.query': `?${url.split('?')[1]}`,
				status_code: 200,
			},
		})
		expect(crumb.data).toEqual({
			method: 'GET',
			url: url.split('?')[0],
			status_code: 200,
		})
		expect(JSON.stringify(crumb)).not.toMatch(/Lillehammer|61\.12/)
	}
})

test('a full URL in a breadcrumb loses its query too', () => {
	const crumb = scrubBreadcrumb({ category: 'http', data: { url: SEARCH } })
	expect(crumb.data).toEqual({ url: PLACE_SEARCH_URL })
})

test('an outgoing span to MET keeps its host and path, not lat and lon', () => {
	const span = scrubSpan({
		description: `GET ${FORECAST}`,
		data: {
			'url.full': FORECAST,
			'http.url': FORECAST,
			'url.query': '?lat=61.12&lon=10.47',
			'http.query': '?lat=61.12&lon=10.47',
			'server.address': 'api.met.no',
			'url.path': '/weatherapi/locationforecast/2.0/compact',
		},
	})
	expect(span.description).toBe(`GET ${MET_FORECAST_URL}`)
	expect(span.data).toEqual({
		'url.full': MET_FORECAST_URL,
		'http.url': MET_FORECAST_URL,
		'server.address': 'api.met.no',
		'url.path': '/weatherapi/locationforecast/2.0/compact',
	})
})

test('calls to any other host are left as they are', () => {
	const data = {
		'url.full': 'https://www.strava.com/api/v3/athlete/activities?page=2',
		'url.query': '?page=2',
	}
	expect(scrubSpan({ description: 'GET', data }).data).toEqual(data)
	expect(
		scrubBreadcrumb({ data: { url: 'https://x.test/a', 'http.query': '?b' } })
			.data,
	).toEqual({ url: 'https://x.test/a', 'http.query': '?b' })
})
