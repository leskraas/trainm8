import { expect, test } from 'vitest'
import {
	dayBoundsUTC,
	localDate,
	weekBoundsUTC,
	weekMonday,
} from './athlete-calendar.ts'

// The Athlete Calendar is the single source of truth for "which calendar day /
// Training Week does this instant belong to, in the Athlete Timezone", and for
// the UTC bounds of a local day / week. Canonical day-bounds math is the true
// UTC instant of local midnight (not local-date-reinterpreted-as-UTC).

// ── localDate ──────────────────────────────────────────────────────────────

test('localDate: formats an instant as YYYY-MM-DD in the timezone', () => {
	expect(localDate(new Date('2026-06-10T12:00:00.000Z'), 'UTC')).toBe(
		'2026-06-10',
	)
})

test('localDate: a late-night UTC instant is the next day far-east', () => {
	// 22:00Z is 09:00 next day in Kiritimati (UTC+14).
	expect(
		localDate(new Date('2026-06-10T22:00:00.000Z'), 'Pacific/Kiritimati'),
	).toBe('2026-06-11')
})

test('localDate: an early-morning UTC instant is the previous day far-west', () => {
	// 02:00Z is 15:00 the previous day in Niue (UTC-11).
	expect(localDate(new Date('2026-06-10T02:00:00.000Z'), 'Pacific/Niue')).toBe(
		'2026-06-09',
	)
})

// ── dayBoundsUTC ─────────────────────────────────────────────────────────────

test('dayBoundsUTC: UTC day is plain midnight-to-midnight', () => {
	const { start, end } = dayBoundsUTC('2026-06-10', 'UTC')
	expect(start.toISOString()).toBe('2026-06-10T00:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-10T23:59:59.999Z')
})

test('dayBoundsUTC: non-UTC bounds are the true UTC instant of local midnight', () => {
	// Sydney is UTC+10 (no DST) in June. Local midnight 2026-06-10T00:00 +10 →
	// 2026-06-09T14:00:00Z; the day ends 1ms before the next local midnight.
	const { start, end } = dayBoundsUTC('2026-06-10', 'Australia/Sydney')
	expect(start.toISOString()).toBe('2026-06-09T14:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-10T13:59:59.999Z')
})

test('dayBoundsUTC: far-east zone (Kiritimati, UTC+14)', () => {
	const { start } = dayBoundsUTC('2026-06-10', 'Pacific/Kiritimati')
	expect(start.toISOString()).toBe('2026-06-09T10:00:00.000Z')
})

test('dayBoundsUTC: far-west zone (Niue, UTC-11)', () => {
	const { start } = dayBoundsUTC('2026-06-10', 'Pacific/Niue')
	expect(start.toISOString()).toBe('2026-06-10T11:00:00.000Z')
})

test('dayBoundsUTC: DST spring-forward day starts at local EST midnight', () => {
	// America/New_York springs forward 2026-03-08 02:00 EST→EDT. Local midnight
	// is still EST (UTC-5) → 05:00Z; the day is only 23h, ending at next local
	// midnight (EDT, UTC-4) minus 1ms.
	const { start, end } = dayBoundsUTC('2026-03-08', 'America/New_York')
	expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z')
	expect(end.toISOString()).toBe('2026-03-09T03:59:59.999Z')
})

test('dayBoundsUTC: DST fall-back day starts at local EDT midnight', () => {
	// America/New_York falls back 2026-11-01 02:00 EDT→EST. Local midnight is
	// still EDT (UTC-4) → 04:00Z; the day is 25h.
	const { start, end } = dayBoundsUTC('2026-11-01', 'America/New_York')
	expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z')
	expect(end.toISOString()).toBe('2026-11-02T04:59:59.999Z')
})

test('dayBoundsUTC: year boundary in a non-UTC zone', () => {
	// Sydney UTC+11 in December (DST). Local midnight 2027-01-01 +11 →
	// 2026-12-31T13:00:00Z.
	const { start } = dayBoundsUTC('2027-01-01', 'Australia/Sydney')
	expect(start.toISOString()).toBe('2026-12-31T13:00:00.000Z')
})

// ── weekBoundsUTC ────────────────────────────────────────────────────────────

test('weekBoundsUTC: Monday 00:00 to Sunday 23:59:59.999 in UTC', () => {
	const { start, end } = weekBoundsUTC(
		new Date('2026-06-10T12:00:00.000Z'),
		'UTC',
	)
	expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-14T23:59:59.999Z')
})

test('weekBoundsUTC: a Monday belongs to the week it opens', () => {
	const { start } = weekBoundsUTC(new Date('2026-06-08T00:30:00.000Z'), 'UTC')
	expect(start.toISOString()).toBe('2026-06-08T00:00:00.000Z')
})

test('weekBoundsUTC: a Sunday belongs to the week it closes', () => {
	const { end } = weekBoundsUTC(new Date('2026-06-14T23:00:00.000Z'), 'UTC')
	expect(end.toISOString()).toBe('2026-06-14T23:59:59.999Z')
})

test('weekBoundsUTC: evaluated in the athlete timezone, not UTC', () => {
	// 2026-06-08T02:00Z is Monday in UTC but still Sunday 2026-06-07 in New York
	// (UTC-4 in June) → previous week, Mon 2026-06-01 .. Sun 2026-06-07.
	const { start, end } = weekBoundsUTC(
		new Date('2026-06-08T02:00:00.000Z'),
		'America/New_York',
	)
	expect(start.toISOString()).toBe('2026-06-01T04:00:00.000Z')
	expect(end.toISOString()).toBe('2026-06-08T03:59:59.999Z')
})

// ── weekMonday ───────────────────────────────────────────────────────────────

test('weekMonday: a mid-week instant keys to its Monday', () => {
	expect(weekMonday(new Date('2026-06-10T12:00:00.000Z'), 'UTC')).toBe(
		'2026-06-08',
	)
})

test('weekMonday: a Sunday keys to the Monday that opened its week', () => {
	expect(weekMonday(new Date('2026-06-14T23:00:00.000Z'), 'UTC')).toBe(
		'2026-06-08',
	)
})

test('weekMonday: evaluated in the athlete timezone, not UTC', () => {
	// 2026-06-08T02:00Z is Monday in UTC but still Sunday in New York (UTC-4 in
	// June) → the previous week's Monday.
	expect(
		weekMonday(new Date('2026-06-08T02:00:00.000Z'), 'America/New_York'),
	).toBe('2026-06-01')
})

// ── regression: the bug this module fixes (#122) ─────────────────────────────

test('a single instant maps to the same calendar day under day-bounds and week-bounds', () => {
	// The bug: Load Snapshot day-bucketing and Weekly Plan Adherence week-
	// bucketing landed a non-UTC athlete's session in different days/weeks.
	// 2026-06-10T13:30:00Z is 2026-06-10 23:30 in Sydney (UTC+10) — late-night
	// local. It must fall inside both that local day's bounds and that week's.
	const tz = 'Australia/Sydney'
	const instant = new Date('2026-06-10T13:30:00.000Z')

	const day = localDate(instant, tz)
	expect(day).toBe('2026-06-10')

	const { start: dayStart, end: dayEnd } = dayBoundsUTC(day, tz)
	expect(instant >= dayStart && instant <= dayEnd).toBe(true)

	const { start: weekStart, end: weekEnd } = weekBoundsUTC(instant, tz)
	expect(instant >= weekStart && instant <= weekEnd).toBe(true)
})
