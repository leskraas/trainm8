/**
 * Small translations between the engine's product vocabulary and the domain's
 * own: weekdays by name (the domain counts Monday-first for the week pattern
 * and Sunday-first for stored availability), Effort Words, and undo tokens.
 */
import { type EffortWord } from '#app/utils/effort-word.ts'
import {
	calendarWeekdaysOf,
	type PatternWeekday,
	patternWeekdaysOfCalendar,
} from '#app/utils/plan-outline/week-pattern.ts'
import { type Effort, type Weekday, WEEKDAYS } from '../setup.types.ts'

/** Monday-first pattern weekday (0 = Monday) → name. */
export function weekdayOfPattern(day: PatternWeekday): Weekday {
	return WEEKDAYS[day]!
}

export function patternOfWeekday(day: Weekday): PatternWeekday {
	return WEEKDAYS.indexOf(day) as PatternWeekday
}

/** Names → Monday-first pattern weekdays, each once, in week order. */
export function patternDaysOf(days: readonly Weekday[]): PatternWeekday[] {
	return WEEKDAYS.flatMap((day, index) =>
		days.includes(day) ? [index as PatternWeekday] : [],
	)
}

/** Stored Sunday-first availability → names, in week order. */
export function weekdaysOfCalendar(days: readonly number[]): Weekday[] {
	return patternWeekdaysOfCalendar(days).map(weekdayOfPattern)
}

/** Names → stored Sunday-first availability. */
export function calendarOfWeekdays(days: readonly Weekday[]): number[] {
	return calendarWeekdaysOf(patternDaysOf(days))
}

/** The days not in `days`, in week order. */
export function otherWeekdays(days: readonly Weekday[]): Weekday[] {
	return WEEKDAYS.filter((day) => !days.includes(day))
}

const EFFORT: Record<EffortWord, Effort> = {
	rolig: 'easy',
	middels: 'moderate',
	hard: 'hard',
}

export function effortOf(word: EffortWord): Effort {
	return EFFORT[word]
}

/** `t:mm:ss` (or `m:ss` under an hour) from seconds. */
export function clockText(seconds: number): string {
	const h = Math.floor(seconds / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	const s = seconds % 60
	const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
	const ss = String(s).padStart(2, '0')
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * A finish time typed as `t:mm:ss` or `mm:ss` (`.` or `,` for `:`), or as
 * seconds. Null for anything that does not read.
 */
export function parseClock(input: string | number): number | null {
	if (typeof input === 'number') {
		return Number.isInteger(input) && input > 0 ? input : null
	}
	const cleaned = input.trim().replace(/[.,]/g, ':')
	const hms = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(cleaned)
	const ms = /^(\d{1,3}):([0-5]\d)$/.exec(cleaned)
	const total = hms
		? Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
		: ms
			? Number(ms[1]) * 60 + Number(ms[2])
			: 0
	return total > 0 ? total : null
}
