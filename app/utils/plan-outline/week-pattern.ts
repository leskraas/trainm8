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

import {
	CURRENCY_DECIMALS,
	roundToCurrency,
	type VolumeCurrency,
} from './derive.ts'

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

/** What a day *is*. Two kinds and no third: there is no unscaled-share shape. */
export const PATTERN_DAY_KINDS = ['fixed', 'share'] as const
export type PatternDayKind = (typeof PATTERN_DAY_KINDS)[number]

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
 * Split `total` between `fractions` so the parts **add back up to it exactly** at
 * the currency's own precision.
 *
 * Rounding each share on its own does not divide anything: two equal shares of a
 * 0.1 km remainder each round to 0.1, and the preview then shows 0.2 km dividing
 * 0.1 km. So the split is done in whole units of the currency's last digit and the
 * odd units left over go to the days with the largest fractional parts — the
 * largest-remainder rule. Every day is then within one unit of its exact share and
 * the column sums to the remainder, which is what "the shares divide what is left"
 * has to mean if the figures are read together.
 *
 * Ties go to the earlier day in the week, so the same pattern always splits the
 * same way rather than depending on how the days happen to be enumerated.
 */
function apportion(
	total: number,
	fractions: readonly number[],
	currency: VolumeCurrency,
): number[] {
	const scale = 10 ** CURRENCY_DECIMALS[currency]
	const units = Math.round(total * scale)
	const exact = fractions.map((fraction) => fraction * units)
	const floors = exact.map(Math.floor)
	const spare = units - floors.reduce((sum, floor) => sum + floor, 0)

	// The `spare` days with the largest fractional part each take one more unit.
	const byFraction = exact
		.map((value, index) => ({ index, part: value - Math.floor(value) }))
		.sort((a, b) => b.part - a.part || a.index - b.index)
		.slice(0, Math.max(spare, 0))
	const topped = new Set(byFraction.map((entry) => entry.index))

	return floors.map(
		(floor, index) => (floor + (topped.has(index) ? 1 : 0)) / scale,
	)
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

	// Apportioned rather than rounded one by one, so the share column adds up to
	// the remainder it divides.
	const shareVolumes =
		absorbable == null ? null : apportion(absorbable, fractions, track.currency)

	const shareValues = new Map<string, { value: number | null; share: number }>()
	shareDays.forEach((day, index) => {
		shareValues.set(day.dayId, {
			value: shareVolumes?.[index] ?? null,
			share: fractions[index] ?? 0,
		})
	})

	return {
		trackId: track.trackId,
		currency: track.currency,
		target: track.target,
		fixed,
		remainder,
		// A share day absorbs whatever is left, so nothing is unallocated once there
		// is one — but an unknown remainder leaves an unknown amount unallocated.
		unallocated:
			shareDays.length > 0 ? (remainder == null ? null : 0) : remainder,
		days: days.map((day) => ({
			dayId: day.dayId,
			weekday: day.weekday,
			orderInDay: day.orderInDay,
			trackId: day.trackId,
			kind: day.kind,
			value: isFixedDay(day)
				? day.volume
				: (shareValues.get(day.dayId)?.value ?? null),
			share: isFixedDay(day)
				? null
				: (shareValues.get(day.dayId)?.share ?? null),
		})),
		warnings,
	}
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
 * What a prescription totals in one unit, and whether it prescribes that unit
 * *throughout*. `null` unless **every** step carries the unit.
 *
 * The partial case is the one that matters, and it is why this does not reuse
 * `sumBlockDistanceM` / `sumBlockDurationMin`: those return a total whenever *any*
 * step carries the unit, which is the right answer for reporting what a session
 * holds and the wrong one for pricing a week. A `km` reading of "20 min warmup +
 * 5×1000m + 10 min cooldown" would be 5 km — the intervals only — and that number
 * is not the session. Undercounting the fixed days inflates the remainder and
 * every share day's figure with it, so a partly-prescribed session is Unavailable
 * rather than understated.
 */
function prescribedTotal(
	blocks: readonly PrescribedBlock[],
	read: (step: PrescribedBlock['steps'][number]) => number | null,
): number | null {
	let total = 0
	let steps = 0
	let carrying = 0

	for (const block of blocks) {
		for (const step of block.steps) {
			steps++
			const value = read(step)
			if (value != null) {
				carrying++
				total += value * block.repeatCount
			}
		}
	}

	if (steps === 0 || carrying < steps) return null
	return total
}

/**
 * The volume a fixed day's Workout prescribes, read in the track's own currency.
 *
 * `km` and `hours` are read off the prescription, and only where it prescribes
 * that unit from end to end ({@link prescribedTotal}). `tss` and `sets` return
 * `null` rather than a fabricated figure: a TSS price needs the athlete's own Zone
 * Recipe, which is the Volume Conversion's seam and lands with it, and a systemic
 * `sets` figure has no weekly strength target to sit against yet.
 *
 * An Unavailable Metric with a reason beats a number the app made up — and beats
 * one it quietly rounded down.
 */
export function fixedDayVolume(
	blocks: readonly PrescribedBlock[],
	currency: VolumeCurrency,
): number | null {
	switch (currency) {
		case 'km': {
			const metres = prescribedTotal(blocks, (step) => step.distanceM)
			return metres == null ? null : roundToCurrency(metres / 1000, 'km')
		}
		case 'hours': {
			const seconds = prescribedTotal(blocks, (step) => step.durationSec)
			return seconds == null ? null : roundToCurrency(seconds / 3600, 'hours')
		}
		case 'tss':
		case 'sets':
			return null
	}
}
