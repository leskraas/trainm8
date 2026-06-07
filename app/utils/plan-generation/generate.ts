import { type z } from 'zod'
import { type PlanModelClient } from './model-client.ts'
import {
	GeneratedPlanSchema,
	PlanGenerationInputSchema,
	type GeneratedPlan,
	type PlanGenerationInput,
} from './schema.ts'

export type GenerateResult =
	| { ok: true; plan: GeneratedPlan }
	| { ok: false; error: string }

export type GenerateOptions = {
	/** Progress messages for the SSE stream (PRD #103, user story 8). */
	onProgress?: (message: string) => void
}

/**
 * Orchestrate plan generation against an injectable model client (PRD #103).
 *
 * Validates wizard inputs, asks the client for a candidate plan, Zod-validates
 * it against the trainm8 typed contract, and performs a single bounded repair
 * retry on failure (re-prompting the client with the previous output + the
 * validation issues). A still-invalid candidate is rejected — surfaced as an
 * error rather than a broken preview, and nothing is persisted.
 *
 * Pure with respect to I/O beyond the injected client, so it is fully testable
 * with a fake client. A client that throws (e.g. the real provider is
 * unreachable) is caught and surfaced as a clear athlete-facing error rather
 * than crashing the stream — orchestration stays seam-only, with no knowledge of
 * the concrete provider.
 */
export async function generatePlan(
	client: PlanModelClient,
	rawInput: PlanGenerationInput,
	options: GenerateOptions = {},
): Promise<GenerateResult> {
	const { onProgress } = options

	const parsedInput = PlanGenerationInputSchema.safeParse(rawInput)
	if (!parsedInput.success) {
		return { ok: false, error: 'Invalid plan request.' }
	}
	const input = parsedInput.data

	try {
		onProgress?.('Designing your training plan…')
		const firstCandidate = await client.generate({ input })
		const first = GeneratedPlanSchema.safeParse(firstCandidate)
		if (first.success) {
			onProgress?.('Plan ready.')
			return { ok: true, plan: first.data }
		}

		onProgress?.('Refining the plan…')
		const repaired = await client.generate({
			input,
			repair: {
				previousOutput: firstCandidate,
				issues: formatIssues(first.error),
			},
		})
		const second = GeneratedPlanSchema.safeParse(repaired)
		if (second.success) {
			onProgress?.('Plan ready.')
			return { ok: true, plan: second.data }
		}

		return {
			ok: false,
			error:
				'The plan could not be generated in a valid form. Please try again.',
		}
	} catch {
		return {
			ok: false,
			error:
				'The plan generator is temporarily unavailable. Please try again in a moment.',
		}
	}
}

function formatIssues(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const path = issue.path.join('.')
		return path ? `${path}: ${issue.message}` : issue.message
	})
}
