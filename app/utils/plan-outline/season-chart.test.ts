import { expect, test, describe } from 'vitest'
import { OLT_HR_5_RUN } from '../zones/recipes.ts'
import { type PlannedLoadContexts } from './planned-load.ts'
import {
	projectWeeklyFitness,
	readableCurrencies,
	readingChain,
	seasonChartModel,
	seasonFitnessLayer,
	SEASON_CHART_LAYERS,
	type ChartTrack,
	type SeasonChartInput,
	type SeasonChartReading,
} from './season-chart.ts'

// ── fixtures ──────────────────────────────────────────────────────────────────
// ADR 0045 §7's athlete: an Olympiatoppen runner, maxHr 195 / LTHR 172, 4:00/km
// threshold. Spelled out so a reader can see exactly which of the athlete's own
// data each gate reads.

const RUNNER: PlannedLoadContexts = {
	run: {
		recipe: OLT_HR_5_RUN,
		profile: {
			lthr: 172,
			maxHr: 195,
			thresholdPaceSecPerKm: 240,
			cssSecPer100m: null,
		},
	},
}

/** An athlete who has told the app nothing about how hard their zones are. */
const NO_PROFILE: PlannedLoadContexts = {}

const RUN = 'track-run'
const LIFT = 'track-strength'

function runTrack(over: Partial<ChartTrack> = {}): ChartTrack {
	return {
		trackId: RUN,
		discipline: 'run',
		currency: 'hours',
		anchors: [{ fromWeekKey: '2030-01-07', value: 5 }],
		segments: [
			{ phaseIndex: 0, ramp: 0.05, mix: [{ zone: 4, sessionsPerWeek: 2 }] },
		],
		strengthSegments: [],
		...over,
	}
}

function liftTrack(over: Partial<ChartTrack> = {}): ChartTrack {
	return {
		trackId: LIFT,
		discipline: 'strength',
		currency: 'sets',
		anchors: [{ fromWeekKey: '2030-01-07', value: 12 }],
		segments: [],
		strengthSegments: [
			{ segmentId: 'block-1', startWeekInPlan: 2, weeks: 2, ramp: 0.05 },
		],
		...over,
	}
}

/** Three weeks of one phase, one track, targets given in the track's own currency. */
function input(over: Partial<SeasonChartInput> = {}): SeasonChartInput {
	const values = over.weeks ? null : ([5, 5.25, 4] as Array<number | null>)
	const tracks = over.tracks ?? [runTrack()]
	return {
		startWeekKey: '2030-01-07',
		phases: [{ name: 'Base', weeks: 3, rhythm: 'none', tapers: false }],
		tracks,
		weeks:
			over.weeks ??
			values!.map((value, index) => ({
				weekKey: `2030-01-${String(7 + index * 7).padStart(2, '0')}`,
				weekInPlan: index + 1,
				phaseIndex: 0,
				role: index === 2 ? ('recovery' as const) : ('loading' as const),
				targets: [
					{ trackId: RUN, value, overridden: false, derivedValue: value },
				],
			})),
		eventWeekIndex: 2,
		trackId: RUN,
		currency: 'hours',
		contexts: RUNNER,
		...over,
	}
}

function value(reading: SeasonChartReading): number {
	if (!reading.available) throw new Error(`unavailable: ${reading.reason}`)
	return reading.value
}

// ── the layer vocabulary ──────────────────────────────────────────────────────

test('the Form layer is a member of the vocabulary, so it can decline out loud', () => {
	// The refusal is a feature of this surface, not an omission from it: an athlete
	// who looks for Form has to find the answer rather than nothing.
	expect(SEASON_CHART_LAYERS).toContain('form')
	expect(SEASON_CHART_LAYERS).toEqual([
		'volume',
		'fitness',
		'rhythm',
		'ramp',
		'emphasis',
		'form',
	])
})

// ── one axis is one track in one currency (ADR 0043 §7) ───────────────────────

describe('the value axis', () => {
	test('reads the track it was asked for, in its own currency, marked authored', () => {
		const model = seasonChartModel(input())!

		expect(model.axis).toEqual({
			trackId: RUN,
			discipline: 'run',
			authoredCurrency: 'hours',
			currency: 'hours',
			derived: false,
		})
		expect(model.weeks[0]!.volume).toEqual({
			available: true,
			value: 5,
			marker: 'authored',
		})
	})

	test('a derived view is marked derived and carries a different number', () => {
		const model = seasonChartModel(input({ currency: 'tss' }))!

		expect(model.axis.derived).toBe(true)
		expect(model.axis.authoredCurrency).toBe('hours')
		const week = model.weeks[0]!
		expect(week.volume).toMatchObject({ available: true, marker: 'derived' })
		// 5 h with { z4: 2 } through the athlete's own recipe — mix-aware, so not
		// the retired flat 60 TSS/h's 300 (ADR 0045 §12).
		expect(value(week.volume)).toBeCloseTo(412.2, 1)
	})

	test('an unknown track yields no model rather than a chart of the wrong track', () => {
		expect(seasonChartModel(input({ trackId: 'track-nope' }))).toBeNull()
	})

	test('a lifting track is offered no derived view at all', () => {
		// `sets` converts in no direction (ADR 0041), so the switch is absent rather
		// than present and refusing.
		expect(readableCurrencies('sets')).toEqual(['sets'])
		expect(readableCurrencies('km')).toEqual(['km', 'hours', 'tss'])
		expect(readableCurrencies('hours')).toEqual(['hours', 'km', 'tss'])
	})

	test('reading a lifting track in an endurance currency states the reason', () => {
		const model = seasonChartModel(
			input({
				tracks: [liftTrack()],
				trackId: LIFT,
				currency: 'tss',
				weeks: input().weeks.map((week) => ({
					...week,
					targets: [
						{ trackId: LIFT, value: 12, overridden: false, derivedValue: 12 },
					],
				})),
			}),
		)!

		expect(model.weeks[0]!.volume).toEqual({
			available: false,
			reason: 'sets-has-no-reading',
		})
	})
})

// ── the Unavailable Metric inspects to a reason (ADR 0008, ADR 0030 rule 1) ────

describe('an Unavailable week', () => {
	test('no anchor in force reads as a reason, never as a zero', () => {
		const weeks = input().weeks.map((week) => ({
			...week,
			targets: [
				{ trackId: RUN, value: null, overridden: false, derivedValue: null },
			],
		}))
		const model = seasonChartModel(input({ weeks }))!

		expect(model.weeks[0]!.volume).toEqual({
			available: false,
			reason: 'no-season-anchor',
		})
		// Nothing to scale against, and deliberately not a domain of 1.
		expect(model.peak).toBe(0)
	})

	test('a closed distance gate names the athlete’s own missing datum', () => {
		const model = seasonChartModel(
			input({ currency: 'km', contexts: NO_PROFILE }),
		)!

		expect(model.weeks[0]!.volume).toEqual({
			available: false,
			reason: 'no-threshold-pace',
		})
	})

	test('the gate is per reading: hours still reads with no threshold pace at all', () => {
		// ADR 0045 §6 — a run track with no stored pace keeps hours ↔ TSS and loses
		// only the distance leg.
		const model = seasonChartModel(
			input({ currency: 'tss', contexts: NO_PROFILE }),
		)!
		expect(model.weeks[0]!.volume).toEqual({
			available: false,
			reason: 'no-zone-recipe',
		})
	})
})

// ── the ramp layer ────────────────────────────────────────────────────────────

describe('the ramp layer', () => {
	test('reads the step the plan actually took, beside the rate authored for it', () => {
		const model = seasonChartModel(input())!

		expect(model.weeks[0]!.step).toBeNull() // nothing precedes week 1
		expect(model.weeks[1]!.step).toBeCloseTo(0.05, 10)
		// The recovery week's drop is a step the plan took and not a rate anyone
		// typed; the authored ramp beside it is unchanged.
		expect(model.weeks[2]!.step).toBeCloseTo(-0.2381, 4)
		expect(model.weeks[2]!.authoredRamp).toBe(0.05)
	})

	test('a step out of an Unavailable week, or out of zero, is not a percentage', () => {
		const weeks = input().weeks.map((week, index) => ({
			...week,
			targets: [
				{
					trackId: RUN,
					value: index === 0 ? null : index === 1 ? 0 : 4,
					overridden: false,
					derivedValue: null,
				},
			],
		}))
		const model = seasonChartModel(input({ weeks }))!

		expect(model.weeks[1]!.step).toBeNull() // previous week Unavailable
		expect(model.weeks[2]!.step).toBeNull() // previous week is zero
	})

	test('a lifting week reads the rate its dated block authors, not a phase’s', () => {
		const weeks = input().weeks.map((week) => ({
			...week,
			targets: [
				{ trackId: LIFT, value: 12, overridden: false, derivedValue: 12 },
			],
		}))
		const model = seasonChartModel(
			input({
				tracks: [liftTrack()],
				trackId: LIFT,
				currency: 'sets',
				weeks,
			}),
		)!

		// The block opens on week 2 and runs two weeks; week 1 is a gap and reads no
		// authored rate at all rather than borrowing the block's.
		expect(model.weeks[0]!.authoredRamp).toBeNull()
		expect(model.weeks[1]!.authoredRamp).toBe(0.05)
	})
})

// ── the time axis: everything that is not the value axis ──────────────────────

describe('the time axis', () => {
	test('carries phase starts, block boundaries, re-anchors and the Event', () => {
		const model = seasonChartModel(
			input({
				tracks: [
					runTrack({
						anchors: [
							{ fromWeekKey: '2030-01-07', value: 5 },
							{ fromWeekKey: '2030-01-14', value: 6 },
						],
					}),
					liftTrack(),
				],
				phases: [
					{ name: 'Base', weeks: 2, rhythm: 'none', tapers: false },
					{ name: 'Taper', weeks: 1, rhythm: 'none', tapers: true },
				],
				weeks: input().weeks.map((week, index) =>
					index === 2
						? { ...week, phaseIndex: 1, role: 'taper' as const }
						: week,
				),
			}),
		)!

		expect(model.weeks.map((w) => w.phaseStart)).toEqual([true, false, true])
		expect(model.weeks[0]!.phaseName).toBe('Base')
		expect(model.weeks[2]!.phaseName).toBe('Taper')

		// The plan's opening anchor re-anchors nothing; the second one does.
		expect(model.weeks[0]!.anchors).toEqual([
			{ discipline: 'run', currency: 'hours', value: 5, reAnchor: false },
			{ discipline: 'strength', currency: 'sets', value: 12, reAnchor: false },
		])
		expect(model.weeks[1]!.anchors).toEqual([
			{ discipline: 'run', currency: 'hours', value: 6, reAnchor: true },
		])

		// Another track's segment boundary — dated, and floating free of the phases.
		expect(model.weeks[1]!.segmentStarts).toEqual([
			{ discipline: 'strength', segmentId: 'block-1' },
		])
		expect(model.weeks.map((w) => w.eventWeek)).toEqual([false, false, true])
	})

	test('week roles travel with the week, for the rhythm layer to read', () => {
		const model = seasonChartModel(input())!
		expect(model.weeks.map((w) => w.role)).toEqual([
			'loading',
			'loading',
			'recovery',
		])
	})

	test('emphasis marks read every endurance track’s mix, and drop an empty one', () => {
		const model = seasonChartModel(input())!

		expect(model.weeks[0]!.emphasis).toEqual([
			{
				discipline: 'run',
				terms: [{ zone: 4, sessionsPerWeek: 2 }],
				qualitySessions: 2,
			},
		])

		const noMix = seasonChartModel(
			input({
				tracks: [
					runTrack({ segments: [{ phaseIndex: 0, ramp: null, mix: [] }] }),
				],
			}),
		)!
		// An empty mix is a statement the athlete made, and it puts no mark on the
		// axis rather than a mark meaning nothing (ADR 0042 §6).
		expect(noMix.weeks[0]!.emphasis).toEqual([])
	})
})

// ── the derivation the inspect panel renders (ADR 0045 §10) ───────────────────

describe('the inspect panel’s derivation', () => {
	test('a derived reading names every number it stands on, ending at the total', () => {
		const model = seasonChartModel(input({ currency: 'tss' }))!
		const week = model.weeks[0]!
		const chain = readingChain(week.derivation!, week.volume, 'tss')

		expect(chain[0]!.id).toBe('total-tss')
		const ids = chain.map((step) => step.id)
		expect(ids).toContain('authored')
		expect(ids).toContain('quality-hours')
		expect(ids).toContain('easy-tss')
		// Every non-authored step names a source — the ADR's testable invariant.
		for (const step of chain) {
			if (step.id === 'authored') continue
			expect(step.source.kind).not.toBe('authored')
		}
		// hours → TSS touches no pace source, so the easy-pace ratio is not in the
		// chain even though the decomposition produced a distance leg beside it.
		expect(ids).not.toContain('speed:easy')
	})

	test('an authored reading stands on the authored step alone', () => {
		const model = seasonChartModel(input())!
		const week = model.weeks[0]!
		const chain = readingChain(week.derivation!, week.volume, 'hours')

		expect(chain).toHaveLength(1)
		expect(chain[0]).toMatchObject({
			id: 'authored',
			source: { kind: 'authored', currency: 'hours' },
		})
	})

	test('an Unavailable reading has no chain to show', () => {
		const model = seasonChartModel(
			input({ currency: 'km', contexts: NO_PROFILE }),
		)!
		const week = model.weeks[0]!
		expect(readingChain(week.derivation!, week.volume, 'km')).toEqual([])
	})

	test('the priced buckets travel with the week', () => {
		const model = seasonChartModel(input())!
		const buckets = model.weeks[0]!.buckets

		expect(buckets.map((b) => b.kind)).toEqual(['quality', 'easy'])
		expect(buckets[0]).toMatchObject({ zone: 4, sessionsPerWeek: 2 })
		expect(buckets[1]).toMatchObject({ zone: 2, sessionsPerWeek: 0 })
	})
})

// ── the fitness layer, and the Form layer's refusal ───────────────────────────

describe('the fitness layer', () => {
	const tracks = [
		{
			discipline: 'run' as const,
			currency: 'hours' as const,
			segments: [
				{ phaseIndex: 0, mix: [{ zone: 4 as const, sessionsPerWeek: 2 }] },
			],
			targets: [5, 5.25, 4].map((value) => ({
				value,
				overridden: false,
				derivedValue: value,
			})),
		},
	]
	const phases = [{ weeks: 3, rhythm: 'none' as const, tapers: false }]
	const anchor = {
		ctl: 40,
		trustworthy: true,
		daysOfHistory: 90,
		requiredDays: 42,
	}

	test('replays the plan through the same CTL EWMA, from the fitness carried in', () => {
		const layer = seasonFitnessLayer({
			phases,
			tracks,
			contexts: RUNNER,
			anchor,
		})

		expect(layer.status).toBe('projected')
		if (layer.status !== 'projected') return
		expect(layer.ctl).toHaveLength(3)
		// ~413 TSS/wk against a CTL of 40 pulls the curve up week on week.
		expect(layer.ctl[0]!).toBeGreaterThan(40)
		expect(layer.ctl[1]!).toBeGreaterThan(layer.ctl[0]!)
		expect(layer.basis.tracks[0]).toMatchObject({
			discipline: 'run',
			contributes: true,
			marker: 'derived',
		})
	})

	test('declines with a reason rather than half a curve when a week cannot be priced', () => {
		const layer = seasonFitnessLayer({
			phases,
			tracks,
			contexts: NO_PROFILE,
			anchor,
		})

		expect(layer.status).toBe('unavailable')
		if (layer.status !== 'unavailable') return
		expect(layer.gap.kind).toBe('unpriced')
		if (layer.gap.kind !== 'unpriced') return
		expect(layer.gap.basis.tracks[0]).toMatchObject({
			contributes: false,
			reason: 'no-zone-recipe',
		})
	})

	test('declines while the CTL baseline is still climbing from a cold start', () => {
		const layer = seasonFitnessLayer({
			phases,
			tracks,
			contexts: RUNNER,
			anchor: { ...anchor, trustworthy: false, daysOfHistory: 9 },
		})
		expect(layer).toEqual({
			status: 'unavailable',
			gap: { kind: 'building-baseline', daysOfHistory: 9, requiredDays: 42 },
		})
	})

	test('declines when there is no measured fitness to replay from', () => {
		expect(
			seasonFitnessLayer({ phases, tracks, contexts: RUNNER, anchor: null }),
		).toEqual({ status: 'unavailable', gap: { kind: 'no-anchor' } })
	})

	test('a flat weekly average is what the replay has, and CTL is all it can carry', () => {
		// The same arithmetic the measured curve uses, seven daily steps a week: a
		// week of 700 TSS is replayed as 100 TSS a day. That flattening is exactly
		// why the Form layer refuses — ATL's 7-day window reads the distribution the
		// plan does not contain, where CTL's 42-day window averages it away.
		const [first] = projectWeeklyFitness([700], 0)
		expect(first).toBeCloseTo(100 * (1 - (1 - 1 / 42) ** 7), 6)
	})
})
