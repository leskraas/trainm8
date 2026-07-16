import { describe, expect, test } from 'vitest'
import {
	deriveMetricTarget,
	describeStepTarget,
	type DisciplineThresholdMap,
	formatIntensityTarget,
	parseAuthoredIntensity,
	sessionMetricTarget,
	unresolvedThresholdReasons,
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
		runPowerThresholdW: null,
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
			formatIntensityTarget({ kind: 'power', minW: 220, maxW: 250 }, profile()),
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

	test('a zone label is shown as the Training Zone itself, capitalised, when no zone system resolves it', () => {
		expect(
			formatIntensityTarget(
				{ kind: 'zoneLabel', label: 'threshold' },
				profile(),
			),
		).toEqual({ kind: 'zone', text: 'Threshold' })
		expect(
			formatIntensityTarget({ kind: 'zoneLabel', label: 'Z2' }, profile()),
		).toEqual({ kind: 'zone', text: 'Z2' })
	})

	test('a zone label resolves through the athlete recipe to a concrete pace range (#180)', () => {
		// daniels-pace-5 "T" = 1.0–1.14 × threshold pace 240 → 240–274 s/km.
		expect(
			formatIntensityTarget(
				{ kind: 'zoneLabel', label: 'T' },
				profile({ zoneSystem: 'daniels-pace-5' }),
			),
		).toEqual({ kind: 'metric', metric: 'pace', text: '4:00–4:34 /km' })
	})

	test('a zone label resolves through a power recipe to watts', () => {
		// coggan-power-7 "Z4" = 0.91–1.05 × FTP 250 → 228–263 W.
		expect(
			formatIntensityTarget(
				{ kind: 'zoneLabel', label: 'Z4' },
				profile({ zoneSystem: 'coggan-power-7' }),
			),
		).toEqual({ kind: 'metric', metric: 'power', text: '228–263 W' })
	})

	test('a CSS zone label resolves in seconds per 100 m, never mislabelled as /km', () => {
		// css-3 "Z2" = 1.0–1.25 × CSS 95 → 95–119 s/100m.
		expect(
			formatIntensityTarget(
				{ kind: 'zoneLabel', label: 'Z2' },
				profile({ zoneSystem: 'css-3' }),
			),
		).toEqual({ kind: 'metric', metric: 'pace', text: '1:35–1:59 /100m' })
	})

	test('an open-ended zone band renders its open bound honestly', () => {
		// friel-hr-5-run "Z5" = 1.0 × LTHR 168 and up.
		expect(
			formatIntensityTarget(
				{ kind: 'zoneLabel', label: 'Z5' },
				profile({ zoneSystem: 'friel-hr-5-run' }),
			),
		).toEqual({ kind: 'metric', metric: 'hr', text: '168+ bpm' })
		// coggan-power-7 "Z1" = anything up to 0.55 × FTP 250.
		expect(
			formatIntensityTarget(
				{ kind: 'zoneLabel', label: 'Z1' },
				profile({ zoneSystem: 'coggan-power-7' }),
			),
		).toEqual({ kind: 'metric', metric: 'power', text: '≤ 138 W' })
	})

	test('an unresolvable zone code degrades to the captioned Training Zone, never a fabricated range', () => {
		expect(
			formatIntensityTarget(
				{ kind: 'zoneLabel', label: 'E' },
				profile({
					zoneSystem: 'daniels-pace-5',
					thresholdPaceSecPerKm: null,
				}),
			),
		).toEqual({ kind: 'zone', text: 'E', caption: 'easy/endurance' })
	})

	test('a bare Daniels letter is captioned even without a configured zone system', () => {
		expect(
			formatIntensityTarget({ kind: 'zoneLabel', label: 'E' }, profile()),
		).toEqual({ kind: 'zone', text: 'E', caption: 'easy/endurance' })
	})
})

describe('describeStepTarget', () => {
	test('a %FTP step keeps the authored label and resolves to concrete watts', () => {
		expect(
			describeStepTarget(
				{ kind: 'powerPct', minPct: 95, maxPct: 105 },
				profile(),
			),
		).toEqual({
			label: '95–105% FTP',
			resolved: '238–263 W',
			missingThreshold: null,
		})
	})

	test('a %FTP step without an FTP degrades honestly and names the missing threshold', () => {
		expect(
			describeStepTarget(
				{ kind: 'powerPct', minPct: 95, maxPct: 105 },
				profile({ ftp: null }),
			),
		).toEqual({
			label: '95–105% FTP',
			resolved: null,
			missingThreshold: 'FTP is not configured',
		})
	})

	test('a %LTHR step resolves to concrete bpm', () => {
		expect(
			describeStepTarget(
				{ kind: 'hrPct', ref: 'lthr', minPct: 95, maxPct: 99 },
				profile(),
			),
		).toEqual({
			label: '95–99% LTHR',
			resolved: '160–166 bpm',
			missingThreshold: null,
		})
	})

	test('a %maxHR step without a max HR names the missing threshold', () => {
		expect(
			describeStepTarget(
				{ kind: 'hrPct', ref: 'max', minPct: 80 },
				profile({ maxHr: null }),
			),
		).toEqual({
			label: '80%+ max HR',
			resolved: null,
			missingThreshold: 'Max HR is not configured',
		})
	})

	test('a zone-label step is captioned and resolves through the recipe (#180)', () => {
		// daniels-pace-5 "E" = 1.29–1.74 × threshold pace 240 → 310–418 s/km.
		expect(
			describeStepTarget(
				{ kind: 'zoneLabel', label: 'E' },
				profile({ zoneSystem: 'daniels-pace-5' }),
			),
		).toEqual({
			label: 'E — easy/endurance',
			resolved: '5:10–6:58 /km',
			missingThreshold: null,
		})
	})

	test('a zone-label step without its anchor threshold stays captioned, no fabricated range', () => {
		expect(
			describeStepTarget(
				{ kind: 'zoneLabel', label: 'E' },
				profile({
					zoneSystem: 'daniels-pace-5',
					thresholdPaceSecPerKm: null,
				}),
			),
		).toEqual({
			label: 'E — easy/endurance',
			resolved: null,
			missingThreshold: 'threshold pace is not configured',
		})
	})

	test('a swim zone-label step resolves in /100m against CSS', () => {
		expect(
			describeStepTarget(
				{ kind: 'zoneLabel', label: 'Z2' },
				profile({ zoneSystem: 'css-3' }),
			),
		).toEqual({
			label: 'Z2 — aerobic endurance',
			resolved: '1:35–1:59 /100m',
			missingThreshold: null,
		})
	})

	test('with no zone system there is no range and no settings pointer — nothing there fixes it', () => {
		expect(
			describeStepTarget({ kind: 'zoneLabel', label: 'E' }, profile()),
		).toEqual({
			label: 'E — easy/endurance',
			resolved: null,
			missingThreshold: null,
		})
	})

	test('with no profile at all a %-target still degrades honestly', () => {
		expect(
			describeStepTarget({ kind: 'powerPct', minPct: 95, maxPct: 105 }),
		).toEqual({
			label: '95–105% FTP',
			resolved: null,
			missingThreshold: 'FTP is not configured',
		})
	})

	test('absolute targets are already concrete — no second resolved range', () => {
		expect(
			describeStepTarget(
				{ kind: 'pace', minSecPerKm: 245, maxSecPerKm: 255 },
				profile(),
			),
		).toEqual({
			label: '4:05–4:15 /km',
			resolved: null,
			missingThreshold: null,
		})
		expect(
			describeStepTarget({ kind: 'power', minW: 220, maxW: 250 }, profile()),
		).toEqual({ label: '220–250 W', resolved: null, missingThreshold: null })
		expect(
			describeStepTarget({ kind: 'hrBpm', min: 150, max: 160 }, profile()),
		).toEqual({ label: '150–160 bpm', resolved: null, missingThreshold: null })
		expect(
			describeStepTarget({ kind: 'rpe', min: 6, max: 7 }, profile()),
		).toEqual({ label: 'RPE 6–7', resolved: null, missingThreshold: null })
	})
})

describe('unresolvedThresholdReasons', () => {
	const step = (intensity: string, discipline = 'run') => ({
		kind: 'cardio',
		discipline,
		intensity,
		durationSec: 600,
		orderIndex: 0,
	})

	test('collects the distinct missing thresholds across steps', () => {
		const workout = {
			blocks: [
				{
					repeatCount: 1,
					steps: [
						step('{"kind":"powerPct","minPct":95,"maxPct":105}', 'bike'),
						step('{"kind":"powerPct","minPct":56,"maxPct":75}', 'bike'),
						step('{"kind":"zoneLabel","label":"E"}', 'run'),
					],
				},
			],
		}
		const thresholds: DisciplineThresholdMap = {
			bike: profile({ ftp: null }),
			run: profile({
				zoneSystem: 'daniels-pace-5',
				thresholdPaceSecPerKm: null,
			}),
		}
		expect(unresolvedThresholdReasons(workout, thresholds)).toEqual([
			'FTP is not configured',
			'threshold pace is not configured',
		])
	})

	test('is empty when every target resolves', () => {
		const workout = {
			blocks: [
				{
					repeatCount: 1,
					steps: [step('{"kind":"zoneLabel","label":"E"}')],
				},
			],
		}
		expect(
			unresolvedThresholdReasons(workout, {
				run: profile({ zoneSystem: 'daniels-pace-5' }),
			}),
		).toEqual([])
	})

	test('is empty for zone labels no zone system explains — Training Settings cannot fix those', () => {
		const workout = {
			blocks: [
				{
					repeatCount: 1,
					steps: [step('{"kind":"zoneLabel","label":"E"}')],
				},
			],
		}
		expect(unresolvedThresholdReasons(workout, {})).toEqual([])
		expect(unresolvedThresholdReasons(null, {})).toEqual([])
	})
})

describe('parseAuthoredIntensity', () => {
	test('parses JSON-authored targets', () => {
		expect(parseAuthoredIntensity('{"kind":"pace","minSecPerKm":245}')).toEqual(
			{ kind: 'pace', minSecPerKm: 245 },
		)
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
			blocks: [{ repeatCount: 1, steps: [cardioStep(null, 600, 0)] }],
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
						cardioStep(
							'{"kind":"pace","minSecPerKm":245,"maxSecPerKm":255}',
							1200,
							1,
						),
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
						cardioStep(
							'{"kind":"hrPct","ref":"lthr","minPct":95,"maxPct":99}',
							180,
							1,
						),
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
			blocks: [{ repeatCount: 1, steps: [cardioStep('threshold', 1200, 0)] }],
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

describe('deriveMetricTarget', () => {
	const zone = (label: string) => ({ kind: 'zoneLabel' as const, label })

	test('run + threshold-pace recipe → pace target', () => {
		// daniels-pace-5 "T" = 1.0–1.14 × threshold pace 240 → 240–274 s/km.
		expect(
			deriveMetricTarget(
				zone('T'),
				'run',
				profile({ zoneSystem: 'daniels-pace-5' }),
			),
		).toEqual({ kind: 'pace', minSecPerKm: 240, maxSecPerKm: 274 })
	})

	test('bike + FTP recipe → %FTP target (re-resolves against current FTP)', () => {
		// coggan-power-7 "Z4" = 0.91–1.05 × FTP 250 → 228–263 W → 91–105 %FTP.
		expect(
			deriveMetricTarget(
				zone('Z4'),
				'bike',
				profile({ zoneSystem: 'coggan-power-7' }),
			),
		).toEqual({ kind: 'powerPct', minPct: 91, maxPct: 105 })
	})

	test('HR-anchored recipe → heart-rate target (the PRD HR fallback)', () => {
		// friel-hr-5-run "Z2" = 0.85–0.89 × LTHR 168 → 143–150 bpm. A run athlete on
		// an HR zone system gets bpm, not pace.
		expect(
			deriveMetricTarget(
				zone('Z2'),
				'run',
				profile({ zoneSystem: 'friel-hr-5-run', thresholdPaceSecPerKm: null }),
			),
		).toEqual({ kind: 'hrBpm', min: 143, max: 150 })
	})

	test('open-ended zone (no upper bound) → single-bound metric', () => {
		// friel-hr-5-run "Z5" = 1.0 × LTHR and up (no maxRatio) → 168 bpm, no max.
		expect(
			deriveMetricTarget(
				zone('Z5'),
				'run',
				profile({ zoneSystem: 'friel-hr-5-run', thresholdPaceSecPerKm: null }),
			),
		).toEqual({ kind: 'hrBpm', min: 168 })
	})

	test('no zone system → keeps the Training Zone label (never fabricates)', () => {
		const target = zone('threshold')
		expect(
			deriveMetricTarget(target, 'run', profile({ zoneSystem: null })),
		).toEqual(target)
	})

	test('threshold absent → keeps the Training Zone label', () => {
		// coggan needs FTP; without it the band can't resolve → Training Zone.
		const target = zone('Z4')
		expect(
			deriveMetricTarget(
				target,
				'bike',
				profile({ zoneSystem: 'coggan-power-7', ftp: null }),
			),
		).toEqual(target)
	})

	test('swim CSS pace (per-100m, not modelled) → keeps the Training Zone label', () => {
		// css-3 resolves a pace in sec/100m, which the schema/formatter render as
		// /km — so rather than mislabel it we keep the Training Zone (ADR 0008).
		const target = zone('Z2')
		expect(
			deriveMetricTarget(target, 'swim', profile({ zoneSystem: 'css-3' })),
		).toEqual(target)
	})

	test('a zone label the recipe does not define → keeps the Training Zone label', () => {
		const target = zone('endurance')
		expect(
			deriveMetricTarget(
				target,
				'run',
				profile({ zoneSystem: 'daniels-pace-5' }),
			),
		).toEqual(target)
	})

	test('an already-metric target passes through unchanged', () => {
		const pace = { kind: 'pace' as const, minSecPerKm: 245, maxSecPerKm: 255 }
		expect(
			deriveMetricTarget(
				pace,
				'run',
				profile({ zoneSystem: 'daniels-pace-5' }),
			),
		).toEqual(pace)
		const powerPct = { kind: 'powerPct' as const, minPct: 95, maxPct: 105 }
		expect(
			deriveMetricTarget(
				powerPct,
				'bike',
				profile({ zoneSystem: 'coggan-power-7' }),
			),
		).toEqual(powerPct)
	})
})
