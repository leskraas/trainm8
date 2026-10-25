import { expect, test } from 'vitest'
import { effortWordOfZone, readEffortWord } from './effort-word.ts'
import { type DisciplineThresholdMap } from './intensity-target.ts'
import { type LedgerSession } from './training.server.ts'

// One reading of a zone as an Effort Word, shared by the Start Option cards
// and I dag (spec #558): a threshold session is _hard_ on both, never _hard_
// on one and _middels_ on the other.

test.each([
	[1, 'rolig'],
	[2, 'rolig'],
	[3, 'middels'],
	[4, 'hard'],
	[5, 'hard'],
] as const)('zone %i reads %s', (zone, word) => {
	expect(effortWordOfZone(zone)).toBe(word)
})

// #617: a target written as an absolute pace, watts or heart rate is read
// against the athlete's own thresholds — the threshold-aware reading the
// editor's chip already makes (`zoneEquivalent`) — and one nothing can zone is
// *unknown*, never silently left out of the reading.

type Workout = NonNullable<LedgerSession['workout']>
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

function block(
	id: string,
	orderIndex: number,
	steps: Step[],
	repeatCount = 1,
): Workout['blocks'][number] {
	return {
		id,
		name: null,
		orderIndex,
		repeatCount,
		seriesRepeatCount: 1,
		betweenSeriesRestSec: null,
		sendOff: null,
		steps,
	}
}

function workout(blocks: Workout['blocks']): Workout {
	return {
		id: 'workout-1',
		title: '6 × 1000 m',
		description: null,
		discipline: 'run',
		intent: 'endurance',
		archetype: null,
		activityKind: null,
		effortWord: null,
		blocks,
	}
}

const pace = (minSecPerKm: number) =>
	JSON.stringify({ kind: 'pace', minSecPerKm })
const zone = (label: string) => JSON.stringify({ kind: 'zoneLabel', label })

/** `6 × 1000 m @ 3:40/km`, between an easy warm-up and cool-down. */
const SIX_BY_1000 = workout([
	block('wu', 0, [step({ id: 'wu', durationSec: 900, intensity: zone('Z2') })]),
	block(
		'reps',
		1,
		[
			step({ id: 'rep', distanceM: 1000, intensity: pace(220) }),
			step({ id: 'jog', orderIndex: 1, kind: 'rest', durationSec: 120 }),
		],
		6,
	),
	block('cd', 2, [step({ id: 'cd', durationSec: 600, intensity: zone('Z2') })]),
])

/** T-pace 3:40/km on the default run recipe. */
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

test('a threshold session written as pace reads hard against T-pace', () => {
	expect(readEffortWord(SIX_BY_1000, T_PACE_3_40)).toBe('hard')
})

test('without the thresholds to read it by, it is unknown — not rolig', () => {
	expect(readEffortWord(SIX_BY_1000)).toBeNull()
})

test('an easy run written as pace reads rolig against T-pace', () => {
	const easy = workout([
		block('main', 0, [
			step({ id: 'run', durationSec: 2700, intensity: pace(275) }),
		]),
	])
	expect(readEffortWord(easy, T_PACE_3_40)).toBe('rolig')
})

test('a known hard step is hard however unknown the rest is', () => {
	const mixed = workout([
		block('main', 0, [
			step({ id: 'rep', durationSec: 600, intensity: zone('Z4') }),
			step({
				id: 'abs',
				orderIndex: 1,
				durationSec: 600,
				intensity: pace(300),
			}),
		]),
	])
	expect(readEffortWord(mixed)).toBe('hard')
})

// One reader of the hardest zone (#638): a measured target is zoned on the
// recipe Structure Detection classifies that channel against
// (`classifyingRecipe`), the rule a detected session's intent is read by. A
// Daniels runner with a critical-power threshold is read on Stryd power bands,
// since the pace recipe cannot place watts at all.
test('watts at critical power read hard for a runner on a pace recipe', () => {
	const watts = workout([
		block(
			'reps',
			0,
			[
				step({
					id: 'rep',
					durationSec: 300,
					intensity: JSON.stringify({ kind: 'power', minW: 300 }),
				}),
			],
			6,
		),
	])
	const withCp: DisciplineThresholdMap = {
		run: { ...T_PACE_3_40.run!, runPowerThresholdW: 300 },
	}
	expect(readEffortWord(watts, withCp)).toBe('hard')
})

// The hardest zone is read over the distinct steps a workout authors, not over
// every rep it expands into, so a block repeated without bound costs no more
// than one written once (#638).
test('a block repeated without bound reads in constant work', () => {
	const endless = workout([
		block('reps', 0, [
			step({ id: 'rep', durationSec: 10, intensity: zone('Z4') }),
		]),
	])
	endless.blocks[0]!.repeatCount = 1_000_000
	endless.blocks[0]!.seriesRepeatCount = 1_000_000
	expect(readEffortWord(endless)).toBe('hard')
})
