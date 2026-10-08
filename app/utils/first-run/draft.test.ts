import { expect, test } from 'vitest'
import { PRESET_FAMILIES } from '#app/utils/plan-outline/presets.ts'
import { draftFirstRunPlan, firstRunPhases, mixWithinDays } from './draft.ts'

// The first run's plan before it exists (#505 story 68): the days and hours
// the athlete chose, for every philosophy.

test.each(PRESET_FAMILIES)(
	'%s: the first two weeks lie on the chosen days only, and no week is over the hours given',
	(family) => {
		const draft = draftFirstRunPlan({
			family,
			goal: { kind: 'active' },
			startWeekKey: '2030-01-14',
			discipline: 'bike',
			weeklyHours: 6,
			days: [0, 2, 6],
		})!

		expect(draft.weeks).toHaveLength(2)
		for (const week of draft.weeks) {
			expect(week.sessions.map((session) => session.weekday)).toEqual([0, 2, 6])
			expect(week.planned).toBeCloseTo(week.target!, 1)
		}
		const targets = draft.targets.map((target) => target ?? 0)
		expect(Math.max(...targets)).toBeLessThanOrEqual(6)
		expect(Math.max(...targets)).toBeGreaterThan(5.5)
		// The anchor is the first week, and the climb is the family's.
		expect(draft.weeks[0]!.target).toBe(draft.anchor)
		expect(draft.anchor).toBeLessThanOrEqual(6)
		// The last chosen day is the long one.
		expect(draft.pattern.find((day) => day.role === 'long')?.weekday).toBe(6)
		expect(draft.dayWarnings).toEqual([])
	},
)

test.each([
	[16, 5],
	[25, 5],
	[51, 5],
	[104, 9],
])(
	'a race %i weeks out at %i h: every family stays at or under the hours',
	(weeks, hours) => {
		for (const family of PRESET_FAMILIES) {
			const draft = draftFirstRunPlan({
				family,
				goal: { kind: 'event', weeks },
				startWeekKey: '2030-01-14',
				discipline: 'run',
				weeklyHours: hours,
				days: [1, 3],
			})!
			expect(draft.targets).toHaveLength(weeks)
			const targets = draft.targets.map((target) => target ?? 0)
			expect(Math.max(...targets)).toBeLessThanOrEqual(hours)
			expect(draft.dayWarnings).toEqual([])
		}
	},
)

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
