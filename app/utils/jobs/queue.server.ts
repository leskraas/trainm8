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

/**
 * Thrown by a handler that can't make progress until a known time, such as a
 * provider's spent read budget. The job goes back to `pending` at `until`
 * without spending an attempt, so the single worker is free for other jobs in
 * the meantime (#637). A job older than `DEFERRAL_CAP_MS` spends its attempts
 * like a failure, so one that keeps deferring dead-letters (#638).
 */
export class DeferJob extends Error {
	// A plain field, not a parameter property: the server runs this file
	// through Node's type stripping, which can't rewrite one.
	readonly until: Date

	constructor(until: Date, message: string) {
		super(message)
		this.name = 'DeferJob'
		this.until = until
	}
}

/**
 * For a best-effort `catch` that swallows what it catches: pass a deferral on
 * to the queue, so a spent budget pauses the job instead of skipping the rest
 * of its work.
 */
export function rethrowDeferral(err: unknown): void {
	if (err instanceof DeferJob) throw err
}

/** A handler runs one job kind. It receives the job's parsed JSON payload. */
export type JobHandler = (payload: Record<string, unknown>) => Promise<void>

/** Maps a job `kind` to the handler that runs it. */
export type JobHandlers = Record<string, JobHandler>

/**
 * Claim the next runnable job and run its registered handler. On success the job
 * is completed; a throwing handler (or a missing handler) fails the job, which
 * either reschedules it with backoff or dead-letters it once attempts are spent.
 * A handler that throws `DeferJob` is rescheduled to its time instead (and,
 * past the deferral cap, spends its attempt).
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
		if (error instanceof DeferJob) await deferJob(job.id, error)
		else await failJob(job.id, error)
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

/** How long a job may keep deferring before its deferrals count as attempts. */
export const DEFERRAL_CAP_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Put a deferred job back to `pending` at the time it asked for. The claim
 * counted an attempt; a deferral is not a failure, so it is given back — until
 * the job is older than the cap. From then on it keeps the attempt, and once
 * they are spent the job is terminally `failed`.
 */
async function deferJob(id: string, deferral: DeferJob): Promise<void> {
	const job = await prisma.job.findUniqueOrThrow({ where: { id } })
	const capped = Date.now() - job.createdAt.getTime() > DEFERRAL_CAP_MS
	if (capped && job.attempts >= job.maxAttempts) {
		await prisma.job.update({
			where: { id },
			data: { status: 'failed', lastError: deferral.message },
		})
		return
	}
	await prisma.job.update({
		where: { id },
		data: {
			status: 'pending',
			lastError: deferral.message,
			runAt: deferral.until,
			...(capped ? {} : { attempts: { decrement: 1 } }),
		},
	})
}
