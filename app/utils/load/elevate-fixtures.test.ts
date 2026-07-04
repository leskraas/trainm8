import { expect, test } from 'vitest'
import {
	elevateAnchoredFixture,
	elevatePublishedCheckpoints,
	elevateTrendFixture,
	type LoadFixtureDay,
} from './elevate-fixtures.ts'
import { buildLoadCurve, type DailyTss } from './load-curve.ts'

/**
 * Cross-validation of the load engine against Elevate's fitness service
 * (https://github.com/thomaschampagne/elevate, MPL-2.0) — see
 * elevate-fixtures.ts for the adapted scenario data and full attribution.
 *
 * Smoothing-constant difference, and how it is handled here:
 * Elevate smooths with `k = 1 − e^(−1/N)` (≈ 0.023529 for N = 42,
 * ≈ 0.133122 for N = 7) while ADR 0008 specifies `k = 1/N` (≈ 0.023810 and
 * ≈ 0.142857). The fixture's full expected series were therefore recomputed
 * for OUR constant with an independent reference implementation (documented
 * in the fixture file), and Elevate's published checkpoint values are
 * asserted separately with an explicit tolerance sized to the measured
 * divergence between the two variants over this series.
 */

const toDailyTss = (days: LoadFixtureDay[]): DailyTss[] =>
	days.map(({ date, tss }) => ({
		date,
		tssTotal: tss,
		tssByDiscipline: {},
	}))

test('load curve matches the Elevate-adapted six-week series (ADR 0008 constants)', () => {
	const curve = buildLoadCurve(toDailyTss(elevateTrendFixture), {
		ctl: 0,
		atl: 0,
	})

	expect(curve).toHaveLength(elevateTrendFixture.length)
	for (const [i, expected] of elevateTrendFixture.entries()) {
		const day = curve[i]!
		expect(day.date, `date at index ${i}`).toBe(expected.date)
		// Fixture values are rounded to 4 decimals; assert to 3.
		expect(day.ctl, `ctl on ${expected.date}`).toBeCloseTo(expected.ctl, 3)
		expect(day.atl, `atl on ${expected.date}`).toBeCloseTo(expected.atl, 3)
		expect(day.tsb, `tsb on ${expected.date}`).toBeCloseTo(expected.tsb, 3)
	}
})

test('load curve matches the Elevate-adapted anchored series (initial fitness/fatigue)', () => {
	const { anchor, days } = elevateAnchoredFixture
	const curve = buildLoadCurve(toDailyTss(days), anchor)

	expect(curve).toHaveLength(days.length)
	// Mirrors Elevate's first-day assertion: form on day one comes from the
	// initialized (anchor) fitness/fatigue, ctl − atl = 50 − 100.
	expect(curve[0]!.tsb).toBe(anchor.ctl - anchor.atl)
	for (const [i, expected] of days.entries()) {
		const day = curve[i]!
		expect(day.ctl, `ctl on ${expected.date}`).toBeCloseTo(expected.ctl, 3)
		expect(day.atl, `atl on ${expected.date}`).toBeCloseTo(expected.atl, 3)
		expect(day.tsb, `tsb on ${expected.date}`).toBeCloseTo(expected.tsb, 3)
	}
})

test("load curve stays within tolerance of Elevate's published checkpoints (smoothing-variant divergence)", () => {
	const curve = buildLoadCurve(toDailyTss(elevateTrendFixture), {
		ctl: 0,
		atl: 0,
	})
	const byDate = new Map(curve.map((day) => [day.date, day]))

	// Measured divergence of `1/N` vs Elevate's `1 − e^(−1/N)` at the four
	// checkpoints: ctl ≤ 0.44, atl ≤ 5.09, tsb ≤ 2.89 — plus up to 0.01 from
	// Elevate's `_.floor(value, 2)` truncation. Tolerances below cover that
	// with a little headroom while staying tight enough to catch a wrong
	// time constant (swapping 42/7, or dropping a day, blows well past them).
	const tolerance = { ctl: 0.5, atl: 5.5, tsb: 3.0 }

	for (const checkpoint of elevatePublishedCheckpoints) {
		const day = byDate.get(checkpoint.date)
		expect(day, `curve day ${checkpoint.date}`).toBeDefined()
		for (const metric of ['ctl', 'atl', 'tsb'] as const) {
			const diff = Math.abs(day![metric] - checkpoint[metric])
			expect(
				diff,
				`${metric} on ${checkpoint.date}: ours ${day![metric]} vs Elevate ${checkpoint[metric]}`,
			).toBeLessThanOrEqual(tolerance[metric])
		}
	}
})

test("regression: TSB is computed from the previous day's CTL/ATL, not today's (Elevate #579)", () => {
	// Elevate issue #579 fixed TSB being derived from the same day's just-
	// updated CTL/ATL. Our engine has always used yesterday's values — this
	// pins it. TSB ("form") answers "how fresh did I wake up today?", so
	// today's training must not feed into it.
	const curve = buildLoadCurve(toDailyTss(elevateTrendFixture), {
		ctl: 0,
		atl: 0,
	})

	// Day one: TSB comes from the anchor, unaffected by day one's 150 TSS.
	expect(curve[0]!.tsb).toBe(0)

	for (let i = 1; i < curve.length; i++) {
		const prev = curve[i - 1]!
		const day = curve[i]!
		expect(day.tsb, `tsb on ${day.date}`).toBe(prev.ctl - prev.atl)
	}

	// Anti-check on a heavy training day: had TSB been derived from the
	// same day's CTL/ATL (the pre-#579 bug), it would differ by ~ 100 TSS.
	const heavyDay = curve.find((day) => day.date === '2018-02-12')!
	const buggyTsb = heavyDay.ctl - heavyDay.atl
	expect(Math.abs(heavyDay.tsb - buggyTsb)).toBeGreaterThan(1)
})
