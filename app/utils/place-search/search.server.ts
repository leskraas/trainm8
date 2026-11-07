/**
 * The place search behind _Hjemsted_ (ADR 0112 §1): a typed name in, places
 * in Norway out, from Kartverket's Stedsnavn API (`ws.geonorge.no/stedsnavn/
 * v1`, CC BY 4.0, credited under the search). One function,
 * {@link searchPlaces}, with one adapter behind it and no provider interface.
 *
 * Server only, with an identifying `User-Agent`: Kartverket gets the search
 * text and nothing else, never the athlete's name, account or IP address. The
 * text is never stored and never logged here (and the route posts it, so it
 * is not in a URL the access log writes down).
 */
import { z } from 'zod/v4'
import { isInHomePlaceArea } from '#app/utils/home-place.ts'
import { OUTBOUND_USER_AGENT } from '#app/utils/outbound-user-agent.ts'
import {
	PLACE_SEARCH_MAX_LENGTH,
	type PlaceMatch,
	type PlaceSearchResult,
} from './place-match.ts'

export { PLACE_SEARCH_MAX_LENGTH, type PlaceMatch, type PlaceSearchResult }

export const PLACE_SEARCH_URL = 'https://ws.geonorge.no/stedsnavn/v1/navn'

/** How long the search waits before saying it does not answer. */
export const PLACE_SEARCH_TIMEOUT_MS = 4_000
/** The most matches the list shows. */
export const PLACE_SEARCH_LIMIT = 8
const KartverketSchema = z.object({
	navn: z.array(
		z.object({
			stedsnummer: z.number(),
			skrivemåte: z.string(),
			navneobjekttype: z.string(),
			representasjonspunkt: z.object({ nord: z.number(), øst: z.number() }),
			kommuner: z.array(z.object({ kommunenavn: z.string() })).optional(),
			fylker: z.array(z.object({ fylkesnavn: z.string() })).optional(),
		}),
	),
})

/**
 * Search Kartverket for `text`. `found` with no places is "no match";
 * `unavailable` is Kartverket erroring, being slow or answering nonsense.
 * Never throws.
 */
export async function searchPlaces(text: string): Promise<PlaceSearchResult> {
	const query = text.trim().slice(0, PLACE_SEARCH_MAX_LENGTH)
	if (!query) return { status: 'found', places: [] }
	const url = new URL(PLACE_SEARCH_URL)
	url.searchParams.set('sok', query)
	url.searchParams.set('fuzzy', 'true')
	// EUREF89 geographic: latitude (`nord`) and longitude (`øst`) in degrees.
	url.searchParams.set('utkoordsys', '4258')
	url.searchParams.set('treffPerSide', String(PLACE_SEARCH_LIMIT))
	url.searchParams.set('side', '1')
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': OUTBOUND_USER_AGENT,
				Accept: 'application/json',
			},
			signal: AbortSignal.timeout(PLACE_SEARCH_TIMEOUT_MS),
		})
		if (!response.ok) return { status: 'unavailable' }
		const parsed = KartverketSchema.safeParse(await response.json())
		if (!parsed.success) return { status: 'unavailable' }
		const places: PlaceMatch[] = []
		for (const place of parsed.data.navn) {
			const match: PlaceMatch = {
				id: String(place.stedsnummer),
				name: place.skrivemåte,
				kind: place.navneobjekttype,
				municipality: place.kommuner?.[0]?.kommunenavn ?? '',
				county: countyName(place.fylker?.[0]?.fylkesnavn ?? ''),
				latitude: place.representasjonspunkt.nord,
				longitude: place.representasjonspunkt.øst,
			}
			if (match.municipality && match.county && isInHomePlaceArea(match)) {
				places.push(match)
			}
		}
		return { status: 'found', places }
	} catch {
		return { status: 'unavailable' }
	}
}

/**
 * A county as the match line says it: Kartverket writes a county with more
 * than one official language as all its names (`Troms - Romsa - Tromssa`);
 * the line takes the first, which is the Norwegian.
 */
function countyName(name: string): string {
	return name.split(' - ')[0]?.trim() ?? name
}
