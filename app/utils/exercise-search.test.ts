/**
 * Bibliotek's exercise search reads every name a lift answers to (owner
 * decision 9): `knebøy` finds the Back Squat.
 */
import { expect, test } from 'vitest'
import { searchExercises, type SearchableExercise } from './exercise-search.ts'

/** Name order, as the loader hands them over. */
const EXERCISES: SearchableExercise[] = [
	{
		id: 'squat',
		name: 'Back Squat',
		aliases: [
			{ text: 'squat', locale: 'en' },
			{ text: 'knebøy', locale: 'nb' },
		],
	},
	{
		id: 'bench',
		name: 'Bench Press',
		aliases: [{ text: 'benkpress', locale: 'nb' }],
	},
	{ id: 'bw-squat', name: 'Bodyweight Squat', aliases: [] },
	{
		id: 'front',
		name: 'Front Squat',
		aliases: [{ text: 'frontknebøy', locale: 'nb' }],
	},
	{
		id: 'goblet',
		name: 'Goblet Squat',
		aliases: [{ text: 'gobletknebøy', locale: 'nb' }],
	},
	{
		id: 'ohp',
		name: 'Overhead Press',
		aliases: [
			{ text: 'OHP', locale: 'en' },
			{ text: 'militærpress', locale: 'nb' },
		],
	},
	{ id: 'pullup', name: 'Pull-up', aliases: [] },
]

const ids = (query: string) =>
	searchExercises(EXERCISES, query).map((hit) => hit.exercise.id)

test('a Norwegian word finds the lift it names, the exact name first', () => {
	expect(ids('knebøy')).toEqual(['squat', 'front', 'goblet'])
})

test('case and surrounding space do not matter', () => {
	expect(ids('  KNEBØY ')).toEqual(['squat', 'front', 'goblet'])
})

test('a lift found by another name says which, so the row explains the hit', () => {
	const [hit] = searchExercises(EXERCISES, 'ohp')
	expect(hit).toMatchObject({ exercise: { id: 'ohp' }, alias: 'OHP' })
})

test('a lift found by its own name shows its Norwegian name, where it has one', () => {
	const hits = searchExercises(EXERCISES, 'squat')
	expect(hits.map((hit) => [hit.exercise.id, hit.alias])).toEqual([
		// `squat` is the Back Squat's own alias, so it is the exact hit.
		['squat', 'knebøy'],
		['bw-squat', null],
		['front', 'frontknebøy'],
		['goblet', 'gobletknebøy'],
	])
})

test('punctuation and spaces inside a name are not a miss', () => {
	expect(ids('pullup')).toEqual(['pullup'])
	expect(ids('pull up')).toEqual(['pullup'])
})

test('no query lists everything in the order it came, each with its Norwegian name', () => {
	const hits = searchExercises(EXERCISES, '')
	expect(hits.map((hit) => hit.exercise.id)).toEqual(
		EXERCISES.map((exercise) => exercise.id),
	)
	expect(hits[0]!.alias).toBe('knebøy')
})

test('a word nothing answers to finds nothing', () => {
	expect(ids('zercher')).toEqual([])
})
