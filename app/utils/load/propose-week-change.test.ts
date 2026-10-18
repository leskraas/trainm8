import { expect, test } from 'vitest'
import { weeklyAdherence } from './adherence.ts'
import {
	proposeWeekChange,
	type WeekChangeFacts,
} from './propose-week-change.ts'

// The proposal author under Autopilot (#576, ADR 0100 §2): "the proposal
// author is unchanged" — the same facts give the same proposals either way.
// Only the words differ: nothing waits for a yes, so a reason never asks for
// one, and the Autopilot Notice shows it as stored.

const trust = { trustworthy: true, requiredDays: 42, daysOfHistory: 90 }

/** A week 30 % over plan with a deep TSB (it softens), and a slot missed twice. */
const facts: WeekChangeFacts = {
	targetWeekKey: '2030-01-14',
	adherence: weeklyAdherence([{ plannedTss: 100, actualTss: 130 }]),
	tsb: -30,
	trust,
	adjustableSessions: [
		{ id: 'machine', owner: 'machine' },
		{ id: 'theirs', owner: 'athlete' },
	],
	missedSessions: [],
	freeDays: ['2030-01-16'],
	repeatMisses: [
		{ title: 'Intervaller', next: { id: 'slot', date: '2030-01-15' } },
	],
}

/** A light week with a missed key session and a free day for it. */
const missedFacts: WeekChangeFacts = {
	...facts,
	adherence: weeklyAdherence([{ plannedTss: 100, actualTss: 80 }]),
	tsb: 0,
	missedSessions: [
		{ id: 'missed', title: 'Langtur', date: '2030-01-12', plannedTss: 80 },
	],
}

const asking = /foreslår|sier ja|\?/

test.each([
	['a softened week', facts],
	['a week with a missed session', missedFacts],
])(
	'under autopilot, %s gets the same proposals, worded as done',
	(_, given) => {
		const ask = proposeWeekChange(given)
		const autopilot = proposeWeekChange({ ...given, autopilot: true })

		expect(autopilot.outcome).toBe(ask.outcome)
		expect(autopilot.proposals.map(({ reason: _r, ...rest }) => rest)).toEqual(
			ask.proposals.map(({ reason: _r, ...rest }) => rest),
		)
		// Under Spør meg først the reasons ask; under autopilot none of them does.
		expect(ask.proposals.some((p) => asking.test(p.reason))).toBe(true)
		for (const proposal of autopilot.proposals) {
			expect(proposal.reason).not.toMatch(asking)
		}
		expect(autopilot.reason).not.toMatch(asking)
	},
)
