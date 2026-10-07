/**
 * The clock of _Ukeskiftet_, the week change (#505, ADR 0080): when a Training
 * Week closes, and when the morning's silence may answer for the athlete.
 * Pure, so every caller — the hourly job, the load recompute, the tests —
 * reads the same two instants off the same Athlete Timezone.
 *
 * - **The week closes Sunday 20:00 local.** From then on the closing week is
 *   "the most recently closed week", so its Week Replan is written on Sunday
 *   evening, while the athlete can still read it before Monday.
 * - **Silence answers the morning after, 06:00 local.** A proposal nobody
 *   answered applies (if it may) from the first 06:00 after its Week Replan was
 *   written: Monday morning for a Sunday-evening close, the next morning for a
 *   week change that ran late.
 */

import {
	addDays,
	localDate,
	localTimeUTC,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'

/** Sunday's local wall-clock time at which the Training Week closes. */
export const WEEK_CLOSES_AT = '20:00'

/** The local wall-clock time from which the morning's silence applies. */
export const SILENCE_APPLIES_AT = '06:00'

/**
 * The Monday (week key) of the most recently closed Training Week at `now`.
 *
 * Before Sunday 20:00 that is last week; from Sunday 20:00 on it is the week
 * `now` is still in. Every evaluation of "the closed week" reads this, so the
 * Week Replan and the week change can never disagree on which week it is.
 */
export function lastClosedWeekKey(now: Date, timezone: string): string {
	const monday = weekMonday(now, timezone)
	const closes = localTimeUTC(addDays(monday, 6), WEEK_CLOSES_AT, timezone)
	return now >= closes ? monday : addDays(monday, -7)
}

/**
 * The Planning Horizon week a close fills: the week after next, counted from
 * the closed week. On Sunday evening the athlete then holds two concrete weeks
 * ahead — the coming one, filled a week ago, and this one.
 */
export function horizonWeekKey(closedWeekKey: string): string {
	return addDays(closedWeekKey, 14)
}

/** The first local {@link SILENCE_APPLIES_AT} strictly after `instant`. */
export function nextSilenceAfter(instant: Date, timezone: string): Date {
	const day = localDate(instant, timezone)
	const sameDay = localTimeUTC(day, SILENCE_APPLIES_AT, timezone)
	return sameDay > instant
		? sameDay
		: localTimeUTC(addDays(day, 1), SILENCE_APPLIES_AT, timezone)
}

/**
 * The first Training Week not yet begun at `now`: this week on its Monday
 * (nothing of it is behind the athlete yet), else next week. Where a week is
 * laid, or a round opens, without placing anything in the past.
 */
export function firstUnbegunWeekKey(now: Date, timezone: string): string {
	const monday = weekMonday(now, timezone)
	return localDate(now, timezone) === monday ? monday : addDays(monday, 7)
}
