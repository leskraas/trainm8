import { expect, test } from 'vitest'
import {
	buildStepInput,
	emptyBlock,
	emptyStep,
	emptySet,
	FormSchema,
} from './workout-authoring.ts'

test('buildStepInput maps a cardio step with an intensity target', () => {
	const result = buildStepInput(
		{
			kind: 'cardio',
			discipline: 'bike',
			intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }),
			durationSec: '600',
			distanceM: '5000',
			notes: 'easy spin',
		},
		'run',
	)

	expect(result).toEqual({
		kind: 'cardio',
		discipline: 'bike',
		intensity: { kind: 'zoneLabel', label: 'Z2' },
		durationSec: 600,
		distanceM: 5000,
		notes: 'easy spin',
	})
})

test('buildStepInput inherits the workout discipline and ignores bad intensity JSON', () => {
	const result = buildStepInput(
		{ kind: 'cardio', discipline: '', intensity: 'not-json' },
		'swim',
	)

	expect(result).toMatchObject({
		kind: 'cardio',
		discipline: 'swim',
		intensity: undefined,
	})
})

test('buildStepInput falls back to run for an unknown cardio discipline', () => {
	const result = buildStepInput(
		{ kind: 'cardio', discipline: 'rowing' },
		'strength',
	)

	expect(result).toMatchObject({ kind: 'cardio', discipline: 'run' })
})

test('buildStepInput maps a rest step', () => {
	const result = buildStepInput(
		{ kind: 'rest', durationSec: '90', notes: 'recover' },
		'run',
	)

	expect(result).toEqual({
		kind: 'rest',
		durationSec: 90,
		notes: 'recover',
	})
})

test('buildStepInput maps a strength step with reps, timed, and amrap sets', () => {
	const result = buildStepInput(
		{
			kind: 'strength',
			exerciseId: 'ex1',
			restBetweenSetsSec: '120',
			sets: [
				{ kind: 'reps', orderIndex: '0', reps: '8', weightKg: '40' },
				{ kind: 'timed', durationSec: '45' },
				{ kind: 'amrap', pct1RM: '60' },
			],
		},
		'run',
	)

	expect(result).toEqual({
		kind: 'strength',
		exerciseId: 'ex1',
		restBetweenSetsSec: 120,
		notes: undefined,
		sets: [
			{ kind: 'reps', orderIndex: 0, weightKg: 40, pct1RM: undefined, reps: 8 },
			{
				kind: 'timed',
				orderIndex: 1,
				weightKg: undefined,
				pct1RM: undefined,
				durationSec: 45,
			},
			{ kind: 'amrap', orderIndex: 2, weightKg: undefined, pct1RM: 60 },
		],
	})
})

test('empty builders produce a parseable, minimal form shape', () => {
	const block = emptyBlock()
	expect(block).toMatchObject({ repeatCount: '1', steps: [expect.any(Object)] })
	expect(emptyStep()).toMatchObject({ kind: 'cardio', sets: [emptySet()] })
})

test('FormSchema rejects a block with no steps', () => {
	const parsed = FormSchema.safeParse({
		title: 'Test',
		discipline: 'run',
		intent: 'endurance',
		scheduledAtDate: '2026-06-08',
		scheduledAtTime: '08:00',
		blocks: [{ steps: [] }],
	})
	expect(parsed.success).toBe(false)
})
