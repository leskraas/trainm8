import {
	autoMatchImport,
	createActivityImport,
} from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { stravaApiGet, StravaConnectionRevokedError } from './client.server.ts'
import { stravaTypeToDiscipline } from './discipline-map.ts'
import {
	STRAVA_PROVIDER,
	StravaActivitiesSchema,
	type StravaActivity,
} from './types.ts'

/**
 * Manual "Sync now" (#72). Fetches the athlete's Strava activities created since
 * the last successful sync (or since the connection was made on first sync) and
 * files each one as an `ActivityImport` in the inbox. Strava activity types are
 * mapped to disciplines via the provider-private table (ADR 0014); unmodeled
 * types collapse to `'other'` (ADR 0015) and are excluded from auto-match.
 *
 * Token refresh — including the rotated refresh token — is handled transparently
 * by the API client. A permanently revoked grant surfaces as a `revoked` result
 * so the surface can prompt the athlete to re-authorize.
 */

/** Strava caps `per_page` at 200; a modest page size keeps each request small. */
const PER_PAGE = 100
/** Safety cap so a misbehaving cursor can never loop forever. */
const MAX_PAGES = 20

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

	let created = 0
	let skipped = 0
	try {
		for (let page = 1; page <= MAX_PAGES; page++) {
			const activities = StravaActivitiesSchema.parse(
				await stravaApiGet(
					connection,
					`/athlete/activities?after=${after}&per_page=${PER_PAGE}&page=${page}`,
				),
			)
			if (activities.length === 0) break

			for (const activity of activities) {
				const outcome = await importStravaActivity(athleteId, activity, timezone)
				if (outcome === 'created') created++
				else skipped++
			}

			// A short page means we've reached the end of the cursor.
			if (activities.length < PER_PAGE) break
		}
	} catch (err) {
		if (err instanceof StravaConnectionRevokedError) {
			return { ok: false, reason: 'revoked' }
		}
		throw err
	}

	// Only advance the watermark on a fully successful pass.
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: { lastSyncedAt: new Date() },
	})

	return { ok: true, created, skipped }
}

/**
 * Turn one Strava activity into an `ActivityImport`. Returns `'skipped'` when the
 * activity was already imported (the unique `(provider, externalId)` guard makes
 * re-syncs idempotent), otherwise `'created'`.
 */
async function importStravaActivity(
	athleteId: string,
	activity: StravaActivity,
	timezone: string,
): Promise<'created' | 'skipped'> {
	const discipline = stravaTypeToDiscipline(
		activity.sport_type ?? activity.type ?? '',
	)
	const startedAt = new Date(activity.start_date)
	const durationSec = activity.moving_time ?? activity.elapsed_time ?? 0
	const elapsedSec = activity.elapsed_time ?? durationSec
	const endedAt = new Date(startedAt.getTime() + elapsedSec * 1000)
	const distanceM = activity.distance ?? null
	const paceAvgSecPerKm =
		distanceM != null && distanceM > 0 && durationSec > 0
			? durationSec / (distanceM / 1000)
			: null

	let importRecord: { id: string }
	try {
		importRecord = await createActivityImport(athleteId, {
			externalProvider: 'strava',
			externalId: activity.id,
			startedAt,
			endedAt,
			durationSec,
			distanceM,
			discipline,
			hrAvg: activity.average_heartrate ?? null,
			powerAvg: activity.average_watts ?? null,
			paceAvgSecPerKm,
			polyline: activity.map?.summary_polyline ?? null,
			rawJson: JSON.stringify(activity),
		})
	} catch (err) {
		if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
			return 'skipped'
		}
		throw err
	}

	// 'other' imports are excluded from auto-match (ADR 0015); they wait in the
	// inbox for the athlete to handle manually.
	if (discipline !== 'other') {
		await autoMatchImport(athleteId, importRecord.id, timezone)
	}
	return 'created'
}
