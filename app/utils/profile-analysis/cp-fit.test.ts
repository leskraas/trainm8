import { expect, test } from 'vitest'
import { fitCriticalPower } from './cp-fit.ts'
import { type MergedPoint } from './mean-maximal.ts'

// ── The 2-parameter critical-power fit ───────────────────────────────────────
// `P(t) = CP + W′/t`, fitted only inside the band the model is well-behaved in.
// Every failure is a *stated* refusal, never a small number with a low grade.

/** A curve point on the model, so a fit can be checked against known truth. */
function onModel(
	durationSec: number,
	cpW: number,
	wPrimeJ: number,
	activityId = 'a',
): MergedPoint & { value: number } {
	return {
		durationSec,
		value: cpW + wPrimeJ / durationSec,
		refusal: null,
		activityId,
		occurredAt: new Date('2026-07-01'),
	}
}

test('recovers the parameters it was generated from', () => {
	const curve = [120, 300, 600, 1200].map((d, i) =>
		onModel(d, 250, 20_000, `activity-${i}`),
	)
	const fit = fitCriticalPower(curve)
	expect(fit.kind).toBe('fit')
	if (fit.kind !== 'fit') return
	expect(fit.cpW).toBeCloseTo(250, 6)
	expect(fit.wPrimeJ).toBeCloseTo(20_000, 3)
	expect(fit.rSquared).toBeCloseTo(1, 6)
	expect(fit.contributingActivityIds).toHaveLength(4)
})

test('points outside the model band never enter the fit', () => {
	// A 15 s sprint sits far above the hyperbola's valid range and would drag
	// CP down and W′ up — the documented failure mode, not a rare accident.
	const curve = [
		onModel(15, 250, 20_000),
		...[120, 300, 600, 1200].map((d) => onModel(d, 250, 20_000)),
	]
	const fit = fitCriticalPower(curve)
	if (fit.kind !== 'fit') throw new Error('expected a fit')
	expect(fit.durationsUsedSec).toEqual([120, 300, 600, 1200])
	expect(fit.cpW).toBeCloseTo(250, 6)
})

test('too few points in the band is a stated refusal', () => {
	const fit = fitCriticalPower([
		onModel(300, 250, 20_000),
		onModel(600, 250, 20_000),
	])
	expect(fit).toMatchObject({
		kind: 'refusal',
		refusal: 'insufficient-efforts',
	})
})

test('points bunched at one duration refuse rather than extrapolate', () => {
	// 480 / 300 = 1.6, under the required spread: the `1/t` term barely varies,
	// so CP and W′ trade off almost freely and the asymptote is a guess.
	const curve = [300, 400, 480].map((d) => onModel(d, 250, 20_000))
	expect(fitCriticalPower(curve)).toMatchObject({
		kind: 'refusal',
		refusal: 'insufficient-spread',
	})
})

test('a physiologically impossible fit is refused, not reported small', () => {
	// A curve that rises with duration inverts the model: the intercept goes
	// negative and there is no honest number to show.
	const curve: MergedPoint[] = [
		{
			durationSec: 120,
			value: 100,
			refusal: null,
			activityId: 'a',
			occurredAt: null,
		},
		{
			durationSec: 600,
			value: 300,
			refusal: null,
			activityId: 'a',
			occurredAt: null,
		},
		{
			durationSec: 1200,
			value: 400,
			refusal: null,
			activityId: 'a',
			occurredAt: null,
		},
	]
	expect(fitCriticalPower(curve)).toMatchObject({
		kind: 'refusal',
		refusal: 'implausible-fit',
	})
})

test('noise lowers r² without breaking the fit', () => {
	const curve = [120, 300, 600, 1200].map((d, i) => {
		const point = onModel(d, 250, 20_000, `activity-${i}`)
		return { ...point, value: point.value + (i % 2 === 0 ? 8 : -8) }
	})
	const fit = fitCriticalPower(curve)
	if (fit.kind !== 'fit') throw new Error('expected a fit')
	expect(fit.rSquared).toBeLessThan(1)
	expect(fit.rSquared).toBeGreaterThan(0.8)
	expect(fit.cpW).toBeGreaterThan(200)
	expect(fit.cpW).toBeLessThan(300)
})

test('the latest contributing effort is carried for the recency grade', () => {
	const curve = [120, 300, 600, 1200].map((d, i) => ({
		...onModel(d, 250, 20_000, `activity-${i}`),
		occurredAt: new Date(`2026-0${i + 1}-01`),
	}))
	const fit = fitCriticalPower(curve)
	if (fit.kind !== 'fit') throw new Error('expected a fit')
	expect(fit.latest).toEqual(new Date('2026-04-01'))
})
