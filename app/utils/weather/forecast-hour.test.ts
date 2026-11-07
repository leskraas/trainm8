import { expect, test } from 'vitest'
import { forecastHours } from './forecast-hour.ts'

const OSLO = 'Europe/Oslo'
// Wednesday 11 November 2026, 10:20 in Oslo (UTC+1).
const NOW = new Date('2026-11-11T09:20:00Z')
const WEEK = [
	'2026-11-09',
	'2026-11-10',
	'2026-11-11',
	'2026-11-12',
	'2026-11-13',
	'2026-11-14',
	'2026-11-15',
]

function hoursFor(
	sessions: { scheduledAt: string; status: string }[],
	trainingTime = '07:00',
	now = NOW,
) {
	return Object.fromEntries(
		[
			...forecastHours({
				dayKeys: WEEK,
				sessions,
				trainingTime,
				timezone: OSLO,
				now,
			}),
		].map(([day, at]) => [day, at.toISOString()]),
	)
}

test('past days get no hour; a free day is read at the training time', () => {
	const hours = hoursFor([], '17:00')
	expect(Object.keys(hours)).toEqual(WEEK.slice(2))
	// 17:00 in Oslo is 16:00 UTC.
	expect(hours['2026-11-13']).toBe('2026-11-13T16:00:00.000Z')
})

test('a day with sessions is read at its first one not yet done, floored to the hour', () => {
	const hours = hoursFor([
		{ scheduledAt: '2026-11-12T17:30:00Z', status: 'scheduled' },
		{ scheduledAt: '2026-11-12T05:15:00Z', status: 'completed' },
		{ scheduledAt: '2026-11-12T11:45:00Z', status: 'scheduled' },
	])
	expect(hours['2026-11-12']).toBe('2026-11-12T11:00:00.000Z')
})

test('today, before its session: that hour', () => {
	const hours = hoursFor([
		{ scheduledAt: '2026-11-11T16:30:00Z', status: 'scheduled' },
	])
	expect(hours['2026-11-11']).toBe('2026-11-11T16:00:00.000Z')
})

test('today, once the hour has passed: the coming hour', () => {
	// 07:00 Oslo (06:00Z) is past at 10:20; the coming hour is 11:00 Oslo.
	expect(hoursFor([])['2026-11-11']).toBe('2026-11-11T10:00:00.000Z')
	// Today's only open session already began: the coming hour too.
	expect(
		hoursFor([{ scheduledAt: '2026-11-11T08:00:00Z', status: 'scheduled' }])[
			'2026-11-11'
		],
	).toBe('2026-11-11T10:00:00.000Z')
})

test('today, done with its session: the training time, or the coming hour once passed', () => {
	const hours = hoursFor(
		[{ scheduledAt: '2026-11-11T06:00:00Z', status: 'completed' }],
		'18:00',
	)
	expect(hours['2026-11-11']).toBe('2026-11-11T17:00:00.000Z')
})

test('a day across the DST change keeps its local training hour', () => {
	const hours = forecastHours({
		dayKeys: ['2027-03-27', '2027-03-28'],
		sessions: [],
		trainingTime: '07:00',
		timezone: OSLO,
		now: new Date('2027-03-26T12:00:00Z'),
	})
	expect(hours.get('2027-03-27')?.toISOString()).toBe(
		'2027-03-27T06:00:00.000Z',
	)
	expect(hours.get('2027-03-28')?.toISOString()).toBe(
		'2027-03-28T05:00:00.000Z',
	)
})

test('a skipped or missed session sets no hour: only a session still planned does', () => {
	const hours = hoursFor(
		[
			{ scheduledAt: '2026-11-12T05:00:00Z', status: 'skipped' },
			{ scheduledAt: '2026-11-12T16:00:00Z', status: 'scheduled' },
			{ scheduledAt: '2026-11-13T05:00:00Z', status: 'skipped' },
			{ scheduledAt: '2026-11-11T09:00:00Z', status: 'missed' },
			{ scheduledAt: '2026-11-11T16:00:00Z', status: 'scheduled' },
		],
		'12:00',
	)
	expect(hours['2026-11-12']).toBe('2026-11-12T16:00:00.000Z')
	// Only a skipped session: the day falls back to the training time.
	expect(hours['2026-11-13']).toBe('2026-11-13T11:00:00.000Z')
	// Today: the missed 10:00 does not pull the hour to now; 17:00 is next.
	expect(hours['2026-11-11']).toBe('2026-11-11T16:00:00.000Z')
})
