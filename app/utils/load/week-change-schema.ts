/**
 * The forms of the _Ukeskiftet_ card (#505 stories 4–6, 45–46, 51, 55; ADR
 * 0080), shared by the card's fetchers and its resource route
 * (`routes/resources/week-change.tsx`), so the browser and the server refuse
 * the same posts. No server imports: the card validates with it too.
 */

import { z } from 'zod'
import { ProposalScopeSchema } from './week-replan-proposal.ts'

/**
 * The range a round's volume factor may be edited within: from half the
 * round before to half as much again. Wide on purpose — the athlete is saying
 * what their life allows — but bounded, so a typo never doubles a plan. The
 * card's stepper moves in five-percent steps.
 */
export const ROUND_FACTOR_MIN = 0.5
export const ROUND_FACTOR_MAX = 1.5
export const ROUND_FACTOR_STEP = 0.05

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const RoundFactor = z.coerce
	.number()
	.min(ROUND_FACTOR_MIN)
	.max(ROUND_FACTOR_MAX)

/** Every post the route takes, told apart by its intent. */
export const WeekChangeActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('answer'),
		proposalId: z.string().min(1),
		answer: z.enum(['accepted', 'declined']),
		scope: ProposalScopeSchema.optional(),
	}),
	z.object({
		intent: z.literal('accept-round'),
		proposalId: z.string().min(1),
		factor: RoundFactor,
	}),
	z.object({ intent: z.literal('ease'), weekKey: DateKey }),
	z.object({ intent: z.literal('release'), sessionId: z.string().min(1) }),
])

/**
 * One proposal's answer form, as conform reads it: the intent and the answer
 * arrive on the button pressed; a move's scope and a round's factor are fields.
 */
export const ProposalAnswerFormSchema = z.object({
	proposalId: z.string().min(1),
	intent: z.enum(['answer', 'accept-round']),
	answer: z.enum(['accepted', 'declined']).optional(),
	scope: ProposalScopeSchema.optional(),
	factor: RoundFactor.optional(),
})
