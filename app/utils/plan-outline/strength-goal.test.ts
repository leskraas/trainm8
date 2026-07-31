import { describe, expect, test } from 'vitest'
import { STRENGTH_GOALS } from './derive.ts'
import {
	isOutsideBand,
	STRENGTH_PRESCRIPTIONS,
	strengthPrescription,
} from './strength-goal.ts'

describe('the prescription each goal derives', () => {
	test('maximal-strength is 80–100% 1RM for 1–6 reps (ACSM 2026, ≥80% 1RM)', () => {
		expect(strengthPrescription('maximal-strength')).toEqual({
			band: { minPct1RM: 80, maxPct1RM: 100 },
			reps: { minReps: 1, maxReps: 6 },
		})
	})

	test('power is 30–70% 1RM for 3–6 reps (ACSM 2026)', () => {
		expect(strengthPrescription('power')).toEqual({
			band: { minPct1RM: 30, maxPct1RM: 70 },
			reps: { minReps: 3, maxReps: 6 },
		})
	})

	test('hypertrophy is 70–85% 1RM for 6–12 reps (ACSM 2009 Position Stand)', () => {
		expect(strengthPrescription('hypertrophy')).toEqual({
			band: { minPct1RM: 70, maxPct1RM: 85 },
			reps: { minReps: 6, maxReps: 12 },
		})
	})

	test('nothing derives sets per week from the goal (ADR 0047 §3)', () => {
		// Volume is the Season Anchor's and the Volume Ramp's. ACSM's `2–3 sets`,
		// `≥10 sets/wk` and power's `≤24 repetitions·sets` are evidence in the header
		// and must not become a reading here, or the plan has two sources for one
		// number.
		for (const goal of STRENGTH_GOALS) {
			expect(Object.keys(strengthPrescription(goal))).toEqual(['band', 'reps'])
		}
	})
})

describe('the band is inclusive at both ends', () => {
	for (const goal of STRENGTH_GOALS) {
		test(`${goal} admits both of its own bounds and nothing beyond them`, () => {
			const { band } = strengthPrescription(goal)
			expect(isOutsideBand(goal, band.minPct1RM)).toBe(false)
			expect(isOutsideBand(goal, band.maxPct1RM)).toBe(false)
			expect(isOutsideBand(goal, band.minPct1RM - 1)).toBe(true)
			expect(isOutsideBand(goal, band.maxPct1RM + 1)).toBe(true)
		})
	}
})

describe('a session outside its segment’s band (ADR 0042 §9’s soft warning)', () => {
	test('a maximal-strength segment flags a 60% session — the ADR’s own example', () => {
		expect(isOutsideBand('maximal-strength', 60)).toBe(true)
	})

	test('a maximal-strength segment does not flag an 85% session', () => {
		expect(isOutsideBand('maximal-strength', 85)).toBe(false)
	})

	test('a power segment flags an 85% session', () => {
		// 85% is inside hypertrophy's band and maximal-strength's; what makes it a
		// warning is the segment's goal, which is why the goal is what is authored.
		expect(isOutsideBand('power', 85)).toBe(true)
	})

	test('a hypertrophy segment flags neither 70% nor 85%', () => {
		expect(isOutsideBand('hypertrophy', 70)).toBe(false)
		expect(isOutsideBand('hypertrophy', 85)).toBe(false)
	})
})

describe('exhaustiveness over STRENGTH_GOALS', () => {
	test('every goal has a prescription, so a fourth goal fails here', () => {
		// A goal added to `STRENGTH_GOALS` without a row would read back `undefined`
		// at a surface rather than anywhere visible; this is where it fails instead.
		expect(Object.keys(STRENGTH_PRESCRIPTIONS).sort()).toEqual(
			[...STRENGTH_GOALS].sort(),
		)
		for (const goal of STRENGTH_GOALS) {
			expect(strengthPrescription(goal)).toBeDefined()
		}
	})

	test('every band and rep range is ordered and within 0–100% 1RM', () => {
		for (const goal of STRENGTH_GOALS) {
			const { band, reps } = strengthPrescription(goal)
			expect(band.minPct1RM).toBeLessThan(band.maxPct1RM)
			expect(band.minPct1RM).toBeGreaterThan(0)
			expect(band.maxPct1RM).toBeLessThanOrEqual(100)
			expect(reps.minReps).toBeLessThanOrEqual(reps.maxReps)
			expect(reps.minReps).toBeGreaterThan(0)
		}
	})
})
