import {
	type AccountErasure,
	ERASURE_TRANSACTION_OPTIONS,
	eraseOrphanedWorkouts,
} from './account-deletion.server.ts'
import { prisma } from './db.server.ts'
import { enqueueJob } from './jobs/queue.server.ts'

/**
 * One-time purge of the **Orphaned Workouts** every account deleted before #641
 * left stored (#468, ADR 0113). It runs `eraseOrphanedWorkouts`, the same rules
 * `deleteAccount` applies, so a row another athlete's training points at is kept
 * unattributed and every other one is erased.
 *
 * **Why a job and not a migration** (ADR 0113 §3): the rules exist once, in
 * tested TypeScript; a SQL copy of the lineage splice would drift from them.
 * Boot enqueues it exactly once, the job row is the marker, and the queue's
 * attempts are its retries.
 *
 * **Its own record.** The counts it erased, kept and spliced land on its own
 * row's `payload`, in the purge's transaction, so they commit with the rows they
 * describe or not at all. A run after one that committed (a crash before the
 * worker marked it done) finds nothing to erase and keeps the first record
 * rather than writing zeros over it. Counts only: never a title, description,
 * name or Workout id.
 */
export const ORPHANED_WORKOUT_PURGE_JOB_KIND = 'orphaned-workout-purge'

/**
 * Enqueue the one-time purge if it has never been enqueued. Any job of this
 * kind, in any state, means boot does not enqueue another.
 */
export async function ensureOrphanedWorkoutPurgeEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: ORPHANED_WORKOUT_PURGE_JOB_KIND })
}

export async function runOrphanedWorkoutPurge(): Promise<AccountErasure> {
	const record = await prisma.$transaction(async (tx) => {
		const erasure = await eraseOrphanedWorkouts(tx)
		// The job's own row. Boot enqueues exactly one of this kind, so the
		// running one is this run.
		const job = await tx.job.findFirst({
			where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND, status: 'running' },
			select: { id: true, payload: true },
		})
		if (!job) return erasure
		const payload = parsePayload(job.payload)
		if (isErasureRecord(payload.purged)) return payload.purged
		await tx.job.update({
			where: { id: job.id },
			data: { payload: JSON.stringify({ ...payload, purged: erasure }) },
		})
		return erasure
	}, ERASURE_TRANSACTION_OPTIONS)
	console.info(
		`[orphaned-workout-purge] erased ${record.erased}, kept unattributed ${record.keptUnattributed}, spliced ${record.spliced}`,
	)
	return record
}

/** The job row's payload as an object; `{}` when it is not one. */
function parsePayload(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw)
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {}
	} catch {
		return {}
	}
}

/** The record a committed run left: three counts, nothing else counts as one. */
function isErasureRecord(value: unknown): value is AccountErasure {
	if (!value || typeof value !== 'object') return false
	const record = value as Record<string, unknown>
	return (['erased', 'keptUnattributed', 'spliced'] as const).every(
		(key) => typeof record[key] === 'number',
	)
}
