import { expect, test } from 'vitest'
import { EFFORT_WORDS } from './effort-word.ts'
import { canMarkDone, fitsImport, fitsImportByHand } from './import-fit.ts'
import { SIMPLE_ACTIVITY_LABELS } from './labels.ts'
import { deriveSessionProfile, intentToZone } from './session-profile.ts'
import {
	ACTIVITY_KINDS,
	readSimpleActivity,
	SIMPLE_ACTIVITY_INTENT,
	simpleActivityWorkoutData,
	type SimpleActivityWorkout,
} from './simple-activity.ts'

// A Simple Activity (ADR 0015 §A, #567): on `other`, an Activity Kind and an
// Effort Word, one step of time with no Intensity Target — and nothing that
// turns the word into a Training Zone.

function climb(
	overrides: Partial<SimpleActivityWorkout> = {},
): SimpleActivityWorkout {
	return {
		discipline: 'other',
		activityKind: 'climb',
		effortWord: 'hard',
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						durationSec: 5400,
						distanceM: null,
						intensity: null,
					},
				],
			},
		],
		...overrides,
	}
}

test('a climb on other with an Activity Kind, an Effort Word and one timed step is a Simple Activity', () => {
	expect(readSimpleActivity(climb())).toEqual({
		kind: 'climb',
		effortWord: 'hard',
		durationMin: 90,
	})
})

test.each([
	['a run', climb({ discipline: 'run' })],
	['no Activity Kind', climb({ activityKind: null })],
	['an unknown Effort Word', climb({ effortWord: 'zone5' })],
	[
		'an Intensity Target on its step',
		climb({
			blocks: [
				{
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							durationSec: 5400,
							intensity: '{"kind":"zone","zone":"easy"}',
						},
					],
				},
			],
		}),
	],
	[
		'two steps',
		climb({
			blocks: [
				{
					repeatCount: 1,
					steps: [{ durationSec: 600 }, { durationSec: 600 }],
				},
			],
		}),
	],
	[
		'a repeat',
		climb({ blocks: [{ repeatCount: 3, steps: [{ durationSec: 600 }] }] }),
	],
	[
		'no time',
		climb({ blocks: [{ repeatCount: 1, steps: [{ durationSec: null }] }] }),
	],
])('%s is not a Simple Activity', (_, workout) => {
	expect(readSimpleActivity(workout)).toBeNull()
})

test('what is written reads back as the same Simple Activity, on other with no Intensity Target', () => {
	const data = simpleActivityWorkoutData({
		kind: 'hike',
		effortWord: 'rolig',
		durationMin: 240,
	})
	expect(data.discipline).toBe('other')
	expect('intensity' in data.block.step).toBe(false)
	expect(
		readSimpleActivity({
			discipline: data.discipline,
			activityKind: data.activityKind,
			effortWord: data.effortWord,
			blocks: [{ repeatCount: 1, steps: [data.block.step] }],
		}),
	).toEqual({ kind: 'hike', effortWord: 'rolig', durationMin: 240 })
})

test.each(EFFORT_WORDS)(
	'the Effort Word %s is never a Training Zone: the intent maps to none, and its time carries no zone',
	(word) => {
		expect(intentToZone(SIMPLE_ACTIVITY_INTENT)).toBeNull()
		const profile = deriveSessionProfile({
			id: 'w',
			title: 'Klatring',
			description: null,
			discipline: 'other',
			intent: SIMPLE_ACTIVITY_INTENT,
			archetype: null,
			activityKind: 'climb',
			effortWord: word,
			blocks: [
				{
					id: 'b',
					name: null,
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [
						{
							id: 's',
							kind: 'cardio',
							notes: null,
							discipline: 'other',
							intensity: null,
							intensityHrMin: null,
							intensityHrMax: null,
							intensityPowerMin: null,
							intensityPowerMax: null,
							intensityPaceMin: null,
							intensityPaceMax: null,
							orderIndex: 0,
							durationSec: 5400,
							distanceM: null,
							verticalM: null,
							gradePct: null,
							cadenceRpmMin: null,
							cadenceRpmMax: null,
							rest: null,
							exerciseId: null,
							restBetweenSetsSec: null,
							exercise: null,
							sets: [],
						},
					],
				},
			],
		})
		expect(profile.bars.every((bar) => bar.zone == null)).toBe(true)
	},
)

test('every Activity Kind and Effort Word has its Norwegian word', () => {
	for (const kind of ACTIVITY_KINDS) {
		expect(SIMPLE_ACTIVITY_LABELS.kind[kind]).toBeTruthy()
	}
	expect(
		EFFORT_WORDS.map((word) => SIMPLE_ACTIVITY_LABELS.effort[word]),
	).toEqual(['Rolig', 'Middels', 'Hard'])
})

const plannedClimb = {
	source: 'generated',
	adoptedAt: null,
	hasRecording: false,
	workoutDiscipline: 'other',
	dayKey: '2030-01-15',
}
const climbImport = { discipline: 'other', dayKey: '2030-01-15' }

test('an import on other never fits a planned climb for auto-save, but may be linked to it by hand', () => {
	expect(fitsImport(plannedClimb, climbImport)).toBe(false)
	expect(fitsImportByHand(plannedClimb, climbImport)).toBe(true)
})

test('by hand, an import on other fits only a planned climb that day, with no Recording', () => {
	expect(
		fitsImportByHand({ ...plannedClimb, dayKey: '2030-01-16' }, climbImport),
	).toBe(false)
	expect(
		fitsImportByHand({ ...plannedClimb, hasRecording: true }, climbImport),
	).toBe(false)
	expect(
		fitsImportByHand(
			{ ...plannedClimb, workoutDiscipline: 'run' },
			climbImport,
		),
	).toBe(false)
	expect(
		fitsImportByHand(plannedClimb, { discipline: 'run', dayKey: '2030-01-15' }),
	).toBe(false)
})

test('a planned climb may be marked Gjort by hand', () => {
	expect(
		canMarkDone(
			{
				status: 'scheduled',
				hasRecording: false,
				workoutDiscipline: 'other',
				dayKey: '2030-01-15',
			},
			{ todayKey: '2030-01-15', reachFromKey: '2030-01-09' },
		),
	).toBe(true)
})
