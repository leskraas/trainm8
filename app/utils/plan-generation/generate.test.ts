import { expect, test, vi } from 'vitest'
import { generatePlan } from './generate.ts'
import { type PlanModelClient } from './model-client.ts'
import { type GeneratedPlan, type PlanGenerationInput } from './schema.ts'

const input: PlanGenerationInput = {
	disciplines: ['run', 'bike'],
	experience: 'intermediate',
	goal: 'Run a sub-2:00 half marathon',
	horizonWeeks: 8,
}

function validPlan(overrides: Partial<GeneratedPlan> = {}): GeneratedPlan {
	return {
		outline: {
			phases: [
				{ name: 'Base', weeks: 8, focus: 'Aerobic base', weeklyLoadHours: 6 },
			],
		},
		sessions: [
			{
				weekIndex: 0,
				orderInWeek: 0,
				title: 'Easy run',
				discipline: 'run',
				intent: 'endurance',
				blocks: [
					{
						repeatCount: 1,
						steps: [
							{
								kind: 'cardio',
								discipline: 'run',
								intensity: { kind: 'zoneLabel', label: 'Z2' },
								durationSec: 2700,
							},
						],
					},
				],
			},
		],
		...overrides,
	}
}

/** A fake client returning a queue of canned responses, recording its calls. */
function fakeClient(responses: unknown[]): PlanModelClient & { calls: number } {
	const client = {
		modelId: 'fake',
		calls: 0,
		generate: vi.fn(() => {
			const response =
				responses[client.calls] ?? responses[responses.length - 1]
			client.calls += 1
			return Promise.resolve(response)
		}),
	}
	return client
}

test('valid model output passes through as a typed plan', async () => {
	const client = fakeClient([validPlan()])
	const result = await generatePlan(client, input)

	expect(result.ok).toBe(true)
	if (result.ok) {
		expect(result.plan.sessions).toHaveLength(1)
		expect(result.plan.sessions[0]!.discipline).toBe('run')
	}
	expect(client.calls).toBe(1)
})

test('zone labels survive into the typed plan', async () => {
	const client = fakeClient([validPlan()])
	const result = await generatePlan(client, input)

	expect(result.ok).toBe(true)
	if (result.ok) {
		const step = result.plan.sessions[0]!.blocks[0]!.steps[0]!
		expect(step).toMatchObject({
			intensity: { kind: 'zoneLabel', label: 'Z2' },
		})
	}
})

test('invalid output triggers a bounded repair retry, then succeeds', async () => {
	const client = fakeClient([{ garbage: true }, validPlan()])
	const result = await generatePlan(client, input)

	expect(result.ok).toBe(true)
	expect(client.calls).toBe(2)
})

test('repair retry receives the previous output and the validation issues', async () => {
	const client = fakeClient([{ garbage: true }, validPlan()])
	await generatePlan(client, input)

	const secondCall = vi.mocked(client.generate).mock.calls[1]![0]
	expect(secondCall.repair?.previousOutput).toEqual({ garbage: true })
	expect(secondCall.repair?.issues.length).toBeGreaterThan(0)
})

test('still-invalid output after repair is rejected (no broken preview)', async () => {
	const client = fakeClient([{ garbage: true }, { still: 'bad' }])
	const result = await generatePlan(client, input)

	expect(result.ok).toBe(false)
	// Bounded: exactly one repair retry, no infinite loop.
	expect(client.calls).toBe(2)
})

test('intent outside WORKOUT_INTENTS is rejected', async () => {
	const bad = validPlan()
	bad.sessions[0]!.intent = 'super-hard' as never
	const client = fakeClient([bad, bad])
	const result = await generatePlan(client, input)

	expect(result.ok).toBe(false)
})

test('non-cardio discipline in a session is rejected', async () => {
	const bad = validPlan()
	bad.sessions[0]!.discipline = 'strength' as never
	const client = fakeClient([bad, bad])
	const result = await generatePlan(client, input)

	expect(result.ok).toBe(false)
})

test('non-cardio discipline in wizard input is rejected before calling the model', async () => {
	const client = fakeClient([validPlan()])
	const result = await generatePlan(client, {
		...input,
		disciplines: ['strength'] as never,
	})

	expect(result.ok).toBe(false)
	expect(client.calls).toBe(0)
})

test('progress callback is invoked during generation', async () => {
	const client = fakeClient([validPlan()])
	const messages: string[] = []
	await generatePlan(client, input, { onProgress: (m) => messages.push(m) })

	expect(messages.length).toBeGreaterThan(0)
})
