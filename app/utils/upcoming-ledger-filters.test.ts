import { expect, test } from 'vitest'
import { type UpcomingSession } from './training.server.ts'
import {
	ACTIVITY_QUERY_PARAM,
	filterSessionsByActivityType,
	parseActivityQueryParam,
} from './upcoming-ledger-filters.ts'

function sessionWithActivity(activityType: string): UpcomingSession {
	return {
		id: `session-${activityType}`,
		scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
		status: 'scheduled',
		workout: {
			id: `workout-${activityType}`,
			title: `${activityType} workout`,
			description: null,
			activityType,
			blocks: [],
		},
	}
}

test('parseActivityQueryParam returns null for missing or unknown values', () => {
	expect(parseActivityQueryParam(null)).toBeNull()
	expect(parseActivityQueryParam('')).toBeNull()
	expect(parseActivityQueryParam('yoga')).toBeNull()
})

test('parseActivityQueryParam accepts canonical activity types case-insensitively', () => {
	expect(parseActivityQueryParam('run')).toBe('run')
	expect(parseActivityQueryParam('RUN')).toBe('run')
	expect(parseActivityQueryParam('bike')).toBe('bike')
	expect(parseActivityQueryParam('swim')).toBe('swim')
	expect(parseActivityQueryParam('strength')).toBe('strength')
})

test('filterSessionsByActivityType returns all sessions when filter is null', () => {
	const a = sessionWithActivity('run')
	const b = sessionWithActivity('bike')
	expect(filterSessionsByActivityType([a, b], null)).toEqual([a, b])
})

test('filterSessionsByActivityType narrows to matching activity type', () => {
	const run = sessionWithActivity('run')
	const bike = sessionWithActivity('bike')
	const swim = sessionWithActivity('swim')
	expect(filterSessionsByActivityType([run, bike, swim], 'bike')).toEqual([
		bike,
	])
})

test('ACTIVITY_QUERY_PARAM is stable for route and tests', () => {
	expect(ACTIVITY_QUERY_PARAM).toBe('activity')
})
