import { expect, test } from 'vitest'
import { buildLoadCurve } from './load-curve.ts'

test('buildLoadCurve: array-in/array-out, derives CTL/ATL/TSB per day', () => {
	const curve = buildLoadCurve(
		[
			{ date: '2026-01-01', tssTotal: 100, tssByDiscipline: { run: 100 } },
			{ date: '2026-01-02', tssTotal: 0, tssByDiscipline: {} },
			{ date: '2026-01-03', tssTotal: 200, tssByDiscipline: { bike: 200 } },
		],
		{ ctl: 0, atl: 0 },
	)

	expect(curve).toHaveLength(3)

	// Day 0: CTL = 100/42, ATL = 100/7, TSB = 0-0 = 0
	expect(curve[0]!.date).toBe('2026-01-01')
	expect(curve[0]!.tssTotal).toBe(100)
	expect(curve[0]!.tssByDiscipline).toEqual({ run: 100 })
	expect(curve[0]!.ctl).toBeCloseTo(100 / 42, 4)
	expect(curve[0]!.atl).toBeCloseTo(100 / 7, 4)
	expect(curve[0]!.tsb).toBe(0)

	// Each day's TSB is yesterday's CTL - yesterday's ATL
	expect(curve[1]!.tsb).toBeCloseTo(curve[0]!.ctl - curve[0]!.atl, 4)
	expect(curve[2]!.tsb).toBeCloseTo(curve[1]!.ctl - curve[1]!.atl, 4)
})

test('buildLoadCurve: anchor carries prior CTL/ATL forward', () => {
	const anchored = buildLoadCurve(
		[{ date: '2026-01-02', tssTotal: 100, tssByDiscipline: { run: 100 } }],
		{ ctl: 50, atl: 30 },
	)

	// Continues from the anchor rather than from zero.
	expect(anchored[0]!.ctl).toBeCloseTo(50 + (100 - 50) / 42, 4)
	expect(anchored[0]!.atl).toBeCloseTo(30 + (100 - 30) / 7, 4)
	expect(anchored[0]!.tsb).toBeCloseTo(50 - 30, 4)
})

test('buildLoadCurve: empty-day gaps decay CTL/ATL toward zero', () => {
	const curve = buildLoadCurve(
		[
			{ date: '2026-01-01', tssTotal: 0, tssByDiscipline: {} },
			{ date: '2026-01-02', tssTotal: 0, tssByDiscipline: {} },
		],
		{ ctl: 42, atl: 7 },
	)

	// CTL_day0 = 42 + (0 - 42)/42 = 41; ATL_day0 = 7 + (0 - 7)/7 = 6
	expect(curve[0]!.ctl).toBeCloseTo(41, 4)
	expect(curve[0]!.atl).toBeCloseTo(6, 4)
	// Continues decaying on the next empty day.
	expect(curve[1]!.ctl).toBeCloseTo(41 + (0 - 41) / 42, 4)
	expect(curve[1]!.atl).toBeCloseTo(6 + (0 - 6) / 7, 4)
})

test('buildLoadCurve: empty input returns empty series', () => {
	expect(buildLoadCurve([], { ctl: 10, atl: 5 })).toEqual([])
})
