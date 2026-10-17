import { expect, test } from 'vitest'
import { PRESET_FAMILIES } from '#app/utils/plan-outline/presets.ts'
import {
	draftFirstRunPlan,
	firstRunPhases,
	mixWithinDays,
	MIN_SESSION_HOURS,
	patternDaysFor,
} from './draft.ts'

// The first run's plan before it exists (#505 story 68): the days and hours
// the athlete chose, for every philosophy.

function draft(
	overrides: Partial<Parameters<typeof draftFirstRunPlan>[0]> = {},
) {
	const made = draftFirstRunPlan({
		family: 'classic',
		goal: { kind: 'active' },
		startWeekKey: '2030-01-14',
		discipline: 'run',
		weeklyHours: 4,
		days: [1, 3, 5, 6],
		...overrides,
	})
	if (!made) throw new Error('no draft')
	return made
}

test.each(PRESET_FAMILIES)(
	'%s: the first two weeks lie on the chosen days only, each adding up to its target',
	(family) => {
		const made = draft({
			family,
			discipline: 'bike',
			weeklyHours: 6,
			days: [0, 2, 6],
		})

		expect(made.weeks).toHaveLength(2)
		for (const week of made.weeks) {
			expect(week.sessions.map((session) => session.weekday)).toEqual([0, 2, 6])
			expect(week.planned).toBeCloseTo(week.target!, 1)
		}
		// The last chosen day is the long one.
		expect(made.pattern.find((day) => day.role === 'long')?.weekday).toBe(6)
		expect(made.dayWarnings).toEqual([])
	},
)

// Owner decision 15 (round 2): "Timer i uka" is what the athlete trains now,
// and the plan starts there. It used to be a ceiling, so a runner on 4 t got a
// first week of 2,5 t (−37 %).
test.each(PRESET_FAMILIES)(
	'%s: the hours given are the first week, and the plan builds from there',
	(family) => {
		const made = draft({ family, weeklyHours: 4 })
		expect(made.anchor).toBe(4)
		expect(made.weeks[0]!.target).toBe(4)
		expect(made.targets[0]).toBe(4)
		const priced = made.targets.filter(
			(value): value is number => value != null,
		)
		expect(Math.max(...priced)).toBeGreaterThan(4)
	},
)

test.each([
	[16, 5],
	[25, 5],
	[51, 5],
	[104, 9],
])(
	'a race %i weeks out at %i h starts at the hours, for every family',
	(weeks, hours) => {
		for (const family of PRESET_FAMILIES) {
			const made = draft({
				family,
				goal: { kind: 'event', weeks },
				weeklyHours: hours,
				days: [1, 3],
			})
			expect(made.targets).toHaveLength(weeks)
			expect(made.targets[0]).toBe(hours)
			expect(made.dayWarnings).toEqual([])
		}
	},
)

// Round 2: switching philosophy must change what the athlete sees. The
// families differ in their Quality Session Mix, and the two weeks now carry it.
test('Terskelfokus shows its two hard sessions in each of the first two weeks', () => {
	const made = draft({ family: 'threshold' })
	for (const week of made.weeks) {
		expect(
			week.sessions
				.map((session) => session.zone)
				.filter((zone) => zone != null)
				.sort(),
		).toEqual([3, 4])
		// Never on the long day.
		expect(
			week.sessions.find((session) => session.role === 'long')?.zone,
		).toBeNull()
	}
})

test('each philosophy lays its own hard sessions, so a switch is visible', () => {
	const zonesOf = (family: (typeof PRESET_FAMILIES)[number]) =>
		draft({ family }).weeks[0]!.sessions.map((session) => session.zone)
	expect(zonesOf('classic')).toEqual([null, 3, null, null])
	expect(zonesOf('polarized')).toEqual([null, 5, null, null])
	expect(zonesOf('threshold')).toEqual([4, 3, null, null])
	expect(zonesOf('polarized')).not.toEqual(zonesOf('classic'))
})

// break-ui (round 2): 0,5 t on four days gave "Langtur · 6 min".
test('few hours lay fewer days, and no session is shorter than half an hour', () => {
	const tiny = draft({ weeklyHours: 0.5 })
	expect(tiny.patternDays).toEqual([6])
	for (const week of tiny.weeks) {
		expect(week.sessions).toHaveLength(1)
		// One session is nobody's long one.
		expect(week.sessions[0]!.role).toBe('ordinary')
		expect(week.sessions[0]!.volume).toBeGreaterThanOrEqual(MIN_SESSION_HOURS)
	}
	for (const hours of [1, 1.5, 2, 3]) {
		const made = draft({ weeklyHours: hours })
		for (const session of made.weeks[0]!.sessions) {
			expect(session.volume).toBeGreaterThanOrEqual(MIN_SESSION_HOURS - 0.01)
		}
	}
})

// break-ui (round 2): all seven days gave seven sessions and no rest day.
test('seven days keep one rest day: the day after the long one', () => {
	const made = draft({ weeklyHours: 8, days: [0, 1, 2, 3, 4, 5, 6] })
	expect(made.patternDays).toEqual([1, 2, 3, 4, 5, 6])
	expect(made.weeks[0]!.sessions.map((session) => session.weekday)).toEqual([
		1, 2, 3, 4, 5, 6,
	])
})

test('the days kept are spread across the week, the long day always among them', () => {
	expect(patternDaysFor([1, 3, 5, 6], 1.5)).toEqual([3, 6])
	expect(patternDaysFor([1, 3, 5, 6], 4)).toEqual([1, 3, 5, 6])
	expect(patternDaysFor([0, 1, 2, 3, 4, 5, 6], 20)).toHaveLength(6)
	expect(patternDaysFor([2], 0.5)).toEqual([2])
})

test('a mix is cut to the days, the zone asking most first', () => {
	expect(mixWithinDays([{ zone: 5, sessionsPerWeek: 2 }], 1)).toEqual([
		{ zone: 5, sessionsPerWeek: 1 },
	])
	expect(
		mixWithinDays(
			[
				{ zone: 3, sessionsPerWeek: 1 },
				{ zone: 4, sessionsPerWeek: 1 },
			],
			1,
		),
	).toEqual([{ zone: 3, sessionsPerWeek: 1 }])
	const fits = [{ zone: 4 as const, sessionsPerWeek: 2 }]
	expect(mixWithinDays(fits, 2)).toEqual(fits)
})

test('a race gets the family’s season fitted to the weeks up to it', () => {
	for (const family of PRESET_FAMILIES) {
		const phases = firstRunPhases(family, { kind: 'event', weeks: 14 })!
		expect(phases.reduce((sum, phase) => sum + phase.weeks, 0)).toBe(14)
		expect(phases.at(-1)?.tapers).toBe(true)
	}
	expect(firstRunPhases('classic', { kind: 'event', weeks: 0 })).toBeNull()
})

// #558: the draft lays any number of Training Tracks. A second endurance
// sport is an hours track of its own with no Quality Session Mix (easy
// sessions only), on its own days.
const RUN_AND_BIKE = [
	{ discipline: 'run', weeklyHours: 4.5, days: [1, 3, 5], mix: 'family' },
	{ discipline: 'bike', weeklyHours: 2, days: [2, 6], mix: 'none' },
] as const

test.each(PRESET_FAMILIES)(
	'%s: two tracks each lie on their own days, and each week adds up to both',
	(family) => {
		const made = draftFirstRunPlan({
			family,
			goal: { kind: 'active' },
			startWeekKey: '2030-01-14',
			tracks: RUN_AND_BIKE,
		})
		if (!made) throw new Error('no draft')

		expect(made.anchor).toBe(6.5)
		expect(made.targets[0]).toBe(6.5)
		expect(made.patternDays).toEqual([1, 2, 3, 5, 6])
		expect(made.weeks).toHaveLength(2)
		for (const [index, week] of made.weeks.entries()) {
			const of = (discipline: string) =>
				week.sessions.filter((session) => session.discipline === discipline)
			expect(of('run').map((session) => session.weekday)).toEqual([1, 3, 5])
			expect(of('bike').map((session) => session.weekday)).toEqual([2, 6])
			// The second sport is easy only, and its long day is its own last day.
			expect(of('bike').every((session) => session.zone == null)).toBe(true)
			expect(of('bike').find((s) => s.role === 'long')?.weekday).toBe(6)
			expect(of('run').find((s) => s.role === 'long')?.weekday).toBe(5)
			for (const track of made.tracks) {
				const hours = of(track.discipline).reduce(
					(sum, session) => sum + (session.volume ?? 0),
					0,
				)
				expect(hours).toBeCloseTo(track.targets[index]!, 1)
			}
			expect(week.planned).toBeCloseTo(week.target!, 1)
		}
		expect(made.dayWarnings).toEqual([])
	},
)

test('the main sport keeps the family’s hard sessions beside a second sport', () => {
	const alone = draft({
		family: 'threshold',
		weeklyHours: 4.5,
		days: [1, 3, 5],
	})
	const beside = draftFirstRunPlan({
		family: 'threshold',
		goal: { kind: 'active' },
		startWeekKey: '2030-01-14',
		tracks: RUN_AND_BIKE,
	})!
	const runZones = (week: (typeof alone.weeks)[number]) =>
		week.sessions
			.filter((session) => session.discipline === 'run')
			.map((session) => session.zone)
	expect(runZones(beside.weeks[0]!)).toEqual(runZones(alone.weeks[0]!))
	expect(runZones(beside.weeks[0]!).some((zone) => zone != null)).toBe(true)
	expect(beside.tracks.map((track) => track.mix)).toEqual(['family', 'none'])
})

test('a track with no day lays nothing', () => {
	expect(
		draftFirstRunPlan({
			family: 'classic',
			goal: { kind: 'active' },
			startWeekKey: '2030-01-14',
			tracks: [RUN_AND_BIKE[0], { ...RUN_AND_BIKE[1], days: [] }],
		}),
	).toBeNull()
})
