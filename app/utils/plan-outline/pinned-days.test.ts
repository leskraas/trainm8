import { describe, expect, test } from 'vitest'
import {
	pinnedDaysRefusal,
	pinnedDaysWithin,
	strengthPinnedDays,
	trackRowsByRule,
	trackRowsOnDays,
	withStrengthChoice,
	withTrackRows,
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

// Endurance tracks and Simple Activities (#598): the same Pinned days, written
// as the track's share days in the Week Pattern.
describe('trackRowsOnDays', () => {
	const share = (weekday: PatternWeekday, weight = 1, workoutId = null) => ({
		kind: 'share' as const,
		weekday,
		weight,
		workoutId,
	})
	const fixed = (weekday: PatternWeekday, workoutId: string) => ({
		kind: 'fixed' as const,
		weekday,
		weight: null,
		workoutId,
	})
	const daysOf = (rows: ReadonlyArray<{ weekday: number }>) =>
		rows.map((row) => row.weekday)

	test('a track pinned to two days trains only on those days', () => {
		const rows = trackRowsOnDays(
			[share(MON), share(TUE), share(THU), share(SUN, 2)],
			[WED, SUN],
		)
		expect(daysOf(rows)).toEqual([WED, SUN])
	})

	test('the long day stays the long day where it is still a chosen day', () => {
		const rows = trackRowsOnDays(
			[share(MON), share(TUE), share(SUN, 2)],
			[TUE, SUN],
		)
		expect(rows).toEqual([share(TUE), share(SUN, 2)])
	})

	test('a track that had a long day keeps one, on the last chosen day', () => {
		const rows = trackRowsOnDays(
			[share(MON), share(TUE), share(SUN, 2)],
			[WED, SAT],
		)
		expect(rows).toEqual([share(WED), share(SAT, 2)])
	})

	test('a session the athlete authored is moved onto a chosen day, never dropped', () => {
		const rows = trackRowsOnDays(
			[share(MON), fixed(TUE, 'w-intervals'), share(SUN, 2)],
			[THU, SAT],
		)
		// One share takes the whole rest of the week: no long day to weigh.
		expect(rows).toEqual([fixed(THU, 'w-intervals'), share(SAT)])
	})

	test('an authored session already on a chosen day stays there', () => {
		const rows = trackRowsOnDays(
			[share(MON), fixed(SAT, 'w-ski'), share(SUN, 2)],
			[SAT],
		)
		expect(rows).toEqual([fixed(SAT, 'w-ski')])
	})
})

describe('trackRowsByRule', () => {
	const share = (weekday: PatternWeekday, weight = 1) => ({
		kind: 'share' as const,
		weekday,
		weight,
		workoutId: null,
	})
	// The run keeps Monday, Tuesday, Thursday and its long Sunday.
	const others = [
		{ trackId: 'run', discipline: 'run' as const, days: [MON, TUE, THU, SUN] },
	] as Array<{
		trackId: string
		discipline: 'run'
		days: PatternWeekday[]
	}>

	test('La appen velge deals the track the days the others leave, long on the last', () => {
		expect(
			trackRowsByRule({
				trackId: 'bike',
				discipline: 'bike',
				rows: [share(WED), share(SAT)],
				available: EVERY_DAY,
				others,
			}),
		).toEqual([share(WED), share(FRI), share(SAT, 2)])
	})

	test('it keeps to Training Availability', () => {
		expect(
			trackRowsByRule({
				trackId: 'bike',
				discipline: 'bike',
				rows: [share(SAT)],
				available: [MON, TUE, THU, FRI, SUN],
				others,
			}).map((row) => row.weekday),
		).toEqual([FRI])
	})

	test('a session the athlete authored stays where it is', () => {
		expect(
			trackRowsByRule({
				trackId: 'bike',
				discipline: 'bike',
				rows: [
					{ kind: 'fixed', weekday: WED, weight: null, workoutId: 'w-bike' },
				],
				available: EVERY_DAY,
				others,
			}),
		).toEqual([
			{ kind: 'fixed', weekday: WED, weight: null, workoutId: 'w-bike' },
			share(FRI),
			share(SAT, 2),
		])
	})
})

describe('pinnedDaysWithin', () => {
	test('a day taken out of Training Availability is dropped from the track', () => {
		expect(pinnedDaysWithin([TUE, SAT], [MON, TUE, THU])).toEqual({
			kept: [TUE],
			lost: [SAT],
		})
	})

	test('a track that loses every day goes back to La appen velge', () => {
		expect(pinnedDaysWithin([SAT], [MON, TUE])).toEqual({
			kept: null,
			lost: [SAT],
		})
	})

	test('days still available are kept, and nothing is lost', () => {
		expect(pinnedDaysWithin([TUE], [TUE, WED])).toEqual({
			kept: [TUE],
			lost: [],
		})
	})
})

describe('the stamp with an endurance track’s Pinned days', () => {
	const RUN: StampTrack = {
		trackId: 'run',
		discipline: 'run',
		currency: 'hours',
	}
	const BIKE: StampTrack = {
		trackId: 'bike',
		discipline: 'bike',
		currency: 'hours',
	}
	const SIMPLE: StampTrack = {
		trackId: 'simple',
		discipline: 'other' as StampTrack['discipline'],
		currency: 'hours',
	}
	const THRESHOLD = [{ zone: 4 as const, sessionsPerWeek: 1 }]
	const day = (
		trackId: string,
		weekday: PatternWeekday,
		weight = 1,
		extra: Partial<StampDay> = {},
	) =>
		({
			dayId: `${trackId}-${weekday}`,
			weekday,
			orderInDay: 0,
			trackId,
			kind: 'share',
			weight,
			workoutId: null,
			shapeVolume: null,
			...extra,
		}) as StampDay
	const week: StampWeekInput = {
		weekKey: '2030-01-14',
		weekInPlan: 1,
		targets: [
			{ trackId: 'run', value: 6 },
			{ trackId: 'bike', value: 4 },
			{ trackId: 'simple', value: 2 },
		],
		mixes: [
			{ trackId: 'run', mix: THRESHOLD },
			{ trackId: 'bike', mix: THRESHOLD },
		],
	}
	const hardDaysOf = (plan: StampWeekPlan, trackId: string) =>
		plan.sessions
			.filter((s) => s.trackId === trackId && s.zone != null)
			.map((s) => s.weekday)

	// The run Monday, Tuesday, Thursday and its long Sunday.
	const runDays = [
		day('run', MON),
		day('run', TUE),
		day('run', THU),
		day('run', SUN, 2),
	]

	test('a hard Langrenn day pinned to Saturday stays there, and the run’s intervals keep away from it', () => {
		const langrenn = {
			...day('simple', SAT),
			kind: 'fixed',
			weight: undefined,
			volume: 2,
			workoutId: 'w-ski',
			effort: 'hard',
		} as unknown as StampDay
		const rows = trackRowsOnDays(
			[{ kind: 'fixed', weekday: WED, weight: null, workoutId: 'w-ski' }],
			[SAT],
		)
		const [plan] = planStamp({
			...withTrackRows(
				{ days: [...runDays, { ...langrenn, weekday: WED }], lifting: [] },
				{ trackId: 'simple' },
				rows,
			),
			tracks: [RUN, SIMPLE],
			weeks: [week],
		})
		const ski = plan!.sessions.filter((s) => s.trackId === 'simple')
		expect(ski.map((s) => s.weekday)).toEqual([SAT])
		// Not Sunday or Friday beside it, nor Monday after the long Sunday.
		expect(hardDaysOf(plan!, 'run')).toEqual([TUE])
	})

	test('a track pinned to two days spreads its whole week over them', () => {
		const [plan] = planStamp({
			...withTrackRows(
				{
					days: [...runDays, day('bike', MON), day('bike', FRI)],
					lifting: [],
				},
				{ trackId: 'bike' },
				trackRowsOnDays(
					[
						{ kind: 'share', weekday: MON, weight: 1, workoutId: null },
						{ kind: 'share', weekday: FRI, weight: 1, workoutId: null },
					],
					[WED, SAT],
				),
			),
			tracks: [RUN, { ...BIKE, pinned: true }],
			weeks: [week],
		})
		const bike = plan!.sessions.filter((s) => s.trackId === 'bike')
		expect(bike.map((s) => s.weekday)).toEqual([WED, SAT])
		expect(bike.reduce((sum, s) => sum + (s.volume ?? 0), 0)).toBeCloseTo(4)
	})

	test('a pinned track’s hard day is laid first, and the other tracks’ go around it', () => {
		const days = [...runDays, day('bike', WED), day('bike', SAT)]
		const lay = (pinned: boolean) =>
			planStamp({
				days,
				tracks: [RUN, { ...BIKE, pinned }],
				weeks: [week],
			})[0]!
		// Laid second, the bike steps around the run's Thursday onto Wednesday:
		// two hard days in a row.
		expect(hardDaysOf(lay(false), 'run')).toEqual([THU])
		expect(hardDaysOf(lay(false), 'bike')).toEqual([WED])
		// Pinned, the bike is laid first, and the run's intervals step around it.
		expect(hardDaysOf(lay(true), 'bike')).toEqual([WED])
		expect(hardDaysOf(lay(true), 'run')).toEqual([MON])
	})

	test('the same pinned days lay the same week', () => {
		const lay = () =>
			planStamp({
				days: [...runDays, day('bike', WED), day('bike', SAT)],
				tracks: [RUN, { ...BIKE, pinned: true }],
				weeks: [week],
			})
		expect(lay()).toEqual(lay())
	})
})
