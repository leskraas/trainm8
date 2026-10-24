import { expect, test } from 'vitest'
import {
	buildSessionSummary,
	type SummaryWorkout,
} from './__workout-detail-summary.ts'

/** `n × (work, rest)` as the prescription's own rows, so the tests read like
 * the sentence they stand for. */
function run(
	steps: Array<{ kind?: string; durationSec?: number; distanceM?: number }>,
	repeatCount = 1,
): SummaryWorkout {
	return {
		blocks: [
			{
				repeatCount,
				steps: steps.map((s) => ({
					kind: s.kind ?? 'cardio',
					durationSec: s.durationSec ?? null,
					distanceM: s.distanceM ?? null,
					exerciseId: null,
					sets: [],
				})),
			},
		],
	}
}

function lifts(
	rows: Array<{ exerciseId: string; sets: number; kg?: number | null }>,
	repeatCount = 1,
): SummaryWorkout {
	return {
		blocks: [
			{
				repeatCount,
				steps: rows.map((r) => ({
					kind: 'strength',
					durationSec: null,
					distanceM: null,
					exerciseId: r.exerciseId,
					sets: Array.from({ length: r.sets }, () => ({
						weightKg: r.kg ?? null,
					})),
				})),
			},
		],
	}
}

const base = {
	discipline: 'run',
	status: 'scheduled',
	currency: null,
	thresholds: {},
	recording: null,
	loggedSets: 0,
} as const

test('a planned run in a km track leads with its km, then its time', () => {
	const summary = buildSessionSummary({
		...base,
		currency: 'km',
		workout: run([
			{ distanceM: 2000, durationSec: 600 },
			{ distanceM: 8000, durationSec: 2400 },
		]),
	})
	expect(summary.map((f) => f.text)).toEqual(['10 km', '50 min'])
	expect(summary[0]!.unit).toBe('km')
})

test('an hours track leads with the time, said as a session is said, not as 0,8 t', () => {
	const summary = buildSessionSummary({
		...base,
		currency: 'hours',
		workout: run([{ durationSec: 6600, distanceM: 18_000 }]),
	})
	expect(summary.map((f) => f.text)).toEqual(['1 t 50 min', '18 km'])
})

test('repeats count once per round, and a rest with no distance does not hide the km', () => {
	const summary = buildSessionSummary({
		...base,
		currency: 'km',
		workout: run(
			[
				{ distanceM: 1000, durationSec: 240 },
				{ kind: 'rest', durationSec: 90 },
			],
			6,
		),
	})
	expect(summary.map((f) => f.text)).toEqual(['6 km', '33 min'])
})

test('a distance rep is timed through its pace, so the session keeps its time (#615)', () => {
	// `15 min Z2 + 6 × (1 km @ 3:40 + 90 s) + 10 min Z1`.
	const pace = JSON.stringify({ kind: 'pace', minSecPerKm: 220 })
	const reps = run([{ distanceM: 1000 }, { kind: 'rest', durationSec: 90 }], 6)
	reps.blocks[0]!.steps[0]!.intensity = pace
	const summary = buildSessionSummary({
		...base,
		currency: 'hours',
		workout: {
			blocks: [
				run([{ durationSec: 900 }]).blocks[0]!,
				reps.blocks[0]!,
				run([{ durationSec: 600 }]).blocks[0]!,
			],
		},
	})
	// Timed through a pace, the minutes are a translation (#638).
	expect(summary.map((f) => f.text)).toContain('≈ 56 min')
})

test('the rests between series count toward the time (#615)', () => {
	const series = run(
		[{ durationSec: 30 }, { kind: 'rest', durationSec: 15 }],
		13,
	)
	const summary = buildSessionSummary({
		...base,
		currency: 'hours',
		workout: {
			blocks: [
				{
					...series.blocks[0]!,
					seriesRepeatCount: 3,
					betweenSeriesRestSec: 360,
				},
			],
		},
	})
	// 39 × 45 s and two 6-minute rests between the three series.
	expect(summary.map((f) => f.text)).toEqual(['41 min'])
})

test('a unit the prescription does not carry end to end is left out, never understated', () => {
	// 20 min warm-up + 5 × 1000 m: the km would be the intervals only.
	const summary = buildSessionSummary({
		...base,
		currency: 'km',
		workout: {
			blocks: [
				run([{ durationSec: 1200 }]).blocks[0]!,
				run([{ distanceM: 1000 }], 5).blocks[0]!,
			],
		},
	})
	expect(summary).toEqual([])
})

test('with no track for the sport, a run leads with km where it has them, else time', () => {
	expect(
		buildSessionSummary({
			...base,
			workout: run([{ durationSec: 2700 }]),
		}).map((f) => f.text),
	).toEqual(['45 min'])
})

test('a lift leads with its sets, then how many lifts and the heaviest prescribed kilo', () => {
	const summary = buildSessionSummary({
		...base,
		discipline: 'strength',
		currency: 'sets',
		workout: lifts([
			{ exerciseId: 'squat', sets: 5, kg: 82.5 },
			{ exerciseId: 'bench', sets: 5, kg: 60 },
			{ exerciseId: 'row', sets: 5, kg: 60 },
		]),
	})
	expect(summary.map((f) => f.text)).toEqual([
		'15 sett',
		'3 løft',
		'opptil 82,5 kg',
	])
	expect(summary[0]!.unit).toBe('sets')
})

test('a circuit repeated five times is fifteen sets, not three', () => {
	const summary = buildSessionSummary({
		...base,
		discipline: 'strength',
		workout: lifts(
			[
				{ exerciseId: 'squat', sets: 1 },
				{ exerciseId: 'pushup', sets: 1 },
				{ exerciseId: 'row', sets: 1 },
			],
			5,
		),
	})
	expect(summary.map((f) => f.text)).toEqual(['15 sett', '3 løft'])
})

test('a done session says what was recorded, never what was asked', () => {
	const summary = buildSessionSummary({
		...base,
		discipline: 'bike',
		status: 'completed',
		currency: 'hours',
		workout: run([{ durationSec: 3600, distanceM: 30_000 }]),
		recording: { distanceM: 31_240, durationSec: 3725 },
	})
	expect(summary.map((f) => f.text)).toEqual(['1 t 2 min', '31,2 km'])
})

test('a done session with nothing recorded says nothing, rather than the plan', () => {
	expect(
		buildSessionSummary({
			...base,
			status: 'completed',
			workout: run([{ distanceM: 10_000 }]),
		}),
	).toEqual([])
})

test('a done lift says the sets that were logged', () => {
	expect(
		buildSessionSummary({
			...base,
			discipline: 'strength',
			status: 'completed',
			workout: lifts([{ exerciseId: 'squat', sets: 5, kg: 80 }]),
			loggedSets: 4,
		}).map((f) => f.text),
	).toEqual(['4 sett'])
})

test('a missed session has no figures: nothing was done', () => {
	expect(
		buildSessionSummary({
			...base,
			status: 'missed',
			workout: run([{ distanceM: 10_000 }]),
		}),
	).toEqual([])
})

test('a recording with no plan still leads with its own numbers', () => {
	expect(
		buildSessionSummary({
			...base,
			status: 'completed',
			currency: 'km',
			workout: null,
			recording: { distanceM: 8_200, durationSec: 2700 },
		}).map((f) => f.text),
	).toEqual(['8,2 km', '45 min'])
})
