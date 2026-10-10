/**
 * The writing line reads **lifts** (owner decision 3, round 2; ADR 0089):
 * `Knebøy 5×5 @ 80 kg · Benkpress 5×5 @ 60 kg · Roing 3×8`. The table below is
 * the contract — what each sentence becomes, or why it becomes nothing — and the
 * structure is the one the strength editor writes today (ADR 0027 as amended).
 */
import { describe, expect, test } from 'vitest'
import { buildBlocksInput, FormSchema } from './workout-authoring.ts'
import { WorkoutStructureSchema } from './workout-schema.ts'
import {
	parseWorkoutSentence,
	replaceWord,
	type SentenceExercise,
	sentenceNotationInput,
} from './workout-sentence.ts'

/** A slice of the exercise database, ids as the seed would make them. */
const EXERCISES: SentenceExercise[] = [
	{ id: 'squat', name: 'Back Squat' },
	{ id: 'front-squat', name: 'Front Squat' },
	{ id: 'bench', name: 'Bench Press' },
	{ id: 'incline', name: 'Incline Bench Press' },
	{ id: 'bench-medium', name: 'Barbell Bench Press - Medium Grip' },
	{ id: 'row', name: 'Barbell Row' },
	{ id: 'deadlift', name: 'Deadlift' },
	{ id: 'rdl', name: 'Romanian Deadlift' },
	{ id: 'ohp', name: 'Overhead Press' },
	{ id: 'pullup', name: 'Pull-up' },
	{ id: 'chinup', name: 'Chin-up' },
	{ id: 'pushup', name: 'Push-up' },
	{ id: 'dip', name: 'Dip' },
	{ id: 'plank', name: 'Plank' },
	{ id: 'leg-press', name: 'Leg Press' },
	{ id: 'pulldown', name: 'Lat Pulldown' },
	// An alias the exercise database carries (decision 9), not the reader's own.
	{ id: 'hip-thrust', name: 'Hip Thrust', aliases: ['seteløft'] },
]

const read = (
	text: string,
	discipline: Parameters<typeof parseWorkoutSentence>[1]['discipline'] = null,
) => parseWorkoutSentence(text, { discipline, exercises: EXERCISES })

const reps = (count: number, n: number, load?: object) =>
	Array.from({ length: count }, (_, orderIndex) => ({
		kind: 'reps',
		orderIndex,
		reps: n,
		...(load ? { load } : {}),
	}))

const kg = (value: number) => ({ kind: 'absolute', kg: value })

type Row = {
	text: string
	/** exerciseId → its sets, step by step. */
	steps: Array<{
		exerciseId: string
		sets: object[]
		restBetweenSetsSec?: number
	}>
}

const READS: Row[] = [
	{
		text: 'Knebøy 5×5 @ 80 kg',
		steps: [{ exerciseId: 'squat', sets: reps(5, 5, kg(80)) }],
	},
	{
		text: 'Knebøy 5x5 80kg',
		steps: [{ exerciseId: 'squat', sets: reps(5, 5, kg(80)) }],
	},
	{
		text: 'knebøy 5 x 5 @80kg',
		steps: [{ exerciseId: 'squat', sets: reps(5, 5, kg(80)) }],
	},
	{
		text: 'Benkpress 5×5 @ 60 kg · Roing 3×8',
		steps: [
			{ exerciseId: 'bench', sets: reps(5, 5, kg(60)) },
			{ exerciseId: 'row', sets: reps(3, 8) },
		],
	},
	{
		text: 'Knebøy 5×5 @ 80 kg, Benk 5×5 @ 60 kg + Markløft 1×5 @ 120 kg',
		steps: [
			{ exerciseId: 'squat', sets: reps(5, 5, kg(80)) },
			{ exerciseId: 'bench', sets: reps(5, 5, kg(60)) },
			{ exerciseId: 'deadlift', sets: reps(1, 5, kg(120)) },
		],
	},
	{
		text: 'Knebøy 5×5 @ 82,5 kg',
		steps: [{ exerciseId: 'squat', sets: reps(5, 5, kg(82.5)) }],
	},
	{
		text: 'Knebøy 5×5 @ 82.5 kg',
		steps: [{ exerciseId: 'squat', sets: reps(5, 5, kg(82.5)) }],
	},
	{
		// The owner's display form for per-set reps (round 2): kilos, then the reps.
		text: 'Knebøy 82,5 kg × 5 · 5 · 5 · 4',
		steps: [
			{
				exerciseId: 'squat',
				sets: [5, 5, 5, 4].map((n, orderIndex) => ({
					kind: 'reps',
					orderIndex,
					reps: n,
					load: kg(82.5),
				})),
			},
		],
	},
	{
		text: 'Knebøy 82,5 kg × 5 · 5 · 4 · Roing 3×8',
		steps: [
			{
				exerciseId: 'squat',
				sets: [5, 5, 4].map((n, orderIndex) => ({
					kind: 'reps',
					orderIndex,
					reps: n,
					load: kg(82.5),
				})),
			},
			{ exerciseId: 'row', sets: reps(3, 8) },
		],
	},
	{
		text: 'Knebøy 5/5/5/4 @ 80 kg',
		steps: [
			{
				exerciseId: 'squat',
				sets: [5, 5, 5, 4].map((n, orderIndex) => ({
					kind: 'reps',
					orderIndex,
					reps: n,
					load: kg(80),
				})),
			},
		],
	},
	{
		// The notation's own mixed form, read back.
		text: 'Knebøy 5 @ 80 kg / 3 @ 90 kg',
		steps: [
			{
				exerciseId: 'squat',
				sets: [
					{ kind: 'reps', orderIndex: 0, reps: 5, load: kg(80) },
					{ kind: 'reps', orderIndex: 1, reps: 3, load: kg(90) },
				],
			},
		],
	},
	{
		// A part with no name carries on the lift before it.
		text: 'Knebøy 3×5 @ 80 kg + 2×3 @ 90 kg',
		steps: [
			{
				exerciseId: 'squat',
				sets: [
					...reps(3, 5, kg(80)),
					...reps(2, 3, kg(90)).map((set, i) => ({
						...set,
						orderIndex: 3 + i,
					})),
				],
			},
		],
	},
	{
		text: 'Knebøy 3 sett à 8 @ 60 kg',
		steps: [{ exerciseId: 'squat', sets: reps(3, 8, kg(60)) }],
	},
	{
		text: 'Knebøy 3 sett med 8 reps 60 kg',
		steps: [{ exerciseId: 'squat', sets: reps(3, 8, kg(60)) }],
	},
	{
		text: 'Knebøy 5×5 @ 80 kg p 3 min',
		steps: [
			{
				exerciseId: 'squat',
				sets: reps(5, 5, kg(80)),
				restBetweenSetsSec: 180,
			},
		],
	},
	{
		text: 'Knebøy 5×5 @ 80 kg 2 min pause',
		steps: [
			{
				exerciseId: 'squat',
				sets: reps(5, 5, kg(80)),
				restBetweenSetsSec: 120,
			},
		],
	},
	{
		// A rest on its own after a lift is that lift's rest between sets.
		text: 'Knebøy 5×5 @ 80 kg, p 3 min',
		steps: [
			{
				exerciseId: 'squat',
				sets: reps(5, 5, kg(80)),
				restBetweenSetsSec: 180,
			},
		],
	},
	{
		text: 'Knebøy 5×5 @ 80 %',
		steps: [
			{
				exerciseId: 'squat',
				sets: reps(5, 5, { kind: 'pct1RM', minPct: 80 }),
			},
		],
	},
	// Bodyweight lifts: no load is a load nobody stated, and `kroppsvekt` is one.
	{ text: 'Pull-ups 3×8', steps: [{ exerciseId: 'pullup', sets: reps(3, 8) }] },
	{ text: 'pullups 3x8', steps: [{ exerciseId: 'pullup', sets: reps(3, 8) }] },
	{
		text: 'Armhevinger 3×15 @ kroppsvekt',
		steps: [
			{ exerciseId: 'pushup', sets: reps(3, 15, { kind: 'bodyweight' }) },
		],
	},
	{
		text: 'Planke 3×45 s',
		steps: [
			{
				exerciseId: 'plank',
				sets: Array.from({ length: 3 }, (_, orderIndex) => ({
					kind: 'timed',
					orderIndex,
					durationSec: 45,
				})),
			},
		],
	},
	// The database's own names, any case, and its aliases.
	{
		text: 'Back Squat 5×5 @ 100 kg',
		steps: [{ exerciseId: 'squat', sets: reps(5, 5, kg(100)) }],
	},
	{
		text: 'bench press 3x8',
		steps: [{ exerciseId: 'bench', sets: reps(3, 8) }],
	},
	{
		text: 'Barbell Bench Press - Medium Grip 3×5 @ 60 kg',
		steps: [{ exerciseId: 'bench-medium', sets: reps(3, 5, kg(60)) }],
	},
	{
		text: 'Seteløft 3×10 @ 100 kg',
		steps: [{ exerciseId: 'hip-thrust', sets: reps(3, 10, kg(100)) }],
	},
	{
		text: 'Rumensk markløft 3×8 @ 70 kg',
		steps: [{ exerciseId: 'rdl', sets: reps(3, 8, kg(70)) }],
	},
]

describe('the reader reads lifts', () => {
	test.each(READS)('$text', ({ text, steps }) => {
		const parsed = read(text)
		expect(parsed.unknown).toEqual([])
		expect(parsed.problems).toEqual([])
		expect(parsed.discipline).toBe('strength')
		expect(parsed.structure).toEqual({
			discipline: 'strength',
			blocks: [
				{
					repeatCount: 1,
					steps: steps.map((step) => ({ kind: 'strength', ...step })),
				},
			],
		})
		// The shared schema has the last word, as for every sentence.
		expect(WorkoutStructureSchema.safeParse(parsed.structure).success).toBe(
			true,
		)
		// A lift states no km and no time.
		expect(parsed.totals).toEqual({ distanceM: null, durationSec: null })
	})

	test('whatever the chip, a sentence that names a lift is a lift session', () => {
		for (const chip of [null, 'run', 'bike', 'swim', 'strength'] as const) {
			expect(read('Knebøy 5×5 @ 80 kg', chip).structure?.discipline).toBe(
				'strength',
			)
		}
		expect(read('Knebøy 5×5 @ 80 kg', 'run').disciplineFromText).toBe(true)
	})

	test('the lifts it settled on are reported, by the name the database gives them', () => {
		expect(read('Knebøy 5×5 @ 80 kg · Seteløft 3×10').lifts).toEqual([
			{ exerciseId: 'squat', name: 'Back Squat', typed: 'Knebøy' },
			{ exerciseId: 'hip-thrust', name: 'Hip Thrust', typed: 'Seteløft' },
		])
	})

	test('the intent is read from the reps, the way the zone word reads it for a run', () => {
		expect(read('Knebøy 5×3 @ 100 kg').intent).toBe('strength-max')
		expect(read('Knebøy 3×8 @ 60 kg').intent).toBe('strength-hypertrophy')
		expect(read('Knebøy 2×20 @ 40 kg').intent).toBe('strength-endurance')
		expect(read('Planke 3×45 s').intent).toBe('strength-endurance')
		// The heaviest lift names the session: 5s beside 10s is a strength day.
		expect(read('Knebøy 5×5 @ 80 kg · Roing 3×10').intent).toBe('strength-max')
	})

	test('the structure is the one the strength editor writes for the same lifts', () => {
		const editor = buildBlocksInput(
			FormSchema.parse({
				title: 'Styrke',
				discipline: 'strength',
				intent: 'strength-max',
				scheduledAtDate: '2026-10-12',
				scheduledAtTime: '08:00',
				structure: 'structured',
				blocks: [
					{
						repeatCount: '1',
						steps: [
							{
								kind: 'strength',
								exerciseId: 'squat',
								sets: Array.from({ length: 5 }, (_, i) => ({
									kind: 'reps',
									orderIndex: String(i),
									reps: '5',
									load: JSON.stringify({ kind: 'absolute', kg: 82.5 }),
									weightKg: '82.5',
								})),
							},
							{
								kind: 'strength',
								exerciseId: 'row',
								sets: Array.from({ length: 3 }, (_, i) => ({
									kind: 'reps',
									orderIndex: String(i),
									reps: '8',
								})),
							},
						],
					},
				],
			}),
		)
		expect(read('Knebøy 5×5 @ 82,5 kg · Roing 3×8').structure?.blocks).toEqual(
			editor,
		)
	})

	test('the echo is the Token Sentence of the lifts, by their database names', () => {
		const parsed = read('Knebøy 5×5 @ 80 kg · Roing 3×8')
		const input = sentenceNotationInput(parsed.structure!, {
			exerciseNames: parsed.exerciseNames,
		})
		expect(input.blocks[0]?.steps).toMatchObject([
			{ kind: 'strength', exerciseName: 'Back Squat', exerciseId: 'squat' },
			{ kind: 'strength', exerciseName: 'Barbell Row', exerciseId: 'row' },
		])
		expect(input.blocks[0]?.steps[0]?.sets).toHaveLength(5)
	})
})

describe('a lift the reader is unsure of saves nothing, and says why', () => {
	test('an unknown lift is a suggestion with the nearest names, never a silent drop', () => {
		const parsed = read('Knebøj 5×5 @ 80 kg')
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			{
				start: 0,
				end: 6,
				text: 'Knebøj',
				reason: 'unknown-exercise',
				suggestions: expect.arrayContaining(['Knebøy']),
			},
		])
		const [word] = parsed.unknown
		expect(
			read(replaceWord('Knebøj 5×5 @ 80 kg', word!, 'Knebøy')).structure,
		).not.toBeNull()
	})

	test('a part of a name suggests the lifts it begins', () => {
		const [word] = read('Bench 3×5').unknown
		expect(word?.reason).toBe('unknown-exercise')
		expect(word?.suggestions[0]).toBe('Bench Press')
		expect(word?.suggestions.length).toBeLessThanOrEqual(3)
	})

	test('one unknown lift among known ones holds the whole sentence back', () => {
		const parsed = read('Knebøy 5×5 @ 80 kg · Zercher 3×5 · Roing 3×8')
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			expect.objectContaining({
				text: 'Zercher',
				reason: 'unknown-exercise',
				start: 21,
				end: 28,
			}),
		])
	})

	test('a name that is nothing like any lift is still reported, with no suggestion', () => {
		const parsed = read('Qwxz 3×5')
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			expect.objectContaining({
				text: 'Qwxz',
				reason: 'unknown-exercise',
				suggestions: [],
			}),
		])
	})

	test('a very long name is reported whole and costs no search', () => {
		const name =
			'Supercalifragilistisk ekspialidosiøs knebøy med kjetting og bånd'
		const parsed = read(`${name} 3×5 @ 60 kg`)
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			expect.objectContaining({ text: name, reason: 'unknown-exercise' }),
		])
	})

	test('ten lifts in one line are ten steps', () => {
		const text = [
			'Knebøy 5×5',
			'Benk 5×5',
			'Roing 5×5',
			'Markløft 1×5',
			'Dips 3×8',
			'Pullups 3×8',
			'Planke 3×45 s',
			'Beinpress 3×10',
			'Nedtrekk 3×10',
			'Chins 3×6',
		].join(' · ')
		expect(text.length).toBeLessThanOrEqual(200)
		const parsed = read(text)
		expect(parsed.unknown).toEqual([])
		expect(parsed.problems).toEqual([])
		expect(parsed.structure?.blocks[0]?.steps).toHaveLength(10)
	})

	test.each([
		['Knebøy 5×5 @', 'dangling-load'],
		['Knebøy 5×5 @ kg', 'dangling-load'],
		['Knebøy 5×5 kg', 'no-sets'],
		['Knebøy', 'no-sets'],
		['Knebøy @ 80 kg', 'no-sets'],
		['5×5 @ 80 kg', 'no-exercise'],
		['Knebøy 5×5 @ 80 kg @ 90 kg', 'two-loads'],
		['Knebøy 50×5 @ 80 kg', 'out-of-range'],
		['Knebøy 0×5 @ 80 kg', 'out-of-range'],
		['Knebøy 5×500', 'out-of-range'],
		['Knebøy 5×5 @ 900 kg', 'out-of-range'],
		['Knebøy 5×5 @ 0 kg', 'out-of-range'],
		['Knebøy 5×5 p', 'dangling-rest'],
		['10 min rolig + Knebøy 5×5 @ 80 kg', 'two-disciplines'],
	] as const)('%s → %s', (text, problem) => {
		const parsed = read(text, 'run')
		expect(parsed.structure).toBeNull()
		expect(parsed.problems).toContain(problem)
	})

	test('a word in the sets that is not lift vocabulary is unread, not skipped', () => {
		const parsed = read('Knebøy 5×5 tungt @ 80 kg')
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			expect.objectContaining({ text: 'tungt', reason: 'unknown-word' }),
		])
	})

	test('a stray character among the sets is unread', () => {
		const parsed = read('Knebøy 5×5 @ 80 kg !')
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([
			expect.objectContaining({ text: '!', reason: 'stray' }),
		])
	})

	test('before the exercise database has arrived, a lift waits rather than reading as unknown', () => {
		const parsed = parseWorkoutSentence('Knebøy 5×5 @ 80 kg', {
			discipline: null,
		})
		expect(parsed.structure).toBeNull()
		expect(parsed.unknown).toEqual([])
		expect(parsed.exercisesNeeded).toBe(true)
		expect(read('Knebøy 5×5 @ 80 kg').exercisesNeeded).toBe(false)
	})
})

describe('the running sentence is read as it was', () => {
	test.each([
		['10 km rolig', 'run'],
		['3x10 min terskel p 1 min', 'run'],
		['sykkel 2 t rolig', null],
		['4 × 6 min I4, 1 min pause', 'run'],
	] as const)('%s', (text, chip) => {
		const parsed = read(text, chip)
		expect(parsed.structure).not.toBeNull()
		expect(parsed.lifts).toEqual([])
		expect(parsed.exercisesNeeded).toBe(false)
	})

	test('a misspelt zone word is still a zone word, not a lift', () => {
		const parsed = read('10 km roilg', 'run')
		expect(parsed.unknown).toEqual([
			expect.objectContaining({
				text: 'roilg',
				reason: 'unknown-word',
				suggestions: ['rolig'],
			}),
		])
	})

	test('the Styrke chip does not make a run a lift, and a run cannot borrow it', () => {
		const parsed = read('10 km rolig', 'strength')
		expect(parsed.structure).toBeNull()
		expect(parsed.problems).toContain('no-discipline')
	})

	test('`5x5` alone on a run chip is still a number with no unit', () => {
		const parsed = read('5x5', 'run')
		expect(parsed.unknown).toEqual([
			expect.objectContaining({ text: '5', reason: 'no-unit' }),
		])
	})
})
