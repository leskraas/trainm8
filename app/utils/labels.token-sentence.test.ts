/**
 * The Token Sentence's words on display (owner decision 8, ADR 0089): every
 * glue word Norwegian, every stored zone label read in Norwegian where it is
 * an English word, and nothing English left in the words the notation draws.
 */
import { expect, test } from 'vitest'
import {
	REST_ACT_WORDS,
	TOKEN_EDITOR_TITLES,
	TOKEN_SENTENCE_WORDS,
	zoneLabelWord,
} from './labels.ts'
import { REST_ACTS } from './workout-schema.ts'

test('a stored English zone word reads as the word the athletes train in', () => {
	expect(zoneLabelWord('easy')).toBe('Rolig')
	expect(zoneLabelWord('Easy')).toBe('Rolig')
	expect(zoneLabelWord('endurance')).toBe('Rolig')
	expect(zoneLabelWord('threshold')).toBe('Terskel')
	expect(zoneLabelWord('recovery')).toBe('Restitusjon')
	expect(zoneLabelWord(' tempo ')).toBe('Tempo')
	expect(zoneLabelWord('max')).toBe('Maks')
})

test('a zone code and a Norwegian word pass through as stored', () => {
	for (const code of ['Z1', 'Z2', 'Z5', 'I4', 'I-4', 'E', 'T']) {
		expect(zoneLabelWord(code)).toBe(code)
	}
	expect(zoneLabelWord('terskel')).toBe('Terskel')
	expect(zoneLabelWord('rolig')).toBe('Rolig')
})

test('every rest act has its Norwegian words', () => {
	for (const act of REST_ACTS) expect(REST_ACT_WORDS[act]).toBeTruthy()
})

test('no English glue is left in the sentence or its popover titles', () => {
	const words = [
		...Object.values(TOKEN_SENTENCE_WORDS).map((word) =>
			typeof word === 'function' ? word('X' as never) : word,
		),
		...Object.values(REST_ACT_WORDS),
		...Object.values(TOKEN_EDITOR_TITLES),
	].join(' ')
	for (const english of [
		'rest',
		'recovery',
		'until',
		'bodyweight',
		'on file',
		'block',
		'repeat count',
		'exercise',
		'jog back',
	]) {
		expect(words).not.toContain(english)
	}
	expect(TOKEN_SENTENCE_WORDS.restFor('1 min')).toBe('1 min pause')
	expect(TOKEN_EDITOR_TITLES.repeat).toBe('ganger')
	expect(TOKEN_SENTENCE_WORDS.addBlock).toBe('+ blokk')
})
