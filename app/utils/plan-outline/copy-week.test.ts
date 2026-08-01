// Where a copied week's sessions land (#415). The arithmetic is small and the
// subtlety is all in one place: the weekday and the clock time are the athlete's,
// not UTC's.
import { expect, test } from 'vitest'
import { localTimeUTC } from '../athlete-calendar.ts'
import { planWeekCopy, WeekCopySchema } from './copy-week.ts'

const OSLO = 'Europe/Oslo'

function source(
	id: string,
	scheduledAt: string,
	workoutId: string | null = 'w',
) {
	return { sessionId: id, scheduledAt: new Date(scheduledAt), workoutId }
}

test('every session lands on the target week’s matching weekday', () => {
	const plan = planWeekCopy({
		sources: [
			// Tuesday and Saturday of the week opening 2030-01-07, UTC athlete.
			source('a', '2030-01-08T06:00:00.000Z', 'wa'),
			source('b', '2030-01-12T09:30:00.000Z', 'wb'),
		],
		sourceWeekKey: '2030-01-07',
		targetWeekKey: '2030-01-21',
		timezone: 'UTC',
	})

	expect(
		plan.sessions.map((s) => [s.weekday, s.scheduledAt.toISOString()]),
	).toEqual([
		[1, '2030-01-22T06:00:00.000Z'],
		[5, '2030-01-26T09:30:00.000Z'],
	])
	expect(plan.skipped).toEqual([])
})

test('the weekday is the athlete’s local one, not the UTC one', () => {
	// 23:00 Sunday in Oslo is Monday 22:00Z. Read as UTC this is a Monday and the
	// copy would move it a day; read in the athlete's own week it is Sunday.
	const plan = planWeekCopy({
		sources: [source('a', '2030-01-13T22:00:00.000Z')],
		sourceWeekKey: '2030-01-07',
		targetWeekKey: '2030-01-14',
		timezone: OSLO,
	})

	expect(plan.sessions).toHaveLength(1)
	expect(plan.sessions[0]!.weekday).toBe(6)
	expect(plan.sessions[0]!.scheduledAt.toISOString()).toBe(
		'2030-01-20T22:00:00.000Z',
	)
})

test('the local clock time survives a DST boundary, and the instant does not', () => {
	// Oslo is UTC+1 in March and UTC+2 in April. A Wednesday 07:00 session copied
	// across the spring-forward is still the athlete's 07:00 Wednesday — a
	// *different* UTC instant, which is the point (#415).
	const winter = localTimeUTC('2030-03-27', '07:00', OSLO)
	expect(winter.toISOString()).toBe('2030-03-27T06:00:00.000Z')

	const plan = planWeekCopy({
		sources: [{ sessionId: 'a', scheduledAt: winter, workoutId: 'w' }],
		sourceWeekKey: '2030-03-25',
		targetWeekKey: '2030-04-01',
		timezone: OSLO,
	})

	expect(plan.sessions[0]!.scheduledAt.toISOString()).toBe(
		'2030-04-03T05:00:00.000Z',
	)
	expect(plan.sessions[0]!.weekday).toBe(2)
})

test('the same copy in a zone with no DST keeps the instant’s time of day', () => {
	const plan = planWeekCopy({
		sources: [source('a', '2030-03-27T07:00:00.000Z')],
		sourceWeekKey: '2030-03-25',
		targetWeekKey: '2030-04-01',
		timezone: 'UTC',
	})

	expect(plan.sessions[0]!.scheduledAt.toISOString()).toBe(
		'2030-04-03T07:00:00.000Z',
	)
})

test('several sessions on one day all come across, in time order', () => {
	const plan = planWeekCopy({
		sources: [
			source('pm', '2030-01-09T17:00:00.000Z', 'w2'),
			source('am', '2030-01-09T06:00:00.000Z', 'w1'),
		],
		sourceWeekKey: '2030-01-07',
		targetWeekKey: '2030-01-14',
		timezone: 'UTC',
	})

	expect(plan.sessions.map((s) => s.sourceSessionId)).toEqual(['am', 'pm'])
	expect(plan.sessions.every((s) => s.weekday === 2)).toBe(true)
})

test('a session with no workout is reported rather than copied as an empty one', () => {
	const plan = planWeekCopy({
		sources: [
			source('recording-only', '2030-01-09T06:00:00.000Z', null),
			source('planned', '2030-01-10T06:00:00.000Z', 'w'),
		],
		sourceWeekKey: '2030-01-07',
		targetWeekKey: '2030-01-14',
		timezone: 'UTC',
	})

	expect(plan.sessions.map((s) => s.sourceSessionId)).toEqual(['planned'])
	expect(plan.skipped).toEqual([
		{ sessionId: 'recording-only', reason: 'no-prescription' },
	])
})

test('a session outside the source week is dropped rather than guessed at', () => {
	const plan = planWeekCopy({
		sources: [source('stray', '2030-02-01T06:00:00.000Z')],
		sourceWeekKey: '2030-01-07',
		targetWeekKey: '2030-01-14',
		timezone: 'UTC',
	})

	expect(plan).toEqual({ sessions: [], skipped: [] })
})

test('WeekCopySchema defaults replace to false and refuses a stray field', () => {
	const parsed = WeekCopySchema.safeParse({
		outlineId: 'o1',
		sourceWeekKey: '2030-01-07',
		targetWeekKey: '2030-01-14',
	})
	expect(parsed.success && parsed.data.replace).toBe(false)

	expect(
		WeekCopySchema.safeParse({
			outlineId: 'o1',
			sourceWeekKey: '2030-01-07',
			targetWeekKey: '2030-01-14',
			scale: true,
		}).success,
	).toBe(false)
})

test('WeekCopySchema refuses a week key that is not a date', () => {
	const parsed = WeekCopySchema.safeParse({
		outlineId: 'o1',
		sourceWeekKey: 'last week',
		targetWeekKey: '2030-01-14',
	})
	expect(parsed.success).toBe(false)
	expect(parsed.success ? '' : parsed.error.issues[0]!.message).toBe(
		'Choose the week to copy',
	)
})
