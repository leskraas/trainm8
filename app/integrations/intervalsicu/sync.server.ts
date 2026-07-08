import { RECONCILE_OVERLAP_MS } from '#app/integrations/reconcile-sweep.server.ts'
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
 * successful sync (or since the connection was made on first sync), reaching
 * back with the reconcile sweep's 48h overlap to catch activities that
 * uploaded late, and files each one as an `ActivityImport` in the inbox;
 * unmodeled types collapse to
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

	// First sync reaches back to when the athlete connected; later syncs pull
	// what's new since the previous successful run. Intervals.icu windows by
	// *activity start time*, and an activity always reaches the source after it
	// started (device upload lag can be hours) — so reach back with the same
	// overlap as the reconcile sweep, or a ride that landed at Intervals.icu
	// after our watermark would be silently missed forever. Idempotent
	// `(provider, externalId)` filing absorbs the re-fetched window.
	const since = connection.lastSyncedAt ?? connection.connectedAt
	const oldest = new Date(since.getTime() - RECONCILE_OVERLAP_MS)

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
			oldest,
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

	const { created, skipped, latestActivityAt } =
		await fileIntervalsIcuActivities(athleteId, activities, timezone)

	// Bring telemetry to the freshly-synced recordings: one streams fetch per
	// modeled activity feeds both the downsampled Activity Stream (ADR 0020 —
	// Telemetry Overlay + NP-based TSS, ADR 0024) and the HR phase bars.
	// Best-effort; absent streams leave telemetry Unavailable.
	await ingestActivityTelemetry(
		{ athleteId, accessToken: connection.accessToken },
		activities,
	)

	// Only advance the watermark on a fully successful pass, and only forward,
	// to the newest activity's *start time* — the same meaning backfill and the
	// reconcile sweep give it. Stamping the sync's own wall-clock time here
	// would place the watermark after any activity that started earlier but
	// uploaded later, hiding it from every future window.
	if (
		latestActivityAt != null &&
		(connection.lastSyncedAt == null ||
			latestActivityAt > connection.lastSyncedAt)
	) {
		await prisma.accountConnection.update({
			where: { id: connection.id },
			data: { lastSyncedAt: latestActivityAt },
		})
	}

	return { ok: true, created, skipped }
}
