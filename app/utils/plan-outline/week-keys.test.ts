import { describe, expect, test } from 'vitest'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'

describe('week keys', () => {
	test('counts whole weeks forward from the plan start', () => {
		expect(weekIndexOf('2026-03-02', '2026-03-02')).toBe(0)
		expect(weekIndexOf('2026-03-02', '2026-03-09')).toBe(1)
		expect(weekIndexOf('2026-03-02', '2026-05-18')).toBe(11)
	})

	test('a week before the plan opens is negative, never clamped', () => {
		expect(weekIndexOf('2026-03-02', '2026-02-23')).toBe(-1)
	})

	test('round-trips an index back to its Monday', () => {
		expect(weekKeyAt('2026-03-02', 0)).toBe('2026-03-02')
		expect(weekKeyAt('2026-03-02', 11)).toBe('2026-05-18')
	})

	test('crosses a daylight-saving boundary without drifting a day', () => {
		// Europe/Oslo moves to summer time on 2026-03-29. Week keys are plain date
		// strings, so the count stays whole weeks either side of it.
		expect(weekIndexOf('2026-03-23', '2026-03-30')).toBe(1)
		expect(weekKeyAt('2026-03-23', 1)).toBe('2026-03-30')
	})
})
