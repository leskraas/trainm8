import { expect, test } from 'vitest'
import { groupByDay, presentSession } from './session-presenter.ts'
import { type UpcomingSession } from './training.server.ts'

function makeSession(
	scheduledAt: string,
	overrides?: Partial<UpcomingSession>,
): UpcomingSession {
	return {
		id: crypto.randomUUID(),
		scheduledAt: new Date(scheduledAt),
		status: 'scheduled',
		source: 'authored',
		workout: {
			id: crypto.randomUUID(),
			title: 'Test Workout',
			description: null,
			discipline: 'run',
			intent: 'endurance',
			blocks: [],
		},
		recording: null,
		...overrides,
	}
}

const UTC = { timeZone: 'UTC' }

test('presentSession.timeOfDay is the shared 24h clock', () => {
	const session = makeSession('2026-04-20T14:30:00Z')
	const { timeOfDay } = presentSession(session, UTC)
	expect(timeOfDay).toBe('14:30')
})

test('presentSession.timeOfDay respects timeZone', () => {
	const session = makeSession('2026-04-20T14:30:00Z')
	const utc = presentSession(session, UTC).timeOfDay
	const tokyo = presentSession(session, {
		timeZone: 'Asia/Tokyo',
	}).timeOfDay
	expect(utc).toBe('14:30')
	expect(tokyo).toBe('23:30')
})

test('presentSession.longDate is the shared European-style prose date', () => {
	const session = makeSession('2026-04-20T08:00:00Z')
	const { longDate } = presentSession(session, UTC)
	expect(longDate).toBe('Monday 20 April')
})

test('presentSession.shortDate is the shared compact date', () => {
	const session = makeSession('2026-04-20T08:00:00Z')
	const { shortDate } = presentSession(session, UTC)
	expect(shortDate).toBe('Mon 20 Apr')
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
