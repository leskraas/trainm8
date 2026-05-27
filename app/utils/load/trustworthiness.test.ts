import { expect, test } from 'vitest'
import {
	TSB_TRUSTWORTHY_MIN_DAYS,
	assessTsbTrust,
	daysOfLoadHistory,
} from './trustworthiness.ts'

// ── threshold constant ───────────────────────────────────────────────────────

test('TSB_TRUSTWORTHY_MIN_DAYS defaults to 42 (CTL time constant)', () => {
	expect(TSB_TRUSTWORTHY_MIN_DAYS).toBe(42)
})

// ── daysOfLoadHistory ────────────────────────────────────────────────────────

test('daysOfLoadHistory: no history returns 0', () => {
	expect(daysOfLoadHistory(null, '2026-05-27')).toBe(0)
})

test('daysOfLoadHistory: first day counts as day 1', () => {
	expect(daysOfLoadHistory('2026-05-27', '2026-05-27')).toBe(1)
})

test('daysOfLoadHistory: inclusive count across a span', () => {
	// 2026-05-01 → 2026-05-12 is day 12 of history
	expect(daysOfLoadHistory('2026-05-01', '2026-05-12')).toBe(12)
})

test('daysOfLoadHistory: exactly 42 days', () => {
	// 2026-01-01 + 41 days = 2026-02-11 → day 42
	expect(daysOfLoadHistory('2026-01-01', '2026-02-11')).toBe(42)
})

test('daysOfLoadHistory: a future first date clamps to 0', () => {
	expect(daysOfLoadHistory('2026-06-01', '2026-05-27')).toBe(0)
})

// ── assessTsbTrust boundary ──────────────────────────────────────────────────

test('assessTsbTrust: no history is not trustworthy', () => {
	const result = assessTsbTrust(0)
	expect(result.trustworthy).toBe(false)
	expect(result.daysOfHistory).toBe(0)
	expect(result.requiredDays).toBe(42)
})

test('assessTsbTrust: below threshold (41 days) is not trustworthy', () => {
	const result = assessTsbTrust(41)
	expect(result.trustworthy).toBe(false)
	expect(result.daysOfHistory).toBe(41)
})

test('assessTsbTrust: exactly at threshold (42 days) is trustworthy', () => {
	const result = assessTsbTrust(42)
	expect(result.trustworthy).toBe(true)
	expect(result.daysOfHistory).toBe(42)
})

test('assessTsbTrust: above threshold (100 days) is trustworthy', () => {
	expect(assessTsbTrust(100).trustworthy).toBe(true)
})

test('assessTsbTrust: floors fractional and clamps negative input', () => {
	expect(assessTsbTrust(41.9).daysOfHistory).toBe(41)
	expect(assessTsbTrust(-5).daysOfHistory).toBe(0)
	expect(assessTsbTrust(-5).trustworthy).toBe(false)
})
