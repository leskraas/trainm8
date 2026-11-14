import { expect, test } from 'vitest'
import { buildSessionRows } from './session-ledger-rows.ts'
import { type LedgerSession } from './training.server.ts'

function makeLedgerSession(
	overrides: Partial<LedgerSession> = {},
): LedgerSession {
	return {
		id: 'ledger-1',
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
		status: 'scheduled',
		source: 'authored',
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: {
			id: 'workout-1',
			title: 'Morning Run',
			description: null,
			discipline: 'run',
			intent: 'endurance',
			archetype: null,
			activityKind: null,
			effortWord: null,
			blocks: [],
		},
		recording: null,
		sessionLog: null,
		setLogs: [],
		...overrides,
	}
}

const NOW = new Date('2030-01-05T12:00:00.000Z')

test('marks each session past or planned against now, in the order given', () => {
	const rows = buildSessionRows(
		[
			makeLedgerSession({
				id: 'past',
				scheduledAt: new Date('2030-01-03T08:00:00.000Z'),
				status: 'completed',
			}),
			makeLedgerSession({
				id: 'future',
				scheduledAt: new Date('2030-01-07T08:00:00.000Z'),
			}),
		],
		NOW,
	)

	expect(rows.map((r) => [r.id, r.isPast])).toEqual([
		['past', true],
		['future', false],
	])
})

test('maps each session to its normalized ledger entry', () => {
	const [row] = buildSessionRows(
		[
			makeLedgerSession({
				id: 'done',
				scheduledAt: new Date('2030-01-03T08:00:00.000Z'),
				status: 'completed',
				tssValue: 72,
				sessionLog: { id: 'log-1', rpe: 6 },
			}),
		],
		NOW,
	)

	expect(row!.entry.status).toBe('completed')
	expect(row!.entry.load).toBe(72)
	expect(row!.entry.rpe).toBe(6)
})

test('treats a past session still marked scheduled as missed', () => {
	const [row] = buildSessionRows(
		[
			makeLedgerSession({
				id: 'skipped',
				scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
				status: 'scheduled',
			}),
		],
		NOW,
	)

	expect(row!.entry.status).toBe('missed')
})
