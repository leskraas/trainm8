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
 * the meantime (#637). `progressed` says the run settled some of its work
 * before the budget ran out; only `markProgressed()` sets it, since the
 * deferral is thrown deep down (the rate limiter) and only the callers it
 * passes through on the way up know what the run settled. A job older than `DEFERRAL_CAP_MS` whose deferral
 * made no progress spends its attempts like a failure, so one that keeps
 * deferring without getting anywhere dead-letters (#638), while a long heal
 * that reads a day's budget at a time runs to the end.
 */
export class DeferJob extends Error {
	// Plain fields, not parameter properties: the server runs this file
	// through Node's type stripping, which can't rewrite one.
	readonly until: Date
	#progressed = false

	constructor(until: Date, message: string) {
		super(message)
		this.name = 'DeferJob'
		this.until = until
	}

	get progressed(): boolean {
		return this.#progressed
	}

	/**
	 * Record that the run settled work before this deferral reached it. Marks
	 * this same error, so a subclass a request path catches by name (such as
	 * `StravaRateLimitedError`) stays what it was. Progress is never unmarked.
	 */
	markProgressed(): this {
		this.#progressed = true
		return this
	}
}

/** What `bestEffort` hands back: the value, or the error it swallowed. */
export type BestEffortResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: unknown }

/**
 * Run a best-effort step, one that must not abort the work around it: an
 * error comes back as `{ ok: false, error }` for the caller to narrow, log or
 * ignore. A deferral is the exception, passed on to the queue, so a spent
 * budget pauses the job instead of skipping the rest of its work.
 * `progressed` marks the deferral when the caller settled work before this
 * step; progress a deeper call already recorded is kept.
 */
export async function bestEffort<T>(
	step: () => Promise<T>,
	{ progressed = false }: { progressed?: boolean } = {},
): Promise<BestEffortResult<T>> {
	try {
		return { ok: true, value: await step() }
	} catch (error) {
		if (error instanceof DeferJob) {
			if (progressed) error.markProgressed()
			throw error
		}
		return { ok: false, error }
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
 * A handler that throws `DeferJob` is rescheduled to its time instead (and,
 * past the deferral cap with no progress made, spends its attempt).
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

/**
 * How long a job may keep deferring before a deferral that made no progress
 * counts as an attempt.
 */
export const DEFERRAL_CAP_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Put a deferred job back to `pending` at the time it asked for. The claim
 * counted an attempt; a deferral is not a failure, so it is given back — until
 * the job is older than the cap and the run made no progress. Such a deferral
 * keeps the attempt, and once they are spent the job is terminally `failed`.
 * A run that made progress always gets its attempt back: its work is finite,
 * so it can't defer forever.
 */
async function deferJob(id: string, deferral: DeferJob): Promise<void> {
	const job = await prisma.job.findUniqueOrThrow({ where: { id } })
	const capped =
		!deferral.progressed &&
		Date.now() - job.createdAt.getTime() > DEFERRAL_CAP_MS
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
