import { expect, test } from 'vitest'
import { type CoachRecommendation } from './coach.ts'
import {
	EASED_CAP_MIN,
	type NextPlannedSession,
	decideSessionNudge,
} from './session-nudge.ts'
import { type TsbTrust } from './trustworthiness.ts'

// ── fixtures ──────────────────────────────────────────────────────────────

function trust(overrides: Partial<TsbTrust> = {}): TsbTrust {
	return {
		trustworthy: true,
		daysOfHistory: 60,
		requiredDays: 42,
		...overrides,
	}
}

// A form-sourced recommendation carrying only the tone the decision reads.
function formCoach(tone: CoachRecommendation['tone']): CoachRecommendation {
	return { label: tone, recommendation: `form: ${tone}`, tone, source: 'form' }
}

// An adherence-sourced recommendation (sustained deviation leading).
function adherenceCoach(tone: 'under' | 'over'): CoachRecommendation {
	return {
		label: tone === 'over' ? 'Overreaching' : 'Drifting',
		recommendation: `adherence: ${tone}`,
		tone,
		source: 'adherence',
	}
}

function cardioSession(
	overrides: Partial<NextPlannedSession> = {},
): NextPlannedSession {
	return { discipline: 'run', label: 'Tuesday', durationMin: 90, ...overrides }
}

// ── outcome: eased (back-off on a cardio session) ───────────────────────────

test('fatigued Form eases the next cardio session', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fatigued'),
		trust: trust(),
		tsb: -18,
		sustained: null,
		nextSession: cardioSession({ discipline: 'run', label: 'Tuesday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.target).toEqual({
		discipline: 'run',
		zone: 'Z2',
		intent: 'endurance',
		durationMin: 60,
	})
	// Names signal AND action with real numbers (PRD example).
	expect(nudge.reason).toBe(
		"Form is low (TSB −18) — eased Tuesday's session to a Z2 endurance hour.",
	)
})

test('sustained over eases the next cardio session', () => {
	const nudge = decideSessionNudge({
		recommendation: adherenceCoach('over'),
		trust: trust(),
		tsb: 4,
		sustained: { tone: 'over', weeks: 3 },
		nextSession: cardioSession({ discipline: 'bike', label: 'Wednesday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.target.discipline).toBe('bike')
	expect(nudge.reason).toBe(
		"Over your plan 3 weeks — eased Wednesday's session to a Z2 endurance hour.",
	)
})

test('sustained over eases even during cold-start (adherence is independent of TSB trust)', () => {
	const nudge = decideSessionNudge({
		// During cold-start readiness is null, so the reconciled call is the
		// adherence-led "over"; the ease still applies.
		recommendation: adherenceCoach('over'),
		trust: trust({ trustworthy: false, daysOfHistory: 12 }),
		tsb: null,
		sustained: { tone: 'over', weeks: 2 },
		nextSession: cardioSession({ discipline: 'run', label: 'Friday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		"Over your plan 2 weeks — eased Friday's session to a Z2 endurance hour.",
	)
})

test('the eased duration is capped at an hour', () => {
	expect(EASED_CAP_MIN).toBe(60)
	const nudge = decideSessionNudge({
		recommendation: formCoach('fatigued'),
		trust: trust(),
		tsb: -20,
		sustained: null,
		nextSession: cardioSession({ durationMin: 120 }),
	})
	if (nudge.outcome !== 'eased') throw new Error('expected eased')
	expect(nudge.target.durationMin).toBe(60)
	expect(nudge.reason).toMatch(/a Z2 endurance hour/)
})

test('a shorter session keeps its own duration (below the cap)', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fatigued'),
		trust: trust(),
		tsb: -20,
		sustained: null,
		nextSession: cardioSession({ durationMin: 40, label: 'Monday' }),
	})
	if (nudge.outcome !== 'eased') throw new Error('expected eased')
	expect(nudge.target.durationMin).toBe(40)
	expect(nudge.reason).toBe(
		"Form is low (TSB −20) — eased Monday's session to a 40-minute Z2 endurance session.",
	)
})

// ── outcome: held (fresh / neutral / under) ─────────────────────────────────

test('fresh Form holds the next session (never eases on a fresh signal)', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fresh'),
		trust: trust(),
		tsb: 6,
		sustained: null,
		nextSession: cardioSession(),
	})
	expect(nudge.outcome).toBe('held')
	if (nudge.outcome !== 'held') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		'Form is fresh (TSB +6) — your next session stands.',
	)
})

test('neutral Form holds the next session', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('neutral'),
		trust: trust(),
		tsb: 1,
		sustained: null,
		nextSession: cardioSession(),
	})
	expect(nudge.outcome).toBe('held')
	if (nudge.outcome !== 'held') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		'Form is neutral (TSB +1) — your next session stands.',
	)
})

test('sustained under holds the next session (a nudge never reduces load when under-training)', () => {
	const nudge = decideSessionNudge({
		recommendation: adherenceCoach('under'),
		trust: trust(),
		tsb: 6,
		sustained: { tone: 'under', weeks: 2 },
		nextSession: cardioSession(),
	})
	expect(nudge.outcome).toBe('held')
	if (nudge.outcome !== 'held') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		'Under your plan 2 weeks — your next session stands.',
	)
})

// ── outcome: held (strength next — no zone model to ease into) ───────────────

test('a strength next session is held with an honest reason even on a back-off signal', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fatigued'),
		trust: trust(),
		tsb: -18,
		sustained: null,
		nextSession: cardioSession({ discipline: 'strength', label: 'Tuesday' }),
	})
	expect(nudge.outcome).toBe('held')
	if (nudge.outcome !== 'held') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		'Next session is strength — no Form-based ease yet.',
	)
})

test('a strength next session holds under sustained over too (no fabricated zone ease)', () => {
	const nudge = decideSessionNudge({
		recommendation: adherenceCoach('over'),
		trust: trust(),
		tsb: 3,
		sustained: { tone: 'over', weeks: 2 },
		nextSession: cardioSession({ discipline: 'strength' }),
	})
	if (nudge.outcome !== 'held') throw new Error('expected held')
	expect(nudge.reason).toBe(
		'Next session is strength — no Form-based ease yet.',
	)
})

// ── outcome: unavailable (cold-start, day N/42) ─────────────────────────────

test('cold-start with no reconciled call is unavailable with the day-N/42 phrasing', () => {
	const nudge = decideSessionNudge({
		// Below the trust gate and no sustained deviation → reconcileCoach null.
		recommendation: null,
		trust: trust({ trustworthy: false, daysOfHistory: 12 }),
		tsb: null,
		sustained: null,
		nextSession: cardioSession(),
	})
	expect(nudge.outcome).toBe('unavailable')
	if (nudge.outcome !== 'unavailable') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		'Your Form reading is reliable after 42 days — day 12/42.',
	)
})

// ── outcome: none (no upcoming planned session) ─────────────────────────────

test('no upcoming planned session yields none — the card says nothing', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fresh'),
		trust: trust(),
		tsb: 6,
		sustained: null,
		nextSession: null,
	})
	expect(nudge).toEqual({ outcome: 'none' })
})

test('none wins even during a back-off signal when there is no session to touch', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fatigued'),
		trust: trust(),
		tsb: -18,
		sustained: null,
		nextSession: null,
	})
	expect(nudge).toEqual({ outcome: 'none' })
})
