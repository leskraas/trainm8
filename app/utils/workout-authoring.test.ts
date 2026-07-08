import { expect, test } from 'vitest'
import {
	buildBlocksInput,
	buildStepInput,
	emptyBlock,
	emptyStep,
	emptySet,
	FormSchema,
} from './workout-authoring.ts'

test('buildStepInput maps a cardio step with humane duration and an intensity target', () => {
	const result = buildStepInput(
		{
			kind: 'cardio',
			discipline: 'bike',
			intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }),
			duration: '10 min',
			distance: '5 km',
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

test('buildStepInput reads a bare step distance as metres', () => {
	const result = buildStepInput(
		{ kind: 'cardio', discipline: 'run', distance: '400' },
		'run',
	)

	expect(result).toMatchObject({ kind: 'cardio', distanceM: 400 })
})

test('buildStepInput inherits the workout discipline and drops an incomplete intensity draft', () => {
	// JSON that parses but fails the IntensityTarget schema — an unfinished
	// editor draft. It must not be saved as a target (the FormSchema surfaces it
	// as a field error instead); the mapper drops it to undefined.
	const result = buildStepInput(
		{ kind: 'cardio', discipline: '', intensity: '{"kind":"pace"}' },
		'swim',
	)

	expect(result).toMatchObject({
		kind: 'cardio',
		discipline: 'swim',
		intensity: undefined,
	})
})

test('buildStepInput reads a legacy plain-string intensity as a zone label', () => {
	// Bare strings are the pre-JSON persisted form (e.g. "endurance"); the
	// notation module renders them, so the mapper preserves them as zoneLabel
	// targets rather than dropping them.
	const result = buildStepInput(
		{ kind: 'cardio', discipline: 'run', intensity: 'endurance' },
		'run',
	)

	expect(result).toMatchObject({
		kind: 'cardio',
		intensity: { kind: 'zoneLabel', label: 'endurance' },
	})
})

test('buildStepInput falls back to run for an unknown cardio discipline', () => {
	const result = buildStepInput(
		{ kind: 'cardio', discipline: 'rowing' },
		'strength',
	)

	expect(result).toMatchObject({ kind: 'cardio', discipline: 'run' })
})

test('buildStepInput maps a rest step with a humane duration', () => {
	const result = buildStepInput(
		{ kind: 'rest', duration: '90 s', notes: 'recover' },
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

// ——— FormSchema: simple mode ——————————————————————————————————————————

const simpleBase = {
	title: 'Easy Run',
	discipline: 'run',
	intent: 'endurance',
	scheduledAtDate: '2026-06-08',
	scheduledAtTime: '08:00',
	structure: 'simple',
}

test('FormSchema accepts a simple submission with a humane duration', () => {
	const parsed = FormSchema.safeParse({ ...simpleBase, duration: '40 min' })
	expect(parsed.success).toBe(true)
})

test('FormSchema defaults to simple mode when structure is absent', () => {
	const { structure: _ignored, ...withoutStructure } = simpleBase
	const parsed = FormSchema.safeParse({
		...withoutStructure,
		duration: '40 min',
	})
	expect(parsed.success).toBe(true)
	if (parsed.success) expect(parsed.data.structure).toBe('simple')
})

test('FormSchema accepts a simple submission with only a distance', () => {
	const parsed = FormSchema.safeParse({ ...simpleBase, distance: '8 km' })
	expect(parsed.success).toBe(true)
})

test('FormSchema rejects a simple submission with neither duration nor distance', () => {
	const parsed = FormSchema.safeParse({ ...simpleBase })
	expect(parsed.success).toBe(false)
})

test('FormSchema rejects a simple submission with both duration and distance', () => {
	const parsed = FormSchema.safeParse({
		...simpleBase,
		duration: '40 min',
		distance: '8 km',
	})
	expect(parsed.success).toBe(false)
})

test('FormSchema rejects an unparseable simple duration', () => {
	const parsed = FormSchema.safeParse({ ...simpleBase, duration: 'a while' })
	expect(parsed.success).toBe(false)
})

test('FormSchema rejects a simple strength session (needs structure)', () => {
	const parsed = FormSchema.safeParse({
		...simpleBase,
		discipline: 'strength',
		duration: '40 min',
	})
	expect(parsed.success).toBe(false)
})

// ——— FormSchema: structured mode ———————————————————————————————————————

test('FormSchema rejects a structured submission without blocks', () => {
	const parsed = FormSchema.safeParse({
		...simpleBase,
		structure: 'structured',
	})
	expect(parsed.success).toBe(false)
})

test('FormSchema rejects a block with no steps', () => {
	const parsed = FormSchema.safeParse({
		...simpleBase,
		structure: 'structured',
		blocks: [{ steps: [] }],
	})
	expect(parsed.success).toBe(false)
})

test('FormSchema rejects an unparseable step duration', () => {
	const parsed = FormSchema.safeParse({
		...simpleBase,
		structure: 'structured',
		blocks: [{ steps: [{ kind: 'cardio', duration: 'a while' }] }],
	})
	expect(parsed.success).toBe(false)
})

test('FormSchema rejects a step with both duration and distance', () => {
	const parsed = FormSchema.safeParse({
		...simpleBase,
		structure: 'structured',
		blocks: [
			{ steps: [{ kind: 'cardio', duration: '5 min', distance: '1 km' }] },
		],
	})
	expect(parsed.success).toBe(false)
})

// ——— buildBlocksInput ————————————————————————————————————————————————

test('buildBlocksInput maps simple mode to a single-step block in canonical units', () => {
	const parsed = FormSchema.parse({ ...simpleBase, duration: '40 min' })
	expect(buildBlocksInput(parsed)).toEqual([
		{
			repeatCount: 1,
			steps: [
				{
					kind: 'cardio',
					discipline: 'run',
					durationSec: 2400,
					distanceM: undefined,
				},
			],
		},
	])
})

test('buildBlocksInput reads a bare simple duration as minutes and distance as km', () => {
	const withDuration = FormSchema.parse({ ...simpleBase, duration: '40' })
	expect(buildBlocksInput(withDuration)[0]!.steps[0]).toMatchObject({
		durationSec: 2400,
	})

	const withDistance = FormSchema.parse({ ...simpleBase, distance: '8' })
	expect(buildBlocksInput(withDistance)[0]!.steps[0]).toMatchObject({
		distanceM: 8000,
		durationSec: undefined,
	})
})

test('buildBlocksInput maps structured blocks through buildStepInput', () => {
	const parsed = FormSchema.parse({
		...simpleBase,
		structure: 'structured',
		blocks: [
			{
				name: 'Main set',
				repeatCount: '3',
				steps: [{ kind: 'cardio', discipline: '', duration: '10 min' }],
			},
		],
	})
	expect(buildBlocksInput(parsed)).toEqual([
		{
			name: 'Main set',
			repeatCount: 3,
			steps: [
				{
					kind: 'cardio',
					discipline: 'run',
					intensity: undefined,
					durationSec: 600,
					distanceM: undefined,
					notes: undefined,
				},
			],
		},
	])
})
