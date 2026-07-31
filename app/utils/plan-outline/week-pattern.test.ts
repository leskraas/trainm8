import { expect, test, describe } from 'vitest'
import {
	calendarWeekdayOf,
	fixedDayVolume,
	isPatternWeekday,
	normaliseWeights,
	PATTERN_WEEKDAYS,
	resolveWeekPattern,
	type PatternDaySpec,
	type PatternTrackSpec,
} from './week-pattern.ts'

const RUN: PatternTrackSpec = {
	trackId: 'run',
	currency: 'km',
	target: 50,
}

function share(
	weekday: number,
	weight: number,
	overrides: Partial<PatternDaySpec> = {},
): PatternDaySpec {
	return {
		dayId: `share-${weekday}-${weight}`,
		weekday: weekday as PatternDaySpec['weekday'],
		orderInDay: 0,
		trackId: 'run',
		kind: 'share',
		weight,
		...overrides,
	} as PatternDaySpec
}

function fixed(
	weekday: number,
	volume: number | null,
	overrides: Partial<PatternDaySpec> = {},
): PatternDaySpec {
	return {
		dayId: `fixed-${weekday}`,
		weekday: weekday as PatternDaySpec['weekday'],
		orderInDay: 0,
		trackId: 'run',
		kind: 'fixed',
		volume,
		...overrides,
	} as PatternDaySpec
}

function reading(days: PatternDaySpec[], tracks: PatternTrackSpec[] = [RUN]) {
	const [first] = resolveWeekPattern({ days, tracks })
	if (!first) throw new Error('expected one track reading')
	return first
}

function valueOf(days: PatternDaySpec[], dayId: string) {
	return reading(days).days.find((day) => day.dayId === dayId)?.value
}

// ── The Monday-first weekday ──

describe('the Monday-first weekday convention', () => {
	test('a pattern runs Monday through Sunday, matching the Training Week', () => {
		expect(PATTERN_WEEKDAYS).toEqual([0, 1, 2, 3, 4, 5, 6])
	})

	test('a weekday outside Monday–Sunday is not a pattern weekday', () => {
		expect(isPatternWeekday(0)).toBe(true)
		expect(isPatternWeekday(6)).toBe(true)
		expect(isPatternWeekday(7)).toBe(false)
		expect(isPatternWeekday(-1)).toBe(false)
	})

	test('Monday-first pattern days read as the Sunday-first calendar days stored elsewhere', () => {
		// ADR 0005 stores `trainableWeekdays` Sunday-first; a pattern day is
		// Monday-first, so the two only meet through this mapping.
		expect(calendarWeekdayOf(0)).toBe(1) // Monday
		expect(calendarWeekdayOf(5)).toBe(6) // Saturday
		expect(calendarWeekdayOf(6)).toBe(0) // Sunday
	})
})

// ── Normalisation ──

describe('share weights are relative and normalised', () => {
	test('weights become fractions of one, so a pattern cannot sum to 97%', () => {
		expect(normaliseWeights([1, 1, 2])).toEqual([0.25, 0.25, 0.5])
	})

	test('doubling every weight changes nothing, because the weights are relative', () => {
		expect(normaliseWeights([2, 2, 4])).toEqual(normaliseWeights([1, 1, 2]))
	})

	test('no share days normalise to no fractions', () => {
		expect(normaliseWeights([])).toEqual([])
	})
})

// ── The shares add up to what they divide ──

describe('the share column sums to the remainder', () => {
	function sumOfShares(days: PatternDaySpec[], target: number) {
		const resolved = resolveWeekPattern({
			days,
			tracks: [{ ...RUN, target }],
		})[0]!
		const total = resolved.days.reduce((sum, day) => sum + (day.value ?? 0), 0)
		return { total: Number(total.toFixed(6)), remainder: resolved.remainder }
	}

	test('two equal shares of a tenth of a kilometre do not become two tenths', () => {
		// Rounded one by one, 0.05 and 0.05 would each become 0.1 and the preview
		// would show 0.2 km dividing 0.1 km.
		const { total, remainder } = sumOfShares([share(1, 1), share(5, 1)], 0.1)

		expect(remainder).toBe(0.1)
		expect(total).toBe(0.1)
	})

	test('an odd remainder is split without inventing or losing a unit', () => {
		const resolved = reading(
			[share(1, 1), share(3, 1), share(5, 1)],
			[{ ...RUN, target: 10 }],
		)

		// 3.333… each. One day carries the odd 0.1 rather than all three rounding
		// to 3.3 (9.9 km) or 3.4 (10.2 km).
		expect(resolved.days.map((day) => day.value)).toEqual([3.4, 3.3, 3.3])
		expect(resolved.remainder).toBe(10)
	})

	test('the column sums to the remainder across every ratio and volume', () => {
		const ratios = [
			[1, 1],
			[1, 2.5],
			[1, 1, 1],
			[1, 0.5, 2.5],
			[3, 7, 11, 13],
		]

		for (const weights of ratios) {
			for (const target of [0.1, 0.3, 7, 12.7, 50, 65, 83.3]) {
				const days = weights.map((weight, index) =>
					share(index, weight, { dayId: `d${index}` }),
				)
				const { total, remainder } = sumOfShares(days, target)
				expect({ weights, target, total }).toEqual({
					weights,
					target,
					total: remainder,
				})
			}
		}
	})

	test('every day stays within one unit of its exact share', () => {
		const resolved = reading(
			[share(1, 1), share(3, 0.5), share(5, 2.5)],
			[{ ...RUN, target: 12.7 }],
		)

		const fractions = [1 / 4, 0.5 / 4, 2.5 / 4]
		resolved.days.forEach((day, index) => {
			expect(Math.abs(day.value! - fractions[index]! * 12.7)).toBeLessThan(0.1)
		})
	})
})

// ── Resolving against a week ──

describe('resolving a pattern against a week', () => {
	test('"the long run is 2.5x a weekday run" holds at any volume', () => {
		const days = [share(1, 1), share(2, 1), share(5, 2.5)]

		const fifty = resolveWeekPattern({ days, tracks: [RUN] })[0]!
		const sixtyFive = resolveWeekPattern({
			days,
			tracks: [{ ...RUN, target: 65 }],
		})[0]!

		expect(fifty.days.map((day) => day.value)).toEqual([11.1, 11.1, 27.8])
		// 14.44 twice and 36.11: the odd 0.1 goes to the earlier of the two equal
		// weekday runs, so the three add up to the 65 they divide rather than to 64.9.
		expect(sixtyFive.days.map((day) => day.value)).toEqual([14.5, 14.4, 36.1])
		// The same relative shape at both volumes.
		expect(fifty.days.map((day) => day.share)).toEqual(
			sixtyFive.days.map((day) => day.share),
		)
	})

	test('the shares absorb the whole target when no day is fixed', () => {
		const resolved = reading([share(1, 1), share(5, 3)])

		expect(resolved.fixed).toBe(0)
		expect(resolved.remainder).toBe(50)
		expect(resolved.unallocated).toBe(0)
		expect(resolved.days.map((day) => day.value)).toEqual([12.5, 37.5])
	})

	test('fixed volume is subtracted before the shares divide the remainder', () => {
		const resolved = reading([fixed(2, 10), share(1, 1), share(5, 1)])

		expect(resolved.fixed).toBe(10)
		expect(resolved.remainder).toBe(40)
		expect(resolved.days.map((day) => day.value)).toEqual([20, 10, 20])
	})

	test('a fixed day is prescribed, not scaled — the same session at either volume', () => {
		const days = [fixed(2, 10), share(1, 1)]

		expect(valueOf(days, 'fixed-2')).toBe(10)
		expect(
			resolveWeekPattern({
				days,
				tracks: [{ ...RUN, target: 65 }],
			})[0]!.days.find((day) => day.dayId === 'fixed-2')?.value,
		).toBe(10)
	})

	test('the reading is ordered by weekday, then within the day', () => {
		const resolved = reading([
			share(5, 1, { dayId: 'saturday' }),
			share(1, 1, { dayId: 'tuesday-pm', orderInDay: 1 }),
			share(1, 1, { dayId: 'tuesday-am', orderInDay: 0 }),
		])

		expect(resolved.days.map((day) => day.dayId)).toEqual([
			'tuesday-am',
			'tuesday-pm',
			'saturday',
		])
	})

	test('each track draws from its own volume and never from the others', () => {
		const [run, swim] = resolveWeekPattern({
			days: [
				share(1, 1),
				share(2, 1, { dayId: 'swim-wednesday', trackId: 'swim' }),
			],
			tracks: [RUN, { trackId: 'swim', currency: 'hours', target: 3 }],
		})

		expect(run!.days.map((day) => day.value)).toEqual([50])
		expect(swim!.days.map((day) => day.value)).toEqual([3])
	})

	test('a track with no pattern day leaves its whole target unallocated', () => {
		const resolved = reading([])

		expect(resolved.days).toEqual([])
		expect(resolved.remainder).toBe(50)
		expect(resolved.unallocated).toBe(50)
	})

	test('a pattern of fixed days only leaves the rest of the week unallocated', () => {
		const resolved = reading([fixed(2, 10)])

		expect(resolved.remainder).toBe(40)
		expect(resolved.unallocated).toBe(40)
	})
})

// ── Honesty ──

describe('what the reading declines to say', () => {
	test('a week with no derived target resolves no share, and invents nothing', () => {
		const resolved = reading(
			[fixed(2, 10), share(1, 1)],
			[{ ...RUN, target: null }],
		)

		expect(resolved.target).toBeNull()
		expect(resolved.remainder).toBeNull()
		expect(resolved.unallocated).toBeNull()
		// The fixed day still reads: it was authored, not derived.
		expect(resolved.days.map((day) => day.value)).toEqual([null, 10])
		expect(resolved.warnings).toEqual([])
	})

	test('an unpriced fixed day costs the shares their number rather than guessing one', () => {
		const resolved = reading([fixed(2, null), share(1, 1)])

		expect(resolved.fixed).toBeNull()
		expect(resolved.remainder).toBeNull()
		expect(resolved.days.map((day) => day.value)).toEqual([null, null])
		expect(resolved.warnings).toEqual([
			{ kind: 'fixed-day-unpriced', trackId: 'run', days: 1 },
		])
	})

	test('fixed days over the week target warn and are never corrected', () => {
		const resolved = reading([fixed(2, 40), fixed(4, 20), share(1, 1)])

		expect(resolved.fixed).toBe(60)
		expect(resolved.remainder).toBe(-10)
		expect(resolved.warnings).toEqual([
			{ kind: 'fixed-exceeds-target', trackId: 'run', fixed: 60, target: 50 },
		])
		// The fixed days keep the volume they prescribe …
		expect(resolved.days.map((day) => day.value)).toEqual([0, 40, 20])
		// … and the share absorbs nothing, because a negative prescription is not one.
	})

	test('the guard stays silent where the fixed days fit', () => {
		expect(reading([fixed(2, 50)]).warnings).toEqual([])
	})
})

// ── Pricing a fixed day ──

describe('reading a fixed day in the track currency', () => {
	const blocks = [
		{
			repeatCount: 5,
			steps: [{ durationSec: 240, distanceM: 1000 }],
		},
		{ repeatCount: 1, steps: [{ durationSec: 600, distanceM: 2000 }] },
	]

	test('a km track reads the prescribed distance', () => {
		expect(fixedDayVolume(blocks, 'km')).toBe(7)
	})

	test('an hours track reads the prescribed duration', () => {
		expect(fixedDayVolume(blocks, 'hours')).toBe(0.5)
	})

	test('a distance-only prescription is unavailable in hours, not zero', () => {
		expect(
			fixedDayVolume(
				[{ repeatCount: 1, steps: [{ durationSec: null, distanceM: 5000 }] }],
				'hours',
			),
		).toBeNull()
		expect(
			fixedDayVolume(
				[{ repeatCount: 1, steps: [{ durationSec: null, distanceM: 5000 }] }],
				'km',
			),
		).toBe(5)
	})

	test('a tss or sets track cannot price a prescription yet, and says so', () => {
		expect(fixedDayVolume(blocks, 'tss')).toBeNull()
		expect(fixedDayVolume(blocks, 'sets')).toBeNull()
	})

	test('a session only partly prescribed in the currency is unavailable, not understated', () => {
		// "20 min warmup + 5×1000m + 10 min cooldown": the intervals carry a
		// distance and the warmup and cooldown do not. Reading 5 km off it would
		// understate the session and inflate every share day that divides what is
		// left, so the honest answer is that this week cannot be divided.
		const partly = [
			{ repeatCount: 1, steps: [{ durationSec: 1200, distanceM: null }] },
			{ repeatCount: 5, steps: [{ durationSec: null, distanceM: 1000 }] },
			{ repeatCount: 1, steps: [{ durationSec: 600, distanceM: null }] },
		]

		expect(fixedDayVolume(partly, 'km')).toBeNull()
		// And the same session read in hours, where only the intervals are missing.
		expect(fixedDayVolume(partly, 'hours')).toBeNull()
	})

	test('a prescription with no steps at all prices as unavailable', () => {
		expect(fixedDayVolume([], 'km')).toBeNull()
		expect(fixedDayVolume([{ repeatCount: 1, steps: [] }], 'hours')).toBeNull()
	})

	test('an unpriced fixed day takes the whole week off the shares, whatever the reason', () => {
		// The reason a fixed day cannot be read does not change what it costs: the
		// remainder is unknown either way.
		const resolved = reading([fixed(2, null), share(1, 1), share(5, 2.5)])

		expect(resolved.remainder).toBeNull()
		expect(resolved.days.map((day) => day.value)).toEqual([null, null, null])
		// The shares still normalise — the ratio is authored, only the volume is not.
		expect(resolved.days.map((day) => day.share)).toEqual([
			1 / 3.5,
			null,
			2.5 / 3.5,
		])
	})
})
