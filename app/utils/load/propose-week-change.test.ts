import { expect, test } from 'vitest'
import { RAMP_GUARD_MAX } from '#app/utils/plan-outline/ramp-guard.ts'
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

/**
 * An open-ended plan's round done to plan, climbing +5 % a loading week as
 * Klassisk does, closing with an on-plan week.
 */
const roundFacts: WeekChangeFacts = {
	...facts,
	adherence: weeklyAdherence([{ plannedTss: 100, actualTss: 100 }]),
	tsb: 0,
	repeatMisses: [],
	round: {
		outlineId: 'outline',
		phaseId: 'round-1',
		round: 1,
		nextWeekKey: '2030-01-21',
		next: { weeks: 4, rhythm: '3:1' },
		ramp: 0.05,
		weeks: [
			{
				weekKey: '2030-01-07',
				sessions: [{ plannedTss: 100, actualTss: 100 }],
			},
			{
				weekKey: '2030-01-14',
				sessions: [{ plannedTss: 100, actualTss: 100 }],
			},
		],
	},
}

const asking = /foreslår|sier ja|\?/

test.each([
	['a softened week', facts],
	['a week with a missed session', missedFacts],
	['a round done to plan under a +5 % ramp', roundFacts],
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

// The next-round guard (#584, ADR 0100 §3): the round's first week sits one
// ramp step and the boundary step above the round's last loading week, so the
// author caps the step to keep the two within 8 % — in both modes, since the
// author is the same in both.
test.each([
	['Spør meg først', false],
	['autopilot', true],
])(
	'under %s, a round after a +5 % ramp steps up only as far as the 8 % allows',
	(_, autopilot) => {
		const { proposals } = proposeWeekChange({ ...roundFacts, autopilot })
		const round = proposals.find((p) => p.payload.kind === 'add-phase')
		const factor =
			round?.payload.kind === 'add-phase' ? round.payload.factor : null

		expect(factor).toBeGreaterThan(1)
		expect((1 + 0.05) * factor!).toBeLessThanOrEqual(1 + RAMP_GUARD_MAX)
		expect(round!.reason).toContain('ca. 3 % mer trening')
	},
)

// Week Replan picks a day that fits (#596, ADR 0104 §1): the make-up and the
// repeat-miss move go to the first free day the cross-track day rule finds no
// clash on — not next to a hard day, not the day before one when lifting —
// and fall back to the first free day, saying why, when none fits.

/**
 * The coming week (Monday 2030-01-14): an easy run Monday and Tuesday,
 * intervals Thursday, and Wednesday, Friday, Saturday and Sunday free.
 */
const comingWeek: NonNullable<WeekChangeFacts['comingWeek']> = [
	{
		id: 'mon',
		date: '2030-01-14',
		placement: { kind: 'session', effort: 'rolig' },
	},
	{
		id: 'tue',
		date: '2030-01-15',
		placement: { kind: 'session', effort: 'rolig' },
	},
	{
		id: 'thu',
		date: '2030-01-17',
		placement: { kind: 'session', effort: 'hard' },
	},
]

/** An on-plan week that holds, so only the moves are proposed. */
const holdingFacts: WeekChangeFacts = {
	...facts,
	adherence: weeklyAdherence([{ plannedTss: 100, actualTss: 100 }]),
	tsb: 0,
	repeatMisses: [],
	comingWeek,
	freeDays: ['2030-01-16', '2030-01-18', '2030-01-19', '2030-01-20'],
}

function moveOf(change: ReturnType<typeof proposeWeekChange>, id: string) {
	const proposal = change.proposals.find((p) => p.targetSessionId === id)
	return proposal?.payload.kind === 'move'
		? { toDate: proposal.payload.toDate, reason: proposal.reason }
		: null
}

test('a missed hard session is made up on a free day that is not next to a hard day', () => {
	const change = proposeWeekChange({
		...holdingFacts,
		missedSessions: [
			{
				id: 'missed',
				title: 'Terskeløkt',
				date: '2030-01-09',
				plannedTss: 90,
				placement: { kind: 'session', effort: 'hard' },
			},
		],
	})

	// Wednesday and Friday sit either side of Thursday's intervals.
	expect(moveOf(change, 'missed')?.toDate).toBe('2030-01-19')
	expect(moveOf(change, 'missed')?.reason).toContain('lørdag')
})

test('a missed lift is not made up the day before a hard session', () => {
	const change = proposeWeekChange({
		...holdingFacts,
		// Monday free, before Tuesday's intervals; Wednesday free, before an easy Thursday.
		comingWeek: [
			{
				id: 'tue',
				date: '2030-01-15',
				placement: { kind: 'session', effort: 'hard' },
			},
			{
				id: 'thu',
				date: '2030-01-17',
				placement: { kind: 'session', effort: 'rolig' },
			},
		],
		freeDays: ['2030-01-14', '2030-01-16', '2030-01-18'],
		missedSessions: [
			{
				id: 'missed',
				title: 'Styrke',
				date: '2030-01-10',
				plannedTss: null,
				placement: { kind: 'lifting' },
			},
		],
	})

	expect(moveOf(change, 'missed')?.toDate).toBe('2030-01-16')
})

test('a slot missed two weeks running moves to a day that fits, not next to the hard day', () => {
	const change = proposeWeekChange({
		...holdingFacts,
		comingWeek: [
			...comingWeek,
			{
				id: 'slot',
				date: '2030-01-15',
				placement: { kind: 'session', effort: 'hard' },
			},
		],
		repeatMisses: [
			{
				title: 'Intervaller',
				next: { id: 'slot', date: '2030-01-15' },
				placement: { kind: 'session', effort: 'hard' },
			},
		],
	})

	expect(moveOf(change, 'slot')?.toDate).toBe('2030-01-19')
	expect(moveOf(change, 'slot')?.reason).not.toContain('Ingen ledig dag')
})

/** Hard Monday (the slot), Wednesday, Friday and Sunday: every free day sits between two. */
const crowdedFacts: WeekChangeFacts = {
	...holdingFacts,
	comingWeek: ['2030-01-14', '2030-01-16', '2030-01-18', '2030-01-20'].map(
		(date) => ({
			id: date === '2030-01-14' ? 'slot' : date,
			date,
			placement: { kind: 'session', effort: 'hard' } as const,
		}),
	),
	freeDays: ['2030-01-15', '2030-01-17', '2030-01-19'],
	repeatMisses: [
		{
			title: 'Intervaller',
			next: { id: 'slot', date: '2030-01-14' },
			placement: { kind: 'session', effort: 'hard' },
		},
	],
}

test.each([
	['Spør meg først', false],
	['autopilot', true],
])(
	'under %s, when no free day fits, the move takes the first free day and its line says why',
	(_, autopilot) => {
		const move = moveOf(
			proposeWeekChange({ ...crowdedFacts, autopilot }),
			'slot',
		)

		expect(move?.toDate).toBe('2030-01-15')
		expect(move?.reason).toContain(
			'Ingen ledig dag passer helt denne uka – tirsdag og onsdag blir harde dager på rad.',
		)
	},
)

test('a missed key session with no fitting day still gets its make-up, saying why', () => {
	const move = moveOf(
		proposeWeekChange({
			...crowdedFacts,
			repeatMisses: [],
			missedSessions: [
				{
					id: 'missed',
					title: 'Terskeløkt',
					date: '2030-01-09',
					plannedTss: 90,
					placement: { kind: 'session', effort: 'hard' },
				},
			],
		}),
		'missed',
	)

	expect(move?.toDate).toBe('2030-01-15')
	expect(move?.reason).toContain('mandag og tirsdag blir harde dager på rad')
})

test("a make-up goes on its track's own day when one fits", () => {
	const move = moveOf(
		proposeWeekChange({
			...holdingFacts,
			missedSessions: [
				{
					id: 'missed',
					title: 'Langrenn',
					date: '2030-01-11',
					plannedTss: 60,
					placement: { kind: 'session', effort: 'rolig' },
					// Pinned on Saturday and Sunday (Monday first).
					ownDays: [5, 6],
				},
			],
		}),
		'missed',
	)

	expect(move?.toDate).toBe('2030-01-19')
})
