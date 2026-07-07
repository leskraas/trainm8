/**
 * A simple courtesy pacer for Intervals.icu requests (#204): a minimum spacing
 * between consecutive calls so a backfill never bursts against the API.
 *
 * Intervals.icu's budget is generous — 5,000 requests/day per athlete — and a
 * backfill is bounded by the count target (one list call plus at most one
 * streams call per kept modeled activity, i.e. well under 100 requests), so a
 * shared sliding-window limiter like Strava's would be machinery without a
 * job. Spacing requests ~4
 * per second keeps a worst-case day (hundreds of requests) orders of magnitude
 * inside the budget while staying polite to the source.
 *
 * Like Strava's limiter it is intentionally not concurrency-safe: the job
 * worker is single-threaded and fetches sequentially.
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

export type Pacer = { acquire: () => Promise<void> }

/** Minimum spacing between Intervals.icu requests within one process. */
export const INTERVALSICU_COURTESY_INTERVAL_MS = 250

export function createCourtesyPacer({
	minIntervalMs,
	clock = realClock,
}: {
	minIntervalMs: number
	clock?: Clock
}): Pacer {
	let nextAllowedAt = -Infinity

	async function acquire(): Promise<void> {
		const waitMs = nextAllowedAt - clock.now()
		if (waitMs > 0) await clock.sleep(waitMs)
		nextAllowedAt = clock.now() + minIntervalMs
	}

	return { acquire }
}
