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

/** The men's world record at each anchor, in seconds — World Athletics'
 * ratified records as of 2026-10-25 (the faster of track and road where both
 * exist): 1500 m 3:26.00 (El Guerrouj, 1998), 3000 m 7:17.55 (Ingebrigtsen,
 * 2024), 5000 m 12:35.36 and 10 000 m 26:11.00 (Cheptegei, 2020), half
 * marathon 57:30 (Kejelcha, 2024), marathon 2:00:35 (Kiptum, 2023). */
const WORLD_RECORD_SEC: Record<RaceAnchor, number> = {
	'1500m': 206,
	'3k': 437.55,
	'5k': 755.36,
	'10k': 1571,
	hm: 3450,
	marathon: 7235,
}

/** The band refuses only what is physically impossible (owner, 2026-10-25,
 * ADR 0007): the floor is 5 % faster than world-record pace, so a new record
 * saves the day it is run and only a typo — most often `3:15` meant as 3 h 15
 * for a marathon — falls below it. 5k: 11:57; marathon: 1:54:33. */
const FLOOR_OF_WORLD_RECORD = 0.95

/** The ceiling is a slow walk with margin: 30:00/km is 2 km/h (0.56 m/s),
 * under half of comfortable adult walking speed, about 1.2–1.4 m/s by age
 * (Bohannon & Williams Andrews, "Normal walking speed: a descriptive
 * meta-analysis", Physiotherapy 97(3), 2011). A marathon walked in 15 hours
 * (21:20/km) saves; `999:59` typed for a 5k (200:00/km) does not. */
const SLOWEST_SEC_PER_KM = 1800

/** Whether `timeSec` is a time a person could run at `anchor`. */
export function isPlausibleFinishTime(
	anchor: RaceAnchor,
	timeSec: number,
): boolean {
	const pace = paceSecPerKm(timeSec, RACE_ANCHOR_DISTANCE_M[anchor])
	return (
		timeSec >= Math.floor(WORLD_RECORD_SEC[anchor] * FLOOR_OF_WORLD_RECORD) &&
		pace != null &&
		pace <= SLOWEST_SEC_PER_KM
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
