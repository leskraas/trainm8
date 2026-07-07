import { expect, test } from 'vitest'
import { type LedgerSession } from '#app/utils/training.server.ts'
import { type CoachRecommendation } from './coach.ts'
import {
	EASED_CAP_MIN,
	MISS_LOOKBACK_DAYS,
	type NextPlannedSession,
	type RecentMiss,
	decideSessionNudge,
	missEasePendingReason,
	selectQualifyingMiss,
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

// ── selectQualifyingMiss (qualifying-miss selection, PRD #163 A2–A4) ─────────

// A fixed Wednesday at local noon — TZ-independent because the selection works
// in local time and noon avoids DST edges. The Monday before it is Dec 31.
const NOW = new Date('2030-01-02T12:00:00')

type Workout = NonNullable<LedgerSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

function cardioStep(
	intensity: string | null,
	durationSec: number | null,
	orderIndex: number,
): WorkoutStep {
	return {
		id: `step-${orderIndex}`,
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex,
		durationSec,
		distanceM: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
	}
}

/** A workout with a single block carrying the given steps. */
function workoutWith(steps: WorkoutStep[], discipline = 'run'): Workout {
	return {
		id: 'workout-1',
		title: 'Planned Session',
		description: null,
		discipline,
		intent: 'tempo',
		blocks: [
			{ id: 'block-1', name: 'Main', orderIndex: 0, repeatCount: 1, steps },
		],
	}
}

/** A prescription carrying intensity above Z2 (threshold work) — a "key" session. */
function keyWorkout(discipline = 'run'): Workout {
	return workoutWith(
		[cardioStep('easy', 600, 0), cardioStep('threshold', 1200, 1)],
		discipline,
	)
}

/** An easy endurance prescription — never a qualifying miss. */
function easyWorkout(): Workout {
	return workoutWith([cardioStep('endurance', 3600, 0)])
}

function ledgerSession(overrides: Partial<LedgerSession> = {}): LedgerSession {
	return {
		id: 'session-1',
		// The Monday before NOW — past + still scheduled ⇒ derived missed.
		scheduledAt: new Date('2029-12-31T08:00:00'),
		status: 'scheduled',
		source: 'generated',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: keyWorkout(),
		recording: null,
		sessionLog: null,
		...overrides,
	}
}

test('a key miss inside the lookback window qualifies, summarized by weekday and discipline', () => {
	expect(selectQualifyingMiss([ledgerSession()], NOW)).toEqual({
		discipline: 'run',
		label: 'Monday',
	})
})

test('an easy or recovery miss never qualifies (it does not move the plan)', () => {
	expect(
		selectQualifyingMiss([ledgerSession({ workout: easyWorkout() })], NOW),
	).toBeNull()
})

test('a key miss outside the 7-day lookback window does not qualify', () => {
	expect(MISS_LOOKBACK_DAYS).toBe(7)
	expect(
		selectQualifyingMiss(
			[ledgerSession({ scheduledAt: new Date('2029-12-24T08:00:00') })],
			NOW,
		),
	).toBeNull()
})

test('a completed session never qualifies, whatever its intensity', () => {
	expect(
		selectQualifyingMiss([ledgerSession({ status: 'completed' })], NOW),
	).toBeNull()
})

test('a future planned session never qualifies (nothing has been missed yet)', () => {
	expect(
		selectQualifyingMiss(
			[ledgerSession({ scheduledAt: new Date('2030-01-04T08:00:00') })],
			NOW,
		),
	).toBeNull()
})

test('a stored skipped key session qualifies like a silently missed one', () => {
	expect(
		selectQualifyingMiss(
			[
				ledgerSession({
					status: 'skipped',
					scheduledAt: new Date('2030-01-01T08:00:00'),
				}),
			],
			NOW,
		),
	).toEqual({ discipline: 'run', label: 'Tuesday' })
})

test('a missed strength session never qualifies (no cardio zone model to call it key)', () => {
	const strengthStep = { ...cardioStep(null, null, 0), kind: 'strength' }
	expect(
		selectQualifyingMiss(
			[ledgerSession({ workout: workoutWith([strengthStep], 'strength') })],
			NOW,
		),
	).toBeNull()
})

test('with several qualifying misses only the most recent is selected (misses never compound)', () => {
	const miss = selectQualifyingMiss(
		[
			ledgerSession({
				id: 'older',
				scheduledAt: new Date('2029-12-29T08:00:00'),
			}),
			ledgerSession({
				id: 'newer',
				scheduledAt: new Date('2030-01-01T08:00:00'),
				workout: keyWorkout('bike'),
			}),
		],
		NOW,
	)
	expect(miss).toEqual({ discipline: 'bike', label: 'Tuesday' })
})

// ── the miss branch (a recent key miss as the fourth signal, #185) ───────────

function recentMiss(overrides: Partial<RecentMiss> = {}): RecentMiss {
	return { discipline: 'run', label: 'Monday', ...overrides }
}

test('a recent key miss eases the next cardio session with the miss-driven reason', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('neutral'),
		trust: trust(),
		tsb: 1,
		sustained: null,
		recentMiss: recentMiss(),
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
	expect(nudge.reason).toBe(
		"You missed Monday's session — eased Tuesday's session to a Z2 endurance hour so you don't stack hard days after a gap.",
	)
})

test('a recent key miss overrides the fresh hold (the gap outranks feeling fresh)', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fresh'),
		trust: trust(),
		tsb: 6,
		sustained: null,
		recentMiss: recentMiss(),
		nextSession: cardioSession({ label: 'Tuesday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		"You missed Monday's session — eased Tuesday's session to a Z2 endurance hour so you don't stack hard days after a gap.",
	)
})

test('a miss-eased session below the cap keeps its own duration in the reason', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('neutral'),
		trust: trust(),
		tsb: 1,
		sustained: null,
		recentMiss: recentMiss(),
		nextSession: cardioSession({ durationMin: 40, label: 'Tuesday' }),
	})
	if (nudge.outcome !== 'eased') throw new Error('expected eased')
	expect(nudge.target.durationMin).toBe(40)
	expect(nudge.reason).toBe(
		"You missed Monday's session — eased Tuesday's session to a 40-minute Z2 endurance session so you don't stack hard days after a gap.",
	)
})

test('a recent key miss with a strength next session is held with the honest strength reason', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('neutral'),
		trust: trust(),
		tsb: 1,
		sustained: null,
		recentMiss: recentMiss(),
		nextSession: cardioSession({ discipline: 'strength', label: 'Tuesday' }),
	})
	expect(nudge.outcome).toBe('held')
	if (nudge.outcome !== 'held') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		"You missed Monday's session — next session is strength, no Form-based ease yet.",
	)
})

test('a recent key miss still eases during cold-start (ledger-derived, not Form-derived)', () => {
	const nudge = decideSessionNudge({
		// Below the trust gate and no sustained deviation → reconcileCoach null;
		// the miss speaks anyway, mirroring how sustained over already does.
		recommendation: null,
		trust: trust({ trustworthy: false, daysOfHistory: 12 }),
		tsb: null,
		sustained: null,
		recentMiss: recentMiss(),
		nextSession: cardioSession({ label: 'Friday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		"You missed Monday's session — eased Friday's session to a Z2 endurance hour so you don't stack hard days after a gap.",
	)
})

test('a fatigued back-off subsumes a co-occurring miss (never double-counted)', () => {
	const nudge = decideSessionNudge({
		recommendation: formCoach('fatigued'),
		trust: trust(),
		tsb: -18,
		sustained: null,
		recentMiss: recentMiss(),
		nextSession: cardioSession({ discipline: 'run', label: 'Tuesday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		"Form is low (TSB −18) — eased Tuesday's session to a Z2 endurance hour.",
	)
})

test('a sustained-over back-off subsumes a co-occurring miss too', () => {
	const nudge = decideSessionNudge({
		recommendation: adherenceCoach('over'),
		trust: trust(),
		tsb: 4,
		sustained: { tone: 'over', weeks: 3 },
		recentMiss: recentMiss(),
		nextSession: cardioSession({ discipline: 'bike', label: 'Wednesday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.reason).toBe(
		"Over your plan 3 weeks — eased Wednesday's session to a Z2 endurance hour.",
	)
})

test('a recent key miss eases even under a sustained-under call (the gap is the fresher signal)', () => {
	const nudge = decideSessionNudge({
		recommendation: adherenceCoach('under'),
		trust: trust(),
		tsb: 6,
		sustained: { tone: 'under', weeks: 2 },
		recentMiss: recentMiss(),
		nextSession: cardioSession({ label: 'Tuesday' }),
	})
	expect(nudge.outcome).toBe('eased')
	if (nudge.outcome !== 'eased') throw new Error('unreachable')
	expect(nudge.reason).toMatch(/^You missed Monday's session/)
})

test('no qualifying miss leaves every existing outcome unchanged', () => {
	const held = decideSessionNudge({
		recommendation: formCoach('fresh'),
		trust: trust(),
		tsb: 6,
		sustained: null,
		recentMiss: null,
		nextSession: cardioSession(),
	})
	expect(held.outcome).toBe('held')
	if (held.outcome !== 'held') throw new Error('unreachable')
	expect(held.reason).toBe('Form is fresh (TSB +6) — your next session stands.')

	const cold = decideSessionNudge({
		recommendation: null,
		trust: trust({ trustworthy: false, daysOfHistory: 12 }),
		tsb: null,
		sustained: null,
		recentMiss: null,
		nextSession: cardioSession(),
	})
	expect(cold.outcome).toBe('unavailable')
	if (cold.outcome !== 'unavailable') throw new Error('unreachable')
	expect(cold.reason).toBe(
		'Your Form reading is reliable after 42 days — day 12/42.',
	)
})

test('none still wins over a miss when there is no session to touch', () => {
	const nudge = decideSessionNudge({
		recommendation: null,
		trust: trust(),
		tsb: null,
		sustained: null,
		recentMiss: recentMiss(),
		nextSession: null,
	})
	expect(nudge).toEqual({ outcome: 'none' })
})

test("the pending-ease held reason is composed by the core for slice 3's honesty guard", () => {
	expect(missEasePendingReason(recentMiss())).toBe(
		"You missed Monday's session — easing your next session.",
	)
})
