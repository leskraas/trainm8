import { describe, expect, test } from 'vitest'
import {
	mixDisagreements,
	planStamp,
	type StampDay,
	type StampTrack,
	type StampWeekInput,
} from './stamp.ts'

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
