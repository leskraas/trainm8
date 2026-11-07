import { prisma } from '#app/utils/db.server.ts'
import {
	type CtlForKind,
	type LoadRecomputeKind,
	type LoadRecomputeNoticeRecord,
} from './recompute-notice.ts'

/**
 * The **Load Recompute Notice** (GLOSSARY.md): the one-time, athlete-visible
 * explanation for a correction that moved a number the athlete had already
 * read: a **Load Snapshot** number, or one a session prescribes (ADR 0112).
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
 * Record that a recompute moved this athlete's numbers. `ctl` is typed by what
 * the kind declares it moved: a load kind passes its movement or `null`, a
 * prescription kind only `null` (ADR 0112 §3).
 *
 * Create-only on the unique `(athlete, kind)`: a retry after a partial run must
 * not overwrite the first run's `ctlBefore` with the already-corrected value,
 * which would silently rewrite the notice into "nothing changed", nor give an
 * absent pair one. Returns whether it wrote.
 */
export async function recordLoadRecomputeNotice<K extends LoadRecomputeKind>({
	athleteId,
	kind,
	ctl,
}: {
	athleteId: string
	kind: K
	ctl: CtlForKind<K>
}): Promise<boolean> {
	try {
		await prisma.loadRecomputeNotice.create({
			data: {
				athleteId,
				kind,
				ctlBefore: ctl?.ctlBefore ?? null,
				ctlAfter: ctl?.ctlAfter ?? null,
			},
		})
		return true
	} catch {
		// Already notified — the athlete has been told once, which is the whole
		// obligation.
		return false
	}
}

/**
 * The athlete's stored CTL by date: a recompute reads it on either side to find
 * the movement it caused (`widestCtlMovement`).
 */
export async function readCtlByDate(
	athleteId: string,
): Promise<Map<string, number>> {
	const rows = await prisma.loadSnapshot.findMany({
		where: { athleteId },
		select: { date: true, ctl: true },
	})
	return new Map(rows.map((r) => [r.date, r.ctl]))
}

/**
 * The athlete's outstanding notice for the Dashboard, or null. The one read
 * seam: it folds the two columns into one `ctl` value, so no caller handles two
 * nullable numbers.
 */
export async function getLoadRecomputeNotice(
	athleteId: string,
): Promise<LoadRecomputeNoticeRecord | null> {
	const row = await prisma.loadRecomputeNotice.findFirst({
		where: { athleteId, dismissedAt: null },
		orderBy: { createdAt: 'desc' },
		select: { kind: true, ctlBefore: true, ctlAfter: true },
	})
	if (!row) return null
	// The CHECK keeps the two columns both-or-neither; reading either as null
	// as "no pair" keeps a half pair from ever printing a number.
	const { kind, ctlBefore, ctlAfter } = row
	return {
		kind,
		ctl: ctlBefore == null || ctlAfter == null ? null : { ctlBefore, ctlAfter },
	}
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
