import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	claimNextJob,
	completeJob,
	enqueueJob,
	failJob,
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

test('a job with no registered handler fails rather than spinning', async () => {
	const enqueued = await enqueueJob({ kind: 'mystery-kind', maxAttempts: 1 })

	await processNextJob({})

	const row = await prisma.job.findUniqueOrThrow({ where: { id: enqueued.id } })
	expect(row.status).toBe('failed')
	expect(row.lastError).toMatch(/handler/i)
})
