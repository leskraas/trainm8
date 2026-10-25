/**
 * Fitting the season to its Event (#533): the action behind `__fit-to-event.tsx`,
 * which the route's action dispatches to.
 */

import { SESONG_REFUSAL_LABELS } from '#app/utils/labels.ts'
import {
	fitPlanToEvent,
	type FitToEventRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { fitProposalSentence } from './__fit-to-event.tsx'
import { IdField, OUTLINE_GONE, refuse } from './__plan-action.server.ts'

/**
 * Each way a fit can be declined, worded. The surface renders no control in any
 * of these states, so every one of them is a posted intent rather than a tap —
 * but each still gets its own sentence, because "nothing to do" and "this needs a
 * decision from you" are different answers.
 */
function fitRefusalMessage(reason: FitToEventRefusal): string {
	switch (reason) {
		case 'outline-not-found':
			return OUTLINE_GONE
		case 'no-event':
			return SESONG_REFUSAL_LABELS.noEvent
		case 'already-fits':
			return SESONG_REFUSAL_LABELS.alreadyFits
		case 'cannot-fit':
			return SESONG_REFUSAL_LABELS.cannotFit
	}
}

/** `fit-to-event`: resize the blocks the proposal names, then list them in a toast. */
export async function fitToEventAction(
	userId: string,
	request: Request,
	formData: FormData,
) {
	const outlineId = IdField.safeParse(formData.get('outlineId'))
	if (!outlineId.success) return refuse(OUTLINE_GONE)
	const fitted = await fitPlanToEvent(userId, {
		outlineId: outlineId.data,
	})
	if (!fitted.ok) return refuse(fitRefusalMessage(fitted.reason))
	// Said in a toast for `apply-preset`'s reason: several blocks just changed
	// length at once, and an athlete who tapped one button is owed the list of
	// what it did — the sentence names every block, so the edit is auditable
	// against the blocks below without diffing them by eye. They are ordinary
	// resizes and every one of them is editable back.
	const url = new URL(request.url)
	return redirectWithToast(`${url.pathname}${url.search}`, {
		type: 'success',
		title: SESONG_REFUSAL_LABELS.fitDone,
		description: `${fitProposalSentence(fitted.proposal)}${SESONG_REFUSAL_LABELS.fitTail}`,
	})
}
