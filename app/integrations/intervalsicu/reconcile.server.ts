import { RECONCILE_OVERLAP_MS } from '#app/integrations/reconcile-sweep.server.ts'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { IntervalsIcuKeyRejectedError } from './client.server.ts'
import {
	fetchIntervalsIcuActivitiesBetween,
	fileIntervalsIcuActivities,
	ingestActivityTelemetry,
} from './ingest.server.ts'
import { INTERVALSICU_PROVIDER } from './types.ts'

/**
 * Intervals.icu reconciliation (#205, ADR 0013). With no webhook at this
 * provider, the daily sweep IS the automatic sync: it re-fetches each active
 * connection's recent activities with a 48h overlap before the watermark and
 * files any it doesn't already hold, reusing the same fetch path and
 * idempotent `(provider, externalId)` guard as manual sync and backfill.
 *
 * Because the sweep is this provider's primary ingest path, it also carries
 * full telemetry: each modeled activity's per-sample streams are fetched and
 * persisted (Telemetry Overlay + NP-based TSS, ADR 0020/0024), and Training
 * Load is recomputed whenever new imports or streams landed.
 */

/** The `kind` the generalized sweep dispatches for Intervals.icu (#205). */
export const INTERVALSICU_RECONCILE_JOB_KIND = 'intervalsicu-reconcile'

export type IntervalsIcuReconcileResult =
	| { ok: true; created: number; skipped: number }
	| { ok: false; reason: 'not-connected' | 'inactive' | 'revoked' }

export async function runIntervalsIcuReconciliation(
	athleteId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<IntervalsIcuReconcileResult> {
	const connection = await prisma.accountConnection.findUnique({
		where: {
			athleteId_provider: { athleteId, provider: INTERVALSICU_PROVIDER },
		},
	})
	if (!connection) return { ok: false, reason: 'not-connected' }
	if (connection.status !== 'active') return { ok: false, reason: 'inactive' }

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
			// A regenerated or deleted key never recovers on its own (ADR 0026):
			// flip to `revoked` so the sweep stops polling and the hub shows
			// "needs re-authorization" until the athlete pastes a fresh key.
			await prisma.accountConnection.update({
				where: { id: connection.id },
				data: { status: 'revoked' },
			})
			return { ok: false, reason: 'revoked' }
		}
		throw err
	}

	const { created, skipped, latestActivityAt, oldestActivityAt } =
		await fileIntervalsIcuActivities(athleteId, activities, timezone)

	// Bring telemetry to the swept recordings: one streams fetch per modeled
	// activity feeds both the downsampled Activity Stream (ADR 0020 — Telemetry
	// Overlay + NP-based TSS, ADR 0024) and the HR phase bars. This also heals
	// stream-less imports inside the window from earlier failed fetches.
	// Best-effort; absent streams leave telemetry Unavailable.
	const { enriched } = await ingestActivityTelemetry(
		{ athleteId, accessToken: connection.accessToken },
		activities,
	)

	// New imports or freshly-landed streams change TSS and Training Load (a
	// power stream upgrades Coggan TSS to true NP): recompute from the oldest
	// activity in the window, the same path backfill takes. A sweep that found
	// nothing new leaves the snapshots untouched.
	if ((created > 0 || enriched > 0) && oldestActivityAt != null) {
		await recomputeLoadFrom(athleteId, localDate(oldestActivityAt, timezone))
	}

	// Advance the watermark forward-only: the 48h overlap reaches back before
	// `lastSyncedAt`, so a sweep that only finds older activities must not pull
	// it backward. No activities at all leaves it untouched.
	const current = connection.lastSyncedAt
	if (
		latestActivityAt != null &&
		(current == null || latestActivityAt > current)
	) {
		await prisma.accountConnection.update({
			where: { id: connection.id },
			data: { lastSyncedAt: latestActivityAt },
		})
	}

	return { ok: true, created, skipped }
}
