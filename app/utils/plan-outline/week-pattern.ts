// The **Week Pattern**: the microcycle the athlete authors once instead of
// scheduling eighteen weeks of sessions by hand, and the reading taken off it —
// what each day resolves to against a chosen week's *derived* volume target.
//
// Pure, and deliberately so: the same arithmetic serves the preview the athlete
// reads before committing and the stamp that writes sessions later, so the two
// can never disagree.
//
// Four properties this module exists to hold (ADR 0044 §7):
//
// - **A pattern holds no absolute quantity.** The week's target is derived and
//   changes week to week (ADR 0040 §1), so a day is either *fixed* — a Workout
//   prescribed as authored, `5×1000m Z4` in a 50 km week and in a 65 km week
//   alike — or a *share*, a relative weight that absorbs its part of what is
//   left. There is no third kind and no stored volume.
// - **Weights are relative and normalised.** "The long run is 2.5× a weekday
//   run" holds at any volume, and "the shares sum to 97%" is unrepresentable
//   because the fractions are computed here rather than authored.
// - **Fixed volume is subtracted before the shares divide the remainder**, and
//   fixed days that overshoot the week are warned about and never corrected —
//   the athlete prescribed those intervals, so the app does not shrink them.
// - **A day carries no zone.** The zone is resolved from the session content, so
//   the mix-disagreement check reads what the week actually holds rather than a
//   claim a pattern day made about it (ADR 0042 §9).
//
// The warnings carry numbers and no wording; the surface words them, exactly as
// `ramp-guard.ts` and `quality-mix.ts` do.

import { sumBlockDistanceM, sumBlockDurationMin } from '../dashboard.ts'
import { roundToCurrency, type VolumeCurrency } from './derive.ts'

/**
 * The days of a pattern, **Monday first**, matching the Training Week (ADR 0019)
 * rather than the Sunday-first calendar index ADR 0005 stores on Athlete
 * Profile. The two only meet through {@link calendarWeekdayOf}.
 */
export const PATTERN_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const
export type PatternWeekday = (typeof PATTERN_WEEKDAYS)[number]

/**
 * Narrows a stored `weekday` integer. The column is a plain `Int` with the 0–6
 * rule as a CHECK in the migration, so a row read back is a `number` until
 * something asserts otherwise. This is that something.
 */
export function isPatternWeekday(weekday: number): weekday is PatternWeekday {
	return PATTERN_WEEKDAYS.some((candidate) => candidate === weekday)
}

/**
 * A pattern weekday as the Sunday-first index the rest of the app stores —
 * `trainableWeekdays`, `weekStartsOn` and `WEEKDAY_LABELS` are all Sunday-first
 * per ADR 0005, while a Training Week runs Monday–Sunday per ADR 0019. Every
 * crossing between the two conventions goes through here.
 */
export function calendarWeekdayOf(weekday: PatternWeekday): number {
	return (weekday + 1) % 7
}

export type PatternDayKind = 'fixed' | 'share'

/**
 * One slot in a pattern, in the shape the resolution needs. A `fixed` day
 * carries the volume its Workout prescribes, read in the track's own currency
 * ({@link fixedDayVolume}) and `null` where that currency cannot read it. A
 * `share` day carries its relative weight and nothing else.
 */
export type PatternDaySpec = {
	dayId: string
	weekday: PatternWeekday
	orderInDay: number
	trackId: string
} & (
	| { kind: 'fixed'; volume: number | null }
	| { kind: 'share'; weight: number }
)

/** A track, and the week's derived target in that track's own currency. */
export type PatternTrackSpec = {
	trackId: string
	currency: VolumeCurrency
	/** `null` is an Unavailable Metric: no anchor in force, or a week outside the plan. */
	target: number | null
}

export type PatternDayReading = {
	dayId: string
	weekday: PatternWeekday
	orderInDay: number
	trackId: string
	kind: PatternDayKind
	/** The day's volume in the track's currency; `null` where it cannot be read. */
	value: number | null
	/** Share days only: the normalised fraction of the remainder this day absorbs. */
	share: number | null
}

export type PatternWarning =
	| {
			kind: 'fixed-exceeds-target'
			trackId: string
			fixed: number
			target: number
	  }
	| { kind: 'fixed-day-unpriced'; trackId: string; days: number }

export type PatternTrackReading = {
	trackId: string
	currency: VolumeCurrency
	target: number | null
	/** What the fixed days prescribe in total; `null` when one of them cannot be read. */
	fixed: number | null
	/** `target − fixed`, negative where the fixed days overshoot the week. */
	remainder: number | null
	/** The part of the remainder no day absorbs, because the pattern has no share day. */
	unallocated: number | null
	days: PatternDayReading[]
	warnings: PatternWarning[]
}

/**
 * Relative weights as fractions of one. This is the whole of "normalised": the
 * fractions are derived at resolve time from whatever weights the athlete
 * authored, so no stored pattern can add up to anything but the week.
 */
export function normaliseWeights(weights: readonly number[]): number[] {
	const total = weights.reduce((sum, weight) => sum + weight, 0)
	if (total === 0) return weights.map(() => 0)
	return weights.map((weight) => weight / total)
}

/**
 * What each day of a pattern resolves to against one week, per Training Track.
 *
 * Each track is resolved on its own, drawing from its own volume in its own
 * currency: a swim day takes swim volume and a strength day takes strength
 * volume, because no figure spans incommensurable tracks (ADR 0043 §5, ADR
 * 0046).
 */
export function resolveWeekPattern({
	days,
	tracks,
}: {
	days: readonly PatternDaySpec[]
	tracks: readonly PatternTrackSpec[]
}): PatternTrackReading[] {
	return tracks.map((track) => resolveTrack(track, days))
}

function resolveTrack(
	track: PatternTrackSpec,
	allDays: readonly PatternDaySpec[],
): PatternTrackReading {
	const days = allDays
		.filter((day) => day.trackId === track.trackId)
		.sort(byPosition)

	const fixedDays = days.filter(isFixedDay)
	const shareDays = days.filter(isShareDay)
	const warnings: PatternWarning[] = []

	const unpriced = fixedDays.filter((day) => day.volume == null).length
	if (unpriced > 0) {
		warnings.push({
			kind: 'fixed-day-unpriced',
			trackId: track.trackId,
			days: unpriced,
		})
	}

	// One unreadable fixed day costs the whole remainder its number: the shares
	// divide what is left, and what is left is not known.
	const fixed =
		unpriced > 0
			? null
			: roundToCurrency(
					fixedDays.reduce((sum, day) => sum + (day.volume ?? 0), 0),
					track.currency,
				)

	const remainder =
		track.target == null || fixed == null
			? null
			: roundToCurrency(track.target - fixed, track.currency)

	if (track.target != null && fixed != null && fixed > track.target) {
		warnings.push({
			kind: 'fixed-exceeds-target',
			trackId: track.trackId,
			fixed,
			target: track.target,
		})
	}

	// The shares absorb what is left, and never a negative volume: an overshoot
	// is reported as a warning rather than corrected into the fixed days.
	const absorbable = remainder == null ? null : Math.max(remainder, 0)
	const fractions = normaliseWeights(shareDays.map((day) => day.weight))

	const shareValues = new Map<string, { value: number | null; share: number }>()
	shareDays.forEach((day, index) => {
		const fraction = fractions[index] ?? 0
		shareValues.set(day.dayId, {
			value:
				absorbable == null
					? null
					: roundToCurrency(fraction * absorbable, track.currency),
			share: fraction,
		})
	})

	return {
		trackId: track.trackId,
		currency: track.currency,
		target: track.target,
		fixed,
		remainder,
		unallocated: shareDays.length > 0 ? zeroLike(remainder) : remainder,
		days: days.map((day) => ({
			dayId: day.dayId,
			weekday: day.weekday,
			orderInDay: day.orderInDay,
			trackId: day.trackId,
			kind: day.kind,
			value: isFixedDay(day)
				? day.volume
				: (shareValues.get(day.dayId)?.value ?? null),
			share: isFixedDay(day) ? null : (shareValues.get(day.dayId)?.share ?? null),
		})),
		warnings,
	}
}

function zeroLike(remainder: number | null): number | null {
	return remainder == null ? null : 0
}

function byPosition(a: PatternDaySpec, b: PatternDaySpec): number {
	return a.weekday - b.weekday || a.orderInDay - b.orderInDay
}

function isFixedDay(
	day: PatternDaySpec,
): day is PatternDaySpec & { kind: 'fixed'; volume: number | null } {
	return day.kind === 'fixed'
}

function isShareDay(
	day: PatternDaySpec,
): day is PatternDaySpec & { kind: 'share'; weight: number } {
	return day.kind === 'share'
}

/** A Workout's blocks, in the shape a volume reading needs. */
type PrescribedBlock = {
	repeatCount: number
	steps: Array<{ durationSec: number | null; distanceM: number | null }>
}

/**
 * The volume a fixed day's Workout prescribes, read in the track's own currency.
 *
 * `km` and `hours` are read straight off the prescription. `tss` and `sets`
 * return `null` rather than a fabricated figure: a TSS price needs the athlete's
 * own Zone Recipe, which is the Volume Conversion's seam and lands with it, and
 * a systemic `sets` figure has no weekly strength target to sit against yet.
 * An Unavailable Metric with a reason beats a number the app made up.
 */
export function fixedDayVolume(
	blocks: readonly PrescribedBlock[],
	currency: VolumeCurrency,
): number | null {
	switch (currency) {
		case 'km': {
			const metres = sumBlockDistanceM([...blocks])
			return metres == null ? null : roundToCurrency(metres / 1000, 'km')
		}
		case 'hours': {
			const minutes = sumBlockDurationMin([...blocks])
			return minutes == null ? null : roundToCurrency(minutes / 60, 'hours')
		}
		case 'tss':
		case 'sets':
			return null
	}
}
