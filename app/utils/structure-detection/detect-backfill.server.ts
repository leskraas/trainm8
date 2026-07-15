import { prisma } from '../db.server.ts'
import { enqueueJob } from '../jobs/queue.server.ts'
import { runStructureDetection } from './detect-job.server.ts'
import { DETECTION_DISCIPLINES } from './types.ts'

/**
 * One-shot Structure Detection reach-back (map #326, ADR 0032/0033): the forward
 * job (#342) only sees imports that arrive *after* it ships, so an athlete's
 * existing run/bike history stays structureless until this backfill walks it. It
 * is the batch driver, not a second engine — every import runs through the same
 * `runStructureDetection` detect → store → materialize path as a live import, so
 * the honesty gate, the Session Source writes, and the Planned-TSS carve-out all
 * behave identically to the forward path with no duplicated logic.
 *
 * Trigger mirrors the NP recompute (#174), the Intervals.icu telemetry heal, and
 * the TCX stream heal (ADR 0036): server boot enqueues the job exactly once — the
 * job row itself is the "already ran" marker, persisted across restarts and
 * retried with backoff for free.
 */
export const STRUCTURE_DETECTION_BACKFILL_JOB_KIND =
	'structure-detection-backfill'

/**
 * Enqueue the one-shot Structure Detection backfill if it has never been
 * enqueued. Any existing job of this kind — pending, running, completed, or
 * dead-lettered after exhausting retries — means boot does not enqueue another.
 */
export async function ensureStructureDetectionBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: STRUCTURE_DETECTION_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: STRUCTURE_DETECTION_BACKFILL_JOB_KIND })
}

/**
 * Run structure detection over every existing run/bike Activity Import that
 * carries a stream but has never been detected. Each import is handed to the
 * shared `runStructureDetection` handler, so a structured historical import
 * gains a `WorkoutDetection` and — when it is already promoted to a
 * recording-only session — a materialized `detected` structure, while a steady
 * one gains neither (the honesty gate, ADR 0033).
 *
 * The `detection: null` filter honours the lifecycle boundary (#343): an import
 * that already carries a `WorkoutDetection` — including a promoted Recording — is
 * left untouched, never re-detected.
 *
 * One import's failure never aborts the rest (mirroring the TCX stream heal): a
 * genuine DB error on a single import is swallowed so the batch drains, and any
 * import it missed is simply left with `detection: null` for the next backfill —
 * never a half-run job that dead-letters mid-history and re-detects the earlier
 * imports on every retry.
 */
export async function runStructureDetectionBackfill(): Promise<void> {
	const imports = await prisma.activityImport.findMany({
		where: {
			discipline: { in: [...DETECTION_DISCIPLINES] },
			stream: { isNot: null },
			detection: { is: null },
		},
		select: { id: true },
	})

	for (const imp of imports) {
		try {
			await runStructureDetection({ activityImportId: imp.id })
		} catch {
			// Best-effort: a single import's detection failure must not strand the
			// rest of an athlete's history. The import keeps `detection: null`.
		}
	}
}
