/**
 * Laid sessions are whole five minutes (owner decision 2, #571): _45 min_ is
 * laid as 45, not 42. One rounding, read by every writer that lays minutes —
 * the draft's short weekdays, the Week Pattern's hours split, _For sliten i
 * dag_ and the start's Simple Activity shares — so no two of them can round a
 * session differently.
 */

/** The step a laid session's minutes come in. */
export const FIVE_MINUTES = 5

/** `minutes` to the nearest whole five. */
export function inWholeFiveMinutes(minutes: number): number {
	return Math.round(minutes / FIVE_MINUTES) * FIVE_MINUTES
}
