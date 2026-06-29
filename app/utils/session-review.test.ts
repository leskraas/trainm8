import { expect, test } from 'vitest'
import { buildReviewComparison, type ReviewSession } from './session-review.ts'

function makeSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
	return {
		tssValue: null,
		plannedTssValue: null,
		workout: {
			blocks: [
				{
					repeatCount: 1,
					steps: [{ durationSec: 1800, distanceM: null }],
				},
			],
		},
		recording: { durationSec: 1860, distanceM: 8200 },
		...overrides,
	}
}

// ── TSS + Adherence Band ──────────────────────────────────────────────────────

test('pairs actual and Planned TSS and bands them when both exist', () => {
	const c = buildReviewComparison(
		makeSession({ tssValue: 90, plannedTssValue: 88 }),
	)
	expect(c.tss.actual).toBe(90)
	expect(c.tss.planned).toBe(88)
	expect(c.tss.band?.tone).toBe('on-target')
})

test('over-target actual TSS bands as over', () => {
	const c = buildReviewComparison(
		makeSession({ tssValue: 130, plannedTssValue: 100 }),
	)
	expect(c.tss.band?.tone).toBe('over')
})

test('no band when Planned TSS is unavailable (never a fabricated 100%)', () => {
	const c = buildReviewComparison(
		makeSession({ tssValue: 90, plannedTssValue: null }),
	)
	expect(c.tss.actual).toBe(90)
	expect(c.tss.planned).toBeNull()
	expect(c.tss.band).toBeNull()
})

// ── duration ──────────────────────────────────────────────────────────────────

test('sums prescribed duration (× repeatCount) and reads actual moving time', () => {
	const c = buildReviewComparison(
		makeSession({
			workout: {
				blocks: [
					{ repeatCount: 4, steps: [{ durationSec: 300, distanceM: null }] },
				],
			},
			recording: { durationSec: 1260, distanceM: null },
		}),
	)
	expect(c.duration.planned).toBe(1200) // 4 × 5 min
	expect(c.duration.actual).toBe(1260)
})

test('planned duration is null when no step authors a duration', () => {
	const c = buildReviewComparison(
		makeSession({
			workout: {
				blocks: [{ repeatCount: 1, steps: [{ durationSec: null, distanceM: 5000 }] }],
			},
		}),
	)
	expect(c.duration.planned).toBeNull()
})

// ── distance ──────────────────────────────────────────────────────────────────

test('sums prescribed distance and reads actual distance', () => {
	const c = buildReviewComparison(
		makeSession({
			workout: {
				blocks: [{ repeatCount: 2, steps: [{ durationSec: null, distanceM: 2000 }] }],
			},
			recording: { durationSec: 900, distanceM: 4100 },
		}),
	)
	expect(c.distance.planned).toBe(4000)
	expect(c.distance.actual).toBe(4100)
})

test('planned distance is null for a duration-only prescription', () => {
	const c = buildReviewComparison(makeSession())
	expect(c.distance.planned).toBeNull()
	expect(c.distance.actual).toBe(8200)
})

// ── recording-only / no-recording honesty ─────────────────────────────────────

test('recording-only session has no planned side', () => {
	const c = buildReviewComparison(
		makeSession({
			tssValue: 75,
			plannedTssValue: null,
			workout: null,
			recording: { durationSec: 3000, distanceM: 10000 },
		}),
	)
	expect(c.tss.planned).toBeNull()
	expect(c.duration.planned).toBeNull()
	expect(c.distance.planned).toBeNull()
	expect(c.duration.actual).toBe(3000)
	expect(c.distance.actual).toBe(10000)
})

test('session without a recording has no actual side', () => {
	const c = buildReviewComparison(
		makeSession({ tssValue: null, recording: null }),
	)
	expect(c.duration.actual).toBeNull()
	expect(c.distance.actual).toBeNull()
})
