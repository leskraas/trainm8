import { z } from 'zod/v4'
import {
	ACTION_TITLE_LABELS,
	WEEK_CHANGE_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { acceptRoundWithFactor } from '#app/utils/load/week-replan-answers.server.ts'
import { defineAction } from './define.ts'
import { refuse } from './refusals.ts'

/**
 * Ok on an open-ended plan's next round at a volume factor of the athlete's
 * own (ADR 0079 §3, ADR 0080). The athlete's yes, so `web` only (ADR 0093 §3).
 * The factor's range is the service's to refuse (`factor-out-of-range`), so
 * every reader hears the same refusal.
 */
export const acceptRoundAction = defineAction({
	name: 'accept_round',
	revision: 1,
	kind: 'write',
	callers: ['web'],
	title: ACTION_TITLE_LABELS.accept_round,
	description:
		"Accept an open-ended plan's next round at a chosen volume factor. Only the athlete can, in trainm8.",
	input: z.object({
		proposalId: z.string().min(1),
		factor: z.number(),
	}),
	output: z.object({ applied: z.boolean() }),
	async run(ctx, input) {
		const result = await acceptRoundWithFactor(
			ctx.userId,
			input.proposalId,
			input.factor,
			ctx.now,
		)
		if (!result.ok) {
			return refuse(result.reason, {
				message: WEEK_CHANGE_REFUSAL_LABELS[result.reason],
			})
		}
		return { applied: result.applied }
	},
})
