import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.ts'
import { setCountsInNoTrack } from '#app/utils/plan-outline/week-volumes.server.ts'
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
const SessionAnnetSchema = z.object({
	sessionId: z.string().min(1),
	countsInNoTrack: z.enum(['true', 'false']).transform((v) => v === 'true'),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: SessionAnnetSchema,
	})
	invariantResponse(submission.status === 'success', 'Invalid request', {
		status: 400,
	})
	const { sessionId, countsInNoTrack } = submission.value
	const result = await setCountsInNoTrack(userId, sessionId, countsInNoTrack)
	return data(result, { status: result.ok ? 200 : 404 })
}
