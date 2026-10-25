import { expect, test } from 'vitest'
import { DeferJob } from '#app/utils/jobs/queue.server.ts'
import {
	createRateLimiter,
	STRAVA_RATE_LIMIT,
	type Clock,
} from './rate-limit.ts'

/** A deterministic clock: `sleep` simply advances virtual time, never waits. */
function fakeClock(): Clock & { ms: number } {
	const clock = {
		ms: 0,
		now() {
			return clock.ms
		},
		async sleep(ms: number) {
			clock.ms += ms
		},
	}
	return clock
}

const MIN_15 = 15 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

/** Acquire as the job queue would: a deferral to the next quarter-hour runs
 * the job again then. */
async function acquireAsTheQueueRetries(
	limiter: ReturnType<typeof createRateLimiter>,
	clock: Clock & { ms: number },
	lane: 'live' | 'bulk' = 'bulk',
) {
	for (;;) {
		try {
			return await limiter.acquire(lane)
		} catch (e) {
			if (!(e instanceof DeferJob) || e.until.getTime() - clock.ms > MIN_15)
				throw e
			clock.ms = e.until.getTime()
		}
	}
}

function response(status: number, headers: Record<string, string> = {}) {
	return new Response(null, { status, headers })
}

test('acquisitions under the limit resolve without waiting', async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({
		windows: [{ limit: 3, windowMs: 1000 }],
		clock,
	})

	await limiter.acquire()
	await limiter.acquire()
	await limiter.acquire()

	// No virtual time passed: nothing had to wait.
	expect(clock.ms).toBe(0)
})

test('throttles past the limit but drops nothing: the job runs again at the reset', async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({
		windows: [{ limit: 2, windowMs: 1000 }],
		clock,
	})

	let completed = 0
	// Five acquisitions through a budget of 2 per 1000 ms window.
	for (let i = 0; i < 5; i++) {
		await acquireAsTheQueueRetries(limiter, clock, 'live')
		completed++
	}

	// All five eventually proceed — throttling delays, never drops.
	expect(completed).toBe(5)
	// The 3rd–5th waited for the window to roll, as deferred jobs.
	expect(clock.ms).toBe(2000)
})

test('a live request facing a full quarter-hour defers instead of sleeping', async () => {
	const clock = fakeClock()
	clock.ms = 5 * 60 * 1000
	const limiter = createRateLimiter({ ...STRAVA_RATE_LIMIT, clock })

	for (let i = 0; i < 100; i++) await limiter.acquire('live')

	// Sleeping would hold the single worker (a webhook job) or the request (the
	// OAuth callback) for up to ten minutes; the caller is told when instead.
	const deferred = await limiter.acquire('live').catch((e: unknown) => e)
	expect(deferred).toBeInstanceOf(DeferJob)
	expect((deferred as DeferJob).until.getTime()).toBe(MIN_15)
	expect(clock.ms).toBe(5 * 60 * 1000)
})

test('on the test seam, a wait of up to a quarter-hour is slept instead', async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({
		...STRAVA_RATE_LIMIT,
		clock,
		maySleep: true,
	})

	for (let i = 0; i < 81; i++) await limiter.acquire('bulk')

	expect(clock.ms).toBe(MIN_15)
})

// ── Strava's read budget (#637) ─────────────────────────────────────────────

test("Strava's limits are its read limits: 100 per 15 min and 1,000 per day", () => {
	expect(STRAVA_RATE_LIMIT.windows).toEqual([
		{ limit: 100, windowMs: MIN_15 },
		{ limit: 1000, windowMs: DAY },
	])
})

test('bulk work stops short of the limit, leaving a margin live webhooks still get', async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({ ...STRAVA_RATE_LIMIT, clock })

	for (let i = 0; i < 80; i++) await limiter.acquire('bulk')
	expect(clock.ms).toBe(0)

	// The bulk share is spent, but a live request goes straight through.
	await limiter.acquire('live')
	expect(clock.ms).toBe(0)

	// The next bulk request is handed back to the queue for the next
	// quarter-hour rather than holding the single worker while it waits.
	const deferred = await limiter.acquire('bulk').catch((e: unknown) => e)
	expect(deferred).toBeInstanceOf(DeferJob)
	expect((deferred as DeferJob).until.getTime()).toBe(MIN_15)
	expect(clock.ms).toBe(0)
})

test('a spent daily cap defers the job to midnight UTC instead of holding the worker', async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({ ...STRAVA_RATE_LIMIT, clock })

	// 800 is the daily bulk share. Each quarter-hour's deferral is the queue
	// running the job again at the time it asked for.
	for (let i = 0; i < 800; i++) await acquireAsTheQueueRetries(limiter, clock)
	const spentAt = clock.ms
	expect(spentAt).toBeLessThan(DAY)

	// Waiting would hold the single job worker for hours; the job is handed
	// back to the queue to run at midnight UTC instead.
	const deferred = await limiter.acquire('bulk').catch((e: unknown) => e)
	expect(deferred).toBeInstanceOf(DeferJob)
	expect((deferred as DeferJob).until.getTime()).toBe(DAY)
	expect(clock.ms).toBe(spentAt)
})

test("Strava's rate-limit headers are followed over the assumed figures", async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({ ...STRAVA_RATE_LIMIT, clock })

	// Strava reports a smaller limit and usage this process never saw (another
	// process, or a restart): 40 of 50 in this quarter-hour.
	await limiter.run('bulk', async () =>
		response(200, {
			'X-ReadRateLimit-Limit': '50,1000',
			'X-ReadRateLimit-Usage': '40,40',
		}),
	)

	// Bulk gets 80% of 50 = 40, already spent: the next bulk call is deferred
	// to the next quarter-hour.
	const deferred = await limiter.acquire('bulk').catch((e: unknown) => e)
	expect((deferred as DeferJob).until.getTime()).toBe(MIN_15)
})

test("Strava's overall headers never raise the read ceilings", async () => {
	const clock = fakeClock()
	const limiter = createRateLimiter({ ...STRAVA_RATE_LIMIT, clock })

	// Only the overall (reads + uploads) figures, which are looser than reads.
	await limiter.run('bulk', async () =>
		response(200, {
			'X-RateLimit-Limit': '200,2000',
			'X-RateLimit-Usage': '1,1',
		}),
	)

	// The bulk share stays 80% of the read limit 100: 79 more, then deferral.
	for (let i = 0; i < 79; i++) await limiter.acquire('bulk')
	await expect(limiter.acquire('bulk')).rejects.toThrow(DeferJob)
})

test('a 429 marks the quarter-hour spent and defers to the next one', async () => {
	const clock = fakeClock()
	clock.ms = 5 * 60 * 1000
	const limiter = createRateLimiter({ ...STRAVA_RATE_LIMIT, clock })

	let requests = 0
	const deferred = await limiter
		.run('live', async () => {
			requests++
			return response(429)
		})
		.catch((e: unknown) => e)

	expect(deferred).toBeInstanceOf(DeferJob)
	expect((deferred as DeferJob).until.getTime()).toBe(MIN_15)
	expect(requests).toBe(1)
	expect(clock.ms).toBe(5 * 60 * 1000)
})

test('a 429 that reports the daily budget spent defers the job to midnight UTC', async () => {
	const clock = fakeClock()
	clock.ms = 5 * 60 * 1000
	const limiter = createRateLimiter({ ...STRAVA_RATE_LIMIT, clock })

	const responses = [
		response(429, {
			'X-ReadRateLimit-Limit': '100,1000',
			'X-ReadRateLimit-Usage': '30,1000',
		}),
		response(200),
	]
	const deferred = await limiter
		.run('live', async () => responses.shift()!)
		.catch((e: unknown) => e)

	expect(deferred).toBeInstanceOf(DeferJob)
	expect((deferred as DeferJob).until.getTime()).toBe(DAY)
})
