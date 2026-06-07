import { type PlanGenerationInput } from './schema.ts'

/**
 * The injectable model-client seam (PRD #103, user story 26).
 *
 * The LLM call is the only non-deterministic part of plan generation, so it is
 * isolated behind this interface. Orchestration (`generate.ts`) depends only on
 * the seam, letting every other part of the feature be tested deterministically
 * with a fake client.
 *
 * `generate` returns `unknown`: the orchestration is responsible for
 * Zod-validating the candidate against the trainm8 typed contract. When a
 * previous candidate failed validation, `repair` carries the rejected output and
 * the validation issues so the client can attempt a corrected response (a real
 * provider re-prompts with the errors; the stub just returns its canned plan).
 */
export type ModelGenerateArgs = {
	input: PlanGenerationInput
	repair?: {
		previousOutput: unknown
		issues: string[]
	}
}

export type PlanModelClient = {
	/** Model id stamped onto persisted sessions for provenance (PRD #103). */
	readonly modelId: string
	generate(args: ModelGenerateArgs): Promise<unknown>
}

/** Model id reported by the #105 stub client. */
export const STUB_MODEL_ID = 'stub-v1'

/**
 * Stub model client for the #105 slice: returns a canned, typed plan derived
 * from the wizard inputs, proving the generate → preview pipe before the real
 * Anthropic provider lands (#106). Deterministic — same input yields the same
 * plan — so it doubles as a fixture for higher-level route tests.
 */
export function createStubModelClient(): PlanModelClient {
	return {
		modelId: STUB_MODEL_ID,
		generate({ input }: ModelGenerateArgs) {
			return Promise.resolve(buildCannedPlan(input))
		},
	}
}

const PHASE_BLUEPRINT = [
	{
		name: 'Base',
		focus: 'Build aerobic foundation with easy volume',
		share: 0.4,
	},
	{ name: 'Build', focus: 'Add threshold and tempo work', share: 0.3 },
	{ name: 'Peak', focus: 'Sharpen with VO₂ and race-pace efforts', share: 0.2 },
	{ name: 'Taper', focus: 'Reduce volume, keep intensity sharp', share: 0.1 },
] as const

const WEEKLY_HOURS_BY_EXPERIENCE = {
	beginner: 4,
	intermediate: 7,
	advanced: 11,
} as const

function buildCannedPlan(input: PlanGenerationInput) {
	const { disciplines, horizonWeeks, experience } = input
	const baseHours = WEEKLY_HOURS_BY_EXPERIENCE[experience]

	// Split the horizon across the four phases, giving any remainder to Base so
	// the phase weeks always sum to exactly `horizonWeeks`.
	const rawWeeks = PHASE_BLUEPRINT.map((p) =>
		Math.floor(horizonWeeks * p.share),
	)
	let assigned = rawWeeks.reduce((a, b) => a + b, 0)
	const weeks = rawWeeks.map((w) => Math.max(w, 0))
	// Ensure every phase has at least its floor and the total matches horizon.
	let i = 0
	while (assigned < horizonWeeks) {
		weeks[i % weeks.length]! += 1
		assigned += 1
		i += 1
	}

	const phases = PHASE_BLUEPRINT.map((p, idx) => ({
		name: p.name,
		weeks: weeks[idx]!,
		focus: p.focus,
		weeklyLoadHours: Number((baseHours * (1 + idx * 0.1)).toFixed(1)),
	})).filter((p) => p.weeks > 0)

	// Near-term detail window: concrete sessions for the first two weeks, one
	// per discipline per week, rotating intent. Schedule-agnostic (weekIndex +
	// orderInWeek only); the scheduler assigns dates.
	const detailWeeks = Math.min(2, horizonWeeks)
	const weekIndices = Array.from({ length: detailWeeks }, (_, w) => w)
	const sessions = weekIndices.flatMap((week) =>
		disciplines.map((discipline, orderInWeek) => {
			const intent = week === 0 ? 'endurance' : 'tempo'
			const label = week === 0 ? 'Z2' : 'Z3'
			return {
				weekIndex: week,
				orderInWeek,
				title: `${capitalize(discipline)} ${intent} session`,
				discipline,
				intent,
				blocks: [
					{
						name: 'Main',
						repeatCount: 1,
						steps: [
							{
								kind: 'cardio',
								discipline,
								intensity: { kind: 'zoneLabel', label },
								durationSec: 45 * 60,
							},
						],
					},
				],
			}
		}),
	)

	return { outline: { phases }, sessions }
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1)
}
