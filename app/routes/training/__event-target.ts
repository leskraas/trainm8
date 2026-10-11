/**
 * An Event's target and dates as the Events pages say and read them, in
 * Norwegian (ADR 0081): a finish time as a clock (`3:30:00`), a pace as
 * `4:15 /km`, a distance in km with a decimal comma (`42,2 km`).
 *
 * The stored target stays what `EventTargetSchema` says (seconds, seconds per
 * km, metres). Only the words an athlete types and reads change, so the form
 * never asks for "10800 seconds" and the detail never prints `42.2 km`.
 *
 * Every reader is the inverse of the writer beside it, and returns `null` for
 * anything it cannot read — never a guessed number.
 */
import { type EventTarget } from '#app/utils/event-schema.ts'
import {
	formatClockDuration,
	formatNbDate,
	formatNbDateSpan,
	formatNbVolumeFigure,
	formatNbWeekday,
	formatPaceClock,
	parsePace,
} from '#app/utils/format.ts'
import { EVENTS_LABELS, NB_TARGET_KIND_LABELS } from '#app/utils/labels.ts'

/** A clock's separators as a phone's number pad offers them: `:`, `.` or `,`. */
const CLOCK_SEPARATOR = /[.,]/g

/**
 * A finish time: `t:mm:ss` or `mm:ss` (the two shapes `formatClockDuration`
 * writes), with `.` or `,` accepted for `:` because a phone's decimal pad has
 * no colon. Seconds, or `null`.
 */
export function parseFinishTime(input: string): number | null {
	const cleaned = input.trim().replace(CLOCK_SEPARATOR, ':')
	const hms = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(cleaned)
	const ms = /^(\d{1,3}):([0-5]\d)$/.exec(cleaned)
	const total = hms
		? Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
		: ms
			? Number(ms[1]) * 60 + Number(ms[2])
			: 0
	return total > 0 ? total : null
}

/** A pace per km as `m:ss` (`.`/`,` accepted for `:`). Seconds per km, or `null`. */
export function parseTargetPace(input: string): number | null {
	return parsePace(input.trim().replace(CLOCK_SEPARATOR, ':'))
}

/** A distance in km, with a decimal comma or point (`42,2`). Metres, or `null`. */
export function parseTargetKm(input: string): number | null {
	const match = /^(\d+(?:[.,]\d+)?)\s*(?:km)?$/i.exec(input.trim())
	if (!match) return null
	const meters = Math.round(Number(match[1]!.replace(',', '.')) * 1000)
	return meters > 0 ? meters : null
}

/** A placement, a whole number from 1. */
export function parseTargetPlacement(input: string): number | null {
	const match = /^\d+$/.exec(input.trim())
	if (!match) return null
	const position = Number(match[0])
	return position >= 1 ? position : null
}

/** A distance in km as the form pre-fills it: `42,195`, `10`. */
export function formatTargetKmEntry(meters: number): string {
	return String(meters / 1000).replace('.', ',')
}

/**
 * What the edit form shows in each target field for a stored target: the
 * same words the athlete would type, so saving unchanged saves the same value.
 */
export function targetEntryOf(target: EventTarget | null) {
	return {
		targetKind: target?.kind ?? '',
		targetTime:
			target?.kind === 'time' ? formatClockDuration(target.seconds) : '',
		targetPace: target?.kind === 'pace' ? formatPaceClock(target.secPerKm) : '',
		targetDistance:
			target?.kind === 'distance' ? formatTargetKmEntry(target.meters) : '',
		targetPlacement:
			target?.kind === 'placement' ? String(target.position) : '',
		targetDescription: target?.kind === 'qualitative' ? target.description : '',
	}
}

/**
 * A target in words: `3:30:00`, `4:15 /km`, `42,2 km`, `Topp 3`, `Fullføre`,
 * or the athlete's own sentence.
 */
export function targetText(target: EventTarget): string {
	switch (target.kind) {
		case 'time':
			return formatClockDuration(target.seconds)
		case 'pace':
			return `${formatPaceClock(target.secPerKm)} /km`
		case 'distance':
			return `${formatNbVolumeFigure(target.meters / 1000, 'km')} km`
		case 'placement':
			return EVENTS_LABELS.targetTop(target.position)
		case 'finish':
			return NB_TARGET_KIND_LABELS.finish
		case 'qualitative':
			return target.description
	}
}

/**
 * An Event's days: `24. okt 2026`, or `24.–26. okt 2026` for one that spans
 * several (`30. des 2026 – 2. jan 2027` across a year). Event dates are
 * calendar-day anchors stored at UTC midnight, so they are read in UTC and
 * never shift with a viewer (ADR 0023, #172).
 */
export function eventDaysText(
	startDate: Date | string,
	endDate: Date | string | null,
): string {
	const start = formatNbDate(startDate, 'UTC')
	if (!endDate) return start
	const end = formatNbDate(endDate, 'UTC')
	if (end === start) return start
	// Within one year the year is said once, after the span: `7.–9. nov 2026`.
	const year = (date: Date | string) => new Date(date).getUTCFullYear()
	return year(startDate) === year(endDate)
		? `${formatNbDateSpan(startDate, endDate, 'UTC')} ${year(endDate)}`
		: `${start} – ${end}`
}

/** `lørdag 24. okt 2026`: the first day with its weekday, for the detail. */
export function eventDayLongText(startDate: Date | string): string {
	return `${formatNbWeekday(startDate, 'UTC')} ${formatNbDate(startDate, 'UTC')}`
}
