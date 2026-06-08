import { expect, test } from 'vitest'
import { type WeeklyAdherence } from './adherence.ts'
import { SUSTAINED_WEEKS, reconcileCoach, sustainedAdherence } from './coach.ts'
import { type Readiness } from './readiness.ts'

// A weekly adherence fixture carrying only the band tone the streak logic reads.
function week(tone: WeeklyAdherence['band']['tone']): WeeklyAdherence {
	return {
		ratio: tone === 'under' ? 0.5 : tone === 'over' ? 1.5 : 1,
		band: { tone, label: tone, recommendation: '' },
		sessionCount: 1,
		totalActual: 1,
		totalPlanned: 1,
	}
}

// ── sustained streak detection (trailing weeks, current week included) ────────

test('two trailing under weeks are a sustained under deviation', () => {
	const result = sustainedAdherence([week('under'), week('under')])
	expect(result).toEqual({ tone: 'under', weeks: 2 })
})

test('two trailing over weeks are a sustained over deviation', () => {
	expect(sustainedAdherence([week('over'), week('over')])).toEqual({
		tone: 'over',
		weeks: 2,
	})
})

test('the threshold is two weeks — a single off week is not yet sustained', () => {
	expect(SUSTAINED_WEEKS).toBe(2)
	expect(sustainedAdherence([week('on-target'), week('under')])).toBeNull()
})

test('an on-target most-recent week clears the narrative even after a deviation', () => {
	expect(sustainedAdherence([week('under'), week('on-target')])).toBeNull()
})

test('flipping direction breaks the streak (under then over is not sustained)', () => {
	expect(sustainedAdherence([week('under'), week('over')])).toBeNull()
})

test('a longer run reports the actual streak length, not just the threshold', () => {
	expect(
		sustainedAdherence([week('under'), week('under'), week('under')]),
	).toEqual({ tone: 'under', weeks: 3 })
})

test('a week with no resolvable adherence (null) breaks the streak', () => {
	// Most recent is under, but the week before it is "—" (#119): only one
	// deviating week can be confirmed in a row, so it is not yet sustained.
	expect(sustainedAdherence([week('under'), null, week('under')])).toBeNull()
	expect(sustainedAdherence([week('under'), null])).toBeNull()
})

test('no weeks at all is not a sustained deviation', () => {
	expect(sustainedAdherence([])).toBeNull()
})

// ── reconciliation: two honest signals, one recommendation (safety-first) ─────

function readiness(tone: Readiness['tone']): Readiness {
	return { label: tone, recommendation: `form: ${tone}`, tone }
}

test('with no sustained deviation the plain Form readiness leads', () => {
	const r = reconcileCoach(readiness('fresh'), null)
	expect(r).toMatchObject({ tone: 'fresh', source: 'form' })
})

test('sustained under over a fresh Form: drifting leads (the headline case)', () => {
	// Form alone would say "go hard"; adherence adds the consequence.
	const r = reconcileCoach(readiness('fresh'), { tone: 'under', weeks: 2 })
	expect(r).toMatchObject({
		tone: 'under',
		source: 'adherence',
		label: 'Drifting',
	})
	expect(r!.recommendation).toMatch(/2 weeks/)
})

test('sustained over outranks everything — even a fresh Form', () => {
	const r = reconcileCoach(readiness('fresh'), { tone: 'over', weeks: 2 })
	expect(r).toMatchObject({
		tone: 'over',
		source: 'adherence',
		label: 'Overreaching',
	})
})

test('fatigued Form outranks sustained under: today’s acute reading wins', () => {
	const r = reconcileCoach(readiness('fatigued'), { tone: 'under', weeks: 2 })
	expect(r).toMatchObject({ tone: 'fatigued', source: 'form' })
})

test('sustained over outranks fatigued Form (overreaching is the lead risk)', () => {
	const r = reconcileCoach(readiness('fatigued'), { tone: 'over', weeks: 3 })
	expect(r).toMatchObject({ tone: 'over', source: 'adherence' })
})

test('cold-start (null readiness): a sustained deviation still speaks', () => {
	const r = reconcileCoach(null, { tone: 'under', weeks: 2 })
	expect(r).toMatchObject({ tone: 'under', source: 'adherence' })
})

test('cold-start with nothing sustained has nothing to say', () => {
	expect(reconcileCoach(null, null)).toBeNull()
})
