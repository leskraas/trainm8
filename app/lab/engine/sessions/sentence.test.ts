/**
 * How `add_session` reads the athlete's words: lifts with their sets first or
 * last, and a sport guessed when the words do not say one.
 */
import { describe, expect, test } from 'vitest'
import { nameFirst, readAddSentence } from './sentence.ts'

const exercises = [
	{ id: 'squat', name: 'Back Squat', aliases: ['knebøy'] },
	{ id: 'bench', name: 'Bench Press', aliases: ['benkpress'] },
]

function read(
	sentence: string,
	sport: 'run' | 'bike' | 'swim' | 'strength' | null = null,
	mainSport: 'run' | 'bike' | 'swim' | null = null,
) {
	return readAddSentence({ sentence, sport, mainSport, exercises })
}

describe('nameFirst', () => {
	test.each([
		['3x10 knebøy', 'knebøy 3x10'],
		['3x10 knebøy 60 kg', 'knebøy 3x10 60 kg'],
		['3 × 10 knebøy @ 60 kg', 'knebøy 3 × 10 @ 60 kg'],
		['3x10 knebøy 62,5kg', 'knebøy 3x10 62,5kg'],
		['3x10 knebøy, 3x8 benkpress', 'knebøy 3x10, benkpress 3x8'],
		['3x10 knebøy + 3x8 benkpress 40 kg', 'knebøy 3x10 + benkpress 3x8 40 kg'],
	])('%s → %s', (typed, reordered) => {
		expect(nameFirst(typed)).toBe(reordered)
	})

	test('leaves name-first and running sentences alone', () => {
		expect(nameFirst('knebøy 3x10 60kg')).toBeNull()
		expect(nameFirst('45 min rolig')).toBeNull()
	})
})

describe('readAddSentence', () => {
	test.each([
		'3x10 knebøy',
		'3x10 knebøy 60 kg',
		'3x10 knebøy 60kg',
		'knebøy 3x10 60kg',
		'knebøy 3x10 60 kg',
		'3x10 knebøy, 3x8 benkpress 40 kg',
	])('%s is a strength session, with or without the hint', (sentence) => {
		for (const sport of [null, 'strength', 'run'] as const) {
			const got = read(sentence, sport)
			expect(got, `${sentence} (${sport})`).not.toBeNull()
			expect(got!.sportGuessedBecause).toBeNull()
		}
	})

	test('a running repeat stays a run, never a lift called «min»', () => {
		const got = read('4x8 min terskel', 'run')
		expect(got).toMatchObject({
			sentence: '4x8 min terskel',
			discipline: 'run',
		})
	})

	test.each([
		['løp 45 min rolig', 'run'],
		['45 min rolig løping', 'run'],
		['45 min rolig jogg', 'run'],
		['sykkel 1 t rolig', 'bike'],
		['1 t rolig sykling', 'bike'],
		['svøm 30 min rolig', 'swim'],
		['svømming 30 min', 'swim'],
	])('%s names its own sport', (sentence) => {
		const got = read(sentence)
		expect(got).not.toBeNull()
		expect(got!.sportGuessedBecause).toBeNull()
	})

	test('45 min rolig with no sport is the main sport, said as a guess', () => {
		const got = read('45 min rolig', null, 'bike')
		expect(got).toMatchObject({ discipline: 'bike' })
		expect(got!.sportGuessedBecause).toContain('sykling')
		expect(got!.sportGuessedBecause).toContain('hovedidretten')
	})

	test('45 min rolig with no sport and no main sport is a run', () => {
		const got = read('45 min rolig')
		expect(got).toMatchObject({ discipline: 'run' })
		expect(got!.sportGuessedBecause).toContain('løping')
	})

	test('a sport hint is used as given, with nothing guessed', () => {
		expect(read('45 min rolig', 'swim', 'run')).toEqual({
			sentence: '45 min rolig',
			discipline: 'swim',
			sportGuessedBecause: null,
		})
	})

	test('words that are not a session are not read', () => {
		expect(read('???')).toBeNull()
		expect(read('knebøy')).toBeNull()
	})
})
