import { expect, test } from 'vitest'
import {
	TSB_FATIGUED_AT_OR_BELOW,
	TSB_FRESH_AT_OR_ABOVE,
	readinessFromTsb,
} from './readiness.ts'

// ── band constants ───────────────────────────────────────────────────────────

test('band boundaries are explicit constants', () => {
	expect(TSB_FRESH_AT_OR_ABOVE).toBe(5)
	expect(TSB_FATIGUED_AT_OR_BELOW).toBe(-10)
})

// ── fresh band (tsb >= 5) ─────────────────────────────────────────────────────

test('clearly positive TSB is fresh', () => {
	const r = readinessFromTsb(20)
	expect(r.tone).toBe('fresh')
	expect(r.label).toBe('Fresh')
	expect(r.recommendation).toBeTruthy()
})

test('exactly at the fresh boundary (5) is fresh', () => {
	expect(readinessFromTsb(5).tone).toBe('fresh')
})

test('just below the fresh boundary (4.9) is neutral', () => {
	expect(readinessFromTsb(4.9).tone).toBe('neutral')
})

// ── neutral band (-10 < tsb < 5) ──────────────────────────────────────────────

test('zero TSB is neutral', () => {
	expect(readinessFromTsb(0).tone).toBe('neutral')
})

test('mildly negative TSB stays neutral', () => {
	expect(readinessFromTsb(-9.9).tone).toBe('neutral')
})

// ── fatigued band (tsb <= -10) ────────────────────────────────────────────────

test('exactly at the fatigued boundary (-10) is fatigued', () => {
	expect(readinessFromTsb(-10).tone).toBe('fatigued')
})

test('deeply negative TSB is fatigued', () => {
	const r = readinessFromTsb(-18)
	expect(r.tone).toBe('fatigued')
	expect(r.label).toBe('Fatigued')
})
