import { expect, test } from 'vitest'
import {
	nextDetailWindow,
	scheduleSessions,
	type TrainingAvailability,
} from './schedule.ts'
import { type GeneratedPlan, type GeneratedSession } from './schema.ts'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-06-07T12:00:00.000Z')

function session(overrides: Partial<GeneratedSession> = {}): GeneratedSession {
	return {
		weekIndex: 0,
		orderInWeek: 0,
		title: 'Run',
		discipline: 'run',
		intent: 'endurance',
		blocks: [
			{ repeatCount: 1, steps: [{ kind: 'cardio', discipline: 'run' }] },
		],
		...overrides,
	}
}

function plan(sessions: GeneratedSession[]): GeneratedPlan {
	return {
		outline: {
			phases: [{ name: 'Base', weeks: 4, focus: 'x', weeklyLoadHours: 5 }],
		},
		sessions,
	}
}

// Mon/Wed/Fri availability, 18:00 local.
const availability: TrainingAvailability = {
	trainableWeekdays: [1, 3, 5],
	defaultTrainingTime: '18:00',
	timezone: 'UTC',
}

// 2026-06-01 is a Monday.
const monday = new Date('2026-06-01T00:00:00.000Z')

test('places a session on the first trainable weekday of its week', () => {
	const result = scheduleSessions(
		plan([session({ weekIndex: 0, orderInWeek: 0 })]),
		availability,
		{
			startDate: monday,
			horizonWeeks: 4,
		},
	)

	expect(result).toHaveLength(1)
	// First trainable day in week 0 is Monday 2026-06-01 at 18:00 UTC.
	expect(result[0]!.scheduledAt.toISOString()).toBe('2026-06-01T18:00:00.000Z')
})

test('orders sessions within a week onto successive trainable weekdays', () => {
	const result = scheduleSessions(
		plan([
			session({ weekIndex: 0, orderInWeek: 0, title: 'A' }),
			session({ weekIndex: 0, orderInWeek: 1, title: 'B' }),
			session({ weekIndex: 0, orderInWeek: 2, title: 'C' }),
		]),
		availability,
		{ startDate: monday, horizonWeeks: 4 },
	)

	expect(result.map((s) => s.scheduledAt.toISOString())).toEqual([
		'2026-06-01T18:00:00.000Z', // Mon
		'2026-06-03T18:00:00.000Z', // Wed
		'2026-06-05T18:00:00.000Z', // Fri
	])
})

test('week 1 sessions land in the following calendar week', () => {
	const result = scheduleSessions(
		plan([session({ weekIndex: 1, orderInWeek: 0 })]),
		availability,
		{
			startDate: monday,
			horizonWeeks: 4,
		},
	)

	// Monday of week 1 is 2026-06-08.
	expect(result[0]!.scheduledAt.toISOString()).toBe('2026-06-08T18:00:00.000Z')
})

test('drops sessions whose week is beyond the horizon', () => {
	const result = scheduleSessions(
		plan([session({ weekIndex: 9, orderInWeek: 0 })]),
		availability,
		{
			startDate: monday,
			horizonWeeks: 4,
		},
	)

	expect(result).toHaveLength(0)
})

test('returns sessions sorted chronologically', () => {
	const result = scheduleSessions(
		plan([
			session({ weekIndex: 1, orderInWeek: 0, title: 'later' }),
			session({ weekIndex: 0, orderInWeek: 0, title: 'earlier' }),
		]),
		availability,
		{ startDate: monday, horizonWeeks: 4 },
	)

	expect(result.map((s) => s.title)).toEqual(['earlier', 'later'])
})

test('preserves the original session payload alongside scheduledAt', () => {
	const result = scheduleSessions(
		plan([session({ title: 'Tempo', intent: 'tempo' })]),
		availability,
		{
			startDate: monday,
			horizonWeeks: 4,
		},
	)

	expect(result[0]!).toMatchObject({
		title: 'Tempo',
		intent: 'tempo',
		discipline: 'run',
	})
	expect(result[0]!.scheduledAt).toBeInstanceOf(Date)
})

// ── DST edges ────────────────────────────────────────────────────────────────
// Europe/Oslo is UTC+1 in winter, UTC+2 in summer (DST starts last Sunday of
// March). A 09:00 local session must resolve to the correct UTC instant on
// either side of the transition.

const osloAvailability: TrainingAvailability = {
	trainableWeekdays: [0, 1, 2, 3, 4, 5, 6],
	defaultTrainingTime: '09:00',
	timezone: 'Europe/Oslo',
}

test('DST: 09:00 local resolves to 08:00 UTC before the spring-forward', () => {
	// 2026-03-23 is a Monday, before the 2026-03-29 DST start (still UTC+1).
	const start = new Date('2026-03-23T00:00:00.000Z')
	const result = scheduleSessions(
		plan([session({ weekIndex: 0, orderInWeek: 0 })]),
		osloAvailability,
		{
			startDate: start,
			horizonWeeks: 1,
		},
	)

	expect(result[0]!.scheduledAt.toISOString()).toBe('2026-03-23T08:00:00.000Z')
})

test('DST: 09:00 local resolves to 07:00 UTC after the spring-forward', () => {
	// 2026-03-30 is a Monday, after the 2026-03-29 DST start (now UTC+2).
	const start = new Date('2026-03-30T00:00:00.000Z')
	const result = scheduleSessions(
		plan([session({ weekIndex: 0, orderInWeek: 0 })]),
		osloAvailability,
		{
			startDate: start,
			horizonWeeks: 1,
		},
	)

	expect(result[0]!.scheduledAt.toISOString()).toBe('2026-03-30T07:00:00.000Z')
})

test('no trainable weekdays yields no scheduled sessions', () => {
	const result = scheduleSessions(
		plan([session()]),
		{
			...availability,
			trainableWeekdays: [],
		},
		{ startDate: monday, horizonWeeks: 4 },
	)

	expect(result).toHaveLength(0)
})

test('nextDetailWindow resumes the week after the latest detailed session', () => {
	// Weeks 0 and 1 detailed; outline spans 8 weeks → next window is week 2.
	const week0 = new Date('2026-06-08T09:00:00.000Z')
	const week1 = new Date('2026-06-15T09:00:00.000Z')

	const window = nextDetailWindow([week0, week1], 8, NOW)

	expect(window).not.toBeNull()
	expect(window!.startWeekIndex).toBe(2)
	expect(window!.remainingWeeks).toBe(6)
	// Tiled in 7-day blocks from the earliest detailed session.
	expect(window!.startDate.getTime()).toBe(week0.getTime() + 14 * DAY)
})

test('nextDetailWindow is null when the Outline is fully detailed', () => {
	const week0 = new Date('2026-06-08T09:00:00.000Z')
	const week1 = new Date('2026-06-15T09:00:00.000Z')

	expect(nextDetailWindow([week0, week1], 2, NOW)).toBeNull()
})

test('nextDetailWindow starts at week 0 anchored on now when nothing is detailed', () => {
	const window = nextDetailWindow([], 4, NOW)

	expect(window).not.toBeNull()
	expect(window!.startWeekIndex).toBe(0)
	expect(window!.remainingWeeks).toBe(4)
	expect(window!.startDate.getTime()).toBe(NOW.getTime())
})
