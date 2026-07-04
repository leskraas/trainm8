/**
 * Cross-validation fixtures for the CTL/ATL/TSB engine, adapted from Elevate.
 *
 * Attribution (MPL-2.0):
 * The daily stress-score scenario and the published CTL/ATL/TSB checkpoint
 * values below are adapted from Elevate's fitness service specs —
 * https://github.com/thomaschampagne/elevate,
 * `appcore/src/app/fitness-trend/shared/services/fitness.service.spec.ts`
 * (test "should compute fitness trend w/ TOGGLE_POWER_METER=ON &
 * TOGGLE_SWIM=ON & CONFIG_HR_MODE=HRSS & Est.PSS=ON & Est.RSS=ON" and test
 * "should compute fitness trend with initial fitness and fatigue value"),
 * licensed under the Mozilla Public License 2.0. The fixtures are data
 * adapted from (not copied out of) those specs: Elevate's per-activity
 * stress scores were collapsed into per-day TSS totals following Elevate's
 * own final-stress-score priority rules, and days after the last published
 * checkpoint (2018-02-12) were truncated to zero-TSS decay days because
 * their totals depend on Elevate's internal RSS estimation, which publishes
 * no checkpoint values for them.
 *
 * Smoothing-constant difference:
 * Elevate smooths with `k = 1 − e^(−1/N)` (N = 42 for CTL, 7 for ATL) while
 * ADR 0008 specifies `k = 1/N`. The `expected*` series below therefore
 * encode OUR constant, and `elevatePublishedCheckpoints` keeps Elevate's
 * published values verbatim for a tolerance-based cross-check (see
 * elevate-fixtures.test.ts for the measured divergence and tolerances).
 *
 * How the expected series were derived (fixture generator, run offline —
 * the checked-in numbers below are the self-contained output):
 *
 *   // Independent reference implementation of the ADR 0008 recurrence,
 *   // written from the formula, not from ewma.ts / load-curve.ts:
 *   //   tsb_d = ctl_{d−1} − atl_{d−1}
 *   //   ctl_d = ctl_{d−1} + (tss_d − ctl_{d−1}) * (1/42)
 *   //   atl_d = atl_{d−1} + (tss_d − atl_{d−1}) * (1/7)
 *   let { ctl, atl } = anchor
 *   for (const date of eachDay(from, to)) {
 *     const tss = stressByDate[date] ?? 0
 *     const tsb = ctl - atl
 *     ctl = ctl + (tss - ctl) * (1 / 42)
 *     atl = atl + (tss - atl) * (1 / 7)
 *     rows.push({ date, tss, ctl: round4(ctl), atl: round4(atl), tsb: round4(tsb) })
 *   }
 *
 * The same generator, run with Elevate's `1 − e^(−1/N)` constant instead,
 * reproduces all four of Elevate's published checkpoints exactly (after
 * Elevate's `_.floor(x, 2)` truncation), which validates both the scenario
 * reconstruction and the reference implementation.
 */

/** One fixture day: the TSS input plus the expected ADR 0008 load values. */
export type LoadFixtureDay = {
	date: string
	tss: number
	/** Expected CTL after this day, ADR 0008 constant, rounded to 4 dp. */
	ctl: number
	/** Expected ATL after this day, ADR 0008 constant, rounded to 4 dp. */
	atl: number
	/** Expected TSB for this day (yesterday's CTL − ATL), rounded to 4 dp. */
	tsb: number
}

/**
 * Scenario 1 — six weeks of mixed ride/run/swim stress from a zero anchor.
 * Adapted from Elevate's "compute fitness trend" spec: per-day totals of the
 * final stress scores their scenario produces (PSS 150 on the power-meter
 * days, HRSS 190 on the HR days, estimated RSS 300 on the no-sensor run
 * days, SSS 419 on the swim day, and 190 + 190 on the grouped 2018-02-12).
 */
export const elevateTrendFixture: LoadFixtureDay[] = [
	{ date: '2018-01-01', tss: 150, ctl: 3.5714, atl: 21.4286, tsb: 0 },
	{ date: '2018-01-02', tss: 150, ctl: 7.0578, atl: 39.7959, tsb: -17.8571 },
	{ date: '2018-01-03', tss: 0, ctl: 6.8898, atl: 34.1108, tsb: -32.7381 },
	{ date: '2018-01-04', tss: 0, ctl: 6.7257, atl: 29.2378, tsb: -27.221 },
	{ date: '2018-01-05', tss: 0, ctl: 6.5656, atl: 25.061, tsb: -22.5121 },
	{ date: '2018-01-06', tss: 0, ctl: 6.4093, atl: 21.4808, tsb: -18.4954 },
	{ date: '2018-01-07', tss: 0, ctl: 6.2567, atl: 18.4122, tsb: -15.0716 },
	{ date: '2018-01-08', tss: 0, ctl: 6.1077, atl: 15.7818, tsb: -12.1555 },
	{ date: '2018-01-09', tss: 0, ctl: 5.9623, atl: 13.5273, tsb: -9.6741 },
	{ date: '2018-01-10', tss: 0, ctl: 5.8203, atl: 11.5948, tsb: -7.565 },
	{ date: '2018-01-11', tss: 0, ctl: 5.6817, atl: 9.9384, tsb: -5.7745 },
	{ date: '2018-01-12', tss: 0, ctl: 5.5465, atl: 8.5186, tsb: -4.2567 },
	{ date: '2018-01-13', tss: 0, ctl: 5.4144, atl: 7.3017, tsb: -2.9722 },
	{ date: '2018-01-14', tss: 0, ctl: 5.2855, atl: 6.2586, tsb: -1.8873 },
	{ date: '2018-01-15', tss: 190, ctl: 9.6835, atl: 32.5074, tsb: -0.9731 },
	{ date: '2018-01-16', tss: 0, ctl: 9.4529, atl: 27.8635, tsb: -22.8239 },
	{ date: '2018-01-17', tss: 0, ctl: 9.2278, atl: 23.883, tsb: -18.4106 },
	{ date: '2018-01-18', tss: 0, ctl: 9.0081, atl: 20.4711, tsb: -14.6551 },
	{ date: '2018-01-19', tss: 0, ctl: 8.7936, atl: 17.5467, tsb: -11.463 },
	{ date: '2018-01-20', tss: 0, ctl: 8.5843, atl: 15.04, tsb: -8.753 },
	{ date: '2018-01-21', tss: 0, ctl: 8.3799, atl: 12.8914, tsb: -6.4557 },
	{ date: '2018-01-22', tss: 0, ctl: 8.1804, atl: 11.0498, tsb: -4.5115 },
	{ date: '2018-01-23', tss: 0, ctl: 7.9856, atl: 9.4713, tsb: -2.8694 },
	{ date: '2018-01-24', tss: 0, ctl: 7.7955, atl: 8.1182, tsb: -1.4857 },
	{ date: '2018-01-25', tss: 0, ctl: 7.6099, atl: 6.9585, tsb: -0.3228 },
	{ date: '2018-01-26', tss: 0, ctl: 7.4287, atl: 5.9644, tsb: 0.6514 },
	{ date: '2018-01-27', tss: 0, ctl: 7.2518, atl: 5.1123, tsb: 1.4643 },
	{ date: '2018-01-28', tss: 0, ctl: 7.0791, atl: 4.382, tsb: 2.1394 },
	{ date: '2018-01-29', tss: 0, ctl: 6.9106, atl: 3.756, tsb: 2.6971 },
	{ date: '2018-01-30', tss: 150, ctl: 10.3175, atl: 24.648, tsb: 3.1546 },
	{ date: '2018-01-31', tss: 0, ctl: 10.0718, atl: 21.1269, tsb: -14.3305 },
	{ date: '2018-02-01', tss: 0, ctl: 9.832, atl: 18.1087, tsb: -11.055 },
	{ date: '2018-02-02', tss: 190, ctl: 14.1217, atl: 42.6646, tsb: -8.2767 },
	{ date: '2018-02-03', tss: 190, ctl: 18.3093, atl: 63.7125, tsb: -28.5429 },
	{ date: '2018-02-04', tss: 0, ctl: 17.8734, atl: 54.6108, tsb: -45.4032 },
	{ date: '2018-02-05', tss: 0, ctl: 17.4478, atl: 46.8092, tsb: -36.7374 },
	{ date: '2018-02-06', tss: 0, ctl: 17.0324, atl: 40.1222, tsb: -29.3614 },
	{ date: '2018-02-07', tss: 300, ctl: 23.7697, atl: 77.2476, tsb: -23.0898 },
	{ date: '2018-02-08', tss: 300, ctl: 30.3466, atl: 109.0694, tsb: -53.4779 },
	{ date: '2018-02-09', tss: 419, ctl: 39.6003, atl: 153.3452, tsb: -78.7227 },
	{ date: '2018-02-10', tss: 0, ctl: 38.6574, atl: 131.4387, tsb: -113.7449 },
	{ date: '2018-02-11', tss: 0, ctl: 37.737, atl: 112.6618, tsb: -92.7813 },
	{ date: '2018-02-12', tss: 380, ctl: 45.8861, atl: 150.8529, tsb: -74.9248 },
	{ date: '2018-02-13', tss: 0, ctl: 44.7936, atl: 129.3025, tsb: -104.9668 },
	{ date: '2018-02-14', tss: 0, ctl: 43.7271, atl: 110.8307, tsb: -84.5089 },
	{ date: '2018-02-15', tss: 0, ctl: 42.686, atl: 94.9978, tsb: -67.1037 },
]

/**
 * Elevate's published checkpoint values for scenario 1, verbatim from their
 * spec assertions. Elevate asserts with `_.floor(value, 2)` (truncation
 * toward −∞, not rounding), and computes with the `1 − e^(−1/N)` smoothing
 * variant — so these cross-check our engine only within an explicit
 * tolerance (see the test).
 */
export const elevatePublishedCheckpoints = [
	{ date: '2018-01-15', ctl: 9.58, atl: 31.11, tsb: -1.48 },
	{ date: '2018-02-03', ctl: 18.14, atl: 60.55, tsb: -26.68 },
	{ date: '2018-02-08', ctl: 30.05, atl: 104.2, tsb: -50.59 },
	{ date: '2018-02-12', ctl: 45.44, atl: 145.76, tsb: -72.42 },
] as const

/**
 * Scenario 2 — a non-zero starting anchor, adapted from Elevate's "compute
 * fitness trend with initial fitness and fatigue value" spec (initialized
 * ctl 50 / atl 100, HR rides scoring 150 on 2015-11-15 and 2015-11-20).
 * Exercises the LoadAnchor seam: day one's TSB must equal the anchor's
 * ctl − atl, mirroring Elevate's first-day assertion.
 */
export const elevateAnchoredFixture = {
	anchor: { ctl: 50, atl: 100 },
	days: [
		{ date: '2015-11-15', tss: 150, ctl: 52.381, atl: 107.1429, tsb: -50 },
		{ date: '2015-11-16', tss: 0, ctl: 51.1338, atl: 91.8367, tsb: -54.7619 },
		{ date: '2015-11-17', tss: 0, ctl: 49.9163, atl: 78.7172, tsb: -40.7029 },
		{ date: '2015-11-18', tss: 0, ctl: 48.7278, atl: 67.4719, tsb: -28.8009 },
		{ date: '2015-11-19', tss: 0, ctl: 47.5676, atl: 57.833, tsb: -18.7441 },
		{ date: '2015-11-20', tss: 150, ctl: 50.0065, atl: 70.9998, tsb: -10.2654 },
		{ date: '2015-11-21', tss: 0, ctl: 48.8159, atl: 60.8569, tsb: -20.9932 },
		{ date: '2015-11-22', tss: 0, ctl: 47.6536, atl: 52.1631, tsb: -12.0411 },
		{ date: '2015-11-23', tss: 0, ctl: 46.519, atl: 44.7112, tsb: -4.5095 },
		{ date: '2015-11-24', tss: 0, ctl: 45.4114, atl: 38.3239, tsb: 1.8078 },
		{ date: '2015-11-25', tss: 0, ctl: 44.3302, atl: 32.8491, tsb: 7.0875 },
	] satisfies LoadFixtureDay[],
}
