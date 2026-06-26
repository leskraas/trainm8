import { expect, test } from 'vitest'
import { decodePolyline } from './polyline.ts'

test('decodes the canonical Google polyline test vector', () => {
	// From the Google encoded-polyline algorithm reference docs.
	const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
	expect(points).toHaveLength(3)
	expect(points[0]![0]).toBeCloseTo(38.5, 5)
	expect(points[0]![1]).toBeCloseTo(-120.2, 5)
	expect(points[1]![0]).toBeCloseTo(40.7, 5)
	expect(points[1]![1]).toBeCloseTo(-120.95, 5)
	expect(points[2]![0]).toBeCloseTo(43.252, 5)
	expect(points[2]![1]).toBeCloseTo(-126.453, 5)
})

test('returns an empty array for an empty string', () => {
	expect(decodePolyline('')).toEqual([])
})
