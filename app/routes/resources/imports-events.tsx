import { eventStream } from 'remix-utils/sse/server'
import { requireUserId } from '#app/utils/auth.server.ts'
import { subscribeActivityImportCreated } from '#app/utils/imports-events.server.ts'
import { IMPORT_CREATED_EVENT } from '#app/utils/imports-events.ts'
import { type Route } from './+types/imports-events.ts'

/**
 * Per-athlete Server-Sent Events stream for live Activity Import updates (#75).
 *
 * The stream is scoped to the authenticated athlete via the same session auth as
 * every other route, so athlete A's events never reach athlete B's tab. The
 * connection stays open until the client navigates away or the request aborts,
 * at which point the subscription is torn down.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	return eventStream(request.signal, (send) => {
		const unsubscribe = subscribeActivityImportCreated(userId, () => {
			// The payload is unused by the client beyond signalling "something
			// changed" — a timestamp keeps consecutive events distinct so the
			// browser's EventSource state advances and the revalidation fires.
			send({ event: IMPORT_CREATED_EVENT, data: String(Date.now()) })
		})
		return () => unsubscribe()
	})
}
