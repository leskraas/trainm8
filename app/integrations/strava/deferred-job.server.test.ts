import { http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob, processNextJob } from '#app/utils/jobs/queue.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { stravaApiGet } from './client.server.ts'
import { createRateLimiter } from './rate-limit.ts'

/**
 * A spent Strava budget pauses a job, and the queue finishes it once the
 * window resets (#637): end to end through the real client, limiter and
 * queue, on a moved system clock rather than a seam in the limiter.
 */

const MIN_15 = 15 * 60 * 1000

afterEach(() => {
	vi.useRealTimers()
})

test('a job deferred by a spent window is claimed again at its reset and completes', async () => {
	vi.useFakeTimers({ toFake: ['Date'] })
	const start = new Date('2026-10-24T17:05:00Z')
	vi.setSystemTime(start)
	// One read per quarter-hour, already spent.
	const limiter = createRateLimiter({
		windows: [{ limit: 1, windowMs: MIN_15 }],
	})
	await limiter.acquire('bulk')

	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(start.getTime() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	server.use(
		http.get('https://www.strava.com/api/v3/athlete', () =>
			HttpResponse.json({ id: 12345678 }),
		),
	)
	let reads = 0
	const handlers = {
		'strava-read': async () => {
			await stravaApiGet(connection, '/athlete', 'bulk', { limiter })
			reads++
		},
	}
	// Runnable on the moved clock: the database's own default is real time.
	const job = await enqueueJob({
		kind: 'strava-read',
		maxAttempts: 1,
		runAt: start,
	})

	// The window is spent: the job goes back to pending for its reset.
	await processNextJob(handlers)
	let row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
	expect(row.status).toBe('pending')
	expect(row.attempts).toBe(0)
	expect(row.runAt).toEqual(new Date('2026-10-24T17:15:00Z'))

	// Not before its time.
	expect(await processNextJob(handlers)).toBe('idle')

	vi.setSystemTime(row.runAt)
	await processNextJob(handlers)
	row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
	expect(row.status).toBe('completed')
	expect(reads).toBe(1)
})
