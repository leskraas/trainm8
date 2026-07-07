import { INTERVALSICU_RECONCILE_JOB_KIND } from '#app/integrations/intervalsicu/reconcile.server.ts'
import { STRAVA_RECONCILE_JOB_KIND } from '#app/integrations/strava/reconcile.server.ts'
import { type Provider } from '#app/utils/account-connection.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'

/**
 * The generalized daily reconciliation sweep (#205, ADR 0013) — the first
 * cross-provider extraction, justified by two real consumers (Strava #77 and
 * Intervals.icu #205). One sweep enumerates every *active* Account Connection
 * and dispatches that provider's own reconcile job kind; each provider keeps
 * its reconcile logic private to its folder (ADR 0014). Providers with no
 * reconcile path yet are honestly skipped rather than guessed at.
 */

/**
 * How far before `lastSyncedAt` a reconciliation reaches when fetching. The
 * overlap catches late edits and events that landed just before the watermark
 * advanced but were never recorded. Shared by every provider's reconcile.
 */
export const RECONCILE_OVERLAP_MS = 48 * 60 * 60 * 1000

/** Default reconciliation cadence — daily (ADR 0013; a tuning knob). */
const DEFAULT_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Which job kind reconciles a provider's connections. A provider missing here
 * simply isn't swept (no reconcile path has landed for it yet). A function
 * rather than an eagerly-built map: the provider modules import
 * `RECONCILE_OVERLAP_MS` back from this module, and deferring the constant
 * reads keeps that (benign) cycle from capturing uninitialized bindings.
 */
function reconcileJobKindFor(provider: Provider | string): string | null {
	switch (provider) {
		case 'strava':
			return STRAVA_RECONCILE_JOB_KIND
		case 'intervalsicu':
			return INTERVALSICU_RECONCILE_JOB_KIND
		default:
			return null
	}
}

/**
 * The daily sweep dispatcher. Enqueues one reconciliation job per *active*
 * Account Connection — non-active connections (`revoked`, `error`, `expired`)
 * are deliberately not polled. Each job is processed out of band by the single
 * worker, so a fleet-wide sweep queues behind itself rather than hammering any
 * provider's rate budget all at once.
 */
export async function enqueueReconciliationJobs(): Promise<{
	enqueued: number
}> {
	const connections = await prisma.accountConnection.findMany({
		where: { status: 'active' },
		select: { athleteId: true, provider: true },
	})

	let enqueued = 0
	for (const { athleteId, provider } of connections) {
		const kind = reconcileJobKindFor(provider)
		if (!kind) continue
		await enqueueJob({ kind, payload: { athleteId } })
		enqueued++
	}

	return { enqueued }
}

/**
 * Start the daily reconciliation sweep (#77, #205, ADR 0013). Mirrors the job
 * worker: a single `unref`'d interval so it never keeps the process alive,
 * returning a stop function for graceful shutdown. Each tick enqueues one job
 * per active connection; the single worker drains them within the rate budget.
 * The first sweep runs after one interval, not on boot, so frequent restarts
 * don't trigger repeated fleet-wide polls.
 *
 * In-process scheduling is the minimum-viable shape for a single-process
 * deploy; BullMQ repeatable jobs or Fly Machines schedules remain the
 * documented escape hatch if cadence or fan-out ever outgrows it.
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
