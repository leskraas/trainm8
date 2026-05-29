import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
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
 * How far before `lastSyncedAt` reconciliation reaches when fetching. The
 * overlap catches late edits and events that landed just before the watermark
 * advanced but were never recorded.
 */
export const RECONCILE_OVERLAP_MS = 48 * 60 * 60 * 1000

/** The `kind` registered against the job queue for reconciliation jobs. */
export const STRAVA_RECONCILE_JOB_KIND = 'strava-reconcile'

/** Default reconciliation cadence — daily (ADR 0013; a tuning knob). */
const DEFAULT_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * The daily sweep dispatcher (#77). Enqueues one reconciliation job per *active*
 * Strava Account Connection — non-active connections (`revoked`, `error`,
 * `expired`) are deliberately not polled. Each job is processed out of band by
 * the single worker, so a fleet-wide sweep queues behind itself rather than
 * hammering Strava's per-app rate budget all at once.
 */
export async function enqueueReconciliationJobs(): Promise<{
	enqueued: number
}> {
	const connections = await prisma.accountConnection.findMany({
		where: { provider: STRAVA_PROVIDER, status: 'active' },
		select: { athleteId: true },
	})

	for (const { athleteId } of connections) {
		await enqueueJob({
			kind: STRAVA_RECONCILE_JOB_KIND,
			payload: { athleteId },
		})
	}

	return { enqueued: connections.length }
}

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

/**
 * Start the daily reconciliation sweep (#77, ADR 0013). Mirrors the job worker:
 * a single `unref`'d interval so it never keeps the process alive, returning a
 * stop function for graceful shutdown. Each tick enqueues one job per active
 * connection; the single worker drains them within the rate budget. The first
 * sweep runs after one interval, not on boot, so frequent restarts don't trigger
 * repeated fleet-wide polls.
 *
 * In-process scheduling is the minimum-viable shape for a single-process deploy;
 * BullMQ repeatable jobs or Fly Machines schedules remain the documented escape
 * hatch if cadence or fan-out ever outgrows it.
 */
export function startReconciliationSchedule({
	intervalMs = DEFAULT_RECONCILE_INTERVAL_MS,
}: { intervalMs?: number } = {}): () => void {
	let running = false

	const timer = setInterval(() => {
		if (running) return
		running = true
		void enqueueReconciliationJobs()
			.catch((error) => {
				console.error('[reconciliation] sweep failed to enqueue', error)
			})
			.finally(() => {
				running = false
			})
	}, intervalMs)
	if (typeof timer.unref === 'function') timer.unref()

	return () => clearInterval(timer)
}
