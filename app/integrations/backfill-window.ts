/**
 * The Backfill Window constants (ADR 0013 #74, amended #151), shared by every
 * provider's on-connect history import so "how much history trainm8 reaches
 * for" is a product decision, not a per-provider accident (#204). Each
 * provider's backfill applies these identically:
 *
 *  - reach back far enough to collect at least `BACKFILL_TARGET_SESSIONS`
 *    modeled-discipline workouts, so an infrequent athlete still gets a
 *    meaningful history;
 *  - never less than `BACKFILL_MIN_DAYS` (the CTL window), so Training Load is
 *    always seeded;
 *  - never more than `BACKFILL_MAX_DAYS`, so stale years don't misrepresent
 *    current training and per-activity enrichment stays bounded.
 */

/**
 * Reach back until at least this many modeled-discipline workouts are collected
 * — the count floor that makes history meaningful for infrequent athletes. A
 * tunable knob (ADR 0013); raising it far enough to strain a provider's rate
 * budget is what would justify deferring telemetry to read time.
 */
export const BACKFILL_TARGET_SESSIONS = 50

/**
 * The minimum reach, sized to the CTL (chronic load) window so Training Load is
 * always seeded. Also the span the post-backfill load recompute covers — current
 * fitness depends only on the recent window, so it stays decoupled from how far
 * back the import reached.
 */
export const BACKFILL_MIN_DAYS = 42

/**
 * The maximum reach: never import activities older than this, so stale history
 * doesn't misrepresent current training and eager enrichment stays bounded.
 */
export const BACKFILL_MAX_DAYS = 365
