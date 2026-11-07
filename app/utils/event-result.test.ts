import { expect, test } from 'vitest'
import {
	eventDistanceChoiceOf,
	eventDistanceFromChoice,
	eventDistanceFromKm,
	eventDistanceName,
	eventResultFrom,
	eventTakesDistance,
	type EventForResult,
	type RecordingForResult,
} from './event-result.ts'

const START = new Date('2026-04-25T08:00:00Z')
const event = (fields: Partial<EventForResult> = {}): EventForResult => ({
	kind: 'race',
	status: 'completed',
	disciplines: '["run"]',
	distanceM: 10000,
	resultSessionId: 'session',
	...fields,
})
const session = { scheduledAt: START }
const recording = (
	fields: Partial<RecordingForResult> = {},
): RecordingForResult => ({
	id: 'rec',
	discipline: 'run',
	distanceM: 10210,
	startedAt: START,
	// 41:12 on the race clock, pauses included.
	endedAt: new Date(START.getTime() + 2472_000),
	...fields,
})

test('a run race with a distance and a Recording within ±5 % makes a verified result at the Event Distance', () => {
	expect(eventResultFrom(event(), session, recording(), 'UTC')).toEqual({
		kind: 'result',
		result: {
			discipline: 'run',
			// The Event Distance, never the measured 10.21 km: rung 1 matches
			// a Race Anchor to the metre.
			distanceM: 10000,
			timeSec: 2472,
			day: '2026-04-25',
			source: 'race',
			verified: true,
			activityImportId: 'rec',
		},
	})
})

test('the time is the elapsed time, start to end, as a race clock runs', () => {
	// A Recording whose moving time is shorter (a stop at a drinks table)
	// still gives its elapsed time: the rule never reads moving time.
	const verdict = eventResultFrom(
		event(),
		session,
		recording({ endedAt: new Date(START.getTime() + 2600_000) }),
		'UTC',
	)
	expect(verdict).toMatchObject({ kind: 'result', result: { timeSec: 2600 } })
})

test("a time trial's result is a timeTrial", () => {
	expect(
		eventResultFrom(event({ kind: 'time-trial' }), session, recording(), 'UTC'),
	).toMatchObject({ result: { source: 'timeTrial' } })
})

test("the day is the session's day in the athlete's timezone", () => {
	const lateNight = { scheduledAt: new Date('2026-04-25T22:30:00Z') }
	expect(
		eventResultFrom(event(), lateNight, recording(), 'Europe/Oslo'),
	).toMatchObject({ result: { day: '2026-04-26' } })
})

test('±5 % is the edge: 10.5 km makes a result for a 10k, 10.6 km and 9.4 km do not', () => {
	expect(
		eventResultFrom(event(), session, recording({ distanceM: 10500 }), 'UTC')
			.kind,
	).toBe('result')
	expect(
		eventResultFrom(event(), session, recording({ distanceM: 9500 }), 'UTC')
			.kind,
	).toBe('result')
	expect(
		eventResultFrom(event(), session, recording({ distanceM: 11400 }), 'UTC'),
	).toEqual({
		kind: 'missing',
		reason: 'distance-mismatch',
		measuredM: 11400,
		raceDistanceM: 10000,
	})
	expect(
		eventResultFrom(event(), session, recording({ distanceM: 9400 }), 'UTC')
			.kind,
	).toBe('missing')
})

test('an Event that is not a run-only race or time trial makes nothing and asks nothing', () => {
	for (const ineligible of [
		event({ kind: 'fitness-goal' }),
		event({ disciplines: '["run","bike"]' }),
		event({ disciplines: '["bike"]' }),
		event({ status: 'cancelled' }),
		event({ resultSessionId: null }),
	]) {
		expect(eventResultFrom(ineligible, session, recording(), 'UTC')).toEqual({
			kind: 'ineligible',
		})
	}
})

test('a linked run race says why it has no result, in order', () => {
	expect(
		eventResultFrom(event({ distanceM: null }), session, recording(), 'UTC'),
	).toEqual({ kind: 'missing', reason: 'no-distance' })
	expect(eventResultFrom(event(), session, null, 'UTC')).toEqual({
		kind: 'missing',
		reason: 'no-recording',
	})
	expect(
		eventResultFrom(event(), session, recording({ discipline: 'bike' }), 'UTC'),
	).toEqual({ kind: 'missing', reason: 'other-discipline', discipline: 'bike' })
	expect(
		eventResultFrom(event(), session, recording({ distanceM: null }), 'UTC'),
	).toEqual({
		kind: 'missing',
		reason: 'no-recording-distance',
		raceDistanceM: 10000,
	})
})

test('only a run-only race or time trial takes an Event Distance', () => {
	expect(eventTakesDistance('race', ['run'])).toBe(true)
	expect(eventTakesDistance('time-trial', '["run"]')).toBe(true)
	expect(eventTakesDistance('fitness-goal', ['run'])).toBe(false)
	expect(eventTakesDistance('race', ['run', 'swim'])).toBe(false)
	expect(eventTakesDistance('race', [])).toBe(false)
})

test('a km typed equal to a Race Anchor is stored as that anchor', () => {
	expect(eventDistanceFromKm('10')).toBe(10000)
	expect(eventDistanceFromKm('1,5')).toBe(1500)
	expect(eventDistanceFromKm('21,1')).toBe(21097)
	expect(eventDistanceFromKm('21,0975')).toBe(21097)
	expect(eventDistanceFromKm('42,2')).toBe(42195)
	expect(eventDistanceFromKm('42.195')).toBe(42195)
	// Anything else is stored as typed, to the metre.
	expect(eventDistanceFromKm('7,5')).toBe(7500)
	expect(eventDistanceFromKm('10,5')).toBe(10500)
	expect(eventDistanceFromKm('100')).toBe(100000)
})

test('a km outside 1–500 or not a number is refused', () => {
	for (const text of ['', '0,5', '501', '1000', 'ti', '10 km løp', '-5']) {
		expect(eventDistanceFromKm(text)).toBeNull()
	}
})

test('the pills read back to the same metres they post', () => {
	expect(eventDistanceFromChoice('hm', '')).toEqual({
		ok: true,
		distanceM: 21097,
	})
	expect(eventDistanceFromChoice('', '7,5')).toEqual({
		ok: true,
		distanceM: null,
	})
	expect(eventDistanceFromChoice('other', '7,5')).toEqual({
		ok: true,
		distanceM: 7500,
	})
	expect(eventDistanceFromChoice('other', '')).toEqual({ ok: false })
	expect(eventDistanceFromChoice('11k', '')).toEqual({ ok: false })
	expect(eventDistanceChoiceOf(21097)).toEqual({ choice: 'hm', km: '' })
	expect(eventDistanceChoiceOf(7500)).toEqual({ choice: 'other', km: '7,5' })
	expect(eventDistanceChoiceOf(null)).toEqual({ choice: '', km: '' })
})

test('an Event Distance is named by its pill, or in km with a comma', () => {
	expect(eventDistanceName(10000)).toBe('10 km')
	expect(eventDistanceName(42195)).toBe('Maraton')
	expect(eventDistanceName(7500)).toBe('7,5 km')
})
