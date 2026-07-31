import { describe, expect, test } from 'vitest'
import {
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	derivedWeekTarget,
	phaseIndexForWeek,
	phaseWeekRoles,
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
			kind: 'endurance',
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

describe('phaseWeekRoles', () => {
	test('3:1 marks every fourth week of the phase as recovery', () => {
		expect(phaseWeekRoles({ weeks: 8, rhythm: '3:1', tapers: false })).toEqual([
			'loading',
			'loading',
			'loading',
			'recovery',
			'loading',
			'loading',
			'loading',
			'recovery',
		])
	})

	test('2:1 marks every third week', () => {
		expect(phaseWeekRoles({ weeks: 6, rhythm: '2:1', tapers: false })).toEqual([
			'loading',
			'loading',
			'recovery',
			'loading',
			'loading',
			'recovery',
		])
	})

	test('a rhythm of none marks no recovery week', () => {
		expect(phaseWeekRoles({ weeks: 3, rhythm: 'none', tapers: false })).toEqual(
			['loading', 'loading', 'loading'],
		)
	})

	test('a tapering phase tapers every week, whatever its rhythm', () => {
		expect(phaseWeekRoles({ weeks: 4, rhythm: '3:1', tapers: true })).toEqual([
			'taper',
			'taper',
			'taper',
			'taper',
		])
	})

	// The preview must read the *same* rule the saved season will, or an athlete
	// could accept a rhythm whose recovery weeks land elsewhere once stored.
	test('the preview agrees with the season derivation, week for week', () => {
		const phase = { weeks: 5, rhythm: '2:1' as const, tapers: false }
		expect(phaseWeekRoles(phase)).toEqual(
			Array.from({ length: phase.weeks }, (_, week) => weekRole([phase], week)),
		)
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
				kind: 'endurance' as const,
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

	test('a re-anchor swallows the boundary step of the segment it lands in', () => {
		// Both the boundary step and the re-anchor claim to set the block's opening
		// level. The re-anchor wins, because it *is* the athlete saying what they are
		// starting from here (ADR 0040 §5) — applying the step on top would discount a
		// number they had just typed.
		const dropping = track({
			anchors: [
				{ fromWeekIndex: 0, value: 50 },
				{ fromWeekIndex: 4, value: 40 },
			],
			segments: phases.map((_, phaseIndex) => ({
				kind: 'endurance' as const,
				phaseIndex,
				ramp: 0.05,
				boundaryStep: -0.2,
				recoveryCut: null,
				taperCut: null,
			})),
		})
		// Build opens on the re-anchored week, so its own step does not apply.
		expect(weekTarget(phases, dropping, 4)).toBeCloseTo(40, 6)
		// The next boundary is crossed normally: Peak's step still applies.
		const lastOfBuild = weekTarget(phases, dropping, 6)!
		expect(weekTarget(phases, dropping, 8)).toBeCloseTo(
			lastOfBuild * 0.8 * 1.05,
			6,
		)
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
					kind: 'endurance' as const,
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
				kind: 'endurance' as const,
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

describe('the two segment kinds', () => {
	/** Weeks 2–5 of the season, overlapping Base and Build (ADR 0047 §6). */
	const strengthBlock = {
		kind: 'strength' as const,
		startWeekIndex: 2,
		weeks: 4,
		ramp: 0.1,
		boundaryStep: -0.2,
		goal: 'hypertrophy' as const,
		sessionsPerWeek: 3,
		deloadCut: null,
		deloadWeeks: null,
	}

	test('a strength segment is stepped over by the phase walk, not priced by it', () => {
		const hybrid = track({ segments: [...track().segments, strengthBlock] })
		// A strength segment carries no phaseIndex, so no phase can pick it up — its
		// ramp and its boundary step belong to a walk of its own (ADR 0047 §6). Were
		// it addressed by position instead, week 2's 10% and week 4's −20% would show
		// up here.
		for (const week of [0, 2, 3, 4, 5, 9, 11]) {
			expect(weekTarget(phases, hybrid, week)).toBe(
				weekTarget(phases, track(), week),
			)
		}
	})

	test('a track whose segments are all strength derives no phase progression', () => {
		const lifting = track({ segments: [strengthBlock] })
		// Flat at the anchor with the role factors still applied: this walk has no
		// endurance segment to read a ramp from, which is exactly why a strength
		// track's weeks read Unavailable until its own walk exists.
		expect(weekTarget(phases, lifting, 0)).toBe(50)
		expect(weekTarget(phases, lifting, 2)).toBe(50)
		expect(weekTarget(phases, lifting, 3)).toBeCloseTo(
			50 * (1 - DEFAULT_RECOVERY_CUT),
			6,
		)
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

	test('the rule ignores an override on the very week it sets, so a revert has a number to restore', () => {
		expect(derivedWeekTarget(phases, withOverride, 3)).toBe(
			weekTarget(phases, track(), 3),
		)
	})

	test('the rule still applies the role factor on an overridden week', () => {
		// Week 3 is a recovery week. The override's 45 is *final* and takes no cut,
		// but what a revert restores is the cut off the last loading week — so the
		// role factor has to survive the override being ignored, not go with it.
		const reverted = derivedWeekTarget(phases, withOverride, 3)!
		expect(reverted).toBeCloseTo(
			derivedWeekTarget(phases, withOverride, 2)! * (1 - DEFAULT_RECOVERY_CUT),
			6,
		)
		expect(reverted).not.toBe(45)
	})

	test('an override outside the plan is still that week’s target, because the short-circuit is total', () => {
		const beyond = track({ overrides: [{ weekIndex: 12, value: 30 }] })
		// ADR 0044 §5: the short-circuit answers before anything else looks at the
		// season, so a row keyed outside the span reads back as authored. The rule has
		// nothing to say about a week the season does not contain — which is why
		// *authoring* such a week is refused by the service, not by this function.
		expect(weekTarget(phases, beyond, 12)).toBe(30)
		expect(derivedWeekTarget(phases, beyond, 12)).toBeNull()
	})
})
