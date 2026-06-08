import { expect, test } from 'vitest'
import { trainingWeekBoundsUTC } from './week-window.ts'

// The training week is a calendar Monday–Sunday window (ADR 0019, #119),
// evaluated in the Athlete Timezone.

test('bounds span Monday 00:00 to Sunday 23:59:59.999 in UTC', () => {
	// Wednesday 2026-06-10 12:00 UTC → Mon 2026-06-08 .. Sun 2026-06-14.
	const { start, end } = trainingWeekBoundsUTC(
		new Date('2026-06-10T12:00:00.000Z'),
		'UTC',
	)
	expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-14T23:59:59.999Z')
})

test('a Monday belongs to the week it opens, not the prior one', () => {
	const { start, end } = trainingWeekBoundsUTC(
		new Date('2026-06-08T00:30:00.000Z'),
		'UTC',
	)
	expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-14T23:59:59.999Z')
})

test('a Sunday belongs to the week it closes', () => {
	const { start, end } = trainingWeekBoundsUTC(
		new Date('2026-06-14T23:00:00.000Z'),
		'UTC',
	)
	expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-14T23:59:59.999Z')
})

test('the week is evaluated in the athlete timezone, not UTC', () => {
	// 2026-06-08T02:00Z is Monday in UTC, but still Sunday 2026-06-07 in
	// New York (UTC-4 in June) — so the athlete is in the *previous* week:
	// Mon 2026-06-01 .. Sun 2026-06-07, with bounds shifted +4h into UTC.
	const { start, end } = trainingWeekBoundsUTC(
		new Date('2026-06-08T02:00:00.000Z'),
		'America/New_York',
	)
	expect(start.toISOString()).toBe('2026-06-01T04:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-08T03:59:59.999Z')
})
