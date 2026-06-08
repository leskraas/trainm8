/**
 * The training-week window for weekly Plan Adherence (ADR 0019, #119): a
 * **calendar Monday–Sunday** week evaluated in the **Athlete Timezone**.
 *
 * ADR 0019 left the window (calendar week vs rolling 7 days) to implementation.
 * We pick calendar Mon–Sun so the figure aligns with how athletes read a
 * training week — and so it includes the elapsed days' actual load alongside the
 * remaining days' planned load, which is what makes weekly compensation legible.
 *
 * Mirrors the timezone day-bounds approach in `snapshot.server.ts`: dates are
 * resolved as `en-CA` (YYYY-MM-DD) strings in the athlete timezone, then each
 * local day is mapped back to its UTC bounds for a `scheduledAt` range query.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Format a Date as YYYY-MM-DD in the given timezone. */
function toLocalDate(utcDate: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(utcDate)
}

/** UTC bounds [00:00, 23:59:59.999] of a local calendar day in `timezone`. */
function localDayBoundsUTC(
	dateStr: string,
	timezone: string,
): { start: Date; end: Date } {
	// Noon UTC is a stable anchor inside the local day for any timezone; nudge
	// it ±1 day if DST/offset pushes the formatted local date off `dateStr`.
	let ref = new Date(`${dateStr}T12:00:00.000Z`)
	if (toLocalDate(ref, timezone) !== dateStr) {
		const back = new Date(ref.getTime() - DAY_MS)
		const fwd = new Date(ref.getTime() + DAY_MS)
		if (toLocalDate(back, timezone) === dateStr) ref = back
		else if (toLocalDate(fwd, timezone) === dateStr) ref = fwd
	}
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(ref)
	const get = (t: string) => parts.find((p) => p.type === t)!.value
	// Local clock time of `ref` tells us how far ref sits from local midnight;
	// subtract that to land on local 00:00, expressed in UTC.
	const hour = Number(get('hour')) % 24
	const minute = Number(get('minute'))
	const localMidnightUTC = new Date(
		ref.getTime() - (hour * 60 + minute) * 60 * 1000,
	)
	return {
		start: localMidnightUTC,
		end: new Date(localMidnightUTC.getTime() + DAY_MS - 1),
	}
}

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD date string. */
function dayOfWeek(dateStr: string): number {
	return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
}

/** Add `days` to a YYYY-MM-DD date string, returning a new YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

/**
 * UTC bounds of the calendar Monday–Sunday training week containing `now`,
 * evaluated in the athlete `timezone`. Pass the result to a `scheduledAt`
 * range filter (`{ gte: start, lte: end }`).
 */
export function trainingWeekBoundsUTC(
	now: Date,
	timezone: string,
): { start: Date; end: Date } {
	const today = toLocalDate(now, timezone)
	const daysFromMonday = (dayOfWeek(today) + 6) % 7 // Mon→0 … Sun→6
	const monday = addDays(today, -daysFromMonday)
	const sunday = addDays(monday, 6)
	return {
		start: localDayBoundsUTC(monday, timezone).start,
		end: localDayBoundsUTC(sunday, timezone).end,
	}
}
