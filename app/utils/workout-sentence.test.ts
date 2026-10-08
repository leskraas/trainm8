import { describe, expect, test } from 'vitest'
import {
	parseWorkoutSentence,
	replaceWord,
	suggestWords,
} from './workout-sentence.ts'

describe('parseWorkoutSentence', () => {
	test('a distance at an easy word is one step in Z2', () => {
		const parsed = parseWorkoutSentence('10 km rolig', { discipline: 'run' })
		expect(parsed.unknown).toEqual([])
		expect(parsed.problems).toEqual([])
		expect(parsed.structure).toEqual({
			discipline: 'run',
			blocks: [
				{
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							distanceM: 10000,
							intensity: { kind: 'zoneLabel', label: 'Z2' },
						},
					],
				},
			],
		})
		expect(parsed.intent).toBe('endurance')
		expect(parsed.totals).toEqual({ distanceM: 10000, durationSec: null })
	})

	test('a repeat with a rest is one block of work and rest', () => {
		const parsed = parseWorkoutSentence('3x10 min terskel p 1 min', {
			discipline: 'run',
		})
		expect(parsed.structure?.blocks).toEqual([
			{
				repeatCount: 3,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						durationSec: 600,
						intensity: { kind: 'zoneLabel', label: 'Z4' },
					},
					{ kind: 'rest', durationSec: 60 },
				],
			},
		])
		expect(parsed.intent).toBe('threshold')
		expect(parsed.totals).toEqual({ distanceM: null, durationSec: 33 * 60 })
	})

	test('a rest written as its own part joins the repeat before it', () => {
		const parsed = parseWorkoutSentence('4 × 6 min I4, 1 min pause', {
			discipline: 'run',
		})
		expect(parsed.structure?.blocks).toHaveLength(1)
		expect(parsed.structure?.blocks[0]?.steps.at(-1)).toEqual({
			kind: 'rest',
			durationSec: 60,
		})
	})

	test('parts joined by + become blocks in order', () => {
		const parsed = parseWorkoutSentence(
			'2 km oppvarming + 5x1 km @ 3:50 p 90 s + 2 km nedjogg',
			{ discipline: 'run' },
		)
		expect(parsed.unknown).toEqual([])
		const blocks = parsed.structure?.blocks ?? []
		expect(blocks.map((b) => b.repeatCount)).toEqual([1, 5, 1])
		expect(blocks[1]?.steps[0]).toEqual({
			kind: 'cardio',
			discipline: 'run',
			distanceM: 1000,
			intensity: { kind: 'pace', minSecPerKm: 230 },
		})
		expect(blocks[1]?.steps[1]).toEqual({ kind: 'rest', durationSec: 90 })
		expect(blocks[0]?.steps[0]).toMatchObject({
			intensity: { kind: 'zoneLabel', label: 'Z1' },
		})
	})

	test('hours and a decimal comma read the Norwegian way', () => {
		expect(
			parseWorkoutSentence('1,5 t rolig', { discipline: 'bike' }).structure
				?.blocks[0]?.steps[0],
		).toMatchObject({ durationSec: 5400 })
		expect(
			parseWorkoutSentence('8,5 km', { discipline: 'run' }).structure?.blocks[0]
				?.steps[0],
		).toMatchObject({ distanceM: 8500 })
	})

	test('a pace range after the quantity is the step’s target', () => {
		const step = parseWorkoutSentence('12 km 4:50-5:10/km', {
			discipline: 'run',
		}).structure?.blocks[0]?.steps[0]
		expect(step).toMatchObject({
			intensity: { kind: 'pace', minSecPerKm: 290, maxSecPerKm: 310 },
		})
	})

	test('a discipline word in the sentence wins over the chosen chip', () => {
		const parsed = parseWorkoutSentence('2 t rolig sykkel', {
			discipline: 'run',
		})
		expect(parsed.discipline).toBe('bike')
		expect(parsed.disciplineFromText).toBe(true)
		expect(parsed.structure?.discipline).toBe('bike')
		expect(parsed.structure?.blocks[0]?.steps[0]).toMatchObject({
			discipline: 'bike',
		})
	})

	test('an unknown word is reported where it stands, with suggestions', () => {
		const parsed = parseWorkoutSentence('3x10 min terksel', {
			discipline: 'run',
		})
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			{ start: 9, end: 16, text: 'terksel', suggestions: ['terskel'] },
		])
	})

	test('a number with no unit asks which unit, as replacements', () => {
		const parsed = parseWorkoutSentence('10 rolig', { discipline: 'run' })
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			{ start: 0, end: 2, text: '10', suggestions: ['10 km', '10 min'] },
		])
	})

	test('words with no quantity are a problem, not a session', () => {
		expect(
			parseWorkoutSentence('rolig', { discipline: 'run' }).problems,
		).toEqual(['no-quantity'])
		expect(parseWorkoutSentence('   ', { discipline: 'run' }).problems).toEqual(
			['empty'],
		)
	})

	test('no discipline chosen and none written is a problem', () => {
		expect(
			parseWorkoutSentence('10 km rolig', { discipline: null }).problems,
		).toEqual(['no-discipline'])
		expect(
			parseWorkoutSentence('10 km rolig løp', { discipline: null }).structure
				?.discipline,
		).toBe('run')
	})

	test('a step stating both a distance and a time is refused', () => {
		expect(
			parseWorkoutSentence('10 km 50 min', { discipline: 'run' }).problems,
		).toEqual(['two-quantities'])
	})

	test('glue words are understood and ignored', () => {
		const parsed = parseWorkoutSentence('10 km i rolig fart', {
			discipline: 'run',
		})
		expect(parsed.unknown).toEqual([])
		expect(parsed.structure).not.toBeNull()
	})
})

describe('suggestWords', () => {
	test('a misspelt word is close to the word it was meant to be', () => {
		expect(suggestWords('roilg')).toEqual(['rolig'])
		expect(suggestWords('teskel')).toEqual(['terskel'])
		expect(suggestWords('pasue')).toEqual(['pause'])
	})

	test('a word near nothing has no suggestion', () => {
		expect(suggestWords('banan')).toEqual([])
	})
})

describe('replaceWord', () => {
	test('tapping a suggestion replaces exactly that word', () => {
		const text = '3x10 min terksel p 1 min'
		const [word] = parseWorkoutSentence(text, { discipline: 'run' }).unknown
		expect(replaceWord(text, word!, 'terskel')).toBe('3x10 min terskel p 1 min')
	})
})
