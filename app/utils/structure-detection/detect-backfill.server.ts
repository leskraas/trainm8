import { prisma } from '../db.server.ts'
import { enqueueJob } from '../jobs/queue.server.ts'
import {
	runStructureDetection,
	STRUCTURE_DETECTION_ENGINE_VERSION,
} from './detect-job.server.ts'
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
 * the TCX stream heal (ADR 0036): server boot enqueues the job — but re-keyed on
 * the engine version (#357), so a bump re-enqueues rather than a strict one-shot.
 * The job row (per version) is the "already ran" marker, persisted across
 * restarts and retried with backoff for free.
 */
export const STRUCTURE_DETECTION_BACKFILL_JOB_KIND =
	'structure-detection-backfill'

/**
 * Enqueue the Structure Detection backfill if it has never been enqueued for the
 * current engine version. Re-keyed on `STRUCTURE_DETECTION_ENGINE_VERSION` (#357):
 * a version bump — an `analyze` change that alters stored structures — re-enqueues
 * a fresh backfill so already-detected history is re-detected under the new engine,
 * not just new imports. Within one version it stays one-shot: any existing job for
 * that version (pending, running, completed, or dead-lettered) blocks a duplicate.
 * The version rides in the job payload; older jobs (pre-#357, payload `{}`) carry
 * no version, so a v2 boot correctly sees none and enqueues the re-detection pass.
 */
export async function ensureStructureDetectionBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findMany({
		where: { kind: STRUCTURE_DETECTION_BACKFILL_JOB_KIND },
		select: { payload: true },
	})
	const alreadyForVersion = existing.some((job) => {
		try {
			const parsed = JSON.parse(job.payload) as { engineVersion?: unknown }
			return parsed.engineVersion === STRUCTURE_DETECTION_ENGINE_VERSION
		} catch {
			return false
		}
	})
	if (alreadyForVersion) return
	await enqueueJob({
		kind: STRUCTURE_DETECTION_BACKFILL_JOB_KIND,
		payload: { engineVersion: STRUCTURE_DETECTION_ENGINE_VERSION },
	})
}

/**
 * Run structure detection over every existing run/bike Activity Import that
 * carries a stream and is not yet detected under the current engine. Each import
 * is handed to the shared `runStructureDetection` handler, so a structured
 * historical import gains (or refreshes) a `WorkoutDetection` and — when it is
 * already promoted to a recording-only session — a materialized `detected`
 * structure, while a steady one gains neither (the honesty gate, ADR 0033).
 *
 * The query picks up imports with no detection **or** a detection stamped with a
 * stale `engineVersion` (#357): a version bump re-detects existing history under
 * the improved `analyze` pipeline, where the original one-shot only saw new
 * imports. The shared handler enforces the guards — it replaces a `detected`
 * session's Workout, clears a below-gate re-detect, and never touches an adopted
 * `authored` session or a frozen non-`detected` Recording (ADR 0012/0033).
 *
 * One import's failure never aborts the rest (mirroring the TCX stream heal): a
 * genuine DB error on a single import is swallowed so the batch drains, and any
 * import it missed simply keeps its stale/absent detection for the next backfill —
 * never a half-run job that dead-letters mid-history and re-detects the earlier
 * imports on every retry.
 */
export async function runStructureDetectionBackfill(): Promise<void> {
	const imports = await prisma.activityImport.findMany({
		where: {
			discipline: { in: [...DETECTION_DISCIPLINES] },
			stream: { isNot: null },
			OR: [
				{ detection: { is: null } },
				{
					detection: {
						engineVersion: { not: STRUCTURE_DETECTION_ENGINE_VERSION },
					},
				},
			],
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
