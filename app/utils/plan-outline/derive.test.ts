import { describe, expect, test } from 'vitest'
import {
	DEFAULT_DELOAD_CUT,
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	phaseIndexForWeek,
	phaseWeekRoles,
	strengthWeekRole,
	strengthWeekTarget,
	strengthWeekTargets,
	totalWeeks,
	weekRole,
	weekTarget,
	weekTargets,
	type PhaseSpec,
	type StrengthSegmentSpec,
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

/**
 * A lifter's strength Training Track segment: four weeks from the plan's first,
 * +10% a loading week, with the deload weeks and the cut left to the convention
 * (ADR 0047 §6).
 */
function strengthSegment(
	overrides: Partial<StrengthSegmentSpec> = {},
): StrengthSegmentSpec {
	return {
		kind: 'strength',
		startWeekIndex: 0,
		weeks: 4,
		ramp: 0.1,
		boundaryStep: null,
		goal: 'hypertrophy',
		sessionsPerWeek: 3,
		deloadCut: null,
		deloadWeeks: null,
		...overrides,
	}
}

/** A lifter authoring 12 sets/wk, over the same phases the runner's season has. */
function strengthTrack(overrides: Partial<TrackSpec> = {}): TrackSpec {
	return {
		currency: 'sets',
		anchors: [{ fromWeekIndex: 0, value: 12 }],
		segments: [strengthSegment()],
		overrides: [],
		...overrides,
	}
}

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
})

describe('strength week roles', () => {
	test('the deload closes the segment and every week before it loads', () => {
		const lifting = strengthTrack()
		expect(strengthWeekRole(lifting, 0)).toBe('loading')
		expect(strengthWeekRole(lifting, 2)).toBe('loading')
		expect(strengthWeekRole(lifting, 3)).toBe('deload')
	})

	test('an unset deloadWeeks follows the convention of one week', () => {
		const authored = strengthTrack({
			segments: [strengthSegment({ deloadWeeks: 1 })],
		})
		expect(strengthWeekTargets(phases, strengthTrack()).slice(0, 4)).toEqual(
			strengthWeekTargets(phases, authored).slice(0, 4),
		)
	})

	test('a multi-week deload covers that many weeks of the segment tail', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment({ weeks: 6, deloadWeeks: 2 })],
		})
		expect(strengthWeekRole(lifting, 3)).toBe('loading')
		expect(strengthWeekRole(lifting, 4)).toBe('deload')
		expect(strengthWeekRole(lifting, 5)).toBe('deload')
	})

	test('a deload longer than the segment is clamped to it, so every week deloads', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment({ weeks: 2, deloadWeeks: 5 })],
		})
		expect(strengthWeekRole(lifting, 0)).toBe('deload')
		expect(strengthWeekRole(lifting, 1)).toBe('deload')
	})

	test('a week outside every strength segment has no role at all', () => {
		const lifting = strengthTrack()
		expect(strengthWeekRole(lifting, 4)).toBeNull()
		expect(strengthWeekRole(lifting, 11)).toBeNull()
	})

	test('a strength week is never recovery and never taper: the phase rhythm has no effect', () => {
		const wholeSeason = strengthTrack({
			segments: [strengthSegment({ weeks: 12 })],
		})
		// Week 3 recovers and week 11 tapers on the *endurance* walk. Neither role
		// exists here: a strength track has no taper mechanism, and its deload comes
		// from the segment's own tail (ADR 0047 §6).
		expect(weekRole(phases, 3)).toBe('recovery')
		expect(strengthWeekRole(wholeSeason, 3)).toBe('loading')
		expect(weekRole(phases, 11)).toBe('taper')
		expect(strengthWeekRole(wholeSeason, 11)).toBe('deload')
	})
})

describe('strengthWeekTarget', () => {
	test('the anchor week is the anchor, unramped', () => {
		expect(strengthWeekTarget(phases, strengthTrack(), 0)).toBe(12)
	})

	test('the ramp steps once per loading week', () => {
		expect(round(strengthWeekTarget(phases, strengthTrack(), 1))).toBe(13.2)
		expect(round(strengthWeekTarget(phases, strengthTrack(), 2))).toBe(14.5)
	})

	test('a deload week is a cut off the last loading week, flat across its length', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment({ weeks: 5, deloadWeeks: 2 })],
		})
		const lastLoading = strengthWeekTarget(phases, lifting, 2)!
		// Both deload weeks read the same number: the convention is −50% over one
		// week (Bell 2025), and a longer deload holds it rather than descending like
		// the endurance taper.
		expect(strengthWeekTarget(phases, lifting, 3)).toBeCloseTo(
			lastLoading * (1 - DEFAULT_DELOAD_CUT),
			6,
		)
		expect(strengthWeekTarget(phases, lifting, 4)).toBeCloseTo(
			lastLoading * (1 - DEFAULT_DELOAD_CUT),
			6,
		)
	})

	test('a deload week never advances the ramp index, so the next block resumes above the last loading week', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment(), strengthSegment({ startWeekIndex: 4 })],
		})
		const lastLoading = strengthWeekTarget(phases, lifting, 2)!
		const deload = strengthWeekTarget(phases, lifting, 3)!
		const resumes = strengthWeekTarget(phases, lifting, 4)!

		expect(deload).toBeCloseTo(lastLoading * (1 - DEFAULT_DELOAD_CUT), 6)
		// One 10% step above the last *loading* week — never above the deload, which
		// is the +50% cliff ADR 0040 §3 removed.
		expect(resumes).toBeCloseTo(lastLoading * 1.1, 6)
		expect(resumes).toBeGreaterThan(deload)
	})

	test('the ramp product freezes at the last loading week, across a gap as well as a deload', () => {
		// Weeks 0–3 lift, weeks 4–5 do not, weeks 6–9 lift again. The gap adds no
		// step and resets nothing: week 6 opens one step above week 2.
		const lifting = strengthTrack({
			segments: [
				strengthSegment({ weeks: 3, deloadWeeks: 0 }),
				strengthSegment({ startWeekIndex: 6, weeks: 4 }),
			],
		})
		const lastLoading = strengthWeekTarget(phases, lifting, 2)!
		expect(strengthWeekTarget(phases, lifting, 6)).toBeCloseTo(
			lastLoading * 1.1,
			6,
		)
	})

	test('the Block Boundary Step applies where a segment opens', () => {
		const stepping = strengthTrack({
			segments: [
				strengthSegment(),
				strengthSegment({ startWeekIndex: 4, boundaryStep: -0.2 }),
			],
		})
		const continuous = strengthWeekTarget(
			phases,
			strengthTrack({
				segments: [strengthSegment(), strengthSegment({ startWeekIndex: 4 })],
			}),
			4,
		)!
		expect(strengthWeekTarget(phases, stepping, 4)).toBeCloseTo(
			continuous * 0.8,
			6,
		)
	})

	test('a block opening after the anchor’s gap week keeps its step', () => {
		// The anchor week is in **no** segment, so nothing restarted at a block's
		// opening: the first block the walk crosses is not the anchor's, and its
		// authored step is intent the walk must not swallow.
		const openingLater = strengthTrack({
			segments: [strengthSegment({ startWeekIndex: 2, boundaryStep: -0.2 })],
		})
		expect(strengthWeekTarget(phases, openingLater, 2)).toBeCloseTo(12 * 0.8, 6)
	})

	test('a re-anchor between two blocks does not swallow the next block’s step', () => {
		const stepping = strengthTrack({
			anchors: [
				{ fromWeekIndex: 0, value: 12 },
				{ fromWeekIndex: 4, value: 20 },
			],
			segments: [
				strengthSegment({ weeks: 3 }),
				strengthSegment({ startWeekIndex: 6, weeks: 4, boundaryStep: -0.2 }),
			],
		})
		// Week 4 falls in the gap between the two blocks, so the re-anchor lands in
		// no segment at all — week 6 opens a block the anchor is not in, and the
		// step it authored still applies to the number the athlete typed.
		expect(strengthWeekTarget(phases, stepping, 4)).toBe(0)
		expect(strengthWeekTarget(phases, stepping, 6)).toBeCloseTo(20 * 0.8, 6)
	})

	test('a re-anchor swallows the Block Boundary Step of the segment it lands in', () => {
		// The re-anchor restarts the product from its own week, so applying the step
		// on top would discount a number the athlete had just typed (ADR 0040 §5).
		const stepping = strengthTrack({
			anchors: [
				{ fromWeekIndex: 0, value: 12 },
				{ fromWeekIndex: 4, value: 20 },
			],
			segments: [
				strengthSegment({ boundaryStep: -0.2 }),
				strengthSegment({ startWeekIndex: 4, boundaryStep: -0.2 }),
				strengthSegment({ startWeekIndex: 8, boundaryStep: -0.2 }),
			],
		})
		expect(strengthWeekTarget(phases, stepping, 4)).toBe(20)
		// The next opening is crossed normally: week 8's step still applies, above
		// the last loading week of the block before it.
		const lastLoading = strengthWeekTarget(phases, stepping, 6)!
		expect(strengthWeekTarget(phases, stepping, 8)).toBeCloseTo(
			lastLoading * 1.1 * 0.8,
			6,
		)
	})

	test('a week inside the plan but outside every segment reads 0, never Unavailable', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment({ startWeekIndex: 2 })],
		})
		// "No lifting these weeks" is a positive statement, authored by the gap
		// itself (ADR 0047 §6).
		expect(strengthWeekTarget(phases, lifting, 0)).toBe(0)
		expect(strengthWeekTarget(phases, lifting, 1)).toBe(0)
		expect(strengthWeekTarget(phases, lifting, 6)).toBe(0)
	})

	test('a week outside the plan is an Unavailable Metric', () => {
		expect(strengthWeekTarget(phases, strengthTrack(), -1)).toBeNull()
		expect(strengthWeekTarget(phases, strengthTrack(), 12)).toBeNull()
	})

	test('a week with no anchor in force is an Unavailable Metric', () => {
		const late = strengthTrack({
			anchors: [{ fromWeekIndex: 6, value: 12 }],
			segments: [strengthSegment({ weeks: 12 })],
		})
		expect(strengthWeekTarget(phases, late, 0)).toBeNull()
		expect(strengthWeekTarget(phases, late, 6)).toBe(12)
	})

	test('a gap week takes precedence over a missing anchor: it is authored independently of one', () => {
		const late = strengthTrack({
			anchors: [{ fromWeekIndex: 6, value: 12 }],
			segments: [strengthSegment({ startWeekIndex: 6, weeks: 4 })],
		})
		expect(strengthWeekTarget(phases, late, 0)).toBe(0)
	})

	test('an unset ramp holds the level flat and an unset cut takes the convention', () => {
		const flat = strengthTrack({
			segments: [strengthSegment({ ramp: null, boundaryStep: null })],
		})
		expect(strengthWeekTarget(phases, flat, 0)).toBe(12)
		expect(strengthWeekTarget(phases, flat, 2)).toBe(12)
		expect(strengthWeekTarget(phases, flat, 3)).toBeCloseTo(
			12 * (1 - DEFAULT_DELOAD_CUT),
			6,
		)
	})

	test('a segment whose deload consumes its whole length reads the anchor, cut', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment({ weeks: 2, deloadWeeks: 2 })],
		})
		// No loading week in the window, so the ramp product is empty and the deload
		// cuts the anchor itself.
		expect(strengthWeekTarget(phases, lifting, 0)).toBeCloseTo(
			12 * (1 - DEFAULT_DELOAD_CUT),
			6,
		)
		expect(strengthWeekTarget(phases, lifting, 1)).toBeCloseTo(
			12 * (1 - DEFAULT_DELOAD_CUT),
			6,
		)
	})

	test('an override is the week’s final target, with no role factor on top', () => {
		const withOverride = strengthTrack({
			overrides: [{ weekIndex: 3, value: 10 }],
		})
		// Week 3 is the deload; 10 means 10, not 10 × 0.5.
		expect(strengthWeekTarget(phases, withOverride, 3)).toBe(10)
	})

	test('an override is a leaf and is never folded into the following weeks', () => {
		const segments = [strengthSegment({ weeks: 8 })]
		const withOverride = strengthTrack({
			segments,
			overrides: [{ weekIndex: 3, value: 10 }],
		})
		expect(strengthWeekTarget(phases, withOverride, 4)).toBe(
			strengthWeekTarget(phases, strengthTrack({ segments }), 4),
		)
	})

	test('the phase rhythm has no effect on a strength week’s target', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment({ weeks: 12 })],
		})
		const flatPhases: PhaseSpec[] = [
			{ weeks: 12, rhythm: 'none', tapers: false },
		]
		expect(strengthWeekTargets(phases, lifting)).toEqual(
			strengthWeekTargets(flatPhases, lifting),
		)
	})

	test('the derivation is indexed, not folded: a week computes on its own', () => {
		const lifting = strengthTrack({
			segments: [strengthSegment({ weeks: 12 })],
		})
		expect(strengthWeekTarget(phases, lifting, 9)).toBe(
			strengthWeekTargets(phases, lifting)[9],
		)
	})

	test('two segments holding the same week: the later opening wins, deterministically', () => {
		const overlapping = strengthTrack({
			segments: [
				strengthSegment({ weeks: 6 }),
				strengthSegment({
					startWeekIndex: 4,
					weeks: 4,
					deloadWeeks: 4,
					deloadCut: 0.25,
				}),
			],
		})
		expect(strengthWeekRole(overlapping, 4)).toBe('deload')
		const lastLoading = strengthWeekTarget(phases, overlapping, 3)!
		expect(strengthWeekTarget(phases, overlapping, 4)).toBeCloseTo(
			lastLoading * 0.75,
			6,
		)
	})
})
