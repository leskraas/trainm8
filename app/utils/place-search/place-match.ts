/**
 * What the place search answers with, shared by the server and the
 * _Hjemsted_ page (a runtime leaf: no server code).
 */
import { type HomePlace } from '#app/utils/home-place.ts'

/** Search text is a place name, not a paragraph. */
export const PLACE_SEARCH_MAX_LENGTH = 80

/** A match, in the shape a Home Place is stored in. */
export type PlaceMatch = HomePlace & {
	/** Kartverket's `stedsnummer`: the match's key in the list. */
	id: string
}

export type PlaceSearchResult =
	| { status: 'found'; places: PlaceMatch[] }
	| { status: 'unavailable' }
