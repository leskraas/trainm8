/**
 * A sliding-window rate limiter for Strava's per-app budget (600 requests /
 * 15 min — ADR 0013). `acquire()` resolves immediately while the window has
 * room and otherwise waits until the oldest request ages out, so throttling
 * delays calls rather than dropping them (#74).
 *
 * It is intentionally not concurrency-safe: the job worker runs single-threaded
 * and fetches pages sequentially, so calls into a limiter are serialised. The
 * single-worker design is what makes *concurrent* backfills queue behind one
 * another rather than hammering the budget all at once.
 */

/** Injectable time source so tests can advance virtual time without waiting. */
export type Clock = {
	now: () => number
	sleep: (ms: number) => Promise<void>
}

const realClock: Clock = {
	now: () => Date.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export type RateLimiter = { acquire: () => Promise<void> }

export function createRateLimiter({
	limit,
	windowMs,
	clock = realClock,
}: {
	limit: number
	windowMs: number
	clock?: Clock
}): RateLimiter {
	// Timestamps of requests still inside the current window, oldest first.
	const hits: number[] = []

	async function acquire(): Promise<void> {
		for (;;) {
			const now = clock.now()
			const cutoff = now - windowMs
			while (hits.length > 0 && hits[0]! <= cutoff) hits.shift()

			if (hits.length < limit) {
				hits.push(now)
				return
			}

			// Wait just long enough for the oldest in-window request to expire.
			const waitMs = hits[0]! + windowMs - now
			await clock.sleep(Math.max(waitMs, 1))
		}
	}

	return { acquire }
}

/** Strava's documented per-app limit: 600 requests per 15-minute window. */
export const STRAVA_RATE_LIMIT = { limit: 600, windowMs: 15 * 60 * 1000 } as const
