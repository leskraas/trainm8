import { expect, test } from 'vitest'
import {
	raceAnchorChoicesFrom,
	raceAnchorForDistance,
	raceAnchorPacesFrom,
	type ResultRow,
} from './performance-result.server.ts'

const at = (iso: string) => new Date(iso)
let next = 0
const row = (
	fields: Pick<ResultRow, 'distanceM' | 'timeSec' | 'occurredAt'> &
		Partial<ResultRow>,
): ResultRow => ({
	id: `r${++next}`,
	eventId: null,
	origins: [],
	...fields,
})

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
		row({ distanceM: 5000, timeSec: 1080, occurredAt: at('2024-05-01') }), // 3:36/km
		row({ distanceM: 5000, timeSec: 1200, occurredAt: at('2026-05-01') }), // 4:00/km
	])
	expect(paces).toEqual({ '5k': 240 })
})

test('results at distances no anchor names are ignored, never rounded', () => {
	expect(
		raceAnchorPacesFrom([
			row({ distanceM: 4800, timeSec: 1150, occurredAt: at('2026-05-01') }),
		]),
	).toEqual({})
})

test('an anchor with no result is absent rather than zero', () => {
	// An absent key is what `racePace` degrades on — the target keeps its
	// portable name and drops the number, never a fabricated pace.
	const paces = raceAnchorPacesFrom([
		row({ distanceM: 10000, timeSec: 2490, occurredAt: at('2026-03-14') }),
	])
	expect(paces).toEqual({ '10k': 249 })
	expect(paces.marathon).toBeUndefined()
})

test("on the same day a typed result wins over an Event's, whichever came first", () => {
	// ADR 0113 §3: typing a time for a race the watch also measured is a
	// correction (the course was long, the watch started late).
	const typed = row({
		id: 'typed',
		distanceM: 10000,
		timeSec: 2465,
		occurredAt: at('2026-04-25'),
		createdAt: at('2026-04-25T10:00:00Z'),
	})
	const measured = row({
		id: 'measured',
		eventId: 'event',
		origins: ['garmin'],
		distanceM: 10000,
		timeSec: 2472,
		occurredAt: at('2026-04-25'),
		createdAt: at('2026-04-25T12:00:00Z'),
	})
	for (const rows of [
		[typed, measured],
		[measured, typed],
	]) {
		expect(raceAnchorChoicesFrom(rows)['10k']).toEqual({
			id: 'typed',
			paceSecPerKm: 247,
			origins: [],
		})
	}
})

test('a newer Event result is chosen over an older typed one, with its binding set', () => {
	const choices = raceAnchorChoicesFrom([
		row({ distanceM: 10000, timeSec: 2465, occurredAt: at('2026-03-01') }),
		row({
			id: 'race',
			eventId: 'event',
			origins: ['garmin', 'strava'],
			distanceM: 10000,
			timeSec: 2472,
			occurredAt: at('2026-04-25'),
		}),
	])
	expect(choices['10k']).toEqual({
		id: 'race',
		paceSecPerKm: 247,
		origins: ['garmin', 'strava'],
	})
})

test('an Event result at a distance that is no anchor resolves nothing', () => {
	expect(
		raceAnchorChoicesFrom([
			row({
				eventId: 'event',
				distanceM: 7500,
				timeSec: 1862,
				occurredAt: at('2026-04-25'),
			}),
		]),
	).toEqual({})
})
