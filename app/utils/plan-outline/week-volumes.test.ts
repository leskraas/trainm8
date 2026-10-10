import { describe, expect, test } from 'vitest'
import {
	buildWeekVolumes,
	type PlanTrackTargets,
	type VolumeSession,
} from './week-volumes.ts'

// The week of Monday 2 March 2026 is plan week 2 (the plan opened 16 February).
const PLAN_START = '2026-02-16'
const MONDAY = '2026-03-02'
const TUESDAY = '2026-03-03'
const WEDNESDAY = '2026-03-04'
const THURSDAY = '2026-03-05'
const FRIDAY = '2026-03-06'
const SATURDAY = '2026-03-07'
const SUNDAY = '2026-03-08'
const NEXT_MONDAY = '2026-03-09'

function track(overrides: Partial<PlanTrackTargets> = {}): PlanTrackTargets {
	return {
		trackId: 'track-run',
		discipline: 'run',
		currency: 'km',
		targets: [40, 44, 50, 35],
		overridden: [false, false, false, false],
		sessionTargets: null,
		...overrides,
	}
}

const runTrack = track()
const skiTrack = track({
	trackId: 'track-bike',
	discipline: 'bike',
	currency: 'hours',
	targets: [6, 7, 8, 5],
})
const liftTrack = track({
	trackId: 'track-lift',
	discipline: 'strength',
	currency: 'sets',
	targets: [30, 33, 36, 18],
	sessionTargets: [3, 3, 3, 2],
})
const tssTrack = track({
	trackId: 'track-swim',
	discipline: 'swim',
	currency: 'tss',
	targets: [200, 220, 240, 150],
})

const NOTHING = { km: null, hours: null, tss: null, sets: null }

/** A planned session on `dayKey`, prescribing what `prescribed` says. */
function planned(
	dayKey: string,
	prescribed: Partial<NonNullable<VolumeSession['prescribed']>>,
	overrides: Partial<VolumeSession> = {},
): VolumeSession {
	return {
		dayKey,
		status: 'planned',
		discipline: 'run',
		easy: false,
		prescribed: { ...NOTHING, ...prescribed },
		recorded: null,
		plannedZones: [],
		doneZones: [],
		countsInNoTrack: false,
		...overrides,
	}
}

/** A completed session: what it prescribed and what was recorded. */
function done(
	dayKey: string,
	prescribed: Partial<NonNullable<VolumeSession['prescribed']>> | null,
	recorded: Partial<NonNullable<VolumeSession['recorded']>> | null,
	overrides: Partial<VolumeSession> = {},
): VolumeSession {
	return {
		dayKey,
		status: 'completed',
		discipline: 'run',
		easy: false,
		prescribed: prescribed ? { ...NOTHING, ...prescribed } : null,
		recorded: recorded ? { ...NOTHING, ...recorded } : null,
		plannedZones: [],
		doneZones: [],
		countsInNoTrack: false,
		...overrides,
	}
}

function week({
	sessions,
	todayKey = NEXT_MONDAY,
	tracks = [runTrack],
	weekKey = MONDAY,
}: {
	sessions: VolumeSession[]
	todayKey?: string
	tracks?: PlanTrackTargets[]
	weekKey?: string
}) {
	return buildWeekVolumes({
		weekKey,
		todayKey,
		planStartWeekKey: PLAN_START,
		tracks,
		sessions,
	})
}

function only<T>(items: T[]): T {
	expect(items).toHaveLength(1)
	return items[0]!
}

describe('three numbers per track, in the track’s own unit', () => {
	test('a runner reads km: the target from the plan, the planned and done sums', () => {
		const run = only(
			week({
				sessions: [
					done(MONDAY, { km: 10 }, { km: 10.4, hours: 0.9 }),
					done(WEDNESDAY, { km: 8 }, { km: 7.6, hours: 0.7 }),
					planned(SATURDAY, { km: 20 }, { status: 'missed' }),
				],
			}).tracks,
		)

		expect(run).toMatchObject({
			trackId: 'track-run',
			currency: 'km',
			target: 50,
			targetOverridden: false,
			planned: 38,
			actual: 18,
		})
		expect(run.plannedUnmeasured).toEqual([])
		expect(run.actualUnmeasured).toEqual([])
	})

	test('a runner also reads pace, and the easy pace averages only the easy sessions', () => {
		const run = only(
			week({
				sessions: [
					// 10 km in 50 min — easy, 5:00/km
					done(MONDAY, { km: 10 }, { km: 10, hours: 50 / 60 }, { easy: true }),
					// 10 km in 40 min — a hard session, 4:00/km
					done(WEDNESDAY, { km: 10 }, { km: 10, hours: 40 / 60 }),
				],
			}).tracks,
		)

		expect(run.pace).toEqual({
			actualSecPerKm: 270,
			easySecPerKm: 300,
			actualAbsence: null,
			easyAbsence: null,
		})
	})

	test('pace with nothing easy done says why rather than borrowing the hard sessions', () => {
		const run = only(
			week({
				sessions: [done(MONDAY, { km: 10 }, { km: 10, hours: 40 / 60 })],
			}).tracks,
		)
		expect(run.pace).toMatchObject({
			actualSecPerKm: 240,
			easySecPerKm: null,
			easyAbsence: 'no-easy-session',
		})
	})

	test('a skier reads hours, and the zone split is the plan as intention against what was done', () => {
		const ski = only(
			week({
				tracks: [skiTrack],
				sessions: [
					done(
						MONDAY,
						{ hours: 2 },
						{ hours: 2.1 },
						{
							discipline: 'bike',
							plannedZones: [
								{ id: 'a', zone: 2, durationSec: 6000 },
								{ id: 'b', zone: 4, durationSec: 1200 },
							],
							doneZones: [
								{ id: 'a', zone: 2, durationSec: 5400 },
								{ id: 'b', zone: 4, durationSec: 1800 },
							],
						},
					),
					planned(
						FRIDAY,
						{ hours: 1.5 },
						{
							discipline: 'bike',
							plannedZones: [{ id: 'c', zone: 1, durationSec: 5400 }],
						},
					),
				],
			}).tracks,
		)

		expect(ski).toMatchObject({
			currency: 'hours',
			target: 8,
			planned: 3.5,
			actual: 2.1,
		})
		expect(ski.zones?.planned).toEqual({
			secondsByZone: [5400, 6000, 0, 1200, 0],
			easyShare: 0.9,
		})
		expect(ski.zones?.done).toEqual({
			secondsByZone: [0, 5400, 0, 1800, 0],
			easyShare: 0.75,
		})
		expect(ski.pace).toBeNull()
	})

	test('a zone split nothing recorded says why', () => {
		const ski = only(
			week({
				tracks: [skiTrack],
				sessions: [
					done(MONDAY, { hours: 2 }, { hours: 2 }, { discipline: 'bike' }),
				],
			}).tracks,
		)
		expect(ski.zones).toMatchObject({
			planned: null,
			plannedAbsence: 'no-zone-prescribed',
			done: null,
			doneAbsence: 'no-zone-recorded',
		})
	})

	test('a lifter reads sets, and sessions against the Strength Frequency', () => {
		const lift = only(
			week({
				tracks: [liftTrack],
				sessions: [
					done(MONDAY, { sets: 12 }, { sets: 13 }, { discipline: 'strength' }),
					done(
						WEDNESDAY,
						{ sets: 12 },
						{ sets: 12 },
						{ discipline: 'strength' },
					),
					planned(FRIDAY, { sets: 12 }, { discipline: 'strength' }),
				],
			}).tracks,
		)

		expect(lift).toMatchObject({
			currency: 'sets',
			target: 36,
			planned: 36,
			actual: 25,
			sessions: { target: 3, planned: 3, done: 2 },
		})
		expect(lift.zones).toBeNull()
		expect(lift.pace).toBeNull()
	})

	test('a TSS track sums Planned TSS and actual TSS', () => {
		const swim = only(
			week({
				tracks: [tssTrack],
				sessions: [
					done(
						MONDAY,
						{ tss: 60 },
						{ tss: 72, hours: 1 },
						{ discipline: 'swim' },
					),
					planned(THURSDAY, { tss: 80 }, { discipline: 'swim' }),
				],
			}).tracks,
		)
		expect(swim).toMatchObject({ target: 240, planned: 140, actual: 72 })
	})

	test('every plan track is there, the ones with nothing on them too', () => {
		const { tracks } = week({ tracks: [runTrack, liftTrack], sessions: [] })
		expect(tracks.map((t) => t.trackId)).toEqual(['track-run', 'track-lift'])
		expect(tracks[1]).toMatchObject({ target: 36, planned: 0, actual: 0 })
	})

	test('a hand-set week reads as the athlete set it, and is marked', () => {
		const run = only(
			week({
				tracks: [
					track({
						targets: [40, 44, 46, 35],
						overridden: [false, false, true, false],
					}),
				],
				sessions: [],
			}).tracks,
		)
		expect(run).toMatchObject({ target: 46, targetOverridden: true })
	})

	test('a week outside the plan has no target, and says so', () => {
		const run = only(week({ weekKey: '2026-02-09', sessions: [] }).tracks)
		expect(run).toMatchObject({
			target: null,
			targetAbsence: 'outside-plan',
		})
	})

	test('a week inside the plan with no anchor in force says that instead', () => {
		const run = only(
			week({
				tracks: [track({ targets: [null, null, null, null] })],
				sessions: [],
			}).tracks,
		)
		expect(run).toMatchObject({ target: null, targetAbsence: 'no-anchor' })
	})

	test('a session never changes the Week Target', () => {
		const before = only(week({ sessions: [] }).tracks)
		const after = only(
			week({ sessions: [planned(TUESDAY, { km: 30 })] }).tracks,
		)
		expect(after.target).toBe(before.target)
		expect(after.planned).toBe(30)
	})
})

describe('sessions without a number are counted, never added as zero', () => {
	test('two planned sessions with no km read "+2 uten km" beside the sum', () => {
		const run = only(
			week({
				sessions: [
					planned(TUESDAY, { km: 12 }),
					planned(THURSDAY, { hours: 1 }),
					planned(SATURDAY, { hours: 1.5 }),
				],
				todayKey: MONDAY,
			}).tracks,
		)

		expect(run.planned).toBe(12)
		expect(run.plannedUnmeasured).toEqual([{ reason: 'no-distance', count: 2 }])
		expect(run.plannedUnmeasuredCount).toBe(2)
	})

	test('a done session with no import yet is waiting for its numbers', () => {
		const run = only(
			week({
				sessions: [
					done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
					done(TUESDAY, { km: 8 }, null),
				],
			}).tracks,
		)
		expect(run.actual).toBe(10)
		expect(run.actualUnmeasured).toEqual([
			{ reason: 'awaiting-import', count: 1 },
		])
		expect(run.actualUnmeasuredCount).toBe(1)
	})

	test('a planned week that is all unmeasured has no sum, not a zero', () => {
		const run = only(
			week({
				sessions: [planned(TUESDAY, { hours: 1 })],
				todayKey: MONDAY,
			}).tracks,
		)
		expect(run.planned).toBeNull()
		expect(run.plannedUnmeasuredCount).toBe(1)
	})

	test('a lifting session done without logged sets is unmeasured, not zero sets', () => {
		const lift = only(
			week({
				tracks: [liftTrack],
				sessions: [
					done(MONDAY, { sets: 12 }, null, { discipline: 'strength' }),
				],
			}).tracks,
		)
		expect(lift.actual).toBeNull()
		expect(lift.actualUnmeasured).toEqual([
			{ reason: 'no-sets-logged', count: 1 },
		])
		expect(lift.actualUnmeasuredCount).toBe(1)
	})
})

describe('the current week is graded only against the days already past', () => {
	const sessions = [
		done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
		planned(WEDNESDAY, { km: 10 }),
		planned(FRIDAY, { km: 12 }),
		planned(SUNDAY, { km: 18 }),
	]

	test('on a Monday nothing is graded yet, so it never reads "under"', () => {
		const run = only(
			week({
				todayKey: MONDAY,
				sessions: [planned(MONDAY, { km: 10 }), ...sessions.slice(1)],
			}).tracks,
		)
		expect(run.grade).toEqual({
			status: 'not-yet',
			gradedThroughKey: null,
			reference: null,
			actual: null,
			basis: null,
		})
		expect(run.grade.status).not.toBe('under')
	})

	test('on a Thursday the done volume is held against Monday to Wednesday', () => {
		const onTrack = only(
			week({
				todayKey: THURSDAY,
				sessions: [
					sessions[0]!,
					done(WEDNESDAY, { km: 10 }, { km: 9.8, hours: 1 }),
					...sessions.slice(2),
				],
			}).tracks,
		)
		expect(onTrack.grade).toEqual({
			status: 'on',
			gradedThroughKey: WEDNESDAY,
			reference: 20,
			actual: 19.8,
			basis: 'planned',
		})

		const behind = only(
			week({
				todayKey: THURSDAY,
				sessions: [
					sessions[0]!,
					planned(WEDNESDAY, { km: 10 }, { status: 'missed' }),
					...sessions.slice(2),
				],
			}).tracks,
		)
		expect(behind.grade).toMatchObject({
			status: 'under',
			gradedThroughKey: WEDNESDAY,
			reference: 20,
		})
	})

	test('a session done today is shown but waits for tomorrow to be graded', () => {
		const run = only(
			week({
				todayKey: TUESDAY,
				sessions: [
					sessions[0]!,
					done(TUESDAY, { km: 8 }, { km: 8, hours: 0.8 }),
				],
			}).tracks,
		)
		expect(run.actual).toBe(18)
		expect(run.grade).toMatchObject({
			status: 'on',
			gradedThroughKey: MONDAY,
			reference: 10,
		})
	})

	test('a closed week is graded through Sunday, against its whole target (#505 story 31)', () => {
		// Target 50, 30 planned, 36 done: over the plan's sessions, but under
		// what the week asked for — and the folded line names the target.
		const run = only(
			week({
				todayKey: NEXT_MONDAY,
				sessions: [
					done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
					done(SATURDAY, { km: 20 }, { km: 26, hours: 2 }),
				],
			}).tracks,
		)
		expect(run.grade).toEqual({
			status: 'under',
			gradedThroughKey: SUNDAY,
			reference: 50,
			actual: 36,
			basis: 'target',
		})
	})

	test('a closed week with a done number still missing falls back to the measured pairs', () => {
		const run = only(
			week({
				todayKey: NEXT_MONDAY,
				sessions: [
					done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
					done(SATURDAY, { km: 20 }, { km: 26, hours: 2 }),
					// Done, its import not in yet: 0 against the target would lie.
					done(SUNDAY, { km: 8 }, null),
				],
			}).tracks,
		)
		expect(run.grade).toMatchObject({
			status: 'over',
			reference: 30,
			actual: 36,
			basis: 'planned',
		})
	})

	test('a closed week with nothing planned in the unit is held against its target', () => {
		const run = only(
			week({
				todayKey: NEXT_MONDAY,
				sessions: [done(MONDAY, null, { km: 20, hours: 2 })],
			}).tracks,
		)
		expect(run.grade).toMatchObject({
			status: 'under',
			reference: 50,
			basis: 'target',
		})
	})

	test('an awaited import is left out, never read as 0 km: not "under" (probe a)', () => {
		const run = only(
			week({
				todayKey: WEDNESDAY,
				sessions: [
					done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
					done(TUESDAY, { km: 10 }, null),
				],
			}).tracks,
		)
		expect(run.grade).toEqual({
			status: 'on',
			gradedThroughKey: TUESDAY,
			reference: 10,
			actual: 10,
			basis: 'planned',
		})
	})

	test('a run with no planned km is left out of both sides: not "over" (probe b)', () => {
		const run = only(
			week({
				todayKey: WEDNESDAY,
				sessions: [
					// "60 min rolig", done as 12 km.
					done(MONDAY, { hours: 1 }, { km: 12, hours: 1 }),
					done(TUESDAY, { km: 10 }, { km: 10, hours: 0.9 }),
				],
			}).tracks,
		)
		expect(run.actual).toBe(22)
		expect(run.grade).toMatchObject({
			status: 'on',
			reference: 10,
			actual: 10,
		})
	})

	test('with only unmeasured sessions on past days the week is ungraded, never "under"', () => {
		const run = only(
			week({
				todayKey: WEDNESDAY,
				sessions: [
					done(MONDAY, { hours: 1 }, { km: 12, hours: 1 }),
					done(TUESDAY, { km: 10 }, null),
				],
			}).tracks,
		)
		expect(run.grade.status).toBe('ungraded')
	})

	test('a week closed on Sunday evening grades through Sunday', () => {
		const sessionsOfTheWeek = [
			done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
			done(SUNDAY, { km: 20 }, { km: 20, hours: 2 }),
		]
		const open = only(
			week({ todayKey: SUNDAY, sessions: sessionsOfTheWeek }).tracks,
		)
		expect(open.grade.gradedThroughKey).toBe(SATURDAY)

		const closed = only(
			buildWeekVolumes({
				weekKey: MONDAY,
				todayKey: SUNDAY,
				planStartWeekKey: PLAN_START,
				tracks: [track({ targets: [40, 44, 30, 35] })],
				sessions: sessionsOfTheWeek,
				closed: true,
			}).tracks,
		)
		expect(closed.grade).toMatchObject({
			status: 'on',
			gradedThroughKey: SUNDAY,
			reference: 30,
			actual: 30,
			basis: 'target',
		})
	})

	test('a week ahead is not graded', () => {
		const run = only(
			week({ todayKey: '2026-02-25', sessions: sessions.slice(1) }).tracks,
		)
		expect(run.grade.status).toBe('not-yet')
	})

	test('done sessions whose numbers have not come leave the week ungraded, with a reason', () => {
		const run = only(
			week({
				todayKey: THURSDAY,
				sessions: [done(MONDAY, { km: 10 }, null)],
			}).tracks,
		)
		expect(run.grade.status).toBe('ungraded')
	})
})

describe('the ≠ mark: planned more than 10 % off the target', () => {
	function drift(plannedKm: number, target = 50) {
		return only(
			week({
				tracks: [track({ targets: [target, target, target, target] })],
				sessions: [planned(TUESDAY, { km: plannedKm })],
				todayKey: MONDAY,
			}).tracks,
		).driftMark
	}

	test('marks a week planned over or under by more than 10 %', () => {
		expect(drift(56)).toBe(true)
		expect(drift(44)).toBe(true)
	})

	test('leaves a week inside 10 % unmarked, the edge included', () => {
		expect(drift(55)).toBe(false)
		expect(drift(45)).toBe(false)
		expect(drift(50)).toBe(false)
	})

	test('cannot tell when unmeasured sessions could explain a short week', () => {
		const run = only(
			week({
				sessions: [
					planned(TUESDAY, { km: 30 }),
					planned(THURSDAY, { hours: 1 }),
				],
				todayKey: MONDAY,
			}).tracks,
		)
		expect(run.driftMark).toBeNull()
	})

	test('still marks an overplanned week whatever is unmeasured', () => {
		const run = only(
			week({
				sessions: [
					planned(TUESDAY, { km: 60 }),
					planned(THURSDAY, { hours: 1 }),
				],
				todayKey: MONDAY,
			}).tracks,
		)
		expect(run.driftMark).toBe(true)
	})

	test('no target, no mark', () => {
		const run = only(
			week({
				weekKey: '2026-02-09',
				sessions: [planned('2026-02-10', { km: 30 })],
				todayKey: '2026-02-09',
			}).tracks,
		)
		expect(run.driftMark).toBe(false)
	})
})

describe('the strip bar is the larger of target and planned', () => {
	test('an overplanned week shows the planned sum', () => {
		const run = only(
			week({ sessions: [planned(TUESDAY, { km: 62 })], todayKey: MONDAY })
				.tracks,
		)
		expect(run.stripValue).toBe(62)
	})

	test('an underplanned week shows the target', () => {
		const run = only(
			week({ sessions: [planned(TUESDAY, { km: 20 })], todayKey: MONDAY })
				.tracks,
		)
		expect(run.stripValue).toBe(50)
	})

	test('without a target the planned sum stands alone, and with neither there is nothing', () => {
		const outside = only(
			week({
				weekKey: '2026-02-09',
				sessions: [planned('2026-02-10', { km: 30 })],
				todayKey: '2026-02-09',
			}).tracks,
		)
		expect(outside.stripValue).toBe(30)

		const empty = only(
			week({
				tracks: [track({ targets: [null, null, null, null] })],
				sessions: [planned(TUESDAY, { hours: 1 })],
				todayKey: MONDAY,
			}).tracks,
		)
		expect(empty.stripValue).toBeNull()
	})
})

describe('Annet counts in nothing', () => {
	test('an "other" import is shown apart and moves no track', () => {
		const result = week({
			sessions: [
				done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
				done(TUESDAY, null, { km: 12, hours: 0.5 }, { discipline: 'other' }),
			],
		})
		expect(only(result.tracks)).toMatchObject({ planned: 10, actual: 10 })
		expect(result.other).toEqual({
			sessions: 1,
			done: 1,
			byReason: [{ reason: 'other-discipline', count: 1 }],
		})
	})

	test('a Discipline the plan has no track for is Annet too', () => {
		const result = week({
			sessions: [
				done(TUESDAY, null, { km: 8, hours: 0.4 }, { discipline: 'bike' }),
			],
		})
		expect(only(result.tracks).actual).toBe(0)
		expect(result.other).toMatchObject({ sessions: 1, done: 1 })
	})

	test('a session the athlete put in Annet counts in no track, even with a track for it', () => {
		const result = week({
			sessions: [
				done(MONDAY, { km: 10 }, { km: 10, hours: 1 }),
				// A commute run on a plan with a run track.
				done(
					TUESDAY,
					{ km: 6 },
					{ km: 6, hours: 0.5 },
					{ countsInNoTrack: true },
				),
			],
		})
		expect(only(result.tracks)).toMatchObject({ planned: 10, actual: 10 })
		expect(result.other).toEqual({
			sessions: 1,
			done: 1,
			byReason: [{ reason: 'athlete-choice', count: 1 }],
		})
	})

	test('a week with nothing outside the tracks has no Annet', () => {
		expect(week({ sessions: [] }).other).toBeNull()
	})
})

describe('strength reported honestly when the data is partial (story 85)', () => {
	test('logged through Thursday and not after reads "til og med torsdag · resten ikke målt"', () => {
		const lift = only(
			week({
				tracks: [liftTrack],
				todayKey: NEXT_MONDAY,
				sessions: [
					done(MONDAY, { sets: 12 }, { sets: 12 }, { discipline: 'strength' }),
					done(
						THURSDAY,
						{ sets: 12 },
						{ sets: 10 },
						{ discipline: 'strength' },
					),
					done(SATURDAY, { sets: 12 }, null, { discipline: 'strength' }),
				],
			}).tracks,
		)

		expect(lift.actual).toBe(22)
		expect(lift.partial).toEqual({
			measuredThroughKey: THURSDAY,
			measuredThroughWeekday: 3,
		})
		// Graded only as far as it was measured.
		expect(lift.grade).toMatchObject({
			gradedThroughKey: THURSDAY,
			reference: 24,
			status: 'on',
		})
	})

	test('a week logged in full is not partial', () => {
		const lift = only(
			week({
				tracks: [liftTrack],
				sessions: [
					done(MONDAY, { sets: 12 }, { sets: 12 }, { discipline: 'strength' }),
				],
			}).tracks,
		)
		expect(lift.partial).toBeNull()
	})

	test('a week whose first lift went unlogged has nothing to report through', () => {
		const lift = only(
			week({
				tracks: [liftTrack],
				sessions: [
					done(MONDAY, { sets: 12 }, null, { discipline: 'strength' }),
					done(
						THURSDAY,
						{ sets: 12 },
						{ sets: 10 },
						{ discipline: 'strength' },
					),
				],
			}).tracks,
		)
		expect(lift.partial).toBeNull()
		expect(lift.actual).toBe(10)
		expect(lift.actualUnmeasuredCount).toBe(1)
	})
})
