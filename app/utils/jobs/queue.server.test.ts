import { expect, onTestFinished, test, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	bestEffort,
	claimNextJob,
	completeJob,
	DeferJob,
	enqueueJob,
	failJob,
	failStaleJobs,
	processNextJob,
} from './queue.server.ts'

test('enqueued job can be claimed once', async () => {
	await enqueueJob({ kind: 'strava-backfill', payload: { athleteId: 'a1' } })

	const claimed = await claimNextJob()

	expect(claimed).not.toBeNull()
	expect(claimed!.kind).toBe('strava-backfill')
	expect(claimed!.payload).toEqual({ athleteId: 'a1' })
})

test('a claimed job is not handed out a second time', async () => {
	await enqueueJob({ kind: 'strava-backfill' })

	const first = await claimNextJob()
	const second = await claimNextJob()

	expect(first).not.toBeNull()
	expect(second).toBeNull()
})

test('completed job is terminal and never reclaimed', async () => {
	await enqueueJob({ kind: 'strava-backfill' })
	const job = await claimNextJob()

	await completeJob(job!.id)

	const reclaimed = await claimNextJob()
	expect(reclaimed).toBeNull()
	const row = await prisma.job.findUniqueOrThrow({ where: { id: job!.id } })
	expect(row.status).toBe('completed')
	expect(row.completedAt).not.toBeNull()
})

test('a failed job with attempts left is rescheduled into the future', async () => {
	await enqueueJob({ kind: 'strava-backfill', maxAttempts: 3 })
	const job = await claimNextJob()

	await failJob(job!.id, new Error('boom'))

	// Backoff pushes runAt out, so it is not immediately reclaimable.
	expect(await claimNextJob()).toBeNull()
	const row = await prisma.job.findUniqueOrThrow({ where: { id: job!.id } })
	expect(row.status).toBe('pending')
	expect(row.lastError).toBe('boom')
	expect(row.runAt.getTime()).toBeGreaterThan(Date.now())
})

test('a job that exhausts maxAttempts becomes terminally failed', async () => {
	await enqueueJob({ kind: 'strava-backfill', maxAttempts: 1 })
	const job = await claimNextJob() // attempts -> 1, equal to maxAttempts

	await failJob(job!.id, new Error('fatal'))

	const row = await prisma.job.findUniqueOrThrow({ where: { id: job!.id } })
	expect(row.status).toBe('failed')
	expect(row.lastError).toBe('fatal')
	// past runAt, but terminal status keeps it off the queue
	const reclaimed = await claimNextJob()
	expect(reclaimed).toBeNull()
})

test('processNextJob dispatches to the handler for the job kind and completes it', async () => {
	const seen: Array<Record<string, unknown>> = []
	const enqueued = await enqueueJob({
		kind: 'strava-backfill',
		payload: { athleteId: 'a1' },
	})

	const result = await processNextJob({
		'strava-backfill': async (payload: Record<string, unknown>) => {
			seen.push(payload)
		},
	})

	expect(result).toBe('processed')
	expect(seen).toEqual([{ athleteId: 'a1' }])
	const row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('completed')
})

test('processNextJob returns idle when nothing is runnable', async () => {
	expect(await processNextJob({})).toBe('idle')
})

test('a throwing handler fails the job for retry', async () => {
	const enqueued = await enqueueJob({ kind: 'strava-backfill', maxAttempts: 3 })

	const result = await processNextJob({
		'strava-backfill': async () => {
			throw new Error('handler exploded')
		},
	})

	expect(result).toBe('processed')
	const row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('pending')
	expect(row.lastError).toBe('handler exploded')
})

test('a handler that defers its job reschedules it without spending an attempt', async () => {
	const enqueued = await enqueueJob({ kind: 'strava-backfill', maxAttempts: 1 })
	const until = new Date(Date.now() + 60 * 60 * 1000)

	await processNextJob({
		'strava-backfill': async () => {
			throw new DeferJob(until, 'Strava read budget spent')
		},
	})

	const row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	// With maxAttempts 1 a failure would be terminal; a deferral is not one.
	expect(row.status).toBe('pending')
	expect(row.attempts).toBe(0)
	expect(row.runAt.getTime()).toBe(until.getTime())
	expect(row.lastError).toBe('Strava read budget spent')
})

test('a job deferred for more than 7 days spends its attempts and dead-letters', async () => {
	const enqueued = await enqueueJob({ kind: 'strava-backfill', maxAttempts: 2 })
	await prisma.job.update({
		where: { id: enqueued.id },
		data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
	})
	const until = new Date(Date.now() - 1000)
	const handlers = {
		'strava-backfill': async () => {
			throw new DeferJob(until, 'Strava read budget spent')
		},
	}

	// Past the cap a deferral keeps the attempt it was claimed with, but still
	// runs again at the time it asked for, not after a backoff.
	await processNextJob(handlers)
	let row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('pending')
	expect(row.attempts).toBe(1)
	expect(row.runAt.getTime()).toBe(until.getTime())

	// Once they are spent, the job is terminal like any failure.
	await processNextJob(handlers)
	row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('failed')
	expect(row.lastError).toBe('Strava read budget spent')
})

test('past the cap, a deferral that made progress still gives its attempt back', async () => {
	// A large heal that reads a day's budget, then defers, is doing its job:
	// counting from creation would dead-letter it with work left (#638).
	const enqueued = await enqueueJob({ kind: 'strava-backfill', maxAttempts: 1 })
	await prisma.job.update({
		where: { id: enqueued.id },
		data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
	})
	const until = new Date(Date.now() + 60 * 60 * 1000)

	await processNextJob({
		'strava-backfill': async () => {
			throw new DeferJob(until, 'Strava read budget spent').markProgressed()
		},
	})

	const row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('pending')
	expect(row.attempts).toBe(0)
	expect(row.runAt.getTime()).toBe(until.getTime())
})

test('bestEffort hands back the value, or the error it swallowed', async () => {
	expect(await bestEffort(async () => 42)).toEqual({ ok: true, value: 42 })

	const failure = new Error('one activity failed')
	const result = await bestEffort(async () => {
		throw failure
	})
	expect(result).toEqual({ ok: false, error: failure })
})

test('bestEffort passes a deferral on, marked when the caller did work', async () => {
	const deferral = new DeferJob(new Date(), 'Strava read budget spent')
	const defer = async () => {
		throw deferral
	}

	await expect(bestEffort(defer)).rejects.toBe(deferral)
	expect(deferral.progressed).toBe(false)

	// The same error, marked: a subclass a request path catches by name (a
	// Strava rate limit) must stay that subclass.
	await expect(bestEffort(defer, { progressed: true })).rejects.toBe(deferral)
	expect(deferral.progressed).toBe(true)

	// Progress recorded deeper down is never lost by a caller that did none.
	await expect(bestEffort(defer, { progressed: false })).rejects.toBe(deferral)
	expect(deferral.progressed).toBe(true)
})

test('a job with no registered handler fails rather than spinning', async () => {
	const enqueued = await enqueueJob({ kind: 'mystery-kind', maxAttempts: 1 })

	await processNextJob({})

	const row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('failed')
	expect(row.lastError).toMatch(/handler/i)
})

test('failStaleJobs fails only jobs of its kind running since before the given moment', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	onTestFinished(() => warn.mockRestore())
	const longAgo = new Date(Date.now() - 60 * 60 * 1000)
	const running = (kind: string, startedAt: Date, attempts = 1) =>
		enqueueJob({ kind, maxAttempts: 2 }).then((job) =>
			prisma.job.update({
				where: { id: job.id },
				data: { status: 'running', startedAt, attempts },
			}),
		)
	const stranded = await running('one-shot', longAgo)
	const spent = await running('one-shot', longAgo, 2)
	const live = await running('one-shot', new Date())
	const otherKind = await running('strava-backfill', longAgo)

	expect(
		await failStaleJobs({
			kind: 'one-shot',
			startedBefore: new Date(Date.now() - 10 * 60 * 1000),
		}),
	).toBe(2)

	const status = async (id: string) =>
		(await prisma.job.findUniqueOrThrow({ where: { id } })).status
	expect(await status(stranded.id)).toBe('pending')
	expect(await status(spent.id)).toBe('failed')
	expect(await status(live.id)).toBe('running')
	expect(await status(otherKind.id)).toBe('running')
})

test('failStaleJobs logs each job it fails, with its kind, id and new status', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	onTestFinished(() => warn.mockRestore())
	const stranded = await enqueueJob({ kind: 'one-shot', maxAttempts: 1 })
	await prisma.job.update({
		where: { id: stranded.id },
		data: {
			status: 'running',
			attempts: 1,
			startedAt: new Date(Date.now() - 60 * 60 * 1000),
		},
	})

	await failStaleJobs({ kind: 'one-shot', startedBefore: new Date() })

	expect(warn).toHaveBeenCalledWith('[jobs] failed a stale running job', {
		kind: 'one-shot',
		jobId: stranded.id,
		status: 'failed',
	})
})

test('failJob with a guard leaves a job that has moved on as it is', async () => {
	// failStaleJobs reads, then fails: a run that completes in between must stay
	// completed, not go back to pending.
	const job = await enqueueJob({ kind: 'one-shot', maxAttempts: 2 })
	await prisma.job.update({
		where: { id: job.id },
		data: { status: 'completed', attempts: 1, completedAt: new Date() },
	})

	await failJob(job.id, new Error('stale'), { status: 'running' })

	expect(
		await prisma.job.findUniqueOrThrow({ where: { id: job.id } }),
	).toMatchObject({ status: 'completed', lastError: null })
})
