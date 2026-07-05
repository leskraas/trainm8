import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { recomputeLoadFrom } from './snapshot.server.ts'

/**
 * One-shot data correction for #174: Coggan TSS used to receive average power
 * as if it were Normalized Power and labelled the result high confidence.
 * Existing rows must be recomputed so the Dashboard reflects corrected numbers:
 * rides backed by an Activity Stream power channel upgrade to true NP (still
 * high confidence), and stream-less average-power Coggan rows correct their
 * confidence to medium.
 *
 * The trigger lives on the Job Queue (ADR 0013): server boot enqueues the job
 * exactly once — the job row itself is the "already ran" marker, persisted
 * across restarts and retried with backoff for free — and the recompute flows
 * through the existing recompute-from-date path (`recomputeLoadFrom`), the same
 * mechanism every TSS change already uses. Smallest honest mechanism: no
 * schema migration, no bespoke script to remember to run, no per-boot rework.
 */
export const NP_TSS_BACKFILL_JOB_KIND = 'np-tss-backfill'

/**
 * Enqueue the one-shot NP recompute if it has never been enqueued. Any existing
 * job of this kind — pending, running, completed, or even dead-lettered after
 * exhausting retries — means boot does not enqueue another.
 */
export async function ensureNpTssBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: NP_TSS_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: NP_TSS_BACKFILL_JOB_KIND })
}

/**
 * Recompute stored TSS for every athlete with rows the NP change affects,
 * from their earliest affected date forward. Affected rows are:
 *
 *  (a) Activity Imports whose stream carries a power channel — their Coggan
 *      TSS can now upgrade to true Normalized Power; and
 *  (b) rows whose stored provenance is `coggan` — computed from average power
 *      under the old rule, so at minimum their confidence corrects to medium.
 *
 * Recomputing from the earliest affected date (not just the CTL window)
 * corrects the per-session TSS the Session Ledger displays for all history,
 * not only today's CTL/ATL/TSB.
 */
export async function runNpTssBackfill(): Promise<void> {
	const [affectedImports, affectedSessions] = await Promise.all([
		prisma.activityImport.findMany({
			where: {
				OR: [{ stream: { power: { not: null } } }, { tssFormula: 'coggan' }],
			},
			select: { athleteId: true, startedAt: true },
		}),
		prisma.workoutSession.findMany({
			where: { tssFormula: 'coggan' },
			select: { userId: true, scheduledAt: true },
		}),
	])

	const earliestByAthlete = new Map<string, Date>()
	const consider = (athleteId: string, at: Date) => {
		const current = earliestByAthlete.get(athleteId)
		if (!current || at < current) earliestByAthlete.set(athleteId, at)
	}
	for (const imp of affectedImports) consider(imp.athleteId, imp.startedAt)
	for (const s of affectedSessions) consider(s.userId, s.scheduledAt)

	for (const [athleteId, earliest] of earliestByAthlete) {
		const profile = await prisma.athleteProfile.findUnique({
			where: { userId: athleteId },
			select: { timezone: true },
		})
		// No Athlete Profile → no thresholds → recomputeLoadFrom is a no-op.
		if (!profile) continue
		await recomputeLoadFrom(athleteId, localDate(earliest, profile.timezone))
	}
}
