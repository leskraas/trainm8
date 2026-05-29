import { jobHandlers } from './handlers.server.ts'
import { processNextJob } from './queue.server.ts'

/**
 * The in-process job worker (ADR 0013). A single poller drains runnable jobs one
 * at a time on a fixed interval. Single-concurrency is deliberate: it serialises
 * concurrent backfills so they queue behind one another rather than hammering
 * the source provider's rate budget all at once (#74).
 */

const DEFAULT_POLL_INTERVAL_MS = 5_000

/**
 * Start polling the job queue. Returns a stop function (used on graceful
 * shutdown). The interval is `unref`'d so the worker never keeps the process
 * alive on its own.
 */
export function startJobWorker({
	intervalMs = DEFAULT_POLL_INTERVAL_MS,
}: { intervalMs?: number } = {}): () => void {
	let draining = false
	let stopped = false

	async function tick() {
		if (draining || stopped) return
		draining = true
		try {
			// Drain every runnable job this tick so a burst doesn't wait one full
			// interval per job; stop when the queue is idle or we've been stopped.
			while (!stopped && (await processNextJob(jobHandlers)) === 'processed') {
				/* keep draining */
			}
		} catch (error) {
			console.error('[job-worker] tick failed', error)
		} finally {
			draining = false
		}
	}

	const timer = setInterval(() => void tick(), intervalMs)
	if (typeof timer.unref === 'function') timer.unref()

	return () => {
		stopped = true
		clearInterval(timer)
	}
}
