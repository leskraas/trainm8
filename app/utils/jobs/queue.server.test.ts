import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	claimNextJob,
	completeJob,
	DeferJob,
	enqueueJob,
	failJob,
	processNextJob,
	rethrowDeferral,
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

test('rethrowDeferral passes a deferral on and lets any other error be swallowed', () => {
	const deferral = new DeferJob(new Date(), 'Strava read budget spent')

	expect(() => rethrowDeferral(deferral)).toThrow(deferral)
	expect(() => rethrowDeferral(new Error('one activity failed'))).not.toThrow()
	expect(() => rethrowDeferral('not even an error')).not.toThrow()
})

test('a job with no registered handler fails rather than spinning', async () => {
	const enqueued = await enqueueJob({ kind: 'mystery-kind', maxAttempts: 1 })

	await processNextJob({})

	const row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('failed')
	expect(row.lastError).toMatch(/handler/i)
})
