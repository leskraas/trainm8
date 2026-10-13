import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { RELEASE_ACTION_LABELS } from '#app/utils/labels.ts'
import { SessionReleaseSchema } from '#app/utils/load/week-change-schema.ts'
import { releaseSession } from '#app/utils/load/week-replan-answers.server.ts'
import { type Route } from './+types/session-release.ts'

/**
 * _Lås opp_ (#505 story 55, ADR 0080): hand one of the athlete's own sessions
 * back to the app, from its row on I dag. Owner-scoped: another athlete's
 * session answers 404 and stays as it is.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: SessionReleaseSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null },
			{ status: 400 },
		)
	}
	const result = await releaseSession(userId, submission.value.sessionId)
	return data(
		{
			submission: result.ok
				? submission.reply()
				: submission.reply({ formErrors: [RELEASE_ACTION_LABELS.notFound] }),
			result,
		},
		{ status: result.ok ? 200 : 404 },
	)
}
