import { expect, test } from 'vitest'
import { type UpcomingSession } from './training.server.ts'
import { summarizeUpcomingLedger } from './upcoming-ledger-summary.ts'

function sessionWith({
	id,
	discipline,
	status = 'scheduled',
}: {
	id: string
	discipline: string
	status?: string
}): UpcomingSession {
	return {
		id,
		scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
		status,
		source: 'authored',
		workout: {
			id: `workout-${id}`,
			title: `${discipline} workout`,
			description: null,
			discipline,
			intent: 'endurance',
			blocks: [],
		},
		recording: null,
	}
}

test('summarizeUpcomingLedger derives counts and discipline allocation from visible sessions', () => {
	const summary = summarizeUpcomingLedger([
		sessionWith({ id: 'run-1', discipline: 'run' }),
		sessionWith({ id: 'run-2', discipline: 'run', status: 'completed' }),
		sessionWith({ id: 'bike-1', discipline: 'bike' }),
	])

	expect(summary.horizonDays).toBe(14)
	expect(summary.totalSessions).toBe(3)
	expect(summary.statusCounts).toEqual({
		completed: 1,
		scheduled: 2,
	})
	expect(summary.disciplineAllocation).toEqual([
		{ discipline: 'run', label: 'Run', count: 2, percentage: 67 },
		{ discipline: 'bike', label: 'Ride', count: 1, percentage: 33 },
	])
})

test('summarizeUpcomingLedger marks unavailable metrics without fake values', () => {
	const summary = summarizeUpcomingLedger([
		sessionWith({ id: 'run-1', discipline: 'run' }),
	])

	expect(summary.unavailableMetrics).toEqual([
		{ label: 'Duration', value: null, displayValue: 'Unavailable' },
		{ label: 'Distance', value: null, displayValue: 'Unavailable' },
		{ label: 'TSS', value: null, displayValue: 'Unavailable' },
	])
})
