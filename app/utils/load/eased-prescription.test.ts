import { expect, test } from 'vitest'
import {
	BUILT_IN_RECIPES,
	type DisciplineProfileForResolver,
} from '#app/utils/zones/index.ts'
import { buildEasedPrescription } from './eased-prescription.ts'
import { EASED_CAP_MIN } from './session-nudge.ts'

// ── fixtures ────────────────────────────────────────────────────────────────

// A bike profile with FTP + the Coggan power recipe (endurance = Z2).
function bikeProfile(
	overrides: Partial<DisciplineProfileForResolver> = {},
): DisciplineProfileForResolver {
	return {
		lthr: null,
		maxHr: null,
		ftp: 250,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'coggan-power-7',
		zoneOverrides: null,
		...overrides,
	}
}

// A run profile with LTHR + the Friel HR recipe (endurance = Z2).
function runHrProfile(
	overrides: Partial<DisciplineProfileForResolver> = {},
): DisciplineProfileForResolver {
	return {
		lthr: 170,
		maxHr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'friel-hr-5-run',
		zoneOverrides: null,
		...overrides,
	}
}

// A run profile on the Daniels pace recipe, whose endurance zone is "E".
function runPaceProfile(
	overrides: Partial<DisciplineProfileForResolver> = {},
): DisciplineProfileForResolver {
	return {
		lthr: null,
		maxHr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: 240, // 4:00 /km
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
		...overrides,
	}
}

// ── one endurance block, same discipline, capped duration ─────────────────────

test('a cardio session eases to one endurance-intent block in the same discipline, capped at an hour', () => {
	const eased = buildEasedPrescription({
		discipline: 'bike',
		durationMin: 120,
		profile: bikeProfile(),
	})
	expect(eased.discipline).toBe('bike')
	expect(eased.intent).toBe('endurance')
	expect(eased.durationMin).toBe(EASED_CAP_MIN)
	// A single block, single cardio step, at the endurance zone.
	expect(eased.blocks).toHaveLength(1)
	expect(eased.blocks![0]!.repeatCount).toBe(1)
	expect(eased.blocks![0]!.steps).toHaveLength(1)
	const step = eased.blocks![0]!.steps[0]!
	expect(step.kind).toBe('cardio')
	expect(step.discipline).toBe('bike')
	expect(step.durationSec).toBe(EASED_CAP_MIN * 60)
	expect(step.intensity).toEqual({ kind: 'zoneLabel', label: 'Z2' })
})

test('a session shorter than the cap keeps its own duration', () => {
	const eased = buildEasedPrescription({
		discipline: 'run',
		durationMin: 40,
		profile: runHrProfile(),
	})
	expect(eased.durationMin).toBe(40)
	expect(eased.blocks![0]!.steps[0]!.durationSec).toBe(40 * 60)
})

test('a session with unknown duration falls back to the full cap', () => {
	const eased = buildEasedPrescription({
		discipline: 'run',
		durationMin: null,
		profile: runHrProfile(),
	})
	expect(eased.durationMin).toBe(EASED_CAP_MIN)
	expect(eased.blocks![0]!.steps[0]!.durationSec).toBe(EASED_CAP_MIN * 60)
})

// ── athlete-scaled endurance zone (never a hard-coded label) ──────────────────

test('the endurance zone label follows the athlete recipe (Daniels pace uses E, not Z2)', () => {
	const eased = buildEasedPrescription({
		discipline: 'run',
		durationMin: 90,
		profile: runPaceProfile(),
	})
	expect(eased.blocks![0]!.steps[0]!.intensity).toEqual({
		kind: 'zoneLabel',
		label: 'E',
	})
})

test('on Stryd the eased target is the band declaring zone 2 (Stryd Z1), not the literal Z2 (#627)', () => {
	// Stryd's `Z2` declares zone 3, so a literal `Z2` would ease into tempo.
	const eased = buildEasedPrescription({
		discipline: 'run',
		durationMin: 40,
		capMin: 40,
		profile: runHrProfile({
			lthr: null,
			runPowerThresholdW: 250,
			zoneSystem: 'stryd-run-power-5',
		}),
	})
	expect(eased.blocks![0]!.steps[0]!.intensity).toEqual({
		kind: 'zoneLabel',
		label: 'Z1',
	})
	expect(eased.intensityResolvable).toBe(true)
})

test('every recipe eases into the band it declares as zone 2', () => {
	for (const recipe of BUILT_IN_RECIPES) {
		const eased = buildEasedPrescription({
			discipline: recipe.discipline,
			durationMin: 40,
			profile: runHrProfile({ zoneSystem: recipe.id }),
		})
		const intensity = eased.blocks![0]!.steps[0]!.intensity
		const band = recipe.zones.find(
			(z) => intensity.kind === 'zoneLabel' && z.label === intensity.label,
		)
		expect({ recipe: recipe.id, zone: band?.zone }).toEqual({
			recipe: recipe.id,
			zone: 2,
		})
	}
})

// ── resolvability: honest Unavailable, never a fabricated range ───────────────

test('a resolvable endurance zone reports resolved (its ranges resolve against the profile)', () => {
	const eased = buildEasedPrescription({
		discipline: 'bike',
		durationMin: 90,
		profile: bikeProfile(),
	})
	expect(eased.intensityResolvable).toBe(true)
})

test('an unresolvable endurance zone (no zone system) yields an honest Unavailable target, never a fabricated range', () => {
	const eased = buildEasedPrescription({
		discipline: 'bike',
		durationMin: 90,
		profile: bikeProfile({ zoneSystem: null }),
	})
	// We still author the endurance zone, as its word rather than a code (a code
	// is a band label on some recipe, #627), but mark it unresolvable so the
	// applier/display never fabricate a range.
	expect(eased.intensityResolvable).toBe(false)
	expect(eased.blocks![0]!.steps[0]!.intensity).toEqual({
		kind: 'zoneLabel',
		label: 'rolig',
	})
})

test('an unresolvable endurance zone (missing anchor threshold) yields Unavailable', () => {
	const eased = buildEasedPrescription({
		discipline: 'bike',
		durationMin: 90,
		profile: bikeProfile({ ftp: null }), // Coggan needs FTP
	})
	expect(eased.intensityResolvable).toBe(false)
})

// ── strength → no target ──────────────────────────────────────────────────────

test('a strength session produces no eased target', () => {
	const eased = buildEasedPrescription({
		discipline: 'strength',
		durationMin: 60,
		profile: null,
	})
	expect(eased.blocks).toBeNull()
})
