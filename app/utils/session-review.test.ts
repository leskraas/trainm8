import { expect, test } from 'vitest'
import { buildReviewComparison, type ReviewSession } from './session-review.ts'

/** The comparison with no thresholds: only authored times and paces count. */
const reviewOf = (session: ReviewSession) => buildReviewComparison(session, {})

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
	const c = reviewOf(makeSession({ tssValue: 90, plannedTssValue: 88 }))
	expect(c.tss.actual).toBe(90)
	expect(c.tss.planned).toBe(88)
	expect(c.tss.band?.tone).toBe('on-target')
})

test('over-target actual TSS bands as over', () => {
	const c = reviewOf(makeSession({ tssValue: 130, plannedTssValue: 100 }))
	expect(c.tss.band?.tone).toBe('over')
})

test('no band when Planned TSS is unavailable (never a fabricated 100%)', () => {
	const c = reviewOf(makeSession({ tssValue: 90, plannedTssValue: null }))
	expect(c.tss.actual).toBe(90)
	expect(c.tss.planned).toBeNull()
	expect(c.tss.band).toBeNull()
})

// ── duration ──────────────────────────────────────────────────────────────────

test('sums prescribed duration (× repeatCount) and reads actual moving time', () => {
	const c = reviewOf(
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
	// Every step states its time: no translation, no `≈`.
	expect(c.duration.plannedEstimated).toBe(false)
})

test('planned duration is null when a step cannot be timed, never a short total', () => {
	const c = reviewOf(
		makeSession({
			workout: {
				blocks: [
					{
						repeatCount: 1,
						steps: [
							{ durationSec: 900, distanceM: null },
							{ durationSec: null, distanceM: 8000 },
						],
					},
				],
			},
		}),
	)
	expect(c.duration.planned).toBeNull()
})

test('planned duration times a distance step at the athlete’s threshold pace', () => {
	const c = buildReviewComparison(
		makeSession({
			workout: {
				discipline: 'run',
				blocks: [
					{
						repeatCount: 1,
						steps: [
							{ durationSec: 900, distanceM: null },
							{
								intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z4' }),
								durationSec: null,
								distanceM: 8000,
							},
						],
					},
				],
			},
		}),
		{
			run: {
				lthr: null,
				maxHr: null,
				ftp: null,
				runPowerThresholdW: null,
				thresholdPaceSecPerKm: 240,
				cssSecPer100m: null,
				zoneSystem: null,
				zoneOverrides: null,
			},
		},
	)
	expect(c.duration.planned).toBe(900 + 8 * 240)
	// Timed through a pace: the cell reads `≈`, as the row and the tiles do.
	expect(c.duration.plannedEstimated).toBe(true)
})

test('planned duration is null when no step authors a duration', () => {
	const c = reviewOf(
		makeSession({
			workout: {
				blocks: [
					{ repeatCount: 1, steps: [{ durationSec: null, distanceM: 5000 }] },
				],
			},
		}),
	)
	expect(c.duration.planned).toBeNull()
})

// ── distance ──────────────────────────────────────────────────────────────────

test('sums prescribed distance and reads actual distance', () => {
	const c = reviewOf(
		makeSession({
			workout: {
				blocks: [
					{ repeatCount: 2, steps: [{ durationSec: null, distanceM: 2000 }] },
				],
			},
			recording: { durationSec: 900, distanceM: 4100 },
		}),
	)
	expect(c.distance.planned).toBe(4000)
	expect(c.distance.actual).toBe(4100)
})

test('planned distance is null for a duration-only prescription', () => {
	const c = reviewOf(makeSession())
	expect(c.distance.planned).toBeNull()
	expect(c.distance.actual).toBe(8200)
})

// ── recording-only / no-recording honesty ─────────────────────────────────────

test('recording-only session has no planned side', () => {
	const c = reviewOf(
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
	const c = reviewOf(makeSession({ tssValue: null, recording: null }))
	expect(c.duration.actual).toBeNull()
	expect(c.distance.actual).toBeNull()
})
