import {
	type AccountErasure,
	ERASURE_TRANSACTION_OPTIONS,
	eraseOrphanedWorkouts,
} from './account-deletion.server.ts'
import { prisma } from './db.server.ts'
import { enqueueJob, failStaleJobs } from './jobs/queue.server.ts'

/**
 * One-time purge of the **Orphaned Workouts** every account deleted before #641
 * left stored (#468, ADR 0119). It runs `eraseOrphanedWorkouts`, the same rules
 * `deleteAccount` applies, so a row another athlete's training points at is kept
 * unattributed and every other one is erased.
 *
 * **Why a job and not a migration** (ADR 0119 §3): the rules exist once, in
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
 * When this process started. One node runs the job worker (LiteFS static
 * lease), and boot calls the ensure below, so a purge row `running` since before
 * this moment belongs to a process that has stopped: no live run is that old.
 * Read from the process's own clock origin, which is earlier than the worker's
 * start, so a purge this process's worker claimed is never taken for one.
 */
const PROCESS_STARTED_AT = new Date(performance.timeOrigin)

/**
 * Enqueue the one-time purge if it has never been enqueued. Any job of this
 * kind, in any state, means boot does not enqueue another.
 *
 * A purge left `running` by a machine that stopped mid-run (its transaction
 * rolled back) is failed first, so the queue retries it: otherwise its row
 * would block every later enqueue and the purge would never run. Stale means
 * started before this process did, however recently, so a quick restart after
 * a deploy retries it at once.
 */
export async function ensureOrphanedWorkoutPurgeEnqueued(): Promise<void> {
	await failStaleJobs({
		kind: ORPHANED_WORKOUT_PURGE_JOB_KIND,
		startedBefore: PROCESS_STARTED_AT,
	})
	const existing = await prisma.job.findFirst({
		where: { kind: ORPHANED_WORKOUT_PURGE_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: ORPHANED_WORKOUT_PURGE_JOB_KIND })
}

/**
 * Run the purge. `job` is the queue's row this run is (its id and the payload
 * it was claimed with); the record is written onto that row.
 *
 * The payload a run is claimed with carries the record of any earlier run
 * that committed, since the claim reads the row after that commit.
 */
export async function runOrphanedWorkoutPurge(job: {
	id: string
	payload: Record<string, unknown>
}): Promise<AccountErasure> {
	const erasure = await prisma
		.$transaction(async (tx) => {
			const erasure = await eraseOrphanedWorkouts(tx)
			if (isErasureRecord(job.payload.purged)) return erasure
			await tx.job.update({
				where: { id: job.id },
				data: { payload: JSON.stringify({ ...job.payload, purged: erasure }) },
			})
			return erasure
		}, ERASURE_TRANSACTION_OPTIONS)
		.catch((error: unknown) => {
			// The queue records the error on the row and logs nothing, and a spent
			// one-time job is never enqueued again: this line is how a failed purge
			// shows. The error's class and code only, never its message, which for
			// a Prisma validation error prints the query's arguments. The message
			// still reaches the row's `lastError` (the queue stores it) and Prisma's
			// own `prisma:error` output: there it can carry Workout ids, never a
			// title or name.
			console.error('[orphaned-workout-purge] attempt failed', {
				jobId: job.id,
				error: describeError(error),
			})
			throw error
		})
	// This run's counts: a later run keeps the first record on the row, but
	// logs what it did itself.
	console.info(
		`[orphaned-workout-purge] erased ${erasure.erased}, kept unattributed ${erasure.keptUnattributed}, spliced ${erasure.spliced}`,
	)
	return erasure
}

/** The record a committed run left: three counts, nothing else counts as one. */
function isErasureRecord(value: unknown): value is AccountErasure {
	if (!value || typeof value !== 'object') return false
	const record = value as Record<string, unknown>
	return (['erased', 'keptUnattributed', 'spliced'] as const).every(
		(key) => typeof record[key] === 'number',
	)
}

/** An error's class, and its code where it has one (a Prisma error's `P2…`). */
function describeError(error: unknown): string {
	if (!(error instanceof Error)) return typeof error
	const code = (error as { code?: unknown }).code
	return typeof code === 'string' ? `${error.name} ${code}` : error.name
}
