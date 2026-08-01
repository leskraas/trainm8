import { expect, test, describe } from 'vitest'
import {
	phaseReadings,
	phaseSpecs,
	resolvedTracks,
	type OutlineRows,
	type SegmentRow,
	type TrackRow,
} from './from-rows.ts'
import { RAMP_GUARD_MAX } from './ramp-guard.ts'
import { weekKeyAt } from './week-keys.ts'

/**
 * The Plan Start Week, and every other week key derived from it — the module's
 * whole seam is `weekKey → weekIndex`, so a test that hand-wrote its dates would
 * be asserting the calendar rather than the walk.
 */
const START = '2026-01-05'
const week = (index: number) => weekKeyAt(START, index)

/** Base(4) → Build(4) → Peak(2) → Taper(2), the seeded shape of a 12-week plan. */
const PHASES = [
	{
		id: 'base',
		orderIndex: 0,
		name: 'Base',
		weeks: 4,
		rhythm: '3:1',
		tapers: false,
	},
	{
		id: 'build',
		orderIndex: 1,
		name: 'Build',
		weeks: 4,
		rhythm: '3:1',
		tapers: false,
	},
	{
		id: 'peak',
		orderIndex: 2,
		name: 'Peak',
		weeks: 2,
		rhythm: 'none',
		tapers: false,
	},
	{
		id: 'race',
		orderIndex: 3,
		name: 'Race',
		weeks: 2,
		rhythm: 'none',
		tapers: true,
	},
]

/**
 * A stored strength segment: weeks 2–5 of the plan, +10% a loading week, with the
 * deload weeks and the cut left to the convention (ADR 0047 §6).
 */
function strengthRow(overrides: Partial<SegmentRow> = {}): SegmentRow {
	return {
		id: 'lift-1',
		kind: 'strength',
		phaseId: null,
		ramp: 0.1,
		boundaryStep: null,
		recoveryCut: null,
		taperCut: null,
		startWeekKey: week(2),
		weeks: 4,
		goal: 'hypertrophy',
		sessionsPerWeek: 3,
		deloadCut: null,
		deloadWeeks: null,
		mix: [],
		...overrides,
	}
}

/** A lifter's track: 12 sets/wk from the plan's first week, and one segment. */
function strengthTrackRow(overrides: Partial<TrackRow> = {}): TrackRow {
	return {
		id: 'track-lift',
		discipline: 'strength',
		currency: 'sets',
		anchors: [{ fromWeekKey: week(0), value: 12 }],
		segments: [strengthRow()],
		overrides: [],
		...overrides,
	}
}

function rows(tracks: TrackRow[] = [strengthTrackRow()]): OutlineRows {
	return { startWeekKey: START, phases: PHASES, tracks }
}

/** The one resolved track, which is what every test here reads. */
function resolved(outline: OutlineRows = rows()) {
	const [first] = resolvedTracks(outline)
	if (!first) throw new Error('expected one resolved track')
	return first
}

const round = (n: number | null) =>
	n == null ? null : Math.round(n * 100) / 100

describe('the phase sequence', () => {
	test('phases resolve in authored order, whatever order the rows arrive in', () => {
		const shuffled = { ...rows(), phases: [...PHASES].reverse() }
		expect(phaseReadings(shuffled).map((phase) => phase.name)).toEqual([
			'Base',
			'Build',
			'Peak',
			'Race',
		])
		expect(phaseSpecs(shuffled).map((phase) => phase.weeks)).toEqual([
			4, 4, 2, 2,
		])
	})
})

describe('a strength track, row to target', () => {
	test('the walk reads the segment’s own dates, not the phases', () => {
		// The segment opens in week 2 and runs four weeks: three loading weeks
		// ramping +10%, then the convention's one-week deload at −50%.
		expect(resolved().targets.map((target) => round(target.value))).toEqual([
			0, 0, 12, 13.2, 14.52, 7.26, 0, 0, 0, 0, 0, 0,
		])
	})

	test('a week outside every segment reads 0 — the authored "no lifting these weeks"', () => {
		// Positive statements, not Unavailable Metrics: the athlete dated the block
		// and left the rest of the season without one (ADR 0047 §6).
		expect(resolved().targets[0]?.value).toBe(0)
		expect(resolved().targets[11]?.value).toBe(0)
	})

	test('a week with no anchor in force is an Unavailable Metric', () => {
		const late = resolved(
			rows([
				strengthTrackRow({ anchors: [{ fromWeekKey: week(4), value: 12 }] }),
			]),
		)
		// Weeks 2–3 lift but nothing says from what, so they are honestly unpriced,
		// where the weeks with no segment at all still read 0.
		expect(late.targets.slice(0, 4).map((target) => target.value)).toEqual([
			0,
			0,
			null,
			null,
		])
		expect(late.targets[4]?.value).toBe(12)
	})

	test('a Week Volume Override is the week’s final target, with no deload factor on top', () => {
		const held = resolved(
			rows([
				strengthTrackRow({ overrides: [{ weekKey: week(5), value: 10 }] }),
			]),
		)
		// The override sits *above* the walk, so the reading says all three things at
		// once: the athlete's number, that they set it, and the deloaded number a
		// revert would restore (ADR 0044 §5).
		expect(held.targets[5]?.value).toBe(10)
		expect(held.targets[5]?.overridden).toBe(true)
		expect(round(held.targets[5]?.derivedValue ?? null)).toBe(7.26)
	})

	test('the phase rhythm has no effect on the walk', () => {
		const flattened = {
			...rows(),
			phases: PHASES.map((phase) => ({
				...phase,
				rhythm: 'none',
				tapers: false,
			})),
		}
		expect(resolved(flattened).targets).toEqual(resolved().targets)
	})

	test('a strength segment missing its dates yields no segment rather than one placed at a guess', () => {
		const undated = resolved(
			rows([
				strengthTrackRow({ segments: [strengthRow({ startWeekKey: null })] }),
			]),
		)
		expect(undated.targets.every((target) => target.value === 0)).toBe(true)
	})

	test('every week carries the role of the block holding it, beside the figure', () => {
		// The block runs weeks 2–5: three loading weeks and the convention's one-week
		// tail. The role comes off the same spec that priced the week, so a surface
		// reads the `· Deload` marker rather than rebuilding the tail (ADR 0047 §6).
		expect(resolved().strengthRoles).toEqual([
			null,
			null,
			'loading',
			'loading',
			'loading',
			'deload',
			null,
			null,
			null,
			null,
			null,
			null,
		])
	})

	test('a deload longer than its block covers the block, never the weeks before it', () => {
		const swallowed = resolved(
			rows([
				strengthTrackRow({
					segments: [strengthRow({ weeks: 2, deloadWeeks: 5 })],
				}),
			]),
		)
		expect(swallowed.strengthRoles?.slice(1, 5)).toEqual([
			null,
			'deload',
			'deload',
			null,
		])
	})

	test('a strength segment is no phase card’s segment, so it yields no reading', () => {
		// The Quality Session Mix and the phase-bound reading belong to endurance;
		// a dated segment has no card here to sit on (ADR 0047 §3).
		expect(resolved().segments).toEqual([])
	})

	test('the track keeps its own id and currency, which a Week Pattern day joins on', () => {
		expect(resolved().trackId).toBe('track-lift')
		expect(resolved().discipline).toBe('strength')
		expect(resolved().currency).toBe('sets')
	})
})

describe('a strength track’s Season Span', () => {
	test('the span reads the anchor and the peak loading week, in sets', () => {
		const span = resolved().span
		// ADR 0043 §4's `12 → 21 sets/wk`, now literally the same form as the
		// runner's `55 → 78 km/wk` (ADR 0047 §1).
		expect(span?.anchor).toBe(12)
		expect(round(span?.peak ?? null)).toBe(14.52)
		expect(span?.peakWeekIndex).toBe(4)
	})

	test('the gap weeks’ 0 is neither the peak nor the anchor', () => {
		const span = resolved().span
		expect(span?.anchor).toBe(12)
		expect(span?.peak).toBeGreaterThan(0)
		// The peak is a loading week, so a deload week and a week with no segment at
		// all are both out of the running.
		expect(span?.peakWeekIndex).toBe(4)
	})

	test('the season total sums every week, gaps included as the 0 they are', () => {
		expect(round(resolved().total)).toBe(12 + 13.2 + 14.52 + 7.26)
	})

	test('a season with no anchor has no span and no total to state', () => {
		const unanchored = resolved(rows([strengthTrackRow({ anchors: [] })]))
		expect(unanchored.span).toBeNull()
		expect(unanchored.total).toBeNull()
	})
})

describe('the Ramp Guard over both tracks', () => {
	test('a strength segment’s steep ramp is warned on, named by the phase it opens in', () => {
		// The block opens in week 2, which is Base — the card the athlete is looking
		// at where the +10% takes effect, though the segment is bound to no phase.
		expect(resolved().warnings).toEqual([
			{ subject: 'ramp', phaseIndex: 0, authored: 0.1 },
		])
	})

	test('a steep Block Boundary Step on a strength segment is warned on too', () => {
		const steep = resolved(
			rows([
				strengthTrackRow({
					segments: [
						strengthRow({
							startWeekKey: week(5),
							ramp: null,
							boundaryStep: 0.3,
						}),
					],
				}),
			]),
		)
		expect(steep.warnings).toEqual([
			{ subject: 'boundary-step', phaseIndex: 1, authored: 0.3 },
		])
	})

	test('an authored drop is intent, and the guard stays silent on it', () => {
		const dropping = resolved(
			rows([
				strengthTrackRow({
					segments: [strengthRow({ ramp: -0.1, boundaryStep: -0.4 })],
				}),
			]),
		)
		expect(dropping.warnings).toEqual([])
	})

	test('a ramp at the convention is not steep, and a deload rebound is never the subject', () => {
		// The week after the deload rebounds above it by design; the guard speaks
		// about the authored ramp only, so nothing is said (ADR 0040 §12).
		const conventional = resolved(
			rows([
				strengthTrackRow({
					segments: [strengthRow({ weeks: 8, ramp: RAMP_GUARD_MAX })],
				}),
			]),
		)
		expect(conventional.warnings).toEqual([])
	})
})

describe('an endurance track beside it', () => {
	const runRow: TrackRow = {
		id: 'track-run',
		discipline: 'run',
		currency: 'km',
		anchors: [{ fromWeekKey: week(0), value: 50 }],
		segments: PHASES.map((phase, index) => ({
			id: `run-${index}`,
			kind: 'endurance',
			phaseId: phase.id,
			ramp: 0.05,
			boundaryStep: null,
			recoveryCut: null,
			taperCut: null,
			startWeekKey: null,
			weeks: null,
			goal: null,
			sessionsPerWeek: null,
			deloadCut: null,
			deloadWeeks: null,
			mix: [{ zone: 4, sessionsPerWeek: 2 }],
		})),
		overrides: [],
	}

	test('each track is priced by its own walk, in its own currency', () => {
		const [run, lift] = resolvedTracks(rows([runRow, strengthTrackRow()]))
		// The runner keeps the phase rhythm — week 3 recovers — and the lifter's
		// week 3 is the second week of a block that started in week 2.
		expect(round(run?.targets[3]?.value ?? null)).toBe(38.59)
		expect(round(lift?.targets[3]?.value ?? null)).toBe(13.2)
		expect(run?.currency).toBe('km')
		expect(lift?.currency).toBe('sets')
		// A block role is not something a runner's week has, so the whole array is
		// `null` rather than twelve gaps — the Discipline picks the walk (ADR 0043 §1).
		expect(run?.strengthRoles).toBeNull()
		expect(lift?.strengthRoles?.[3]).toBe('loading')
	})

	test('an endurance segment still reads as a phase-bound reading with its mix', () => {
		const [run] = resolvedTracks(rows([runRow]))
		expect(run?.segments.map((segment) => segment.phaseIndex)).toEqual([
			0, 1, 2, 3,
		])
		expect(run?.segments[0]?.mix).toEqual([{ zone: 4, sessionsPerWeek: 2 }])
	})

	test('the endurance span is unchanged by the strength walk arriving', () => {
		const [run] = resolvedTracks(rows([runRow, strengthTrackRow()]))
		expect(run?.span?.anchor).toBe(50)
		expect(run?.span?.peakWeekIndex).toBe(9)
	})
})
