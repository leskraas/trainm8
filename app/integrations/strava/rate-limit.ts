/**
 * A rate limiter for Strava's per-app read budget (100 requests / 15 min and
 * 1,000 / day — ADR 0013). `acquire()` resolves immediately while every window
 * has room and otherwise throws `StravaRateLimitedError` (a `DeferJob`) for when the full window resets, so
 * throttling delays calls rather than dropping them (#74).
 *
 * Windows are fixed, as Strava counts them (#637): the 15-minute ones reset at
 * :00, :15, :30 and :45, the day at midnight UTC — both whole multiples of their
 * length since the Unix epoch. A `bulk` request (sync, backfill, reconcile) may
 * use only part of each window, keeping `liveReserve` of it for `live` webhook
 * fetches, so a backfill can't starve them. `run()` also reads Strava's
 * rate-limit headers, so its figures follow Strava's rather than ours, and
 * takes a `429` as the window spent instead of failing.
 *
 * The limiter never sleeps. A wait would hold the single job worker, or the
 * request a callback or manual sync runs in, for up to a day; instead it throws
 * `StravaRateLimitedError`. The queue runs a deferred job again when the window resets
 * (ADR 0013), and a request path answers at once with when to try again.
 *
 * It is intentionally not concurrency-safe: the job worker runs single-threaded
 * and fetches pages sequentially, so calls into a limiter are serialised. The
 * single-worker design is what makes *concurrent* backfills queue behind one
 * another rather than hammering the budget all at once.
 */

import { DeferJob } from '#app/utils/jobs/queue.server.ts'

/**
 * Strava's read budget is spent until `until`. A request path (the OAuth
 * callback, manual sync) catches it by this name and says when to try again;
 * it is a `DeferJob`, so a job that hits it is deferred to `until`.
 */
export class StravaRateLimitedError extends DeferJob {
	constructor(until: Date) {
		super(until, `Strava read budget spent until ${until.toISOString()}`)
		this.name = 'StravaRateLimitedError'
	}
}

/** Injectable time source so tests can move virtual time without waiting. */
export type Clock = { now: () => number }

const realClock: Clock = { now: () => Date.now() }

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

	/**
	 * When `lane`'s next request may go, as the windows stand: `null` while
	 * every window has room, else when the last of the full ones resets.
	 * Reads the windows only; the caller rolls them to now first.
	 */
	function resumeAt(lane: RateLimitLane): Date | null {
		const full = state.filter((w) => w.used >= cap(w, lane))
		if (full.length === 0) return null
		return new Date(Math.max(...full.map((w) => w.start + w.windowMs)))
	}

	async function acquire(lane: RateLimitLane = 'bulk'): Promise<void> {
		roll(clock.now())
		const until = resumeAt(lane)
		// Hand the job back until the window it needs resets.
		if (until) throw new StravaRateLimitedError(until)
		for (const w of state) w.used++
	}

	/**
	 * Follow Strava's own figures. Every trainm8 call is a read, so the read
	 * headers win; the overall ones stand in when they are absent, but only to
	 * lower a ceiling: they count uploads too, so they are looser than reads.
	 * Each header is `<15-minute>,<daily>`. Usage only ever raises our count:
	 * Strava's includes requests this process never saw, ours ones still in
	 * flight.
	 */
	function observe(headers: Headers) {
		const reads = headers.has('x-readratelimit-usage')
		const prefix = reads ? 'x-readratelimit' : 'x-ratelimit'
		const limits = parsePair(headers.get(`${prefix}-limit`))
		const usage = parsePair(headers.get(`${prefix}-usage`))
		roll(clock.now())
		state.forEach((w, i) => {
			const limit = limits?.[i]
			if (limit != null) w.limit = reads ? limit : Math.min(w.limit, limit)
			const used = usage?.[i]
			if (used != null) w.used = Math.max(w.used, used)
		})
	}

	async function run(
		lane: RateLimitLane,
		request: () => Promise<Response>,
	): Promise<Response> {
		await acquire(lane)
		const response = await request()
		observe(response.headers)
		if (response.status !== 429) return response
		// Spent, says Strava. When its headers don't say which window, assume
		// the shortest, so the job defers to the next quarter-hour.
		if (!state.some((w) => w.used >= w.limit) && state[0]) {
			state[0].used = state[0].limit
		}
		const until = resumeAt(lane)
		if (until) throw new StravaRateLimitedError(until)
		// A limiter with no windows hands the 429 back as it came.
		return response
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

/**
 * The process-wide limiter every Strava API call goes through, so the per-app
 * read budget (ADR 0013) is honoured across all athletes' activity.
 */
let sharedStravaRateLimiter = createRateLimiter(STRAVA_RATE_LIMIT)

export function getStravaRateLimiter(): RateLimiter {
	return sharedStravaRateLimiter
}

/**
 * Give the process-wide limiter its whole budget back. The test setup calls it
 * before each test, so the reads earlier tests made never defer a later one; a
 * test that needs its own clock or windows hands its limiter to `stravaApiGet`.
 */
export function resetStravaRateLimiter(): void {
	sharedStravaRateLimiter = createRateLimiter(STRAVA_RATE_LIMIT)
}
