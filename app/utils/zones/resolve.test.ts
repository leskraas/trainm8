import { expect, test } from 'vitest'
import {
	type DisciplineProfileForResolver,
	resolveIntensity,
} from './resolve.ts'

const fullBikeProfile: DisciplineProfileForResolver = {
	lthr: 170,
	maxHr: 190,
	ftp: 280,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: 'coggan-power-7',
	zoneOverrides: null,
}

const fullRunProfile: DisciplineProfileForResolver = {
	lthr: 162,
	maxHr: 185,
	ftp: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'friel-hr-5-run',
	zoneOverrides: null,
}

const fullSwimProfile: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: 95,
	zoneSystem: 'css-3',
	zoneOverrides: null,
}

const emptyProfile: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

// rpe —————————————————————————————————————————————————————————————

test('rpe returns empty resolved (no metric mapping)', () => {
	const result = resolveIntensity({ kind: 'rpe', min: 7 }, emptyProfile)
	expect(result).toEqual({})
})

test('rpe with max still returns empty resolved', () => {
	const result = resolveIntensity({ kind: 'rpe', min: 6, max: 8 }, emptyProfile)
	expect(result).toEqual({})
})

// hrBpm ————————————————————————————————————————————————————————————

test('hrBpm returns exact hr range', () => {
	const result = resolveIntensity({ kind: 'hrBpm', min: 150 }, emptyProfile)
	expect(result).toEqual({ hrMin: 150 })
})

test('hrBpm with max returns exact hr range with max', () => {
	const result = resolveIntensity(
		{ kind: 'hrBpm', min: 145, max: 160 },
		emptyProfile,
	)
	expect(result).toEqual({ hrMin: 145, hrMax: 160 })
})

// hrPct ————————————————————————————————————————————————————————————

test('hrPct ref=lthr computes range from LTHR', () => {
	const result = resolveIntensity(
		{ kind: 'hrPct', ref: 'lthr', minPct: 94, maxPct: 99 },
		fullRunProfile,
	)
	expect(result).toEqual({ hrMin: 152, hrMax: 160 })
})

test('hrPct ref=max computes range from maxHr', () => {
	const result = resolveIntensity(
		{ kind: 'hrPct', ref: 'max', minPct: 80, maxPct: 90 },
		fullBikeProfile,
	)
	expect(result).toEqual({ hrMin: 152, hrMax: 171 })
})

test('hrPct ref=lthr without LTHR returns unavailable', () => {
	const result = resolveIntensity(
		{ kind: 'hrPct', ref: 'lthr', minPct: 90 },
		emptyProfile,
	)
	expect(result.unavailable).toMatch(/LTHR/)
})

test('hrPct ref=max without maxHr returns unavailable', () => {
	const result = resolveIntensity(
		{ kind: 'hrPct', ref: 'max', minPct: 80 },
		emptyProfile,
	)
	expect(result.unavailable).toMatch(/Max HR/)
})

// power ————————————————————————————————————————————————————————————

test('power returns exact power range', () => {
	const result = resolveIntensity(
		{ kind: 'power', minW: 200, maxW: 250 },
		emptyProfile,
	)
	expect(result).toEqual({ powerMin: 200, powerMax: 250 })
})

test('power without max returns only powerMin', () => {
	const result = resolveIntensity({ kind: 'power', minW: 300 }, emptyProfile)
	expect(result).toEqual({ powerMin: 300 })
})

// powerPct —————————————————————————————————————————————————————————

test('powerPct computes range from FTP', () => {
	const result = resolveIntensity(
		{ kind: 'powerPct', minPct: 91, maxPct: 105 },
		fullBikeProfile,
	)
	expect(result).toEqual({ powerMin: 255, powerMax: 294 })
})

test('powerPct without FTP returns unavailable', () => {
	const result = resolveIntensity(
		{ kind: 'powerPct', minPct: 90 },
		emptyProfile,
	)
	expect(result.unavailable).toMatch(/FTP/)
})

// pace —————————————————————————————————————————————————————————————

test('pace returns exact pace range', () => {
	const result = resolveIntensity(
		{ kind: 'pace', minSecPerKm: 210, maxSecPerKm: 240 },
		emptyProfile,
	)
	expect(result).toEqual({ paceMin: 210, paceMax: 240 })
})

test('pace without max returns only paceMin', () => {
	const result = resolveIntensity(
		{ kind: 'pace', minSecPerKm: 220 },
		emptyProfile,
	)
	expect(result).toEqual({ paceMin: 220 })
})

// zoneLabel — coggan-power-7 (bike/FTP) ———————————————————————————

test('zoneLabel Z4 resolves via coggan-power-7 with FTP', () => {
	// Z4: minRatio=0.91, maxRatio=1.05 → 0.91*280=254.8≈255, 1.05*280=294
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z4' },
		fullBikeProfile,
	)
	expect(result).toEqual({ powerMin: 255, powerMax: 294 })
})

test('zoneLabel Z1 minRatio=0 produces no lower power bound (powerMin undefined)', () => {
	// coggan Z1: minRatio=0 means "no lower bound"
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z1' },
		fullBikeProfile,
	)
	expect(result.powerMin).toBeUndefined()
	expect(result.powerMax).toBe(154) // 0.55*280
})

// zoneLabel — friel-hr-5-run (run/LTHR) ———————————————————————————

test('zoneLabel Z4 resolves via friel-hr-5-run with LTHR', () => {
	// friel run Z4: minRatio=0.95, maxRatio=0.99 → 0.95*162=153.9≈154, 0.99*162=160.38≈160
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z4' },
		fullRunProfile,
	)
	expect(result).toEqual({ hrMin: 154, hrMax: 160 })
})

// zoneLabel — css-3 (swim/CSS) ————————————————————————————————————

test('zoneLabel Z2 resolves via css-3 with CSS', () => {
	// css Z2: minRatio=1.0, maxRatio=1.25 → 1.0*95=95, 1.25*95=118.75≈119
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z2' },
		fullSwimProfile,
	)
	expect(result).toEqual({ paceMin: 95, paceMax: 119 })
})

// zoneLabel — missing config —————————————————————————————————————

test('zoneLabel with no zoneSystem returns unavailable', () => {
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z2' },
		emptyProfile,
	)
	expect(result.unavailable).toBeDefined()
})

test('zoneLabel with unknown recipe returns unavailable', () => {
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z2' },
		{ ...emptyProfile, zoneSystem: 'unknown-recipe-id' },
	)
	expect(result.unavailable).toMatch(/Unknown zone recipe/)
})

test('zoneLabel with known recipe but unknown zone label returns unavailable', () => {
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z99' },
		fullBikeProfile,
	)
	expect(result.unavailable).toBeDefined()
})

test('zoneLabel with recipe but missing anchor (no FTP for coggan) returns unavailable', () => {
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z4' },
		{ ...fullBikeProfile, ftp: null },
	)
	expect(result.unavailable).toMatch(/FTP/)
})

// zoneLabel — zoneOverrides ——————————————————————————————————————

test('zoneLabel respects per-athlete zoneOverrides over recipe defaults', () => {
	const profileWithOverrides: DisciplineProfileForResolver = {
		...fullBikeProfile,
		zoneOverrides: JSON.stringify({
			Z4: { minRatio: 0.88, maxRatio: 1.0 },
		}),
	}
	// Override: 0.88*280=246.4≈246, 1.0*280=280
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z4' },
		profileWithOverrides,
	)
	expect(result).toEqual({ powerMin: 246, powerMax: 280 })
})

test('zoneLabel falls back to recipe when zone not in overrides', () => {
	const profileWithOverrides: DisciplineProfileForResolver = {
		...fullBikeProfile,
		zoneOverrides: JSON.stringify({ Z7: { minRatio: 1.6 } }),
	}
	// Z4 not overridden → use recipe: 0.91*280=255, 1.05*280=294
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z4' },
		profileWithOverrides,
	)
	expect(result).toEqual({ powerMin: 255, powerMax: 294 })
})

test('zoneLabel with malformed zoneOverrides JSON falls back to recipe', () => {
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z4' },
		{ ...fullBikeProfile, zoneOverrides: 'not-valid-json{{' },
	)
	expect(result).toEqual({ powerMin: 255, powerMax: 294 })
})
