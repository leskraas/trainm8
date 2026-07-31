import { expect, test } from 'vitest'
import { computeSessionContribution, computeSessionTss } from './compute.ts'
import { ewmaStep } from './ewma.ts'

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

// A usable power stream (ADR 0020 shape): 30s at 100W then 30s at 300W, 5s
// resolution. Average power 200W; true NP ≈ 227.98W (see normalized-power.test).
const intervalPowerStream = {
	resolutionSec: 5,
	power: [100, 100, 100, 100, 100, 100, 300, 300, 300, 300, 300, 300],
}

test('bike: Coggan uses true NP from the power stream at high confidence', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{
			hrAvg: null,
			powerAvg: 200,
			paceAvgSecPerKm: null,
			powerStream: intervalPowerStream,
		},
		bikeProfile({ preferCogganTss: true }),
	)
	expect(result!.formula).toBe('coggan')
	expect(result!.confidence).toBe('high')
	// NP ≈ 227.98 > avg 200 → TSS must exceed the average-power figure.
	// avg-power TSS = 3600×200×0.8/(250×3600)×100 = 64
	// NP TSS = 3600×227.98×0.9119/(250×3600)×100 ≈ 83.2
	expect(result!.tss).toBeGreaterThan(64)
	expect(result!.tss).toBeCloseTo(83.2, 0)
})

test('bike: NP-based Coggan works without an aggregate powerAvg', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{
			hrAvg: null,
			powerAvg: null,
			paceAvgSecPerKm: null,
			powerStream: {
				resolutionSec: 5,
				power: Array.from({ length: 12 }, () => 250),
			},
		},
		bikeProfile({ preferCogganTss: true }),
	)
	expect(result!.formula).toBe('coggan')
	expect(result!.confidence).toBe('high')
	expect(result!.tss).toBeCloseTo(100, 1)
})

test('bike: average-power Coggan (no stream) is medium confidence (#174)', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{ hrAvg: 160, powerAvg: 250, paceAvgSecPerKm: null },
		bikeProfile({ preferCogganTss: true }),
	)
	expect(result!.formula).toBe('coggan')
	expect(result!.confidence).toBe('medium')
	expect(result!.tss).toBeCloseTo(100, 1)
})

test('bike: an unusable power stream (all gaps) falls back to average-power Coggan', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{
			hrAvg: null,
			powerAvg: 250,
			paceAvgSecPerKm: null,
			powerStream: { resolutionSec: 5, power: [null, null, null, null] },
		},
		bikeProfile({ preferCogganTss: true }),
	)
	expect(result!.formula).toBe('coggan')
	expect(result!.confidence).toBe('medium')
})

test('bike: a power stream without FTP still falls back to hrTSS', () => {
	const result = computeSessionTss(
		{ discipline: 'bike', durationSec: 3600, rpe: null },
		{
			hrAvg: 160,
			powerAvg: 200,
			paceAvgSecPerKm: null,
			powerStream: intervalPowerStream,
		},
		bikeProfile({ preferCogganTss: true, ftp: null }),
	)
	expect(result!.formula).toBe('hrTSS')
})

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

// ── strength is not in the triad's chain at all (ADR 0046 §2) ─────────────
// `sRPE` on a strength session is `hours × assumed intensity` — the conversion
// ADR 0041 rejected. So the endurance chain refuses strength outright, and the
// display-only figure comes from the contribution dispatcher instead.

test('strength: the endurance chain yields no TSS, even with RPE', () => {
	const result = computeSessionTss(
		{ discipline: 'strength', durationSec: 3600, rpe: 7 },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		baseProfile,
	)
	expect(result).toBeNull()
})

test('strength: HR on a lifting session buys it no way in either', () => {
	const result = computeSessionTss(
		{ discipline: 'strength', durationSec: 3600, rpe: 7 },
		{ hrAvg: 150, powerAvg: null, paceAvgSecPerKm: null },
		// A strength Discipline Profile with an LTHR — hrTSS is an endurance
		// formula and strength never reaches it.
		{
			...baseProfile,
			disciplineProfiles: [
				{
					discipline: 'strength',
					lthr: 160,
					maxHr: 190,
					ftp: null,
					thresholdPaceSecPerKm: null,
					cssSecPer100m: null,
					preferCogganTss: false,
					preferRTSS: false,
				},
			],
		},
	)
	expect(result).toBeNull()
})

// ── computeSessionContribution: what the day's split vs total may read ────

test('a strength session contributes an sRPE figure that the triad may not read', () => {
	const contribution = computeSessionContribution(
		{ discipline: 'strength', durationSec: 3600, rpe: 7 },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		baseProfile,
	)
	expect(contribution).not.toBeNull()
	// Foster's sRPE, unchanged: 1h × RPE 7 × 15 = 105.
	expect(contribution!.tss).toBeCloseTo(105, 4)
	expect(contribution!.formula).toBe('sRPE')
	expect(contribution!.confidence).toBe('low')
	expect(contribution!.countsTowardTriad).toBe(false)
})

test('a strength session without an RPE contributes nothing at all', () => {
	const contribution = computeSessionContribution(
		{ discipline: 'strength', durationSec: 3600, rpe: null },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		baseProfile,
	)
	expect(contribution).toBeNull()
})

test('an endurance session contributes to the triad', () => {
	const contribution = computeSessionContribution(
		{ discipline: 'run', durationSec: 3600, rpe: 6 },
		{ hrAvg: 150, powerAvg: null, paceAvgSecPerKm: null },
		runProfile(),
	)
	expect(contribution!.formula).toBe('hrTSS')
	expect(contribution!.countsTowardTriad).toBe(true)
})

test("an endurance session's own sRPE fallback still counts toward the triad", () => {
	// sRPE survives where it is a degraded reading of a measurable quantity
	// (ADR 0046 §2) — only the strength conversion goes.
	const contribution = computeSessionContribution(
		{ discipline: 'swim', durationSec: 3600, rpe: 7 },
		{ hrAvg: null, powerAvg: null, paceAvgSecPerKm: null },
		swimProfile({ cssSecPer100m: null }),
	)
	expect(contribution!.formula).toBe('sRPE')
	expect(contribution!.countsTowardTriad).toBe(true)
})

test('an import-only discipline contributes nothing, to split or total (ADR 0015)', () => {
	const contribution = computeSessionContribution(
		{ discipline: 'other', durationSec: 3600, rpe: 7 },
		{ hrAvg: 150, powerAvg: null, paceAvgSecPerKm: null },
		baseProfile,
	)
	expect(contribution).toBeNull()
})

test('other: never contributes TSS, even with RPE (ADR 0015)', () => {
	const result = computeSessionTss(
		{ discipline: 'other', durationSec: 3600, rpe: 7 },
		{ hrAvg: 150, powerAvg: null, paceAvgSecPerKm: null },
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
