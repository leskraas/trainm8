import { expect, test } from 'vitest'
import { buildLedgerRows, type SessionRow } from './session-ledger-rows.ts'
import { type LedgerSession } from './training.server.ts'

function makeLedgerSession(
	overrides: Partial<LedgerSession> = {},
): LedgerSession {
	return {
		id: 'ledger-1',
		scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
		status: 'scheduled',
		source: 'authored',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		workout: {
			id: 'workout-1',
			title: 'Morning Run',
			description: null,
			discipline: 'run',
			intent: 'endurance',
			blocks: [],
		},
		recording: null,
		sessionLog: null,
		...overrides,
	}
}

const NOW = new Date('2030-01-05T12:00:00.000Z')

test('inserts the now divider between past and planned sessions', () => {
	const rows = buildLedgerRows(
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

	expect(rows.map((r) => r.kind)).toEqual(['session', 'now', 'session'])
	expect((rows[0] as SessionRow).isPast).toBe(true)
	expect((rows[2] as SessionRow).isPast).toBe(false)
})

test('places the now divider at the end when every session is in the past', () => {
	const rows = buildLedgerRows(
		[
			makeLedgerSession({
				id: 'past-1',
				scheduledAt: new Date('2030-01-01T08:00:00.000Z'),
				status: 'completed',
			}),
		],
		NOW,
	)

	expect(rows.map((r) => r.kind)).toEqual(['session', 'now'])
})

test('places the now divider first when every session is planned', () => {
	const rows = buildLedgerRows(
		[
			makeLedgerSession({
				id: 'future-1',
				scheduledAt: new Date('2030-01-10T08:00:00.000Z'),
			}),
		],
		NOW,
	)

	expect(rows.map((r) => r.kind)).toEqual(['now', 'session'])
})

test('maps each session to its normalized ledger entry and profile bars', () => {
	const rows = buildLedgerRows(
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

	const row = rows[0] as SessionRow
	expect(row.entry.status).toBe('completed')
	expect(row.entry.load).toBe(72)
	expect(row.entry.rpe).toBe(6)
})

test('treats a past session still marked scheduled as missed', () => {
	const rows = buildLedgerRows(
		[
			makeLedgerSession({
				id: 'skipped',
				scheduledAt: new Date('2030-01-02T08:00:00.000Z'),
				status: 'scheduled',
			}),
		],
		NOW,
	)

	expect((rows[0] as SessionRow).entry.status).toBe('missed')
})
