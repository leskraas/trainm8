import { describe, expect, test } from 'vitest'
import {
	TSS_PER_PLANNED_HOUR,
	projectFitnessToRace,
	type ProjectionPhase,
} from './fitness-projection.ts'

const DAY = 24 * 60 * 60 * 1000

// Anchor on a fixed UTC day; race a whole number of days out. Times are chosen
// off midnight to prove the projection snaps both ends to their UTC day.
const ANCHOR = new Date('2030-01-01T09:00:00Z')
const raceInDays = (n: number) => new Date(ANCHOR.getTime() + n * DAY)

describe('projectFitnessToRace', () => {
	test('opens at the anchor day and CTL, then steps one day at a time to the race', () => {
		const points = projectFitnessToRace({
			phases: [{ weeks: 2, weeklyLoadHours: 7 }],
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
		// 7 h/week × 60 TSS/h ÷ 7 days = 60 TSS/day; anchored at CTL 60 ⇒ flat.
		const points = projectFitnessToRace({
			phases: [{ weeks: 4, weeklyLoadHours: 7 }],
			anchorCtl: 60,
			anchorDate: ANCHOR,
			eventDate: raceInDays(14),
		})!
		for (const p of points) expect(p.ctl).toBeCloseTo(60, 6)
	})

	test('ramps CTL toward a higher prescribed load via the 42-day EWMA', () => {
		// 14 h/week × 60 ÷ 7 = 120 TSS/day; from CTL 60 the first step is
		// 60 + (120 − 60)/42 ≈ 61.43, then strictly increasing toward 120.
		const points = projectFitnessToRace({
			phases: [{ weeks: 8, weeklyLoadHours: 14 }],
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

	test('a taper phase near the race pulls fitness back down', () => {
		// Build (high load) then a final rest week (0 h) — the tail must decline.
		const points = projectFitnessToRace({
			phases: [
				{ weeks: 3, weeklyLoadHours: 14 },
				{ weeks: 1, weeklyLoadHours: 0 },
			],
			anchorCtl: 80,
			anchorDate: ANCHOR,
			eventDate: raceInDays(28),
		})!
		const peak = Math.max(...points.map((p) => p.ctl))
		expect(points.at(-1)!.ctl).toBeLessThan(peak)
	})

	test('honours a custom TSS-per-hour conversion', () => {
		const points = projectFitnessToRace({
			phases: [{ weeks: 2, weeklyLoadHours: 7 }],
			anchorCtl: 100,
			anchorDate: ANCHOR,
			eventDate: raceInDays(10),
			tssPerHour: 100, // 7 × 100 ÷ 7 = 100 TSS/day ⇒ flat at 100
		})!
		for (const p of points) expect(p.ctl).toBeCloseTo(100, 6)
	})

	test('exposes a documented default conversion factor', () => {
		expect(TSS_PER_PLANNED_HOUR).toBe(60)
	})

	test('is null without phases (no weekly-load pattern to replay)', () => {
		expect(
			projectFitnessToRace({
				phases: [],
				anchorCtl: 60,
				anchorDate: ANCHOR,
				eventDate: raceInDays(14),
			}),
		).toBeNull()
	})

	test('is null when any phase is missing its weekly load (no guessing)', () => {
		const phases: ProjectionPhase[] = [
			{ weeks: 2, weeklyLoadHours: 7 },
			{ weeks: 2, weeklyLoadHours: null },
		]
		expect(
			projectFitnessToRace({
				phases,
				anchorCtl: 60,
				anchorDate: ANCHOR,
				eventDate: raceInDays(28),
			}),
		).toBeNull()
	})

	test('is null when the race is on or before the anchor day (nothing ahead)', () => {
		expect(
			projectFitnessToRace({
				phases: [{ weeks: 2, weeklyLoadHours: 7 }],
				anchorCtl: 60,
				anchorDate: ANCHOR,
				eventDate: ANCHOR, // same day
			}),
		).toBeNull()
	})
})
