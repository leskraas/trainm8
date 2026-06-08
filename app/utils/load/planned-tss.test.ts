import { expect, test } from 'vitest'
import {
	computePlannedTss,
	type PlannedTssProfile,
	type PlannedTssStep,
	type PlannedTssWorkout,
} from './planned-tss.ts'

// ── builders ──────────────────────────────────────────────────────────────────

function step(overrides: Partial<PlannedTssStep> = {}): PlannedTssStep {
	return {
		kind: 'cardio',
		discipline: null,
		intensity: null,
		durationSec: null,
		distanceM: null,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		...overrides,
	}
}

function workout(
	steps: PlannedTssStep[],
	discipline = 'run',
	repeatCount = 1,
): PlannedTssWorkout {
	return { discipline, blocks: [{ repeatCount, steps }] }
}

function profile(
	overrides: Partial<PlannedTssProfile['disciplineProfiles'][number]> = {},
	discipline = 'run',
): PlannedTssProfile {
	return {
		disciplineProfiles: [
			{
				discipline,
				lthr: 160,
				maxHr: null,
				ftp: null,
				thresholdPaceSecPerKm: null,
				cssSecPer100m: null,
				preferCogganTss: false,
				preferRTSS: false,
				...overrides,
			},
		],
	}
}

// ── HR-based (hrTSS via resolved HR midpoint) ─────────────────────────────────

test('one HR step: 1h at LTHR midpoint → ~100 TSS, full confidence', () => {
	// midpoint of 158..162 = 160 = LTHR → IF 1.0 → 1h ≈ 100 TSS
	const result = computePlannedTss(
		workout([
			step({ durationSec: 3600, intensityHrMin: 158, intensityHrMax: 162 }),
		]),
		profile({ lthr: 160 }),
	)
	expect(result).not.toBeNull()
	expect(result!.confidence).toBe('full')
	expect(result!.tss).toBeCloseTo(100, 0)
})

test('block repeatCount multiplies the summed step TSS', () => {
	const single = computePlannedTss(
		workout(
			[step({ durationSec: 1800, intensityHrMin: 160, intensityHrMax: 160 })],
			'run',
			1,
		),
		profile({ lthr: 160 }),
	)!
	const doubled = computePlannedTss(
		workout(
			[step({ durationSec: 1800, intensityHrMin: 160, intensityHrMax: 160 })],
			'run',
			2,
		),
		profile({ lthr: 160 }),
	)!
	expect(doubled.tss).toBeCloseTo(single.tss * 2, 5)
})

// ── distance-only derives duration from resolved pace (rTSS) ───────────────────

test('distance-only run step derives duration from resolved pace (rTSS)', () => {
	// preferRTSS, threshold 300s/km. Resolved pace mid 300s/km, distance 5km →
	// duration 1500s = 25min, IF 1.0 → 0.4167h × 100 ≈ 41.7 TSS.
	const result = computePlannedTss(
		workout([step({ distanceM: 5000, intensityPaceMin: 300, intensityPaceMax: 300 })]),
		profile({ preferRTSS: true, thresholdPaceSecPerKm: 300 }),
	)
	expect(result).not.toBeNull()
	expect(result!.confidence).toBe('full')
	expect(result!.tss).toBeCloseTo(41.67, 1)
})

// ── partial: a meaningful step can't resolve ──────────────────────────────────

test('a duration step with an unresolved intensity makes the session partial', () => {
	const result = computePlannedTss(
		workout([
			// resolvable
			step({ durationSec: 3600, intensityHrMin: 160, intensityHrMax: 160 }),
			// has a duration (a real prescribed effort) but no resolved intensity
			step({ durationSec: 1800 }),
		]),
		profile({ lthr: 160 }),
	)
	expect(result).not.toBeNull()
	expect(result!.confidence).toBe('partial')
	// only the resolvable step contributes
	expect(result!.tss).toBeCloseTo(100, 0)
})

test('a resolved-intensity step with no duration or distance is partial', () => {
	const result = computePlannedTss(
		workout([
			step({ durationSec: 3600, intensityHrMin: 160, intensityHrMax: 160 }),
			step({ intensityHrMin: 170, intensityHrMax: 180 }), // no quantity
		]),
		profile({ lthr: 160 }),
	)
	expect(result!.confidence).toBe('partial')
})

// ── open steps don't degrade confidence ───────────────────────────────────────

test('an open step (no quantity, no intensity) does not degrade confidence', () => {
	const result = computePlannedTss(
		workout([
			step({ durationSec: 3600, intensityHrMin: 160, intensityHrMax: 160 }),
			step({}), // "warm up until ready"
			step({ kind: 'rest' }),
		]),
		profile({ lthr: 160 }),
	)
	expect(result!.confidence).toBe('full')
})

// ── unavailable: nothing contributes ──────────────────────────────────────────

test('a session where no step resolves yields unavailable (null)', () => {
	const result = computePlannedTss(
		workout([step({ durationSec: 1800 }), step({})]),
		profile({ lthr: 160 }),
	)
	expect(result).toBeNull()
})

test('a strength-only session yields unavailable (no resolvable intensity)', () => {
	const result = computePlannedTss(
		workout([step({ kind: 'strength' }), step({ kind: 'strength' })], 'strength'),
		profile({}, 'strength'),
	)
	expect(result).toBeNull()
})

test('missing discipline profile yields unavailable', () => {
	const result = computePlannedTss(
		workout([step({ durationSec: 3600, intensityHrMin: 160, intensityHrMax: 160 })]),
		{ disciplineProfiles: [] },
	)
	expect(result).toBeNull()
})

// ── power (coggan) and swim (sTSS) formula selection ──────────────────────────

test('bike step uses coggan when power is preferred and resolved power present', () => {
	// ftp 250, power mid 250 → IF 1.0 → 1h = 100 TSS
	const result = computePlannedTss(
		workout(
			[step({ durationSec: 3600, intensityPowerMin: 240, intensityPowerMax: 260 })],
			'bike',
		),
		profile({ preferCogganTss: true, ftp: 250 }, 'bike'),
	)
	expect(result!.tss).toBeCloseTo(100, 0)
	expect(result!.confidence).toBe('full')
})

test('swim step uses sTSS from resolved pace and CSS', () => {
	// css 100 s/100m, resolved pace mid 100 → IF 1.0 → 1h = 100 TSS
	const result = computePlannedTss(
		workout(
			[step({ durationSec: 3600, intensityPaceMin: 100, intensityPaceMax: 100 })],
			'swim',
		),
		profile({ cssSecPer100m: 100 }, 'swim'),
	)
	expect(result!.tss).toBeCloseTo(100, 0)
})
