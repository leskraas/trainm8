import { connectAccountConnection } from '#app/utils/account-connection.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { INTERVALSICU_BACKFILL_JOB_KIND } from './backfill.server.ts'
import { IntervalsIcuKeyRejectedError } from './client.server.ts'
import { connectIntervalsIcuAccount } from './connect.server.ts'
import { INTERVALSICU_PROVIDER } from './types.ts'

/** Why a pasted key linked nothing. Nothing is stored in any of these cases. */
export const LINK_INTERVALSICU_REFUSALS = [
	'empty-key',
	'key-rejected',
	'unreachable',
] as const
export type LinkIntervalsIcuRefusal =
	(typeof LINK_INTERVALSICU_REFUSALS)[number]

export type LinkIntervalsIcuResult =
	| { ok: true }
	| { ok: false; reason: LinkIntervalsIcuRefusal }

/**
 * Link an athlete's Intervals.icu account from a pasted personal API key: the
 * key is validated against the athlete-self endpoint, the Account Connection is
 * stored with the key as its credential (ADR 0026 #3), and the count-based
 * Backfill Window is enqueued out of band (ADR 0013 #151, #204) — history
 * import starts at once and `backfillCompletedAt` says when it is done.
 *
 * Shared by the Integration Hub's connect route and the first run (#505 story
 * 61), which word the refusals each in their own register.
 */
export async function linkIntervalsIcu(
	athleteId: string,
	apiKey: string,
): Promise<LinkIntervalsIcuResult> {
	const key = apiKey.trim()
	if (!key) return { ok: false, reason: 'empty-key' }

	let connection
	try {
		connection = await connectIntervalsIcuAccount(key)
	} catch (err) {
		if (err instanceof IntervalsIcuKeyRejectedError) {
			return { ok: false, reason: 'key-rejected' }
		}
		return { ok: false, reason: 'unreachable' }
	}

	await connectAccountConnection({
		athleteId,
		provider: INTERVALSICU_PROVIDER,
		...connection,
	})
	await enqueueJob({
		kind: INTERVALSICU_BACKFILL_JOB_KIND,
		payload: { athleteId },
	})
	return { ok: true }
}
