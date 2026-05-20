import { expect, test } from 'vitest'
import {
	coggan,
	hrTSS,
	rTSS,
	sTSS,
	sRPE,
} from './formulas.ts'

// ── coggan TSS ─────────────────────────────────────────────────────────────
// TSS = (durationSec * NP * IF) / (FTP * 3600) * 100
// IF = NP / FTP
// Reference: Coggan, A. "Training and Racing with a Power Meter", 2nd ed.

test('coggan: threshold hour returns 100 TSS', () => {
	const result = coggan({ durationSec: 3600, np: 250, ftp: 250 })
	expect(result.tss).toBeCloseTo(100, 1)
	expect(result.formula).toBe('coggan')
	expect(result.confidence).toBe('high')
})

test('coggan: 2h at 0.75 IF returns 112.5 TSS', () => {
	// NP = 0.75 * 300 = 225; IF = 225/300 = 0.75; TSS = (7200 * 225 * 0.75) / (300 * 3600) * 100 = 112.5
	const result = coggan({ durationSec: 7200, np: 225, ftp: 300 })
	expect(result.tss).toBeCloseTo(112.5, 1)
})

test('coggan: 45min recovery ride (0.6 IF) ~ 27 TSS', () => {
	// NP = 0.6 * 250 = 150; TSS = (2700 * 150 * 0.6) / (250 * 3600) * 100 = 27
	const result = coggan({ durationSec: 2700, np: 150, ftp: 250 })
	expect(result.tss).toBeCloseTo(27, 1)
})

// ── hrTSS ──────────────────────────────────────────────────────────────────
// hrTSS = durationHr * hrRatio * trimp_factor * 100
// Where hrRatio = (hrAvg - hrRest) / (lthr - hrRest)
// Using Banister TRIMP approximation; for simplicity we use the
// Friel/Coggan variant:
//   hrTSS = durationHr * (hrAvg/lthr)^2 * 100
// Reference: Friel, J. "The Cyclist's Training Bible", 5th ed., p. 44

test('hrTSS: 1h exactly at LTHR returns 100 TSS', () => {
	const result = hrTSS({ durationSec: 3600, hrAvg: 160, lthr: 160 })
	expect(result.tss).toBeCloseTo(100, 1)
	expect(result.formula).toBe('hrTSS')
	expect(result.confidence).toBe('medium')
})

test('hrTSS: 2h at 80% LTHR returns ~128 TSS', () => {
	// durationHr=2; (144/160)^2 * 2 * 100 = 0.81 * 2 * 100 = 162
	// Actually (0.9)^2 = 0.81; 0.81 * 2 * 100 = 162
	const result = hrTSS({ durationSec: 7200, hrAvg: 144, lthr: 160 })
	expect(result.tss).toBeCloseTo(162, 1)
})

test('hrTSS: falls back to maxHr when lthr not given', () => {
	// Infer LTHR = 0.85 * maxHr; maxHr=200 → lthr=170
	const result = hrTSS({ durationSec: 3600, hrAvg: 170, maxHr: 200 })
	expect(result.tss).toBeCloseTo(100, 1)
	expect(result.confidence).toBe('low')
})

// ── rTSS ───────────────────────────────────────────────────────────────────
// rTSS = (durationSec * paceNP * IF_run) / (thresholdPace * 3600) * 100
// IF_run = paceNP / thresholdPace
// Simplified: rTSS = durationHr * (thresholdPace / paceAvg)^2 * 100
// Daniels/Coggan. Lower pace = faster, so IF = thresholdPace / paceAvg
// Reference: Coggan, "Running with Power"; Daniels' Running Formula

test('rTSS: 1h at threshold pace returns 100 TSS', () => {
	// thresholdPaceSecPerKm = 300 (5:00/km); paceAvgSecPerKm = 300
	const result = rTSS({ durationSec: 3600, paceAvgSecPerKm: 300, thresholdPaceSecPerKm: 300 })
	expect(result.tss).toBeCloseTo(100, 1)
	expect(result.formula).toBe('rTSS')
	expect(result.confidence).toBe('high')
})

test('rTSS: 1h at 80% effort (slower pace) ~ 64 TSS', () => {
	// paceAvg = 375 (6:15/km → 80% of threshold speed); IF = 300/375 = 0.8; TSS = 1 * 0.64 * 100 = 64
	const result = rTSS({ durationSec: 3600, paceAvgSecPerKm: 375, thresholdPaceSecPerKm: 300 })
	expect(result.tss).toBeCloseTo(64, 1)
})

// ── sTSS ───────────────────────────────────────────────────────────────────
// sTSS = durationHr * (css / paceAvg)^2 * 100
// CSS = critical swim speed (sec/100m), lower = faster
// IF = css / paceAvgSecPer100m
// Friel, "Triathlete's Training Bible"

test('sTSS: 1h at CSS pace returns 100 TSS', () => {
	const result = sTSS({ durationSec: 3600, paceAvgSecPer100m: 90, cssSecPer100m: 90 })
	expect(result.tss).toBeCloseTo(100, 1)
	expect(result.formula).toBe('sTSS')
	expect(result.confidence).toBe('high')
})

test('sTSS: 30min at CSS returns 50 TSS', () => {
	const result = sTSS({ durationSec: 1800, paceAvgSecPer100m: 90, cssSecPer100m: 90 })
	expect(result.tss).toBeCloseTo(50, 1)
})

test('sTSS: 1h at 80% CSS effort ~ 64 TSS', () => {
	// IF = 90/112.5 = 0.8; TSS = 1 * 0.64 * 100 = 64
	const result = sTSS({ durationSec: 3600, paceAvgSecPer100m: 112.5, cssSecPer100m: 90 })
	expect(result.tss).toBeCloseTo(64, 1)
})

// ── sRPE ───────────────────────────────────────────────────────────────────
// sRPE = durationMin * RPE * sRPE_factor
// Foster (1998): sRPE = RPE * durationMin * scaling_factor
// Commonly: 1h at RPE 10 = ~150 TSS; 1h at RPE 5 = ~75 TSS
// We use: sRPE_tss = (durationSec / 3600) * rpe * 15
// This gives: 1h RPE 7 (threshold) ≈ 105, 1h RPE 5 (zone2) ≈ 75

test('sRPE: 1h at RPE 7 returns ~105 TSS', () => {
	const result = sRPE({ durationSec: 3600, rpe: 7 })
	expect(result.tss).toBeCloseTo(105, 1)
	expect(result.formula).toBe('sRPE')
	expect(result.confidence).toBe('low')
})

test('sRPE: 30min at RPE 5 returns ~37.5 TSS', () => {
	const result = sRPE({ durationSec: 1800, rpe: 5 })
	expect(result.tss).toBeCloseTo(37.5, 1)
})

test('sRPE: 1h at RPE 10 returns 150 TSS', () => {
	const result = sRPE({ durationSec: 3600, rpe: 10 })
	expect(result.tss).toBeCloseTo(150, 1)
})
