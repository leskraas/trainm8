import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { actionCtx } from '#app/actions/context.server.ts'
import { type ActionName } from '#app/actions/registry.server.ts'
import { runAction } from '#app/actions/run.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import {
	type WeekChangeAction,
	WeekChangeActionSchema,
} from '#app/utils/load/week-change-schema.ts'
import { type Route } from './+types/week-change.ts'

/**
 * Which registry action each of the card's intents is (ADR 0092 §9). The
 * parity test holds this map to `WeekChangeActionSchema` and the registry:
 * every intent is exactly one action, and every action of the slice has an
 * intent.
 */
export const WEEK_CHANGE_INTENT_ACTIONS = {
	answer: 'answer_proposal',
	'accept-round': 'accept_round',
	ease: 'ease_week',
} as const satisfies Record<WeekChangeAction['intent'], ActionName>

/**
 * The athlete's answers on the _Ukeskiftet_ card (#505 stories 4–6, 45–46, 51;
 * ADR 0080): Ok or Nei takk on a proposal (with a move's scope), Ok on the
 * next round at a factor of their own, and "Gjør uka lettere −15 %".
 *
 * A resource route, so each control posts with its own fetcher and the card
 * stays where it is. Each intent runs its registry action as the `web` caller
 * (ADR 0092 §9): the route keeps the HTTP concerns — Conform, the 400, 404 and
 * 409 — and the action owns the operation. Owner-scoped twice over: the
 * athlete must be signed in, and every action reads only the athlete's own
 * rows — another athlete's proposal answers 404 and changes nothing.
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
	const ctx = await actionCtx(request, { userId, caller: 'web' })
	const value = submission.value
	const outcome =
		value.intent === 'answer'
			? await runAction(ctx, WEEK_CHANGE_INTENT_ACTIONS.answer, {
					proposalId: value.proposalId,
					answer: value.answer,
					scope: value.scope,
				})
			: value.intent === 'accept-round'
				? await runAction(ctx, WEEK_CHANGE_INTENT_ACTIONS['accept-round'], {
						proposalId: value.proposalId,
						factor: Number(value.factor),
					})
				: await runAction(ctx, WEEK_CHANGE_INTENT_ACTIONS.ease, {
						weekKey: value.weekKey,
					})
	if (outcome.outcome !== 'done' && outcome.outcome !== 'refused') {
		// Nothing a form can say: the action failed to run (logged there).
		throw new Response('Could not answer', { status: 500 })
	}
	// The reply's `result` is the service's own shape, as before the registry.
	const result =
		outcome.outcome === 'done'
			? { ok: true as const, ...outcome.value }
			: { ok: false as const, reason: outcome.code }
	return data(
		{
			submission:
				outcome.outcome === 'done'
					? submission.reply({ resetForm: true })
					: submission.reply({ formErrors: [outcome.message] }),
			result,
			weekChange: await readWeekChange(userId),
		},
		{
			status:
				outcome.outcome === 'done'
					? 200
					: outcome.code === 'not-found'
						? 404
						: outcome.code === 'invalid-input'
							? 400
							: 409,
		},
	)
}
