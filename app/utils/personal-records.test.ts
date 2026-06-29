import { describe, expect, test } from 'vitest'
import { detectPersonalRecords, type PrEffort } from './personal-records.ts'

// A qualifying effort: completed, recording-backed, trustworthy load (ADR 0008).
function effort(overrides: Partial<PrEffort> = {}): PrEffort {
	return {
		sessionId: 'session-1',
		discipline: 'run',
		distanceM: 10_000,
		achievedAt: new Date('2030-01-01T08:00:00Z'),
		confidence: 'high',
		...overrides,
	}
}

describe('detectPersonalRecords', () => {
	test('no efforts ⇒ no records (empty/Unavailable, never a fabricated zero)', () => {
		expect(detectPersonalRecords([])).toEqual([])
	})

	test('derives the farthest single effort per discipline', () => {
		const records = detectPersonalRecords([
			effort({ sessionId: 's1', distanceM: 8_000 }),
			effort({ sessionId: 's2', distanceM: 12_000 }),
			effort({ sessionId: 's3', distanceM: 5_000 }),
		])
		expect(records).toHaveLength(1)
		expect(records[0]).toMatchObject({
			discipline: 'run',
			kind: 'farthest',
			value: 12_000,
			sessionId: 's2',
		})
	})

	test('scopes records per discipline — a run never competes with a ride', () => {
		const records = detectPersonalRecords([
			effort({ sessionId: 'run-1', discipline: 'run', distanceM: 15_000 }),
			effort({ sessionId: 'bike-1', discipline: 'bike', distanceM: 40_000 }),
			effort({ sessionId: 'bike-2', discipline: 'bike', distanceM: 60_000 }),
			effort({ sessionId: 'swim-1', discipline: 'swim', distanceM: 1_500 }),
		])
		expect(records.map((r) => [r.discipline, r.value, r.sessionId])).toEqual([
			['run', 15_000, 'run-1'],
			['swim', 1_500, 'swim-1'],
			['bike', 60_000, 'bike-2'],
		])
	})

	test('reports the previous best and the delta the record beat it by', () => {
		const records = detectPersonalRecords([
			effort({
				sessionId: 's1',
				distanceM: 10_000,
				achievedAt: new Date('2030-01-01T08:00:00Z'),
			}),
			effort({
				sessionId: 's3',
				distanceM: 12_000,
				achievedAt: new Date('2030-01-15T08:00:00Z'),
			}),
			effort({
				sessionId: 's2',
				distanceM: 14_000,
				achievedAt: new Date('2030-02-01T08:00:00Z'),
			}),
		])
		// The record (14k) beat the farthest effort that predated it (12k).
		expect(records[0]).toMatchObject({
			value: 14_000,
			previousValue: 12_000,
			delta: 2_000,
		})
	})

	test('previous best ignores later, shorter efforts — a debut record reads as a debut', () => {
		const records = detectPersonalRecords([
			// The farthest run is the very first one; everything after is shorter.
			effort({
				sessionId: 'debut',
				distanceM: 21_000,
				achievedAt: new Date('2030-01-01T08:00:00Z'),
			}),
			effort({
				sessionId: 'later-short',
				distanceM: 8_000,
				achievedAt: new Date('2030-02-01T08:00:00Z'),
			}),
		])
		expect(records[0]).toMatchObject({
			value: 21_000,
			sessionId: 'debut',
			previousValue: null,
			delta: null,
		})
	})

	test('a single qualifying effort has no previous best (delta null, not zero)', () => {
		const records = detectPersonalRecords([effort({ distanceM: 9_000 })])
		expect(records[0]).toMatchObject({ previousValue: null, delta: null })
	})

	test('gates out low-confidence efforts (ADR 0008 trust gate)', () => {
		const records = detectPersonalRecords([
			effort({ sessionId: 'trusted', distanceM: 8_000, confidence: 'medium' }),
			effort({ sessionId: 'rpe-only', distanceM: 20_000, confidence: 'low' }),
		])
		// The 20km RPE-only effort is longer but untrustworthy — it must not win,
		// nor count as the previous best.
		expect(records[0]).toMatchObject({
			value: 8_000,
			sessionId: 'trusted',
			previousValue: null,
			delta: null,
		})
	})

	test('gates out efforts with no load confidence', () => {
		expect(detectPersonalRecords([effort({ confidence: null })])).toEqual([])
	})

	test('ignores efforts that recorded no distance (e.g. strength)', () => {
		expect(
			detectPersonalRecords([
				effort({ discipline: 'strength', distanceM: null }),
				effort({ discipline: 'run', distanceM: 0 }),
			]),
		).toEqual([])
	})

	test('ignores efforts in unknown disciplines', () => {
		expect(
			detectPersonalRecords([effort({ discipline: 'yoga', distanceM: 3_000 })]),
		).toEqual([])
	})

	test('breaks ties on the earliest effort — the first to reach the distance holds it', () => {
		const records = detectPersonalRecords([
			effort({
				sessionId: 'later',
				distanceM: 10_000,
				achievedAt: new Date('2030-02-01T08:00:00Z'),
			}),
			effort({
				sessionId: 'earlier',
				distanceM: 10_000,
				achievedAt: new Date('2030-01-01T08:00:00Z'),
			}),
		])
		// Tied distance ⇒ the earlier effort holds the record, and a tie is not an
		// improvement (no fabricated positive delta).
		expect(records[0]).toMatchObject({
			sessionId: 'earlier',
			previousValue: null,
			delta: null,
		})
	})
})
