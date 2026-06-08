import { expect, test } from 'vitest'
import {
	ADHERENCE_ON_TARGET_AT_OR_ABOVE,
	ADHERENCE_OVER_ABOVE,
	adherenceBand,
	sessionAdherence,
	weeklyAdherence,
} from './adherence.ts'

// ── band constants ───────────────────────────────────────────────────────────

test('band boundaries are explicit constants and asymmetric (over edge nearer)', () => {
	expect(ADHERENCE_ON_TARGET_AT_OR_ABOVE).toBe(0.85)
	expect(ADHERENCE_OVER_ABOVE).toBe(1.08)
	// Over flags sooner than under: the over edge sits closer to 1.0 (0.08)
	// than the under edge (0.15) — overreaching is caught earlier.
	expect(1 - ADHERENCE_ON_TARGET_AT_OR_ABOVE).toBeGreaterThan(
		ADHERENCE_OVER_ABOVE - 1,
	)
})

// ── under band (ratio < 0.85) ─────────────────────────────────────────────────

test('clearly low ratio is under', () => {
	const b = adherenceBand(0.5)
	expect(b.tone).toBe('under')
	expect(b.label).toBe('Under')
	expect(b.recommendation).toBeTruthy()
})

test('just below the on-target boundary (0.849) is under', () => {
	expect(adherenceBand(0.849).tone).toBe('under')
})

// ── on-target band (0.85 <= ratio <= 1.08) ────────────────────────────────────

test('exactly at the on-target lower boundary (0.85) is on-target', () => {
	expect(adherenceBand(0.85).tone).toBe('on-target')
})

test('a perfectly matched session (1.0) is on-target', () => {
	const b = adherenceBand(1.0)
	expect(b.tone).toBe('on-target')
	expect(b.label).toBe('On target')
})

test('exactly at the over boundary (1.08) is still on-target', () => {
	expect(adherenceBand(1.08).tone).toBe('on-target')
})

// ── over band (ratio > 1.08) ──────────────────────────────────────────────────

test('just above the over boundary (1.081) is over', () => {
	expect(adherenceBand(1.081).tone).toBe('over')
})

test('clearly high ratio is over', () => {
	const b = adherenceBand(1.5)
	expect(b.tone).toBe('over')
	expect(b.label).toBe('Over')
	expect(b.recommendation).toBeTruthy()
})

// ── per-session adherence (ratio + gate, ADR 0019) ────────────────────────────

test('session adherence returns the ratio and its band for a present pair', () => {
	const result = sessionAdherence(120, 100)
	expect(result).not.toBeNull()
	expect(result!.ratio).toBeCloseTo(1.2)
	expect(result!.band.tone).toBe('over')
})

test('a clearly light session is under', () => {
	const result = sessionAdherence(50, 100)
	expect(result!.ratio).toBeCloseTo(0.5)
	expect(result!.band.tone).toBe('under')
})

test('a matched session is on-target', () => {
	const result = sessionAdherence(100, 100)
	expect(result!.ratio).toBe(1)
	expect(result!.band.tone).toBe('on-target')
})

test('session adherence applies the ADR 0019 asymmetry (over flags sooner)', () => {
	// A 9% overshoot flags over; a symmetric 9% undershoot stays on-target.
	expect(sessionAdherence(109, 100)!.band.tone).toBe('over')
	expect(sessionAdherence(91, 100)!.band.tone).toBe('on-target')
})

test('session adherence gates on a present pair — missing actual yields null', () => {
	expect(sessionAdherence(null, 100)).toBeNull()
})

test('session adherence gates on a present pair — missing planned yields null', () => {
	expect(sessionAdherence(80, null)).toBeNull()
})

test('session adherence requires positive planned TSS to anchor a ratio', () => {
	expect(sessionAdherence(50, 0)).toBeNull()
})

// ── weekly aggregate (sum actual / sum planned) ───────────────────────────────

test('weekly adherence aggregates the ratio of summed actual to summed planned', () => {
	const result = weeklyAdherence([
		{ plannedTss: 100, actualTss: 90 },
		{ plannedTss: 100, actualTss: 110 },
	])
	// 200 actual / 200 planned = 1.0 — on target, even though neither session
	// matched on its own.
	expect(result).not.toBeNull()
	expect(result!.totalPlanned).toBe(200)
	expect(result!.totalActual).toBe(200)
	expect(result!.sessionCount).toBe(2)
	expect(result!.ratio).toBe(1)
	expect(result!.band.tone).toBe('on-target')
})

test('weekly band follows the summed ratio, not any single session', () => {
	// One big session compensating for a skipped one reads on-target weekly,
	// even though the small session alone was far under.
	const result = weeklyAdherence([
		{ plannedTss: 100, actualTss: 20 },
		{ plannedTss: 100, actualTss: 175 },
	])
	expect(result!.ratio).toBeCloseTo(0.975)
	expect(result!.band.tone).toBe('on-target')
})

// ── exclusion rule: never zero-fill an unavailable side ───────────────────────

test('sessions with unavailable planned or actual TSS are excluded from both sums', () => {
	const result = weeklyAdherence([
		{ plannedTss: 100, actualTss: 80 },
		{ plannedTss: null, actualTss: 90 }, // no planned — excluded
		{ plannedTss: 120, actualTss: null }, // no actual — excluded
	])
	// Only the first session contributes: 80 / 100.
	expect(result!.totalPlanned).toBe(100)
	expect(result!.totalActual).toBe(80)
	expect(result!.sessionCount).toBe(1)
	expect(result!.ratio).toBeCloseTo(0.8)
})

test('a missing side is excluded, not counted as zero (would wrongly read under)', () => {
	// Zero-filling the second session's planned would inflate the denominator
	// and drag the ratio under; excluding it keeps the honest 1.0.
	const result = weeklyAdherence([
		{ plannedTss: 100, actualTss: 100 },
		{ plannedTss: null, actualTss: 100 },
	])
	expect(result!.ratio).toBe(1)
	expect(result!.sessionCount).toBe(1)
})

test('a session with non-positive planned TSS cannot anchor a denominator', () => {
	const result = weeklyAdherence([{ plannedTss: 0, actualTss: 50 }])
	expect(result).toBeNull()
})

// ── empty / unresolvable week renders honestly (no fabricated ratio) ──────────

test('a week with no sessions has no weekly adherence', () => {
	expect(weeklyAdherence([])).toBeNull()
})

test('a week with no resolvable planned load has no weekly adherence', () => {
	const result = weeklyAdherence([
		{ plannedTss: null, actualTss: 60 },
		{ plannedTss: null, actualTss: 40 },
	])
	expect(result).toBeNull()
})
