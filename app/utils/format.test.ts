import { expect, test } from 'vitest'
import {
	formatClockDuration,
	formatDate,
	formatDateLong,
	formatDateTime,
	formatDayDate,
	formatDayDateLong,
	formatDayMonth,
	formatDayOfMonth,
	formatDistance,
	formatDuration,
	formatLoad,
	formatMeters,
	formatPace,
	formatPaceClock,
	formatPaceRange,
	formatSigned,
	formatSpeed,
	formatSwimPace,
	formatTime,
	formatTss,
	formatWeekday,
	formatWeekdayShort,
	parseDuration,
	parsePace,
	roundLoad,
} from './format.ts'

// A fixed instant: Saturday 4 July 2026, 12:05 UTC (14:05 in Oslo, DST).
const INSTANT = new Date('2026-07-04T12:05:00Z')

// --- load numbers ---

test('roundLoad truncates the raw TSS float to the integer athletes read', () => {
	expect(roundLoad(120.6488888888889)).toBe(121)
	expect(roundLoad(99.4)).toBe(99)
})

test('formatLoad renders an integer string', () => {
	expect(formatLoad(120.6488888888889)).toBe('121')
	expect(formatLoad(0)).toBe('0')
})

test('formatTss appends the unit', () => {
	expect(formatTss(120.6488888888889)).toBe('121 TSS')
})

test('formatSigned signs positive values and rounds', () => {
	expect(formatSigned(5.4)).toBe('+5')
	expect(formatSigned(-17.6)).toBe('-18')
	expect(formatSigned(0.2)).toBe('0')
})

// --- dates and times ---

test('formatTime is a 24h clock in the given timezone', () => {
	expect(formatTime(INSTANT, 'UTC')).toBe('12:05')
	expect(formatTime(INSTANT, 'Europe/Oslo')).toBe('14:05')
})

test('formatTime never renders 12h AM/PM', () => {
	const evening = new Date('2026-07-04T21:30:00Z')
	expect(formatTime(evening, 'UTC')).toBe('21:30')
})

test('formatDate is European-style day month year', () => {
	expect(formatDate(INSTANT, 'UTC')).toBe('4 Jul 2026')
})

test('formatDate respects the timezone across a date line', () => {
	const lateUTC = new Date('2026-07-04T23:30:00Z')
	expect(formatDate(lateUTC, 'UTC')).toBe('4 Jul 2026')
	expect(formatDate(lateUTC, 'Europe/Oslo')).toBe('5 Jul 2026')
})

test('formatDateLong spells out weekday and month', () => {
	expect(formatDateLong(INSTANT, 'UTC')).toBe('Saturday 4 July 2026')
})

test('formatDayDate is compact weekday day month', () => {
	expect(formatDayDate(INSTANT, 'UTC')).toBe('Sat 4 Jul')
})

test('formatDayDateLong is the yearless prose date', () => {
	expect(formatDayDateLong(INSTANT, 'UTC')).toBe('Saturday 4 July')
})

test('formatDayMonth is the dense chart label', () => {
	expect(formatDayMonth(INSTANT, 'UTC')).toBe('4 Jul')
})

test('formatWeekday and formatWeekdayShort name the day in the timezone', () => {
	expect(formatWeekday(INSTANT, 'UTC')).toBe('Saturday')
	expect(formatWeekdayShort(INSTANT, 'UTC')).toBe('Sat')
	// 23:30 UTC on Saturday is already Sunday in Oslo.
	const lateUTC = new Date('2026-07-04T23:30:00Z')
	expect(formatWeekday(lateUTC, 'Europe/Oslo')).toBe('Sunday')
})

test('formatDayOfMonth renders the bare day number', () => {
	expect(formatDayOfMonth(INSTANT, 'UTC')).toBe('4')
})

test('formatDateTime combines compact date and 24h time', () => {
	expect(formatDateTime(INSTANT, 'Europe/Oslo')).toBe('Sat 4 Jul, 14:05')
})

test('date formatters accept serialized string dates', () => {
	expect(formatDate('2026-07-04T12:05:00Z', 'UTC')).toBe('4 Jul 2026')
	expect(formatTime('2026-07-04T12:05:00Z', 'UTC')).toBe('12:05')
})

// --- pace ---

test('formatPaceClock pads seconds', () => {
	expect(formatPaceClock(245)).toBe('4:05')
	expect(formatPaceClock(244.6)).toBe('4:05')
})

test('formatPace and formatSwimPace carry their units', () => {
	expect(formatPace(245)).toBe('4:05 /km')
	expect(formatSwimPace(105)).toBe('1:45 /100m')
})

test('formatPaceRange renders a single pace or a range', () => {
	expect(formatPaceRange(245)).toBe('4:05 /km')
	expect(formatPaceRange(245, 255)).toBe('4:05–4:15 /km')
})

test('parsePace inverts formatPaceClock', () => {
	expect(parsePace('4:05')).toBe(245)
	expect(parsePace(formatPaceClock(245))).toBe(245)
})

test('parsePace tolerates whitespace and unit suffixes', () => {
	expect(parsePace(' 4:05 ')).toBe(245)
	expect(parsePace('4:05 /km')).toBe(245)
	expect(parsePace('1:45 /100m')).toBe(105)
})

test('parsePace rejects garbage, out-of-range seconds, and zero', () => {
	expect(parsePace('')).toBeNull()
	expect(parsePace('fast')).toBeNull()
	expect(parsePace('4:65')).toBeNull()
	expect(parsePace('0:00')).toBeNull()
	expect(parsePace('4')).toBeNull()
})

// --- duration ---

test('formatDuration renders h min prose', () => {
	expect(formatDuration(5400)).toBe('1 h 30 min')
	expect(formatDuration(3600)).toBe('1 h')
	expect(formatDuration(2700)).toBe('45 min')
	expect(formatDuration(90)).toBe('1 min 30 s')
	expect(formatDuration(30)).toBe('30 s')
})

test('parseDuration inverts formatDuration', () => {
	expect(parseDuration('1 h 30 min')).toBe(5400)
	expect(parseDuration(formatDuration(5400))).toBe(5400)
	expect(parseDuration(formatDuration(3600))).toBe(3600)
	expect(parseDuration(formatDuration(2700))).toBe(2700)
})

test('parseDuration accepts compact and clock forms', () => {
	expect(parseDuration('1h30m')).toBe(5400)
	expect(parseDuration('90 min')).toBe(5400)
	expect(parseDuration('2h')).toBe(7200)
	expect(parseDuration('1:30')).toBe(5400)
})

test('parseDuration reads a bare number as minutes', () => {
	expect(parseDuration('45')).toBe(2700)
	expect(parseDuration('90.5')).toBe(5430)
})

test('parseDuration rejects garbage and zero', () => {
	expect(parseDuration('')).toBeNull()
	expect(parseDuration('soon')).toBeNull()
	expect(parseDuration('0')).toBeNull()
	expect(parseDuration('0:00')).toBeNull()
})

test('formatClockDuration renders finish-time clocks', () => {
	expect(formatClockDuration(3 * 3600 + 30 * 60)).toBe('3:30:00')
	expect(formatClockDuration(42 * 60 + 30)).toBe('42:30')
	expect(formatClockDuration(3661)).toBe('1:01:01')
})

// --- distance and speed ---

test('formatDistance renders km above 1000m and whole metres below', () => {
	expect(formatDistance(10000)).toBe('10 km')
	expect(formatDistance(9650)).toBe('9.7 km')
	expect(formatDistance(800)).toBe('800 m')
	expect(formatDistance(802.5)).toBe('803 m')
})

test('formatMeters groups thousands and rounds', () => {
	expect(formatMeters(1500)).toBe('1,500 m')
	expect(formatMeters(1500.4)).toBe('1,500 m')
})

test('formatSpeed converts m/s to km/h with one decimal', () => {
	expect(formatSpeed(10)).toBe('36.0 km/h')
})
