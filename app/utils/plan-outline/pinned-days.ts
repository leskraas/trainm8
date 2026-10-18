// **Pinned days** per Training Track (#597, ADR 0104 §4): the weekdays the
// athlete chose for a track, on the Week Pattern's Monday-first axis
// (0 = Monday … 6 = Sunday). `null` is _La appen velge_, the default: the day
// rule lays the track. Training Availability is Sunday-first, and the two meet
// only at the profile edge (`patternWeekdaysOfCalendar`), never here.
//
// On the **strength** track the Pinned days are written as `fixed` strength
// days in the Week Pattern, which the stamp lays first and every other track's
// mix steps around (ADR 0104 §2); their count is the **Strength Frequency**.
// _La appen velge_ writes **lifting slots** instead, one per lift, which the
// stamp lays each week after the endurance mix (§3). Pure: no I/O.

import { STRENGTH_PER_WEEK_CHOICES } from '../first-run/start-draft.ts'
import { type StampDay, type StampLiftingSlot } from './stamp.ts'
import { patternWeekdaysOf, type PatternWeekday } from './week-pattern.ts'

/**
 * The most days a strength track may pin: the largest **Strength Frequency**
 * the athlete can answer (ADR 0103), since the number of Pinned days *is* the
 * frequency.
 */
export const MAX_PINNED_STRENGTH_DAYS = Math.max(...STRENGTH_PER_WEEK_CHOICES)

/**
 * A stored `pinnedDays` column as weekdays, Monday first, each once — or
 * `null` for _La appen velge_. An unreadable value, an empty list or one with
 * a day outside 0–6 is no choice rather than a guessed one.
 */
export function parsePinnedDays(
	stored: string | null | undefined,
): PatternWeekday[] | null {
	if (stored == null) return null
	let parsed: unknown
	try {
		parsed = JSON.parse(stored)
	} catch {
		return null
	}
	if (!Array.isArray(parsed) || parsed.length === 0) return null
	if (!parsed.every((day) => typeof day === 'number')) return null
	const days = patternWeekdaysOf(parsed)
	return days.length === parsed.length ? days : null
}

/** Weekdays as the `pinnedDays` column stores them; `null` stays `null`. */
export function serializePinnedDays(
	days: readonly PatternWeekday[] | null,
): string | null {
	return days == null || days.length === 0
		? null
		: JSON.stringify(patternWeekdaysOf(days))
}

/**
 * The strength track's Pinned days: what the athlete chose, or — for a plan
 * from before they could choose — its stored `fixed` strength days, which are
 * read as pinned and never moved (ADR 0104 §4). Lifting slots are not pinned:
 * the app chooses their days. `null` is _La appen velge_.
 */
export function strengthPinnedDays(
	track: { pinnedDays: string | null },
	rows: ReadonlyArray<{ kind: string; weekday: number | null }>,
): PatternWeekday[] | null {
	const chosen = parsePinnedDays(track.pinnedDays)
	if (chosen) return chosen
	const fixed = patternWeekdaysOf(
		rows.flatMap((row) =>
			row.kind === 'fixed' && row.weekday != null ? [row.weekday] : [],
		),
	)
	return fixed.length > 0 ? fixed : null
}

/** Why a set of days cannot be a strength track's Pinned days. */
export type PinnedDaysRefusal = 'no-days' | 'outside-availability' | 'too-many'

/**
 * Whether `days` can be pinned: at least one, no more than a Strength
 * Frequency can be, and every one a day of the athlete's **Training
 * Availability** (Monday first; `null` where they never said, and then any
 * day is theirs to choose). `null` when they can.
 */
export function pinnedDaysRefusal(
	days: readonly PatternWeekday[],
	available: readonly PatternWeekday[] | null,
	max: number = MAX_PINNED_STRENGTH_DAYS,
): PinnedDaysRefusal | null {
	if (days.length === 0) return 'no-days'
	if (available && days.some((day) => !available.includes(day))) {
		return 'outside-availability'
	}
	if (days.length > max) return 'too-many'
	return null
}

/** One strength row of the Week Pattern a choice writes. */
export type StrengthPatternRow =
	| { kind: 'fixed'; weekday: PatternWeekday; workoutId: string }
	| { kind: 'lifting'; weekday: null; workoutId: string }

/**
 * The strength track's Week Pattern rows for a choice: a `fixed` day on each
 * Pinned day, or, for _La appen velge_, `count` lifting slots. Every row
 * lifts `workoutId`, the session the track already copies.
 */
export function strengthPatternRows(
	choice: readonly PatternWeekday[] | null,
	count: number,
	workoutId: string,
): StrengthPatternRow[] {
	return choice
		? patternWeekdaysOf(choice).map((weekday) => ({
				kind: 'fixed' as const,
				weekday,
				workoutId,
			}))
		: Array.from({ length: Math.max(count, 0) }, () => ({
				kind: 'lifting' as const,
				weekday: null,
				workoutId,
			}))
}

/**
 * The stamp's input with a strength track's days swapped for a choice — how
 * the preview lays the coming weeks as they would be, by the stamp's own
 * arithmetic, before anything is written (ADR 0084). The track's old days
 * and slots go; {@link strengthPatternRows} come in.
 */
export function withStrengthChoice(
	laid: { days: readonly StampDay[]; lifting: readonly StampLiftingSlot[] },
	{
		trackId,
		choice,
		count,
		workoutId,
	}: {
		trackId: string
		choice: readonly PatternWeekday[] | null
		count: number
		workoutId: string
	},
): { days: StampDay[]; lifting: StampLiftingSlot[] } {
	const days = laid.days.filter((day) => day.trackId !== trackId)
	const lifting = laid.lifting.filter((slot) => slot.trackId !== trackId)
	strengthPatternRows(choice, count, workoutId).forEach((row, index) => {
		if (row.kind === 'fixed') {
			days.push({
				dayId: `pinned-${trackId}-${row.weekday}`,
				weekday: row.weekday,
				// After whatever the day already holds, as a lift always is.
				orderInDay:
					Math.max(
						-1,
						...days
							.filter((day) => day.weekday === row.weekday)
							.map((day) => day.orderInDay),
					) + 1,
				trackId,
				kind: 'fixed',
				volume: null,
				workoutId: row.workoutId,
				shapeVolume: null,
				zone: null,
				effort: null,
			})
		} else {
			lifting.push({
				dayId: `slot-${trackId}-${index}`,
				trackId,
				workoutId: row.workoutId,
				orderInDay: index,
			})
		}
	})
	return { days, lifting }
}
