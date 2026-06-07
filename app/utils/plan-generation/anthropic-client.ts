import Anthropic from '@anthropic-ai/sdk'
import {
	CARDIO_DISCIPLINES,
	WORKOUT_INTENTS,
	type CardioDiscipline,
} from '#app/utils/workout-schema.ts'
import { BUILT_IN_RECIPES } from '#app/utils/zones/recipes.ts'
import { type ModelGenerateArgs, type PlanModelClient } from './model-client.ts'
import { type PlanGenerationInput } from './schema.ts'

/**
 * Real hosted-Claude model client behind the injectable seam (PRD #103, #106,
 * ADR 0016). Swaps in for `createStubModelClient` without touching the
 * orchestration in `generate.ts`, which still depends only on `PlanModelClient`.
 *
 * The model is driven via forced tool-use: it must call the `emit_training_plan`
 * tool, whose argument is the trainm8-typed plan. We return that argument as the
 * `unknown` candidate — orchestration owns Zod validation and the bounded repair
 * retry (the safety net), so a drifting model output is repaired or rejected
 * rather than previewed.
 *
 * The prompt is assembled from the athlete's profile (per-discipline recipe id +
 * zone labels + configured thresholds, per ADR 0006) and the wizard inputs, so
 * the model only emits zone labels that the resolver can actually resolve.
 */

export const PLAN_GENERATION_TOOL_NAME = 'emit_training_plan'

/**
 * Default hosted-Claude model. Plan quality is HITL-reviewed before ship (#106);
 * a reviewer can retune this without touching the seam.
 */
export const DEFAULT_PLAN_MODEL = 'claude-sonnet-4-6'

/** The slice of `messages.create` we depend on — injectable so tests stay offline. */
export type CreateMessageFn = (
	params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>

/** Per-discipline zone context fed to the prompt so zone resolution cannot fail. */
export type DisciplineZoneContext = {
	discipline: CardioDiscipline
	recipeId: string | null
	anchor: string | null
	zoneLabels: string[]
	hasThreshold: boolean
	thresholds: Record<string, number>
}

export type AthleteModelContext = {
	disciplines: DisciplineZoneContext[]
}

/** The subset of a DisciplineProfile the prompt reads (structurally Prisma-compatible). */
export type DisciplineProfileForPrompt = {
	discipline: string
	zoneSystem: string | null
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
}

const THRESHOLD_FIELDS = [
	'lthr',
	'maxHr',
	'ftp',
	'thresholdPaceSecPerKm',
	'cssSecPer100m',
] as const

/**
 * Build the per-discipline zone context for the prompt from the requested
 * disciplines and the athlete's DisciplineProfiles. A discipline with no profile
 * (or an unknown recipe) is left unresolved — no recipe, no labels, no
 * thresholds — so the model is told plainly it can only emit zone-label
 * intensity and the resolver leaves ranges unavailable (ADR 0006 fallback).
 */
export function buildAthleteModelContext(
	disciplines: CardioDiscipline[],
	profiles: DisciplineProfileForPrompt[],
): AthleteModelContext {
	const byDiscipline = new Map(profiles.map((p) => [p.discipline, p]))

	return {
		disciplines: disciplines.map((discipline) => {
			const profile = byDiscipline.get(discipline)
			const recipeId = profile?.zoneSystem ?? null
			const recipe = recipeId
				? BUILT_IN_RECIPES.find((r) => r.id === recipeId)
				: undefined

			const thresholds: Record<string, number> = {}
			if (profile) {
				for (const field of THRESHOLD_FIELDS) {
					const value = profile[field]
					if (value != null) thresholds[field] = value
				}
			}

			return {
				discipline,
				recipeId: recipe ? recipeId : null,
				anchor: recipe?.anchor ?? null,
				zoneLabels: recipe ? recipe.zones.map((z) => z.label) : [],
				hasThreshold: Object.keys(thresholds).length > 0,
				thresholds,
			}
		}),
	}
}

export type CreateAnthropicModelClientOptions = {
	athleteContext: AthleteModelContext
	apiKey: string
	model?: string
	maxTokens?: number
	/** Injectable for tests; defaults to the real Anthropic SDK call. */
	createMessage?: CreateMessageFn
}

export function createAnthropicModelClient(
	options: CreateAnthropicModelClientOptions,
): PlanModelClient {
	const {
		athleteContext,
		apiKey,
		model = DEFAULT_PLAN_MODEL,
		maxTokens = 8000,
		createMessage = defaultCreateMessage(apiKey),
	} = options

	return {
		modelId: model,
		async generate(args: ModelGenerateArgs): Promise<unknown> {
			let message: Anthropic.Message
			try {
				message = await createMessage({
					model,
					max_tokens: maxTokens,
					system: SYSTEM_PROMPT,
					tools: [PLAN_TOOL],
					tool_choice: { type: 'tool', name: PLAN_GENERATION_TOOL_NAME },
					messages: [
						{
							role: 'user',
							content: buildUserPrompt(args.input, athleteContext, args.repair),
						},
					],
				})
			} catch (cause) {
				throw new PlanProviderError(
					'The plan generator is temporarily unavailable.',
					{ cause },
				)
			}

			const toolUse = message.content.find(
				(block): block is Anthropic.ToolUseBlock =>
					block.type === 'tool_use' && block.name === PLAN_GENERATION_TOOL_NAME,
			)
			if (!toolUse) {
				throw new PlanProviderError(
					'The plan generator did not return a structured plan.',
				)
			}
			return toolUse.input
		},
	}
}

/** Thrown when the provider is unreachable or returns no usable plan tool call. */
export class PlanProviderError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'PlanProviderError'
	}
}

function defaultCreateMessage(apiKey: string): CreateMessageFn {
	const anthropic = new Anthropic({ apiKey })
	return (params) => anthropic.messages.create(params)
}

const SYSTEM_PROMPT = `You are an expert endurance coach generating a periodized cardio training plan for a self-coaching athlete.

You MUST call the ${PLAN_GENERATION_TOOL_NAME} tool exactly once with the full plan. Do not reply with prose.

Hard rules for the plan:
- Cardio only. Every session discipline and every cardio step discipline must be one of: ${CARDIO_DISCIPLINES.join(', ')}.
- Each session's intent must be one of: ${WORKOUT_INTENTS.join(', ')}.
- A cardio step may carry EITHER durationSec OR distanceM, never both.
- Express intensity ONLY as a zone label ({ "kind": "zoneLabel", "label": "<label>" }). Never emit raw bpm, watts, or pace. Use ONLY the zone labels listed for that discipline below; if a discipline has no labels listed, omit intensity for its steps.
- The outline phases' weeks must sum to the full horizon. Provide concrete sessions only for the near-term detail window (the first 1-2 weeks), using 0-based weekIndex and orderInWeek.`

const PLAN_TOOL: Anthropic.Tool = {
	name: PLAN_GENERATION_TOOL_NAME,
	description:
		'Emit the full periodized training plan: a phase outline spanning the horizon plus concrete near-term sessions.',
	input_schema: {
		type: 'object',
		properties: {
			outline: {
				type: 'object',
				properties: {
					phases: {
						type: 'array',
						minItems: 1,
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								weeks: { type: 'integer', minimum: 1 },
								focus: { type: 'string' },
								weeklyLoadHours: { type: 'number', minimum: 0 },
							},
							required: ['name', 'weeks', 'focus', 'weeklyLoadHours'],
						},
					},
				},
				required: ['phases'],
			},
			sessions: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'object',
					properties: {
						weekIndex: { type: 'integer', minimum: 0 },
						orderInWeek: { type: 'integer', minimum: 0 },
						title: { type: 'string' },
						discipline: { type: 'string', enum: [...CARDIO_DISCIPLINES] },
						intent: { type: 'string', enum: [...WORKOUT_INTENTS] },
						blocks: {
							type: 'array',
							minItems: 1,
							items: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									repeatCount: { type: 'integer', minimum: 1 },
									steps: {
										type: 'array',
										minItems: 1,
										items: {
											type: 'object',
											properties: {
												kind: { type: 'string', enum: ['cardio', 'rest'] },
												discipline: {
													type: 'string',
													enum: [...CARDIO_DISCIPLINES],
												},
												intensity: {
													type: 'object',
													properties: {
														kind: { type: 'string', enum: ['zoneLabel'] },
														label: { type: 'string' },
													},
													required: ['kind', 'label'],
												},
												durationSec: { type: 'integer', minimum: 1 },
												distanceM: { type: 'integer', minimum: 1 },
												notes: { type: 'string' },
											},
											required: ['kind'],
										},
									},
								},
								required: ['steps'],
							},
						},
					},
					required: ['weekIndex', 'title', 'discipline', 'intent', 'blocks'],
				},
			},
		},
		required: ['outline', 'sessions'],
	},
}

function buildUserPrompt(
	input: PlanGenerationInput,
	context: AthleteModelContext,
	repair?: ModelGenerateArgs['repair'],
): string {
	const zoneLines = context.disciplines.map((d) => {
		if (!d.recipeId || d.zoneLabels.length === 0) {
			return `- ${d.discipline}: no zone system configured — omit intensity for ${d.discipline} steps (targets stay unresolved).`
		}
		const thresholdNote = d.hasThreshold
			? `thresholds: ${JSON.stringify(d.thresholds)}`
			: 'no thresholds set yet (ranges will resolve later)'
		return `- ${d.discipline}: zone recipe "${d.recipeId}" (anchor ${d.anchor}); allowed zone labels: ${d.zoneLabels.join(', ')}; ${thresholdNote}.`
	})

	const sections = [
		'Generate a training plan for this athlete.',
		'',
		'Wizard inputs:',
		`- disciplines: ${input.disciplines.join(', ')}`,
		`- experience: ${input.experience}`,
		`- goal: ${input.goal}`,
		`- horizon: ${input.horizonWeeks} weeks`,
		'',
		'Per-discipline zone context (use ONLY these labels for intensity, per ADR 0006):',
		...zoneLines,
	]

	if (repair) {
		sections.push(
			'',
			'Your previous response failed validation against the required schema.',
			'Previous output:',
			JSON.stringify(repair.previousOutput),
			'Validation issues to fix:',
			...repair.issues.map((issue) => `- ${issue}`),
			'Return a corrected plan via the tool.',
		)
	}

	return sections.join('\n')
}
