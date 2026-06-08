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

/** The UTC instant of local midnight opening the calendar day `dateStr`. */
function localMidnightUTC(dateStr: string, timezone: string): Date {
	const [y, m, d] = dateStr.split('-').map(Number)
	const midnightAsUTC = Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0)
	// Offset depends on the instant we land on; two passes converge across any
	// DST transition (the second uses the offset at the candidate midnight).
	let t = midnightAsUTC - tzOffsetMs(new Date(midnightAsUTC), timezone)
	t = midnightAsUTC - tzOffsetMs(new Date(t), timezone)
	return new Date(t)
}

/** Add `days` to a YYYY-MM-DD date string, returning a new YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
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
 * UTC bounds of the calendar Monday–Sunday Training Week containing `now`,
 * evaluated in the athlete `timezone`. Pass the result to a `scheduledAt` range
 * filter (`{ gte: start, lte: end }`).
 */
export function weekBoundsUTC(
	now: Date,
	timezone: string,
): { start: Date; end: Date } {
	const today = localDate(now, timezone)
	const daysFromMonday = (dayOfWeek(today) + 6) % 7 // Mon→0 … Sun→6
	const monday = addDays(today, -daysFromMonday)
	const sunday = addDays(monday, 6)
	return {
		start: dayBoundsUTC(monday, timezone).start,
		end: dayBoundsUTC(sunday, timezone).end,
	}
}
