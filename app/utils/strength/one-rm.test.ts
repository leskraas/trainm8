import { expect, test } from 'vitest'
import {
	ESTIMATOR_MEAN_BIAS_PCT,
	ESTIMATOR_SD_PCT,
	ONE_RM_TEST_RETEST_CV_PCT,
} from './anchors.constants.ts'
import {
	type EstimatorSet,
	type OneRmInput,
	estimateOneRm,
	oneRmRefusalText,
} from './one-rm.ts'
import { formatKg } from './program.constants.ts'

// ——— The fixtures ————————————————————————————————————————————————————————

const NOW = new Date('2026-03-20T10:00:00.000Z')

function set(overrides: Partial<EstimatorSet> = {}): EstimatorSet {
	return {
		setLogId: 'set-1',
		loadKg: 100,
		reps: 8,
		performedAt: new Date('2026-03-12T18:00:00.000Z'),
		rir: null,
		toFailure: true,
		// A weight on the bar unless a test says otherwise: the one kind a 1RM can be
		// read from.
		loadKind: 'external',
		...overrides,
	}
}

function input(overrides: Partial<OneRmInput> = {}): OneRmInput {
	return {
		now: NOW,
		sets: [set()],
		estimator: 'epley',
		hasValidatedRepLoadMapping: true,
		...overrides,
	}
}

// ——— The equations ———————————————————————————————————————————————————————

test('a set of 8 reps at 100 kg estimates a 1RM by Epley, the default, and names it', () => {
	const reading = estimateOneRm({ ...input(), estimator: undefined })
	expect(reading.kind).toBe('estimate')
	if (reading.kind !== 'estimate') return
	// Epley/Welday: RepWt × (1 + reps/30) = 100 × 1.2667.
	expect(reading.valueKg).toBeCloseTo(126.7, 1)
	expect(reading.protocol).toBe('epley')
	expect(reading.construct).toBe('estimatedOneRm')
	// The derivation is shown, not claimed: the set it read is on the answer.
	expect(reading.basis.source).toMatchObject({ loadKg: 100, reps: 8 })
	expect(reading.basis.equationText).toContain('reps')
})

test('each offered equation is the published equation, not a house variant', () => {
	const at = (estimator: OneRmInput['estimator']) => {
		const reading = estimateOneRm(input({ estimator }))
		return reading.kind === 'estimate' ? reading.valueKg : null
	}
	// Transcribed from Mayhew et al. 2008 Table 2, at 100 kg × 8 reps.
	expect(at('brzycki')).toBeCloseTo(124.2, 1) // 100 / (1.0278 − 0.0278·8)
	expect(at('lander')).toBeCloseTo(125.1, 1) // 100 / (1.013 − 0.0267123·8)
	expect(at('adams')).toBeCloseTo(119.0, 1) // 100 / (1 − 0.02·8)
	expect(at('mayhew')).toBeCloseTo(126.3, 1) // 100 / (0.522 + 0.419·e^−0.44)
	expect(at('wathen')).toBeCloseTo(127.7, 1) // 100 / (0.488 + 0.538·e^−0.6)
	expect(at('lombardi')).toBeCloseTo(123.1, 1) // 8^0.10 · 100
})

test('a single taken to failure is the measurement, so no equation is allowed near it', () => {
	// Epley would report 103.3 kg from a 100 kg single — 3.3 kg the athlete never
	// lifted. A single to failure is a tested 1RM, and its band is the 1RM test's
	// own 4.2 % test-retest CV rather than a prediction interval.
	const reading = estimateOneRm(input({ sets: [set({ reps: 1 })] }))
	expect(reading.kind).toBe('estimate')
	if (reading.kind !== 'estimate') return
	expect(reading.valueKg).toBeCloseTo(100, 5)
	expect(reading.construct).toBe('oneRm')
	expect(reading.protocol).toBe('tested')
	expect(reading.band.sdPct).toBe(ONE_RM_TEST_RETEST_CV_PCT)
	expect(reading.confidence).toBe('high')
})

// ——— The gate ————————————————————————————————————————————————————————————

test('a set of 15 reps is refused rather than graded low, because ±100 % is not an estimate', () => {
	const reading = estimateOneRm(input({ sets: [set({ reps: 15 })] }))
	expect(reading.kind).toBe('refusal')
	if (reading.kind !== 'refusal') return
	expect(reading.refusal).toBe('reps-out-of-range')
	// The point of the rule: a grade communicates uncertainty *within* a valid
	// fit, so there is no grade on the answer at all.
	expect(reading).not.toHaveProperty('confidence')
	expect(reading).not.toHaveProperty('valueKg')
})

test('the gate is on eleven reps, not on twelve or on a vibe', () => {
	const ten = estimateOneRm(input({ sets: [set({ reps: 10 })] }))
	const eleven = estimateOneRm(input({ sets: [set({ reps: 11 })] }))
	expect(ten.kind).toBe('estimate')
	expect(eleven.kind).toBe('refusal')
})

// ——— The six refusals ————————————————————————————————————————————————————

test('nothing logged for the lift is a different answer from a set that will not do', () => {
	const reading = estimateOneRm(input({ sets: [] }))
	expect(reading.kind).toBe('refusal')
	if (reading.kind !== 'refusal') return
	expect(reading.refusal).toBe('no-sets-logged')
	expect(reading.basis.setsRead).toBe(0)
	expect(reading.basis.source).toBeNull()
})

test('a set with no proximity-to-failure information refuses, because maximality has no signature in strength', () => {
	// A set of 8 at RIR 4 and a set of 8 at RIR 0 are byte-identical in anything
	// an app can collect, so an unmarked set is not a submaximal reading — it is
	// no reading at all.
	const reading = estimateOneRm(
		input({ sets: [set({ toFailure: false, rir: null })] }),
	)
	expect(reading.kind).toBe('refusal')
	if (reading.kind !== 'refusal') return
	expect(reading.refusal).toBe('effort-unknown')
})

test('a set stopped far from failure is not effort information an estimate may use', () => {
	const reading = estimateOneRm(
		input({ sets: [set({ toFailure: false, rir: 5 })] }),
	)
	expect(reading.kind).toBe('refusal')
	if (reading.kind !== 'refusal') return
	expect(reading.refusal).toBe('effort-unknown')
})

test("a lift with no validated rep↔load mapping refuses instead of borrowing another lift's curve", () => {
	// Rows, overhead presses, deadlift variations and most isolation work have no
	// exercise-specific mapping at all.
	const reading = estimateOneRm(input({ hasValidatedRepLoadMapping: false }))
	expect(reading.kind).toBe('refusal')
	if (reading.kind !== 'refusal') return
	expect(reading.refusal).toBe('exercise-unmapped')
})

test('a kilo that is not a weight on the bar is refused rather than estimated from', () => {
	// The dip-belt bench: 104 kg in the column is the athlete plus 30 kg on a belt,
	// and Epley over it proposes a bar weight nobody has ever touched.
	for (const loadKind of [
		'bodyweightPlus',
		'bodyweight',
		'assisted',
		'perSide',
		'stackLevel',
		'band',
		'unloaded',
		'somethingNobodyHasHeardOf',
	]) {
		const reading = estimateOneRm(input({ sets: [set({ loadKind })] }))
		expect(reading.kind).toBe('refusal')
		if (reading.kind !== 'refusal') continue
		expect(reading.refusal).toBe('load-not-on-the-bar')
	}
})

test('a set whose load kind is unstated is refused rather than read as a bar weight', () => {
	const reading = estimateOneRm(input({ sets: [set({ loadKind: null })] }))
	expect(reading.kind).toBe('refusal')
	if (reading.kind !== 'refusal') return
	expect(reading.refusal).toBe('load-kind-unstated')
})

test('what kind of kilo it is is answered before how many reps it was', () => {
	// A later gate must never mask an earlier one: a bodyweight-derived set of 15
	// is refused for what its number *is*, not for its rep count.
	const reading = estimateOneRm(
		input({ sets: [set({ reps: 15, loadKind: 'bodyweightPlus' })] }),
	)
	expect(reading.kind === 'refusal' && reading.refusal).toBe(
		'load-not-on-the-bar',
	)
})

test('a bar set is still read when the athlete also logged loads that are not bar weights', () => {
	const reading = estimateOneRm(
		input({
			sets: [
				set({ setLogId: 'belt', loadKg: 104, loadKind: 'bodyweightPlus' }),
				set({ setLogId: 'bar', loadKg: 100, reps: 5 }),
			],
		}),
	)
	expect(reading.kind).toBe('estimate')
	expect(reading.basis.source?.setLogId).toBe('bar')
})

test('the seven refusals are structurally distinct and each carries a sentence the UI can render', () => {
	const refusals = [
		estimateOneRm(input({ sets: [] })),
		estimateOneRm(input({ sets: [set({ reps: 0 })] })),
		estimateOneRm(input({ sets: [set({ reps: 15 })] })),
		estimateOneRm(input({ sets: [set({ toFailure: false, rir: null })] })),
		estimateOneRm(input({ hasValidatedRepLoadMapping: false })),
		estimateOneRm(input({ sets: [set({ loadKind: 'bodyweightPlus' })] })),
		estimateOneRm(input({ sets: [set({ loadKind: null })] })),
	].map((reading) => (reading.kind === 'refusal' ? reading.refusal : null))

	expect(refusals).toEqual([
		'no-sets-logged',
		'sets-not-readable',
		'reps-out-of-range',
		'effort-unknown',
		'exercise-unmapped',
		'load-not-on-the-bar',
		'load-kind-unstated',
	])
	// "We did not look" and "we looked and there is nothing" must never collapse
	// into the same shrug, so every reason has its own sentence.
	const sentences = refusals.map((refusal) =>
		refusal ? oneRmRefusalText(refusal) : '',
	)
	expect(new Set(sentences).size).toBe(7)
	for (const sentence of sentences) expect(sentence.length).toBeGreaterThan(10)
})

test('a lift whose sets cannot be read says so, rather than saying it has no sets', () => {
	// A Push-up logged as a 45-second hold: the work happened, and no equation can
	// read a duration as a load lifted for a counted number of reps.
	const held = estimateOneRm(input({ sets: [set({ reps: 0, loadKg: 74 })] }))
	const nothing = estimateOneRm(input({ sets: [] }))
	expect(held.kind).toBe('refusal')
	expect(nothing.kind).toBe('refusal')
	if (held.kind !== 'refusal' || nothing.kind !== 'refusal') return

	// An absence and an unreadable presence are different statements.
	expect(held.refusal).toBe('sets-not-readable')
	expect(nothing.refusal).toBe('no-sets-logged')
	expect(oneRmRefusalText(held.refusal)).not.toBe(
		oneRmRefusalText(nothing.refusal),
	)
	// Neither sentence may tell an athlete who logged a set that they logged none.
	expect(oneRmRefusalText(held.refusal)).not.toMatch(/no sets logged/i)
	expect(oneRmRefusalText(nothing.refusal)).not.toMatch(/no sets logged/i)
	// The sets that could not be read are still counted, so the reading says how
	// much it looked at rather than implying it looked at nothing.
	expect(held.basis.setsRead).toBe(1)
})

// ——— The band ————————————————————————————————————————————————————————————

test("the band is the equation's own population SD, never a decorative ±2 %", () => {
	const reading = estimateOneRm(input())
	expect(reading.kind).toBe('estimate')
	if (reading.kind !== 'estimate') return
	// Epley/Welday at ≤ 10 reps: +0.5 ± 10.2 % (Mayhew 2008).
	expect(reading.band.sdPct).toBe(ESTIMATOR_SD_PCT.epley)
	expect(reading.band.meanBiasPct).toBe(ESTIMATOR_MEAN_BIAS_PCT.epley)
	expect(reading.band.lowKg).toBeCloseTo(reading.valueKg * 0.898, 1)
	expect(reading.band.highKg).toBeCloseTo(reading.valueKg * 1.102, 1)
})

test("no estimator claims to be tighter than the 1RM test's own 4.2 % test–retest CV", () => {
	for (const estimator of [
		'epley',
		'brzycki',
		'mayhew',
		'wathen',
		'lombardi',
		'lander',
		'adams',
	] as const) {
		const reading = estimateOneRm(input({ estimator }))
		expect(reading.kind).toBe('estimate')
		if (reading.kind !== 'estimate') continue
		expect(reading.band.sdPct).toBeGreaterThanOrEqual(ONE_RM_TEST_RETEST_CV_PCT)
	}
})

test('an estimate carries the reps it was read from, so it can be re-derived and re-graded', () => {
	const reading = estimateOneRm(input({ sets: [set({ reps: 5 })] }))
	expect(reading.kind).toBe('estimate')
	if (reading.kind !== 'estimate') return
	// The stored anchor's `reps` column is required for an `estimatedOneRm`, and
	// this is where the value comes from.
	expect(reading.reps).toBe(5)
})

// ——— The grade ———————————————————————————————————————————————————————————

test("a formula's output never grades high, because high means a lift was actually tested", () => {
	const readings = [2, 3, 5, 6, 7, 10].map((reps) =>
		estimateOneRm(input({ sets: [set({ reps })] })),
	)
	for (const reading of readings) {
		expect(reading.kind).toBe('estimate')
		if (reading.kind !== 'estimate') continue
		expect(reading.confidence).not.toBe('high')
	}
})

test('six reps at failure grades medium and eight reps grades low, on reps and recency alone', () => {
	const six = estimateOneRm(input({ sets: [set({ reps: 6 })] }))
	const eight = estimateOneRm(input({ sets: [set({ reps: 8 })] }))
	expect(six.kind === 'estimate' && six.confidence).toBe('medium')
	expect(eight.kind === 'estimate' && eight.confidence).toBe('low')
})

test('a stale set is frozen and graded low, never decayed toward a smaller number', () => {
	// Bosquet 2013's decay curve measures *cessation*; an athlete who is training
	// and untested is stale in an ambiguous direction, and a novice adding load
	// weekly is stale low. So the number stands and the grade drops.
	const stale = estimateOneRm(
		input({
			sets: [set({ reps: 5, performedAt: new Date('2025-09-01T00:00:00Z') })],
		}),
	)
	const fresh = estimateOneRm(input({ sets: [set({ reps: 5 })] }))
	expect(stale.kind).toBe('estimate')
	if (stale.kind !== 'estimate' || fresh.kind !== 'estimate') return
	expect(stale.valueKg).toBeCloseTo(fresh.valueKg, 5)
	expect(stale.confidence).toBe('low')
	expect(stale.basis.stale).toBe(true)
})

// ——— Which set gets read ——————————————————————————————————————————————————

test('the set that yields the heaviest estimate inside the gate is the one read', () => {
	const reading = estimateOneRm(
		input({
			sets: [
				set({ setLogId: 'light', loadKg: 80, reps: 5 }),
				set({ setLogId: 'best', loadKg: 100, reps: 5 }),
				set({ setLogId: 'ungated', loadKg: 200, reps: 20 }),
			],
		}),
	)
	expect(reading.kind).toBe('estimate')
	if (reading.kind !== 'estimate') return
	expect(reading.basis.source?.setLogId).toBe('best')
	expect(reading.basis.setsRead).toBe(3)
})

test('recency is measured against the injected now, so the module reads no clock', () => {
	const later = estimateOneRm({
		...input({ sets: [set({ reps: 5 })] }),
		now: new Date('2026-06-20T10:00:00.000Z'),
	})
	const sooner = estimateOneRm(input({ sets: [set({ reps: 5 })] }))
	expect(later.kind === 'estimate' && later.basis.recencyDays).toBeCloseTo(
		100,
		0,
	)
	expect(sooner.kind === 'estimate' && sooner.basis.recencyDays).toBeCloseTo(
		8,
		0,
	)
})

test('one reading is not two numbers on two surfaces', () => {
	// 25 kg × 5 by Epley is 29.1666… kg. Rounded into the value at one decimal it
	// printed `29.2` wherever the estimator was read and `29.17` wherever the
	// house renderer was, which is one lift described by two weights. The reading
	// now carries the arithmetic and `formatKg` is the only place a decimal is
	// chosen, so every surface that renders it renders the same string.
	const reading = estimateOneRm(
		input({ sets: [set({ loadKg: 25, reps: 5 })], estimator: 'epley' }),
	)
	expect(reading.kind).toBe('estimate')
	if (reading.kind !== 'estimate') return

	expect(formatKg(reading.valueKg)).toBe('29.17')
	expect(formatKg(reading.valueKg)).toBe(formatKg(25 * (1 + 5 / 30)))
	expect(formatKg(reading.valueKg)).not.toBe('29.2')
})

test('a tested single is the load that was lifted, not a rounded restatement of it', () => {
	// 61.25 kg is a weight a rack with 1.25 kg pairs makes. The screen says no
	// equation is applied to a single to failure, so the number it reports must be
	// the number that was quoted one line above it.
	const reading = estimateOneRm(
		input({
			sets: [set({ loadKg: 61.25, reps: 1, toFailure: true })],
		}),
	)
	expect(reading.kind).toBe('estimate')
	if (reading.kind !== 'estimate') return

	expect(reading.valueKg).toBe(61.25)
	expect(reading.basis.source?.loadKg).toBe(61.25)
	expect(reading.protocol).toBe('tested')
	// The band is a spread around the measurement, so it is derived from the
	// measurement and not from a restatement of it.
	expect(reading.band.lowKg).toBeCloseTo(
		61.25 * (1 - reading.band.sdPct / 100),
		10,
	)
})
