import { expect, test } from 'vitest'
import { computeSessionTss } from './compute.ts'
import { ewmaStep, buildLoadCurve } from './ewma.ts'

// ── computeSessionTss fallback chain ──────────────────────────────────────

const baseProfile = {
	timezone: 'UTC',
	disciplineProfiles: [] as Array<{
		discipline: string
		lthr: number | null
		maxHr: number | null
		ftp: number | null
		thresholdPaceSecPerKm: number | null
		cssSecPer100m: number | null
		preferCogganTss: boolean
		preferRTSS: boolean
	}>,
}

const bikeProfile = (overrides = {}) => ({
	...baseProfile,
	disciplineProfiles: [
		{
			discipline: 'bike',
			lthr: 160,
			maxHr: 190,
			ftp: 250,
			thresholdPaceSecPerKm: null,
			cssSecPer100m: null,
			preferCogganTss: false,
			preferRTSS: false,
			...overrides,
		},
	],
})

const runProfile = (overrides = {}) => ({
	...baseProfile,
	disciplineProfiles: [
		{
			discipline: 'run',
			lthr: 160,
			maxHr: 190,
			ftp: null,
			thresholdPaceSecPerKm: 300,
			cssSecPer100m: null,
			preferCogganTss: false,
			preferRTSS: false,
			...overrides,
		},
	],
})

const swimProfile = (overrides = {}) => ({
	...baseProfile,
	disciplineProfiles: [
		{
			discipline: 'swim',
			lthr: null,
			maxHr: null,
			ftp: null,
			thresholdPaceSecPerKm: null,
			cssSecPer100m: 90,
			preferCogganTss: false,
			preferRTSS: false,
			...overrides,
		},
	],
})

// ── bike fallback chain ───────────────────────────────────────────────────

test('bike: uses hrTSS (default) when HR + LTHR available', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{ hrAvg: 160, powerAvg: null, paceAvgSecPerKm: null },
		bikeProfile(),
	)
	expect(result).not.toBeNull()
	expect(result!.formula).toBe('hrTSS')
	expect(result!.tss).toBeCloseTo(100, 1)
})

test('bike: uses Coggan when preferCogganTss=true + power available', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{ hrAvg: 160, powerAvg: 250, paceAvgSecPerKm: null },
		bikeProfile({ preferCogganTss: true }),
	)
	expect(result!.formula).toBe('coggan')
	expect(result!.tss).toBeCloseTo(100, 1)
})

test('bike: falls back to hrTSS if preferCogganTss but no power', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{ hrAvg: 160, powerAvg: null, paceAvgSecPerKm: null },
		bikeProfile({ preferCogganTss: true }),
	)
	expect(result!.formula).toBe('hrTSS')
})

test('bike: falls back to hrTSS using maxHr when no LTHR', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{ hrAvg: 161.5, powerAvg: null, paceAvgSecPerKm: null },
		bikeProfile({ lthr: null, maxHr: 190 }),
	)
	expect(result!.formula).toBe('hrTSS')
	expect(result!.confidence).toBe('low')
})

test('bike: falls back to sRPE when no HR but RPE available', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: 7 },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		bikeProfile({ lthr: null, maxHr: null }),
	)
	expect(result!.formula).toBe('sRPE')
})

test('bike: returns null when no HR, no RPE', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		bikeProfile({ lthr: null, maxHr: null }),
	)
	expect(result).toBeNull()
})

// ── run fallback chain ────────────────────────────────────────────────────

test('run: uses hrTSS by default when HR + LTHR available', () => {
	const result = computeSessionTss(
		{ discipline: 'run', durationSec: 3600, rpe: null },
		{ hrAvg: 160, powerAvg: null, paceAvgSecPerKm: 300 },
		runProfile(),
	)
	expect(result!.formula).toBe('hrTSS')
})

test('run: uses rTSS when preferRTSS=true + pace available', () => {
	const result = computeSessionTss(
		{ discipline: 'run', durationSec: 3600, rpe: null },
		{ hrAvg: 160, powerAvg: null, paceAvgSecPerKm: 300 },
		runProfile({ preferRTSS: true }),
	)
	expect(result!.formula).toBe('rTSS')
	expect(result!.tss).toBeCloseTo(100, 1)
})

test('run: falls back to hrTSS if preferRTSS but no pace', () => {
	const result = computeSessionTss(
		{ discipline: 'run', durationSec: 3600, rpe: null },
		{ hrAvg: 160, powerAvg: null, paceAvgSecPerKm: null },
		runProfile({ preferRTSS: true }),
	)
	expect(result!.formula).toBe('hrTSS')
})

test('run: falls back to sRPE when no HR and no pace', () => {
	const result = computeSessionTss(
		{ discipline: 'run', durationSec: 3600, rpe: 6 },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		runProfile({ lthr: null, maxHr: null }),
	)
	expect(result!.formula).toBe('sRPE')
})

// ── swim fallback chain ───────────────────────────────────────────────────

test('swim: uses sTSS when CSS + pace available', () => {
	const result = computeSessionTss(
		{ discipline: 'swim', durationSec: 3600, rpe: null },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: 540 }, // ~90sec/100m = 6:00/100m in sec/km
		swimProfile(),
	)
	// cssSecPer100m=90, paceAvgSecPerKm=540 → paceAvgSecPer100m = 54
	// Actually we store paceAvgSecPerKm — need to think about this.
	// For swim, recording has paceAvgSecPerKm but we need sec/100m.
	// paceAvgSecPerKm → sec/100m = paceAvgSecPerKm / 10
	expect(result!.formula).toBe('sTSS')
})

test('swim: falls back to sRPE when no CSS or no pace', () => {
	const result = computeSessionTss(
		{ discipline: 'swim', durationSec: 3600, rpe: 5 },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		swimProfile({ cssSecPer100m: null }),
	)
	expect(result!.formula).toBe('sRPE')
})

// ── strength fallback chain ───────────────────────────────────────────────

test('strength: always uses sRPE when RPE available', () => {
	const result = computeSessionTss(
		{ discipline: 'strength', durationSec: 3600, rpe: 7 },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		baseProfile,
	)
	expect(result!.formula).toBe('sRPE')
})

test('strength: returns null when no RPE', () => {
	const result = computeSessionTss(
		{ discipline: 'strength', durationSec: 3600, rpe: null },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		baseProfile,
	)
	expect(result).toBeNull()
})

// ── EWMA recurrence math ──────────────────────────────────────────────────

test('ewmaStep: 42-day CTL starts at 0, after 1 day of 100 TSS ≈ 2.38', () => {
	// CTL_1 = CTL_0 + (TSS - CTL_0) / 42 = 0 + (100 - 0) / 42 ≈ 2.38
	const { ctl } = ewmaStep({ prevCtl: 0, prevAtl: 0, tss: 100 })
	expect(ctl).toBeCloseTo(100 / 42, 4)
})

test('ewmaStep: 7-day ATL starts at 0, after 1 day of 100 TSS ≈ 14.29', () => {
	const { atl } = ewmaStep({ prevCtl: 0, prevAtl: 0, tss: 100 })
	expect(atl).toBeCloseTo(100 / 7, 4)
})

test('ewmaStep: TSB = prevCTL - prevATL', () => {
	// TSB is form: yesterday's CTL minus yesterday's ATL
	const { tsb } = ewmaStep({ prevCtl: 80, prevAtl: 90, tss: 0 })
	expect(tsb).toBe(80 - 90) // -10
})

test('ewmaStep: zero-TSS day decays CTL toward 0', () => {
	const { ctl } = ewmaStep({ prevCtl: 42, prevAtl: 7, tss: 0 })
	// CTL_new = 42 + (0 - 42) / 42 = 42 - 1 = 41
	expect(ctl).toBeCloseTo(41, 4)
})

test('buildLoadCurve: produces correct CTL/ATL/TSB for 3-day series', () => {
	// Day 0: 100 TSS from rest (prevCtl=0, prevAtl=0)
	// Day 1: 0 TSS
	// Day 2: 200 TSS
	const curve = buildLoadCurve([100, 0, 200], 0, 0)
	expect(curve).toHaveLength(3)

	// Day 0: CTL = 100/42, ATL = 100/7, TSB = 0-0 = 0
	expect(curve[0]!.ctl).toBeCloseTo(100 / 42, 4)
	expect(curve[0]!.atl).toBeCloseTo(100 / 7, 4)
	expect(curve[0]!.tsb).toBe(0)

	// Day 1 TSB = CTL_day0 - ATL_day0
	expect(curve[1]!.tsb).toBeCloseTo(curve[0]!.ctl - curve[0]!.atl, 4)

	// Day 2 TSB = CTL_day1 - ATL_day1
	expect(curve[2]!.tsb).toBeCloseTo(curve[1]!.ctl - curve[1]!.atl, 4)
})
