import { prisma } from '#app/utils/db.server.ts'
import {
	StravaConnectionRevokedError,
	StravaInsufficientScopeError,
} from './client.server.ts'
import {
	enrichRecordingPhaseBars,
	fetchStravaActivitiesAfter,
	fileActivitiesWithAutoMatch,
	ingestActivityStreams,
} from './ingest.server.ts'
import { STRAVA_PROVIDER } from './types.ts'

/**
 * Manual "Sync now" (#72). Fetches the athlete's Strava activities created since
 * the last successful sync (or since the connection was made on first sync) and
 * files each one as an `ActivityImport` in the inbox. Strava activity types are
 * mapped to disciplines via the provider-private table (ADR 0014); unmodeled
 * types collapse to `'other'` (ADR 0015) and are excluded from auto-match.
 *
 * Unlike the Backfill Window (#74), manual sync only *links* imports to an
 * existing planned session — it never auto-creates recording-only sessions.
 *
 * Token refresh — including the rotated refresh token — is handled transparently
 * by the API client. A permanently revoked grant surfaces as a `revoked` result
 * so the surface can prompt the athlete to re-authorize.
 */

export type StravaSyncResult =
	| { ok: true; created: number; skipped: number }
	| { ok: false; reason: 'not-connected' | 'revoked' | 'insufficient-scope' }

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
		if (err instanceof StravaConnectionRevokedError) {
			return { ok: false, reason: 'revoked' }
		}
		if (err instanceof StravaInsufficientScopeError) {
			return { ok: false, reason: 'insufficient-scope' }
		}
		throw err
	}

	const { created, skipped } = await fileActivitiesWithAutoMatch(
		athleteId,
		activities,
		timezone,
	)

	// Derive intensity-phase bars from each recording's HR stream (best-effort).
	await enrichRecordingPhaseBars(connection, athleteId, activities)

	// Ingest each recording's downsampled telemetry as an Activity Stream, so a
	// freshly-synced session's Workout Detail View overlay works end-to-end with
	// no manual step (#139, best-effort). A separate pass from phase-bar
	// derivation above: the two are independently gated (streams need no
	// threshold; phase bars do) and each makes its own rate-limited streams call.
	// Folding both onto a single per-activity fetch is a possible future
	// optimisation once backfill telemetry (#140) settles the shared shape.
	await ingestActivityStreams(connection, activities)

	// Only advance the watermark on a fully successful pass.
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: { lastSyncedAt: new Date() },
	})

	return { ok: true, created, skipped }
}
