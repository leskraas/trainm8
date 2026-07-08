import { prisma } from '#app/utils/db.server.ts'
import { IntervalsIcuKeyRejectedError } from './client.server.ts'
import {
	fetchIntervalsIcuActivitiesBetween,
	fileIntervalsIcuActivities,
	ingestActivityTelemetry,
} from './ingest.server.ts'
import { INTERVALSICU_PROVIDER } from './types.ts'

/**
 * Manual "Sync now" for Intervals.icu (#205, ADR 0013 minus the webhook —
 * Intervals.icu has none, so on-demand sync plus the daily reconciliation
 * sweep are the only triggers). Fetches activities recorded since the last
 * successful sync (or since the connection was made on first sync) and files
 * each one as an `ActivityImport` in the inbox; unmodeled types collapse to
 * `'other'` (ADR 0015) and are excluded from auto-match.
 *
 * Like Strava's manual sync (#72), this only *links* imports to an existing
 * planned session — it never auto-creates recording-only sessions.
 *
 * A key rejection (401/403) flips the connection to `revoked` on the row —
 * regenerated keys never come back on their own (ADR 0026); the athlete
 * pastes a new one on the hub card.
 */

export type IntervalsIcuSyncResult =
	| { ok: true; created: number; skipped: number }
	| { ok: false; reason: 'not-connected' | 'revoked' | 'unavailable' }

export async function syncIntervalsIcuActivities(
	athleteId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<IntervalsIcuSyncResult> {
	const connection = await prisma.accountConnection.findUnique({
		where: {
			athleteId_provider: { athleteId, provider: INTERVALSICU_PROVIDER },
		},
	})
	if (!connection) return { ok: false, reason: 'not-connected' }
	if (connection.status === 'revoked') return { ok: false, reason: 'revoked' }

	// First sync reaches back to when the athlete connected; later syncs only
	// pull what's new since the previous successful run.
	const since = connection.lastSyncedAt ?? connection.connectedAt

	const timezone =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId: athleteId },
				select: { timezone: true },
			})
		)?.timezone ?? 'UTC'

	let activities
	try {
		activities = await fetchIntervalsIcuActivitiesBetween(connection, {
			oldest: since,
			newest: now,
			timezone,
		})
	} catch (err) {
		if (err instanceof IntervalsIcuKeyRejectedError) {
			// The stored key is dead (regenerated or deleted at the source); only
			// a fresh key revives the connection, so record the truth on the row.
			await prisma.accountConnection.update({
				where: { id: connection.id },
				data: { status: 'revoked' },
			})
			return { ok: false, reason: 'revoked' }
		}
		// Anything else (outage, unexpected status or body) is transient for the
		// connection: report a retryable failure the route can toast instead of
		// crashing the request. The watermark stays put, so nothing is skipped.
		console.error('Intervals.icu sync could not fetch activities', err)
		return { ok: false, reason: 'unavailable' }
	}

	const { created, skipped } = await fileIntervalsIcuActivities(
		athleteId,
		activities,
		timezone,
	)

	// Bring telemetry to the freshly-synced recordings: one streams fetch per
	// modeled activity feeds both the downsampled Activity Stream (ADR 0020 —
	// Telemetry Overlay + NP-based TSS, ADR 0024) and the HR phase bars.
	// Best-effort; absent streams leave telemetry Unavailable.
	await ingestActivityTelemetry(
		{ athleteId, accessToken: connection.accessToken },
		activities,
	)

	// Only advance the watermark on a fully successful pass.
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: { lastSyncedAt: now },
	})

	return { ok: true, created, skipped }
}
