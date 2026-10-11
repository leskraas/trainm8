/**
 * The Norwegian alias table (owner decision 9) is content the reader and the
 * exercise search both lean on, so its rules are held here: every word names a
 * corpus lift, no word names two, and the writing line reads each word as the
 * lift it names. Each test lists every offender, not the first.
 */
import { expect, test } from 'vitest'
import { NB_EXERCISE_ALIASES } from './exercise-aliases-nb.ts'
import { EXERCISE_CORPUS } from './exercise-corpus.ts'
import {
	parseWorkoutSentence,
	type SentenceExercise,
} from './workout-sentence.ts'

/** Case, spaces and punctuation set aside — the reader's own key. */
const key = (text: string) =>
	text
		.normalize('NFC')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '')

const words = Object.entries(NB_EXERCISE_ALIASES).flatMap(([id, list]) =>
	list.map((word) => ({ id, word })),
)

test('every aliased id is a corpus exercise', () => {
	const ids = new Set(EXERCISE_CORPUS.map((row) => row.id))
	expect(Object.keys(NB_EXERCISE_ALIASES).filter((id) => !ids.has(id))).toEqual(
		[],
	)
})

test('no Norwegian word names two lifts, or another lift’s name or alias', () => {
	const owner = new Map<string, string>()
	for (const row of EXERCISE_CORPUS) {
		for (const text of [row.name, ...row.aliases]) {
			if (!owner.has(key(text))) owner.set(key(text), row.id)
		}
	}
	const seen = new Map<string, string>()
	const clashes: string[] = []
	for (const { id, word } of words) {
		const k = key(word)
		const other = seen.get(k) ?? owner.get(k)
		if (other != null && other !== id) clashes.push(`${word}: ${id} / ${other}`)
		seen.set(k, id)
	}
	expect(clashes).toEqual([])
})

test('the writing line reads every Norwegian word as the lift it names', () => {
	// The corpus as the writing line receives it: names plus every alias.
	const exercises: SentenceExercise[] = EXERCISE_CORPUS.map((row) => ({
		id: row.id,
		name: row.name,
		aliases: [...row.aliases, ...(NB_EXERCISE_ALIASES[row.id] ?? [])],
	}))
	const misread = words.flatMap(({ id, word }) => {
		const read = parseWorkoutSentence(`${word} 3x5 @ 40 kg`, {
			discipline: 'strength',
			exercises,
		}).lifts.map((lift) => lift.exerciseId)
		return read.length === 1 && read[0] === id
			? []
			: [`${word}: ${id} → ${read.join(', ') || 'nothing'}`]
	})
	expect(misread).toEqual([])
})
