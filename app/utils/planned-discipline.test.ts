import { expect, test } from 'vitest'
import { readSessionContribution } from './load/compute.ts'
import { readPlannedTss } from './load/planned-tss.ts'
import { plannedVolumeOf } from './plan-outline/week-volumes.ts'
import {
	PLANNED_DISCIPLINES,
	readPlannedDiscipline,
	readPlannedMetric,
} from './planned-discipline.ts'
import { buildReviewComparison } from './session-review.ts'
import { readLedgerPlannedTss } from './training.ts'
import { DISCIPLINES } from './workout-schema.ts'

// A planned Simple Activity as spec #558 describes it: Discipline `other`, one
// step of duration with no Intensity Target. Nothing in the app makes one yet;
// this is the shape every path a planned session travels must survive.
const simpleActivityBlocks = [
	{
		repeatCount: 1,
		steps: [
			{
				kind: 'cardio',
				discipline: null,
				intensity: null,
				durationSec: 3600,
				distanceM: null,
			},
		],
	},
]

const unavailable = { status: 'unavailable', reason: 'simple-activity' }

test('a planned discipline is the Discipline set plus other, and the Discipline set is unchanged', () => {
	expect(DISCIPLINES).toEqual(['run', 'swim', 'bike', 'strength'])
	expect(PLANNED_DISCIPLINES).toEqual([...DISCIPLINES, 'other'])
	expect(readPlannedDiscipline('other')).toBe('other')
	expect(readPlannedDiscipline('run')).toBe('run')
	expect(readPlannedDiscipline('hike')).toBeNull()
})

test('every planned-session metric on other is an Unavailable Metric with a reason, and nothing is measured', () => {
	for (const metric of [
		'planned-tss',
		'training-load',
		'planned-volume',
		'planned-distance',
	] as const) {
		let measured = false
		const read = readPlannedMetric('other', metric, () => {
			measured = true
			return 42
		})
		expect(read).toEqual(unavailable)
		expect(measured).toBe(false)
	}
})

test('a measured discipline reads its number, and one that does not resolve is unavailable as not resolved', () => {
	expect(readPlannedMetric('run', 'planned-tss', () => 55)).toEqual({
		status: 'available',
		value: 55,
	})
	expect(readPlannedMetric('bike', 'planned-tss', () => null)).toEqual({
		status: 'unavailable',
		reason: 'not-resolved',
	})
})

test('Planned TSS of a planned Simple Activity is unavailable, never a guessed number', () => {
	const profile = {
		disciplineProfiles: [
			{
				discipline: 'other',
				lthr: 160,
				maxHr: 190,
				ftp: 250,
				thresholdPaceSecPerKm: 300,
				cssSecPer100m: 100,
				preferCogganTss: true,
				preferRTSS: true,
			},
		],
	}
	const blocks = simpleActivityBlocks.map((b) => ({
		...b,
		steps: b.steps.map((s) => ({
			...s,
			intensityHrMin: 140,
			intensityHrMax: 150,
			intensityPowerMin: null,
			intensityPowerMax: null,
			intensityPaceMin: null,
			intensityPaceMax: null,
			intensityPaceUnit: null,
		})),
	}))
	expect(readPlannedTss({ discipline: 'other', blocks }, profile)).toEqual(
		unavailable,
	)
})

test('the Training Load contribution of a session on other is unavailable', () => {
	expect(
		readSessionContribution(
			{ discipline: 'other', durationSec: 3600, rpe: 6 },
			{ hrAvg: 140, powerAvg: null, paceAvgSecPerKm: null },
			{ disciplineProfiles: [] },
		),
	).toEqual(unavailable)
})

test('a week row reads no Planned TSS for a planned Simple Activity, even if one was stored', () => {
	expect(
		readLedgerPlannedTss({
			plannedTssValue: 40,
			workout: { discipline: 'other' },
			recording: null,
		}),
	).toEqual(unavailable)
})

test('week volumes count a planned Simple Activity in hours and read every other currency as unavailable', () => {
	expect(
		plannedVolumeOf('other', {
			km: null,
			hours: 1,
			tss: 40,
			sets: null,
		}),
	).toEqual({
		km: unavailable,
		hours: { status: 'available', value: 1 },
		tss: unavailable,
		sets: unavailable,
	})
})

test('session detail reads Planned TSS and planned distance of a Simple Activity as unavailable, and keeps its planned time', () => {
	const c = buildReviewComparison(
		{
			tssValue: null,
			plannedTssValue: 40,
			workout: {
				discipline: 'other',
				blocks: [
					{ repeatCount: 1, steps: [{ durationSec: 3600, distanceM: 1000 }] },
				],
			},
			recording: null,
		},
		{},
	)
	expect(c.tss.plannedRead).toEqual(unavailable)
	expect(c.tss.planned).toBeNull()
	expect(c.tss.band).toBeNull()
	expect(c.distance.plannedRead).toEqual(unavailable)
	expect(c.distance.planned).toBeNull()
	expect(c.duration.planned).toBe(3600)
})
