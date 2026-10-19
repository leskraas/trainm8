import { expect, test } from 'vitest'
import {
	clashesIn,
	liftingDaysFor,
	placingClashes,
	readDays,
	type PlacedSession,
} from './day-rule.ts'
import { type PatternWeekday } from './week-pattern.ts'

// The cross-track day rule (#589, ADR 0104): one reading of a laid week across
// every track and Simple Activity, Monday first, and why a session placed on a
// day clashes. Weekdays here are the Week Pattern's: 0 is Monday, 6 Sunday.

const MON = 0
const TUE = 1
const WED = 2
const THU = 3
const FRI = 4
const SAT = 5
const SUN = 6

const ALL_DAYS: PatternWeekday[] = [MON, TUE, WED, THU, FRI, SAT, SUN]

function rolig(weekday: PatternWeekday): PlacedSession {
	return { weekday, kind: 'session', effort: 'rolig' }
}
function middels(weekday: PatternWeekday): PlacedSession {
	return { weekday, kind: 'session', effort: 'middels' }
}
function hard(weekday: PatternWeekday): PlacedSession {
	return { weekday, kind: 'session', effort: 'hard' }
}
function long(weekday: PatternWeekday): PlacedSession {
	return { weekday, kind: 'session', effort: 'rolig', long: true }
}
function lifting(weekday: PatternWeekday): PlacedSession {
	return { weekday, kind: 'lifting' }
}

test('lifting on a hard day clashes', () => {
	expect(placingClashes([hard(TUE)], lifting(TUE))).toEqual([
		{ reason: 'lifting-on-hard-day', weekday: TUE },
	])
	// …whichever of the two is placed second.
	expect(placingClashes([lifting(TUE)], hard(TUE))).toEqual([
		{ reason: 'lifting-on-hard-day', weekday: TUE },
	])
})

test('lifting the day before a hard day clashes', () => {
	expect(placingClashes([hard(WED)], lifting(TUE))).toEqual([
		{ reason: 'lifting-before-hard-day', weekday: TUE },
	])
	expect(placingClashes([hard(WED)], lifting(THU))).toEqual([])
})

test('lifting on Sunday is the day before a hard Monday', () => {
	expect(placingClashes([hard(MON)], lifting(SUN))).toEqual([
		{ reason: 'lifting-before-hard-day', weekday: SUN },
	])
})

test('lifting on the long day clashes', () => {
	expect(placingClashes([long(SUN)], lifting(SUN))).toEqual([
		{ reason: 'lifting-on-long-day', weekday: SUN },
	])
})

test('two hard days in a row clash, named by the first of them', () => {
	expect(placingClashes([hard(TUE)], hard(WED))).toEqual([
		{ reason: 'hard-days-in-a-row', weekday: TUE },
	])
	expect(placingClashes([hard(TUE)], hard(MON))).toEqual([
		{ reason: 'hard-days-in-a-row', weekday: MON },
	])
	expect(placingClashes([hard(TUE)], hard(THU))).toEqual([])
})

test('a hard Sunday and a hard Monday are two hard days in a row', () => {
	expect(placingClashes([hard(MON)], hard(SUN))).toEqual([
		{ reason: 'hard-days-in-a-row', weekday: SUN },
	])
})

test('two hard sessions on one day clash', () => {
	expect(placingClashes([hard(TUE)], hard(TUE))).toEqual([
		{ reason: 'two-hard-sessions', weekday: TUE },
	])
	// A third hard session there clashes as well; the day was already wrong.
	expect(placingClashes([hard(TUE), hard(TUE)], hard(TUE))).toEqual([
		{ reason: 'two-hard-sessions', weekday: TUE },
	])
})

test('two long sessions on one day clash', () => {
	expect(placingClashes([long(SUN)], long(SUN))).toEqual([
		{ reason: 'two-long-sessions', weekday: SUN },
	])
})

test('a middels Simple Activity makes a hard day', () => {
	expect(readDays([middels(SAT)])[SAT]).toEqual({
		weekday: SAT,
		effort: 'middels',
		hard: true,
		long: false,
		lifting: false,
	})
	expect(placingClashes([middels(SAT)], lifting(FRI))).toEqual([
		{ reason: 'lifting-before-hard-day', weekday: FRI },
	])
})

test('a rolig session clashes with nothing but the day before a hard day', () => {
	const week = [hard(TUE), lifting(TUE), long(SUN)]
	expect(placingClashes(week, rolig(TUE))).toEqual([])
	expect(placingClashes(week, rolig(SUN))).toEqual([])
	expect(placingClashes(week, rolig(WED))).toEqual([])
})

test('a rolig session placed the day before a hard day clashes (spec #588 story 28)', () => {
	expect(placingClashes([hard(TUE)], rolig(MON))).toEqual([
		{ reason: 'easy-before-hard-day', weekday: MON },
	])
	expect(placingClashes([middels(MON)], long(SUN))).toEqual([
		{ reason: 'easy-before-hard-day', weekday: SUN },
	])
})

test('a hard session placed the day after a rolig one does not clash for it', () => {
	expect(placingClashes([rolig(MON)], hard(TUE))).toEqual([])
})

test('a laid week does not read an easy day before a hard day as a clash', () => {
	// Every week has one: it is a placing reason, for a session being moved.
	expect(clashesIn([rolig(MON), hard(TUE), rolig(WED)])).toEqual([])
})

test('a laid week reads every clash in it, Monday first', () => {
	expect(
		clashesIn([
			lifting(MON),
			hard(TUE),
			hard(WED),
			hard(WED),
			long(SUN),
			long(SUN),
			lifting(SUN),
		]),
	).toEqual([
		{ reason: 'lifting-before-hard-day', weekday: MON },
		{ reason: 'hard-days-in-a-row', weekday: TUE },
		{ reason: 'two-hard-sessions', weekday: WED },
		{ reason: 'lifting-on-long-day', weekday: SUN },
		{ reason: 'two-long-sessions', weekday: SUN },
	])
})

// The lifting-day ordering of ADR 0103 §2, kept by ADR 0104.

test('lifting days avoid hard days, then the day before one, then the long day', () => {
	// Monday and Wednesday are each the day before a hard day, Sunday is long.
	expect(
		liftingDaysFor(ALL_DAYS, [hard(TUE), hard(THU), long(SUN)], 2),
	).toEqual([FRI, SAT])
})

test('middling days keep lifting off them too', () => {
	expect(
		liftingDaysFor([MON, TUE, FRI], [middels(TUE), rolig(FRI)], 1),
	).toEqual([FRI])
})

test('lifting days lie as far apart as they can, then the earliest', () => {
	expect(liftingDaysFor(ALL_DAYS, [hard(WED), long(SUN)], 2)).toEqual([
		MON,
		THU,
	])
})

test('lifting lands on a hard day only when nothing else is left', () => {
	expect(
		liftingDaysFor([TUE, THU, SUN], [hard(TUE), hard(THU), long(SUN)], 3),
	).toEqual([TUE, THU, SUN])
})

test('one lift a day at most: fewer days than lifts lift once on each', () => {
	expect(liftingDaysFor([MON, WED], [], 3)).toEqual([MON, WED])
	expect(liftingDaysFor([MON, WED], [], 0)).toEqual([])
})

test('a day that already lifts is not picked again', () => {
	expect(
		liftingDaysFor(ALL_DAYS, [lifting(MON), hard(WED), long(SUN)], 1),
	).toEqual([THU])
})
