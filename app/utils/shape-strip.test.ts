import { expect, test } from 'vitest'
import { type DisciplineThresholdMap } from './intensity-target.ts'
import {
	AMRAP_SET_SEC,
	deriveShapeStrip,
	NOMINAL_WIDTH_SEC,
	REST_HEIGHT_PCT,
	SECONDS_PER_REP,
	UNKNOWN_HEIGHT_PCT,
	ZONE_HEIGHT_PCT,
} from './shape-strip.ts'
import { type NotationInput, type NotationStep } from './workout-notation.ts'

const block = (
	steps: NotationStep[],
	repeatCount = 1,
): NotationInput['blocks'][number] => ({ repeatCount, steps })

const input = (...blocks: NotationInput['blocks']): NotationInput => ({
	blocks,
})

/** A run profile with pace zones (Daniels, anchored on threshold pace). */
const runThresholds: DisciplineThresholdMap = {
	run: {
		lthr: null,
		maxHr: null,
		ftp: null,
		thresholdPaceSecPerKm: 300,
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
	},
}

// ——— Honesty: what paints and what doesn't ————————————————————————————————

test('an empty workout derives zero segments', () => {
	expect(deriveShapeStrip(input())).toEqual([])
	expect(deriveShapeStrip(input(block([])))).toEqual([])
})

test('a step with neither quantity nor intensity paints nothing', () => {
	const segments = deriveShapeStrip(
		input(
			block([
				{ kind: 'cardio', notes: 'just vibes' },
				{ kind: 'rest' },
				{ kind: 'strength', exerciseName: 'Squat', sets: [] },
			]),
		),
	)
	expect(segments).toEqual([])
})

test('there is no intent fallback: an unquantified, intensity-less workout stays absent', () => {
	// The old preview painted a solid intent-zone bar here; the honest strip
	// paints nothing the athlete didn't author.
	const segments = deriveShapeStrip(input(block([{ kind: 'cardio' }])))
	expect(segments).toEqual([])
})

// ——— Heights: the intensity ladder ————————————————————————————————————————

test('zone-label steps climb the five-step height ladder', () => {
	const steps: NotationStep[] = ([1, 2, 3, 4, 5] as const).map((z) => ({
		kind: 'cardio',
		durationSec: 60,
		intensity: { kind: 'zoneLabel', label: `Z${z}` },
	}))
	const segments = deriveShapeStrip(input(block(steps)))
	expect(segments.map((s) => s.heightPct)).toEqual([
		ZONE_HEIGHT_PCT[1],
		ZONE_HEIGHT_PCT[2],
		ZONE_HEIGHT_PCT[3],
		ZONE_HEIGHT_PCT[4],
		ZONE_HEIGHT_PCT[5],
	])
	expect(segments.map((s) => s.fill)).toEqual(Array(5).fill('zone'))
	expect(segments.map((s) => s.zone)).toEqual([1, 2, 3, 4, 5])
	expect(ZONE_HEIGHT_PCT[1]).toBe(30)
	expect(ZONE_HEIGHT_PCT[5]).toBe(100)
})

test('rest steps sit lowest', () => {
	const [segment] = deriveShapeStrip(
		input(block([{ kind: 'rest', durationSec: 120 }])),
	)
	expect(segment).toMatchObject({
		heightPct: REST_HEIGHT_PCT,
		fill: 'muted',
		zone: null,
		weightSec: 120,
	})
	expect(REST_HEIGHT_PCT).toBeLessThan(ZONE_HEIGHT_PCT[1])
})

test('strength steps take the nominal height as muted solid — no zone is guessed', () => {
	const [segment] = deriveShapeStrip(
		input(
			block([
				{
					kind: 'strength',
					exerciseName: 'Deadlift',
					sets: [{ kind: 'reps', reps: 5, weightKg: 100 }],
				},
			]),
		),
	)
	expect(segment).toMatchObject({
		heightPct: UNKNOWN_HEIGHT_PCT,
		fill: 'muted',
		zone: null,
	})
})

test('an authored intensity that cannot resolve is hatched at the nominal height, keeping its true width', () => {
	// A watts target with no thresholds at all: honest unresolved, never a guess.
	const [segment] = deriveShapeStrip(
		input(
			block([
				{
					kind: 'cardio',
					durationSec: 600,
					intensity: { kind: 'power', minW: 200, maxW: 220 },
				},
			]),
		),
	)
	expect(segment).toMatchObject({
		heightPct: UNKNOWN_HEIGHT_PCT,
		fill: 'hatched',
		zone: null,
		weightSec: 600,
		nominalWidth: false,
	})
})

test('a quantified step with no intensity paints muted at the nominal height', () => {
	const [segment] = deriveShapeStrip(
		input(block([{ kind: 'cardio', durationSec: 900 }])),
	)
	expect(segment).toMatchObject({
		heightPct: UNKNOWN_HEIGHT_PCT,
		fill: 'muted',
		zone: null,
		weightSec: 900,
	})
})

test('RPE takes its height from the convention table and never degrades to hatched', () => {
	const [segment] = deriveShapeStrip(
		input(
			block([
				{
					kind: 'cardio',
					durationSec: 300,
					intensity: { kind: 'rpe', min: 7 },
				},
			]),
		),
	)
	expect(segment).toMatchObject({
		heightPct: ZONE_HEIGHT_PCT[4],
		fill: 'zone',
		zone: 4,
	})
})

test('a metric target resolves its height through the zone-equivalent bucketing', () => {
	// 5:21/km against a 5:00/km threshold on Daniels ≈ T-pace band → step 3.
	const [segment] = deriveShapeStrip(
		input(
			block([
				{
					kind: 'cardio',
					discipline: 'run',
					durationSec: 1200,
					intensity: { kind: 'pace', minSecPerKm: 315, maxSecPerKm: 327 },
				},
			]),
		),
		{ thresholds: runThresholds },
	)
	expect(segment).toMatchObject({ fill: 'zone', zone: 3 })
})

// ——— Widths: time-true, estimated, or nominal — never a sliver ————————————

test('duration steps weigh their seconds, expanded through block repeats', () => {
	const segments = deriveShapeStrip(
		input(
			block([{ kind: 'cardio', durationSec: 900 }]),
			block(
				[
					{
						kind: 'cardio',
						durationSec: 240,
						intensity: { kind: 'zoneLabel', label: 'Z4' },
					},
					{ kind: 'rest', durationSec: 120 },
				],
				4,
			),
		),
	)
	expect(segments).toHaveLength(1 + 4 * 2)
	expect(segments.map((s) => s.weightSec)).toEqual([
		900,
		...Array(4).fill([240, 120]).flat(),
	])
})

test('a distance step resolves to time via the pace its intensity resolves to', () => {
	// Daniels T band is 1.0–1.14 × threshold pace (300) → mid 321 sec/km.
	const [segment] = deriveShapeStrip(
		input(
			block([
				{
					kind: 'cardio',
					discipline: 'run',
					distanceM: 10000,
					intensity: { kind: 'zoneLabel', label: 'T' },
				},
			]),
		),
		{ thresholds: runThresholds },
	)
	expect(segment!.nominalWidth).toBe(false)
	expect(segment!.weightSec).toBeCloseTo(10 * 321)
})

test("a distance step with no resolvable pace falls back to the athlete's threshold pace", () => {
	const [segment] = deriveShapeStrip(
		input(block([{ kind: 'cardio', discipline: 'run', distanceM: 5000 }])),
		{ thresholds: runThresholds },
	)
	expect(segment).toMatchObject({ weightSec: 5 * 300, nominalWidth: false })
})

test('a distance step with no pace anywhere gets the fixed nominal width, never a sliver', () => {
	const [segment] = deriveShapeStrip(
		input(block([{ kind: 'cardio', discipline: 'bike', distanceM: 40000 }])),
	)
	expect(segment).toMatchObject({
		weightSec: NOMINAL_WIDTH_SEC,
		nominalWidth: true,
	})
})

test('a swim distance step resolves via CSS pace per 100 m', () => {
	const thresholds: DisciplineThresholdMap = {
		swim: {
			lthr: null,
			maxHr: null,
			ftp: null,
			thresholdPaceSecPerKm: null,
			cssSecPer100m: 90,
			zoneSystem: 'css-3',
			zoneOverrides: null,
		},
	}
	const [segment] = deriveShapeStrip(
		input(block([{ kind: 'cardio', discipline: 'swim', distanceM: 2000 }])),
		{ thresholds },
	)
	expect(segment).toMatchObject({ weightSec: 20 * 90, nominalWidth: false })
})

test('reps-based strength estimates time Planned-TSS-style: reps, timed sets, AMRAP and inter-set rest', () => {
	const [segment] = deriveShapeStrip(
		input(
			block([
				{
					kind: 'strength',
					exerciseName: 'Circuit',
					sets: [
						{ kind: 'reps', reps: 10 },
						{ kind: 'timed', durationSec: 60 },
						{ kind: 'amrap' },
					],
					restBetweenSetsSec: 90,
				},
			]),
		),
	)
	expect(segment).toMatchObject({
		weightSec: 10 * SECONDS_PER_REP + 60 + AMRAP_SET_SEC + 2 * 90,
		nominalWidth: false,
	})
})

test('a strength step whose sets estimate to no time keeps the nominal width, never vanishing', () => {
	// A timed set mid-edit with no duration yet: the sets are still the step's
	// authored quantity, so it paints at the nominal width.
	const [segment] = deriveShapeStrip(
		input(
			block([
				{
					kind: 'strength',
					exerciseName: 'Plank',
					sets: [{ kind: 'timed', durationSec: null }],
				},
			]),
		),
	)
	expect(segment).toMatchObject({
		weightSec: NOMINAL_WIDTH_SEC,
		nominalWidth: true,
		heightPct: UNKNOWN_HEIGHT_PCT,
		fill: 'muted',
	})
})

test('an intensity-only step (no quantity) paints at the nominal width with its zone height', () => {
	const [segment] = deriveShapeStrip(
		input(
			block([
				{ kind: 'cardio', intensity: { kind: 'zoneLabel', label: 'Z2' } },
			]),
		),
	)
	expect(segment).toMatchObject({
		weightSec: NOMINAL_WIDTH_SEC,
		nominalWidth: true,
		fill: 'zone',
		zone: 2,
		heightPct: ZONE_HEIGHT_PCT[2],
	})
})

test('segment ids stay unique across repeats', () => {
	const segments = deriveShapeStrip(
		input(block([{ kind: 'cardio', durationSec: 60 }], 3)),
	)
	expect(new Set(segments.map((s) => s.id)).size).toBe(3)
})
