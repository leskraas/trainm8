import { expect, test } from 'vitest'
import { type UpcomingSession } from './training.server.ts'
import { groupByDay, presentSession } from './session-presenter.ts'

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

const UTC = { locale: 'en-US', timeZone: 'UTC' }

test('presentSession.timeOfDay returns hour and minute', () => {
	const session = makeSession('2026-04-20T14:30:00Z')
	const { timeOfDay } = presentSession(session, UTC)
	expect(timeOfDay).toContain('2')
	expect(timeOfDay).toContain('30')
})

test('presentSession.timeOfDay respects timeZone', () => {
	const session = makeSession('2026-04-20T14:30:00Z')
	const utc = presentSession(session, UTC).timeOfDay
	const tokyo = presentSession(session, {
		locale: 'en-US',
		timeZone: 'Asia/Tokyo',
	}).timeOfDay
	expect(utc).not.toBe(tokyo)
})

test('presentSession.longDate includes weekday and readable date', () => {
	const session = makeSession('2026-04-20T08:00:00Z')
	const { longDate } = presentSession(session, UTC)
	expect(longDate).toContain('Monday')
	expect(longDate).toContain('April')
	expect(longDate).toContain('20')
})

test('presentSession.shortDate includes abbreviated weekday and date', () => {
	const session = makeSession('2026-04-20T08:00:00Z')
	const { shortDate } = presentSession(session, UTC)
	expect(shortDate).toContain('Mon')
	expect(shortDate).toContain('Apr')
	expect(shortDate).toContain('20')
})

test('presentSession handles string dates from JSON serialization', () => {
	const session = makeSession('2026-04-20T08:00:00Z')
	const serialized = JSON.parse(JSON.stringify(session)) as UpcomingSession
	const { longDate } = presentSession(serialized, UTC)
	expect(longDate).toContain('Monday')
})

test('groupByDay groups sessions on the same day together', () => {
	const sessions = [
		makeSession('2026-04-20T08:00:00Z'),
		makeSession('2026-04-20T16:00:00Z'),
	]
	const groups = groupByDay(sessions, UTC)
	expect(groups).toHaveLength(1)
	expect(groups[0]!.sessions).toHaveLength(2)
})

test('groupByDay separates sessions on different days', () => {
	const sessions = [
		makeSession('2026-04-20T08:00:00Z'),
		makeSession('2026-04-21T08:00:00Z'),
	]
	const groups = groupByDay(sessions, UTC)
	expect(groups).toHaveLength(2)
})

test('groupByDay preserves insertion order of day groups', () => {
	const sessions = [
		makeSession('2026-04-20T08:00:00Z'),
		makeSession('2026-04-22T08:00:00Z'),
		makeSession('2026-04-21T08:00:00Z'),
	]
	const groups = groupByDay(sessions, UTC)
	expect(groups).toHaveLength(3)
	expect(groups[0]!.dateLabel).toContain('20')
	expect(groups[1]!.dateLabel).toContain('22')
	expect(groups[2]!.dateLabel).toContain('21')
})

test('groupByDay timezone affects grouping near midnight', () => {
	const sessions = [
		makeSession('2026-04-20T23:00:00Z'),
		makeSession('2026-04-21T01:00:00Z'),
	]
	const utcGroups = groupByDay(sessions, UTC)
	expect(utcGroups).toHaveLength(2)

	const tokyoGroups = groupByDay(sessions, {
		locale: 'en-US',
		timeZone: 'Asia/Tokyo',
	})
	expect(tokyoGroups).toHaveLength(1)
})

test('groupByDay returns empty array for empty input', () => {
	expect(groupByDay([], UTC)).toHaveLength(0)
})

test('groupByDay dateLabel matches presentSession.longDate', () => {
	const session = makeSession('2026-04-20T08:00:00Z')
	const groups = groupByDay([session], UTC)
	const { longDate } = presentSession(session, UTC)
	expect(groups[0]!.dateLabel).toBe(longDate)
})
