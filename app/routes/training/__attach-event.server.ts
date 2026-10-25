/**
 * The plan page's action for _Legg til et løp_ (#505 stories 7–8, #518):
 * `preview-attach-event` answers with the preview and writes nothing — not
 * even the race named on the spot; `attach-event` applies the previewed
 * attach — refused as stale when it would no longer be the one shown — and
 * redirects to the plan by its Event with what was done as a toast. Kept
 * beside `__attach-event.tsx` so the route's action only dispatches to it, as
 * the Sesong edits' is (`__season-edits.server.ts`).
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
	readAttachEvent,
	type AttachChoice,
	type ReadAttachEventResult,
} from '#app/utils/plan-outline/open-ended.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	type AttachEventPreviewView,
	type AttachEventReply,
} from './__attach-event.tsx'

function previewView(
	preview: Extract<ReadAttachEventResult, { ok: true }>,
	choice: AttachChoice,
): AttachEventPreviewView {
	const { rows: _rows, edit: _edit, ok: _ok, ...view } = preview
	return {
		...view,
		// What the confirm posts back: the same choice, as the form typed it.
		confirm:
			choice.kind === 'event'
				? { eventId: choice.eventId }
				: {
						name: choice.name,
						startDate: choice.startDate.toISOString().slice(0, 10),
					},
	}
}

const reply = (attachEvent: AttachEventReply, status?: number) =>
	data({ attachEvent }, status ? { status } : undefined)

export async function attachEventAction(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: AttachEventFormSchema })
	if (submission.status !== 'success') {
		// A confirm that fails to parse answers under the confirm, a preview
		// under the form that asked for it.
		return reply(
			formData.get('intent') === 'attach-event'
				? { result: null, confirmResult: submission.reply(), preview: null }
				: { result: submission.reply(), confirmResult: null, preview: null },
			400,
		)
	}
	const { intent, outlineId, choice, digest } = submission.value

	if (intent === 'preview-attach-event') {
		const preview = await readAttachEvent(userId, outlineId, choice)
		if (!preview.ok) {
			return reply(
				{
					result: submission.reply({
						formErrors: [ATTACH_EVENT_REFUSAL_LABELS[preview.reason]],
					}),
					confirmResult: null,
					preview: null,
				},
				400,
			)
		}
		// Nothing written: the preview, for the athlete to confirm under.
		return reply({
			result: submission.reply(),
			confirmResult: null,
			preview: previewView(preview, choice),
		})
	}

	// The schema refuses a confirm without the preview's digest, so it is here.
	const attached =
		choice.kind === 'event'
			? await attachEventToOutline(
					userId,
					outlineId,
					choice.eventId,
					new Date(),
					{ digest },
				)
			: await addRaceToOpenEndedPlan(userId, outlineId, choice, new Date(), {
					digest,
				})
	if (!attached.ok) {
		// Said under the preview as it stands now when there is one, so the
		// athlete reads what would land and confirms that instead.
		const message = ATTACH_EVENT_REFUSAL_LABELS[attached.reason]
		const fresh = await readAttachEvent(userId, outlineId, choice)
		return reply(
			fresh.ok
				? {
						result: null,
						confirmResult: submission.reply({ formErrors: [message] }),
						preview: previewView(fresh, choice),
					}
				: {
						result: submission.reply({ formErrors: [message] }),
						confirmResult: null,
						preview: null,
					},
			400,
		)
	}
	// To the plan by its Event now: it is an ordinary plan toward it.
	return redirectWithToast(`/training/plan?event=${attached.eventId}`, {
		type: 'success',
		title: ATTACH_EVENT_LABELS.done,
		description: attachedEventSentence(attached.ended, attached.phases),
	})
}
