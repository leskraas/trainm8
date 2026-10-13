import { parseWithZod } from '@conform-to/zod/v3'
import { data } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { ANNET_ACTION_LABELS } from '#app/utils/labels.ts'
import { SessionAnnetSchema } from '#app/utils/session-annet-schema.ts'
import { setCountsInNoTrack } from '#app/utils/workout.server.ts'
import { type Route } from './+types/session-annet.ts'

/**
 * _Tell i Annet_ / _Tell i sporet_ — the row action on I dag that moves a
 * session in or out of Annet, the track that counts in nothing (#505 story
 * 33). A resource route rather than one more intent on home's own action,
 * because the row's fetcher posts here from wherever the row is drawn.
 *
 * Owner-scoped twice over: the athlete must be signed in, and
 * `setCountsInNoTrack` only writes a session that is theirs — another
 * athlete's id answers 404 and moves nothing.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: SessionAnnetSchema,
	})
	if (submission.status !== 'success') {
		return data(
			{ submission: submission.reply(), result: null },
			{ status: 400 },
		)
	}
	const { sessionId, countsInNoTrack } = submission.value
	const result = await setCountsInNoTrack(userId, sessionId, countsInNoTrack)
	return data(
		{
			submission: result.ok
				? submission.reply()
				: submission.reply({ formErrors: [ANNET_ACTION_LABELS.notFound] }),
			result,
		},
		{ status: result.ok ? 200 : 404 },
	)
}
