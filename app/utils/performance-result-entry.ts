/**
 * The pure rules for a typed **Performance Result** (#464): how a finish time
 * is read, which sources the form offers, and which times are plausible at a
 * **Race Anchor**. Kept out of the `.server` writer so the form can import the
 * same list and rules the writer enforces.
 */
import { RACE_ANCHOR_DISTANCE_M, type RaceAnchor } from './workout-schema.ts'

export const PERFORMANCE_SOURCES = ['race', 'timeTrial'] as const
export type PerformanceSource = (typeof PERFORMANCE_SOURCES)[number]

/** A finish time as a race clock writes it — `41:30` or `1:32:00`, with `.`
 * or `,` accepted for `:` as Norwegians often write it — in seconds, or null.
 * A bare number is refused: `41` could be minutes or seconds, and guessing
 * would put a pace nobody ran behind a target. */
export function parseFinishTime(input: string): number | null {
	const clock = input.trim().replace(/[.,]/g, ':')
	const match = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(clock)
	if (!match) return null
	const hours = Number(match[1] ?? 0)
	const minutes = Number(match[2])
	if (match[1] != null && minutes > 59) return null
	const total = hours * 3600 + minutes * 60 + Number(match[3])
	return total > 0 ? total : null
}

/** Pace in seconds per km, rounded as a `racePace` target reads it; null for a
 * distance of zero. */
export function paceSecPerKm(
	timeSec: number,
	distanceM: number,
): number | null {
	return distanceM > 0 ? Math.round(timeSec / (distanceM / 1000)) : null
}

/** Just under the world record at each anchor: no athlete runs faster, so a
 * faster time is a typo — most often `3:15` meant as 3 h 15 for a marathon. */
const FASTEST_SEC: Record<RaceAnchor, number> = {
	'1500m': 200,
	'3k': 430,
	'5k': 750,
	'10k': 1560,
	hm: 3420,
	marathon: 7200,
}

/** Slower than 20:00 per km is slower than a walk: `999:59` for a 5k. */
const SLOWEST_SEC_PER_KM = 1200

/** Whether `timeSec` is a time a person could run at `anchor`. */
export function isPlausibleFinishTime(
	anchor: RaceAnchor,
	timeSec: number,
): boolean {
	const pace = paceSecPerKm(timeSec, RACE_ANCHOR_DISTANCE_M[anchor])
	return (
		timeSec >= FASTEST_SEC[anchor] && pace != null && pace <= SLOWEST_SEC_PER_KM
	)
}

/** A `YYYY-MM-DD` day that exists on the calendar (no 31 February) and is
 * not before 1900. */
export function isCalendarDay(day: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
	const date = new Date(`${day}T00:00:00Z`)
	return (
		!Number.isNaN(date.getTime()) &&
		date.toISOString().slice(0, 10) === day &&
		date.getUTCFullYear() >= 1900
	)
}
