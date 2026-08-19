import { expect, test } from 'vitest'
import {
	type DisciplineProfileForResolver,
	resolveIntensity,
} from './resolve.ts'

const fullBikeProfile: DisciplineProfileForResolver = {
	lthr: 170,
	maxHr: 190,
	ftp: 280,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: 'coggan-power-7',
	zoneOverrides: null,
}

const fullRunProfile: DisciplineProfileForResolver = {
	lthr: 162,
	maxHr: 185,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'friel-hr-5-run',
	zoneOverrides: null,
}

const fullSwimProfile: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: 95,
	zoneSystem: 'css-3',
	zoneOverrides: null,
}

const emptyProfile: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	runPowerThresholdW: null,
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

// zoneLabel — stryd-run-power-5 (run/runPower) ————————————————————

test('zoneLabel Z4 resolves via stryd-run-power-5 with run power (ADR 0038)', () => {
	// Z4: minRatio=1.01, maxRatio=1.15 against a 250 W critical power →
	// 1.01*250=252.5≈253, 1.15*250=287.5≈288.
	const runPowerProfile: DisciplineProfileForResolver = {
		lthr: null,
		maxHr: null,
		ftp: null,
		runPowerThresholdW: 250,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'stryd-run-power-5',
		zoneOverrides: null,
	}
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z4' },
		runPowerProfile,
	)
	expect(result).toEqual({ powerMin: 253, powerMax: 288 })
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

// zoneLabel — css-5 (swim/CSS, five bands) ——————————————————————————

const fullSwim5Profile: DisciplineProfileForResolver = {
	...fullSwimProfile,
	zoneSystem: 'css-5',
}

test('zoneLabel Z3 resolves via css-5 to the moderate band css-3 lacks', () => {
	// css-5 Z3: 1.04–1.10 × CSS 95 → 98.8 ≈ 99 to 104.5 ≈ 105 s/100m. Under css-3
	// the same authored zone 3 has no band and reads as `CSS and faster`.
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z3' },
		fullSwim5Profile,
	)
	expect(result).toEqual({ paceMin: 99, paceMax: 105 })
})

test('zoneLabel Z5 resolves via css-5 to faster than threshold', () => {
	// css-5 Z5: minRatio 0 (unbounded fast), maxRatio 0.98 × CSS 95 → 93.1 ≈ 93.
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z5' },
		fullSwim5Profile,
	)
	expect(result).toEqual({ paceMax: 93 })
})

test('zoneLabel Z1 resolves via css-5 to a two-sided easy range', () => {
	// css-5 Z1: 1.19–1.33 × CSS 95 → 113.05 ≈ 113 to 126.35 ≈ 126 s/100m. `css-3`'s
	// Z1 is unbounded slow and resolves to a floor only; keeping the source's
	// 75 %CV edge here gives the athlete both ends.
	const result = resolveIntensity(
		{ kind: 'zoneLabel', label: 'Z1' },
		fullSwim5Profile,
	)
	expect(result).toEqual({ paceMin: 113, paceMax: 126 })
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

// ——— #449: the anchors the corpus needs ————————————————————————————————————

const norwegianRunProfile: DisciplineProfileForResolver = {
	lthr: 162,
	maxHr: 185,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'norwegian-threshold-run',
	zoneOverrides: null,
}

const oltRunProfile: DisciplineProfileForResolver = {
	...norwegianRunProfile,
	zoneSystem: 'olt-hr-5-run',
}

test('a pace percentage is of threshold *speed*, so it divides', () => {
	// Bakken's sub-threshold window is 95–98 % of T-pace. Against a 4:00/km
	// threshold that is 4:12 (240/0.95) down to 4:05 (240/0.98) — *slower* than
	// threshold, which is the whole point of a sub-threshold session. Reading the
	// percentage as a fraction of the seconds-per-km number would have prescribed
	// 3:48–3:55 and turned the easiest quality session in the tradition into the
	// hardest.
	expect(
		resolveIntensity(
			{ kind: 'pacePct', minPct: 95, maxPct: 98 },
			fullRunProfile,
		),
	).toEqual({ paceMin: 245, paceMax: 253 })
	// Above 100 % is faster: Daniels' T-ladder finishes at 102 %.
	expect(
		resolveIntensity({ kind: 'pacePct', minPct: 102 }, fullRunProfile),
	).toEqual({ paceMin: 235, paceMax: 235 })
})

test('a pace percentage with no threshold pace is Unavailable, and says which', () => {
	expect(
		resolveIntensity({ kind: 'pacePct', minPct: 96 }, fullBikeProfile),
	).toEqual({ unavailable: 'Threshold pace is not configured' })
})

test('lactate resolves through the band the recipe declares it at', () => {
	// The Norwegian operating point, 2.5–3.0 mmol/L, has a midpoint of 2.75 —
	// inside `sub-T`'s declared 2.0–3.0. That band is 1.02–1.05 × a 4:00/km
	// threshold, i.e. 4:05–4:12/km.
	expect(
		resolveIntensity(
			{ kind: 'lactate', minMmol: 2.5, maxMmol: 3.0 },
			norwegianRunProfile,
		),
	).toEqual({ paceMin: 245, paceMax: 252, approximate: true })
})

test('the same lactate reading resolves on whichever channel the recipe anchors', () => {
	// Olympiatoppen publishes lactate against %HFmax, so a lactate target for an
	// OLT athlete lands in bpm rather than in pace — one authored anchor, and the
	// facet is whatever the athlete's own ladder speaks in. I-3 is 82–87 % of 185.
	expect(
		resolveIntensity(
			{ kind: 'lactate', minMmol: 2.5, maxMmol: 3.0 },
			oltRunProfile,
		),
	).toEqual({ hrMin: 152, hrMax: 161, approximate: true })
})

test('a lactate reading past the last published band is Unavailable, never tiled in', () => {
	// Olympiatoppen's own table leaves I-4 and I-5 blank, so 6 mmol has no band
	// on that recipe — the honest answer is that the source stops speaking, not
	// the nearest band.
	expect(
		resolveIntensity({ kind: 'lactate', minMmol: 6 }, oltRunProfile),
	).toEqual({
		unavailable:
			'No band in Olympiatoppen heart rate — 5 zones covers 6.0 mmol/L',
	})
})

test('a recipe that publishes no lactate at all says so rather than guessing', () => {
	expect(
		resolveIntensity({ kind: 'lactate', minMmol: 2.5 }, fullRunProfile),
	).toEqual({
		unavailable: 'Friel heart rate — 5 zones does not publish blood lactate',
	})
})

test('a race pace resolves off the athlete’s own result, hedged', () => {
	const withResult: DisciplineProfileForResolver = {
		...fullRunProfile,
		// A 20:00 5k is 4:00/km.
		raceAnchorPaces: { '5k': 240 },
	}
	// Canova writes marathon work as a percentage of race speed; 95 % of 5k pace
	// is 4:12/km. The number wears `approximate` because a dated race is not
	// today's fitness.
	expect(
		resolveIntensity({ kind: 'racePace', event: '5k', minPct: 95 }, withResult),
	).toEqual({ paceMin: 253, paceMax: 253, approximate: true })
	// With no percentage the anchor itself is the target.
	expect(
		resolveIntensity({ kind: 'racePace', event: '5k' }, withResult),
	).toEqual({ paceMin: 240, paceMax: 240, approximate: true })
})

test('a race pace with no result on record degrades to Unavailable, naming the gap', () => {
	expect(
		resolveIntensity({ kind: 'racePace', event: 'hm' }, fullRunProfile),
	).toEqual({ unavailable: 'No half-marathon result on record' })
})

test('powerPct without a ref still means %FTP, so no stored row moves', () => {
	expect(
		resolveIntensity(
			{ kind: 'powerPct', minPct: 95, maxPct: 105 },
			fullBikeProfile,
		),
	).toEqual(
		resolveIntensity(
			{ kind: 'powerPct', ref: 'ftp', minPct: 95, maxPct: 105 },
			fullBikeProfile,
		),
	)
})

test('a MAP-anchored power target is Unavailable — the app holds no MAP', () => {
	// The interval literature anchors on maximal aerobic power. Naming the
	// reference is the honest half of the fix; resolving it against FTP would be
	// the fabrication, since 66 % of MAP and 66 % of FTP are different watts.
	expect(
		resolveIntensity(
			{ kind: 'powerPct', ref: 'map', minPct: 66 },
			fullBikeProfile,
		),
	).toEqual({ unavailable: 'MAP is not configured' })
})

test('a CP-anchored power target reads running critical power, not cycling FTP', () => {
	const runPower: DisciplineProfileForResolver = {
		...fullRunProfile,
		runPowerThresholdW: 300,
	}
	expect(
		resolveIntensity({ kind: 'powerPct', ref: 'cp', minPct: 90 }, runPower),
	).toEqual({ powerMin: 270, powerMax: undefined })
	// A bike profile holds no CP — CP is not FTP (256 ± 50 W against 249 ± 44 W,
	// and the authors say do not interchange them), so it degrades rather than
	// borrowing the number next to it.
	expect(
		resolveIntensity(
			{ kind: 'powerPct', ref: 'cp', minPct: 90 },
			fullBikeProfile,
		),
	).toEqual({ unavailable: 'critical power is not configured' })
})
