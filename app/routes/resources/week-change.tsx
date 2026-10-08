import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import { WeekChangeActionSchema } from '#app/utils/load/week-change-schema.ts'
import {
	acceptRoundWithFactor,
	answerProposal,
	easeWeek,
	releaseSession,
} from '#app/utils/load/week-replan-answers.server.ts'
import { type Route } from './+types/week-change.ts'

/**
 * The athlete's answers on the _Ukeskiftet_ card and its rows (#505 stories
 * 4–6, 45–46, 51, 55; ADR 0080): Ok or Nei takk on a proposal (with a move's
 * scope), Ok on the next round at a factor of their own, "Gjør uka lettere
 * −15 %", and "lås opp" on one of their own sessions.
 *
 * A resource route, so each control posts with its own fetcher and the card
 * stays where it is. Owner-scoped twice over: the athlete must be signed in,
 * and every server function reads only the athlete's own rows — another
 * athlete's proposal or session answers 404 and changes nothing.
 *
 * Each reply carries the card as it now stands, so the answer the athlete just
 * gave can say what it changed even when it was the last one and home no
 * longer shows the card.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: WeekChangeActionSchema,
	})
	invariantResponse(submission.status === 'success', 'Invalid request', {
		status: 400,
	})
	const value = submission.value

	switch (value.intent) {
		case 'answer':
		case 'accept-round': {
			const result =
				value.intent === 'answer'
					? await answerProposal(
							userId,
							value.proposalId,
							value.answer,
							value.scope,
						)
					: await acceptRoundWithFactor(userId, value.proposalId, value.factor)
			return data(
				{
					intent: value.intent,
					result,
					weekChange: await readWeekChange(userId),
				},
				{ status: statusOf(result) },
			)
		}
		case 'ease': {
			const result = await easeWeek(userId, value.weekKey)
			return data(
				{
					intent: value.intent,
					result,
					weekChange: await readWeekChange(userId),
				},
				{ status: result.ok ? 200 : 409 },
			)
		}
		case 'release': {
			const result = await releaseSession(userId, value.sessionId)
			return data(
				{ intent: value.intent, result, weekChange: null },
				{ status: result.ok ? 200 : 404 },
			)
		}
	}
}

/** Not the athlete's (or gone) is 404; any other refusal is a conflict. */
function statusOf(result: { ok: true } | { ok: false; reason: string }) {
	if (result.ok) return 200
	return result.reason === 'not-found' ? 404 : 409
}
