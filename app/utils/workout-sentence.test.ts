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
			{
				start: 9,
				end: 16,
				text: 'terksel',
				reason: 'unknown-word',
				suggestions: ['terskel'],
			},
		])
	})

	test('a number with no unit asks which unit, as replacements', () => {
		const parsed = parseWorkoutSentence('10 rolig', { discipline: 'run' })
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			{
				start: 0,
				end: 2,
				text: '10',
				reason: 'no-unit',
				suggestions: ['10 km', '10 min'],
			},
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

describe('what is saved is exactly what was typed, or nothing is', () => {
	const read = (text: string) =>
		parseWorkoutSentence(text, { discipline: 'run' })
	const refused = (text: string) => {
		const parsed = read(text)
		expect({ text, structure: parsed.structure }).toEqual({
			text,
			structure: null,
		})
		expect(parsed.unknown.length + parsed.problems.length).toBeGreaterThan(0)
		return parsed
	}

	test('a clock alone could be two durations, and asks which', () => {
		expect(refused('1:30').unknown[0]).toMatchObject({
			text: '1:30',
			reason: 'ambiguous-time',
			suggestions: ['1 t 30 min', '1 min 30 s'],
		})
		const reps = refused('4x1:30 p 1:00')
		expect(reps.unknown.map((u) => u.text)).toEqual(['1:30', '1:00'])
	})

	test('h:mm:ss can only be a duration', () => {
		expect(read('1:30:00 rolig').structure?.blocks[0]?.steps[0]).toMatchObject({
			durationSec: 5400,
		})
	})

	test('a lap time on a short rep is not read as a pace', () => {
		expect(refused('5 x 400 m @ 1:30').unknown[0]).toMatchObject({
			text: '1:30',
			reason: 'ambiguous-time',
			suggestions: ['1:30/km'],
		})
		// Said per km, it is a pace whatever the distance.
		expect(
			read('5 x 400 m @ 3:45/km').structure?.blocks[0]?.steps[0],
		).toMatchObject({ intensity: { kind: 'pace', minSecPerKm: 225 } })
		// On a time, `@ 4:00` can only be a pace.
		expect(
			read('2x 20 min @ 4:00 p 3 min').structure?.blocks[0]?.steps[0],
		).toMatchObject({ intensity: { kind: 'pace', minSecPerKm: 240 } })
	})

	test('a thousands separator is never read as a decimal', () => {
		expect(refused('10.000 m').unknown[0]).toMatchObject({
			text: '10.000',
			reason: 'ambiguous-number',
			suggestions: ['10000'],
		})
		expect(refused('1,500 km').unknown[0]?.suggestions).toEqual(['1500', '1,5'])
	})

	test('one repeat per part', () => {
		expect(refused('2 x 3 x 1 km').problems).toContain('two-repeats')
	})

	test('a rest is a time; a distance rest is refused, never dropped', () => {
		expect(refused('6x1 km p 200 m jogg').problems).toContain('distance-rest')
		expect(refused('10 km rolig p').problems).toContain('dangling-rest')
	})

	test('two intensities or two sports in one sentence are refused', () => {
		expect(refused('10 km rolig z5').problems).toContain('two-intensities')
		expect(refused('10 km rolig @ 5:00/km').problems).toContain(
			'two-intensities',
		)
		expect(refused('10 km sykkel løp').problems).toContain('two-disciplines')
		// The same word twice says one thing.
		expect(read('rolig 10 km rolig').structure).not.toBeNull()
	})

	test('a character no rule reads is a stray, never skipped', () => {
		for (const text of [
			'-5 km',
			'10 km rolig :)',
			'10 km rolig!!!',
			'10 km; 5 km',
			'2x(3x1 km)',
			'１０ km',
		]) {
			const parsed = refused(text)
			expect({
				text,
				stray: parsed.unknown.some((u) => u.reason === 'stray'),
			}).toEqual({ text, stray: true })
		}
		expect(refused('10 km "rolig"').unknown[0]).toMatchObject({ text: '"' })
	})

	test('a join with nothing on one side is refused', () => {
		expect(refused('5 km + + 5 km').problems).toContain('empty-part')
		expect(refused('10 km +').problems).toContain('empty-part')
	})

	test('numbers past any sane bound, and zero, are refused', () => {
		for (const text of [
			'99999 km',
			'1000x 400 m',
			'0 km',
			'25 t',
			'3x1 km p 2 t',
		]) {
			expect(refused(text).problems).toContain('out-of-range')
		}
	})

	test('a larger time unit then a smaller one adds up', () => {
		expect(read('1 t 30 min').structure?.blocks[0]?.steps[0]).toMatchObject({
			durationSec: 5400,
		})
		expect(refused('30 min 1 t').problems).toContain('two-quantities')
	})

	test('a stray x or a command is unknown, not ignored', () => {
		expect(refused('400m x 10').unknown.map((u) => u.text)).toEqual(['x', '10'])
		expect(refused('syk til onsdag').unknown).toHaveLength(3)
	})

	test('a sentence longer than the line takes is refused before it is read', () => {
		const long = '10 km rolig + '.repeat(20) + '1 km'
		expect(refused(long).problems).toEqual(['too-long'])
	})

	test('a timed rest adds no km; the totals follow the week’s rule', () => {
		expect(read('6x1 km p 1 min').totals).toEqual({
			distanceM: 6000,
			durationSec: null,
		})
		expect(read('20 min oppv + 4x4 min hardt p 3 min').totals).toEqual({
			distanceM: null,
			durationSec: 20 * 60 + 4 * 7 * 60,
		})
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

	test('a long word is not measured at all', () => {
		expect(suggestWords('a'.repeat(200_000))).toEqual([])
		// Nor is a letter or two, which is one edit from any short word.
		expect(suggestWords('x')).toEqual([])
	})
})

describe('replaceWord', () => {
	test('tapping a suggestion replaces exactly that word', () => {
		const text = '3x10 min terksel p 1 min'
		const [word] = parseWorkoutSentence(text, { discipline: 'run' }).unknown
		expect(replaceWord(text, word!, 'terskel')).toBe('3x10 min terskel p 1 min')
	})

	test('a word typed with a capital keeps it, though the suggestion has none', () => {
		const text = 'Terksel 3x10 min'
		const word = { text: 'Terksel', start: 0, end: 7 } as Parameters<
			typeof replaceWord
		>[1]
		expect(replaceWord(text, word, 'terskel')).toBe('Terskel 3x10 min')
		expect(replaceWord('terksel', { ...word }, 'terskel')).toBe('terskel')
	})
})
