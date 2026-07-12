/**
 * Server validation errors on the token line (workout-editor spec §10, #259)
 * — the pure mapping layer. A rejected save's error record (Conform
 * `SubmissionResult['error']`) maps to anchors in the editor's own language:
 * the offending token when it renders, the step's ⋮ mark for absent facets,
 * the block gutter, the session header — and unmappable paths degrade to
 * anchor-less floor items, never a crash or a silent drop. Items come out in
 * document order, header first.
 */
import { describe, expect, test } from 'vitest'
import {
	draftToNotationInput,
	deriveWorkoutNotation,
	type DraftBlockValue,
} from './workout-notation.ts'
import {
	errorPathValue,
	mapServerErrors,
	type ServerErrorItem,
} from './workout-server-errors.ts'

/** A two-block draft covering every anchor class: a cardio step with a
 * duration + note (no intensity), a strength step with exercise/sets/rest,
 * and a repeated block holding one rest step. */
const draftBlocks: DraftBlockValue[] = [
	{
		name: 'Main',
		repeatCount: '1',
		steps: [
			{
				kind: 'cardio',
				discipline: '',
				intensity: '',
				duration: '6 min',
				distance: '',
				exerciseId: '',
				restBetweenSetsSec: '',
				notes: 'strides',
				sets: [],
			},
			{
				kind: 'strength',
				discipline: '',
				intensity: '',
				duration: '',
				distance: '',
				exerciseId: 'ex1',
				restBetweenSetsSec: '120',
				notes: '',
				sets: [
					{
						kind: 'reps',
						orderIndex: '0',
						reps: '5',
						weightKg: '80',
						pct1RM: '',
						durationSec: '',
					},
				],
			},
		],
	},
	{
		name: '',
		repeatCount: '3',
		steps: [
			{
				kind: 'rest',
				discipline: '',
				intensity: '',
				duration: '1 min',
				distance: '',
				exerciseId: '',
				restBetweenSetsSec: '',
				notes: '',
				sets: [],
			},
		],
	},
]

const formValue = {
	title: 'Tempo Tuesday',
	discipline: 'run',
	intent: 'tempo',
	scheduledAtDate: '2026-06-01',
	scheduledAtTime: '08:00',
	blocks: draftBlocks,
}

const notation = deriveWorkoutNotation(
	draftToNotationInput(draftBlocks, {
		exerciseNames: { ex1: 'Squat' },
		workoutDiscipline: 'run',
	}),
)

function mapOne(path: string, messages = ['boom']): ServerErrorItem {
	const items = mapServerErrors({ [path]: messages }, notation)
	expect(items).toHaveLength(1)
	return items[0]!
}

describe('mapServerErrors — anchors', () => {
	test('a rendered token anchors the error on itself (Conform bracket syntax)', () => {
		const item = mapOne('blocks[0].steps[0].duration')
		expect(item.anchor).toEqual({
			level: 'token',
			address: { blockIndex: 0, stepIndex: 0, field: 'duration' },
		})
	})

	test('domain-schema paths alias to the form field (durationSec → duration)', () => {
		const item = mapOne('blocks.0.steps.0.durationSec')
		expect(item.anchor).toEqual({
			level: 'token',
			address: { blockIndex: 0, stepIndex: 0, field: 'duration' },
		})
	})

	test('a rest step duration error lands on its rest token', () => {
		const item = mapOne('blocks.1.steps.0.durationSec')
		expect(item.anchor).toEqual({
			level: 'token',
			address: { blockIndex: 1, stepIndex: 0, field: 'duration' },
		})
	})

	test('an absent facet anchors on the step, remembering which facet repairs it', () => {
		// The cardio step has no intensity token — no synthetic ghost token,
		// the ⋮ mark carries the tint (spec §10.2).
		const item = mapOne('blocks.0.steps.0.intensity')
		expect(item.anchor).toEqual({
			level: 'step',
			blockIndex: 0,
			stepIndex: 0,
			facet: 'intensity',
		})
	})

	test('set sub-paths anchor on the sets token', () => {
		const item = mapOne('blocks.0.steps.1.sets.0.weightKg')
		expect(item.anchor).toEqual({
			level: 'token',
			address: { blockIndex: 0, stepIndex: 1, field: 'sets' },
		})
	})

	test('exerciseId anchors on the exercise token', () => {
		const item = mapOne('blocks.0.steps.1.exerciseId')
		expect(item.anchor).toEqual({
			level: 'token',
			address: { blockIndex: 0, stepIndex: 1, field: 'exerciseId' },
		})
	})

	test('repeatCount anchors on the repeat badge when it renders, else the block', () => {
		expect(mapOne('blocks.1.repeatCount').anchor).toEqual({
			level: 'token',
			address: { blockIndex: 1, stepIndex: null, field: 'repeatCount' },
		})
		// Block 0 repeats once — no badge — so the gutter carries the error.
		expect(mapOne('blocks.0.repeatCount').anchor).toEqual({
			level: 'block',
			blockIndex: 0,
		})
	})

	test('block-level paths anchor in the gutter', () => {
		expect(mapOne('blocks.0.steps').anchor).toEqual({
			level: 'block',
			blockIndex: 0,
		})
		expect(mapOne('blocks.0.name').anchor).toEqual({
			level: 'block',
			blockIndex: 0,
		})
		expect(mapOne('blocks.1').anchor).toEqual({ level: 'block', blockIndex: 1 })
	})

	test('a step kind error anchors on the step without a repair facet', () => {
		expect(mapOne('blocks.0.steps.1.kind').anchor).toEqual({
			level: 'step',
			blockIndex: 0,
			stepIndex: 1,
			facet: null,
		})
	})

	test('session-level paths anchor on the header', () => {
		expect(mapOne('title').anchor).toEqual({ level: 'session', field: 'title' })
		expect(mapOne('scheduledAt').anchor).toEqual({
			level: 'session',
			field: 'scheduledAt',
		})
	})

	test("the whole-array 'blocks' rule is §11.6's anchor-less floor", () => {
		// "Add at least one step…" has no block to anchor on and no header
		// control that renders it — the summary line is its guaranteed home.
		expect(mapOne('blocks').anchor).toEqual({ level: 'floor' })
	})

	test('manipulated or unmappable paths degrade to anchor-less floor items', () => {
		expect(mapOne('blocks.9.steps.0.duration').anchor).toEqual({
			level: 'floor',
		})
		expect(mapOne('blocks.0.steps.7').anchor).toEqual({ level: 'floor' })
		expect(mapOne('nonsense.path').anchor).toEqual({ level: 'floor' })
		expect(mapOne('').anchor).toEqual({ level: 'floor' })
		expect(mapOne('blocks.NaN.steps.0.duration').anchor).toEqual({
			level: 'floor',
		})
	})
})

describe('mapServerErrors — messages and order', () => {
	test('multiple messages on one path join into one item, never dropped', () => {
		const item = mapOne('blocks.0.steps.0.duration', ['first', 'second'])
		expect(item.message).toBe('first; second')
	})

	test('generic Zod fallbacks re-word into human language', () => {
		expect(mapOne('blocks.0.steps.1.kind', ['Invalid input']).message).toBe(
			'This can’t be saved as written',
		)
		expect(mapOne('title', ['Required']).message).toBe('This is required')
	})

	test('null entries and empty message lists are skipped', () => {
		expect(
			mapServerErrors({ title: null, 'blocks.0.name': [] }, notation),
		).toEqual([])
		expect(mapServerErrors(null, notation)).toEqual([])
	})

	test('items come out in document order — header first, then blocks, gutter before steps, tokens in notation order', () => {
		const items = mapServerErrors(
			{
				// Deliberately shuffled input order.
				'blocks.1.steps.0.durationSec': ['rest length'],
				'blocks.0.steps.0.notes': ['note'],
				'unknown.path': ['floor'],
				'blocks.0.steps.0.duration': ['duration'],
				'blocks.0.steps.1.exerciseId': ['exercise'],
				'blocks.0.name': ['block name'],
				title: ['title'],
				'blocks.0.steps.0.intensity': ['intensity'],
			},
			notation,
		)
		expect(items.map((item) => item.path)).toEqual([
			'title',
			'blocks.0.name',
			'blocks.0.steps.0.duration',
			'blocks.0.steps.0.notes',
			'blocks.0.steps.0.intensity',
			'blocks.0.steps.1.exerciseId',
			'blocks.1.steps.0.durationSec',
			'unknown.path',
		])
	})
})

describe('errorPathValue — the edit-to-clear snapshot', () => {
	test('reads the live form value behind token and session paths', () => {
		expect(errorPathValue('title', formValue)).toBe('Tempo Tuesday')
		expect(errorPathValue('blocks.0.steps.0.durationSec', formValue)).toBe(
			'6 min',
		)
		expect(errorPathValue('blocks[0].steps[0].duration', formValue)).toBe(
			'6 min',
		)
		expect(errorPathValue('blocks.1.repeatCount', formValue)).toBe('3')
		expect(errorPathValue('blocks.0.name', formValue)).toBe('Main')
	})

	test('scheduledAt reads the date + time pair the server built it from', () => {
		expect(errorPathValue('scheduledAt', formValue)).toBe('2026-06-01T08:00')
	})

	test('structural paths read a shape that changes when the structure does', () => {
		expect(errorPathValue('blocks', formValue)).toBe('2')
		expect(errorPathValue('blocks.0.steps', formValue)).toBe('2')
	})

	test('set sub-paths read the whole set list, so any set edit clears', () => {
		const before = errorPathValue('blocks.0.steps.1.sets.0.weightKg', formValue)
		const edited = structuredClone(formValue)
		edited.blocks[0]!.steps![1]!.sets![0]!.weightKg = '85'
		expect(errorPathValue('blocks.0.steps.1.sets.0.weightKg', edited)).not.toBe(
			before,
		)
	})

	test('unreadable paths return null — the marking then waits for the next submit', () => {
		expect(errorPathValue('blocks.9.steps.0.duration', formValue)).toBeNull()
		expect(errorPathValue('nonsense.path', formValue)).toBeNull()
		expect(errorPathValue('', formValue)).toBeNull()
	})
})
