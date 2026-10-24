/**
 * _Legg til et løp_ (ADR 0079 §4, #533): the action behind `__attach-event.tsx`,
 * which the route's action dispatches to.
 */

import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import {
	ATTACH_EVENT_LABELS,
	ATTACH_EVENT_REFUSAL_LABELS,
	attachedEventSentence,
} from '#app/utils/labels.ts'
import { AttachEventFormSchema } from '#app/utils/plan-outline/attach-event-schema.ts'
import {
	addRaceToOpenEndedPlan,
	attachEventToOutline,
} from '#app/utils/plan-outline/open-ended.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

/** `attach-event`: give an open-ended plan an Event, or a new race. */
export async function attachEventAction(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, {
		schema: AttachEventFormSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ intent: 'attach-event', result: submission.reply() },
			{ status: 400 },
		)
	}
	const { outlineId: attachTo, choice } = submission.value
	const attached =
		choice.kind === 'event'
			? await attachEventToOutline(userId, attachTo, choice.eventId)
			: await addRaceToOpenEndedPlan(userId, attachTo, choice)
	if (!attached.ok) {
		return data(
			{
				intent: 'attach-event',
				result: submission.reply({
					formErrors: [ATTACH_EVENT_REFUSAL_LABELS[attached.reason]],
				}),
			},
			{ status: 400 },
		)
	}
	// To the plan by its Event now: it is an ordinary plan toward it.
	return redirectWithToast(`/training/plan?event=${attached.eventId}`, {
		type: 'success',
		title: ATTACH_EVENT_LABELS.done,
		description: attachedEventSentence(attached.ended, attached.phases),
	})
}
