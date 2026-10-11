/**
 * **Bibliotek's exercise search** (spec #505 story 58, owner decision 9): a
 * query is matched against every name a lift answers to — its own, its English
 * aliases (`OHP`) and its Norwegian ones (`knebøy`) — so an athlete finds the
 * Back Squat by the word they actually use.
 *
 * Pure, and in JS rather than SQL: SQLite's `LIKE` folds ASCII case only, so
 * `KNEBØY` would miss, and the list is a few hundred rows.
 *
 * Ranked in three tiers, each keeping the caller's order (name order): a name
 * the query **is** exactly, then one a word of which **starts** with it, then
 * one that merely **contains** it. So `knebøy` lists the Back Squat before
 * `frontknebøy`'s Front Squat.
 */

export type SearchableExercise = {
	id: string
	name: string
	aliases: ReadonlyArray<{ text: string; locale: string }>
}

export type ExerciseHit<T extends SearchableExercise> = {
	exercise: T
	/**
	 * The other name the row shows beside its own: the alias the query matched
	 * where the lift's own name did not (`OHP`), else its Norwegian name where it
	 * has one (`knebøy`), else null.
	 */
	alias: string | null
}

/** Lower case, the way a Norwegian reads it. */
function lower(text: string): string {
	return text.normalize('NFC').toLocaleLowerCase('nb').trim()
}

/** Lower case with spaces and punctuation gone: `Pull-up` → `pullup`. */
function compact(text: string): string {
	return lower(text).replace(/[^\p{L}\p{N}]+/gu, '')
}

/** 0 exact, 1 a word starts with it, 2 contains it, null no match. */
function tierOf(text: string, query: string): 0 | 1 | 2 | null {
	const name = lower(text)
	const squeezed = compact(text)
	const q = lower(query)
	const qs = compact(query)
	if (qs === '') return null
	if (name === q || squeezed === qs) return 0
	if (
		squeezed.startsWith(qs) ||
		name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(q))
	) {
		return 1
	}
	if (name.includes(q) || squeezed.includes(qs)) return 2
	return null
}

function norwegianName(exercise: SearchableExercise): string | null {
	return exercise.aliases.find((alias) => alias.locale === 'nb')?.text ?? null
}

export function searchExercises<T extends SearchableExercise>(
	exercises: readonly T[],
	query: string,
): ExerciseHit<T>[] {
	if (compact(query) === '') {
		return exercises.map((exercise) => ({
			exercise,
			alias: norwegianName(exercise),
		}))
	}
	const tiers: ExerciseHit<T>[][] = [[], [], []]
	for (const exercise of exercises) {
		const nameTier = tierOf(exercise.name, query)
		let best = nameTier
		let matchedAlias: string | null = null
		for (const alias of exercise.aliases) {
			const tier = tierOf(alias.text, query)
			if (tier != null && (best == null || tier < best)) {
				best = tier
				matchedAlias = alias.text
			}
		}
		if (best == null) continue
		tiers[best]!.push({
			exercise,
			// The row's own name already explains a hit on it; only a hit on another
			// name needs that name beside it.
			alias:
				nameTier == null
					? (matchedAlias ?? norwegianName(exercise))
					: norwegianName(exercise),
		})
	}
	return tiers.flat()
}
