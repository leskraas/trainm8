import { describe, expect, test } from 'vitest'
import { type IntensityTarget } from './workout-schema.ts'
import {
	intensityChipText,
	rpeToStep,
	zoneEquivalent,
	zoneEquivalentProvenance,
} from './zone-equivalent.ts'
import { type DisciplineProfileForResolver } from './zones/index.ts'

const emptyProfile: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

const bikePower: DisciplineProfileForResolver = {
	...emptyProfile,
	ftp: 280,
	zoneSystem: 'coggan-power-7',
}

const runHr: DisciplineProfileForResolver = {
	...emptyProfile,
	lthr: 162,
	maxHr: 185,
	zoneSystem: 'friel-hr-5-run',
}

const runPace: DisciplineProfileForResolver = {
	...emptyProfile,
	thresholdPaceSecPerKm: 240,
	zoneSystem: 'daniels-pace-5',
}

const swimCss: DisciplineProfileForResolver = {
	...emptyProfile,
	cssSecPer100m: 95,
	zoneSystem: 'css-3',
}

const zone = (label: string): IntensityTarget => ({ kind: 'zoneLabel', label })

describe('RPE — the fixed convention table, never unresolvable', () => {
	test.each([
		[1, 1],
		[2, 1],
		[3, 2],
		[4, 2],
		[5, 3],
		[6, 3],
		[7, 4],
		[8, 4],
		[9, 5],
		[10, 5],
	] as const)('RPE %i → step %i', (rpe, step) => {
		expect(rpeToStep(rpe)).toBe(step)
		expect(zoneEquivalent({ kind: 'rpe', min: rpe }, emptyProfile)).toEqual({
			step,
			reason: null,
		})
	})

	test('RPE maps even with no profile at all', () => {
		expect(zoneEquivalent({ kind: 'rpe', min: 7 }, null)).toEqual({
			step: 4,
			reason: null,
		})
	})

	test('an RPE range buckets on its lower bound', () => {
		expect(zoneEquivalent({ kind: 'rpe', min: 7, max: 9 }, null).step).toBe(4)
	})
})

describe('zone labels map directly to their band position', () => {
	test('a five-band recipe maps label → band position', () => {
		expect(zoneEquivalent(zone('Z1'), runHr).step).toBe(1)
		expect(zoneEquivalent(zone('Z3'), runHr).step).toBe(3)
		expect(zoneEquivalent(zone('Z5'), runHr).step).toBe(5)
	})

	test('Coggan Z6/Z7 clamp to the top step', () => {
		expect(zoneEquivalent(zone('Z5'), bikePower).step).toBe(5)
		expect(zoneEquivalent(zone('Z6'), bikePower).step).toBe(5)
		expect(zoneEquivalent(zone('Z7'), bikePower).step).toBe(5)
	})

	test('Daniels letters bucket by their band position', () => {
		expect(zoneEquivalent(zone('E'), runPace).step).toBe(1)
		expect(zoneEquivalent(zone('T'), runPace).step).toBe(3)
		expect(zoneEquivalent(zone('R'), runPace).step).toBe(5)
	})

	test('without a recipe an authored "Z3" is still a zone statement', () => {
		expect(zoneEquivalent(zone('Z3'), emptyProfile).step).toBe(3)
		expect(zoneEquivalent(zone('threshold'), null).step).toBe(4)
	})

	test('a label neither the recipe nor the heuristic knows is unresolvable', () => {
		const result = zoneEquivalent(zone('mystery'), runHr)
		expect(result.step).toBeNull()
		expect(result.reason).toContain('mystery')
	})
})

describe('%-of-threshold targets bucket as ratios against a matching recipe', () => {
	test('%FTP buckets against Coggan bands without needing the FTP value', () => {
		const noFtp = { ...bikePower, ftp: null }
		expect(zoneEquivalent({ kind: 'powerPct', minPct: 70 }, noFtp).step).toBe(2)
		expect(zoneEquivalent({ kind: 'powerPct', minPct: 100 }, noFtp).step).toBe(
			4,
		)
	})

	test('band edges land on their own side', () => {
		expect(
			zoneEquivalent({ kind: 'powerPct', minPct: 75 }, bikePower).step,
		).toBe(2)
		expect(
			zoneEquivalent({ kind: 'powerPct', minPct: 76 }, bikePower).step,
		).toBe(3)
		expect(
			zoneEquivalent({ kind: 'powerPct', minPct: 105 }, bikePower).step,
		).toBe(4)
		expect(
			zoneEquivalent({ kind: 'powerPct', minPct: 106 }, bikePower).step,
		).toBe(5)
	})

	test('a % beyond the top band clamps to step 5', () => {
		expect(
			zoneEquivalent({ kind: 'powerPct', minPct: 160 }, bikePower).step,
		).toBe(5)
	})

	test('a % inside a between-band gap buckets to the nearest band', () => {
		// Coggan Z1 ends at 0.55, Z2 starts at 0.56.
		expect(
			zoneEquivalent({ kind: 'powerPct', minPct: 55.5 }, bikePower).step,
		).toBeGreaterThanOrEqual(1)
	})

	test('a range buckets on its midpoint', () => {
		// mid(91, 105) = 98 → Z4.
		expect(
			zoneEquivalent({ kind: 'powerPct', minPct: 91, maxPct: 105 }, bikePower)
				.step,
		).toBe(4)
	})

	test('%LTHR buckets against an LTHR-anchored recipe directly', () => {
		expect(
			zoneEquivalent({ kind: 'hrPct', ref: 'lthr', minPct: 92 }, runHr).step,
		).toBe(3)
		expect(
			zoneEquivalent({ kind: 'hrPct', ref: 'lthr', minPct: 101 }, runHr).step,
		).toBe(5)
	})

	test('%maxHR resolves through max HR then buckets against the LTHR bands', () => {
		// 90% of 185 = 166.5 bpm; 166.5 / 162 LTHR ≈ 1.03 → Friel Z5.
		expect(
			zoneEquivalent({ kind: 'hrPct', ref: 'max', minPct: 90 }, runHr).step,
		).toBe(5)
	})

	test('%maxHR without a max HR threshold is unresolvable, with a reason', () => {
		const noMax = { ...runHr, maxHr: null }
		const result = zoneEquivalent(
			{ kind: 'hrPct', ref: 'max', minPct: 90 },
			noMax,
		)
		expect(result.step).toBeNull()
		expect(result.reason).toBe('Max HR missing in settings')
	})
})

describe('absolute metric targets resolve, then bucket', () => {
	test('watts bucket by ratio to FTP', () => {
		expect(zoneEquivalent({ kind: 'power', minW: 280 }, bikePower).step).toBe(4)
		expect(zoneEquivalent({ kind: 'power', minW: 150 }, bikePower).step).toBe(1)
		expect(zoneEquivalent({ kind: 'power', minW: 450 }, bikePower).step).toBe(5)
	})

	test('bpm buckets by ratio to LTHR', () => {
		expect(zoneEquivalent({ kind: 'hrBpm', min: 130 }, runHr).step).toBe(1)
		expect(zoneEquivalent({ kind: 'hrBpm', min: 162 }, runHr).step).toBe(5)
	})

	test('run pace buckets by ratio to threshold pace', () => {
		// 4:00/km at a 4:00 threshold → T → step 3.
		expect(
			zoneEquivalent({ kind: 'pace', minSecPerKm: 240 }, runPace).step,
		).toBe(3)
		// 5:30/km → ratio 1.375 → E → step 1.
		expect(
			zoneEquivalent({ kind: 'pace', minSecPerKm: 330 }, runPace).step,
		).toBe(1)
		// 3:00/km → ratio 0.75 → R → step 5.
		expect(
			zoneEquivalent({ kind: 'pace', minSecPerKm: 180 }, runPace).step,
		).toBe(5)
	})

	test('a pace slower than the easiest band still buckets to the easiest', () => {
		expect(
			zoneEquivalent({ kind: 'pace', minSecPerKm: 600 }, runPace).step,
		).toBe(1)
	})

	test('sec/km pace converts to sec/100m against a CSS-anchored recipe', () => {
		// 900 sec/km = 90 sec/100m, faster than a 95 s CSS → the recipe's top
		// band (step 3 of a 3-band recipe).
		expect(
			zoneEquivalent({ kind: 'pace', minSecPerKm: 900 }, swimCss).step,
		).toBe(3)
		// 1200 sec/km = 120 sec/100m → easy aerobic (Z1).
		expect(
			zoneEquivalent({ kind: 'pace', minSecPerKm: 1200 }, swimCss).step,
		).toBe(1)
	})
})

describe('honesty branches', () => {
	test('no zone system → unresolvable, in human words', () => {
		const result = zoneEquivalent({ kind: 'power', minW: 200 }, emptyProfile)
		expect(result).toEqual({
			step: null,
			reason: 'no zone system chosen in settings',
		})
	})

	test('missing anchor threshold → unresolvable, naming the threshold', () => {
		const noFtp = { ...bikePower, ftp: null }
		expect(zoneEquivalent({ kind: 'power', minW: 200 }, noFtp)).toEqual({
			step: null,
			reason: 'FTP missing in settings',
		})
	})

	test('a channel the recipe cannot place → unresolvable, naming the mismatch', () => {
		// Watts against an HR-anchored recipe.
		const result = zoneEquivalent({ kind: 'power', minW: 200 }, runHr)
		expect(result.step).toBeNull()
		expect(result.reason).toContain('heart-rate-based')
	})

	test('never fabricates: no profile at all → unresolvable for metric kinds', () => {
		expect(zoneEquivalent({ kind: 'hrBpm', min: 150 }, null).step).toBeNull()
	})
})

describe('chip content and provenance stay in the authored form', () => {
	test('chip text renders each kind compactly', () => {
		expect(intensityChipText(zone('Z3'))).toBe('Z3')
		expect(intensityChipText(zone('threshold'))).toBe('Threshold')
		expect(intensityChipText({ kind: 'rpe', min: 7 })).toBe('RPE 7')
		expect(intensityChipText({ kind: 'power', minW: 235 })).toBe('235 W')
		expect(intensityChipText({ kind: 'hrBpm', min: 162 })).toBe('162 bpm')
		expect(intensityChipText({ kind: 'pace', minSecPerKm: 280 })).toBe(
			'4:40/km',
		)
		expect(
			intensityChipText({ kind: 'powerPct', minPct: 95, maxPct: 105 }),
		).toBe('95–105% FTP')
	})

	test('provenance speaks human words for placed and unplaced targets', () => {
		const placed = zoneEquivalent({ kind: 'rpe', min: 7 }, null)
		expect(zoneEquivalentProvenance({ kind: 'rpe', min: 7 }, placed)).toBe(
			'RPE 7 ≈ zone 4 effort',
		)

		const unplaced = zoneEquivalent(
			{ kind: 'power', minW: 200 },
			{
				...bikePower,
				ftp: null,
			},
		)
		expect(
			zoneEquivalentProvenance({ kind: 'power', minW: 200 }, unplaced),
		).toBe("can't be placed in a zone — FTP missing in settings")
	})
})
