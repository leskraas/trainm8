import { expect, test } from 'vitest'
import {
	ADHERENCE_ON_TARGET_AT_OR_ABOVE,
	ADHERENCE_OVER_ABOVE,
	adherenceBand,
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
