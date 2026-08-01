import { describe, expect, test } from 'vitest'
import { DANIELS_PACE_5 } from '../zones/recipes.ts'
import { phaseSpecs, resolvedTracks, type OutlineRows } from './from-rows.ts'
import { plannedWeeklyLoad, type PlannedLoadContexts } from './planned-load.ts'
import { type ConversionProfile } from './volume-conversion.ts'

// ── fixtures ──────────────────────────────────────────────────────────────────
// A 4:00/km runner on Daniels' pace scale, so every band a mix can ask for is
// declared and the distance leg is open. `daniels-pace-5` prices E at IF 0.660
// (43.6 TSS/h), M at 0.823 (67.7), T at 0.935 (87.3) and I at 1.070 (114.4).

const RUNNER: ConversionProfile = {
	lthr: 168,
	maxHr: 190,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
}

const NO_THRESHOLDS: ConversionProfile = {
	lthr: null,
	maxHr: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
}

const START = '2030-01-07'

function runContexts(profile: ConversionProfile = RUNNER): PlannedLoadContexts {
	return { run: { recipe: DANIELS_PACE_5, profile } }
}

type PhaseFixture = { weeks: number; rhythm?: string; tapers?: boolean }
type TrackFixture = {
	discipline: string
	currency: string
	anchor: number
	/** One endurance segment per phase, in phase order. */
	segments?: Array<{
		ramp?: number | null
		mix?: Array<{ zone: number; sessionsPerWeek: number }>
	}>
	/** A dated lifting block instead — a strength track carries no phase. */
	strength?: { weeks: number }
}

function segmentRow(over: Partial<OutlineRows['tracks'][number]['segments'][number]>) {
	return {
		id: 'segment',
		kind: 'endurance',
		phaseId: null,
		ramp: null,
		boundaryStep: null,
		recoveryCut: null,
		taperCut: null,
		startWeekKey: null,
		weeks: null,
		goal: null,
		sessionsPerWeek: null,
		deloadCut: null,
		deloadWeeks: null,
		mix: [],
		...over,
	}
}

function rows(phases: PhaseFixture[], tracks: TrackFixture[]): OutlineRows {
	return {
		startWeekKey: START,
		phases: phases.map((phase, orderIndex) => ({
			id: `phase-${orderIndex}`,
			orderIndex,
			name: `Phase ${orderIndex}`,
			weeks: phase.weeks,
			rhythm: phase.rhythm ?? 'none',
			tapers: phase.tapers ?? false,
		})),
		tracks: tracks.map((track, trackIndex) => ({
			id: `track-${trackIndex}`,
			discipline: track.discipline,
			currency: track.currency,
			anchors: [{ fromWeekKey: START, value: track.anchor }],
			overrides: [],
			segments: track.strength
				? [
						segmentRow({
							id: `segment-${trackIndex}-0`,
							kind: 'strength',
							startWeekKey: START,
							weeks: track.strength.weeks,
							goal: 'hypertrophy',
							sessionsPerWeek: 3,
						}),
					]
				: (track.segments ?? []).map((segment, phaseIndex) =>
						segmentRow({
							id: `segment-${trackIndex}-${phaseIndex}`,
							phaseId: `phase-${phaseIndex}`,
							ramp: segment.ramp ?? null,
							mix: segment.mix ?? [],
						}),
					),
		})),
	}
}

function load(
	outline: OutlineRows,
	contexts: PlannedLoadContexts = runContexts(),
) {
	return plannedWeeklyLoad({
		phases: phaseSpecs(outline),
		tracks: resolvedTracks(outline),
		contexts,
	})
}

const runTrack = (over: Partial<TrackFixture> = {}): TrackFixture => ({
	discipline: 'run',
	currency: 'hours',
	anchor: 8,
	segments: [{ mix: [{ zone: 4, sessionsPerWeek: 1 }] }],
	...over,
})

// ── the curve ────────────────────────────────────────────────────────────────

describe('plannedWeeklyLoad', () => {
	test('a km-authored endurance track projects a curve where a threshold pace is stored', () => {
		const reading = load(
			rows(
				[{ weeks: 2 }],
				[runTrack({ currency: 'km', anchor: 55 })],
			),
		)

		// 1 × zone 4 = 35 min in zone = 0.5833 h at threshold (15 km/h) = 8.75 km.
		// The other 46.25 km run easy at 0.83 × 15 = 12.45 km/h → 3.715 h.
		// TSS = 0.5833 × 87.3 + 3.715 × 43.6 ≈ 213.
		expect(reading.weeklyTss).toHaveLength(2)
		expect(Math.round(reading.weeklyTss[0]!)).toBe(213)
		expect(reading.basis.tracks).toEqual([
			{
				discipline: 'run',
				currency: 'km',
				contributes: true,
				marker: 'derived',
			},
		])
	})

	test('two plans with equal volume and different Quality Session Mixes project different curves', () => {
		const base = load(
			rows(
				[{ weeks: 2 }],
				[runTrack({ segments: [{ mix: [{ zone: 3, sessionsPerWeek: 1 }] }] })],
			),
		)
		const sharp = load(
			rows(
				[{ weeks: 2 }],
				[runTrack({ segments: [{ mix: [{ zone: 5, sessionsPerWeek: 2 }] }] })],
			),
		)

		// The flat 60 TSS/h projected these two identically — the defect ADR 0043 §8
		// legislates against. Same hours, harder week, more load.
		expect(sharp.weeklyTss[0]!).toBeGreaterThan(base.weeklyTss[0]!)
		// And the difference is the mix's, not the volume's: both weeks are 8 h.
		expect(sharp.weeklyTss[0]! - base.weeklyTss[0]!).toBeGreaterThan(20)
	})

	test('the mix moves with the phase, so a Build block projects above a Base block at the same volume', () => {
		const reading = load(
			rows(
				[{ weeks: 1 }, { weeks: 1 }],
				[
					runTrack({
						segments: [
							{ mix: [{ zone: 3, sessionsPerWeek: 1 }] },
							{ mix: [{ zone: 5, sessionsPerWeek: 2 }] },
						],
					}),
				],
			),
		)
		expect(reading.weeklyTss[1]!).toBeGreaterThan(reading.weeklyTss[0]!)
	})

	test('recovery weeks and the taper show as dips in the curve', () => {
		const reading = load(
			rows(
				[
					{ weeks: 4, rhythm: '3:1' },
					{ weeks: 2, tapers: true },
				],
				[
					runTrack({
						segments: [
							{ ramp: 0.05, mix: [{ zone: 4, sessionsPerWeek: 1 }] },
							{ mix: [{ zone: 4, sessionsPerWeek: 1 }] },
						],
					}),
				],
			),
		)

		const tss = reading.weeklyTss as number[]
		// Week 3 is the 3:1 rhythm's recovery week; weeks 4–5 are the taper, which
		// descends through the phase (ADR 0040 §2) rather than stepping at its end.
		expect(tss[3]!).toBeLessThan(tss[2]!)
		expect(tss[4]!).toBeLessThan(tss[2]!)
		expect(tss[5]!).toBeLessThan(tss[4]!)
	})

	test('a gated track projects nothing, and names what closed the gate', () => {
		const reading = load(
			rows([{ weeks: 2 }], [runTrack({ currency: 'km', anchor: 55 })]),
			runContexts(NO_THRESHOLDS),
		)

		// Never a fabricated number: km → TSS needs a stored threshold pace, and the
		// week degrades to an Unavailable Metric rather than borrowing a constant.
		expect(reading.weeklyTss).toEqual([null, null])
		expect(reading.basis.tracks).toEqual([
			{
				discipline: 'run',
				currency: 'km',
				contributes: false,
				reason: 'no-threshold-pace',
			},
		])
	})

	test('an hours-authored track is gated too when no zone system is set', () => {
		// The flat constant made hours the one currency that always projected. It is
		// not: hours → TSS needs an intensity, and an intensity needs a recipe.
		const reading = load(rows([{ weeks: 2 }], [runTrack()]), {})
		expect(reading.weeklyTss).toEqual([null, null])
		expect(reading.basis.tracks[0]).toMatchObject({
			contributes: false,
			reason: 'no-zone-recipe',
		})
	})

	test('a strength track contributes nothing, with the reason stated', () => {
		const reading = load(
			rows(
				[{ weeks: 2 }],
				[
					runTrack(),
					{
						discipline: 'strength',
						currency: 'sets',
						anchor: 12,
						strength: { weeks: 2 },
					},
				],
			),
		)

		// Projected CTL falls only as far as the endurance tracks do (ADR 0047 §5,
		// `strength-ctl`): the lifting weeks are real and carry no TSS.
		expect(reading.weeklyTss.every((tss) => tss != null && tss > 0)).toBe(true)
		expect(reading.basis.tracks).toContainEqual({
			discipline: 'strength',
			currency: 'sets',
			contributes: false,
			reason: 'not-an-endurance-discipline',
		})
	})

	test('a strength-only plan projects nothing at all rather than a flat zero', () => {
		const reading = load(
			rows(
				[{ weeks: 2 }],
				[
					{
						discipline: 'strength',
						currency: 'sets',
						anchor: 12,
						strength: { weeks: 2 },
					},
				],
			),
		)
		expect(reading.weeklyTss).toEqual([])
		expect(reading.basis.tracks).toEqual([
			{
				discipline: 'strength',
				currency: 'sets',
				contributes: false,
				reason: 'not-an-endurance-discipline',
			},
		])
	})

	test('an Outline with no Training Track projects nothing', () => {
		const reading = load(rows([{ weeks: 4 }], []))
		expect(reading.weeklyTss).toEqual([])
		expect(reading.basis.tracks).toEqual([])
	})

	test('a week with no Season Anchor in force is Unavailable, not zero', () => {
		const outline = rows([{ weeks: 2 }], [runTrack()])
		outline.tracks[0]!.anchors = []
		const reading = load(outline)
		expect(reading.weeklyTss).toEqual([null, null])
	})

	test('two endurance tracks sum, because TSS is commensurable across them', () => {
		const one = load(rows([{ weeks: 1 }], [runTrack()]))
		const both = load(
			rows(
				[{ weeks: 1 }],
				[runTrack(), runTrack({ discipline: 'bike', currency: 'tss', anchor: 200 })],
			),
			{ ...runContexts(), bike: { recipe: null, profile: NO_THRESHOLDS } },
		)
		expect(both.weeklyTss[0]!).toBeCloseTo(one.weeklyTss[0]! + 200, 6)
	})
})

// ── the derivation statement ─────────────────────────────────────────────────

describe('the basis', () => {
	test('a TSS-authored track stacks no convention and carries no formula', () => {
		const reading = load(
			rows([{ weeks: 1 }], [runTrack({ currency: 'tss', anchor: 400 })]),
		)
		expect(reading.weeklyTss).toEqual([400])
		expect(reading.basis.tracks[0]).toMatchObject({ marker: 'authored' })
		expect(reading.basis.conventions).toEqual([])
		expect(reading.basis.formulae).toEqual([])
	})

	test('an hours-authored track stacks the minutes-in-zone convention alone', () => {
		const reading = load(rows([{ weeks: 1 }], [runTrack()]))
		// The easy-pace ratio prices the *distance* leg, which hours → TSS never
		// touches, so naming it here would overstate what the curve stands on.
		expect(reading.basis.conventions).toEqual(['minutes-in-zone-per-session'])
		expect(reading.basis.formulae).toEqual(['rTSS'])
	})

	test('a km-authored track stacks the easy-pace ratio on top of it', () => {
		const reading = load(
			rows([{ weeks: 1 }], [runTrack({ currency: 'km', anchor: 55 })]),
		)
		expect(reading.basis.conventions).toEqual([
			'minutes-in-zone-per-session',
			'easy-pace-ratio',
		])
	})

	test('a band the recipe does not declare is named once for the whole curve, not per week', () => {
		// `daniels-pace-5` declares no zone 1 and no neuromuscular position, but it
		// does declare 2–5 — so ask for a zone it cannot serve by using a three-band
		// swim scale on a track that requests zone 5.
		const reading = load(
			rows(
				[{ weeks: 6, rhythm: '3:1' }],
				[
					{
						discipline: 'swim',
						currency: 'hours',
						anchor: 5,
						segments: [{ mix: [{ zone: 5, sessionsPerWeek: 2 }] }],
					},
				],
			),
			{
				swim: {
					recipe: {
						id: 'css-3',
						discipline: 'swim',
						anchor: 'css',
						zones: [
							{ label: 'A', minRatio: 1.1, maxRatio: 1.3, zone: 2 },
							{ label: 'B', minRatio: 1.0, maxRatio: 1.09, zone: 4 },
						],
					},
					profile: { ...NO_THRESHOLDS, cssSecPer100m: 90 },
				},
			},
		)
		expect(reading.basis.substitutions).toEqual([
			{ requested: 5, recipeId: 'css-3', band: 'B', declaredZone: 4 },
		])
	})
})
