import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import {
	readCtlByDate,
	recordLoadRecomputeNotice,
} from './recompute-notice.server.ts'
import {
	type CtlMovement,
	type LoadRecomputeKind,
	widestCtlMovement,
} from './recompute-notice.ts'
import { recomputeLoadFrom } from './snapshot.server.ts'

/**
 * One-shot data correction for ADR 0046 §2: every stored LoadSnapshot was built
 * with strength `sRPE` summed into `tssTotal`, so a hybrid athlete's CTL, ATL
 * and TSB are inflated by a quantity that has no exchange rate with endurance
 * TSS. Existing rows must be recomputed for the curve to be self-consistent —
 * and the athlete's CTL will visibly **fall** to its true endurance value.
 *
 * **This is a one-time migration with a notice, not an offer.** ADR 0008's
 * posture — the system "offers to recompute historical LoadSnapshots with the
 * new formula but never auto-switches silently" — was written for a formula the
 * athlete chooses, where the old number was one honest reading and the new one
 * is a better one. This is not that case: nothing about the athlete's data
 * changed, so there is nothing to opt into. The old figure was wrong, and an
 * app that leaves a fabricated number standing until someone clicks a button
 * has only moved the responsibility. What ADR 0008's posture actually forbids is
 * the word *silently*, so the correction applies itself and explains itself: the
 * run writes a `LoadRecomputeNotice` naming the CTL it moved, which the Dashboard
 * renders until the athlete dismisses it.
 *
 * The trigger lives on the Job Queue (ADR 0013), the same mechanism the #174 NP
 * correction used: server boot enqueues the job exactly once — the job row itself
 * is the "already ran" marker, persisted across restarts and retried with backoff
 * for free — and the recompute flows through `recomputeLoadFrom`, the path every
 * TSS change already uses.
 */
export const STRENGTH_TSS_BACKFILL_JOB_KIND = 'strength-tss-backfill'

/** The `LoadRecomputeNotice.kind` this backfill writes. */
export const STRENGTH_LEFT_THE_TRIAD_NOTICE: LoadRecomputeKind =
	'strength-left-the-triad'

/**
 * The day the recompute moved CTL furthest down, or null when nothing moved
 * enough to be worth explaining: most often a lifter whose gym sessions carry
 * no RPE, who never had an `sRPE` contribution to lose.
 */
export function widestCtlDrop(
	before: Map<string, number>,
	after: Map<string, number>,
): CtlMovement | null {
	return widestCtlMovement(before, after, 'fall')
}

/**
 * Enqueue the one-shot strength recompute if it has never been enqueued. Any
 * existing job of this kind — pending, running, completed, or even dead-lettered
 * after exhausting retries — means boot does not enqueue another.
 */
export async function ensureStrengthTssBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: STRENGTH_TSS_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: STRENGTH_TSS_BACKFILL_JOB_KIND })
}

/**
 * Recompute stored load for every athlete with strength history, from their
 * earliest strength session forward. Recomputing from the earliest affected date
 * (not just the CTL window) is what makes the whole curve self-consistent — the
 * inflated CTL is an EWMA, so a stale anchor would carry the old number forward.
 *
 * Endurance-only athletes are untouched: their `tssTotal` never contained a
 * strength contribution, so there is nothing to correct and no reason to churn
 * their rows.
 */
export async function runStrengthTssBackfill(): Promise<void> {
	const [strengthSessions, strengthImports] = await Promise.all([
		prisma.workoutSession.findMany({
			where: {
				status: 'completed',
				OR: [
					{ workout: { discipline: 'strength' } },
					{ recording: { discipline: 'strength' } },
				],
			},
			select: { userId: true, scheduledAt: true },
		}),
		prisma.activityImport.findMany({
			where: { discipline: 'strength', promotedSessionId: { not: null } },
			select: { athleteId: true, startedAt: true },
		}),
	])

	const earliestByAthlete = new Map<string, Date>()
	const consider = (athleteId: string, at: Date) => {
		const current = earliestByAthlete.get(athleteId)
		if (!current || at < current) earliestByAthlete.set(athleteId, at)
	}
	for (const s of strengthSessions) consider(s.userId, s.scheduledAt)
	for (const imp of strengthImports) consider(imp.athleteId, imp.startedAt)

	for (const [athleteId, earliest] of earliestByAthlete) {
		const profile = await prisma.athleteProfile.findUnique({
			where: { userId: athleteId },
			select: { timezone: true },
		})
		// No Athlete Profile → no thresholds → recomputeLoadFrom is a no-op.
		if (!profile) continue

		const before = await readCtlByDate(athleteId)
		await recomputeLoadFrom(athleteId, localDate(earliest, profile.timezone))
		const movement = widestCtlDrop(before, await readCtlByDate(athleteId))

		// Nothing an athlete could read off a chart moved — most often a lifter
		// whose gym sessions carry no RPE, so they never had an `sRPE` contribution
		// to lose. Silence is correct: there is no drop to explain.
		if (!movement) continue

		await recordLoadRecomputeNotice({
			athleteId,
			kind: STRENGTH_LEFT_THE_TRIAD_NOTICE,
			...movement,
		})
	}
}
