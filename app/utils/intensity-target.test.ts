import { describe, expect, test } from 'vitest'
import {
	type DisciplineThresholdMap,
	formatIntensityTarget,
	parseAuthoredIntensity,
	sessionMetricTarget,
} from './intensity-target.ts'
import { type DisciplineProfileForResolver } from './zones/resolve.ts'

// A fully-populated profile so the resolver can map %-based targets; individual
// tests null out a threshold to exercise the Unavailable-Metric fallback.
function profile(
	overrides: Partial<DisciplineProfileForResolver> = {},
): DisciplineProfileForResolver {
	return {
		lthr: 168,
		maxHr: 190,
		ftp: 250,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: 95,
		zoneSystem: null,
		zoneOverrides: null,
		...overrides,
	}
}

describe('formatIntensityTarget', () => {
	test('pace resolves to a clock pace, single and range', () => {
		expect(
			formatIntensityTarget({ kind: 'pace', minSecPerKm: 245 }, profile()),
		).toEqual({ kind: 'metric', metric: 'pace', text: '4:05 /km' })
		expect(
			formatIntensityTarget(
				{ kind: 'pace', minSecPerKm: 245, maxSecPerKm: 255 },
				profile(),
			),
		).toEqual({ kind: 'metric', metric: 'pace', text: '4:05–4:15 /km' })
	})

	test('absolute power resolves to watts, single and range', () => {
		expect(
			formatIntensityTarget({ kind: 'power', minW: 235 }, profile()),
		).toEqual({ kind: 'metric', metric: 'power', text: '235 W' })
		expect(
			formatIntensityTarget(
				{ kind: 'power', minW: 220, maxW: 250 },
				profile(),
			),
		).toEqual({ kind: 'metric', metric: 'power', text: '220–250 W' })
	})

	test('absolute heart rate resolves to bpm, single and range', () => {
		expect(
			formatIntensityTarget({ kind: 'hrBpm', min: 150 }, profile()),
		).toEqual({ kind: 'metric', metric: 'hr', text: '150 bpm' })
		expect(
			formatIntensityTarget({ kind: 'hrBpm', min: 150, max: 160 }, profile()),
		).toEqual({ kind: 'metric', metric: 'hr', text: '150–160 bpm' })
	})

	test('rpe shows the subjective scale, single and range', () => {
		expect(formatIntensityTarget({ kind: 'rpe', min: 7 }, profile())).toEqual({
			kind: 'metric',
			metric: 'rpe',
			text: 'RPE 7',
		})
		expect(
			formatIntensityTarget({ kind: 'rpe', min: 6, max: 7 }, profile()),
		).toEqual({ kind: 'metric', metric: 'rpe', text: 'RPE 6–7' })
	})

	test('%LTHR resolves against the athlete LTHR threshold', () => {
		// 95–99% of 168 → 160–166 bpm
		expect(
			formatIntensityTarget(
				{ kind: 'hrPct', ref: 'lthr', minPct: 95, maxPct: 99 },
				profile(),
			),
		).toEqual({ kind: 'metric', metric: 'hr', text: '160–166 bpm' })
	})

	test('%maxHR resolves against the athlete max HR threshold', () => {
		// 80% of 190 → 152 bpm
		expect(
			formatIntensityTarget(
				{ kind: 'hrPct', ref: 'max', minPct: 80 },
				profile(),
			),
		).toEqual({ kind: 'metric', metric: 'hr', text: '152 bpm' })
	})

	test('%FTP resolves against the athlete FTP threshold', () => {
		// 95–105% of 250 → 238–263 W
		expect(
			formatIntensityTarget(
				{ kind: 'powerPct', minPct: 95, maxPct: 105 },
				profile(),
			),
		).toEqual({ kind: 'metric', metric: 'power', text: '238–263 W' })
	})

	test('a %-based target degrades to Unavailable when its threshold is absent — never a fabricated number', () => {
		expect(
			formatIntensityTarget(
				{ kind: 'powerPct', minPct: 95 },
				profile({ ftp: null }),
			),
		).toEqual({ kind: 'unavailable' })
		expect(
			formatIntensityTarget(
				{ kind: 'hrPct', ref: 'lthr', minPct: 95 },
				profile({ lthr: null }),
			),
		).toEqual({ kind: 'unavailable' })
		expect(
			formatIntensityTarget(
				{ kind: 'hrPct', ref: 'max', minPct: 80 },
				profile({ maxHr: null }),
			),
		).toEqual({ kind: 'unavailable' })
	})

	test('a zone label is shown as the Training Zone itself, capitalised', () => {
		expect(
			formatIntensityTarget({ kind: 'zoneLabel', label: 'threshold' }, profile()),
		).toEqual({ kind: 'zone', text: 'Threshold' })
		expect(
			formatIntensityTarget({ kind: 'zoneLabel', label: 'Z2' }, profile()),
		).toEqual({ kind: 'zone', text: 'Z2' })
	})
})

describe('parseAuthoredIntensity', () => {
	test('parses JSON-authored targets', () => {
		expect(
			parseAuthoredIntensity('{"kind":"pace","minSecPerKm":245}'),
		).toEqual({ kind: 'pace', minSecPerKm: 245 })
	})

	test('treats a legacy plain-string intensity as a zone label', () => {
		expect(parseAuthoredIntensity('endurance')).toEqual({
			kind: 'zoneLabel',
			label: 'endurance',
		})
	})

	test('is null for an absent intensity', () => {
		expect(parseAuthoredIntensity(null)).toBeNull()
		expect(parseAuthoredIntensity('')).toBeNull()
	})
})

describe('sessionMetricTarget', () => {
	const runThresholds: DisciplineThresholdMap = { run: profile() }

	function cardioStep(
		intensity: string | null,
		durationSec: number | null,
		orderIndex: number,
		discipline = 'run',
	) {
		return { kind: 'cardio', discipline, intensity, durationSec, orderIndex }
	}

	test('is null for a missing workout', () => {
		expect(sessionMetricTarget(null, runThresholds)).toBeNull()
		expect(sessionMetricTarget(undefined, runThresholds)).toBeNull()
	})

	test('is null when no cardio step carries an intensity target', () => {
		const workout = {
			blocks: [
				{ repeatCount: 1, steps: [cardioStep(null, 600, 0)] },
			],
		}
		expect(sessionMetricTarget(workout, runThresholds)).toBeNull()
	})

	test('picks the longest work step as the session headline', () => {
		// Warm-up (easy, 10 min) + main set (pace, 20 min) + cool-down (easy, 5 min).
		const workout = {
			blocks: [
				{ repeatCount: 1, steps: [cardioStep('easy', 600, 0)] },
				{
					repeatCount: 1,
					steps: [
						cardioStep('{"kind":"pace","minSecPerKm":245,"maxSecPerKm":255}', 1200, 1),
					],
				},
				{ repeatCount: 1, steps: [cardioStep('easy', 300, 2)] },
			],
		}
		expect(sessionMetricTarget(workout, runThresholds)).toEqual({
			kind: 'metric',
			metric: 'pace',
			text: '4:05–4:15 /km',
		})
	})

	test('weighs interval reps by repeatCount, so the hard set beats a longer single warm-up', () => {
		// Warm-up 12 min once (720 s) vs 5 × 3 min hard (900 s effective).
		const workout = {
			blocks: [
				{ repeatCount: 1, steps: [cardioStep('easy', 720, 0)] },
				{
					repeatCount: 5,
					steps: [
						cardioStep('{"kind":"hrPct","ref":"lthr","minPct":95,"maxPct":99}', 180, 1),
						cardioStep('easy', 120, 2),
					],
				},
			],
		}
		expect(sessionMetricTarget(workout, runThresholds)).toEqual({
			kind: 'metric',
			metric: 'hr',
			text: '160–166 bpm',
		})
	})

	test('falls back to the Training Zone when the only targets are zone labels', () => {
		const workout = {
			blocks: [
				{ repeatCount: 1, steps: [cardioStep('threshold', 1200, 0)] },
			],
		}
		expect(sessionMetricTarget(workout, runThresholds)).toEqual({
			kind: 'zone',
			text: 'Threshold',
		})
	})

	test('resolves each step against its own discipline profile', () => {
		const thresholds: DisciplineThresholdMap = {
			bike: profile({ ftp: 250 }),
		}
		const workout = {
			blocks: [
				{
					repeatCount: 1,
					steps: [
						cardioStep(
							'{"kind":"powerPct","minPct":95,"maxPct":105}',
							1200,
							0,
							'bike',
						),
					],
				},
			],
		}
		expect(sessionMetricTarget(workout, thresholds)).toEqual({
			kind: 'metric',
			metric: 'power',
			text: '238–263 W',
		})
	})

	test('degrades to Unavailable when the chosen step needs an absent threshold', () => {
		const workout = {
			blocks: [
				{
					repeatCount: 1,
					steps: [
						cardioStep('{"kind":"powerPct","minPct":95}', 1200, 0, 'bike'),
					],
				},
			],
		}
		// No bike profile at all → FTP absent → Unavailable, not a fabricated watt.
		expect(sessionMetricTarget(workout, {})).toEqual({ kind: 'unavailable' })
	})
})
