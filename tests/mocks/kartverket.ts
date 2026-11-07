import { http, HttpResponse, passthrough, type HttpHandler } from 'msw'

/**
 * Kartverket's Stedsnavn API (ADR 0115), mocked: a handful of places shaped
 * like Kartverket's own answers, matched on the start of the name, case
 * blind. Two places named Lillehammer (a town and a cultural site in Marker)
 * so a test can tell same-named places apart, a municipality whose name is
 * its town's (Tromsø), and a county written in three languages, as
 * Kartverket does. Mocked in tests; in dev only with `MOCK_WEATHER=true`.
 */
export const PLACE_SEARCH_URL = 'https://ws.geonorge.no/stedsnavn/v1/navn'

type MockPlace = {
	stedsnummer: number
	skrivemåte: string
	navneobjekttype: string
	nord: number
	øst: number
	kommune: string
	fylke: string
}

export const MOCK_PLACES: MockPlace[] = [
	{
		stedsnummer: 311824,
		skrivemåte: 'Lillehammer',
		navneobjekttype: 'By',
		nord: 61.11514,
		øst: 10.46628,
		kommune: 'Lillehammer',
		fylke: 'Innlandet',
	},
	{
		stedsnummer: 355893,
		skrivemåte: 'Lillehammer',
		navneobjekttype: 'Annen kulturdetalj',
		nord: 59.60456,
		øst: 11.58673,
		kommune: 'Marker',
		fylke: 'Østfold',
	},
	{
		stedsnummer: 503295,
		skrivemåte: 'Tromsø',
		navneobjekttype: 'Kommune',
		nord: 69.65455,
		øst: 18.96366,
		kommune: 'Tromsø',
		fylke: 'Troms - Romsa - Tromssa',
	},
	{
		stedsnummer: 152101,
		skrivemåte: 'Trondheim',
		navneobjekttype: 'By',
		nord: 63.43049,
		øst: 10.39506,
		kommune: 'Trondheim',
		fylke: 'Trøndelag - Trööndelage',
	},
]

function answer(places: MockPlace[]) {
	return {
		metadata: {
			side: 1,
			totaltAntallTreff: places.length,
			treffPerSide: 8,
			viserFra: places.length ? 1 : 0,
			viserTil: places.length,
		},
		navn: places.map((place) => ({
			fylker: [{ fylkesnavn: place.fylke, fylkesnummer: '00' }],
			kommuner: [{ kommunenavn: place.kommune, kommunenummer: '0000' }],
			navneobjekttype: place.navneobjekttype,
			navnestatus: 'hovednavn',
			representasjonspunkt: { nord: place.nord, øst: place.øst },
			skrivemåte: place.skrivemåte,
			skrivemåtestatus: 'godkjent og prioritert',
			språk: 'Norsk',
			stedsnummer: place.stedsnummer,
			stedstatus: 'aktiv',
		})),
	}
}

export const handlers: Array<HttpHandler> = [
	http.get(PLACE_SEARCH_URL, ({ request }) => {
		const text = (new URL(request.url).searchParams.get('sok') ?? '')
			.trim()
			.toLocaleLowerCase('nb')
		return HttpResponse.json(
			answer(
				MOCK_PLACES.filter(
					(place) =>
						text && place.skrivemåte.toLocaleLowerCase('nb').startsWith(text),
				),
			),
		)
	}),
]

export const passthroughHandlers: Array<HttpHandler> = [
	http.all('https://ws.geonorge.no/*', () => passthrough()),
]
