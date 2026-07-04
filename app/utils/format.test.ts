import { expect, test } from 'vitest'
import {
	formatClock,
	formatClockHms,
	formatDateTime,
	formatDayOfMonth,
	formatDistance,
	formatDuration,
	formatFullDate,
	formatInteger,
	formatLongDate,
	formatMediumDate,
	formatMonthDay,
	formatPace,
	formatPaceRange,
	formatShortDate,
	formatSpeed,
	formatSwimPace,
	formatTime,
	formatTss,
	formatWeekdayLong,
	formatWeekdayShort,
	parseClock,
	roundTss,
} from './format.ts'

// ---------------------------------------------------------------------------
// TSS — integers everywhere (#172): the Dashboard bug was raw floats like
// 120.6488888888889 rendered directly.
// ---------------------------------------------------------------------------

test('formatTss rounds raw float TSS to a whole number', () => {
	expect(formatTss(120.6488888888889)).toBe('121')
	expect(formatTss(120.4)).toBe('120')
	expect(formatTss(0)).toBe('0')
})

test('roundTss returns an integer for bar math and view-models', () => {
	expect(roundTss(120.6488888888889)).toBe(121)
	expect(Number.isInteger(roundTss(87.3333))).toBe(true)
})

test('formatInteger adds thousands separators', () => {
	expect(formatInteger(1500)).toBe('1,500')
	expect(formatInteger(950.7)).toBe('951')
})

// ---------------------------------------------------------------------------
// Clock & duration
// ---------------------------------------------------------------------------

test('formatClock renders m:ss', () => {
	expect(formatClock(240)).toBe('4:00')
	expect(formatClock(95)).toBe('1:35')
	expect(formatClock(59)).toBe('0:59')
})

test('formatClockHms renders h:mm:ss', () => {
	expect(formatClockHms(12600)).toBe('3:30:00')
	expect(formatClockHms(3661)).toBe('1:01:01')
})

test('parseClock is the inverse of formatClock', () => {
	expect(parseClock('4:00')).toBe(240)
	expect(parseClock('1:35')).toBe(95)
	expect(parseClock(' 4:05 ')).toBe(245)
	expect(parseClock(formatClock(272))).toBe(272)
})

test('parseClock accepts h:mm:ss', () => {
	expect(parseClock('3:30:00')).toBe(12600)
	expect(parseClock(formatClockHms(3661))).toBe(3661)
})

test('parseClock rejects malformed input', () => {
	expect(parseClock('')).toBeNull()
	expect(parseClock('240')).toBeNull()
	expect(parseClock('4:5')).toBeNull() // seconds must be two digits
	expect(parseClock('4:65')).toBeNull() // seconds out of range
	expect(parseClock('1:75:00')).toBeNull() // minutes out of range with hours
	expect(parseClock('abc')).toBeNull()
})

test('formatDuration renders h/min/s the way athletes read it', () => {
	expect(formatDuration(3900)).toBe('1 h 5 min')
	expect(formatDuration(3600)).toBe('1 h')
	expect(formatDuration(2700)).toBe('45 min')
	expect(formatDuration(90)).toBe('1 min 30 s')
	expect(formatDuration(30)).toBe('30 s')
})

// ---------------------------------------------------------------------------
// Distance, pace, speed
// ---------------------------------------------------------------------------

test('formatDistance renders km above 1000 m', () => {
	expect(formatDistance(21100)).toBe('21.1 km')
	expect(formatDistance(5000)).toBe('5 km')
	expect(formatDistance(400)).toBe('400 m')
})

test('formatPace and formatSwimPace carry their units', () => {
	expect(formatPace(240)).toBe('4:00 /km')
	expect(formatSwimPace(95)).toBe('1:35 /100m')
})

test('formatPaceRange renders a single pace or a range', () => {
	expect(formatPaceRange(240)).toBe('4:00 /km')
	expect(formatPaceRange(245, 255)).toBe('4:05–4:15 /km')
})

test('formatSpeed renders km/h with one decimal', () => {
	expect(formatSpeed(10)).toBe('36.0 km/h')
})

// ---------------------------------------------------------------------------
// Dates & times — locale fixed, timezone explicit. The same instant must
// format identically no matter where the code runs (server UTC vs client),
// which is what fixes the Event-page hydration mismatch.
// ---------------------------------------------------------------------------

const instant = new Date('2026-07-03T22:30:00Z') // Fri 22:30 UTC = Sat 00:30 Oslo

test('formatTime is a 24h clock in the given timezone', () => {
	expect(formatTime(instant, 'UTC')).toBe('22:30')
	expect(formatTime(instant, 'Europe/Oslo')).toBe('00:30')
})

test('dates resolve the calendar day in the given timezone', () => {
	expect(formatShortDate(instant, 'UTC')).toBe('Fri 3 Jul')
	expect(formatShortDate(instant, 'Europe/Oslo')).toBe('Sat 4 Jul')
	expect(formatDayOfMonth(instant, 'UTC')).toBe('3')
	expect(formatDayOfMonth(instant, 'Europe/Oslo')).toBe('4')
})

test('weekday, month-day, and long/medium/full date formats', () => {
	expect(formatWeekdayShort(instant, 'UTC')).toBe('Fri')
	expect(formatWeekdayLong(instant, 'UTC')).toBe('Friday')
	expect(formatMonthDay(instant, 'UTC')).toBe('3 Jul')
	expect(formatLongDate(instant, 'UTC')).toBe('Friday 3 July')
	expect(formatMediumDate(instant, 'UTC')).toBe('3 Jul 2026')
	expect(formatFullDate(instant, 'UTC')).toBe('Friday, 3 July 2026')
})

test('formatDateTime combines date and 24h time', () => {
	expect(formatDateTime(instant, 'Europe/Oslo')).toBe('4 Jul 2026, 00:30')
})
