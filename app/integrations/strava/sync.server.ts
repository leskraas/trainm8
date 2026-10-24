import { prisma } from '#app/utils/db.server.ts'
import { DeferJob } from '#app/utils/jobs/queue.server.ts'
import {
	StravaAppInactiveError,
	StravaConnectionRevokedError,
	StravaInsufficientScopeError,
} from './client.server.ts'
import {
	fetchStravaActivitiesAfter,
	fileActivitiesWithAutoSave,
	ingestActivityStreams,
} from './ingest.server.ts'
import { STRAVA_PROVIDER } from './types.ts'

/**
 * Manual "Sync now" (#72). Fetches the athlete's Strava activities created since
 * the last successful sync (or since the connection was made on first sync) and
 * auto-saves each one onto a Workout Session (ADR 0049). Strava activity types are
 * mapped to disciplines via the provider-private table (ADR 0014); unmodeled
 * types collapse to `'other'` (ADR 0015) and are excluded from auto-match.
 *
 * Like every ingest path, each activity goes through `autoSaveImport`: linked
 * to the one planned session that fits, or stood up as a recording-only
 * session of its own when none does.
 *
 * Token refresh — including the rotated refresh token — is handled transparently
 * by the API client. A permanently revoked grant surfaces as a `revoked` result
 * so the surface can prompt the athlete to re-authorize.
 */

export type StravaSyncResult =
	| { ok: true; created: number; skipped: number }
	| {
			ok: false
			reason:
				| 'not-connected'
				| 'revoked'
				| 'insufficient-scope'
				| 'app-inactive'
				| 'rate-limited'
	  }

export async function syncStravaActivities(
	athleteId: string,
): Promise<StravaSyncResult> {
	const connection = await prisma.accountConnection.findUnique({
		where: { athleteId_provider: { athleteId, provider: STRAVA_PROVIDER } },
	})
	if (!connection) return { ok: false, reason: 'not-connected' }
	if (connection.status === 'revoked') return { ok: false, reason: 'revoked' }

	// First sync reaches back to when the athlete connected; later syncs only
	// pull what's new since the previous successful run.
	const since = connection.lastSyncedAt ?? connection.connectedAt
	const after = Math.floor(since.getTime() / 1000)

	const timezone =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId: athleteId },
				select: { timezone: true },
			})
		)?.timezone ?? 'UTC'

	let activities
	try {
		activities = await fetchStravaActivitiesAfter(connection, after)
	} catch (err) {
		// A manual sync runs inside the request, so a spent Strava day can't be
		// waited out or deferred to the queue: say so instead (#637).
		if (err instanceof DeferJob) return { ok: false, reason: 'rate-limited' }
		if (err instanceof StravaConnectionRevokedError) {
			return { ok: false, reason: 'revoked' }
		}
		if (err instanceof StravaAppInactiveError) {
			return { ok: false, reason: 'app-inactive' }
		}
		if (err instanceof StravaInsufficientScopeError) {
			return { ok: false, reason: 'insufficient-scope' }
		}
		throw err
	}

	const { created, skipped } = await fileActivitiesWithAutoSave(
		athleteId,
		activities,
		timezone,
	)

	// Ingest each recording's downsampled telemetry as an Activity Stream, so a
	// freshly-synced session's Workout Detail View overlay works end-to-end with
	// no manual step (#139, best-effort). The same single streams call per
	// activity derives its HR phase bars and enqueues Structure Detection (#611).
	try {
		await ingestActivityStreams(connection, activities)
	} catch (err) {
		// The day ran out after the activities were saved. Keep them, but leave
		// the watermark so the next sync fetches the streams still missing.
		if (err instanceof DeferJob) return { ok: true, created, skipped }
		throw err
	}

	// Only advance the watermark on a fully successful pass.
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: { lastSyncedAt: new Date() },
	})

	return { ok: true, created, skipped }
}
