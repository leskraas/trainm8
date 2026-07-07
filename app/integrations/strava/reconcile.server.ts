import { RECONCILE_OVERLAP_MS } from '#app/integrations/reconcile-sweep.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	fetchStravaActivitiesAfter,
	fileActivitiesWithAutoMatch,
} from './ingest.server.ts'
import { STRAVA_PROVIDER } from './types.ts'

/**
 * Reconciliation poll (#77, ADR 0013) — the safety net under the webhook. A
 * daily sweep re-fetches each active Account Connection's recent Strava
 * activities and files any the webhook (#76) dropped during downtime or that
 * Strava retried-and-gave-up on. It reuses the same fetch path and idempotent
 * `(provider, externalId)` guard as manual sync and backfill.
 */

/**
 * How far before `lastSyncedAt` reconciliation reaches when fetching — shared
 * across providers by the generalized sweep (#205), re-exported here for this
 * provider's consumers.
 */
export { RECONCILE_OVERLAP_MS } from '#app/integrations/reconcile-sweep.server.ts'

/** The `kind` registered against the job queue for reconciliation jobs. */
export const STRAVA_RECONCILE_JOB_KIND = 'strava-reconcile'

export type StravaReconcileResult =
	| { ok: true; created: number; skipped: number }
	| { ok: false; reason: 'not-connected' | 'inactive' }

export async function runStravaReconciliation(
	athleteId: string,
): Promise<StravaReconcileResult> {
	const connection = await prisma.accountConnection.findUnique({
		where: { athleteId_provider: { athleteId, provider: STRAVA_PROVIDER } },
	})
	if (!connection) return { ok: false, reason: 'not-connected' }
	if (connection.status !== 'active') return { ok: false, reason: 'inactive' }

	const since = connection.lastSyncedAt ?? connection.connectedAt
	const after = Math.floor((since.getTime() - RECONCILE_OVERLAP_MS) / 1000)

	const timezone =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId: athleteId },
				select: { timezone: true },
			})
		)?.timezone ?? 'UTC'

	const activities = await fetchStravaActivitiesAfter(connection, after)
	const { created, skipped, latestActivityAt } =
		await fileActivitiesWithAutoMatch(athleteId, activities, timezone)

	// Advance the watermark forward-only: the 48h overlap reaches back before
	// `lastSyncedAt`, so a sweep that only finds older activities must not pull it
	// backward. No activities at all leaves it untouched.
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
