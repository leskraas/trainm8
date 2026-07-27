import { describe, expect, test } from 'vitest'
import {
	TSS_PER_PLANNED_HOUR,
	plannedWeeklyTss,
	projectFitnessToRace,
} from './fitness-projection.ts'

const DAY = 24 * 60 * 60 * 1000

// Anchor on a fixed UTC day; race a whole number of days out. Times are chosen
// off midnight to prove the projection snaps both ends to their UTC day.
const ANCHOR = new Date('2030-01-01T09:00:00Z')
const raceInDays = (n: number) => new Date(ANCHOR.getTime() + n * DAY)
/** The plan opens on the anchor day, so week 0 is the week being projected. */
const PLAN_START = ANCHOR

/** `n` weeks at the same weekly TSS — the derived series the Outline produces. */
const flat = (weeks: number, tss: number) => Array<number>(weeks).fill(tss)

describe('plannedWeeklyTss', () => {
	test('a TSS-authored track needs no conversion', () => {
		expect(plannedWeeklyTss('tss', 420)).toBe(420)
	})

	test('hours use the one documented assumption', () => {
		expect(plannedWeeklyTss('hours', 7)).toBe(7 * TSS_PER_PLANNED_HOUR)
	})

	test('km and sets are Unavailable, never guessed', () => {
		// Distance→TSS would go through the retired KM_PER_HOUR (ADR 0043 §10), and
		// sets are a different quantity from endurance load (ADR 0041). #385 owns
		// the mix-aware successor.
		expect(plannedWeeklyTss('km', 55)).toBeNull()
		expect(plannedWeeklyTss('sets', 21)).toBeNull()
	})

	test('an unresolved week stays unresolved in every currency', () => {
		expect(plannedWeeklyTss('hours', null)).toBeNull()
		expect(plannedWeeklyTss('tss', null)).toBeNull()
	})

	test('exposes a documented default conversion factor', () => {
		expect(TSS_PER_PLANNED_HOUR).toBe(60)
	})
})

describe('projectFitnessToRace', () => {
	test('opens at the anchor day and CTL, then steps one day at a time to the race', () => {
		const points = projectFitnessToRace({
			weeklyTss: flat(2, 420),
			planStart: PLAN_START,
			anchorCtl: 60,
			anchorDate: ANCHOR,
			eventDate: raceInDays(7),
		})!
		expect(points[0]).toEqual({ date: '2030-01-01', ctl: 60 })
		// Anchor + 7 future days, the last landing exactly on the race day.
		expect(points).toHaveLength(8)
		expect(points.at(-1)!.date).toBe('2030-01-08')
	})

	test('holds steady when the prescribed daily load equals the anchor CTL', () => {
		// 420 TSS/week ÷ 7 days = 60 TSS/day; anchored at CTL 60 ⇒ flat.
		const points = projectFitnessToRace({
			weeklyTss: flat(4, 420),
			planStart: PLAN_START,
			anchorCtl: 60,
			anchorDate: ANCHOR,
			eventDate: raceInDays(14),
		})!
		for (const p of points) expect(p.ctl).toBeCloseTo(60, 6)
	})

	test('ramps CTL toward a higher prescribed load via the 42-day EWMA', () => {
		// 840 TSS/week ÷ 7 = 120 TSS/day; from CTL 60 the first step is
		// 60 + (120 − 60)/42 ≈ 61.43, then strictly increasing toward 120.
		const points = projectFitnessToRace({
			weeklyTss: flat(8, 840),
			planStart: PLAN_START,
			anchorCtl: 60,
			anchorDate: ANCHOR,
			eventDate: raceInDays(20),
		})!
		expect(points[1]!.ctl).toBeCloseTo(60 + 60 / 42, 6)
		for (let i = 2; i < points.length; i++) {
			expect(points[i]!.ctl).toBeGreaterThan(points[i - 1]!.ctl)
		}
		expect(points.at(-1)!.ctl).toBeLessThan(120)
	})

	test('a taper week near the race pulls fitness back down', () => {
		const points = projectFitnessToRace({
			weeklyTss: [...flat(3, 840), 0],
			planStart: PLAN_START,
			anchorCtl: 80,
			anchorDate: ANCHOR,
			eventDate: raceInDays(28),
		})!
		const peak = Math.max(...points.map((p) => p.ctl))
		expect(points.at(-1)!.ctl).toBeLessThan(peak)
	})

	test('replays each week in turn, so a mid-plan cut shows as a dip', () => {
		const points = projectFitnessToRace({
			weeklyTss: [840, 840, 0, 840],
			planStart: PLAN_START,
			anchorCtl: 100,
			anchorDate: ANCHOR,
			eventDate: raceInDays(28),
		})!
		// Day 15 sits in the zero week: CTL must be falling there and rising again
		// by day 28, which a per-phase pattern could not express at all.
		const ctlOn = (day: number) => points[day]!.ctl
		expect(ctlOn(17)).toBeLessThan(ctlOn(15))
		expect(ctlOn(27)).toBeGreaterThan(ctlOn(21))
	})

	test('holds the last week when the plan ends before the Event', () => {
		// A plan authored one week short of race day: the final week's load carries
		// forward rather than the curve stopping or the plan stretching (ADR 0044).
		const points = projectFitnessToRace({
			weeklyTss: flat(1, 420),
			planStart: PLAN_START,
			anchorCtl: 60,
			anchorDate: ANCHOR,
			eventDate: raceInDays(14),
		})!
		expect(points.at(-1)!.date).toBe('2030-01-15')
		for (const p of points) expect(p.ctl).toBeCloseTo(60, 6)
	})

	test('is null without weeks (no load to replay)', () => {
		expect(
			projectFitnessToRace({
				weeklyTss: [],
				planStart: PLAN_START,
				anchorCtl: 60,
				anchorDate: ANCHOR,
				eventDate: raceInDays(14),
			}),
		).toBeNull()
	})

	test('is null when any week is unresolved (no guessing)', () => {
		expect(
			projectFitnessToRace({
				weeklyTss: [420, null, 420, 420],
				planStart: PLAN_START,
				anchorCtl: 60,
				anchorDate: ANCHOR,
				eventDate: raceInDays(28),
			}),
		).toBeNull()
	})

	test('is null when the race is on or before the anchor day (nothing ahead)', () => {
		expect(
			projectFitnessToRace({
				weeklyTss: flat(2, 420),
				planStart: PLAN_START,
				anchorCtl: 60,
				anchorDate: ANCHOR,
				eventDate: ANCHOR, // same day
			}),
		).toBeNull()
	})
})
