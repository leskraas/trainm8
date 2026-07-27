// The seam between stored week *keys* and the derivation's week *indices*.
//
// A Plan Outline keys every week-scoped row by that week's Monday — `weekKey`,
// `YYYY-MM-DD` in the Athlete Timezone, the idiom `WeekReplan` already uses
// (ADR 0025) — so a structural edit never shifts a week already lived (ADR 0044
// §3). The per-week derivation is pure index arithmetic (ADR 0040 §3). These two
// functions are the only conversion between them.
//
// Both keys are plain date strings of the same kind, so the day difference is
// timezone-independent: parsing them as UTC midnights compares like with like.

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * The 0-based week index of `weekKey` counted from `startWeekKey`. Negative for a
 * week before the plan opens, which the derivation reads as "outside the plan"
 * rather than clamping into it.
 */
export function weekIndexOf(startWeekKey: string, weekKey: string): number {
	return Math.round((Date.parse(weekKey) - Date.parse(startWeekKey)) / WEEK_MS)
}

/** The `weekKey` of the plan's week `index`. */
export function weekKeyAt(startWeekKey: string, index: number): string {
	return new Date(Date.parse(startWeekKey) + index * WEEK_MS)
		.toISOString()
		.slice(0, 10)
}
