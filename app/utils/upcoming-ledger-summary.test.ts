import { expect, test } from 'vitest'
import { type UpcomingSession } from './training.server.ts'
import { summarizeUpcomingLedger } from './upcoming-ledger-summary.ts'

function sessionWith({
	id,
	activityType,
	status = 'scheduled',
}: {
	id: string
	activityType: string
	status?: string
}): UpcomingSession {
	return {
		id,
		scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
		status,
		workout: {
			id: `workout-${id}`,
			title: `${activityType} workout`,
			description: null,
			activityType,
			blocks: [],
		},
	}
}

test('summarizeUpcomingLedger derives counts and activity allocation from visible sessions', () => {
	const summary = summarizeUpcomingLedger([
		sessionWith({ id: 'run-1', activityType: 'run' }),
		sessionWith({ id: 'run-2', activityType: 'run', status: 'completed' }),
		sessionWith({ id: 'bike-1', activityType: 'bike' }),
	])

	expect(summary.horizonDays).toBe(14)
	expect(summary.totalSessions).toBe(3)
	expect(summary.statusCounts).toEqual({
		completed: 1,
		scheduled: 2,
	})
	expect(summary.activityAllocation).toEqual([
		{ activityType: 'run', label: 'Run', count: 2, percentage: 67 },
		{ activityType: 'bike', label: 'Ride', count: 1, percentage: 33 },
	])
})

test('summarizeUpcomingLedger marks unavailable metrics without fake values', () => {
	const summary = summarizeUpcomingLedger([
		sessionWith({ id: 'run-1', activityType: 'run' }),
	])

	expect(summary.unavailableMetrics).toEqual([
		{ label: 'Duration', value: null, displayValue: 'Unavailable' },
		{ label: 'Distance', value: null, displayValue: 'Unavailable' },
		{ label: 'TSS', value: null, displayValue: 'Unavailable' },
	])
})
