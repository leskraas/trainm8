/**
 * The count-based Backfill Window job kind for Intervals.icu (ADR 0013 #151,
 * ADR 0026 #3). The connect flow enqueues it so history import starts as soon
 * as the handler lands; the handler itself is the next slice (#203 stores the
 * connection, the backfill issue does the fetching). Until then the registered
 * handler is a graceful no-op — the enqueued job completes without touching
 * the connection, and the hub deliberately shows no "importing history" state
 * for Intervals.icu yet (no fake progress).
 */
export const INTERVALSICU_BACKFILL_JOB_KIND = 'intervalsicu-backfill'
