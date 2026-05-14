import { expect, test } from 'vitest'
import { WorkoutAuthoringSchema } from './workout-schema.ts'

function validInput(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Tuesday Tempo Run',
		activityType: 'run',
		scheduledAt: '2026-06-01T08:00:00.000Z',
		blocks: [
			{
				steps: [{ description: 'warm up' }],
			},
		],
		...overrides,
	}
}

test('accepts a valid minimal input', () => {
	const result = WorkoutAuthoringSchema.safeParse(validInput())
	expect(result.success).toBe(true)
})

test('accepts input with all fields populated', () => {
	const result = WorkoutAuthoringSchema.safeParse({
		title: 'Full Session',
		activityType: 'bike',
		scheduledAt: '2026-06-01T10:00:00.000Z',
		blocks: [
			{
				name: 'Warm-up',
				repeatCount: 1,
				steps: [
					{
						activity: 'bike',
						intensity: 'easy',
						durationSec: 600,
						description: '10 min easy spin',
					},
				],
			},
			{
				name: 'Main Set',
				repeatCount: 5,
				steps: [
					{
						activity: 'bike',
						intensity: 'threshold',
						durationSec: 180,
						description: '3 min hard',
					},
					{
						activity: 'rest',
						intensity: 'easy',
						durationSec: 60,
						description: '1 min recovery',
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

test('rejects missing activityType', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ activityType: undefined }),
	)
	expect(result.success).toBe(false)
})

test('rejects invalid activityType', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({ activityType: 'yoga' }),
	)
	expect(result.success).toBe(false)
})

test('accepts all valid workout activity types', () => {
	for (const type of ['run', 'swim', 'bike', 'strength']) {
		const result = WorkoutAuthoringSchema.safeParse(
			validInput({ activityType: type }),
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
			blocks: [{ repeatCount: 0, steps: [{ description: 'go' }] }],
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

test('rejects step with both durationSec and distanceM', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [
						{ durationSec: 300, distanceM: 1000, description: 'bad step' },
					],
				},
			],
		}),
	)
	expect(result.success).toBe(false)
})

test('accepts step with only durationSec', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ steps: [{ durationSec: 300, description: 'timed' }] }],
		}),
	)
	expect(result.success).toBe(true)
})

test('accepts step with only distanceM', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ steps: [{ distanceM: 400, description: '400m rep' }] }],
		}),
	)
	expect(result.success).toBe(true)
})

test('accepts step with neither durationSec nor distanceM', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ steps: [{ description: 'warm up until ready' }] }],
		}),
	)
	expect(result.success).toBe(true)
})

test('rejects invalid step intensity', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{
					steps: [{ intensity: 'insane', description: 'nope' }],
				},
			],
		}),
	)
	expect(result.success).toBe(false)
})

test('accepts all valid step activity types including rest and strength', () => {
	for (const type of ['run', 'swim', 'bike', 'strength', 'rest']) {
		const result = WorkoutAuthoringSchema.safeParse(
			validInput({
				blocks: [
					{ steps: [{ activity: type, description: 'step' }] },
				],
			}),
		)
		expect(result.success, `expected step activity ${type} to be valid`).toBe(
			true,
		)
	}
})

test('rejects block name exceeding 60 characters', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [
				{ name: 'a'.repeat(61), steps: [{ description: 'go' }] },
			],
		}),
	)
	expect(result.success).toBe(false)
})

test('rejects step description exceeding 240 characters', () => {
	const result = WorkoutAuthoringSchema.safeParse(
		validInput({
			blocks: [{ steps: [{ description: 'a'.repeat(241) }] }],
		}),
	)
	expect(result.success).toBe(false)
})

test('accepts multiple blocks with multiple steps', () => {
	const result = WorkoutAuthoringSchema.safeParse({
		title: 'Multi-block',
		activityType: 'swim',
		scheduledAt: '2026-06-01T08:00:00.000Z',
		blocks: [
			{
				name: 'Warm-up',
				steps: [{ description: 'easy 200m' }],
			},
			{
				name: 'Main',
				repeatCount: 4,
				steps: [
					{ distanceM: 100, intensity: 'max', description: '100m sprint' },
					{ durationSec: 60, intensity: 'easy', description: 'rest' },
				],
			},
			{
				name: 'Cool-down',
				steps: [{ description: 'easy 200m' }],
			},
		],
	})
	expect(result.success).toBe(true)
	if (result.success) {
		expect(result.data.blocks).toHaveLength(3)
	}
})
