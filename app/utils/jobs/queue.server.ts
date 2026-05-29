import { type Job } from '@prisma/client'
import { prisma } from '#app/utils/db.server.ts'

/**
 * The in-process job queue (ADR 0013). A deliberately domain-agnostic primitive:
 * a `kind` selects a handler and an opaque JSON `payload` carries its arguments.
 * Backfill (#74) is the first kind; webhook-fetch (#76) and reconciliation-poll
 * (#77) reuse the same table and worker.
 */

/** A claimed job with its payload parsed from the stored JSON. */
export type ClaimedJob = Omit<Job, 'payload'> & {
	payload: Record<string, unknown>
}

/** Add a job to the queue. It becomes claimable immediately unless `runAt` is set. */
export async function enqueueJob({
	kind,
	payload = {},
	maxAttempts,
	runAt,
}: {
	kind: string
	payload?: Record<string, unknown>
	maxAttempts?: number
	runAt?: Date
}): Promise<Job> {
	return prisma.job.create({
		data: {
			kind,
			payload: JSON.stringify(payload),
			...(maxAttempts != null ? { maxAttempts } : {}),
			...(runAt != null ? { runAt } : {}),
		},
	})
}

/**
 * Atomically claim the oldest runnable pending job, moving it to `running`.
 * Returns `null` when nothing is runnable. The claim updates by id so two
 * concurrent workers can never take the same job.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
	const candidate = await prisma.job.findFirst({
		where: { status: 'pending', runAt: { lte: new Date() } },
		orderBy: { runAt: 'asc' },
	})
	if (!candidate) return null

	const { count } = await prisma.job.updateMany({
		where: { id: candidate.id, status: 'pending' },
		data: {
			status: 'running',
			startedAt: new Date(),
			attempts: { increment: 1 },
		},
	})
	if (count === 0) return claimNextJob()

	const claimed = await prisma.job.findUniqueOrThrow({
		where: { id: candidate.id },
	})
	return {
		...claimed,
		payload: JSON.parse(claimed.payload) as Record<string, unknown>,
	}
}

/** A handler runs one job kind. It receives the job's parsed JSON payload. */
export type JobHandler = (payload: Record<string, unknown>) => Promise<void>

/** Maps a job `kind` to the handler that runs it. */
export type JobHandlers = Record<string, JobHandler>

/**
 * Claim the next runnable job and run its registered handler. On success the job
 * is completed; a throwing handler (or a missing handler) fails the job, which
 * either reschedules it with backoff or dead-letters it once attempts are spent.
 * Returns `'idle'` when nothing was runnable so the worker loop can back off.
 */
export async function processNextJob(
	handlers: JobHandlers,
): Promise<'processed' | 'idle'> {
	const job = await claimNextJob()
	if (!job) return 'idle'

	try {
		const handler = handlers[job.kind]
		if (!handler) {
			throw new Error(`No handler registered for job kind "${job.kind}"`)
		}
		await handler(job.payload)
		await completeJob(job.id)
	} catch (error) {
		await failJob(job.id, error)
	}
	return 'processed'
}

/** Mark a successfully-run job `completed`. Terminal — it is never reclaimed. */
export async function completeJob(id: string): Promise<void> {
	await prisma.job.update({
		where: { id },
		data: { status: 'completed', completedAt: new Date(), lastError: null },
	})
}

/** Base unit for exponential backoff between retries. */
const BACKOFF_BASE_MS = 1000

/**
 * Record a failed run. If attempts remain the job returns to `pending` with
 * `runAt` pushed out by exponential backoff (`BACKOFF_BASE_MS * 2^attempts`);
 * once `maxAttempts` is reached the job is terminal (`failed`).
 */
export async function failJob(id: string, error: unknown): Promise<void> {
	const job = await prisma.job.findUniqueOrThrow({ where: { id } })
	const message = error instanceof Error ? error.message : String(error)

	if (job.attempts >= job.maxAttempts) {
		await prisma.job.update({
			where: { id },
			data: { status: 'failed', lastError: message },
		})
		return
	}

	const delayMs = BACKOFF_BASE_MS * 2 ** job.attempts
	await prisma.job.update({
		where: { id },
		data: {
			status: 'pending',
			lastError: message,
			runAt: new Date(Date.now() + delayMs),
		},
	})
}
