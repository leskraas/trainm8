import { expect, test } from 'vitest'
import { type UpcomingSession } from './training.server.ts'
import {
	DISCIPLINE_QUERY_PARAM,
	filterSessionsByDiscipline,
	parseDisciplineQueryParam,
} from './upcoming-ledger-filters.ts'

function sessionWithDiscipline(discipline: string): UpcomingSession {
	return {
		id: `session-${discipline}`,
		scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
		status: 'scheduled',
		workout: {
			id: `workout-${discipline}`,
			title: `${discipline} workout`,
			description: null,
			discipline,
			intent: 'endurance',
			blocks: [],
		},
	}
}

test('parseDisciplineQueryParam returns null for missing or unknown values', () => {
	expect(parseDisciplineQueryParam(null)).toBeNull()
	expect(parseDisciplineQueryParam('')).toBeNull()
	expect(parseDisciplineQueryParam('yoga')).toBeNull()
})

test('parseDisciplineQueryParam accepts canonical disciplines case-insensitively', () => {
	expect(parseDisciplineQueryParam('run')).toBe('run')
	expect(parseDisciplineQueryParam('RUN')).toBe('run')
	expect(parseDisciplineQueryParam('bike')).toBe('bike')
	expect(parseDisciplineQueryParam('swim')).toBe('swim')
	expect(parseDisciplineQueryParam('strength')).toBe('strength')
})

test('filterSessionsByDiscipline returns all sessions when filter is null', () => {
	const a = sessionWithDiscipline('run')
	const b = sessionWithDiscipline('bike')
	expect(filterSessionsByDiscipline([a, b], null)).toEqual([a, b])
})

test('filterSessionsByDiscipline narrows to matching discipline', () => {
	const run = sessionWithDiscipline('run')
	const bike = sessionWithDiscipline('bike')
	const swim = sessionWithDiscipline('swim')
	expect(filterSessionsByDiscipline([run, bike, swim], 'bike')).toEqual([bike])
})

test('DISCIPLINE_QUERY_PARAM is stable for route and tests', () => {
	expect(DISCIPLINE_QUERY_PARAM).toBe('discipline')
})
