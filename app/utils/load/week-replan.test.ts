import { expect, test } from 'vitest'
import { type WeeklyAdherence, adherenceBand } from './adherence.ts'
import { type TsbTrust } from './trustworthiness.ts'
import {
	REPLAN_DISTANCE_ROUND_M,
	REPLAN_DURATION_ROUND_SEC,
	REPLAN_MIN_SCALE,
	REPLAN_TSB_GATE,
	type AdjustableSession,
	decideWeekReplan,
	scaleStepQuantities,
} from './week-replan.ts'

// ── fixtures ──────────────────────────────────────────────────────────────

function trust(overrides: Partial<TsbTrust> = {}): TsbTrust {
	return {
		trustworthy: true,
		daysOfHistory: 60,
		requiredDays: 42,
		...overrides,
	}
}

/** A closed week's Weekly Plan Adherence at the given ratio (ADR 0019 band). */
function weekly(ratio: number): WeeklyAdherence {
	return {
		ratio,
		band: adherenceBand(ratio),
		sessionCount: 4,
		totalActual: Math.round(300 * ratio),
		totalPlanned: 300,
	}
}

/** The target week's adjustable-session summary — quantified cardio only. */
function sessions(...ids: string[]): AdjustableSession[] {
	return ids.map((id) => ({ id }))
}

// ── outcome: adjusted (over + trustworthy fatigued Form) ────────────────────

test('an over week with fatigued Form adjusts by the inverse overshoot', () => {
	const decision = decideWeekReplan({
		adherence: weekly(1.32),
		tsb: -12,
		trust: trust(),
		adjustableSessions: sessions('a', 'b'),
	})
	expect(decision.outcome).toBe('adjusted')
	if (decision.outcome !== 'adjusted') throw new Error('unreachable')
	// scale = 1 / weeklyRatio, above the floor here.
	expect(decision.scale).toBeCloseTo(1 / 1.32, 10)
	// Names signal AND action with real numbers (PRD copy pattern).
	expect(decision.reason).toBe(
		'Forrige uke ble 32 % tyngre enn planlagt, og formen var −12. Resten av ukas økter ble gjort ca. 24 % kortere.',
	)
	// Every adjustable session gets its own Replan Note, same honest copy.
	expect(decision.notes).toEqual([
		{
			sessionId: 'a',
			note: 'Forrige uke ble 32 % tyngre enn planlagt, og formen var −12. Denne økta ble gjort ca. 24 % kortere.',
		},
		{
			sessionId: 'b',
			note: 'Forrige uke ble 32 % tyngre enn planlagt, og formen var −12. Denne økta ble gjort ca. 24 % kortere.',
		},
	])
})

test('a huge overshoot is floored at the minimum scale (never cut more than 30%)', () => {
	expect(REPLAN_MIN_SCALE).toBe(0.7)
	const decision = decideWeekReplan({
		adherence: weekly(1.6),
		tsb: -20,
		trust: trust(),
		adjustableSessions: sessions('a'),
	})
	if (decision.outcome !== 'adjusted') throw new Error('expected adjusted')
	expect(decision.scale).toBe(REPLAN_MIN_SCALE)
	expect(decision.reason).toBe(
		'Forrige uke ble 60 % tyngre enn planlagt, og formen var −20. Resten av ukas økter ble gjort ca. 30 % kortere.',
	)
})

test('TSB exactly at the gate still adjusts (the gate is at-or-below)', () => {
	expect(REPLAN_TSB_GATE).toBe(0)
	const decision = decideWeekReplan({
		adherence: weekly(1.2),
		tsb: 0,
		trust: trust(),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('adjusted')
})

// ── outcome: no-change (over but fresh, on-target, under, nothing to touch) ──

test('an over week with fresh Form (TSB above the gate) holds — the body is absorbing it', () => {
	const decision = decideWeekReplan({
		adherence: weekly(1.32),
		tsb: 5,
		trust: trust(),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('no-change')
	if (decision.outcome !== 'no-change') throw new Error('unreachable')
	expect(decision.reason).toBe(
		'Forrige uke ble 32 % tyngre enn planlagt, men formen er +5 – du tåler det. Denne uka står som planlagt.',
	)
})

test('an under week holds with the bank-the-planned-work reason (never inflate load)', () => {
	const decision = decideWeekReplan({
		adherence: weekly(0.8),
		tsb: -12,
		trust: trust(),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('no-change')
	if (decision.outcome !== 'no-change') throw new Error('unreachable')
	expect(decision.reason).toBe(
		'Forrige uke ble 20 % lettere enn planlagt. Vi legger ikke på noe ekstra – denne uka står som planlagt.',
	)
})

test('an under week holds even during cold-start (adherence is independent of TSB trust)', () => {
	const decision = decideWeekReplan({
		adherence: weekly(0.8),
		tsb: null,
		trust: trust({ trustworthy: false, daysOfHistory: 12 }),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('no-change')
	if (decision.outcome !== 'no-change') throw new Error('unreachable')
	expect(decision.reason).toMatch(/Vi legger ikke på noe ekstra/)
})

test('an on-target week holds — the app looked and chose to hold', () => {
	const decision = decideWeekReplan({
		adherence: weekly(1.0),
		tsb: -12,
		trust: trust(),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('no-change')
	if (decision.outcome !== 'no-change') throw new Error('unreachable')
	expect(decision.reason).toBe(
		'Forrige uke gikk som planlagt. Denne uka står som den er.',
	)
})

test('nothing adjustable in the target week declines explicitly, never claims a tweak', () => {
	const decision = decideWeekReplan({
		adherence: weekly(1.32),
		tsb: -12,
		trust: trust(),
		adjustableSessions: [],
	})
	expect(decision.outcome).toBe('no-change')
	if (decision.outcome !== 'no-change') throw new Error('unreachable')
	expect(decision.reason).toBe(
		'Forrige uke ble 32 % tyngre enn planlagt og formen er −12, men det er ingen økter igjen denne uka som kan gjøres lettere. Vi endrer ingenting.',
	)
})

// ── outcome: insufficient-data (no adherence, untrustworthy or missing TSB) ──

test('a week with no measurable adherence is insufficient-data, not a fabricated hold', () => {
	const decision = decideWeekReplan({
		adherence: null,
		tsb: -12,
		trust: trust(),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('insufficient-data')
	if (decision.outcome !== 'insufficient-data') throw new Error('unreachable')
	expect(decision.reason).toBe(
		'Forrige uke hadde ingen planlagt belastning å måle mot, så vi har for lite å gå på. Denne uka står som planlagt.',
	)
})

test('an over week with untrustworthy TSB is insufficient-data with the day-N/42 phrasing', () => {
	const decision = decideWeekReplan({
		adherence: weekly(1.32),
		tsb: -30,
		trust: trust({ trustworthy: false, daysOfHistory: 12 }),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('insufficient-data')
	if (decision.outcome !== 'insufficient-data') throw new Error('unreachable')
	expect(decision.reason).toBe(
		'Forrige uke ble 32 % tyngre enn planlagt, men formtallet er først til å stole på etter 42 dager (dag 12 av 42). Vi endrer ingenting ennå.',
	)
})

test('an over week with no TSB at all is insufficient-data (no Form to corroborate)', () => {
	const decision = decideWeekReplan({
		adherence: weekly(1.32),
		tsb: null,
		trust: trust(),
		adjustableSessions: sessions('a'),
	})
	expect(decision.outcome).toBe('insufficient-data')
	if (decision.outcome !== 'insufficient-data') throw new Error('unreachable')
	expect(decision.reason).toBe(
		'Forrige uke ble 32 % tyngre enn planlagt, men vi har ikke noe formtall. Uten det endrer vi ingenting.',
	)
})

// ── scaleStepQuantities (volume-only rescale + rounding rules) ───────────────

test('durations scale and round to the nearest minute', () => {
	expect(REPLAN_DURATION_ROUND_SEC).toBe(60)
	// 2700 s × (1/1.32) = 2045.45… → 34 min.
	expect(
		scaleStepQuantities({ durationSec: 2700, distanceM: null }, 1 / 1.32),
	).toEqual({ durationSec: 2040, distanceM: null })
	// An exact multiple stays exact: 3600 s × 0.70 = 2520 s (42 min).
	expect(
		scaleStepQuantities({ durationSec: 3600, distanceM: null }, 0.7),
	).toEqual({ durationSec: 2520, distanceM: null })
})

test('distances scale and round to the nearest 100 m', () => {
	expect(REPLAN_DISTANCE_ROUND_M).toBe(100)
	// 10 000 m × (1/1.32) = 7575.75… → 7600 m.
	expect(
		scaleStepQuantities({ durationSec: null, distanceM: 10000 }, 1 / 1.32),
	).toEqual({ durationSec: null, distanceM: 7600 })
	// 8300 m × 0.70 = 5810 → 5800 m.
	expect(
		scaleStepQuantities({ durationSec: null, distanceM: 8300 }, 0.7),
	).toEqual({ durationSec: null, distanceM: 5800 })
})

test('a step carrying both quantities scales both', () => {
	expect(
		scaleStepQuantities({ durationSec: 1800, distanceM: 5000 }, 0.7),
	).toEqual({ durationSec: 1260, distanceM: 3500 })
})

test('null quantities pass through untouched (unquantified stays unquantified)', () => {
	expect(
		scaleStepQuantities({ durationSec: null, distanceM: null }, 0.7),
	).toEqual({ durationSec: null, distanceM: null })
})

test('rounding never zeroes or inflates a tiny quantity — downward only, never destroyed', () => {
	// 30 s × 0.70 = 21 s → nearest minute would be 0; the step survives unchanged
	// instead (clamped to its original — never longer, never gone).
	expect(
		scaleStepQuantities({ durationSec: 30, distanceM: null }, 0.7),
	).toEqual({ durationSec: 30, distanceM: null })
	// 90 s × 0.70 = 63 s → 60 s: a normal nearest-minute round.
	expect(
		scaleStepQuantities({ durationSec: 90, distanceM: null }, 0.7),
	).toEqual({ durationSec: 60, distanceM: null })
	// 40 m × 0.70 = 28 m → nearest 100 m would be 0; survives unchanged.
	expect(
		scaleStepQuantities({ durationSec: null, distanceM: 40 }, 0.7),
	).toEqual({ durationSec: null, distanceM: 40 })
})
