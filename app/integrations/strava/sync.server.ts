import {
	autoMatchImport,
	createActivityImport,
} from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { StravaConnectionRevokedError } from './client.server.ts'
import {
	fetchStravaActivitiesAfter,
	mapActivityToImportInput,
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
	| { ok: false; reason: 'not-connected' | 'revoked' }

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
		throw err
	}

	let created = 0
	let skipped = 0
	for (const activity of activities) {
		const input = mapActivityToImportInput(activity)
		let importId: string
		try {
			importId = (await createActivityImport(athleteId, input)).id
		} catch (err) {
			if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
				skipped++
				continue
			}
			throw err
		}
		created++
		// 'other' imports are excluded from auto-match (ADR 0015); they wait in the
		// inbox for the athlete to handle manually.
		if (input.discipline !== 'other') {
			await autoMatchImport(athleteId, importId, timezone)
		}
	}

	// Only advance the watermark on a fully successful pass.
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: { lastSyncedAt: new Date() },
	})

	return { ok: true, created, skipped }
}
