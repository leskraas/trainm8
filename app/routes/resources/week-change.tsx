import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { WEEK_CHANGE_REFUSAL_LABELS } from '#app/utils/labels.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import { WeekChangeActionSchema } from '#app/utils/load/week-change-schema.ts'
import {
	acceptRoundWithFactor,
	answerProposal,
	easeWeek,
} from '#app/utils/load/week-replan-answers.server.ts'
import { type Route } from './+types/week-change.ts'

/**
 * The athlete's answers on the _Ukeskiftet_ card (#505 stories 4–6, 45–46, 51;
 * ADR 0080): Ok or Nei takk on a proposal (with a move's scope), Ok on the
 * next round at a factor of their own, and "Gjør uka lettere −15 %".
 *
 * A resource route, so each control posts with its own fetcher and the card
 * stays where it is. Owner-scoped twice over: the athlete must be signed in,
 * and every server function reads only the athlete's own rows — another
 * athlete's proposal answers 404 and changes nothing.
 *
 * Every reply carries the conform submission (a malformed post or a refusal
 * comes back as the form's error) and the card as it now stands, so the
 * answer the athlete just gave can say what it changed even when it was the
 * last one and home no longer shows the card.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: WeekChangeActionSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null, weekChange: null },
			{ status: 400 },
		)
	}
	const value = submission.value
	const result =
		value.intent === 'answer'
			? await answerProposal(
					userId,
					value.proposalId,
					value.answer,
					value.scope,
				)
			: value.intent === 'accept-round'
				? await acceptRoundWithFactor(
						userId,
						value.proposalId,
						Number(value.factor),
					)
				: await easeWeek(userId, value.weekKey)
	return data(
		{
			submission: result.ok
				? submission.reply({ resetForm: true })
				: submission.reply({
						formErrors: [WEEK_CHANGE_REFUSAL_LABELS[result.reason]],
					}),
			result,
			weekChange: await readWeekChange(userId),
		},
		{
			status: result.ok ? 200 : result.reason === 'not-found' ? 404 : 409,
		},
	)
}
