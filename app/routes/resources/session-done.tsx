import { parseWithZod } from '@conform-to/zod'
import { data } from 'react-router'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { SessionDoneSchema } from '#app/utils/import-link-schema.ts'
import { MARK_DONE_REFUSAL_LABELS } from '#app/utils/labels.ts'
import { markSessionDone } from '#app/utils/workout.server.ts'
import { type Route } from './+types/session-done.ts'

/**
 * _Gjort_ (#505 story 82): the athlete marks a session done by hand, from its
 * row on I dag. The numbers come later, from the import that links onto it.
 * Owner-scoped: another athlete's session answers 404 and stays as it is.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: SessionDoneSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null },
			{ status: 400 },
		)
	}
	const result = await markSessionDone(userId, submission.value.sessionId, {
		timezone: await getAthleteTimezone(userId),
	})
	if (result.ok) return data({ submission: submission.reply(), result })
	return data(
		{
			submission: submission.reply({
				formErrors: [MARK_DONE_REFUSAL_LABELS[result.reason]],
			}),
			result,
		},
		{ status: result.reason === 'session-not-found' ? 404 : 409 },
	)
}
