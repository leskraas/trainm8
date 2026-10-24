/**
 * A rate limiter for Strava's per-app read budget (100 requests / 15 min and
 * 1,000 / day — ADR 0013). `acquire()` resolves immediately while every window
 * has room and otherwise waits until the full window resets, so throttling
 * delays calls rather than dropping them (#74).
 *
 * Windows are fixed, as Strava counts them (#637): the 15-minute ones reset at
 * :00, :15, :30 and :45, the day at midnight UTC — both whole multiples of their
 * length since the Unix epoch. A `bulk` request (sync, backfill, reconcile) may
 * use only part of each window, keeping `liveReserve` of it for `live` webhook
 * fetches, so a backfill can't starve them. `run()` also reads Strava's
 * rate-limit headers, so its figures follow Strava's rather than ours, and
 * backs a `429` off until the next window instead of failing.
 *
 * A wait longer than the shortest window (a spent day) would hold the single
 * job worker for hours, so instead of sleeping the limiter throws `DeferJob`
 * and the queue runs the job again when the window resets.
 *
 * It is intentionally not concurrency-safe: the job worker runs single-threaded
 * and fetches pages sequentially, so calls into a limiter are serialised. The
 * single-worker design is what makes *concurrent* backfills queue behind one
 * another rather than hammering the budget all at once.
 */

import { DeferJob } from '#app/utils/jobs/queue.server.ts'

/** Injectable time source so tests can advance virtual time without waiting. */
export type Clock = {
	now: () => number
	sleep: (ms: number) => Promise<void>
}

const realClock: Clock = {
	now: () => Date.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** Who is asking: a live webhook fetch, or bulk work that must leave it room. */
export type RateLimitLane = 'live' | 'bulk'

export type RateLimitWindow = { limit: number; windowMs: number }

export type RateLimiter = {
	acquire: (lane?: RateLimitLane) => Promise<void>
	run: (
		lane: RateLimitLane,
		request: () => Promise<Response>,
	) => Promise<Response>
}

/** How many times a `429` is waited out before the response is handed back. */
const MAX_429_RETRIES = 3

export function createRateLimiter({
	windows,
	liveReserve = 0,
	clock = realClock,
}: {
	/** Shortest first, in the order Strava's headers list them. */
	windows: readonly RateLimitWindow[]
	/** The share of each window only `live` requests may use. */
	liveReserve?: number
	clock?: Clock
}): RateLimiter {
	const state = windows.map((w) => ({ ...w, start: 0, used: 0 }))
	const maxWaitMs = Math.min(...windows.map((w) => w.windowMs))

	function roll(now: number) {
		for (const w of state) {
			const start = Math.floor(now / w.windowMs) * w.windowMs
			if (start !== w.start) {
				w.start = start
				w.used = 0
			}
		}
	}

	function cap(w: RateLimitWindow, lane: RateLimitLane) {
		return lane === 'live' ? w.limit : Math.floor(w.limit * (1 - liveReserve))
	}

	async function acquire(lane: RateLimitLane = 'bulk'): Promise<void> {
		for (;;) {
			const now = clock.now()
			roll(now)
			const full = state.filter((w) => w.used >= cap(w, lane))
			if (full.length === 0) {
				for (const w of state) w.used++
				return
			}
			// Wait for the last of the full windows to reset, or hand the job back
			// to the queue when that is longer than the shortest window.
			const resumeAt = Math.max(...full.map((w) => w.start + w.windowMs))
			if (resumeAt - now > maxWaitMs) {
				throw new DeferJob(
					new Date(resumeAt),
					`Strava read budget spent until ${new Date(resumeAt).toISOString()}`,
				)
			}
			await clock.sleep(Math.max(resumeAt - now, 1))
		}
	}

	/**
	 * Follow Strava's own figures. Every trainm8 call is a read, so the read
	 * headers win; the overall ones stand in when they are absent. Each header
	 * is `<15-minute>,<daily>`. Usage only ever raises our count: Strava's
	 * includes requests this process never saw, ours ones still in flight.
	 */
	function observe(headers: Headers) {
		const prefix = headers.has('x-readratelimit-usage')
			? 'x-readratelimit'
			: 'x-ratelimit'
		const limits = parsePair(headers.get(`${prefix}-limit`))
		const usage = parsePair(headers.get(`${prefix}-usage`))
		roll(clock.now())
		state.forEach((w, i) => {
			const limit = limits?.[i]
			if (limit != null) w.limit = limit
			const used = usage?.[i]
			if (used != null) w.used = Math.max(w.used, used)
		})
	}

	async function run(
		lane: RateLimitLane,
		request: () => Promise<Response>,
	): Promise<Response> {
		for (let attempt = 0; ; attempt++) {
			await acquire(lane)
			const response = await request()
			observe(response.headers)
			if (response.status !== 429 || attempt >= MAX_429_RETRIES) {
				return response
			}
			// Spent, says Strava. When its headers don't say which window, assume
			// the shortest, so the retry waits for the next quarter-hour.
			if (!state.some((w) => w.used >= w.limit) && state[0]) {
				state[0].used = state[0].limit
			}
		}
	}

	return { acquire, run }
}

function parsePair(header: string | null): number[] | null {
	if (!header) return null
	const values = header.split(',').map((v) => Number(v.trim()))
	return values.every(Number.isFinite) ? values : null
}

/**
 * Strava's documented per-app read (non-upload) limits: 100 requests per 15
 * minutes and 1,000 per day (developers.strava.com/docs/rate-limits, checked
 * 2026-10-24). A fifth of each is kept for live webhook fetches.
 */
export const STRAVA_RATE_LIMIT = {
	windows: [
		{ limit: 100, windowMs: 15 * 60 * 1000 },
		{ limit: 1000, windowMs: 24 * 60 * 60 * 1000 },
	],
	liveReserve: 0.2,
} as const
