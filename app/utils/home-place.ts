/**
 * The **Home Place**'s point rules (ADR 0112 §2), as pure data: the 2-decimal
 * rounding every write and every forecast call goes through, and the area a
 * Home Place may lie in. A runtime leaf, shared by the server and the tests.
 */

export type GeoPoint = { latitude: number; longitude: number }

/** A Home Place as stored and shown: Kartverket's names and a rounded point. */
export type HomePlace = GeoPoint & {
	name: string
	kind: string
	municipality: string
	county: string
}

/** About a kilometre: what is stored and what MET is asked about, nothing finer. */
export const HOME_PLACE_DECIMALS = 2

function round(value: number): number {
	const factor = 10 ** HOME_PLACE_DECIMALS
	return Math.round(value * factor) / factor
}

export function roundedPoint({ latitude, longitude }: GeoPoint): GeoPoint {
	return { latitude: round(latitude), longitude: round(longitude) }
}

/**
 * The area Kartverket's place-name register covers: mainland Norway,
 * Svalbard and Jan Mayen, with a margin for the coast. A point outside it did
 * not come from the place search, so the server refuses it.
 */
export const HOME_PLACE_AREA = {
	south: 57.5,
	north: 81.5,
	west: -9.5,
	east: 35,
} as const

export function isInHomePlaceArea({ latitude, longitude }: GeoPoint): boolean {
	return (
		Number.isFinite(latitude) &&
		Number.isFinite(longitude) &&
		latitude >= HOME_PLACE_AREA.south &&
		latitude <= HOME_PLACE_AREA.north &&
		longitude >= HOME_PLACE_AREA.west &&
		longitude <= HOME_PLACE_AREA.east
	)
}
