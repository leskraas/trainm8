import { describe, expect, test } from 'vitest'
import {
	resizeUniformSets,
	setsAreUniform,
	switchUniformSetKind,
	uniformSetTemplate,
} from './strength-sets.ts'
import { type DraftSetValue } from './workout-notation.ts'

const reps = (
	reps: string,
	load: Partial<DraftSetValue> = {},
): DraftSetValue => ({
	kind: 'reps',
	reps,
	weightKg: '',
	pct1RM: '',
	durationSec: '',
	...load,
})

describe('setsAreUniform', () => {
	test('equal rep sets with equal loads are uniform', () => {
		expect(
			setsAreUniform([
				reps('5', { weightKg: '80' }),
				reps('5', { weightKg: '80' }),
			]),
		).toBe(true)
	})

	test('one set is trivially uniform', () => {
		expect(setsAreUniform([reps('5')])).toBe(true)
	})

	test('diverging reps, load, or kind break uniformity', () => {
		expect(setsAreUniform([reps('5'), reps('3')])).toBe(false)
		expect(
			setsAreUniform([
				reps('5', { weightKg: '80' }),
				reps('5', { weightKg: '90' }),
			]),
		).toBe(false)
		expect(
			setsAreUniform([
				reps('5', { weightKg: '80' }),
				reps('5', { pct1RM: '80' }),
			]),
		).toBe(false)
		expect(
			setsAreUniform([reps('5'), { kind: 'timed', durationSec: '30' }]),
		).toBe(false)
	})

	test('only the fields the kind reads count — a stale reps value on a timed set is ignored', () => {
		// Kind switches set fields aside without clearing them; uniformity must
		// compare what the sets actually say, not leftover drafts.
		expect(
			setsAreUniform([
				{ kind: 'timed', durationSec: '30', reps: '5' },
				{ kind: 'timed', durationSec: '30', reps: '8' },
			]),
		).toBe(true)
		expect(
			setsAreUniform([
				{ kind: 'amrap', reps: '5', durationSec: '30' },
				{ kind: 'amrap', reps: '12', durationSec: '45' },
			]),
		).toBe(true)
	})

	test('absent and empty fields compare equal; whitespace is ignored', () => {
		expect(setsAreUniform([reps('5'), { kind: 'reps', reps: ' 5 ' }])).toBe(
			true,
		)
		expect(
			setsAreUniform([
				reps('5', { weightKg: '' }),
				{ kind: 'reps', reps: '5' },
			]),
		).toBe(true)
	})

	test('an empty list is not uniform — there is nothing to mirror', () => {
		expect(setsAreUniform([])).toBe(false)
	})
})

describe('uniformSetTemplate', () => {
	test('returns the shared values when uniform', () => {
		expect(
			uniformSetTemplate([
				reps('5', { weightKg: '80' }),
				reps('5', { weightKg: '80' }),
			]),
		).toEqual({
			kind: 'reps',
			reps: '5',
			durationSec: '',
			weightKg: '80',
			pct1RM: '',
		})
	})

	test('null when the sets diverge or the list is empty', () => {
		expect(uniformSetTemplate([reps('5'), reps('3')])).toBeNull()
		expect(uniformSetTemplate([])).toBeNull()
	})

	test('an unrecognized kind normalizes to reps, like the notation does', () => {
		expect(uniformSetTemplate([{ reps: '5' }])).toMatchObject({
			kind: 'reps',
			reps: '5',
		})
	})
})

describe('resizeUniformSets', () => {
	test('growing clones the last set', () => {
		const sets = [reps('5', { weightKg: '80' })]
		expect(resizeUniformSets(sets, 3)).toEqual([
			reps('5', { weightKg: '80' }),
			reps('5', { weightKg: '80' }),
			reps('5', { weightKg: '80' }),
		])
	})

	test('shrinking truncates from the end', () => {
		const sets = [reps('5'), reps('5'), reps('5')]
		expect(resizeUniformSets(sets, 2)).toEqual([reps('5'), reps('5')])
	})

	test('clamps to at least one set and clones defensively', () => {
		const sets = [reps('5')]
		const resized = resizeUniformSets(sets, 0)
		expect(resized).toEqual([reps('5')])
		expect(resized[0]).not.toBe(sets[0])
	})
})

describe('switchUniformSetKind', () => {
	test('switching to timed seeds an empty duration and keeps the load', () => {
		expect(
			switchUniformSetKind([reps('5', { weightKg: '60' })], 'timed'),
		).toEqual([
			{
				kind: 'timed',
				reps: '5',
				durationSec: '30',
				weightKg: '60',
				pct1RM: '',
			},
		])
	})

	test('switching back to reps seeds reps only when empty', () => {
		const timed: DraftSetValue = {
			kind: 'timed',
			reps: '',
			durationSec: '45',
			weightKg: '',
			pct1RM: '',
		}
		expect(switchUniformSetKind([timed], 'reps')[0]).toMatchObject({
			kind: 'reps',
			reps: '5',
			durationSec: '45',
		})
		// An authored quantity survives the round-trip — never reseeded.
		const authored: DraftSetValue = { ...timed, reps: '8' }
		expect(switchUniformSetKind([authored], 'reps')[0]).toMatchObject({
			kind: 'reps',
			reps: '8',
		})
	})

	test('AMRAP needs no quantity and seeds nothing', () => {
		expect(switchUniformSetKind([reps('5')], 'amrap')[0]).toMatchObject({
			kind: 'amrap',
			reps: '5',
		})
	})

	test('a uniform-view swap lands uniform even over differing stale drafts', () => {
		// Timed sets can carry differing stale reps the timed view ignored; the
		// swap homogenizes the new kind's quantity to the first set's value so
		// the uniform mirror never silently ejects into the per-set grid.
		const switched = switchUniformSetKind(
			[
				{ kind: 'timed', durationSec: '30', reps: '5' },
				{ kind: 'timed', durationSec: '30', reps: '3' },
				{ kind: 'timed', durationSec: '30', reps: '' },
			],
			'reps',
		)
		expect(switched.map((set) => set.reps)).toEqual(['5', '5', '5'])
		expect(setsAreUniform(switched)).toBe(true)
	})
})
