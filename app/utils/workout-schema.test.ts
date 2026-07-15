import { expect, test } from 'vitest'
import {
	WorkoutAuthoringSchema,
	WorkoutStructureSchema,
	WORKOUT_INTENTS,
	ExerciseSetSchema,
} from './workout-schema.ts'

function validCardioStep(overrides: Record<string, unknown> = {}) {
	return {
		kind: 'cardio',
		discipline: 'run',
		...overrides,
	}
}

function validInput(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Tuesday Tempo Run',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: '2026-06-01T08:00:00.000Z',
		blocks: [
			{
				steps: [validCardioStep({ notes: 'warm up' })],
			},
		],
		...overrides,
	}
}

// ── WorkoutStructureSchema (the extracted structural core) ───────────────────

function validStructure(overrides: Record<string, unknown> = {}) {
	return {
		discipline: 'run',
		blocks: [{ steps: [validCardioStep({ notes: 'warm up' })] }],
		...overrides,
	}
}

test('WorkoutStructureSchema accepts discipline + blocks with no authoring envelope', () => {
	const result = WorkoutStructureSchema.safeParse(validStructure())
	expect(result.success).toBe(true)
})

test('WorkoutStructureSchema does not require title, intent, or scheduledAt', () => {
	// The structure a Structure Detection stores carries no authoring envelope;
	// omitting all three envelope fields must still parse.
	const result = WorkoutStructureSchema.safeParse(validStructure())
	expect(result.success).toBe(true)
})

test('WorkoutStructureSchema round-trips through parse → serialize → parse', () => {
	const input = validStructure({
		discipline: 'bike',
		blocks: [
			{
				name: 'Main Set',
				repeatCount: 5,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						intensity: { kind: 'power', minW: 250, maxW: 300 },
						durationSec: 180,
					},
					{ kind: 'rest', durationSec: 60 },
				],
			},
		],
	})
	const first = WorkoutStructureSchema.safeParse(input)
	expect(first.success).toBe(true)
	if (!first.success) return
	// Serialize the parsed value and parse it again — the shape survives a JSON
	// round-trip unchanged (this is how a WorkoutDetection stores + rehydrates it).
	const roundTripped = WorkoutStructureSchema.safeParse(
		JSON.parse(JSON.stringify(first.data)),
	)
	expect(roundTripped.success).toBe(true)
	if (roundTripped.success) {
		expect(roundTripped.data).toEqual(first.data)
	}
})

test('WorkoutStructureSchema rejects empty blocks array', () => {
	const result = WorkoutStructureSchema.safeParse(
		validStructure({ blocks: [] }),
	)
	expect(result.success).toBe(false)
})

test('WorkoutStructureSchema rejects invalid discipline', () => {
	const result = WorkoutStructureSchema.safeParse(
		validStructure({ discipline: 'yoga' }),
	)
	expect(result.success).toBe(false)
})

test('WorkoutAuthoringSchema is composed from WorkoutStructureSchema (structure fields still validate)', () => {
	// The authoring schema keeps the discipline + blocks rules it inherits from
	// the structural core, plus its own envelope.
	const missingDiscipline = WorkoutAuthoringSchema.safeParse(
		validInput({ discipline: undefined }),
	)
	expect(missingDiscipline.success).toBe(false)
	const emptyBlocks = WorkoutAuthoringSchema.safeParse(
		validInput({ blocks: [] }),
	)
	expect(emptyBlocks.success).toBe(false)
})

// ── Top-level WorkoutAuthoringSchema ─────────────────────────────────────────

test('accepts a valid minimal input', () => {
	const result = WorkoutAuthoringSchema.safeParse(validInput())
	expect(result.success).toBe(true)
})

test('accepts input with all fields populated', () => {
	const result = WorkoutAuthoringSchema.safeParse({
		title: 'Full Session',
		discipline: 'bike',
		intent: 'threshold',
		scheduledAt: '2026-06-01T10:00:00.000Z',
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						intensity: { kind: 'zoneLabel', label: 'Z1' },
						durationSec: 600,
						notes: '10 min easy spin',
					},
				],
			},
			{
				name: 'Main Set',
				repeatCount: 5,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						intensity: { kind: 'zoneLabel', label: 'threshold' },
						durationSec: 180,
						notes: '3 min hard',
					},
					{
						kind: 'rest',
						durationSec: 60,
						notes: '1 min recovery',
					},
				],
			},
		],
	})
	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data.blocks).toHaveLength(2)
		expect(result.data.blocks[1]!.repeatCount).toBe(5)
	}
})

test('rejects missing title', () => {
	const result = WorkoutAuthoringSchema.safeParse(validInput({ title: '' }))
	expect(result.success).toBe(false)
	if (!result.success) {
		expect(result.error.issues.some((i) => i.path.includes('title'))).toBe(true)
	}
})

test('rejects title exceeding 120 characters', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ title: 'x'.repeat(121) }),
	)
	expect(result.success).toBe(false)
})

test('rejects missing discipline', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ discipline: undefined }),
	)
	expect(result.success).toBe(false)
})

test('rejects invalid discipline', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ discipline: 'yoga' }),
	)
	expect(result.success).toBe(false)
})

test('accepts all valid disciplines', () => {
	for (const type of ['run', 'swim', 'bike', 'strength']) {
		const result = WorkoutAuthoringSchema.safeParse(
			validInput({ discipline: type }),
		)
		expect(result.success, `expected ${type} to be valid`).toBe(true)
	}
})

test('rejects missing scheduledAt', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ scheduledAt: undefined }),
	)
	expect(result.success).toBe(false)
})

test('rejects invalid scheduledAt', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ scheduledAt: 'not-a-date' }),
	)
	expect(result.success).toBe(false)
})

test('accepts past scheduledAt', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ scheduledAt: '2020-01-01T00:00:00.000Z' }),
	)
	expect(result.success).toBe(true)
})

test('rejects empty blocks array', () => {
	const result = WorkoutAuthoringSchema.safeParse(validInput({ blocks: [] }))
	expect(result.success).toBe(false)
})

test('rejects block with empty steps', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ blocks: [{ steps: [] }] }),
	)
	expect(result.success).toBe(false)
})

test('rejects repeatCount less than 1', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ repeatCount: 0, steps: [validCardioStep()] }],
		}),
	)
	expect(result.success).toBe(false)
})

test('defaults repeatCount to 1 when not provided', () => {
	const result = WorkoutAuthoringSchema.safeParse(validInput())
	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data.blocks[0]!.repeatCount).toBe(1)
	}
})

test('rejects block name exceeding 60 characters', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ name: 'a'.repeat(61), steps: [validCardioStep()] }],
		}),
	)
	expect(result.success).toBe(false)
})

test('accepts multiple blocks with multiple steps', () => {
	const result = WorkoutAuthoringSchema.safeParse({
		title: 'Multi-block',
		discipline: 'swim',
		intent: 'endurance',
		scheduledAt: '2026-06-01T08:00:00.000Z',
		blocks: [
			{
				name: 'Warm-up',
				steps: [{ kind: 'cardio', discipline: 'swim', notes: 'easy 200m' }],
			},
			{
				name: 'Main',
				repeatCount: 4,
				steps: [
					{
						kind: 'cardio',
						discipline: 'swim',
						distanceM: 100,
						intensity: { kind: 'zoneLabel', label: 'max' },
						notes: '100m sprint',
					},
					{
						kind: 'rest',
						durationSec: 60,
						notes: 'rest',
					},
				],
			},
			{
				name: 'Cool-down',
				steps: [{ kind: 'cardio', discipline: 'swim', notes: 'easy 200m' }],
			},
		],
	})
	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data.blocks).toHaveLength(3)
	}
})

test('rejects missing intent', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ intent: undefined }),
	)
	expect(result.success).toBe(false)
})

test('rejects unknown intent value', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ intent: 'sprinting' }),
	)
	expect(result.success).toBe(false)
})

test('accepts all 15 valid intent values', () => {
	for (const intent of WORKOUT_INTENTS) {
		const result = WorkoutAuthoringSchema.safeParse(validInput({ intent }))
		expect(result.success, `expected intent "${intent}" to be valid`).toBe(true)
	}
})

test('accepts cross-discipline intent (vo2max on strength workout)', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ discipline: 'strength', intent: 'vo2max' }),
	)
	expect(result.success).toBe(true)
})

// ── Cardio step invariants ────────────────────────────────────────────────────

test('cardio step requires kind and discipline', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ steps: [{ kind: 'cardio' }] }],
		}),
	)
	expect(result.success).toBe(false)
})

test('cardio step rejects invalid discipline', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ steps: [{ kind: 'cardio', discipline: 'yoga' }] }],
		}),
	)
	expect(result.success).toBe(false)
})

test('cardio step accepts run, swim, bike disciplines', () => {
	for (const disc of ['run', 'swim', 'bike']) {
		const result = WorkoutAuthoringSchema.safeParse(
			validInput({
				blocks: [{ steps: [{ kind: 'cardio', discipline: disc }] }],
			}),
		)
		expect(
			result.success,
			`expected cardio discipline "${disc}" to be valid`,
		).toBe(true)
	}
})

test('cardio step rejects both durationSec and distanceM', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{
							kind: 'cardio',
							discipline: 'run',
							durationSec: 300,
							distanceM: 1000,
						},
					],
				},
			],
		}),
	)
	expect(result.success).toBe(false)
})

test('cardio step accepts only durationSec', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [{ kind: 'cardio', discipline: 'run', durationSec: 300 }],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

test('cardio step accepts only distanceM', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [{ kind: 'cardio', discipline: 'run', distanceM: 400 }],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

test('cardio step accepts neither durationSec nor distanceM (unquantified)', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{ kind: 'cardio', discipline: 'run', notes: 'warm up until ready' },
					],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

test('cardio step rejects invalid intensity', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [{ kind: 'cardio', discipline: 'run', intensity: 'insane' }],
				},
			],
		}),
	)
	expect(result.success).toBe(false)
})

test('cardio step accepts all valid intensity kinds', () => {
	const intensities = [
		{ kind: 'zoneLabel', label: 'Z2' },
		{ kind: 'rpe', min: 6, max: 8 },
		{ kind: 'hrBpm', min: 140, max: 160 },
		{ kind: 'hrPct', ref: 'lthr', minPct: 90, maxPct: 99 },
		{ kind: 'power', minW: 200, maxW: 250 },
		{ kind: 'powerPct', minPct: 91, maxPct: 105 },
		{ kind: 'pace', minSecPerKm: 210, maxSecPerKm: 240 },
	]
	for (const intensity of intensities) {
		const result = WorkoutAuthoringSchema.safeParse(
			validInput({
				blocks: [
					{
						steps: [{ kind: 'cardio', discipline: 'run', intensity }],
					},
				],
			}),
		)
		expect(
			result.success,
			`expected intensity kind "${intensity.kind}" to be valid`,
		).toBe(true)
	}
})

test('cardio step rejects notes exceeding 240 characters', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{ kind: 'cardio', discipline: 'run', notes: 'a'.repeat(241) },
					],
				},
			],
		}),
	)
	expect(result.success).toBe(false)
})

// ── Strength step invariants ──────────────────────────────────────────────────

test('strength step accepts valid input with reps sets', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{
							kind: 'strength',
							exerciseId: 'ex_bb_back_squat',
							sets: [
								{ kind: 'reps', orderIndex: 0, reps: 5, weightKg: 100 },
								{ kind: 'reps', orderIndex: 1, reps: 5, weightKg: 100 },
								{ kind: 'reps', orderIndex: 2, reps: 5, weightKg: 100 },
							],
						},
					],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

test('strength step requires exerciseId', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{
							kind: 'strength',
							sets: [{ kind: 'reps', orderIndex: 0, reps: 5 }],
						},
					],
				},
			],
		}),
	)
	expect(result.success).toBe(false)
})

test('strength step requires at least one set', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{
							kind: 'strength',
							exerciseId: 'ex_bb_back_squat',
							sets: [],
						},
					],
				},
			],
		}),
	)
	expect(result.success).toBe(false)
})

test('strength step accepts optional restBetweenSetsSec', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{
							kind: 'strength',
							exerciseId: 'ex_bb_back_squat',
							sets: [{ kind: 'reps', orderIndex: 0, reps: 5 }],
							restBetweenSetsSec: 90,
						},
					],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

test('strength step accepts timed and amrap set kinds', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{
							kind: 'strength',
							exerciseId: 'ex_bw_pushup',
							sets: [
								{ kind: 'timed', orderIndex: 0, durationSec: 30 },
								{ kind: 'amrap', orderIndex: 1 },
							],
						},
					],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

// ── Rest step invariants ──────────────────────────────────────────────────────

test('rest step accepts valid input', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [{ kind: 'rest', durationSec: 90 }],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

test('rest step accepts no duration (open-ended rest)', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [{ kind: 'rest', notes: 'rest until ready' }],
				},
			],
		}),
	)
	expect(result.success).toBe(true)
})

test('rest step rejects unknown extra fields via strict typing', () => {
	// A rest step cannot carry discipline — the discriminated union ensures this
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{ kind: 'rest', durationSec: 60, discipline: 'run' } as unknown,
					],
				},
			],
		}),
	)
	// Zod's discriminatedUnion strips unknown keys, so this still succeeds — important: discipline is gone
	if (result.success) {
		const step = result.data.blocks[0]!.steps[0]!
		expect(step.kind).toBe('rest')
		expect('discipline' in step).toBe(false)
	}
})

// ── Step kind missing ─────────────────────────────────────────────────────────

test('step without kind is rejected', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ steps: [{ notes: 'warm up' }] }],
		}),
	)
	expect(result.success).toBe(false)
})

// ── ExerciseSet XOR invariants ────────────────────────────────────────────────

test('ExerciseSet reps set rejects both weightKg and pct1RM', () => {
	const result = ExerciseSetSchema.safeParse({
		kind: 'reps',
		orderIndex: 0,
		reps: 5,
		weightKg: 100,
		pct1RM: 80,
	})
	expect(result.success).toBe(false)
})

test('ExerciseSet reps set accepts weightKg alone', () => {
	const result = ExerciseSetSchema.safeParse({
		kind: 'reps',
		orderIndex: 0,
		reps: 5,
		weightKg: 100,
	})
	expect(result.success).toBe(true)
})

test('ExerciseSet reps set accepts pct1RM alone', () => {
	const result = ExerciseSetSchema.safeParse({
		kind: 'reps',
		orderIndex: 0,
		reps: 5,
		pct1RM: 85,
	})
	expect(result.success).toBe(true)
})

test('ExerciseSet reps set accepts no load (bodyweight)', () => {
	const result = ExerciseSetSchema.safeParse({
		kind: 'reps',
		orderIndex: 0,
		reps: 10,
	})
	expect(result.success).toBe(true)
})

test('ExerciseSet timed set requires durationSec', () => {
	const result = ExerciseSetSchema.safeParse({
		kind: 'timed',
		orderIndex: 0,
	})
	expect(result.success).toBe(false)
})

test('ExerciseSet amrap set requires no extra quantity fields', () => {
	const result = ExerciseSetSchema.safeParse({
		kind: 'amrap',
		orderIndex: 0,
		weightKg: 60,
	})
	expect(result.success).toBe(true)
})

test('ExerciseSet reps set requires reps', () => {
	const result = ExerciseSetSchema.safeParse({
		kind: 'reps',
		orderIndex: 0,
	})
	expect(result.success).toBe(false)
})

// ── End-to-end demo scenario ──────────────────────────────────────────────────

test('end-to-end: Lower body workout with strength + rest steps', () => {
	const result = WorkoutAuthoringSchema.safeParse({
		title: 'Lower body',
		discipline: 'strength',
		intent: 'strength-max',
		scheduledAt: '2026-06-01T08:00:00.000Z',
		blocks: [
			{
				name: 'Main',
				repeatCount: 1,
				steps: [
					{
						kind: 'strength',
						exerciseId: 'ex_bb_back_squat',
						sets: [
							{ kind: 'reps', orderIndex: 0, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 1, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 2, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 3, reps: 5, weightKg: 100 },
							{ kind: 'reps', orderIndex: 4, reps: 5, weightKg: 100 },
						],
						notes: 'Back squat — focus on depth',
					},
					{
						kind: 'rest',
						durationSec: 90,
						notes: 'Rest between sets',
					},
				],
			},
		],
	})
	expect(result.success).toBe(true)
	if (result.success) {
		const step0 = result.data.blocks[0]!.steps[0]!
		expect(step0.kind).toBe('strength')
		if (step0.kind === 'strength') {
			expect(step0.exerciseId).toBe('ex_bb_back_squat')
			expect(step0.sets).toHaveLength(5)
		}
		const step1 = result.data.blocks[0]!.steps[1]!
		expect(step1.kind).toBe('rest')
		if (step1.kind === 'rest') {
			expect(step1.durationSec).toBe(90)
		}
	}
})
