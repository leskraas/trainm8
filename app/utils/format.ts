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

import {
	QUALITY_ZONE_LABELS,
	VOLUME_CURRENCY_UNITS,
	VOLUME_UNITS,
} from './labels.ts'
import {
	CURRENCY_DECIMALS,
	type VolumeCurrency,
} from './plan-outline/derive.ts'
import { type EmphasisTerm } from './plan-outline/quality-mix.ts'
import { type Pct1RMBand, type RepRange } from './plan-outline/strength-goal.ts'
import { type DerivationUnit } from './plan-outline/volume-conversion.ts'

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

/** A fraction (0–1) as a whole-percent share, e.g. `0.42` → `42%`. */
export function formatPercent(fraction: number): string {
	return `${Math.round(fraction * 100)}%`
}

/**
 * A signed whole-percent rate — a **Volume Ramp**, a **Block Boundary Step** or a
 * cut's depth: `+5%` / `−12%` / `+0%`. A real minus sign (−), matching
 * {@link formatSignedTsb}, because these sit in prose the athlete reads.
 *
 * The sign is the point: a ramp and a boundary step can go either way, and `5%`
 * with no sign leaves which one it was to the reader.
 */
export function formatSignedPercent(fraction: number): string {
	const percent = Math.round(fraction * 100)
	return percent > 0
		? `+${percent}%`
		: percent < 0
			? `−${Math.abs(percent)}%`
			: '+0%'
}

/**
 * A rate as the **whole percent a form field carries** — the inverse of the
 * `percent / 100` a rate form does on the way in, and the reason it lives beside
 * {@link formatSignedPercent} rather than in a route (ADR 0023 §6: parsers live
 * beside their formatters).
 *
 * `null` is the **empty string**, because an unset rate is a choice the athlete made
 * — "no ramp", "follow the documented convention" — and a blank field is how that
 * choice is shown. `0` is a real authored rate and renders as `0`.
 */
export function formatRateField(fraction: number | null): string {
	return fraction == null ? '' : String(Math.round(fraction * 100))
}

/**
 * The fraction a whole-percent rate field currently carries — the inverse of
 * {@link formatRateField}, and the `percent / 100` a rate form does on the way in
 * (ADR 0023 §6: parsers live beside their formatters).
 *
 * `null` for a blank box, because blank is the athlete choosing the documented
 * convention rather than a rate of nothing (ADR 0044 §4) — and `null` for anything
 * unparseable, never a guessed number. `0` is a real authored rate and reads as `0`.
 *
 * Exists so a surface rendering "what this box means" never divides by 100 itself:
 * the conversion is one function beside the formatter that produced the string.
 */
export function parseRateField(
	typed: string | undefined | null,
): number | null {
	if (typed == null || typed.trim() === '') return null
	const percent = Number(typed)
	return Number.isFinite(percent) ? percent / 100 : null
}

/** A signed load delta (TSB, vs-last), e.g. `+5` / `-3` / `0`. */
export function formatSigned(value: number): string {
	const r = roundLoad(value)
	return r > 0 ? `+${r}` : String(r)
}

/**
 * A signed TSB for coach/replan reason sentences, matching the Coach card's
 * `+6` / `−18` — a real minus sign (−) to match the PRD examples, plus for
 * positives, and an explicit `+0` at zero.
 */
export function formatSignedTsb(value: number): string {
	const r = roundLoad(value)
	return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '+0'
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

// ---------------------------------------------------------------------------
// Plan weeks — the 1-based numbers an athlete counts their plan in
// ---------------------------------------------------------------------------

/**
 * A stretch of the plan by the weeks the athlete counts in: `Weeks 3–7`,
 * collapsing to `Week 3` where the stretch is a single week. An en dash, matching
 * {@link formatPaceRange} and {@link formatPct1RMBand}.
 *
 * One formatter for every stretch on the planning surface — an availability-fit
 * warning's span and a lifting block's window are the same string, and a block
 * that read `Weeks 3-3` beside a warning's `Week 3` would look like two different
 * measurements of the plan.
 */
export function formatWeekSpan(
	fromWeekInPlan: number,
	toWeekInPlan: number,
): string {
	return fromWeekInPlan === toWeekInPlan
		? `Week ${fromWeekInPlan}`
		: `Weeks ${fromWeekInPlan}–${toWeekInPlan}`
}

/** A count of weeks with its noun: `1 week`, `4 weeks`. */
export function formatWeeks(weeks: number): string {
	return weeks === 1 ? '1 week' : `${weeks} weeks`
}

// ---------------------------------------------------------------------------
// Plan volume — a Training Track's weekly figure in its own Volume Currency
// ---------------------------------------------------------------------------

/**
 * A volume's digits at its **Volume Currency**'s own precision — the decimals
 * come from `CURRENCY_DECIMALS`, the one source the Season Anchor pre-fill's
 * rounding also reads, so a pre-filled number and the number rendered back can
 * never disagree.
 */
function volumeDigits(value: number, currency: VolumeCurrency): string {
	return value.toFixed(CURRENCY_DECIMALS[currency])
}

/**
 * A weekly volume in a track's **Volume Currency**, with its unit: `55.0 km/wk`,
 * `5.8 h/wk`, `320 TSS/wk`, `18 sets/wk` (ADR 0043). Never accumulate across
 * currencies to reach one of these strings; each figure belongs to one track
 * (ADR 0043 §5).
 */
export function formatWeeklyVolume(
	value: number,
	currency: VolumeCurrency,
): string {
	return `${volumeDigits(value, currency)} ${VOLUME_CURRENCY_UNITS[currency]}`
}

/**
 * A weekly volume as the **number a form field carries** — the digits at the
 * currency's own precision and *no unit*, because the unit is the track's and a
 * hand-set week changes value only (ADR 0043). The inverse of the parse a volume
 * field does on the way in, which is why it lives beside
 * {@link formatWeeklyVolume} rather than in a route (ADR 0023 §6), the same
 * precedent {@link formatRateField} sets for a rate.
 *
 * `null` is the **empty string**, and that is the rule a **Week Volume Override**'s
 * field turns on: a week nobody hand-set reads as blank *plus* the rule's number
 * stated beside it, never as the rule's number sitting in the box (ADR 0044 §4–§5).
 * `0` is a real hand-set target — a week without training — and renders as `0`.
 */
export function formatWeeklyVolumeField(
	value: number | null,
	currency: VolumeCurrency,
): string {
	return value == null ? '' : volumeDigits(value, currency)
}

/**
 * The step a volume field moves in — its currency's own precision, from the same
 * `CURRENCY_DECIMALS` everything above rounds by: `0.1` for km and hours, `1` for
 * TSS and sets.
 *
 * A number rather than a string, so not formatting in the strict sense — but the
 * one place it belongs is beside {@link formatWeeklyVolumeField}, whose output it
 * has to accept: a box that refused a number this module would happily render back
 * would be the display layer disagreeing with itself (ADR 0023 §6). Read by every
 * surface that takes a weekly volume — a hand-set week's field and a **Season
 * Anchor**'s alike.
 */
export function volumeFieldStep(currency: VolumeCurrency): number {
	return 10 ** -CURRENCY_DECIMALS[currency]
}

/**
 * A volume total over several weeks — the pre-fill's window figure — in the same
 * currency, without the per-week suffix: `23.2 h`, `232 km`, `96 sets`.
 */
export function formatVolumeTotal(
	value: number,
	currency: VolumeCurrency,
): string {
	return `${volumeDigits(value, currency)} ${VOLUME_UNITS[currency]}`
}

// ---------------------------------------------------------------------------
// Weekly Capacity — the derivation behind a pre-filled hours-per-week figure
// ---------------------------------------------------------------------------

/**
 * Where a pre-filled **Weekly Capacity** came from, said in a sentence — or that it
 * came from nowhere, which is the answer for an athlete with no endurance training
 * in the window (ADR 0050 §2).
 *
 * The **empty case asks outright and says why it is asking.** That is the one thing
 * ADR 0050 requires of the copy beyond the arithmetic: an athlete with no history
 * must not meet a blank box that looks like the app forgot to fill it in.
 *
 * Deliberately its own sentence rather than the **Season Anchor** pre-fill's, though
 * both are read from the same window: an anchor states what the athlete will *plan
 * to* train and this states what they *have room for*, and "weekly hours" already
 * names both (`CONTEXT.md`). One shared sentence would be the ambiguity, shipped.
 */
export function formatWeeklyCapacityDerivation(
	derivation: {
		windowWeeks: number
		weeksTrained: number
		total: number
	} | null,
): string {
	if (!derivation) {
		return 'Nothing in your recent training to read this from, so this one is a question rather than a suggestion: how many hours a week do you have?'
	}
	const { windowWeeks, weeksTrained, total } = derivation
	// Named only where it is not the whole window: "you trained 2 of them" is what
	// tells an athlete who trained twice in four weeks why the number reads low.
	const trained =
		weeksTrained === windowWeeks ? '' : ` — you trained ${weeksTrained} of them`
	return `Your last ${windowWeeks} weeks of endurance training averaged ${formatWeeklyVolume(
		total / windowWeeks,
		'hours',
	)} (${formatVolumeTotal(total, 'hours')} in total)${trained}.`
}

// ---------------------------------------------------------------------------
// Intensity Emphasis — the label read off a Quality Session Mix
// ---------------------------------------------------------------------------

/**
 * The Intensity Emphasis label: dose beside kind, e.g. "2× threshold + 1× VO₂ max".
 * Never authored — it is read off the Quality Session Mix (ADR 0042 §5), so no
 * segment can be named for work it does not contain.
 *
 * The dose is half the label on purpose: a bare kind word says nothing about how
 * much, and 2 vs 4 interval sessions at matched volume and matched zone time
 * produced opposite outcomes (Tønnessen 2020, ADR 0042 §4). The multiplication
 * sign is `×` (U+00D7), matching how the ADRs and `CONTEXT.md` write it.
 *
 * No terms reads **"No quality sessions"** — the positive statement that the
 * segment has none, never "Unknown" and never a dash, because an empty mix is
 * something the athlete said rather than something the app failed to find
 * (ADR 0042 §6).
 */
export function formatEmphasisLabel(terms: readonly EmphasisTerm[]): string {
	if (terms.length === 0) return 'No quality sessions'
	return terms
		.map((term) => `${term.sessionsPerWeek}× ${QUALITY_ZONE_LABELS[term.zone]}`)
		.join(' + ')
}

// ---------------------------------------------------------------------------
// Availability fit — the sessions a stretch of the plan asks a week for
// ---------------------------------------------------------------------------

/**
 * The sessions a week asks for across both tracks, as a phrase: `3 quality
 * sessions and 2 lifting sessions` (ADR 0047 §4).
 *
 * **Both halves where both exist, and only the one that does otherwise.** A zero
 * half is dropped rather than printed, because "0 lifting sessions" is a sentence
 * about nothing — a pure runner is not told about lifting they do not do, and a
 * pure lifter is not told about quality sessions they never authored.
 *
 * No comparison and no verdict: the surface says what this is measured against
 * (days against days) and that nothing is blocked, because those are claims about
 * the check rather than about the number.
 */
export function formatSessionCounts({
	qualitySessions,
	strengthSessions,
}: {
	qualitySessions: number
	strengthSessions: number
}): string {
	return [
		qualitySessions > 0
			? `${qualitySessions} quality ${qualitySessions === 1 ? 'session' : 'sessions'}`
			: null,
		strengthSessions > 0
			? `${strengthSessions} lifting ${strengthSessions === 1 ? 'session' : 'sessions'}`
			: null,
	]
		.filter((half): half is string => half != null)
		.join(' and ')
}

// ---------------------------------------------------------------------------
// Strength prescription — the two figures a Strength Goal derives (ADR 0047 §3)
// ---------------------------------------------------------------------------

/**
 * A derived `%1RM` band: `80–100% 1RM`. An en dash, matching
 * {@link formatPaceRange}, and whole percent, matching the band's own numbers.
 *
 * Rendered from the goal's prescription and never from an authored pair — the band
 * is derived and cannot be typed (ADR 0047 §3), so nothing may present it as a
 * choice the athlete made.
 */
export function formatPct1RMBand(band: Pct1RMBand): string {
	return `${band.minPct1RM}–${band.maxPct1RM}% 1RM`
}

/**
 * The authored `%1RM` loads a session carries, listed: `60%, 65% 1RM`.
 *
 * Carries the `1RM` unit for {@link formatPct1RMBand}'s reason — the two read in one
 * sentence ("authored at 62.5%, 65% 1RM, outside the 80–100% 1RM…"), and a list that
 * left its unit to the caller would let the two halves of that sentence disagree.
 *
 * **The figure is shown as authored, never rounded.** `ExerciseSet.pct1RM` is a
 * first-class authored quantity (ADR 0047 §3), so a set typed at `62.5%` reads back
 * as `62.5%` — reporting it as `63%` would state a load the athlete never wrote, in
 * a warning whose whole subject is what they did write. A trailing `.0` is dropped
 * (`65%`, not `65.0%`), which changes the digits shown and never the value.
 *
 * The band it is read beside stays whole percent because {@link formatPct1RMBand}'s
 * bounds are whole by construction, not because the two agreed on a precision.
 */
export function formatPct1RMs(percents: readonly number[]): string {
	return `${percents.map((pct) => `${String(pct)}%`).join(', ')} 1RM`
}

/**
 * A derived rep range: `1–6 reps`, or `6 reps` when the range is a single number.
 * The other half of what the goal prescribes, and the only other figure it gives —
 * sets per week stay the Season Anchor's and the Volume Ramp's (ADR 0047 §1/§3).
 */
export function formatRepRange(reps: RepRange): string {
	return reps.minReps === reps.maxReps
		? `${reps.minReps} reps`
		: `${reps.minReps}–${reps.maxReps} reps`
}

// ---------------------------------------------------------------------------
// The Volume Conversion's derivation chain (ADR 0045 §10)
// ---------------------------------------------------------------------------

/**
 * One number of a derivation chain, at the precision its unit is read at:
 * `37.5 km`, `1.2 h`, `350 TSS`, `IF 0.873`, `76 TSS/h`, `12.4 km/h`, `0.83`.
 *
 * The chain is **structured data** rather than a preformatted string precisely so
 * that this layer renders it (ADR 0045 §10), and it goes through one function
 * because the same chain is read in the season chart's inspect panel and will be
 * read wherever else a derived reading is inspected — two renderings of `IF 0.873`
 * disagreeing on decimals would make one number look like two.
 *
 * Three decimals on an intensity factor and none on TSS per hour is not a house
 * style slip: an IF's whole working range is 0.5–1.1, so two decimals collapse
 * neighbouring recipe bands onto the same string, while a TSS/hour figure a
 * fraction apart is the same statement.
 */
export function formatDerivationValue(
	unit: DerivationUnit,
	value: number,
): string {
	switch (unit) {
		case 'km':
			return `${value.toFixed(1)} km`
		case 'hours':
			return `${value.toFixed(1)} h`
		case 'tss':
			return `${Math.round(value)} TSS`
		case 'if':
			return `IF ${value.toFixed(3)}`
		case 'tss-per-hour':
			return `${Math.round(value)} TSS/h`
		case 'km-per-hour':
			return `${value.toFixed(1)} km/h`
		case 'ratio':
			return value.toFixed(2)
	}
}
