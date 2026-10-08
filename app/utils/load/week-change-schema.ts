/**
 * The forms of the _Ukeskiftet_ card and of "lås opp" (#505 stories 4–6,
 * 45–46, 51, 55; ADR 0080), shared by the card's conform forms and their
 * resource routes, so the browser and the server refuse the same posts. No
 * server imports: the card validates with it too.
 */

import { z } from 'zod'
import { ProposalScopeSchema } from '#app/utils/load/week-replan-proposal.ts'

/** Where the card's answers post (`routes/resources/week-change.tsx`). */
export const WEEK_CHANGE_ACTION = '/resources/week-change'
/** Where "lås opp" posts (`routes/resources/session-release.tsx`). */
export const SESSION_RELEASE_ACTION = '/resources/session-release'

/**
 * The range a round's volume factor may be edited within: from half the
 * round before to half as much again. Wide on purpose — the athlete is saying
 * what their life allows — but bounded, so a typo never doubles a plan. The
 * card offers it in five-percent steps.
 */
export const ROUND_FACTOR_MIN = 0.5
export const ROUND_FACTOR_MAX = 1.5
export const ROUND_FACTOR_STEP = 0.05

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProposalId = z.string().min(1)

/**
 * A round's factor as the form carries it — a string, as every form value is,
 * and kept one, so the card's select and the route read the same type — that
 * is a number within the bounds.
 */
const RoundFactor = z
	.string()
	.regex(/^\d+(\.\d+)?$/)
	.refine(
		(value) =>
			Number(value) >= ROUND_FACTOR_MIN && Number(value) <= ROUND_FACTOR_MAX,
		'factor-out-of-range',
	)

/**
 * Every post the card makes, told apart by its intent — each branch requires
 * what its answer needs: an answer for Ok / Nei takk, a factor for a round's
 * Ok, a week for the ease.
 */
export const WeekChangeActionSchema = z.discriminatedUnion('intent', [
	z.object({
		intent: z.literal('answer'),
		proposalId: ProposalId,
		answer: z.enum(['accepted', 'declined']),
		scope: ProposalScopeSchema.optional(),
	}),
	z.object({
		intent: z.literal('accept-round'),
		proposalId: ProposalId,
		factor: RoundFactor,
	}),
	z.object({ intent: z.literal('ease'), weekKey: DateKey }),
])
export type WeekChangeAction = z.infer<typeof WeekChangeActionSchema>

/** "Lås opp" on one of the athlete's own sessions. */
export const SessionReleaseSchema = z.object({ sessionId: z.string().min(1) })
