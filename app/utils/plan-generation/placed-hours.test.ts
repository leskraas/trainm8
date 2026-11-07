import { expect, test } from 'vitest'
import { type PrescribedDuration } from '../prescribed-duration.ts'
import { readPlacedDuration, readPlacedHours } from './placed-hours.ts'

// #473, ADR 0113: a generated week's Placed Hours are a floor of what its placed
// sessions take, read against the Weekly Capacity and stated, never fixed.

const timed = (
	seconds: number,
	overrides: Partial<PrescribedDuration> = {},
): PrescribedDuration => ({
	seconds,
	complete: true,
	estimated: false,
	...overrides,
})

const at = (weekIndex: number, prescribed: PrescribedDuration | null) => ({
	weekIndex,
	prescribed,
})

const runProfile = {
	lthr: null,
	maxHr: null,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 300,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}
const zone = (label: string) => JSON.stringify({ kind: 'zoneLabel', label })

test('with no Weekly Capacity nothing is read, which is no pass', () => {
	expect(
		readPlacedHours({
			weekCount: 1,
			sessions: [at(0, timed(36_000))],
			unfilled: [],
			weeklyCapacityHours: null,
		}),
	).toEqual({ kind: 'unset' })
})

test('a placed session is timed as the session row times it, and an open rest adds nothing', () => {
	// `15 min · 6 × (1 km Z4 + jog back) · 10 min`: the jog back has no time and
	// no pace, so the session is timed without it and is not complete.
	const entry = {
		discipline: 'run',
		blocks: [
			{ sendOff: null, repeatCount: 1, steps: [{ durationSec: 900 }] },
			{
				sendOff: null,
				repeatCount: 6,
				steps: [
					{
						kind: 'cardio',
						intensity: zone('Z4'),
						durationSec: null,
						distanceM: 1000,
					},
					{ kind: 'rest', durationSec: null },
				],
			},
			{ sendOff: null, repeatCount: 1, steps: [{ durationSec: 600 }] },
		],
	}
	const reading = readPlacedDuration(entry, { run: runProfile })
	expect(reading).toEqual({
		seconds: 900 + 6 * 300 + 600,
		complete: false,
		estimated: true,
	})
	// With no threshold pace the distance reps cannot be timed either: the floor
	// is what is left, the warm-up and the cool-down.
	expect(readPlacedDuration(entry, {})).toEqual({
		seconds: 1500,
		complete: false,
		estimated: false,
	})
})

test('a week adds every placed session’s timed part, and is exact only when all were timed end to end', () => {
	const placed = readPlacedHours({
		weekCount: 2,
		sessions: [
			at(0, timed(3600)),
			at(0, timed(5400, { estimated: true })),
			at(1, timed(3600)),
			at(1, timed(1800, { complete: false })),
		],
		unfilled: [],
		weeklyCapacityHours: 10,
	})
	expect(placed).toEqual({
		kind: 'read',
		weeklyCapacityHours: 10,
		weeks: [
			{ hours: 2.5, exact: true, estimated: true },
			{ hours: 1.5, exact: false, estimated: false },
		],
		breaches: [],
	})
})

test('a session no step of which could be timed adds nothing and makes the week a floor', () => {
	const placed = readPlacedHours({
		weekCount: 1,
		sessions: [at(0, timed(3600)), at(0, null)],
		unfilled: [],
		weeklyCapacityHours: 10,
	})
	expect(placed.kind === 'read' && placed.weeks[0]).toEqual({
		hours: 1,
		exact: false,
		estimated: false,
	})
})

test('an unfilled slot makes the week a floor even when every placed session was timed', () => {
	const placed = readPlacedHours({
		weekCount: 1,
		sessions: [at(0, timed(3600))],
		unfilled: [{ weekIndex: 0 }],
		weeklyCapacityHours: 10,
	})
	expect(placed.kind === 'read' && placed.weeks[0]?.exact).toBe(false)
})

test('a week with nothing timed has no figure, and is never a breach', () => {
	const placed = readPlacedHours({
		weekCount: 2,
		sessions: [at(0, null), at(1, timed(10 * 3600))],
		unfilled: [],
		weeklyCapacityHours: 1,
	})
	expect(placed).toMatchObject({
		weeks: [null, { hours: 10 }],
		breaches: [{ fromWeekIndex: 1, toWeekIndex: 1 }],
	})
})

test('a breach is stated only at the precision the athlete reads: 6,04 t is not over 6 t', () => {
	const read = (hours: number) =>
		readPlacedHours({
			weekCount: 1,
			sessions: [at(0, timed(hours * 3600))],
			unfilled: [],
			weeklyCapacityHours: 6,
		})
	expect(read(6.04)).toMatchObject({ breaches: [] })
	expect(read(6)).toMatchObject({ breaches: [] })
	expect(read(6.06)).toMatchObject({
		breaches: [{ fromWeekIndex: 0, toWeekIndex: 0, peakHours: 6.1 }],
	})
})

test('breaching weeks come as spans, ready for the season line', () => {
	const hours = [7, 7, 5, 8, 5]
	const placed = readPlacedHours({
		weekCount: hours.length,
		sessions: hours.map((h, weekIndex) => at(weekIndex, timed(h * 3600))),
		unfilled: [],
		weeklyCapacityHours: 6,
	})
	expect(placed).toMatchObject({
		breaches: [
			{ fromWeekIndex: 0, toWeekIndex: 1 },
			{ fromWeekIndex: 3, toWeekIndex: 3 },
		],
	})
})
