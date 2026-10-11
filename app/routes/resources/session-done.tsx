import { parseWithZod } from '@conform-to/zod'
import { data } from 'react-router'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	SessionDoneSchema,
	SessionDoneUndoSchema,
} from '#app/utils/import-link-schema.ts'
import {
	ANGRE_REST_LABELS,
	MARK_DONE_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import {
	markSessionDone,
	undoMarkSessionDone,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/session-done.ts'

/**
 * _Gjort_ (#505 story 82): the athlete marks a session done by hand, from its
 * row on I dag. The numbers come later, from the import that links onto it.
 * Owner-scoped: another athlete's session answers 404 and stays as it is.
 *
 * The reply carries the mark's _Angre_ token (`result.undo`), which the
 * client's toast and the landed row post back as `intent: undo` (ADR 0088,
 * amended): the session goes back to exactly what it was, and that undo's own
 * toast says so.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	if (formData.get('intent') === 'undo') return undo(userId, formData)
	const submission = parseWithZod(formData, { schema: SessionDoneSchema })
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null, undone: null },
			{ status: 400 },
		)
	}
	const result = await markSessionDone(userId, submission.value.sessionId, {
		timezone: await getAthleteTimezone(userId),
	})
	if (result.ok) {
		return data({ submission: submission.reply(), result, undone: null })
	}
	return data(
		{
			submission: submission.reply({
				formErrors: [MARK_DONE_REFUSAL_LABELS[result.reason]],
			}),
			result,
			undone: null,
		},
		{ status: result.reason === 'session-not-found' ? 404 : 409 },
	)
}

/** _Angre_ on _Gjort_: the token back, and a toast when it took something. */
async function undo(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: SessionDoneUndoSchema })
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null, undone: false },
			{ status: 400 },
		)
	}
	const { sessionId, markedAt, status, markedDoneAt } = submission.value
	const result = await undoMarkSessionDone(userId, {
		sessionId,
		markedAt,
		status,
		markedDoneAt: markedDoneAt ?? null,
	})
	if (!result.ok) {
		return data(
			{
				submission: submission.reply({
					formErrors: [ANGRE_REST_LABELS.refused[result.reason]],
				}),
				result: null,
				undone: false,
			},
			{ status: result.reason === 'not-undoable' ? 409 : 404 },
		)
	}
	const reply = {
		submission: submission.reply(),
		result: null,
		undone: result.undone,
	}
	if (!result.undone) return data(reply)
	return data(reply, {
		headers: await createToastHeaders({
			description: ANGRE_REST_LABELS.markDoneUndone(result.title),
			type: 'success',
		}),
	})
}
