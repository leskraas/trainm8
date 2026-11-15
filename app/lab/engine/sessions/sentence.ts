/**
 * How `add_session` reads the athlete's own words: the shared sentence reader,
 * plus two kindnesses it does not do on its own.
 *
 * - **Sets before the lift.** `3x10 knebøy 60 kg` is as common as
 *   `knebøy 3x10 60 kg`; the reader wants the name first, so a part written
 *   sets-first is tried again with its name moved to the front. The athlete's
 *   words stay the session's name, exactly as typed.
 * - **A sport the words do not say.** `45 min rolig` names no sport. With no
 *   hint, it is the athlete's main sport (the first endurance sport they train),
 *   or running when they have not said — and the answer says it was a guess.
 *
 * Pure: no database, so it is tested on its own.
 */
import {
	type CardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import {
	parseWorkoutSentence,
	type SentenceExercise,
} from '#app/utils/workout-sentence.ts'

const SPORT_WORD: Record<CardioDiscipline, string> = {
	run: 'løping',
	bike: 'sykling',
	swim: 'svømming',
}

/** `3x10 knebøy`, `3 × 10 knebøy @ 60 kg`, `3x10 knebøy 60kg`: sets, name, load. */
const SETS_FIRST =
	/^(\d+\s*[x×*]\s*\d+)\s+(\p{L}[\p{L}\-\s]*?)(\s*(?:@\s*)?\d+(?:[.,]\d+)?\s*(?:kg|%)|\s+kroppsvekt)?$/iu

/** Separators between parts: `+`, `·`, and a comma followed by a space (`82,5 kg` is a number). */
const PART_SEPARATOR = /(\s*[+·]\s*|,\s+)/u

/** The sentence with every sets-first lift written name-first; null when none was. */
export function nameFirst(sentence: string): string | null {
	let changed = false
	const pieces = sentence
		.trim()
		.split(PART_SEPARATOR)
		.map((piece, i) => {
			if (i % 2 === 1) return piece
			const match = SETS_FIRST.exec(piece.trim())
			if (!match) return piece
			changed = true
			const [, sets, name, load] = match
			return `${name!.trim()} ${sets}${load ?? ''}`
		})
	return changed ? pieces.join('') : null
}

export type ReadSentence = {
	/** The words to hand the writer: the athlete's, or reordered. */
	sentence: string
	/** The sport hint to hand the writer with them. */
	discipline: Discipline | null
	/** Set when the sport was not in the words or the hint: what was assumed. */
	sportGuessedBecause: string | null
}

/**
 * The first reading of the athlete's words that the reader is sure of, or null
 * when there is none. `mainSport` is the athlete's main endurance sport, when
 * known.
 */
export function readAddSentence({
	sentence,
	sport,
	mainSport,
	exercises,
}: {
	sentence: string
	sport: Discipline | null
	mainSport: CardioDiscipline | null
	exercises: readonly SentenceExercise[]
}): ReadSentence | null {
	const texts = [sentence, nameFirst(sentence)].filter(
		(text): text is string => text != null,
	)
	const sure = (text: string, discipline: Discipline | null) =>
		parseWorkoutSentence(text, { discipline, exercises }).structure != null

	for (const text of texts) {
		if (sure(text, sport)) {
			return { sentence: text, discipline: sport, sportGuessedBecause: null }
		}
	}
	// No sport in the words, and no endurance hint: the main sport, or running.
	if (sport == null || sport === 'strength') {
		const guess = mainSport ?? 'run'
		for (const text of texts) {
			if (sure(text, guess)) {
				return {
					sentence: text,
					discipline: guess,
					sportGuessedBecause: mainSport
						? `Ordene sa ikke hvilken idrett, så økta ble ${SPORT_WORD[guess]}, hovedidretten din.`
						: `Ordene sa ikke hvilken idrett, så økta ble ${SPORT_WORD[guess]}.`,
				}
			}
		}
	}
	return null
}
