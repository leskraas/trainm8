/**
 * The shared display-formatting layer (#172, PRD #171). Every athlete-facing
 * number, date, time, pace, duration, and distance renders through here so no
 * surface can reintroduce raw floats or locale-drifting dates.
 *
 * Two rules make the output deterministic (and kill the Event-page hydration
 * mismatch):
 *
 * 1. The locale is FIXED (`DISPLAY_LOCALE`) — never the runtime default — so a
 *    server render and a client render can't disagree on 12h/24h clocks or
 *    day/month order.
 * 2. Every date/time formatter takes an explicit IANA `timeZone`. Callers pass
 *    the viewer's timezone (the `timeZone` client hint, which the server reads
 *    from a cookie — see `useDisplayTimeZone` in client-hints.tsx), so both
 *    renders resolve the same wall-clock.
 *
 * Parsers for the humane form inputs (`mm:ss` pace, clock strings) live here
 * too, as the inverses of their formatters, so form boundaries round-trip
 * through one vocabulary.
 */

/**
 * en-GB: 24-hour clock, day-month order — one consistent, unambiguous format
 * (PRD #171 user story 2). Deliberately not the browser locale: display must
 * be identical on server and client.
 */
export const DISPLAY_LOCALE = 'en-GB'

// ---------------------------------------------------------------------------
// Numbers — TSS / load
// ---------------------------------------------------------------------------

/** TSS is always displayed as a whole number (integer TSS everywhere, #172). */
export function roundTss(value: number): number {
	return Math.round(value)
}

/** TSS as display text — a rounded integer, e.g. `"121"`. */
export function formatTss(value: number): string {
	return String(roundTss(value))
}

/** Integer with thousands separators, e.g. `1500` → `"1,500"`. */
export function formatInteger(value: number): string {
	return new Intl.NumberFormat(DISPLAY_LOCALE, {
		maximumFractionDigits: 0,
	}).format(value)
}

// ---------------------------------------------------------------------------
// Clock strings & duration
// ---------------------------------------------------------------------------

/** Whole seconds as a bare `m:ss` clock, e.g. `240` → `"4:00"`. */
export function formatClock(totalSeconds: number): string {
	const total = Math.round(totalSeconds)
	const minutes = Math.floor(total / 60)
	const seconds = total % 60
	return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Whole seconds as `h:mm:ss`, e.g. `12600` → `"3:30:00"`. */
export function formatClockHms(totalSeconds: number): string {
	const total = Math.round(totalSeconds)
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const seconds = total % 60
	return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Parse a `m:ss` (or `h:mm:ss`) clock string to total seconds. The inverse of
 * `formatClock` / `formatClockHms`. Returns `null` for anything malformed —
 * callers own the error copy at the form boundary.
 */
export function parseClock(text: string): number | null {
	const trimmed = text.trim()
	const match = /^(?:(\d{1,3}):)?(\d{1,3}):([0-5]\d)$/.exec(trimmed)
	if (!match) return null
	const [, h, m, s] = match
	const hours = h ? Number(h) : 0
	const minutes = Number(m)
	const seconds = Number(s)
	if (h && minutes > 59) return null
	return hours * 3600 + minutes * 60 + seconds
}

/** A duration in seconds as the athlete reads it: `"1 h 5 min"`, `"45 min"`, `"30 s"`. */
export function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60

	if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`
	if (hours > 0) return `${hours} h`
	if (minutes > 0 && secs > 0) return `${minutes} min ${secs} s`
	if (minutes > 0) return `${minutes} min`
	return `${secs} s`
}

// ---------------------------------------------------------------------------
// Distance, pace, speed
// ---------------------------------------------------------------------------

export function formatDistance(meters: number): string {
	if (meters >= 1000) {
		const km = meters / 1000
		return Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`
	}
	return `${meters} m`
}

/** Bare `m:ss` clock for a seconds-per-kilometre pace, no unit suffix. */
export function formatPaceClock(secPerKm: number): string {
	return formatClock(secPerKm)
}

/** Pace as `m:ss /km` (the unit runners read), from seconds-per-kilometre. */
export function formatPace(secPerKm: number): string {
	return `${formatClock(secPerKm)} /km`
}

/** A pace target as `m:ss /km`, or `m:ss–m:ss /km` when an upper bound is set. */
export function formatPaceRange(
	minSecPerKm: number,
	maxSecPerKm?: number | null,
): string {
	return maxSecPerKm != null
		? `${formatClock(minSecPerKm)}–${formatClock(maxSecPerKm)} /km`
		: `${formatPace(minSecPerKm)}`
}

/** Swim pace as `m:ss /100m` (the unit swimmers read), from seconds-per-100m. */
export function formatSwimPace(secPer100m: number): string {
	return `${formatClock(secPer100m)} /100m`
}

/** Speed as `km/h` (one decimal) from metres-per-second. */
export function formatSpeed(metersPerSec: number): string {
	return `${(metersPerSec * 3.6).toFixed(1)} km/h`
}

// ---------------------------------------------------------------------------
// Dates & times — locale fixed, timezone explicit
// ---------------------------------------------------------------------------

// Intl.DateTimeFormat construction is expensive; formatters recur per row, so
// cache by options-key + timezone.
const dtfCache = new Map<string, Intl.DateTimeFormat>()

function dtf(
	timeZone: string,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = `${timeZone}|${JSON.stringify(options)}`
	let formatter = dtfCache.get(key)
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
			...options,
			timeZone,
		})
		dtfCache.set(key, formatter)
	}
	return formatter
}

/** Time of day as `HH:mm` (24h), e.g. `"14:30"`. */
export function formatTime(date: Date, timeZone: string): string {
	return dtf(timeZone, {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(date)
}

/** Day of month as a bare number, e.g. `"4"`. */
export function formatDayOfMonth(date: Date, timeZone: string): string {
	return dtf(timeZone, { day: 'numeric' }).format(date)
}

/** Abbreviated weekday, e.g. `"Fri"`. */
export function formatWeekdayShort(date: Date, timeZone: string): string {
	return dtf(timeZone, { weekday: 'short' }).format(date)
}

/** Full weekday, e.g. `"Friday"`. */
export function formatWeekdayLong(date: Date, timeZone: string): string {
	return dtf(timeZone, { weekday: 'long' }).format(date)
}

/** Day and abbreviated month, e.g. `"4 Jul"`. */
export function formatMonthDay(date: Date, timeZone: string): string {
	return dtf(timeZone, { day: 'numeric', month: 'short' }).format(date)
}

/** Abbreviated weekday, day, month, e.g. `"Fri 4 Jul"`. */
export function formatShortDate(date: Date, timeZone: string): string {
	return dtf(timeZone, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(date)
}

/** Full weekday, day, full month (no year), e.g. `"Friday 4 July"`. */
export function formatLongDate(date: Date, timeZone: string): string {
	return dtf(timeZone, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	}).format(date)
}

/** Day, month, year, e.g. `"4 Jul 2026"`. */
export function formatMediumDate(date: Date, timeZone: string): string {
	return dtf(timeZone, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(date)
}

/** Full weekday, day, full month, year, e.g. `"Friday, 4 July 2026"`. */
export function formatFullDate(date: Date, timeZone: string): string {
	return dtf(timeZone, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	}).format(date)
}

/** Date and time together, e.g. `"4 Jul 2026, 14:30"`. */
export function formatDateTime(date: Date, timeZone: string): string {
	return `${formatMediumDate(date, timeZone)}, ${formatTime(date, timeZone)}`
}
