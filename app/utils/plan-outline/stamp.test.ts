import { describe, expect, test } from 'vitest'
import {
	mixDisagreements,
	planStamp,
	type StampDay,
	type StampTrack,
	type StampWeekInput,
	type StampWeekPlan,
} from './stamp.ts'
import { DEFAULT_TRAINING_WEEKDAYS } from './starter-pattern.ts'

const RUN: StampTrack = {
	trackId: 'run',
	discipline: 'run',
	currency: 'km',
}
const LIFT: StampTrack = {
	trackId: 'lift',
	discipline: 'strength',
	currency: 'sets',
}

function week(
	weekKey: string,
	weekInPlan: number,
	targets: Array<{ trackId: string; value: number | null }>,
): StampWeekInput {
	return { weekKey, weekInPlan, targets }
}

function share(
	dayId: string,
	weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6,
	weight: number,
	extra: Partial<StampDay> = {},
): StampDay {
	return {
		dayId,
		weekday,
		orderInDay: 0,
		trackId: 'run',
		kind: 'share',
		weight,
		workoutId: null,
		shapeVolume: null,
		...extra,
	} as StampDay
}

function fixed(
	dayId: string,
	weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6,
	volume: number | null,
	extra: Partial<StampDay> = {},
): StampDay {
	return {
		dayId,
		weekday,
		orderInDay: 0,
		trackId: 'run',
		kind: 'fixed',
		volume,
		workoutId: 'w-fixed',
		shapeVolume: null,
		...extra,
	} as StampDay
}

describe('planStamp', () => {
	test('resolves share days against the target left after the fixed days', () => {
		const [plan] = planStamp({
			days: [
				fixed('d-wed', 2, 8),
				share('d-sat', 5, 2.5),
				share('d-tue', 1, 1),
			],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 50 }])],
		})

		const byDay = new Map(plan!.sessions.map((s) => [s.dayId, s]))
		// 50 − 8 = 42 left, split 1 : 2.5 → 12 and 30.
		expect(byDay.get('d-tue')?.volume).toBe(12)
		expect(byDay.get('d-sat')?.volume).toBe(30)
		// The fixed day is prescribed as authored, never scaled.
		expect(byDay.get('d-wed')?.volume).toBe(8)
		expect(byDay.get('d-wed')?.sourceWorkoutId).toBe('w-fixed')
	})

	test('a week is planned per chosen week, and the same pattern differs by week', () => {
		const plans = planStamp({
			days: [share('d-sat', 5, 1)],
			tracks: [RUN],
			weeks: [
				week('2026-01-05', 1, [{ trackId: 'run', value: 50 }]),
				week('2026-01-12', 2, [{ trackId: 'run', value: 65 }]),
			],
		})

		expect(plans.map((plan) => plan.weekKey)).toEqual([
			'2026-01-05',
			'2026-01-12',
		])
		expect(plans.map((plan) => plan.sessions[0]?.volume)).toEqual([50, 65])
	})

	test('nothing limits how many weeks are planned', () => {
		const weeks = Array.from({ length: 40 }, (_, index) =>
			week(`w-${index}`, index + 1, [{ trackId: 'run', value: 10 }]),
		)
		const plans = planStamp({ days: [share('d', 5, 1)], tracks: [RUN], weeks })
		expect(plans).toHaveLength(40)
		expect(plans.every((plan) => plan.sessions.length === 1)).toBe(true)
	})

	test('fixed days over the target warn, are never shortened, and leave the shares nothing', () => {
		const [plan] = planStamp({
			days: [fixed('d-wed', 2, 60), share('d-sat', 5, 1)],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 50 }])],
		})

		expect(plan!.tracks[0]?.warnings).toContainEqual({
			kind: 'fixed-exceeds-target',
			trackId: 'run',
			fixed: 60,
			target: 50,
		})
		// The prescription stands exactly as authored — no correction.
		expect(plan!.sessions.map((s) => [s.dayId, s.volume])).toEqual([
			['d-wed', 60],
		])
		// And the share day is reported rather than written as a zero session.
		expect(plan!.skipped).toEqual([
			{
				dayId: 'd-sat',
				weekKey: '2026-01-05',
				weekday: 5,
				trackId: 'run',
				reason: 'no-volume-left',
			},
		])
	})

	test('a fixed day the currency cannot price is still stamped as authored', () => {
		const [plan] = planStamp({
			days: [fixed('d-wed', 2, null)],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 50 }])],
		})

		expect(plan!.sessions).toHaveLength(1)
		expect(plan!.sessions[0]?.volume).toBeNull()
		expect(plan!.skipped).toEqual([])
	})

	test('a fixed day whose workout is gone is skipped with its reason', () => {
		const [plan] = planStamp({
			days: [fixed('d-wed', 2, null, { workoutId: null })],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 50 }])],
		})

		expect(plan!.sessions).toEqual([])
		expect(plan!.skipped[0]?.reason).toBe('no-prescription')
	})

	test('a share day with no derived target is skipped, never given a made-up volume', () => {
		const [plan] = planStamp({
			days: [share('d-sat', 5, 1)],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: null }])],
		})

		expect(plan!.sessions).toEqual([])
		expect(plan!.skipped[0]?.reason).toBe('volume-unavailable')
	})

	test('a bare share day whose quantity is no prescription is skipped', () => {
		const [plan] = planStamp({
			days: [share('d-mon', 0, 1, { trackId: 'lift' })],
			tracks: [LIFT],
			weeks: [week('2026-01-05', 1, [{ trackId: 'lift', value: 12 }])],
		})

		expect(plan!.sessions).toEqual([])
		expect(plan!.skipped[0]?.reason).toBe('not-prescribable')
	})

	test('a share day carrying a shape stamps on any currency, unscaled', () => {
		const [plan] = planStamp({
			days: [share('d-mon', 0, 1, { trackId: 'lift', workoutId: 'w-lift' })],
			tracks: [LIFT],
			weeks: [week('2026-01-05', 1, [{ trackId: 'lift', value: 12 }])],
		})

		expect(plan!.sessions[0]?.sourceWorkoutId).toBe('w-lift')
		expect(plan!.sessions[0]?.shapeUnscaled).toBe(true)
	})

	test('a strength day stamps a session that carries no TSS', () => {
		const [plan] = planStamp({
			days: [
				fixed('d-mon', 0, null, { trackId: 'lift', workoutId: 'w-lift' }),
				share('d-sat', 5, 1),
			],
			tracks: [RUN, LIFT],
			weeks: [
				week('2026-01-05', 1, [
					{ trackId: 'run', value: 50 },
					{ trackId: 'lift', value: 12 },
				]),
			],
		})

		const lift = plan!.sessions.find((s) => s.trackId === 'lift')
		expect(lift?.carriesTss).toBe(false)
		expect(plan!.sessions.find((s) => s.trackId === 'run')?.carriesTss).toBe(
			true,
		)
	})

	test('a share day with a priced shape scales it to the share it takes', () => {
		const [plan] = planStamp({
			days: [share('d-sat', 5, 1, { workoutId: 'w-shape', shapeVolume: 10 })],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 15 }])],
		})

		expect(plan!.sessions[0]?.sourceWorkoutId).toBe('w-shape')
		expect(plan!.sessions[0]?.scale).toBe(1.5)
		expect(plan!.sessions[0]?.shapeUnscaled).toBe(false)
	})

	test('a shape the currency cannot price is carried across unscaled and says so', () => {
		const [plan] = planStamp({
			days: [share('d-sat', 5, 1, { workoutId: 'w-shape', shapeVolume: null })],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 15 }])],
		})

		expect(plan!.sessions[0]?.scale).toBe(1)
		expect(plan!.sessions[0]?.shapeUnscaled).toBe(true)
	})

	test('a share day with no shape is written as bare volume', () => {
		const [plan] = planStamp({
			days: [share('d-sat', 5, 1)],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 15 }])],
		})

		expect(plan!.sessions[0]?.sourceWorkoutId).toBeNull()
		expect(plan!.sessions[0]?.volume).toBe(15)
	})

	test('days come out in weekday then in-day order', () => {
		const [plan] = planStamp({
			days: [
				share('d-sat', 5, 1),
				share('d-tue-pm', 1, 1, { orderInDay: 1 }),
				share('d-tue-am', 1, 1, { orderInDay: 0 }),
			],
			tracks: [RUN],
			weeks: [week('2026-01-05', 1, [{ trackId: 'run', value: 30 }])],
		})

		expect(plan!.sessions.map((s) => s.dayId)).toEqual([
			'd-tue-am',
			'd-tue-pm',
			'd-sat',
		])
	})
})

describe('mixDisagreements', () => {
	test('says nothing when the week holds what the mix asks for', () => {
		expect(
			mixDisagreements([{ zone: 4, sessionsPerWeek: 2 }], [4, 4, 2, null]),
		).toEqual([])
	})

	test('reports both halves per zone and never corrects either', () => {
		expect(
			mixDisagreements(
				[
					{ zone: 4, sessionsPerWeek: 2 },
					{ zone: 5, sessionsPerWeek: 1 },
				],
				[4, 2, 2],
			),
		).toEqual([
			{ zone: 4, authored: 2, stamped: 1 },
			{ zone: 5, authored: 1, stamped: 0 },
		])
	})

	test('a zone the week holds and the mix never asked for is a disagreement too', () => {
		expect(mixDisagreements([], [5, 2])).toEqual([
			{ zone: 5, authored: 0, stamped: 1 },
		])
	})

	test('an empty mix and an easy week agree', () => {
		expect(mixDisagreements([], [2, 1, null])).toEqual([])
	})

	test('a zone dosed at nothing is not asked for', () => {
		expect(mixDisagreements([{ zone: 3, sessionsPerWeek: 0 }], [])).toEqual([])
	})
})

// Round 2 (#505 stories 66–68, owner round 2): the stamp lays the week's
// **Quality Session Mix** on its bare share days, so a plan whose philosophy
// says "two hard sessions a week" gets two, and each session says what it is,
// the long one included.
describe('planStamp lays the mix', () => {
	const HOURS: StampTrack = {
		trackId: 'run',
		discipline: 'run',
		currency: 'hours',
	}

	function hoursWeek(
		mix: Array<{ zone: 3 | 4 | 5; sessionsPerWeek: number }>,
		value = 5,
	): StampWeekInput {
		return {
			weekKey: '2030-01-14',
			weekInPlan: 1,
			targets: [{ trackId: 'run', value }],
			mixes: [{ trackId: 'run', mix }],
		}
	}

	test('the heavier share day is the long one, and the rest are ordinary', () => {
		const [plan] = planStamp({
			days: [share('tue', 1, 1), share('thu', 3, 1), share('sun', 6, 2)],
			tracks: [HOURS],
			weeks: [hoursWeek([])],
		})
		expect(plan!.sessions.map((s) => [s.weekday, s.role, s.zone])).toEqual([
			[1, 'ordinary', null],
			[3, 'ordinary', null],
			[6, 'long', null],
		])
	})

	test('days of equal weight have no long one', () => {
		const [plan] = planStamp({
			days: [share('tue', 1, 1), share('thu', 3, 1)],
			tracks: [HOURS],
			weeks: [hoursWeek([])],
		})
		expect(plan!.sessions.map((s) => s.role)).toEqual(['ordinary', 'ordinary'])
	})

	test('the mix lands on ordinary days, hardest first, spread away from the long day', () => {
		const [plan] = planStamp({
			days: [
				share('tue', 1, 1),
				share('thu', 3, 1),
				share('sat', 5, 1),
				share('sun', 6, 2),
			],
			tracks: [HOURS],
			weeks: [
				hoursWeek([
					{ zone: 3, sessionsPerWeek: 1 },
					{ zone: 4, sessionsPerWeek: 1 },
				]),
			],
		})
		// Saturday sits beside the long Sunday and stays easy; Tuesday and
		// Thursday carry the week's two hard sessions, the harder one first.
		expect(plan!.sessions.map((s) => [s.weekday, s.zone])).toEqual([
			[1, 4],
			[3, 3],
			[5, null],
			[6, null],
		])
		// The volume is untouched: a hard day takes its share as before.
		expect(plan!.sessions.map((s) => s.volume)).toEqual([1, 1, 1, 2])
	})

	test('never the long day, and never more hard days than ordinary ones', () => {
		const [plan] = planStamp({
			days: [share('wed', 2, 1), share('sun', 6, 2)],
			tracks: [HOURS],
			weeks: [hoursWeek([{ zone: 4, sessionsPerWeek: 2 }])],
		})
		expect(plan!.sessions.map((s) => s.zone)).toEqual([4, null])
	})

	test('a fixed session already in the mix’s zone counts toward it', () => {
		const [plan] = planStamp({
			days: [
				fixed('wed', 2, 1, { zone: 4 }),
				share('fri', 4, 1),
				share('sun', 6, 2),
			],
			tracks: [HOURS],
			weeks: [hoursWeek([{ zone: 4, sessionsPerWeek: 1 }])],
		})
		expect(plan!.sessions.map((s) => s.zone)).toEqual([null, null, null])
	})

	test('a week given no mix lays every share day easy, as before', () => {
		const [plan] = planStamp({
			days: [share('tue', 1, 1), share('sun', 6, 2)],
			tracks: [HOURS],
			weeks: [week('2030-01-14', 1, [{ trackId: 'run', value: 3 }])],
		})
		expect(plan!.sessions.map((s) => s.zone)).toEqual([null, null])
	})
})

// ADR 0104 §2 (#590): a track's mix is laid around the whole week, every other
// track's hard, long and lifting days and every Simple Activity that is not
// _rolig_, not around the track's own days alone.
describe('planStamp lays the mix around every track', () => {
	const RUN_HOURS: StampTrack = {
		trackId: 'run',
		discipline: 'run',
		currency: 'hours',
	}
	const BIKE_HOURS: StampTrack = {
		trackId: 'bike',
		discipline: 'bike',
		currency: 'hours',
	}
	const SIMPLE: StampTrack = {
		trackId: 'simple',
		// `other` is a planned discipline, not a `Discipline` (ADR 0015 §A).
		discipline: 'other' as StampTrack['discipline'],
		currency: 'hours',
	}
	const STRENGTH: StampTrack = {
		trackId: 'lift',
		discipline: 'strength',
		currency: 'sets',
	}
	const THRESHOLD = [{ zone: 4 as const, sessionsPerWeek: 1 }]

	function laidWeek(
		tracks: StampTrack[],
		mixes: Array<{
			trackId: string
			mix: Array<{ zone: 3 | 4 | 5; sessionsPerWeek: number }>
		}>,
	): StampWeekInput {
		return {
			weekKey: '2030-01-14',
			weekInPlan: 1,
			targets: tracks.map((track) => ({ trackId: track.trackId, value: 6 })),
			mixes,
		}
	}

	function langrenn(
		weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6,
		effort: 'rolig' | 'middels' | 'hard',
	): StampDay {
		return fixed(`ski-${weekday}`, weekday, 1.5, {
			trackId: 'simple',
			workoutId: `ski-${weekday}`,
			effort,
		})
	}

	function onTrack(trackId: string, days: StampDay[]): StampDay[] {
		return days.map((day) => ({
			...day,
			dayId: `${trackId}-${day.dayId}`,
			trackId,
		}))
	}

	function hardDaysOf(
		plan: StampWeekPlan | undefined,
		trackId: string,
	): number[] {
		return plan!.sessions
			.filter((session) => session.trackId === trackId && session.zone != null)
			.map((session) => session.weekday)
	}

	// The run: Monday, Thursday, Friday and Sunday, long on Wednesday.
	const runDays = [
		share('mon', 0, 1),
		share('wed', 2, 2),
		share('thu', 3, 1),
		share('fri', 4, 1),
		share('sun', 6, 1),
	]

	test('alone, the run’s intervals go furthest from its long day', () => {
		const [plan] = planStamp({
			days: runDays,
			tracks: [RUN_HOURS],
			weeks: [laidWeek([RUN_HOURS], [{ trackId: 'run', mix: THRESHOLD }])],
		})
		expect(hardDaysOf(plan, 'run')).toEqual([6])
	})

	test('a hard Simple Activity pushes the intervals off its day and its neighbours', () => {
		const [plan] = planStamp({
			days: [...runDays, langrenn(5, 'hard')],
			tracks: [RUN_HOURS, SIMPLE],
			weeks: [
				laidWeek([RUN_HOURS, SIMPLE], [{ trackId: 'run', mix: THRESHOLD }]),
			],
		})
		// Not Friday or Sunday beside the hard Saturday ski, nor Thursday beside
		// the long Wednesday: Monday is two days from both.
		expect(hardDaysOf(plan, 'run')).toEqual([0])
	})

	test('a middels Simple Activity is a hard day too', () => {
		const [plan] = planStamp({
			days: [...runDays, langrenn(5, 'middels')],
			tracks: [RUN_HOURS, SIMPLE],
			weeks: [
				laidWeek([RUN_HOURS, SIMPLE], [{ trackId: 'run', mix: THRESHOLD }]),
			],
		})
		expect(hardDaysOf(plan, 'run')).toEqual([0])
	})

	test('a rolig Simple Activity is no anchor', () => {
		const [plan] = planStamp({
			days: [...runDays, langrenn(5, 'rolig')],
			tracks: [RUN_HOURS, SIMPLE],
			weeks: [
				laidWeek([RUN_HOURS, SIMPLE], [{ trackId: 'run', mix: THRESHOLD }]),
			],
		})
		expect(hardDaysOf(plan, 'run')).toEqual([6])
	})

	test('a lifting day pushes the intervals off it and the day after', () => {
		const [plan] = planStamp({
			days: [
				...runDays,
				fixed('lift-sun', 6, 3, {
					trackId: 'lift',
					workoutId: 'w-lift',
					orderInDay: 1,
				}),
			],
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [
				laidWeek([RUN_HOURS, STRENGTH], [{ trackId: 'run', mix: THRESHOLD }]),
			],
		})
		// Sunday lifts, Monday follows it and Thursday sits beside the long day:
		// Friday, two days from both.
		expect(hardDaysOf(plan, 'run')).toEqual([4])
	})

	test('two tracks that both carry a mix spread their hard days apart', () => {
		const days = [
			share('mon', 0, 1),
			share('wed', 2, 1),
			share('fri', 4, 1),
			share('sun', 6, 2),
		]
		const [plan] = planStamp({
			days: [...onTrack('run', days), ...onTrack('bike', days)],
			tracks: [RUN_HOURS, BIKE_HOURS],
			weeks: [
				laidWeek(
					[RUN_HOURS, BIKE_HOURS],
					[
						{ trackId: 'run', mix: THRESHOLD },
						{ trackId: 'bike', mix: THRESHOLD },
					],
				),
			],
		})
		// Each alone would take Wednesday; the bike is laid around the run.
		expect(hardDaysOf(plan, 'run')).toEqual([2])
		expect(hardDaysOf(plan, 'bike')).toEqual([4])
	})

	test('the track carrying the most hard sessions is laid first, whatever the track order', () => {
		const days = [
			share('mon', 0, 1),
			share('wed', 2, 1),
			share('fri', 4, 1),
			share('sun', 6, 2),
		]
		const [plan] = planStamp({
			days: [...onTrack('run', days), ...onTrack('bike', days)],
			// The bike comes first, but the run carries the week's hard mix.
			tracks: [BIKE_HOURS, RUN_HOURS],
			weeks: [
				laidWeek(
					[BIKE_HOURS, RUN_HOURS],
					[
						{ trackId: 'bike', mix: THRESHOLD },
						{ trackId: 'run', mix: [{ zone: 4, sessionsPerWeek: 2 }] },
					],
				),
			],
		})
		// The run's two take Wednesday and Friday, away from the long Sunday;
		// the bike's one steps around them onto Monday.
		expect(hardDaysOf(plan, 'run')).toEqual([2, 4])
		expect(hardDaysOf(plan, 'bike')).toEqual([0])
	})

	test('another track’s long day is an anchor', () => {
		const [plan] = planStamp({
			days: [
				share('mon', 0, 1),
				share('thu', 3, 1),
				share('sun', 6, 2),
				...onTrack('bike', [share('tue', 1, 1), share('fri', 4, 2)]),
			],
			tracks: [RUN_HOURS, BIKE_HOURS],
			weeks: [
				laidWeek([RUN_HOURS, BIKE_HOURS], [{ trackId: 'run', mix: THRESHOLD }]),
			],
		})
		// Alone the run takes Thursday, three days from its long Sunday; the
		// bike's long Friday puts Thursday beside it, so the earlier Monday.
		expect(hardDaysOf(plan, 'run')).toEqual([0])
	})

	test('a week with no room still lays the full mix', () => {
		const [plan] = planStamp({
			days: [
				share('tue', 1, 1),
				share('wed', 2, 1),
				share('sun', 6, 2),
				langrenn(0, 'hard'),
				langrenn(3, 'hard'),
			],
			tracks: [RUN_HOURS, SIMPLE],
			weeks: [
				laidWeek(
					[RUN_HOURS, SIMPLE],
					[
						{
							trackId: 'run',
							mix: [
								{ zone: 4, sessionsPerWeek: 1 },
								{ zone: 3, sessionsPerWeek: 1 },
							],
						},
					],
				),
			],
		})
		expect(
			plan!.sessions
				.filter((session) => session.trackId === 'run')
				.map((session) => [session.weekday, session.zone]),
		).toEqual([
			[1, 4],
			[2, 3],
			[6, null],
		])
	})

	test('the same inputs lay the same week', () => {
		const input = {
			days: [...runDays, langrenn(5, 'hard')],
			tracks: [RUN_HOURS, SIMPLE],
			weeks: [
				laidWeek([RUN_HOURS, SIMPLE], [{ trackId: 'run', mix: THRESHOLD }]),
			],
		}
		expect(planStamp(input)).toEqual(planStamp(input))
	})
})

// ADR 0104 §3 (#591): lifting is laid per week. A strength track's **lifting
// slots** carry no weekday; the stamp lays each week's endurance mix first and
// then places the slots against that week's hard days, by ADR 0103 §2's order.
describe('planStamp lays lifting per week', () => {
	const RUN_HOURS: StampTrack = {
		trackId: 'run',
		discipline: 'run',
		currency: 'hours',
	}
	const STRENGTH: StampTrack = {
		trackId: 'lift',
		discipline: 'strength',
		currency: 'sets',
	}
	const SIMPLE: StampTrack = {
		trackId: 'simple',
		discipline: 'other' as StampTrack['discipline'],
		currency: 'hours',
	}
	const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const

	// The run: Monday, Wednesday and Friday, long on Sunday.
	const runDays = [
		share('mon', 0, 1),
		share('wed', 2, 1),
		share('fri', 4, 1),
		share('sun', 6, 2),
	]

	function slots(count: number, workoutId: string | null = 'w-lift') {
		return Array.from({ length: count }, (_, index) => ({
			dayId: `slot-${index}`,
			trackId: 'lift',
			workoutId,
		}))
	}

	function laidWeek(
		weekInPlan: number,
		mix: Array<{ zone: 3 | 4 | 5; sessionsPerWeek: number }>,
	): StampWeekInput {
		return {
			weekKey: `2030-01-${String(7 + weekInPlan * 7).padStart(2, '0')}`,
			weekInPlan,
			targets: [
				{ trackId: 'run', value: 5 },
				{ trackId: 'lift', value: 12 },
			],
			mixes: [{ trackId: 'run', mix }],
		}
	}

	function liftingDaysOf(plan: StampWeekPlan | undefined): number[] {
		return plan!.sessions
			.filter((session) => session.trackId === 'lift')
			.map((session) => session.weekday)
	}

	function hardDaysOf(plan: StampWeekPlan | undefined): number[] {
		return plan!.sessions
			.filter((session) => session.zone != null)
			.map((session) => session.weekday)
	}

	test('the lifts go off the hard day, the day before it and the long day, as far apart as the week allows', () => {
		const [plan] = planStamp({
			days: runDays,
			lifting: slots(2),
			liftingDays: EVERY_DAY,
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [laidWeek(1, [{ zone: 4, sessionsPerWeek: 1 }])],
		})
		// Wednesday is the hard day, so not Tuesday or Wednesday, and Sunday is
		// long: Monday and Thursday, three days apart.
		expect(hardDaysOf(plan)).toEqual([2])
		expect(liftingDaysOf(plan)).toEqual([0, 3])
		const lifts = plan!.sessions.filter((session) => session.trackId === 'lift')
		expect(lifts.map((lift) => [lift.kind, lift.sourceWorkoutId])).toEqual([
			['lifting', 'w-lift'],
			['lifting', 'w-lift'],
		])
		expect(lifts.every((lift) => lift.carriesTss === false)).toBe(true)
	})

	test('a lift comes after the day’s endurance session', () => {
		const [plan] = planStamp({
			days: runDays,
			lifting: slots(2),
			liftingDays: EVERY_DAY,
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [laidWeek(1, [{ zone: 4, sessionsPerWeek: 1 }])],
		})
		const monday = plan!.sessions.filter((session) => session.weekday === 0)
		expect(monday.map((session) => session.trackId)).toEqual(['run', 'lift'])
		expect(monday[1]!.orderInDay).toBeGreaterThan(monday[0]!.orderInDay)
	})

	test('a build week that adds a hard session moves the lifting off the day before it', () => {
		const plans = planStamp({
			days: runDays,
			lifting: slots(2),
			liftingDays: EVERY_DAY,
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [
				laidWeek(1, [{ zone: 4, sessionsPerWeek: 1 }]),
				laidWeek(2, [
					{ zone: 4, sessionsPerWeek: 1 },
					{ zone: 5, sessionsPerWeek: 1 },
				]),
			],
		})
		// Base: Wednesday is hard, the lifts are Monday and Thursday.
		expect(hardDaysOf(plans[0])).toEqual([2])
		expect(liftingDaysOf(plans[0])).toEqual([0, 3])
		// Build: Friday is hard too, and Thursday is the day before it — the
		// Thursday lift moves to Saturday.
		expect(hardDaysOf(plans[1])).toEqual([2, 4])
		expect(liftingDaysOf(plans[1])).toEqual([0, 5])
	})

	test('a hard Simple Activity keeps the lifting off its day and the day before', () => {
		const [plan] = planStamp({
			days: [
				...runDays,
				fixed('ski-thu', 3, 1.5, {
					trackId: 'simple',
					workoutId: 'w-ski',
					effort: 'hard',
				}),
			],
			lifting: slots(2),
			liftingDays: EVERY_DAY,
			tracks: [RUN_HOURS, SIMPLE, STRENGTH],
			weeks: [laidWeek(1, [])],
		})
		const lifts = liftingDaysOf(plan)
		expect(lifts).not.toContain(3)
		expect(lifts).not.toContain(2)
		expect(lifts).toHaveLength(2)
	})

	test('lifts only on the days given, and once a day at most', () => {
		const [plan] = planStamp({
			days: runDays,
			lifting: slots(3),
			liftingDays: [0, 4],
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [laidWeek(1, [])],
		})
		expect(liftingDaysOf(plan)).toEqual([0, 4])
	})

	test('without days given, the lifts go on the pattern’s own days', () => {
		const [plan] = planStamp({
			days: runDays,
			lifting: slots(1),
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [laidWeek(1, [{ zone: 4, sessionsPerWeek: 1 }])],
		})
		expect(liftingDaysOf(plan)).toEqual([0])
	})

	test('without days given and too few pattern days for the lifts, the default training days are lifted on too', () => {
		const [plan] = planStamp({
			days: [share('wed', 2, 1)],
			lifting: slots(2),
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [laidWeek(1, [])],
		})
		// One Wednesday run cannot hold two lifts; the stated default week
		// (Tue, Thu, Sat, Sun) lends the days, so the athlete still lifts twice.
		const lifts = liftingDaysOf(plan)
		expect(lifts).toHaveLength(2)
		for (const day of lifts) {
			expect([2, ...DEFAULT_TRAINING_WEEKDAYS]).toContain(day)
		}
	})

	test('a pinned (fixed) lifting day stays put, and the slots are laid around it', () => {
		const [plan] = planStamp({
			days: [
				...runDays,
				fixed('lift-wed', 2, null, {
					trackId: 'lift',
					workoutId: 'w-pinned',
					orderInDay: 1,
				}),
			],
			lifting: slots(1),
			liftingDays: EVERY_DAY,
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [laidWeek(1, [])],
		})
		const lifts = plan!.sessions.filter((session) => session.trackId === 'lift')
		expect(lifts.find((lift) => lift.kind === 'fixed')?.weekday).toBe(2)
		const laid = lifts.filter((lift) => lift.kind === 'lifting')
		expect(laid).toHaveLength(1)
		expect(laid[0]!.weekday).not.toBe(2)
	})

	test('a slot whose session is gone is reported, not laid', () => {
		const [plan] = planStamp({
			days: runDays,
			lifting: slots(1, null),
			liftingDays: EVERY_DAY,
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [laidWeek(1, [])],
		})
		expect(liftingDaysOf(plan)).toEqual([])
		expect(plan!.skipped).toEqual([
			expect.objectContaining({
				dayId: 'slot-0',
				trackId: 'lift',
				reason: 'no-prescription',
			}),
		])
	})

	test('the same inputs lay the same lifting days', () => {
		const input = {
			days: runDays,
			lifting: slots(2),
			liftingDays: EVERY_DAY,
			tracks: [RUN_HOURS, STRENGTH],
			weeks: [
				laidWeek(1, [{ zone: 4, sessionsPerWeek: 1 }]),
				laidWeek(2, [{ zone: 5, sessionsPerWeek: 2 }]),
			],
		}
		expect(planStamp(input)).toEqual(planStamp(input))
	})
})
