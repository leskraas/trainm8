import { expect, test } from 'vitest'
import { type LaterDay, pickNewDay } from './juster.ts'
import { type PlacedSession } from './plan-outline/day-rule.ts'
import { type PatternWeekday } from './plan-outline/week-pattern.ts'

// _Bytt dag_'s day pick (spec #588, ADR 0104 §1): the first later free day
// the cross-track day rule finds no clash on; failing that, today's order
// with the reason. Today is Wednesday; weekdays are the Week Pattern's,
// Monday 0.

const WED = 2
const THU = 3
const FRI = 4
const SAT = 5
const SUN = 6

const KEYS: Record<number, string> = {
	[THU]: '2030-01-03',
	[FRI]: '2030-01-04',
	[SAT]: '2030-01-05',
	[SUN]: '2030-01-06',
}

/** Thursday to Sunday, free unless the week has a session on the day. */
function laterDays(week: readonly PlacedSession[]): LaterDay[] {
	return ([THU, FRI, SAT, SUN] as const).map((weekday) => {
		const on = week.filter((session) => session.weekday === weekday)
		return {
			key: KEYS[weekday]!,
			weekday,
			occupied: on.length > 0,
			openSessionIds: on.map((_, at) => `${weekday}-${at}`),
		}
	})
}

const easyRun = { kind: 'session', effort: 'rolig' } as const
const intervals = { kind: 'session', effort: 'hard' } as const
const lift = { kind: 'lifting' } as const

function hard(weekday: PatternWeekday): PlacedSession {
	return { weekday, kind: 'session', effort: 'hard' }
}
function lifting(weekday: PatternWeekday): PlacedSession {
	return { weekday, kind: 'lifting' }
}

test('Bytt dag moves to the first later free day when it fits', () => {
	expect(pickNewDay(laterDays([]), { week: [], session: easyRun })).toEqual({
		kind: 'move',
		toKey: KEYS[THU],
		clash: null,
	})
})

test('an easy run skips the day before intervals', () => {
	// Friday has the intervals: Thursday is the day before them.
	const week = [hard(FRI)]
	expect(pickNewDay(laterDays(week), { week, session: easyRun })).toEqual({
		kind: 'move',
		toKey: KEYS[SAT],
		clash: null,
	})
})

test('intervals skip the day after a lifting day, and a lifting day is never free', () => {
	const week = [lifting(THU)]
	expect(pickNewDay(laterDays(week), { week, session: intervals })).toEqual({
		kind: 'move',
		toKey: KEYS[SAT],
		clash: null,
	})
})

test('intervals skip a day next to another hard day', () => {
	const week = [hard(WED), hard(FRI)]
	// Thursday sits between two hard days, Saturday after one.
	expect(pickNewDay(laterDays(week), { week, session: intervals })).toEqual({
		kind: 'move',
		toKey: KEYS[SUN],
		clash: null,
	})
})

test('a lift skips the day before intervals', () => {
	const week = [hard(FRI)]
	expect(pickNewDay(laterDays(week), { week, session: lift })).toEqual({
		kind: 'move',
		toKey: KEYS[SAT],
		clash: null,
	})
})

test('when every free day clashes, the first free day is used and the reason returned', () => {
	// Thursday and Saturday are free, and each is the day before intervals.
	const week = [hard(FRI), hard(SUN)]
	expect(pickNewDay(laterDays(week), { week, session: easyRun })).toEqual({
		kind: 'move',
		toKey: KEYS[THU],
		clash: { reason: 'easy-before-hard-day', weekday: THU },
	})
})

test('with no free day, it swaps with the next open session as before, with no reason to give', () => {
	const week = [hard(THU), hard(FRI), hard(SAT), hard(SUN)]
	expect(pickNewDay(laterDays(week), { week, session: easyRun })).toEqual({
		kind: 'swap',
		toKey: KEYS[THU],
		withSessionId: `${THU}-0`,
	})
})

test('with no later day, it is refused', () => {
	expect(pickNewDay([], { week: [], session: easyRun })).toEqual({
		kind: 'refused',
		reason: 'no-later-day',
	})
})

test('the pick is only a day: nothing in it adopts or rewrites the session', () => {
	const week = [hard(FRI), hard(SUN)]
	const pick = pickNewDay(laterDays(week), { week, session: easyRun })
	expect(Object.keys(pick).sort()).toEqual(['clash', 'kind', 'toKey'])
})
