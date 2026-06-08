import { expect, test } from 'vitest'
import { sessionAdherence } from './load/adherence.ts'
import {
	deriveLedgerStatus,
	getDisciplineLabel,
	getSessionDurationMin,
	getStatusLabel,
	getStatusVariant,
	toSessionLedgerEntry,
} from './training.ts'

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

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

test('getDisciplineLabel capitalizes disciplines', () => {
	expect(getDisciplineLabel('run')).toBe('Run')
	expect(getDisciplineLabel('swim')).toBe('Swim')
	expect(getDisciplineLabel('strength')).toBe('Strength')
	expect(getDisciplineLabel('rest')).toBe('Rest')
})

test('getDisciplineLabel maps bike to Ride', () => {
	expect(getDisciplineLabel('bike')).toBe('Ride')
})

test('deriveLedgerStatus maps completed sessions to completed', () => {
	expect(
		deriveLedgerStatus({ status: 'completed', scheduledAt: inDays(-1) }),
	).toBe('completed')
})

test('deriveLedgerStatus maps missed and skipped to missed', () => {
	expect(
		deriveLedgerStatus({ status: 'missed', scheduledAt: inDays(-1) }),
	).toBe('missed')
	expect(
		deriveLedgerStatus({ status: 'skipped', scheduledAt: inDays(-1) }),
	).toBe('missed')
})

test('deriveLedgerStatus treats future scheduled sessions as planned', () => {
	expect(
		deriveLedgerStatus({ status: 'scheduled', scheduledAt: inDays(2) }),
	).toBe('planned')
})

test('deriveLedgerStatus treats past scheduled sessions as missed', () => {
	expect(
		deriveLedgerStatus({ status: 'scheduled', scheduledAt: inDays(-2) }),
	).toBe('missed')
})

test('getSessionDurationMin prefers the recording actual duration', () => {
	const min = getSessionDurationMin({
		recording: { durationSec: 1800 },
		workout: {
			blocks: [{ repeatCount: 1, steps: [{ durationSec: 600 }] }],
		},
	})
	expect(min).toBe(30)
})

test('getSessionDurationMin falls back to planned step duration', () => {
	const min = getSessionDurationMin({
		recording: null,
		workout: {
			blocks: [{ repeatCount: 2, steps: [{ durationSec: 600 }] }],
		},
	})
	expect(min).toBe(20)
})

test('getSessionDurationMin returns null with no recording or workout', () => {
	expect(getSessionDurationMin({ recording: null, workout: null })).toBeNull()
})

test('toSessionLedgerEntry projects the normalized ledger fields', () => {
	const entry = toSessionLedgerEntry({
		id: 'session-1',
		scheduledAt: inDays(-1),
		status: 'completed',
		tssValue: 55,
		plannedTssValue: 50,
		plannedTssConfidence: 'full',
		workout: {
			title: 'Tempo Run',
			discipline: 'run',
			blocks: [{ repeatCount: 1, steps: [{ durationSec: 2400 }] }],
		},
		recording: { discipline: 'run', durationSec: 2700 },
		sessionLog: { rpe: 7 },
	})
	expect(entry).toMatchObject({
		id: 'session-1',
		discipline: 'run',
		title: 'Tempo Run',
		status: 'completed',
		durationMin: 45,
		load: 55,
		plannedTss: 50,
		rpe: 7,
	})
})

test('toSessionLedgerEntry derives the adherence band from actual / planned', () => {
	const entry = toSessionLedgerEntry({
		id: 'over',
		scheduledAt: inDays(-1),
		status: 'completed',
		tssValue: 120, // 120 / 100 = 1.2 → over
		plannedTssValue: 100,
		plannedTssConfidence: 'full',
		workout: null,
		recording: { discipline: 'run', durationSec: 3600 },
		sessionLog: null,
	})
	// Delegation, not a re-derivation: the band on the entry is exactly what
	// `sessionAdherence` (which owns the gate + ADR 0019 thresholds) returns.
	expect(entry.adherence).toEqual(sessionAdherence(120, 100)?.band)
	expect(entry.adherence?.tone).toBe('over')
})

test('toSessionLedgerEntry yields no adherence band when planned TSS is missing', () => {
	const entry = toSessionLedgerEntry({
		id: 'no-plan',
		scheduledAt: inDays(-1),
		status: 'completed',
		tssValue: 80,
		plannedTssValue: null,
		plannedTssConfidence: null,
		workout: null,
		recording: { discipline: 'run', durationSec: 3600 },
		sessionLog: null,
	})
	expect(entry.adherence).toBeNull()
})

test('toSessionLedgerEntry yields no adherence band when actual TSS is missing', () => {
	const entry = toSessionLedgerEntry({
		id: 'planned-only',
		scheduledAt: inDays(3),
		status: 'scheduled',
		tssValue: null,
		plannedTssValue: 70,
		plannedTssConfidence: 'full',
		workout: null,
		recording: null,
		sessionLog: null,
	})
	expect(entry.adherence).toBeNull()
})

test('toSessionLedgerEntry handles a planned session with no log or recording', () => {
	const entry = toSessionLedgerEntry({
		id: 'session-2',
		scheduledAt: inDays(3),
		status: 'scheduled',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		workout: {
			title: 'Easy Spin',
			discipline: 'bike',
			blocks: [{ repeatCount: 1, steps: [{ durationSec: 3600 }] }],
		},
		recording: null,
		sessionLog: null,
	})
	expect(entry).toMatchObject({
		discipline: 'bike',
		title: 'Easy Spin',
		status: 'planned',
		durationMin: 60,
		load: null,
		plannedTss: null,
		adherence: null,
		rpe: null,
	})
})
