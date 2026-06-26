/**
 * Decode a Google "encoded polyline" string (the format Strava returns in
 * `map.summary_polyline`) into `[lat, lng]` pairs. Pure and provider-neutral so
 * it can back any route rendering. Algorithm:
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): Array<[number, number]> {
	const points: Array<[number, number]> = []
	let index = 0
	let lat = 0
	let lng = 0

	while (index < encoded.length) {
		lat += decodeSignedValue()
		lng += decodeSignedValue()
		points.push([lat / 1e5, lng / 1e5])
	}

	return points

	/** Read one zig-zag-encoded varint delta, advancing `index`. */
	function decodeSignedValue(): number {
		let result = 0
		let shift = 0
		let byte: number
		do {
			byte = encoded.charCodeAt(index++) - 63
			result |= (byte & 0x1f) << shift
			shift += 5
		} while (byte >= 0x20)
		return result & 1 ? ~(result >> 1) : result >> 1
	}
}
