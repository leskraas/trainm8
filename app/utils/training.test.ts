import { expect, test } from 'vitest'
import { groupSessionsByDay, formatSessionTime } from './training.ts'
import { type UpcomingSession } from './training.server.ts'

function makeSession(
	scheduledAt: string,
	overrides?: Partial<UpcomingSession>,
): UpcomingSession {
	return {
		id: crypto.randomUUID(),
		scheduledAt: new Date(scheduledAt),
		status: 'scheduled',
		workout: {
			id: crypto.randomUUID(),
			title: 'Test Workout',
			description: null,
			activityType: 'run',
			blocks: [],
		},
		...overrides,
	}
}

test('groups sessions on the same UTC day together', () => {
	const sessions = [
		makeSession('2026-04-20T08:00:00Z'),
		makeSession('2026-04-20T16:00:00Z'),
	]
	const groups = groupSessionsByDay(sessions, 'UTC')
	expect(groups).toHaveLength(1)
	expect(groups[0]!.sessions).toHaveLength(2)
})

test('separates sessions on different days', () => {
	const sessions = [
		makeSession('2026-04-20T08:00:00Z'),
		makeSession('2026-04-21T08:00:00Z'),
	]
	const groups = groupSessionsByDay(sessions, 'UTC')
	expect(groups).toHaveLength(2)
	expect(groups[0]!.sessions).toHaveLength(1)
	expect(groups[1]!.sessions).toHaveLength(1)
})

test('preserves chronological order of day groups', () => {
	const sessions = [
		makeSession('2026-04-20T08:00:00Z'),
		makeSession('2026-04-22T08:00:00Z'),
		makeSession('2026-04-21T08:00:00Z'),
	]
	const groups = groupSessionsByDay(sessions, 'UTC')
	expect(groups).toHaveLength(3)
	expect(groups[0]!.dateLabel).toContain('20')
	expect(groups[1]!.dateLabel).toContain('22')
	expect(groups[2]!.dateLabel).toContain('21')
})

test('date labels include weekday and readable date', () => {
	const sessions = [makeSession('2026-04-20T08:00:00Z')]
	const groups = groupSessionsByDay(sessions, 'UTC')
	expect(groups[0]!.dateLabel).toContain('Monday')
	expect(groups[0]!.dateLabel).toContain('April')
	expect(groups[0]!.dateLabel).toContain('20')
})

test('timezone affects day grouping near midnight', () => {
	const sessions = [
		makeSession('2026-04-20T23:00:00Z'),
		makeSession('2026-04-21T01:00:00Z'),
	]
	const utcGroups = groupSessionsByDay(sessions, 'UTC')
	expect(utcGroups).toHaveLength(2)

	const tokyoGroups = groupSessionsByDay(sessions, 'Asia/Tokyo')
	expect(tokyoGroups).toHaveLength(1)
})

test('formatSessionTime returns hours and minutes', () => {
	const time = formatSessionTime(new Date('2026-04-20T14:30:00Z'), 'UTC')
	expect(time).toContain('2')
	expect(time).toContain('30')
})

test('formatSessionTime respects timezone', () => {
	const utcTime = formatSessionTime(new Date('2026-04-20T14:30:00Z'), 'UTC')
	const tokyoTime = formatSessionTime(
		new Date('2026-04-20T14:30:00Z'),
		'Asia/Tokyo',
	)
	expect(utcTime).not.toBe(tokyoTime)
})
