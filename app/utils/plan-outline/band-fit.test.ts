import { expect, test } from 'vitest'
import {
	bandFitWarnings,
	type BandFitSegment,
	type BandFitSession,
} from './band-fit.ts'

function segment(
	startWeekIndex: number,
	weeks: number,
	goal: BandFitSegment['goal'],
): BandFitSegment {
	return { startWeekIndex, weeks, goal }
}

function session(
	sessionId: string,
	weekIndex: number,
	...pct1RMs: number[]
): BandFitSession {
	return { sessionId, weekIndex, pct1RMs }
}

test('a session below its segment’s derived band warns — ADR 0042 §9’s own example', () => {
	// 60% inside a `maximal-strength` segment, the case ADR 0047 §3 names.
	expect(
		bandFitWarnings(
			[segment(0, 4, 'maximal-strength')],
			[session('s1', 1, 60, 85)],
		),
	).toEqual([
		{
			sessionId: 's1',
			weekIndex: 1,
			goal: 'maximal-strength',
			band: { minPct1RM: 80, maxPct1RM: 100 },
			outsidePct1RMs: [60],
		},
	])
})

test('a session above the band warns too — the band is bounded at both ends', () => {
	const [warning] = bandFitWarnings(
		[segment(0, 4, 'power')],
		[session('s1', 0, 90)],
	)

	expect(warning?.outsidePct1RMs).toEqual([90])
	expect(warning?.band).toEqual({ minPct1RM: 30, maxPct1RM: 70 })
})

test('a session sitting on a band edge is inside it', () => {
	// Both ends inclusive: the figures are a convention read off position stands,
	// not a threshold with a consequence at it (`isOutsideBand`).
	expect(
		bandFitWarnings(
			[segment(0, 4, 'maximal-strength')],
			[session('s1', 0, 80, 100)],
		),
	).toEqual([])
})

test('a session in a gap between strength segments has no band to be outside of', () => {
	expect(
		bandFitWarnings(
			[segment(0, 2, 'maximal-strength'), segment(4, 2, 'maximal-strength')],
			[session('s1', 2, 40)],
		),
	).toEqual([])
})

test('a segment that authors no Strength Goal derives no band, so nothing can miss it', () => {
	expect(
		bandFitWarnings([segment(0, 4, null)], [session('s1', 1, 20)]),
	).toEqual([])
})

test('a session whose sets are all priced in kilograms carries no %1RM to check', () => {
	// `weightKg` and `pct1RM` are mutually exclusive on `ExerciseSet`, so a session
	// loaded in kg simply has nothing on this axis — silence, never a guess.
	expect(bandFitWarnings([segment(0, 4, 'power')], [session('s1', 0)])).toEqual(
		[],
	)
})

test('the %1RMs outside the band come back distinct and ascending', () => {
	// A block of five sets at 60% is one thing wrong with the session, not five.
	const [warning] = bandFitWarnings(
		[segment(0, 4, 'maximal-strength')],
		[session('s1', 0, 75, 60, 60, 85, 75)],
	)

	expect(warning?.outsidePct1RMs).toEqual([60, 75])
})

test('two strength segments holding one week resolve to the later-opening one', () => {
	// The same tie-break `strengthWeekTarget` uses, so an overlap the authoring
	// service refuses can never be read two ways.
	const [warning] = bandFitWarnings(
		[segment(2, 4, 'power'), segment(0, 4, 'maximal-strength')],
		[session('s1', 3, 90)],
	)

	expect(warning?.goal).toBe('power')
})

test('every session that misses warns, in the order the sessions arrive', () => {
	const warnings = bandFitWarnings(
		[segment(0, 4, 'hypertrophy')],
		[session('a', 0, 50), session('b', 1, 75), session('c', 2, 95)],
	)

	expect(warnings.map((warning) => warning.sessionId)).toEqual(['a', 'c'])
})

test('the band warning carries the session, the band and no wording', () => {
	const [warning] = bandFitWarnings(
		[segment(0, 1, 'hypertrophy')],
		[session('s1', 0, 40)],
	)

	expect(Object.keys(warning!).sort()).toEqual([
		'band',
		'goal',
		'outsidePct1RMs',
		'sessionId',
		'weekIndex',
	])
})
