import { expect, test } from 'vitest'
import {
	groupSessionsByDay,
	formatSessionTime,
	getStatusLabel,
	getStatusVariant,
} from './training.ts'
import type { UpcomingSession } from './training.server.ts'

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
	const groups = groupSessionsByDay(sessions, { timeZone: 'UTC' })
	expect(groups).toHaveLength(1)
	expect(groups[0]!.sessions).toHaveLength(2)
})

test('separates sessions on different days', () => {
	const sessions = [
		makeSession('2026-04-20T08:00:00Z'),
		makeSession('2026-04-21T08:00:00Z'),
	]
	const groups = groupSessionsByDay(sessions, { timeZone: 'UTC' })
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
	const groups = groupSessionsByDay(sessions, { timeZone: 'UTC' })
	expect(groups).toHaveLength(3)
	expect(groups[0]!.dateLabel).toContain('20')
	expect(groups[1]!.dateLabel).toContain('22')
	expect(groups[2]!.dateLabel).toContain('21')
})

test('date labels include weekday and readable date', () => {
	const sessions = [makeSession('2026-04-20T08:00:00Z')]
	const groups = groupSessionsByDay(sessions, {
		locale: 'en-US',
		timeZone: 'UTC',
	})
	expect(groups[0]!.dateLabel).toContain('Monday')
	expect(groups[0]!.dateLabel).toContain('April')
	expect(groups[0]!.dateLabel).toContain('20')
})

test('timezone affects day grouping near midnight', () => {
	const sessions = [
		makeSession('2026-04-20T23:00:00Z'),
		makeSession('2026-04-21T01:00:00Z'),
	]
	const utcGroups = groupSessionsByDay(sessions, { timeZone: 'UTC' })
	expect(utcGroups).toHaveLength(2)

	const tokyoGroups = groupSessionsByDay(sessions, { timeZone: 'Asia/Tokyo' })
	expect(tokyoGroups).toHaveLength(1)
})

test('returns empty array for empty input', () => {
	const groups = groupSessionsByDay([], { timeZone: 'UTC' })
	expect(groups).toHaveLength(0)
})

test('handles string dates from JSON serialization', () => {
	const session = makeSession('2026-04-20T08:00:00Z')
	const serialized = JSON.parse(JSON.stringify(session)) as UpcomingSession
	const groups = groupSessionsByDay([serialized], {
		locale: 'en-US',
		timeZone: 'UTC',
	})
	expect(groups).toHaveLength(1)
	expect(groups[0]!.dateLabel).toContain('Monday')
})

test('formatSessionTime returns hours and minutes', () => {
	const time = formatSessionTime(new Date('2026-04-20T14:30:00Z'), {
		timeZone: 'UTC',
	})
	expect(time).toContain('2')
	expect(time).toContain('30')
})

test('getStatusVariant maps known statuses to badge variants', () => {
	expect(getStatusVariant('scheduled')).toBe('secondary')
	expect(getStatusVariant('completed')).toBe('default')
	expect(getStatusVariant('skipped')).toBe('outline')
	expect(getStatusVariant('missed')).toBe('destructive')
})

test('getStatusVariant maps unknown statuses to ghost', () => {
	expect(getStatusVariant('cancelled')).toBe('ghost')
})

test('getStatusLabel returns capitalized label for unknown status', () => {
	expect(getStatusLabel('cancelled')).toBe('Cancelled')
})

test('getStatusLabel handles empty string gracefully', () => {
	expect(getStatusLabel('')).toBe('')
})

test('formatSessionTime respects timezone', () => {
	const utcTime = formatSessionTime(new Date('2026-04-20T14:30:00Z'), {
		timeZone: 'UTC',
	})
	const tokyoTime = formatSessionTime(new Date('2026-04-20T14:30:00Z'), {
		timeZone: 'Asia/Tokyo',
	})
	expect(utcTime).not.toBe(tokyoTime)
})
