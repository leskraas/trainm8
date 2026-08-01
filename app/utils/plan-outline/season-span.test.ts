import { expect, test } from 'vitest'
import { type PhaseSpec, type TrackSpec } from './derive.ts'
import { seasonSpan, seasonTotal } from './season-span.ts'

/** Base(4) → Build(4) → Taper(2). */
const phases: PhaseSpec[] = [
	{ weeks: 4, rhythm: '3:1', tapers: false },
	{ weeks: 4, rhythm: '3:1', tapers: false },
	{ weeks: 2, rhythm: 'none', tapers: true },
]

function track(overrides: Partial<TrackSpec> = {}): TrackSpec {
	return {
		currency: 'km',
		anchors: [{ fromWeekIndex: 0, value: 50 }],
		segments: phases.map((_, phaseIndex) => ({
			kind: 'endurance' as const,
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

test('the span reads the anchor and the peak loading week', () => {
	const span = seasonSpan(phases, track(), 'endurance')
	expect(span?.anchor).toBe(50)
	// Six loading weeks in Base+Build, so the peak is 50 × 1.05⁵ = 63.8.
	expect(span?.peak).toBeCloseTo(63.8, 1)
	expect(span?.peakWeekIndex).toBe(6)
})

test('the peak is a loading week, never a taper or a recovery week', () => {
	// A taper big enough to exceed nothing, and a recovery cut of zero — which
	// would tie the loading peak if roles were in the running.
	const span = seasonSpan(
		phases,
		track({
			segments: phases.map((_, phaseIndex) => ({
				kind: 'endurance' as const,
				phaseIndex,
				ramp: 0.05,
				boundaryStep: null,
				recoveryCut: 0,
				taperCut: 0,
			})),
		}),
		'endurance',
	)
	// Week 6 (0-based) is the last loading week of Build; week 7 is its recovery
	// week and weeks 8–9 are the taper. With every cut at zero all four carry the
	// same number, and the span still names the loading week.
	expect(span?.peakWeekIndex).toBe(6)
})

test('the anchor is the first authored anchor, not the first week’s target', () => {
	// A plan opening on a recovery week: the first week's *target* is cut, and the
	// span still opens on the number the athlete typed.
	const span = seasonSpan(
		[{ weeks: 4, rhythm: '3:1', tapers: false }],
		{
			currency: 'km',
			anchors: [{ fromWeekIndex: 0, value: 50 }],
			segments: [
				{
					kind: 'endurance',
					phaseIndex: 0,
					ramp: 0.05,
					boundaryStep: null,
					recoveryCut: null,
					taperCut: null,
				},
			],
			overrides: [],
		},
		'endurance',
	)
	expect(span?.anchor).toBe(50)
})

test('a re-anchor does not become the span’s opening', () => {
	// The span is the season's shape, and the season opened at 50. A mid-season
	// re-anchor changes the weeks from its own week forward (ADR 0040 §5), not the
	// number the season started from.
	const span = seasonSpan(
		phases,
		track({
			anchors: [
				{ fromWeekIndex: 0, value: 50 },
				{ fromWeekIndex: 4, value: 40 },
			],
		}),
		'endurance',
	)
	expect(span?.anchor).toBe(50)
})

test('a flat season spans from its anchor to itself rather than reading Unavailable', () => {
	const span = seasonSpan(
		phases,
		track({
			segments: phases.map((_, phaseIndex) => ({
				kind: 'endurance' as const,
				phaseIndex,
				ramp: null,
				boundaryStep: null,
				recoveryCut: null,
				taperCut: null,
			})),
		}),
		'endurance',
	)
	expect(span).toMatchObject({ anchor: 50, peak: 50 })
})

test('a track no week of which can be priced has no span', () => {
	expect(seasonSpan(phases, track({ anchors: [] }), 'endurance')).toBeNull()
})

test('a season with no phases has no span', () => {
	expect(seasonSpan([], track(), 'endurance')).toBeNull()
})

test('an override is the week’s target, so it can be the peak', () => {
	const span = seasonSpan(
		phases,
		track({ overrides: [{ weekIndex: 2, value: 120 }] }),
		'endurance',
	)
	expect(span?.peak).toBe(120)
	expect(span?.peakWeekIndex).toBe(2)
})

test('an override on a recovery week is not the peak, however large', () => {
	// The headline is `anchor → peak **loading** week`, so a recovery week is not a
	// candidate — an override makes it the week's final target without making it a
	// loading week. Week 3 is Base's recovery week.
	const span = seasonSpan(
		phases,
		track({ overrides: [{ weekIndex: 3, value: 500 }] }),
		'endurance',
	)
	expect(span?.peak).not.toBe(500)
	expect(span?.peakWeekIndex).toBe(6)
})

test('the season total is every week summed — a secondary figure, not the headline', () => {
	const total = seasonTotal(phases, track(), 'endurance')
	// Base loads 50 → 52.5 → 55.1 and recovers to 38.6; Build carries the product on
	// from the last *loading* week, not the deload; the taper descends to its cut.
	const weeks = [
		50, 52.5, 55.1, 38.6, 57.9, 60.8, 63.8, 44.7, 45.1, 31.9,
	] as const
	expect(total).toBeCloseTo(
		weeks.reduce((sum, week) => sum + week, 0),
		0,
	)
})

test('the total is Unavailable as soon as one week cannot be priced', () => {
	// Nothing may be summed over a gap: a partial total would read as the season's.
	expect(
		seasonTotal(
			phases,
			track({ anchors: [{ fromWeekIndex: 4, value: 50 }] }),
			'endurance',
		),
	).toBeNull()
})

// ── The strength walk (ADR 0047 §1) ──
//
// A strength track gets a span too, in its own currency: ADR 0043 §4's
// `12 → 21 sets/wk` is the same form as `55 → 78 km/wk`, not a shape borrowed.

/** A lifter's 12 sets/wk over one dated 4-week block, +10% a loading week. */
function lifter(overrides: Partial<TrackSpec> = {}): TrackSpec {
	return {
		currency: 'sets',
		anchors: [{ fromWeekIndex: 0, value: 12 }],
		segments: [
			{
				kind: 'strength',
				startWeekIndex: 2,
				weeks: 4,
				ramp: 0.1,
				boundaryStep: null,
				goal: 'hypertrophy',
				sessionsPerWeek: 3,
				deloadCut: null,
				deloadWeeks: null,
			},
		],
		overrides: [],
		...overrides,
	}
}

test('a strength span reads the anchor and the peak loading week of the walk asked for', () => {
	const span = seasonSpan(phases, lifter(), 'strength')
	// Weeks 2–4 load from the anchor and week 5 deloads, so the peak is week 4 at
	// 12 × 1.1².
	expect(span?.anchor).toBe(12)
	expect(span?.peak).toBeCloseTo(14.52, 2)
	expect(span?.peakWeekIndex).toBe(4)
})

test('the 0 of a week outside every strength segment is neither the peak nor the anchor', () => {
	// A gap week has no loading role at all, so it cannot stand in for a peak; and
	// the anchor is the athlete's own first authored number either way.
	const span = seasonSpan(phases, lifter(), 'strength')
	expect(span?.anchor).toBe(12)
	expect(span?.peakWeekIndex).not.toBe(0)
})

test('a strength deload week is not the peak, however shallow its cut', () => {
	const span = seasonSpan(
		phases,
		lifter({
			segments: [
				{
					kind: 'strength',
					startWeekIndex: 0,
					weeks: 4,
					ramp: 0.1,
					boundaryStep: null,
					goal: 'hypertrophy',
					sessionsPerWeek: 3,
					deloadCut: 0,
					deloadWeeks: 1,
				},
			],
		}),
		'strength',
	)
	// A cut of zero ties the deload to the loading peak; the peak is still the
	// loading week, exactly as it is for a recovery week on the endurance walk.
	expect(span?.peakWeekIndex).toBe(2)
})

test('a strength total sums the gap weeks as the 0 they are, rather than voiding itself', () => {
	const total = seasonTotal(phases, lifter(), 'strength')
	expect(total).toBeCloseTo(12 + 13.2 + 14.52 + 7.26, 6)
})

test('a strength total is Unavailable as soon as one lifting week cannot be priced', () => {
	expect(
		seasonTotal(
			phases,
			lifter({ anchors: [{ fromWeekIndex: 4, value: 12 }] }),
			'strength',
		),
	).toBeNull()
})
