import { describe, expect, test } from 'vitest'
import { EventAuthoringSchema, EventTargetSchema } from './event-schema.ts'

describe('EventTargetSchema', () => {
	test('accepts time target', () => {
		const result = EventTargetSchema.safeParse({ kind: 'time', seconds: 10800 })
		expect(result.success).toBe(true)
		if (result.success)
			expect(result.data).toEqual({ kind: 'time', seconds: 10800 })
	})

	test('accepts pace target', () => {
		const result = EventTargetSchema.safeParse({ kind: 'pace', secPerKm: 360 })
		expect(result.success).toBe(true)
	})

	test('accepts distance target', () => {
		const result = EventTargetSchema.safeParse({
			kind: 'distance',
			meters: 42195,
		})
		expect(result.success).toBe(true)
	})

	test('accepts placement target', () => {
		const result = EventTargetSchema.safeParse({
			kind: 'placement',
			position: 1,
		})
		expect(result.success).toBe(true)
	})

	test('accepts finish target (no extra fields)', () => {
		const result = EventTargetSchema.safeParse({ kind: 'finish' })
		expect(result.success).toBe(true)
	})

	test('accepts qualitative target', () => {
		const result = EventTargetSchema.safeParse({
			kind: 'qualitative',
			description: 'Feel strong',
		})
		expect(result.success).toBe(true)
	})

	test('rejects unknown kind', () => {
		const result = EventTargetSchema.safeParse({ kind: 'unknown' })
		expect(result.success).toBe(false)
	})

	test('rejects time target without seconds', () => {
		const result = EventTargetSchema.safeParse({ kind: 'time' })
		expect(result.success).toBe(false)
	})

	test('rejects qualitative target without description', () => {
		const result = EventTargetSchema.safeParse({ kind: 'qualitative' })
		expect(result.success).toBe(false)
	})
})

describe('EventAuthoringSchema', () => {
	function validInput() {
		return {
			name: 'Trondheim Marathon',
			kind: 'race' as const,
			priority: 'A' as const,
			startDate: new Date('2026-06-15'),
			disciplines: ['run'] as string[],
			status: 'planned' as const,
		}
	}

	test('accepts minimal valid event', () => {
		const result = EventAuthoringSchema.safeParse(validInput())
		expect(result.success).toBe(true)
	})

	test('accepts event with all optional fields', () => {
		const result = EventAuthoringSchema.safeParse({
			...validInput(),
			endDate: new Date('2026-06-16'),
			target: { kind: 'time', seconds: 10800 },
			location: 'Trondheim',
			notes: 'Sub-3 goal',
		})
		expect(result.success).toBe(true)
	})

	test('rejects when endDate is before startDate', () => {
		const result = EventAuthoringSchema.safeParse({
			...validInput(),
			startDate: new Date('2026-06-15'),
			endDate: new Date('2026-06-14'),
		})
		expect(result.success).toBe(false)
	})

	test('accepts when endDate equals startDate', () => {
		const result = EventAuthoringSchema.safeParse({
			...validInput(),
			startDate: new Date('2026-06-15'),
			endDate: new Date('2026-06-15'),
		})
		expect(result.success).toBe(true)
	})

	test('rejects invalid kind', () => {
		const result = EventAuthoringSchema.safeParse({
			...validInput(),
			kind: 'marathon',
		})
		expect(result.success).toBe(false)
	})

	test('rejects invalid priority', () => {
		const result = EventAuthoringSchema.safeParse({
			...validInput(),
			priority: 'D',
		})
		expect(result.success).toBe(false)
	})

	test('rejects empty disciplines array', () => {
		const result = EventAuthoringSchema.safeParse({
			...validInput(),
			disciplines: [],
		})
		expect(result.success).toBe(false)
	})

	test('rejects empty name', () => {
		const result = EventAuthoringSchema.safeParse({
			...validInput(),
			name: '',
		})
		expect(result.success).toBe(false)
	})

	test('defaults status to planned when omitted', () => {
		const input = validInput()
		const { status: _, ...withoutStatus } = input
		const result = EventAuthoringSchema.safeParse(withoutStatus)
		expect(result.success).toBe(true)
		if (result.success) expect(result.data.status).toBe('planned')
	})
})
