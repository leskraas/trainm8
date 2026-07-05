/**
 * The shared display-formatting layer (#172). Every athlete-facing number,
 * date, time, pace, and duration string is rendered through this module so all
 * surfaces agree and server/client markup can never diverge (the Event detail
 * hydration bug).
 *
 * Two deliberate policies:
 *
 * - **Locale is fixed** to `en-GB` (`DISPLAY_LOCALE`): 24h clock times and
 *   European-style "4 Jul 2026" dates, independent of the runtime's ICU
 *   default or the viewer's `Accept-Language`. Formatting must be a pure
 *   function of the value, or SSR and hydration disagree.
 * - **Timezone is explicit.** Every date/time formatter takes an IANA
 *   `timeZone` — normally the Athlete Timezone from the Athlete Profile
 *   (`useAthleteTimezone`). Day-anchored values stored as UTC midnight (Event
 *   dates, Load Snapshot day strings) format with `'UTC'` so the calendar day
 *   is never shifted by an offset.
 *
 * The pace/duration parsers are the inverse of their formatters and exist for
 *   form boundaries (#176 simple-mode form, #177 mm:ss threshold pace entry).
 */

/** The single fixed display locale: European-style dates, 24h times. */
export const DISPLAY_LOCALE = 'en-GB'

type DateInput = Date | string | number

function toDate(input: DateInput): Date {
	return input instanceof Date ? input : new Date(input)
}

// ---------------------------------------------------------------------------
// TSS / load numbers — athlete-facing load is always a whole number. A raw
// EWMA/TSS float like 120.6488888888889 must never reach the screen.
// ---------------------------------------------------------------------------

/** A TSS/CTL/ATL-style load value rounded to the integer athletes read. */
export function roundLoad(value: number): number {
	return Math.round(value)
}

/** A load value as display text, e.g. `121`. */
export function formatLoad(value: number): string {
	return String(roundLoad(value))
}

/** A load value with its unit, e.g. `121 TSS`. */
export function formatTss(value: number): string {
	return `${formatLoad(value)} TSS`
}

/** A signed load delta (TSB, vs-last), e.g. `+5` / `-3` / `0`. */
export function formatSigned(value: number): string {
	const r = roundLoad(value)
	return r > 0 ? `+${r}` : String(r)
}

// ---------------------------------------------------------------------------
// Dates and times — fixed locale, explicit timezone.
// ---------------------------------------------------------------------------

/**
 * The wall-clock parts of `instant` in `timeZone`. The composed strings below
 * are assembled from these parts by hand rather than trusting a combined ICU
 * pattern: pattern punctuation (commas, no-break spaces) has shifted between
 * ICU releases, and any server/browser drift is a hydration mismatch. Only the
 * stable token values (month/weekday names, digits) come from ICU.
 */
function wallClockParts(instant: DateInput, timeZone: string) {
	const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
		timeZone,
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(toDate(instant))
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? ''
	const weekday = get('weekday')
	const month = get('month')
	return {
		weekday,
		weekdayShort: weekday.slice(0, 3),
		day: get('day'),
		month,
		monthShort: month.slice(0, 3),
		year: get('year'),
		hour: get('hour'),
		minute: get('minute'),
	}
}

/** 24h wall-clock time in `timeZone`, e.g. `14:05`. */
export function formatTime(instant: DateInput, timeZone: string): string {
	const p = wallClockParts(instant, timeZone)
	return `${p.hour}:${p.minute}`
}

/** Full date, e.g. `4 Jul 2026`. */
export function formatDate(instant: DateInput, timeZone: string): string {
	const p = wallClockParts(instant, timeZone)
	return `${p.day} ${p.monthShort} ${p.year}`
}

/** Long prose date, e.g. `Saturday 4 July 2026`. */
export function formatDateLong(instant: DateInput, timeZone: string): string {
	const p = wallClockParts(instant, timeZone)
	return `${p.weekday} ${p.day} ${p.month} ${p.year}`
}

/** Compact yearless date with weekday, e.g. `Sat 4 Jul`. */
export function formatDayDate(instant: DateInput, timeZone: string): string {
	const p = wallClockParts(instant, timeZone)
	return `${p.weekdayShort} ${p.day} ${p.monthShort}`
}

/** Long yearless date with weekday, e.g. `Saturday 4 July` (day-group labels). */
export function formatDayDateLong(
	instant: DateInput,
	timeZone: string,
): string {
	const p = wallClockParts(instant, timeZone)
	return `${p.weekday} ${p.day} ${p.month}`
}

/** Bare day + month, e.g. `4 Jul` (dense chart/list labels). */
export function formatDayMonth(instant: DateInput, timeZone: string): string {
	const p = wallClockParts(instant, timeZone)
	return `${p.day} ${p.monthShort}`
}

/** Full weekday name, e.g. `Saturday`. */
export function formatWeekday(instant: DateInput, timeZone: string): string {
	return wallClockParts(instant, timeZone).weekday
}

/** Abbreviated weekday name, e.g. `Sat`. */
export function formatWeekdayShort(
	instant: DateInput,
	timeZone: string,
): string {
	return wallClockParts(instant, timeZone).weekdayShort
}

/** Day of month as text, e.g. `4`. */
export function formatDayOfMonth(instant: DateInput, timeZone: string): string {
	return wallClockParts(instant, timeZone).day
}

/** Date and 24h time, e.g. `Sat 4 Jul, 14:05`. */
export function formatDateTime(instant: DateInput, timeZone: string): string {
	return `${formatDayDate(instant, timeZone)}, ${formatTime(instant, timeZone)}`
}

// ---------------------------------------------------------------------------
// Pace — `m:ss` clocks per km (run) or per 100m (swim), plus the inverse
// parser for form boundaries (#177).
// ---------------------------------------------------------------------------

/** Bare `m:ss` clock for a seconds-per-unit pace, no unit suffix. */
export function formatPaceClock(secPerUnit: number): string {
	const total = Math.round(secPerUnit)
	const minutes = Math.floor(total / 60)
	const seconds = total % 60
	return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Pace as `m:ss /km` (the unit runners read), from seconds-per-kilometre. */
export function formatPace(secPerKm: number): string {
	return `${formatPaceClock(secPerKm)} /km`
}

/** Swim pace as `m:ss /100m`, from seconds-per-100-metres. */
export function formatSwimPace(secPer100m: number): string {
	return `${formatPaceClock(secPer100m)} /100m`
}

/** A pace target as `m:ss /km`, or `m:ss–m:ss /km` when an upper bound is set. */
export function formatPaceRange(
	minSecPerKm: number,
	maxSecPerKm?: number | null,
): string {
	return maxSecPerKm != null
		? `${formatPaceClock(minSecPerKm)}–${formatPaceClock(maxSecPerKm)} /km`
		: `${formatPace(minSecPerKm)}`
}

/**
 * Parse an `m:ss` pace entry (the inverse of `formatPaceClock`) into seconds
 * per unit. Tolerates surrounding whitespace and a `/km` or `/100m` unit
 * suffix. Returns `null` for anything else — never a guessed number.
 */
export function parsePace(input: string): number | null {
	const cleaned = input.trim().replace(/\s*\/\s*(km|100\s*m)$/i, '')
	const match = /^(\d{1,2}):([0-5]\d)$/.exec(cleaned.trim())
	if (!match) return null
	const minutes = Number(match[1])
	const seconds = Number(match[2])
	const total = minutes * 60 + seconds
	return total > 0 ? total : null
}

// ---------------------------------------------------------------------------
// Duration — `h min` prose, plus the inverse parser for form boundaries (#176).
// ---------------------------------------------------------------------------

/** A duration in seconds as `1 h 30 min` / `45 min` / `30 s` prose. */
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

/**
 * Parse a duration entry (the inverse of `formatDuration`) into seconds.
 * Accepts `1 h 30 min`, `1h30m`, `90 min`, `2 h`, `1:30` (h:mm), a bare
 * number (read as minutes), and — because `formatDuration` emits them — a
 * seconds component (`90 s`, `1 min 30 s`). Returns `null` for anything else.
 */
export function parseDuration(input: string): number | null {
	const cleaned = input.trim().toLowerCase()
	if (cleaned === '') return null

	// `h:mm` clock form.
	const clock = /^(\d{1,2}):([0-5]\d)$/.exec(cleaned)
	if (clock) {
		const total = Number(clock[1]) * 3600 + Number(clock[2]) * 60
		return total > 0 ? total : null
	}

	// Bare number = minutes.
	const bare = /^(\d+(?:[.,]\d+)?)$/.exec(cleaned)
	if (bare) {
		const minutes = Number(bare[1]!.replace(',', '.'))
		return minutes > 0 ? Math.round(minutes * 60) : null
	}

	// Unit form: `1 h 30 min`, `1h30m`, `90min`, `2h`, `45 m`, `90 s`.
	const units =
		/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/.exec(
			cleaned,
		)
	if (!units || (units[1] == null && units[2] == null && units[3] == null)) {
		return null
	}
	const total =
		Number(units[1] ?? 0) * 3600 +
		Number(units[2] ?? 0) * 60 +
		Number(units[3] ?? 0)
	return total > 0 ? total : null
}

/** A finish-time-style clock from seconds, e.g. `3:30:00` / `42:30`. */
export function formatClockDuration(seconds: number): string {
	const total = Math.round(seconds)
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	const mm = String(m).padStart(2, '0')
	const ss = String(s).padStart(2, '0')
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

// ---------------------------------------------------------------------------
// Distance and speed.
// ---------------------------------------------------------------------------

/** Distance in metres as `10 km` / `9.7 km` / `800 m`. */
export function formatDistance(meters: number): string {
	if (meters >= 1000) {
		const km = meters / 1000
		return Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`
	}
	return `${Math.round(meters)} m`
}

/** Distance kept in metres (swim distances), grouped: `1,500 m`. */
export function formatMeters(meters: number): string {
	return `${Math.round(meters).toLocaleString(DISPLAY_LOCALE)} m`
}

/**
 * Parse a distance entry (the inverse of `formatDistance`) into whole metres.
 * Accepts `8 km`, `9.7 km`, `800 m`, `1,500 m` (grouping commas), and a bare
 * number read in `defaultUnit` (`'km'` for athlete-facing distance fields,
 * pass `'m'` where metres are the native unit, e.g. structured step
 * distances). Returns `null` for anything else — never a guessed number.
 */
export function parseDistance(
	input: string,
	{ defaultUnit = 'km' }: { defaultUnit?: 'km' | 'm' } = {},
): number | null {
	let cleaned = input.trim().toLowerCase()
	// `1,500` grouping commas first, then a European decimal comma (`8,5`).
	cleaned = cleaned.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(',', '.')
	const match = /^(\d+(?:\.\d+)?)\s*(km|m)?$/.exec(cleaned)
	if (!match) return null
	const value = Number(match[1])
	const unit = (match[2] as 'km' | 'm' | undefined) ?? defaultUnit
	const meters = Math.round(unit === 'km' ? value * 1000 : value)
	return meters > 0 ? meters : null
}

/** Speed as `km/h` (one decimal) from metres-per-second. */
export function formatSpeed(metersPerSec: number): string {
	return `${(metersPerSec * 3.6).toFixed(1)} km/h`
}
