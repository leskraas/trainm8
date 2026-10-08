import { expect, test } from 'vitest'
import { PRESET_FAMILIES } from '#app/utils/plan-outline/presets.ts'
import { draftFirstRunPlan, firstRunPhases } from './draft.ts'

// The first run's plan before it exists (#505 story 68): the days and hours
// the athlete chose, for every philosophy.

test.each(PRESET_FAMILIES)(
	'%s: the first two weeks lie on the chosen days only, the first at the hours given',
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
		expect(draft.weeks[0]!.target).toBe(6)
		// The last chosen day is the long one.
		expect(draft.pattern.find((day) => day.role === 'long')?.weekday).toBe(6)
	},
)

test('a race gets the family’s season fitted to the weeks up to it', () => {
	for (const family of PRESET_FAMILIES) {
		const phases = firstRunPhases(family, { kind: 'event', weeks: 14 })!
		expect(phases.reduce((sum, phase) => sum + phase.weeks, 0)).toBe(14)
		expect(phases.at(-1)?.tapers).toBe(true)
	}
	expect(firstRunPhases('classic', { kind: 'event', weeks: 0 })).toBeNull()
})
