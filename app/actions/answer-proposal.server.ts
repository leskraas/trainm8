import { z } from 'zod/v4'
import {
	ACTION_TITLE_LABELS,
	WEEK_CHANGE_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { answerProposal } from '#app/utils/load/week-replan-answers.server.ts'
import { defineAction } from './define.ts'
import { refuse } from './refusals.ts'

/**
 * The athlete's Ok or Nei takk on a **Week Replan Proposal** (ADR 0080), with a
 * move's scope. It **is** the athlete's yes, so only their own session in
 * trainm8 may call it (ADR 0093 §3): a model that reaches it is refused
 * `needs-athlete-yes`. Thin over `answerProposal`, whose reasons are refusal
 * codes one to one.
 */
export const answerProposalAction = defineAction({
	name: 'answer_proposal',
	revision: 1,
	kind: 'write',
	callers: ['web'],
	title: ACTION_TITLE_LABELS.answer_proposal,
	description:
		"Answer a Week Replan Proposal on the athlete's behalf. Only the athlete can, in trainm8.",
	input: z.object({
		proposalId: z.string().min(1),
		answer: z.enum(['accepted', 'declined']),
		scope: z.enum(['this-time', 'from-now-on']).optional(),
	}),
	output: z.object({
		/** False on an Ok when the target is gone or past: the answer is kept. */
		applied: z.boolean(),
	}),
	async run(ctx, input) {
		const result = await answerProposal(
			ctx.userId,
			input.proposalId,
			input.answer,
			input.scope,
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
