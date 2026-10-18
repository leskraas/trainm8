import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { justerSession, undoJuster } from '#app/utils/juster.server.ts'
import { JusterSchema, JusterUndoSchema } from '#app/utils/juster.ts'
import { JUSTER_LABELS } from '#app/utils/labels.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import { type Route } from './+types/session-adjust.ts'

/**
 * **Juster** (spec #558 S5, ADR 0100 §7): the today card's three chips —
 * _For sliten i dag_, _Lite tid_, _Bytt dag_ — as one conform form on one zod
 * union. Each reply says what changed (`result.toast`, the session's title,
 * the sessions it changed) and carries its _Angre_ token (`result.undo`),
 * which the toast and the card post back as `intent: undo` (ADR 0088 and its
 * _Gjort_ amendment). A chip that cannot act replies with why, as the form's
 * error. Owner-scoped: another athlete's session answers 404.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	if (formData.get('intent') === 'undo') return undo(userId, formData)
	const submission = parseWithZod(formData, { schema: JusterSchema })
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null, undone: null },
			{ status: 400 },
		)
	}
	const result = await justerSession(userId, submission.value, {
		timezone: await getAthleteTimezone(userId),
	})
	if (result.ok) {
		return data({ submission: submission.reply(), result, undone: null })
	}
	return data(
		{
			submission: submission.reply({
				formErrors: [JUSTER_LABELS.refused[result.reason]],
			}),
			result,
			undone: null,
		},
		{ status: result.reason === 'session-not-found' ? 404 : 409 },
	)
}

/** _Angre_ on a Juster: its token back, and a toast when it took something. */
async function undo(userId: string, formData: FormData) {
	const submission = parseWithZod(formData, { schema: JusterUndoSchema })
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null, undone: false },
			{ status: 400 },
		)
	}
	const result = await undoJuster(userId, submission.value.adjustmentId)
	if (!result.ok) {
		return data(
			{
				submission: submission.reply({
					formErrors: [JUSTER_LABELS.undoRefused[result.reason]],
				}),
				result: null,
				undone: false,
			},
			{ status: result.reason === 'not-found' ? 404 : 409 },
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
			description: JUSTER_LABELS.undone(result.title),
			type: 'success',
		}),
	})
}
