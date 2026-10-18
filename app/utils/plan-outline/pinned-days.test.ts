import { describe, expect, test } from 'vitest'
import {
	pinnedDaysRefusal,
	strengthPinnedDays,
	withStrengthChoice,
} from './pinned-days.ts'
import {
	planStamp,
	type StampDay,
	type StampTrack,
	type StampWeekInput,
	type StampWeekPlan,
} from './stamp.ts'
import { type PatternWeekday } from './week-pattern.ts'

// The strength track's **Pinned days** (#597, ADR 0104 §4): the weekdays the
// athlete chose to lift on, Monday first (0 = Monday … 6 = Sunday). `null` is
// _La appen velge_, and the stamp lays the lifting per week.

const MON = 0
const TUE = 1
const WED = 2
const THU = 3
const FRI = 4
const SAT = 5
const SUN = 6
const EVERY_DAY: PatternWeekday[] = [MON, TUE, WED, THU, FRI, SAT, SUN]

describe('strengthPinnedDays', () => {
	test('the days the athlete chose are the Pinned days', () => {
		expect(strengthPinnedDays({ pinnedDays: '[3,1]' }, [])).toEqual([TUE, THU])
	})

	test('an existing plan’s fixed strength days read as Pinned days', () => {
		expect(
			strengthPinnedDays({ pinnedDays: null }, [
				{ kind: 'fixed', weekday: THU },
				{ kind: 'fixed', weekday: MON },
			]),
		).toEqual([MON, THU])
	})

	test('lifting slots are not Pinned days: the app chooses them', () => {
		expect(
			strengthPinnedDays({ pinnedDays: null }, [
				{ kind: 'lifting', weekday: null },
				{ kind: 'lifting', weekday: null },
			]),
		).toBeNull()
	})

	test('an unreadable stored value is no choice rather than a guessed one', () => {
		expect(strengthPinnedDays({ pinnedDays: 'tirsdag' }, [])).toBeNull()
		expect(strengthPinnedDays({ pinnedDays: '[9]' }, [])).toBeNull()
	})
})

describe('pinnedDaysRefusal', () => {
	test('days within Training Availability are a choice', () => {
		expect(pinnedDaysRefusal([TUE, THU], [MON, TUE, THU, SAT])).toBeNull()
	})

	test('a day the athlete does not train on is refused', () => {
		expect(pinnedDaysRefusal([TUE, WED], [MON, TUE, THU, SAT])).toBe(
			'outside-availability',
		)
	})

	test('no days chosen is not a choice: that is La appen velge', () => {
		expect(pinnedDaysRefusal([], EVERY_DAY)).toBe('no-days')
	})

	test('more days than a Strength Frequency can be is refused', () => {
		expect(pinnedDaysRefusal([MON, WED, FRI, SUN], EVERY_DAY)).toBe('too-many')
	})

	test('an athlete who never set Training Availability may choose any day', () => {
		expect(pinnedDaysRefusal([SUN], null)).toBeNull()
	})
})

// Through the stamp: what the athlete sees is which weekday each session
// lands on, week by week.
describe('the stamp with Pinned lifting days', () => {
	const RUN: StampTrack = { trackId: 'run', discipline: 'run', currency: 'km' }
	const LIFT: StampTrack = {
		trackId: 'lift',
		discipline: 'strength',
		currency: 'sets',
	}

	// The run on every day but Sunday's long one.
	const runDays: StampDay[] = [MON, TUE, WED, THU, FRI, SAT, SUN].map(
		(weekday) =>
			({
				dayId: `run-${weekday}`,
				weekday,
				orderInDay: 0,
				trackId: 'run',
				kind: 'share',
				weight: weekday === SUN ? 2 : 1,
				workoutId: null,
				shapeVolume: null,
			}) as StampDay,
	)
	const slots = [0, 1].map((orderInDay) => ({
		dayId: `slot-${orderInDay}`,
		trackId: 'lift',
		workoutId: 'w-lift',
		orderInDay,
	}))

	function week(
		weekInPlan: number,
		mix: Array<{ zone: 3 | 4 | 5; sessionsPerWeek: number }>,
	): StampWeekInput {
		return {
			weekKey: `2030-01-${String(weekInPlan * 7).padStart(2, '0')}`,
			weekInPlan,
			targets: [
				{ trackId: 'run', value: 50 },
				{ trackId: 'lift', value: 12 },
			],
			mixes: [{ trackId: 'run', mix }],
		}
	}
	// A base week with one threshold session, and a build week with two.
	const weeks = [
		week(1, [{ zone: 4, sessionsPerWeek: 1 }]),
		week(2, [
			{ zone: 4, sessionsPerWeek: 1 },
			{ zone: 5, sessionsPerWeek: 1 },
		]),
	]

	const liftingDaysOf = (plan: StampWeekPlan) =>
		plan.sessions.filter((s) => s.trackId === 'lift').map((s) => s.weekday)
	const hardDaysOf = (plan: StampWeekPlan) =>
		plan.sessions.filter((s) => s.zone != null).map((s) => s.weekday)

	function lay(choice: PatternWeekday[] | null) {
		return planStamp({
			...withStrengthChoice(
				{ days: runDays, lifting: slots },
				{ trackId: 'lift', choice, count: 2, workoutId: 'w-lift' },
			),
			liftingDays: EVERY_DAY,
			tracks: [RUN, LIFT],
			weeks,
		})
	}

	test('choosing Tuesday and Thursday lifts on Tuesday and Thursday in every week, and the intervals go elsewhere', () => {
		const plans = lay([TUE, THU])
		for (const plan of plans) {
			expect(liftingDaysOf(plan)).toEqual([TUE, THU])
			// Never on a lifting day.
			expect(hardDaysOf(plan)).not.toContain(TUE)
			expect(hardDaysOf(plan)).not.toContain(THU)
		}
		// With room to, the one hard run keeps off the day after a lift too.
		expect(hardDaysOf(plans[0]!)).toEqual([MON])
	})

	test('La appen velge lays the lifting per week, off that week’s hard days', () => {
		const plans = lay(null)
		for (const plan of plans) {
			const hard = hardDaysOf(plan)
			for (const lift of liftingDaysOf(plan)) {
				expect(hard).not.toContain(lift)
				expect(hard).not.toContain((lift + 1) % 7)
			}
			expect(liftingDaysOf(plan)).toHaveLength(2)
		}
	})

	test('the same choice lays the same weeks', () => {
		expect(lay([TUE, THU])).toEqual(lay([TUE, THU]))
	})
})
