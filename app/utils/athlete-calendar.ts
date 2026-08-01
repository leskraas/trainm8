/**
 * Athlete Calendar — the single module resolving an instant to its calendar day
 * and Training Week in the Athlete Timezone, and a local day/week to its UTC
 * bounds (#121, #122).
 *
 * Canonical for both Load Snapshot day-bucketing and Weekly Plan Adherence week
 * windows. The day-bounds math is the *true UTC instant of local midnight*: we
 * resolve the timezone's UTC offset at the target day and subtract it, rather
 * than reinterpreting a local date as `T00:00:00.000Z` (which drifts by the UTC
 * offset for any non-UTC athlete — the bug #122 fixes). DST is handled here, not
 * at call sites: the offset is resolved at the day's actual midnight, and a
 * day's end is the instant before the *next* local midnight, so shortened
 * (spring-forward) and lengthened (fall-back) days come out right.
 */

/** Format an instant as YYYY-MM-DD in `timezone`. */
export function localDate(instant: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(instant)
}

/**
 * The UTC offset of `timezone` at `instant`, in milliseconds (local − UTC).
 * Positive east of UTC. Resolved by formatting the instant's wall-clock in the
 * zone and comparing it to the same wall-clock read as UTC.
 */
function tzOffsetMs(instant: Date, timezone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(instant)
	const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
	const wallAsUTC = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	)
	return wallAsUTC - instant.getTime()
}

/** The UTC instant of the local wall-clock `HH:MM:00` on the calendar day `dateStr`. */
function localWallClockUTC(
	dateStr: string,
	hour: number,
	minute: number,
	timezone: string,
): Date {
	const [y, m, d] = dateStr.split('-').map(Number)
	const wallAsUTC = Date.UTC(y!, m! - 1, d!, hour, minute, 0, 0)
	// Offset depends on the instant we land on; two passes converge across any
	// DST transition (the second uses the offset at the candidate instant).
	let t = wallAsUTC - tzOffsetMs(new Date(wallAsUTC), timezone)
	t = wallAsUTC - tzOffsetMs(new Date(t), timezone)
	return new Date(t)
}

/** The UTC instant of local midnight opening the calendar day `dateStr`. */
function localMidnightUTC(dateStr: string, timezone: string): Date {
	return localWallClockUTC(dateStr, 0, 0, timezone)
}

/**
 * The UTC instant of a local **clock time** on a local calendar day — the
 * crossing a *scheduled* session needs, where the day-bounds helpers only cross
 * at midnight.
 *
 * `time` is `HH:MM` in the athlete's own zone (the `defaultTrainingTime` shape),
 * so a Wednesday 07:00 session lands on Wednesday morning for the athlete in
 * every zone and across every DST boundary — the same two-pass offset resolution
 * `dayBoundsUTC` does, and for the same reason. A time that is not `HH:MM` reads
 * as local midnight rather than throwing: an unschedulable session is worse than
 * one at the top of the right day.
 */
export function localTimeUTC(
	dateStr: string,
	time: string,
	timezone: string,
): Date {
	const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
	return localWallClockUTC(
		dateStr,
		Number(match?.[1] ?? 0),
		Number(match?.[2] ?? 0),
		timezone,
	)
}

/**
 * The local wall-clock `HH:MM` an instant reads as in `timezone` — the inverse of
 * {@link localTimeUTC}, and the reading a **week copy** is built on (#415).
 *
 * Copying a week has to preserve the athlete's *local* time of day, not the UTC
 * instant: 07:00 in Oslo is 06:00Z in January and 05:00Z in July, so a copy that
 * carried the instant across a DST boundary would move the session an hour in the
 * athlete's own morning. Round-tripping through this and `localTimeUTC` moves the
 * wall clock and lets the offset fall where the target week puts it.
 *
 * Minute resolution, matching `localTimeUTC` and the **Default Training Time** it
 * takes: a session is scheduled to a minute, so seconds carry nothing to preserve.
 */
export function localTimeOfDay(instant: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hourCycle: 'h23',
		hour: '2-digit',
		minute: '2-digit',
	}).formatToParts(instant)
	const get = (type: string) =>
		Number(parts.find((part) => part.type === type)!.value)
	// `% 24` because a formatter that answers in the h24 cycle writes midnight as
	// `24:00`, which `localTimeUTC` would read as no time at all.
	const hour = String(get('hour') % 24).padStart(2, '0')
	return `${hour}:${String(get('minute')).padStart(2, '0')}`
}

/** Add `days` to a YYYY-MM-DD date string, returning a new YYYY-MM-DD string. */
export function addDays(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD date string. */
function dayOfWeek(dateStr: string): number {
	return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
}

/**
 * UTC bounds `[start, end]` of the local calendar day `dateStr` in `timezone`.
 * `start` is local midnight; `end` is 1ms before the next local midnight (so a
 * DST day is correctly 23h or 25h long). Pass to a `scheduledAt` range filter
 * (`{ gte: start, lte: end }`).
 */
export function dayBoundsUTC(
	dateStr: string,
	timezone: string,
): { start: Date; end: Date } {
	const start = localMidnightUTC(dateStr, timezone)
	const nextStart = localMidnightUTC(addDays(dateStr, 1), timezone)
	return { start, end: new Date(nextStart.getTime() - 1) }
}

/**
 * The Monday (YYYY-MM-DD) opening the calendar Monday–Sunday Training Week
 * containing `now`, evaluated in the athlete `timezone` — the canonical key
 * for week-scoped records (the Week Replan's `weekKey`, ADR 0025).
 */
export function weekMonday(now: Date, timezone: string): string {
	const today = localDate(now, timezone)
	const daysFromMonday = (dayOfWeek(today) + 6) % 7 // Mon→0 … Sun→6
	return addDays(today, -daysFromMonday)
}

/**
 * UTC bounds of the calendar Monday–Sunday Training Week containing `now`,
 * evaluated in the athlete `timezone`. Pass the result to a `scheduledAt` range
 * filter (`{ gte: start, lte: end }`).
 */
export function weekBoundsUTC(
	now: Date,
	timezone: string,
): { start: Date; end: Date } {
	return weekBoundsFromMondayUTC(weekMonday(now, timezone), timezone)
}

/**
 * UTC bounds of the Mon–Sun Training Week opening on `monday` (YYYY-MM-DD),
 * evaluated in the athlete `timezone` — for week-scoped records addressed by
 * their week key (the Week Replan, ADR 0025) rather than by an instant.
 */
export function weekBoundsFromMondayUTC(
	monday: string,
	timezone: string,
): { start: Date; end: Date } {
	return {
		start: dayBoundsUTC(monday, timezone).start,
		end: dayBoundsUTC(addDays(monday, 6), timezone).end,
	}
}
