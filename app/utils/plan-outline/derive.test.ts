import { describe, expect, test } from 'vitest'
import {
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	phaseIndexForWeek,
	totalWeeks,
	weekRole,
	weekTarget,
	weekTargets,
	type PhaseSpec,
	type TrackSpec,
} from './derive.ts'

/** Base(4) → Build(4) → Peak(2) → Taper(2), the seeded shape of a 12-week plan. */
const phases: PhaseSpec[] = [
	{ weeks: 4, rhythm: '3:1', tapers: false },
	{ weeks: 4, rhythm: '3:1', tapers: false },
	{ weeks: 2, rhythm: 'none', tapers: false },
	{ weeks: 2, rhythm: 'none', tapers: true },
]

/** A runner authoring 50 km with a 5%/loading-week ramp in every segment. */
function track(overrides: Partial<TrackSpec> = {}): TrackSpec {
	return {
		currency: 'km',
		anchors: [{ fromWeekIndex: 0, value: 50 }],
		segments: phases.map((_, phaseIndex) => ({
			phaseIndex,
			ramp: 0.05,
			boundaryStep: null,
			recoveryCut: null,
			taperCut: null,
		})),
		overrides: [],
		...overrides,
	}
}

const round = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10)

describe('phase geometry', () => {
	test('phases are contiguous, so the plan length is their sum', () => {
		expect(totalWeeks(phases)).toBe(12)
		expect(phaseIndexForWeek(phases, 0)).toBe(0)
		expect(phaseIndexForWeek(phases, 3)).toBe(0)
		expect(phaseIndexForWeek(phases, 4)).toBe(1)
		expect(phaseIndexForWeek(phases, 11)).toBe(3)
	})

	test('a week outside the plan belongs to no phase', () => {
		expect(phaseIndexForWeek(phases, 12)).toBeNull()
		expect(phaseIndexForWeek(phases, -1)).toBeNull()
	})
})

describe('week roles', () => {
	test('3:1 makes every fourth week a recovery week', () => {
		expect(weekRole(phases, 0)).toBe('loading')
		expect(weekRole(phases, 2)).toBe('loading')
		expect(weekRole(phases, 3)).toBe('recovery')
		expect(weekRole(phases, 7)).toBe('recovery')
	})

	test('a rhythm of none has no recovery weeks at all', () => {
		expect(weekRole(phases, 8)).toBe('loading')
		expect(weekRole(phases, 9)).toBe('loading')
	})

	test('a tapering phase tapers throughout, not only in its last week', () => {
		expect(weekRole(phases, 10)).toBe('taper')
		expect(weekRole(phases, 11)).toBe('taper')
	})
})

describe('weekTarget', () => {
	test('the anchor week is the anchor, unramped', () => {
		expect(weekTarget(phases, track(), 0)).toBe(50)
	})

	test('the ramp steps once per loading week', () => {
		// Weeks 1 and 2 sit one and two loading weeks past the anchor.
		expect(round(weekTarget(phases, track(), 1))).toBe(52.5)
		expect(round(weekTarget(phases, track(), 2))).toBe(55.1)
	})

	test('a recovery week is a cut off the last loading week, and never the base for the next step', () => {
		const beforeRecovery = weekTarget(phases, track(), 2)!
		const recovery = weekTarget(phases, track(), 3)!
		const afterRecovery = weekTarget(phases, track(), 4)!

		expect(recovery).toBeCloseTo(beforeRecovery * (1 - DEFAULT_RECOVERY_CUT), 6)
		// Week 4 resumes one 5% step above week 2 — the loading week — not above
		// the deload. Resuming from the deload was the +50% cliff (ADR 0040).
		expect(afterRecovery).toBeCloseTo(beforeRecovery * 1.05, 6)
		expect(afterRecovery).toBeGreaterThan(recovery)
	})

	test('the boundary is an ordinary ramp step by default, so the cliff is unrepresentable', () => {
		const lastOfBase = weekTarget(phases, track(), 2)!
		const firstOfBuild = weekTarget(phases, track(), 4)!
		// No jump exists because there is nothing to jump from: one step, 5%.
		expect(firstOfBuild / lastOfBase).toBeCloseTo(1.05, 6)
	})

	test('an authored boundary step expresses a deliberate drop into an intensity block', () => {
		const dropping = track({
			segments: phases.map((_, phaseIndex) => ({
				phaseIndex,
				ramp: 0.05,
				boundaryStep: phaseIndex === 1 ? -0.2 : null,
				recoveryCut: null,
				taperCut: null,
			})),
		})
		const continuous = weekTarget(phases, track(), 4)!
		expect(weekTarget(phases, dropping, 4)).toBeCloseTo(continuous * 0.8, 6)
	})

	test('the taper descends progressively and reaches its full cut in the final week', () => {
		const targets = weekTargets(phases, track())
		const lastLoading = targets[9]!
		const taperOpens = targets[10]!
		const raceWeek = targets[11]!

		expect(taperOpens).toBeLessThan(lastLoading)
		expect(raceWeek).toBeLessThan(taperOpens)
		// Bosquet 2007: volume exponentially reduced, full cut at the event.
		expect(raceWeek).toBeCloseTo(lastLoading * (1 - DEFAULT_TAPER_CUT), 6)
	})

	test('2:1 accumulates fewer loading weeks than 3:1 over the same calendar time', () => {
		const masters: PhaseSpec[] = [{ weeks: 12, rhythm: '2:1', tapers: false }]
		const standard: PhaseSpec[] = [{ weeks: 12, rhythm: '3:1', tapers: false }]
		const oneSegment = {
			currency: 'km' as const,
			anchors: [{ fromWeekIndex: 0, value: 50 }],
			segments: [
				{
					phaseIndex: 0,
					ramp: 0.05,
					boundaryStep: null,
					recoveryCut: null,
					taperCut: null,
				},
			],
			overrides: [],
		}
		// More recovery weeks ⇒ fewer loading weeks ⇒ genuinely slower building.
		expect(weekTarget(masters, oneSegment, 11)!).toBeLessThan(
			weekTarget(standard, oneSegment, 11)!,
		)
	})

	test('a segment with no ramp holds its level flat', () => {
		const flat = track({
			segments: phases.map((_, phaseIndex) => ({
				phaseIndex,
				ramp: null,
				boundaryStep: null,
				recoveryCut: null,
				taperCut: null,
			})),
		})
		expect(weekTarget(phases, flat, 0)).toBe(50)
		expect(weekTarget(phases, flat, 2)).toBe(50)
		expect(weekTarget(phases, flat, 8)).toBe(50)
	})

	test('the derivation is indexed, not folded: a week computes on its own', () => {
		// Week 9 is identical whether or not any other week was ever asked for,
		// and identical to its position in a full-season pass.
		const standalone = weekTarget(phases, track(), 9)
		expect(standalone).toBe(weekTargets(phases, track())[9])
	})
})

describe('re-anchoring', () => {
	const reanchored = track({
		anchors: [
			{ fromWeekIndex: 0, value: 50 },
			{ fromWeekIndex: 6, value: 40 },
		],
	})

	test('a new anchor segment restarts the ramp from itself', () => {
		expect(weekTarget(phases, reanchored, 6)).toBe(40)
		// Week 7 is a recovery week and takes no step, so week 8 is one 5% step
		// above the new anchor — not two.
		expect(round(weekTarget(phases, reanchored, 8))).toBe(42)
	})

	test('it never rewrites the weeks before it', () => {
		expect(weekTarget(phases, reanchored, 0)).toBe(
			weekTarget(phases, track(), 0),
		)
		expect(weekTarget(phases, reanchored, 2)).toBe(
			weekTarget(phases, track(), 2),
		)
	})

	test('a week before the first anchor is Unavailable, never a guess', () => {
		const late = track({ anchors: [{ fromWeekIndex: 4, value: 50 }] })
		expect(weekTarget(phases, late, 0)).toBeNull()
		expect(weekTarget(phases, late, 4)).toBe(50)
	})
})

describe('overrides', () => {
	const withOverride = track({ overrides: [{ weekIndex: 3, value: 45 }] })

	test('an override is the week’s final target, with no role factor on top', () => {
		// Week 3 is a recovery week; 45 means 45, not 45 × 0.7.
		expect(weekTarget(phases, withOverride, 3)).toBe(45)
	})

	test('an override is a leaf and is never folded into the following weeks', () => {
		expect(weekTarget(phases, withOverride, 4)).toBe(
			weekTarget(phases, track(), 4),
		)
		expect(weekTarget(phases, withOverride, 9)).toBe(
			weekTarget(phases, track(), 9),
		)
	})

	test('zero expresses a week without training, needing no flag', () => {
		const off = track({ overrides: [{ weekIndex: 5, value: 0 }] })
		expect(weekTarget(phases, off, 5)).toBe(0)
	})
})
