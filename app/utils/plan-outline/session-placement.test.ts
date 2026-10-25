import { expect, test } from 'vitest'
import { type DisciplineThresholdMap } from '../intensity-target.ts'
import { type Workout } from '../session-profile.ts'
import { placingClashes } from './day-rule.ts'
import { placedOn, readPlacement } from './session-placement.ts'

// #617: a stored session is placed by its Effort Word read against the
// athlete's thresholds, and one whose effort cannot be read is not easy — a
// threshold session written as pace was placed as _rolig_ before.

type Step = Workout['blocks'][number]['steps'][number]

function step(overrides: Partial<Step> & { id: string }): Step {
	return {
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity: null,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex: 0,
		durationSec: null,
		distanceM: null,
		verticalM: null,
		gradePctMin: null,
		gradePctMax: null,
		cadenceRpmMin: null,
		cadenceRpmMax: null,
		rest: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

/** `6 × 1000 m @ 3:40/km`. */
const SIX_BY_1000: Workout = {
	id: 'workout-1',
	title: '6 × 1000 m',
	description: null,
	discipline: 'run',
	intent: 'endurance',
	archetype: null,
	activityKind: null,
	effortWord: null,
	blocks: [
		{
			id: 'reps',
			name: null,
			orderIndex: 0,
			repeatCount: 6,
			seriesRepeatCount: 1,
			betweenSeriesRestSec: null,
			sendOff: null,
			steps: [
				step({
					id: 'rep',
					distanceM: 1000,
					intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 220 }),
				}),
			],
		},
	],
}

const T_PACE_3_40: DisciplineThresholdMap = {
	run: {
		lthr: null,
		maxHr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: 220,
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
	},
}

const TUE = 1
const WED = 2

test('a threshold session written as pace is placed as hard', () => {
	expect(readPlacement(SIX_BY_1000, T_PACE_3_40)).toEqual({
		kind: 'session',
		effort: 'hard',
	})
})

test('it is never placed the day after another hard day', () => {
	const tuesday = placedOn({ kind: 'session', effort: 'hard' }, TUE)
	const shape = readPlacement(SIX_BY_1000, T_PACE_3_40)!
	expect(placingClashes([tuesday], placedOn(shape, WED))).toEqual([
		{ reason: 'hard-days-in-a-row', weekday: TUE },
	])
})

test('with no thresholds to read it by, it is still not placed as easy', () => {
	const tuesday = placedOn({ kind: 'session', effort: 'hard' }, TUE)
	const shape = readPlacement(SIX_BY_1000)!
	expect(shape).toEqual({ kind: 'session', effort: null })
	expect(placingClashes([tuesday], placedOn(shape, WED))).toEqual([
		{ reason: 'hard-days-in-a-row', weekday: TUE },
	])
})
