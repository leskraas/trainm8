import { expect, test, vi } from 'vitest'
import {
	buildAthleteModelContext,
	createAnthropicModelClient,
	isOAuthToken,
	PLAN_GENERATION_TOOL_NAME,
	type CreateMessageFn,
} from './anthropic-client.ts'
import { generatePlan } from './generate.ts'
import { type GeneratedPlan, type PlanGenerationInput } from './schema.ts'

const input: PlanGenerationInput = {
	disciplines: ['run', 'bike'],
	experience: 'intermediate',
	goal: 'Run a sub-2:00 half marathon',
	horizonWeeks: 8,
}

const context = buildAthleteModelContext(input.disciplines, [
	{
		discipline: 'run',
		zoneSystem: 'friel-hr-5-run',
		lthr: 165,
		maxHr: null,
		ftp: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
	},
	// `bike` intentionally has no DisciplineProfile → no recipe, no thresholds.
])

function validPlan(): GeneratedPlan {
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
	}
}

/** A fake `messages.create` that returns a single forced tool_use block. */
function fakeMessage(toolInput: unknown): CreateMessageFn {
	return vi.fn(
		() =>
			Promise.resolve({
				id: 'msg_test',
				type: 'message',
				role: 'assistant',
				model: 'claude-test',
				stop_reason: 'tool_use',
				stop_sequence: null,
				usage: { input_tokens: 1, output_tokens: 1 },
				content: [
					{
						type: 'tool_use',
						id: 'toolu_1',
						name: PLAN_GENERATION_TOOL_NAME,
						input: toolInput,
					},
				],
			}) as ReturnType<CreateMessageFn>,
	)
}

test('forces the plan tool and returns the tool input as the candidate', async () => {
	const createMessage = fakeMessage(validPlan())
	const client = createAnthropicModelClient({
		athleteContext: context,
		apiKey: 'test-key',
		createMessage,
	})

	const candidate = await client.generate({ input })

	expect(candidate).toEqual(validPlan())
	const params = vi.mocked(createMessage).mock.calls[0]![0]
	expect(params.tool_choice).toEqual({
		type: 'tool',
		name: PLAN_GENERATION_TOOL_NAME,
	})
	expect(params.tools?.[0]?.name).toBe(PLAN_GENERATION_TOOL_NAME)
})

test('prompt carries wizard inputs, recipe id, zone labels and thresholds (ADR 0006)', async () => {
	const createMessage = fakeMessage(validPlan())
	const client = createAnthropicModelClient({
		athleteContext: context,
		apiKey: 'test-key',
		createMessage,
	})

	await client.generate({ input })

	const params = vi.mocked(createMessage).mock.calls[0]![0]
	const userText = JSON.stringify(params.messages)
	// Wizard inputs.
	expect(userText).toContain('Run a sub-2:00 half marathon')
	expect(userText).toContain('intermediate')
	// Recipe id + zone labels so zone resolution cannot fail.
	expect(userText).toContain('friel-hr-5-run')
	expect(userText).toContain('Z2')
	// Threshold present for run.
	expect(userText).toContain('165')
})

test('repair turn includes the previous output and the validation issues', async () => {
	const createMessage = fakeMessage(validPlan())
	const client = createAnthropicModelClient({
		athleteContext: context,
		apiKey: 'test-key',
		createMessage,
	})

	await client.generate({
		input,
		repair: {
			previousOutput: { broken: true },
			issues: ['sessions: Required'],
		},
	})

	const params = vi.mocked(createMessage).mock.calls[0]![0]
	const userText = JSON.stringify(params.messages)
	expect(userText).toContain('broken')
	expect(userText).toContain('sessions: Required')
})

test('a response without a tool_use block is a provider error', async () => {
	const createMessage = vi.fn(() =>
		Promise.resolve({
			id: 'msg_test',
			type: 'message',
			role: 'assistant',
			model: 'claude-test',
			stop_reason: 'end_turn',
			stop_sequence: null,
			usage: { input_tokens: 1, output_tokens: 1 },
			content: [{ type: 'text', text: 'no tool here' }],
		}),
	) as unknown as CreateMessageFn
	const client = createAnthropicModelClient({
		athleteContext: context,
		apiKey: 'test-key',
		createMessage,
	})

	await expect(client.generate({ input })).rejects.toThrow()
})

test('provider failure surfaces as a clear athlete-facing error, not a crash', async () => {
	const createMessage: CreateMessageFn = vi.fn(() =>
		Promise.reject(new Error('503 overloaded')),
	)
	const client = createAnthropicModelClient({
		athleteContext: context,
		apiKey: 'test-key',
		createMessage,
	})

	const result = await generatePlan(client, input)

	expect(result.ok).toBe(false)
	if (!result.ok) {
		expect(result.error).toMatch(/unavailable|try again/i)
	}
})

test('api key auth sends the plain coach system prompt (no identity prefix)', async () => {
	const createMessage = fakeMessage(validPlan())
	const client = createAnthropicModelClient({
		athleteContext: context,
		apiKey: 'test-key',
		createMessage,
	})

	await client.generate({ input })

	const params = vi.mocked(createMessage).mock.calls[0]![0]
	expect(typeof params.system).toBe('string')
})

test('oauth token prepends the Claude Code identity block (required by the API)', async () => {
	const createMessage = fakeMessage(validPlan())
	const client = createAnthropicModelClient({
		athleteContext: context,
		oauthToken: 'sk-ant-oat01-test',
		createMessage,
	})

	await client.generate({ input })

	const params = vi.mocked(createMessage).mock.calls[0]![0]
	expect(Array.isArray(params.system)).toBe(true)
	const blocks = params.system as Array<{ type: string; text: string }>
	expect(blocks[0]?.text).toBe(
		"You are Claude Code, Anthropic's official CLI for Claude.",
	)
	// The coach prompt is still present as a later block.
	expect(blocks.some((b) => b.text.includes('endurance coach'))).toBe(true)
})

test('isOAuthToken classifies tokens by prefix', () => {
	expect(isOAuthToken('sk-ant-oat01-abc')).toBe(true)
	expect(isOAuthToken('sk-ant-api03-abc')).toBe(false)
})

test('buildAthleteModelContext leaves a discipline without a profile unresolved', () => {
	const bike = context.disciplines.find((d) => d.discipline === 'bike')
	expect(bike).toBeDefined()
	expect(bike!.recipeId).toBeNull()
	expect(bike!.zoneLabels).toEqual([])
	expect(bike!.hasThreshold).toBe(false)
})
