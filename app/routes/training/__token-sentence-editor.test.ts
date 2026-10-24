/**
 * The token buttons' accessible names (§9.4): a token is named by what it
 * shows, so a screen reader hears the same numbers a sighted athlete reads.
 */
import { expect, test } from 'vitest'
import { deriveWorkoutNotation } from '#app/utils/workout-notation.ts'
import { tokenAccessibleName } from './__token-sentence-editor.tsx'

test('a repeat in series is named by its series and its reps, not the reps alone', () => {
	const notation = deriveWorkoutNotation({
		blocks: [
			{
				repeatCount: 13,
				seriesRepeatCount: 3,
				steps: [
					{ kind: 'cardio', durationSec: 30 },
					{ kind: 'rest', durationSec: 15 },
				],
			},
		],
	})
	const repeat = notation.blocks[0]!.repeat!
	expect(tokenAccessibleName(repeat, 'repeat', notation)).toBe(
		'3 serier, gjentas 13 ganger, blokk 1 av 1',
	)
})

test('a repeat in series only is named by its series, as it reads', () => {
	const notation = deriveWorkoutNotation({
		blocks: [
			{
				repeatCount: 1,
				seriesRepeatCount: 3,
				steps: [{ kind: 'cardio', durationSec: 600 }],
			},
		],
	})
	const repeat = notation.blocks[0]!.repeat!
	expect(tokenAccessibleName(repeat, 'repeat', notation)).toBe(
		'gjentas 3 ganger, blokk 1 av 1',
	)
})
