import { describe, expect, test } from 'vitest'
import { parseWorkoutSentence } from '#app/utils/workout-sentence.ts'
import { structureSentence } from './composer-sentence.ts'

const read = (text: string) =>
	parseWorkoutSentence(text, { discipline: 'run' }).structure!

describe('a saved session said back as a line the reader takes', () => {
	test.each([
		'45 min rolig',
		'6x1000 m terskel p 90 s',
		'10 km rolig',
		'4x8 min terskel p 2 min',
		'15 min rolig + 5x3 min hardt p 1 min + 10 min rolig',
		'10 km 4:30/km',
		'10 km 4:50-5:10/km',
		'400 m',
	])('%s reads back to the structure it was made from', (text) => {
		const structure = read(text)
		const sentence = structureSentence(structure)
		expect(sentence).not.toBeNull()
		expect(read(sentence!)).toEqual(structure)
	})

	test('a zone is said in the reader’s own word', () => {
		expect(structureSentence(read('6x1000 m Z4 p 90 s'))).toBe(
			'6x1000 m terskel p 90 s',
		)
	})

	test('what the line cannot say is refused, never approximated', () => {
		expect(
			structureSentence({
				discipline: 'strength',
				blocks: [
					{
						repeatCount: 1,
						steps: [{ kind: 'strength', exerciseId: 'squat', sets: [] }],
					},
				],
			} as never),
		).toBeNull()
		// Two work steps inside one repeat: the line has no way to say that.
		expect(
			structureSentence({
				discipline: 'run',
				blocks: [
					{
						repeatCount: 3,
						steps: [
							{ kind: 'cardio', discipline: 'run', durationSec: 60 },
							{ kind: 'cardio', discipline: 'run', durationSec: 120 },
						],
					},
				],
			}),
		).toBeNull()
		// A power target is not in the line's vocabulary.
		expect(
			structureSentence({
				discipline: 'bike',
				blocks: [
					{
						repeatCount: 1,
						steps: [
							{
								kind: 'cardio',
								discipline: 'bike',
								durationSec: 3600,
								intensity: { kind: 'powerPct', min: 70, max: 75 },
							},
						],
					},
				],
			} as never),
		).toBeNull()
		expect(structureSentence({ discipline: 'run', blocks: [] })).toBeNull()
	})
})
