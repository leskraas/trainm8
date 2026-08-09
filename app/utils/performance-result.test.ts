import { expect, test } from 'vitest'
import {
	raceAnchorForDistance,
	raceAnchorPacesFrom,
} from './performance-result.server.ts'

const at = (iso: string) => new Date(iso)

test('a distance names a Race Anchor only when it is exactly that distance', () => {
	expect(raceAnchorForDistance(5000)).toBe('5k')
	expect(raceAnchorForDistance(21097)).toBe('hm')
	// A 4.8 km parkrun is not a 5k. Rounding one into the other would put a pace
	// the athlete never ran behind a "5k pace" target.
	expect(raceAnchorForDistance(4800)).toBeNull()
	expect(raceAnchorForDistance(3700)).toBeNull()
})

test('a race anchor takes the most recent result, not the fastest', () => {
	// A prescription resolves against what this athlete can do *now*. The
	// fastest-ever reading is a Personal Record, which is a different question
	// with its own derivation (ADR 0021) — using it here would prescribe a
	// target from a season the athlete is no longer in.
	const paces = raceAnchorPacesFrom([
		{ distanceM: 5000, timeSec: 1080, occurredAt: at('2024-05-01') }, // 3:36/km
		{ distanceM: 5000, timeSec: 1200, occurredAt: at('2026-05-01') }, // 4:00/km
	])
	expect(paces).toEqual({ '5k': 240 })
})

test('results at distances no anchor names are ignored, never rounded', () => {
	expect(
		raceAnchorPacesFrom([
			{ distanceM: 4800, timeSec: 1150, occurredAt: at('2026-05-01') },
		]),
	).toEqual({})
})

test('an anchor with no result is absent rather than zero', () => {
	// An absent key is what `racePace` degrades on — the target keeps its
	// portable name and drops the number, never a fabricated pace.
	const paces = raceAnchorPacesFrom([
		{ distanceM: 10000, timeSec: 2490, occurredAt: at('2026-03-14') },
	])
	expect(paces).toEqual({ '10k': 249 })
	expect(paces.marathon).toBeUndefined()
})
