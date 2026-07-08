import { describe, expect, test } from 'vitest'
import { type DisciplineThresholdMap } from './intensity-target.ts'
import { deriveSessionProfile } from './session-profile.ts'
import {
	deriveWorkoutNotation,
	draftToNotationInput,
	formatSetsSummary,
	notationInputToWorkout,
	notationSentence,
	NOTATION_SEPARATORS,
	stepSentence,
	tokenText,
	workoutToNotationInput,
	type NotationInput,
	type NotationToken,
	type WorkoutNotation,
} from './workout-notation.ts'
import { type IntensityTarget } from './workout-schema.ts'

// ——— Fixtures ————————————————————————————————————————————————————————————

// A persisted-row step as the `training.server` step select returns it.
type PersistedStep = Parameters<
	typeof workoutToNotationInput
>[0] extends infer W
	? W extends { blocks: Array<{ steps: Array<infer S> }> }
		? S
		: never
	: never

function persistedStep(
	overrides: Partial<PersistedStep> & { orderIndex: number },
): PersistedStep {
	return {
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity: null,
		durationSec: null,
		distanceM: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

function persistedWorkout(
	blocks: Array<{
		name?: string | null
		orderIndex: number
		repeatCount?: number
		steps: PersistedStep[]
	}>,
) {
	return {
		blocks: blocks.map((block) => ({
			name: block.name ?? null,
			orderIndex: block.orderIndex,
			repeatCount: block.repeatCount ?? 1,
			steps: block.steps,
		})),
	}
}

function json(target: IntensityTarget): string {
	return JSON.stringify(target)
}

// A fully-populated bike profile so zone labels and %FTP resolve; tests null
// out thresholds to exercise honest degradation.
const bikeThresholds: DisciplineThresholdMap = {
	bike: {
		lthr: null,
		maxHr: null,
		ftp: 250,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'coggan-power-7',
		zoneOverrides: null,
	},
}

function sentenceFor(
	workout: Parameters<typeof workoutToNotationInput>[0],
	thresholds?: DisciplineThresholdMap,
): string {
	return notationSentence(
		deriveWorkoutNotation(workoutToNotationInput(workout), { thresholds }),
	)
}

function intensityTokenAt(
	notation: WorkoutNotation,
	blockIndex: number,
	stepIndex: number,
): Extract<NotationToken, { type: 'intensity' }> {
	const positioned = notation.blocks[blockIndex]!.steps[stepIndex]!.tokens.find(
		(t) => t.token.type === 'intensity',
	)
	if (!positioned || positioned.token.type !== 'intensity') {
		throw new Error('expected an intensity token')
	}
	return positioned.token
}

// ——— The house sentence (structure → tokens → text) ——————————————————————

describe('notationSentence — persisted structure', () => {
	test('renders the canonical interval sentence: quantities, pace, inline rest, block labels', () => {
		// Blocks and steps arrive out of order; the adapter sorts by orderIndex.
		const workout = persistedWorkout([
			{
				orderIndex: 2,
				name: 'cool-down',
				steps: [persistedStep({ orderIndex: 0 })],
			},
			{
				orderIndex: 0,
				name: 'warm-up',
				steps: [persistedStep({ orderIndex: 0, distanceM: 2000 })],
			},
			{
				orderIndex: 1,
				repeatCount: 4,
				steps: [
					persistedStep({ orderIndex: 1, kind: 'rest', durationSec: 60 }),
					persistedStep({
						orderIndex: 0,
						durationSec: 360,
						intensity: json({ kind: 'pace', minSecPerKm: 280 }),
					}),
				],
			},
		])

		expect(sentenceFor(workout)).toBe(
			'2 km warm-up → 4 × 6 min @ 4:40 /km (1 min rest) → cool-down',
		)
	})

	test('a zone-label target reads as prose (no @), capitalized', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 2700,
						intensity: json({ kind: 'zoneLabel', label: 'easy' }),
					}),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('45 min Easy')
	})

	test('a repeated block with two inline steps gets group parens', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				repeatCount: 3,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 180,
						intensity: json({ kind: 'zoneLabel', label: 'threshold' }),
					}),
					persistedStep({
						orderIndex: 1,
						durationSec: 60,
						intensity: json({ kind: 'zoneLabel', label: 'easy' }),
					}),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('3 × (3 min Threshold → 1 min Easy)')
	})

	test('a repeated block whose only extra step is an inline rest needs no group parens', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				repeatCount: 4,
				steps: [
					persistedStep({ orderIndex: 0, durationSec: 360 }),
					persistedStep({ orderIndex: 1, kind: 'rest', durationSec: 60 }),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('4 × 6 min (1 min rest)')
	})

	test('an unquantified rest step still reads as rest', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({ orderIndex: 0, durationSec: 600 }),
					persistedStep({ orderIndex: 1, kind: 'rest' }),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('10 min (rest)')
	})

	test('step notes render as a marker attached to the step, carrying the note text', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				name: 'warm-up',
				steps: [
					persistedStep({
						orderIndex: 0,
						distanceM: 2000,
						notes: 'strides after',
					}),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('2 km* warm-up')

		const notation = deriveWorkoutNotation(workoutToNotationInput(workout))
		const marker = notation.blocks[0]!.steps[0]!.tokens.find(
			(t) => t.token.type === 'notes',
		)!.token
		expect(marker).toMatchObject({
			type: 'notes',
			text: '*',
			note: 'strides after',
		})
	})

	test('an empty or missing workout yields an empty sentence, never a throw', () => {
		expect(sentenceFor(null)).toBe('')
		expect(sentenceFor(persistedWorkout([]))).toBe('')
		expect(sentenceFor(persistedWorkout([{ orderIndex: 0, steps: [] }]))).toBe(
			'',
		)
	})
})

// ——— Intensity facets: honest derivation ——————————————————————————————————

describe('intensity facets', () => {
	test('a zone label with a resolving threshold carries the concrete range facet', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						discipline: 'bike',
						durationSec: 1200,
						intensity: json({ kind: 'zoneLabel', label: 'Z4' }),
					}),
				],
			},
		])

		// Coggan Z4 at FTP 250 → 228–263 W.
		expect(sentenceFor(workout, bikeThresholds)).toBe('20 min Z4 (228–263 W)')

		const notation = deriveWorkoutNotation(workoutToNotationInput(workout), {
			thresholds: bikeThresholds,
		})
		expect(intensityTokenAt(notation, 0, 0).facets).toEqual({
			zone: 4,
			range: '228–263 W',
			equivalent: null,
		})
	})

	test('an unresolvable zone label reduces to the bare zone label — no invented range', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 1200,
						intensity: json({ kind: 'zoneLabel', label: 'threshold' }),
					}),
				],
			},
		])

		// No thresholds at all: the token is just the capitalized label.
		expect(sentenceFor(workout)).toBe('20 min Threshold')
		const notation = deriveWorkoutNotation(workoutToNotationInput(workout))
		expect(intensityTokenAt(notation, 0, 0).facets).toEqual({
			zone: 4, // the normalized chip is still truthful (label-derived)
			range: null,
			equivalent: null,
		})
	})

	test('a %FTP target resolves to zone chip and watts when FTP is configured', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						discipline: 'bike',
						durationSec: 1200,
						intensity: json({ kind: 'powerPct', minPct: 95, maxPct: 105 }),
					}),
				],
			},
		])

		expect(sentenceFor(workout, bikeThresholds)).toBe(
			'20 min @ 95–105% FTP · Z4 (238–263 W)',
		)
	})

	test('a %FTP target without FTP keeps the honest authored form; the range facet is omitted', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						discipline: 'bike',
						durationSec: 1200,
						intensity: json({ kind: 'powerPct', minPct: 95, maxPct: 105 }),
					}),
				],
			},
		])

		// The zone chip survives (%-of-threshold is zone-mappable without the
		// athlete's number); the watts range does not.
		expect(sentenceFor(workout)).toBe('20 min @ 95–105% FTP · Z4')
		const notation = deriveWorkoutNotation(workoutToNotationInput(workout))
		expect(intensityTokenAt(notation, 0, 0).facets.range).toBeNull()
	})

	test('absolute pace / HR targets are already concrete: no chip, no range facet', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 360,
						intensity: json({ kind: 'pace', minSecPerKm: 280 }),
					}),
					persistedStep({
						orderIndex: 1,
						durationSec: 600,
						intensity: json({ kind: 'hrBpm', min: 150, max: 160 }),
					}),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('6 min @ 4:40 /km → 10 min @ 150–160 bpm')
		const notation = deriveWorkoutNotation(workoutToNotationInput(workout))
		expect(intensityTokenAt(notation, 0, 0).facets.zone).toBeNull()
		expect(intensityTokenAt(notation, 0, 1).facets.zone).toBeNull()
	})

	test('an RPE target shows the subjective scale with its zone chip', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 1800,
						intensity: json({ kind: 'rpe', min: 6 }),
					}),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('30 min @ RPE 6 · Z3')
	})

	test('regression: a legacy plain-string zone label still renders', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 1800,
						intensity: 'endurance', // pre-union stored string
					}),
				],
			},
		])

		expect(sentenceFor(workout)).toBe('30 min Endurance')
		const notation = deriveWorkoutNotation(workoutToNotationInput(workout))
		expect(intensityTokenAt(notation, 0, 0).facets.zone).toBe(2)
	})

	test('the race-pace equivalent facet slot is reserved and never populated (ADR 0027 A2)', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						discipline: 'bike',
						durationSec: 1200,
						intensity: json({ kind: 'zoneLabel', label: 'Z4' }),
					}),
				],
			},
		])
		const notation = deriveWorkoutNotation(workoutToNotationInput(workout), {
			thresholds: bikeThresholds,
		})
		const facets = intensityTokenAt(notation, 0, 0).facets
		expect('equivalent' in facets).toBe(true)
		expect(facets.equivalent).toBeNull()
	})
})

// ——— Strength steps ————————————————————————————————————————————————————————

describe('strength steps', () => {
	function strengthWorkout(
		sets: NonNullable<PersistedStep['sets']>,
		overrides: Partial<PersistedStep> = {},
	) {
		return persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						kind: 'strength',
						discipline: null,
						exercise: { name: 'Squat' },
						sets,
						...overrides,
					}),
				],
			},
		])
	}

	const repsSet = (orderIndex: number, reps: number, weightKg?: number) => ({
		kind: 'reps',
		orderIndex,
		reps,
		weightKg: weightKg ?? null,
		pct1RM: null,
		durationSec: null,
	})

	test('uniform sets collapse to compact set notation with the rest facet', () => {
		const workout = strengthWorkout(
			[0, 1, 2, 3, 4].map((i) => repsSet(i, 5, 80)),
			{ restBetweenSetsSec: 120 },
		)
		expect(sentenceFor(workout)).toBe('Squat 5 × 5 @ 80 kg (2 min rest)')
	})

	test('mixed sets list each set', () => {
		const workout = strengthWorkout([repsSet(0, 5, 80), repsSet(1, 3, 90)])
		expect(sentenceFor(workout)).toBe('Squat 5 @ 80 kg / 3 @ 90 kg')
	})

	test('%1RM load and unloaded sets render honestly', () => {
		expect(
			formatSetsSummary([
				{ kind: 'reps', reps: 5, pct1RM: 75 },
				{ kind: 'reps', reps: 5, pct1RM: 75 },
			]),
		).toBe('2 × 5 @ 75% 1RM')
		expect(
			formatSetsSummary([
				{ kind: 'reps', reps: 10 },
				{ kind: 'reps', reps: 10 },
				{ kind: 'reps', reps: 10 },
			]),
		).toBe('3 × 10')
	})

	test('timed and AMRAP sets use their own quantities', () => {
		expect(
			formatSetsSummary([
				{ kind: 'timed', durationSec: 30 },
				{ kind: 'timed', durationSec: 30 },
				{ kind: 'timed', durationSec: 30 },
			]),
		).toBe('3 × 30 s')
		expect(formatSetsSummary([{ kind: 'amrap' }, { kind: 'amrap' }])).toBe(
			'2 × AMRAP',
		)
		expect(formatSetsSummary([])).toBeNull()
	})

	test('a strength step without an exercise name renders a placeholder, not an invented name', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [
					persistedStep({
						orderIndex: 0,
						kind: 'strength',
						exercise: null,
						sets: [repsSet(0, 5, 80)],
					}),
				],
			},
		])
		expect(sentenceFor(workout)).toBe('exercise 1 × 5 @ 80 kg')
	})
})

// ——— Token addressing (the editor seam) ———————————————————————————————————

describe('token addresses', () => {
	test('every token names its block, step, and Conform field', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				name: 'main',
				repeatCount: 4,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 360,
						intensity: json({ kind: 'pace', minSecPerKm: 280 }),
						notes: 'hold form',
					}),
					persistedStep({ orderIndex: 1, kind: 'rest', durationSec: 60 }),
				],
			},
			{
				orderIndex: 1,
				steps: [
					persistedStep({
						orderIndex: 0,
						kind: 'strength',
						exercise: { name: 'Squat' },
						sets: [
							{
								kind: 'reps',
								orderIndex: 0,
								reps: 5,
								weightKg: 80,
								pct1RM: null,
								durationSec: null,
							},
						],
						restBetweenSetsSec: 90,
					}),
				],
			},
		])

		const notation = deriveWorkoutNotation(workoutToNotationInput(workout))
		const [intervals, strength] = notation.blocks

		expect(intervals!.repeat?.address).toEqual({
			blockIndex: 0,
			stepIndex: null,
			field: 'repeatCount',
		})
		expect(intervals!.label?.address).toEqual({
			blockIndex: 0,
			stepIndex: null,
			field: 'name',
		})
		expect(
			intervals!.steps[0]!.tokens.map((t) => [t.token.type, t.token.address]),
		).toEqual([
			['quantity', { blockIndex: 0, stepIndex: 0, field: 'duration' }],
			['intensity', { blockIndex: 0, stepIndex: 0, field: 'intensity' }],
			['notes', { blockIndex: 0, stepIndex: 0, field: 'notes' }],
		])
		expect(
			intervals!.steps[1]!.tokens.map((t) => [t.token.type, t.token.address]),
		).toEqual([['rest', { blockIndex: 0, stepIndex: 1, field: 'duration' }]])
		expect(
			strength!.steps[0]!.tokens.map((t) => [t.token.type, t.token.address]),
		).toEqual([
			['exercise', { blockIndex: 1, stepIndex: 0, field: 'exerciseId' }],
			['sets', { blockIndex: 1, stepIndex: 0, field: 'sets' }],
			['rest', { blockIndex: 1, stepIndex: 0, field: 'restBetweenSetsSec' }],
		])
	})

	test('a distance quantity addresses the distance field', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				steps: [persistedStep({ orderIndex: 0, distanceM: 2000 })],
			},
		])
		const notation = deriveWorkoutNotation(workoutToNotationInput(workout))
		expect(notation.blocks[0]!.steps[0]!.tokens[0]!.token.address).toEqual({
			blockIndex: 0,
			stepIndex: 0,
			field: 'distance',
		})
	})
})

// ——— Draft form values ————————————————————————————————————————————————————

describe('draftToNotationInput — draft form values', () => {
	test('humane draft strings render the same sentence as their persisted twin', () => {
		const input = draftToNotationInput([
			{
				name: 'warm-up',
				repeatCount: '1',
				steps: [{ kind: 'cardio', discipline: 'run', distance: '2 km' }],
			},
			{
				repeatCount: '4',
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						duration: '6 min',
						intensity: json({ kind: 'pace', minSecPerKm: 280 }),
					},
					{ kind: 'rest', duration: '1 min' },
				],
			},
			{
				name: 'cool-down',
				repeatCount: '1',
				steps: [{ kind: 'cardio', discipline: 'run' }],
			},
		])

		expect(notationSentence(deriveWorkoutNotation(input))).toBe(
			'2 km warm-up → 4 × 6 min @ 4:40 /km (1 min rest) → cool-down',
		)
	})

	test('half-typed values produce no token — the notation never guesses', () => {
		const input = draftToNotationInput([
			{
				repeatCount: '4',
				steps: [
					{
						kind: 'cardio',
						duration: 'soonish', // unparseable
						intensity: json({ kind: 'zoneLabel', label: 'easy' }),
					},
				],
			},
		])

		expect(notationSentence(deriveWorkoutNotation(input))).toBe('4 × Easy')
	})

	test('a legacy plain-string zone label in a draft field still renders', () => {
		const input = draftToNotationInput([
			{
				repeatCount: '1',
				steps: [{ kind: 'cardio', duration: '30 min', intensity: 'endurance' }],
			},
		])
		expect(notationSentence(deriveWorkoutNotation(input))).toBe(
			'30 min Endurance',
		)
	})

	test('strength drafts resolve exercise names through the lookup and skip incomplete set rows', () => {
		const blocks = [
			{
				repeatCount: '1',
				steps: [
					{
						kind: 'strength',
						exerciseId: 'ex1',
						restBetweenSetsSec: '120',
						sets: [
							{ kind: 'reps', reps: '5', weightKg: '80' },
							{ kind: 'reps', reps: '5', weightKg: '80' },
							{ kind: 'reps', reps: '' }, // still being typed
						],
					},
				],
			},
		]
		const input = draftToNotationInput(blocks, {
			exerciseNames: { ex1: 'Squat' },
		})
		expect(notationSentence(deriveWorkoutNotation(input))).toBe(
			'Squat 2 × 5 @ 80 kg (2 min rest)',
		)

		// An id with no lookup entry falls back to the honest placeholder.
		const unnamed = draftToNotationInput(blocks)
		expect(notationSentence(deriveWorkoutNotation(unnamed))).toBe(
			'exercise 2 × 5 @ 80 kg (2 min rest)',
		)
	})

	test('a missing or empty draft is an empty notation', () => {
		expect(
			notationSentence(deriveWorkoutNotation(draftToNotationInput(null))),
		).toBe('')
		expect(
			notationSentence(deriveWorkoutNotation(draftToNotationInput([]))),
		).toBe('')
	})
})

// ——— Model invariants ————————————————————————————————————————————————————

describe('token model invariants', () => {
	test('separators are defined by the model', () => {
		expect(NOTATION_SEPARATORS).toEqual({
			step: '→',
			repeat: '×',
			value: '@',
			facet: '·',
		})
	})

	test('a repeat token exists only when the block actually repeats', () => {
		const input: NotationInput = {
			blocks: [
				{ repeatCount: 1, steps: [{ kind: 'cardio', durationSec: 600 }] },
				{ repeatCount: 3, steps: [{ kind: 'cardio', durationSec: 60 }] },
			],
		}
		const notation = deriveWorkoutNotation(input)
		expect(notation.blocks[0]!.repeat).toBeNull()
		expect(notation.blocks[1]!.repeat).toMatchObject({
			type: 'repeat',
			text: '3',
			count: 3,
		})
		expect(notationSentence(notation)).toBe('10 min → 3 × 1 min')
	})

	test('tokenText composes intensity facets; stepSentence wraps parenthesized tokens', () => {
		const input: NotationInput = {
			blocks: [
				{
					repeatCount: 1,
					steps: [
						{
							kind: 'cardio',
							discipline: 'bike',
							durationSec: 1200,
							intensity: { kind: 'powerPct', minPct: 95, maxPct: 105 },
						},
						{ kind: 'rest', durationSec: 90 },
					],
				},
			],
		}
		const notation = deriveWorkoutNotation(input, {
			thresholds: bikeThresholds,
		})
		expect(tokenText(intensityTokenAt(notation, 0, 0))).toBe(
			'95–105% FTP · Z4 (238–263 W)',
		)
		expect(stepSentence(notation.blocks[0]!.steps[1]!)).toBe(
			'(1 min 30 s rest)',
		)
	})

	test('deriving the same structure twice is deterministic', () => {
		const workout = persistedWorkout([
			{
				orderIndex: 0,
				repeatCount: 4,
				steps: [
					persistedStep({
						orderIndex: 0,
						durationSec: 360,
						intensity: json({ kind: 'zoneLabel', label: 'Z4' }),
						discipline: 'bike',
					}),
				],
			},
		])
		const render = () =>
			deriveWorkoutNotation(workoutToNotationInput(workout), {
				thresholds: bikeThresholds,
			})
		expect(render()).toEqual(render())
	})
})

// ——— notationInputToWorkout (draft → Workout Shape adapter) ————————————————

describe('notationInputToWorkout', () => {
	test('feeds a draft through the existing Shape derivation: zone from the authored target, bar per step', () => {
		const input = draftToNotationInput([
			{
				repeatCount: '1',
				steps: [
					{
						kind: 'cardio',
						duration: '10 min',
						intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z4' }),
					},
				],
			},
		])
		const profile = deriveSessionProfile(notationInputToWorkout(input))
		expect(profile.bars).toEqual([
			{ id: 'step-0-0', zone: 4, durationSec: 600 },
		])
		expect(profile.groups).toEqual([])
	})

	test('carries repeat blocks through as bracketed groups', () => {
		const input = draftToNotationInput([
			{ repeatCount: '1', steps: [{ kind: 'cardio', distance: '2 km' }] },
			{
				repeatCount: '4',
				steps: [
					{
						kind: 'cardio',
						duration: '6 min',
						intensity: JSON.stringify({ kind: 'rpe', min: 7 }),
					},
					{ kind: 'rest', duration: '1 min' },
				],
			},
		])
		const profile = deriveSessionProfile(notationInputToWorkout(input))
		// 1 warm-up bar + 4 × 2 interval bars = 9; bracket over the middle 8.
		expect(profile.bars).toHaveLength(9)
		expect(profile.groups).toEqual([{ startIndex: 1, span: 8, repeatCount: 4 }])
	})

	test('a draft cardio step with no authored intensity inherits the workout intent zone', () => {
		const input = draftToNotationInput([
			{ repeatCount: '1', steps: [{ kind: 'cardio', duration: '30 min' }] },
		])
		const withIntent = deriveSessionProfile(
			notationInputToWorkout(input, { intent: 'threshold' }),
		)
		expect(withIntent.bars.map((b) => b.zone)).toEqual([4])
		// No intent → the unresolvable step stays an honest null-zone bar.
		const withoutIntent = deriveSessionProfile(notationInputToWorkout(input))
		expect(withoutIntent.bars.map((b) => b.zone)).toEqual([null])
	})

	test('an absolute pace target stays honestly unzoned (no invented zone)', () => {
		const input = draftToNotationInput([
			{
				repeatCount: '1',
				steps: [
					{
						kind: 'cardio',
						duration: '20 min',
						intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 280 }),
					},
				],
			},
		])
		const profile = deriveSessionProfile(
			notationInputToWorkout(input, { intent: 'threshold' }),
		)
		// The intent fallback never overrides an explicit-but-unmappable target.
		expect(profile.bars.map((b) => b.zone)).toEqual([null])
	})
})
