import { prisma } from '#app/utils/db.server.ts'

/**
 * The **Load Recompute Notice** (CONTEXT.md): the one-time, athlete-visible
 * explanation for a correction that moved a **Load Snapshot** number the athlete
 * had already read.
 *
 * It exists because ADR 0008 forbids switching an athlete's numbers _silently_.
 * Where the athlete's own data has not changed there is nothing for them to opt
 * into — the old figure was simply wrong — so what is owed is an explanation
 * rather than an offer, and the correction applies itself.
 *
 * One-shot backfills are the only writers; the athlete acknowledging the notice
 * is the only other mutation.
 */

/**
 * The corrections the app has words for. A closed union rather than a bare
 * string: a `kind` with no written copy renders nothing (see the Dashboard
 * presenter), so adding a member here is a commitment to write that copy.
 */
export const LOAD_RECOMPUTE_KINDS = ['strength-left-the-triad'] as const

export type LoadRecomputeKind = (typeof LOAD_RECOMPUTE_KINDS)[number]

export type LoadRecomputeNoticeRecord = {
	kind: string
	/**
	 * The athlete's CTL on either side of the recompute, taken from the day the
	 * correction moved it *most* — not from today. A lifter whose gym block ended
	 * months ago has an unchanged current CTL and a visibly rewritten history
	 * chart, and it is the chart that needs explaining.
	 */
	ctlBefore: number
	ctlAfter: number
}

/**
 * Record that a recompute moved this athlete's numbers. Create-only on the
 * unique `(athlete, kind)`: a retry after a partial run must not overwrite the
 * first run's `ctlBefore` with the already-corrected value, which would silently
 * rewrite the notice into "nothing changed". Returns whether it wrote.
 */
export async function recordLoadRecomputeNotice(input: {
	athleteId: string
	kind: LoadRecomputeKind
	ctlBefore: number
	ctlAfter: number
}): Promise<boolean> {
	try {
		await prisma.loadRecomputeNotice.create({ data: input })
		return true
	} catch {
		// Already notified — the athlete has been told once, which is the whole
		// obligation.
		return false
	}
}

/** The athlete's outstanding notice for the Dashboard, or null. */
export async function getLoadRecomputeNotice(
	athleteId: string,
): Promise<LoadRecomputeNoticeRecord | null> {
	return prisma.loadRecomputeNotice.findFirst({
		where: { athleteId, dismissedAt: null },
		orderBy: { createdAt: 'desc' },
		select: { kind: true, ctlBefore: true, ctlAfter: true },
	})
}

/**
 * Dismiss one kind of notice. Scoped to the kind the athlete actually read —
 * dismissing every outstanding notice on one click would silence an explanation
 * they never saw, which is the one thing this mechanism exists to prevent.
 * Idempotent, so a double-submit is harmless.
 */
export async function dismissLoadRecomputeNotice(
	athleteId: string,
	kind: string,
	now: Date = new Date(),
): Promise<void> {
	await prisma.loadRecomputeNotice.updateMany({
		where: { athleteId, kind, dismissedAt: null },
		data: { dismissedAt: now },
	})
}
