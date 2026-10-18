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
import { type Discipline } from '../workout-schema.ts'
import { type StampDay, type StampLiftingSlot } from './stamp.ts'
import { proposeStarterPattern } from './starter-pattern.ts'
import {
	calendarWeekdaysOf,
	patternWeekdaysOf,
	type PatternWeekday,
} from './week-pattern.ts'

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

// ---------------------------------------------------------------------------
// Endurance tracks and Simple Activities (#598)
// ---------------------------------------------------------------------------

/**
 * One Week Pattern row of an endurance track or a Simple Activity, as a day
 * choice rewrites it: a `share` of the track's week, or a `fixed` session the
 * athlete authored (a Simple Activity is always one).
 */
export type TrackPatternRow = {
	kind: 'share' | 'fixed'
	weekday: PatternWeekday
	/** A share's relative weight; `null` on a fixed row. */
	weight: number | null
	/** A fixed row's prescription, or a share's optional shape. */
	workoutId: string | null
}

/** Which rows a day choice is for: a track, or one Simple Activity on it. */
export type DayChoiceUnit = { trackId: string; workoutId?: string }

const byWeekday = (a: { weekday: number }, b: { weekday: number }) =>
	a.weekday - b.weekday

/**
 * A track's rows when it trains only on `days` (ADR 0104 §4): one session a
 * day, every day chosen, and the track's week spread over them — the shares
 * are weights, so the stamp divides the whole week among the days there are.
 *
 * - A session the athlete authored (`fixed`) is never dropped: one on a
 *   chosen day stays, and one elsewhere moves to the nearest chosen day that
 *   holds none of the track's sessions yet (the nearest at all where every
 *   chosen day does), the earlier on a tie.
 * - A share already on a chosen day keeps its weight and its shape.
 * - Every other chosen day gets a bare share of the track's ordinary weight.
 * - A track that had a **Long day** keeps one: on its old day where that is
 *   still chosen, otherwise on the last chosen share day.
 *
 * Pure and deterministic: the same rows and days give the same rows.
 */
export function trackRowsOnDays(
	rows: readonly TrackPatternRow[],
	days: readonly PatternWeekday[],
): TrackPatternRow[] {
	const chosen = patternWeekdaysOf(days)
	if (chosen.length === 0) return []
	const shares = rows.filter((row) => row.kind === 'share')
	const weights = shares.map((row) => row.weight ?? 1)
	const ordinary = weights.length > 0 ? Math.min(...weights) : 1
	const long = weights.length > 0 ? Math.max(...weights) : 1

	const placed: TrackPatternRow[] = []
	const holds = (weekday: number) =>
		placed.some((row) => row.weekday === weekday)
	const fixed = rows.filter((row) => row.kind === 'fixed').sort(byWeekday)
	// Those already on a chosen day first, so a moved one never takes their day.
	for (const row of fixed) {
		if (chosen.includes(row.weekday)) placed.push(row)
	}
	for (const row of fixed) {
		if (chosen.includes(row.weekday)) continue
		const open = chosen.filter((weekday) => !holds(weekday))
		placed.push({
			...row,
			weekday: nearestDay(open.length > 0 ? open : chosen, row.weekday),
		})
	}
	for (const weekday of chosen) {
		if (holds(weekday)) continue
		const kept = shares.find((row) => row.weekday === weekday)
		placed.push(
			kept ?? { kind: 'share', weekday, weight: ordinary, workoutId: null },
		)
	}

	const laidShares = placed
		.filter((row) => row.kind === 'share')
		.sort(byWeekday)
	const hasLong = laidShares.some((row) => (row.weight ?? 1) > ordinary)
	if (long > ordinary && laidShares.length >= 2 && !hasLong) {
		const last = laidShares.at(-1)!
		placed[placed.indexOf(last)] = { ...last, weight: long }
	}
	return placed.sort(byWeekday)
}

/**
 * A track's rows when it goes back to _La appen velge_ (spec #588 story 21):
 * its days dealt again by the starter pattern's rule (ADR 0104 §5) — the days
 * of the athlete's **Training Availability** (Monday first; `null` where never
 * set, and then the starter's default week) that the plan's other tracks
 * leave, at most one endurance session a day, its **Long day** the last of
 * them, weighted double. A session the athlete authored (`fixed`) stays where
 * it is, and no share is laid beside it.
 */
export function trackRowsByRule({
	trackId,
	discipline,
	rows,
	available,
	others,
	hardSessions = 0,
}: {
	trackId: string
	discipline: Discipline
	rows: readonly TrackPatternRow[]
	available: readonly PatternWeekday[] | null
	/** The plan's other endurance tracks and Simple Activities, on their days. */
	others: ReadonlyArray<{
		trackId: string
		discipline: Discipline
		days: readonly PatternWeekday[]
	}>
	/** The most hard sessions a week the track's mix asks for. */
	hardSessions?: number
}): TrackPatternRow[] {
	const proposal = proposeStarterPattern({
		trainableWeekdays: available ? calendarWeekdaysOf(available) : null,
		tracks: [
			...others.map((other) => ({
				trackId: other.trackId,
				discipline: other.discipline,
				sessionsPerWeek: null,
				weekdays: other.days,
			})),
			{ trackId, discipline, sessionsPerWeek: null, hardSessions },
		],
	})
	const fixed = rows.filter((row) => row.kind === 'fixed')
	const shares: TrackPatternRow[] = (proposal?.days ?? [])
		.filter(
			(day) =>
				day.trackId === trackId &&
				!fixed.some((row) => row.weekday === day.weekday),
		)
		.map((day) => ({
			kind: 'share',
			weekday: day.weekday,
			weight: day.weight,
			workoutId: null,
		}))
	return [...fixed, ...shares].sort(byWeekday)
}

/** The day of `days` nearest `from` on the week's wheel, the earlier on a tie. */
function nearestDay(
	days: readonly PatternWeekday[],
	from: number,
): PatternWeekday {
	let best = days[0]!
	let bestGap = Infinity
	for (const day of days) {
		const apart = Math.abs(day - from)
		const gap = Math.min(apart, 7 - apart)
		if (gap < bestGap) {
			best = day
			bestGap = gap
		}
	}
	return best
}

/**
 * A track's Pinned days once the athlete's **Training Availability** changes
 * (spec #588 story 19): the days still available are kept, the rest are
 * `lost`, and a track that loses them all goes back to _La appen velge_
 * (`kept: null`). Both Monday first.
 */
export function pinnedDaysWithin(
	pinned: readonly PatternWeekday[],
	available: readonly PatternWeekday[],
): { kept: PatternWeekday[] | null; lost: PatternWeekday[] } {
	const days = patternWeekdaysOf(pinned)
	const kept = days.filter((day) => available.includes(day))
	return {
		kept: kept.length > 0 ? kept : null,
		lost: days.filter((day) => !available.includes(day)),
	}
}

/**
 * The stamp's input with one track's (or one Simple Activity's) rows swapped
 * for `rows` — how the preview lays the coming weeks before anything is
 * written (ADR 0084). A fixed row keeps what the stamp read off its Workout
 * (its price, zone and Effort Word) and a share its shape's, so a moved
 * session is laid as it was, only on another day.
 */
export function withTrackRows(
	laid: { days: readonly StampDay[]; lifting: readonly StampLiftingSlot[] },
	unit: DayChoiceUnit,
	rows: readonly TrackPatternRow[],
): { days: StampDay[]; lifting: StampLiftingSlot[] } {
	const ofUnit = (day: StampDay) =>
		day.trackId === unit.trackId &&
		(unit.workoutId == null || day.workoutId === unit.workoutId)
	const old = laid.days.filter(ofUnit)
	const days = laid.days.filter((day) => !ofUnit(day))
	rows.forEach((row, index) => {
		const was =
			row.workoutId == null
				? undefined
				: old.find(
						(day) => day.kind === row.kind && day.workoutId === row.workoutId,
					)
		const position = {
			dayId: `chosen-${unit.trackId}-${unit.workoutId ?? 'track'}-${index}`,
			weekday: row.weekday,
			// After whatever the day already holds.
			orderInDay:
				Math.max(
					-1,
					...days
						.filter((day) => day.weekday === row.weekday)
						.map((day) => day.orderInDay),
				) + 1,
			trackId: unit.trackId,
			workoutId: row.workoutId,
			zone: was?.zone ?? null,
			effort: was?.effort ?? null,
		}
		days.push(
			row.kind === 'fixed'
				? {
						...position,
						kind: 'fixed',
						volume: was?.kind === 'fixed' ? was.volume : null,
						shapeVolume: null,
					}
				: {
						...position,
						kind: 'share',
						weight: row.weight ?? 1,
						shapeVolume: was?.shapeVolume ?? null,
					},
		)
	})
	return { days, lifting: [...laid.lifting] }
}
