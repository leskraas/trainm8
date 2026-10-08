/**
 * The hero's other three panes (#496) — the surfaces the home rebuild dropped
 * with no ADR, and what they are allowed to say now that they render again.
 *
 * The rules under test are honesty rules, all of them older than this pane:
 * Form is refused on a cold start and said out loud instead (ADR 0008/0010), an
 * adherence figure names the track it is a ratio of (ADR 0046 §4), a Week
 * Replan decision is read rather than re-derived (ADR 0025), and no number is
 * invented where there is none (Unavailable Metric).
 */
import { expect, test } from 'vitest'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import { buildHeroPanes } from './hero-panes.ts'
import { type TimelineWeek } from './presenter.ts'

const TRUSTED: TsbTrust = {
	trustworthy: true,
	daysOfHistory: 60,
	requiredDays: 42,
}
const COLD: TsbTrust = {
	trustworthy: false,
	daysOfHistory: 12,
	requiredDays: 42,
}

function panes(
	overrides: Partial<Parameters<typeof buildHeroPanes>[0]> = {},
): ReturnType<typeof buildHeroPanes> {
	return buildHeroPanes({
		current: { ctl: 62, atl: 58, tsb: 4 },
		trust: TRUSTED,
		thisWeek: null,
		...overrides,
	})
}

function week(overrides: Partial<TimelineWeek> = {}): TimelineWeek {
	return {
		key: '2030-02-18',
		rangeLabel: '18–24 February',
		stripLabel: '18–24 Feb',
		phaseLabel: 'Build 3 · This week',
		stripPhaseLabel: 'build 3',
		statsLabel: '2 of 5 done · 48 of 312 TSS',
		plannedTss: 312,
		doneTss: 48,
		imported: false,
		planStart: false,
		isNow: true,
		dayDots: [
			'done',
			'done',
			'planned',
			'planned',
			'planned',
			'empty',
			'empty',
		],
		rows: [],
		bands: [],
		tracks: [],
		otherTrack: null,
		weekNumber: 8,
		relativeName: 'Denne uka',
		phaseName: 'Build',
		role: 'loading',
		roleLabel: 'hard uke',
		kindLabel: 'Build · hard uke',
		shape: 'open',
		foldLabel: null,
		shownDayKeys: [],
		loadLine: '0 av 0 gjort',
		...overrides,
	}
}

// ── Form: the triad, and the one number a cold start cannot stand behind ──

test('the triad reads Fitness, Fatigue and Form, in that order', () => {
	const stats = panes().form.stats
	expect(stats.map((stat) => stat.legend.short)).toEqual(['Fit', 'Fat', 'Form'])
	expect(stats.map((stat) => stat.value)).toEqual(['62', '58', '4'])
})

test('every abbreviation carries the full term it stands for (#181)', () => {
	// The legend is the trigger's own copy: the accessible name is the spelled-out
	// term, never the three letters on screen.
	expect(panes().form.stats.map((stat) => stat.legend.term)).toEqual([
		'Fitness (CTL)',
		'Fatigue (ATL)',
		'Form (TSB)',
	])
})

test('a cold start keeps the two averages and refuses Form, saying why', () => {
	const form = panes({ trust: COLD }).form
	expect(form.stats.map((stat) => stat.value)).toEqual(['62', '58', null])
	expect(form.caveat).toBe('Building baseline — day 12/42')
})

test('a trustworthy reading carries no caveat', () => {
	expect(panes().form.caveat).toBeNull()
})

test('with no load computed at all the triad shows no numbers', () => {
	const form = panes({ current: null, trust: COLD }).form
	expect(form.stats.map((stat) => stat.value)).toEqual([null, null, null])
	expect(form.caveat).toBe('Building baseline — day 12/42')
})

test('past the gate with nothing computed, the pane is quiet rather than wrong', () => {
	// The caveat counts the days the gate is waiting on; "day 60/42" would be a
	// sentence about a wait that is over.
	expect(panes({ current: null }).form.caveat).toBeNull()
})

test('the fitness trend reads off the snapshots, from the day they start', () => {
	expect(
		panes({
			snapshots: [
				{ date: '2030-01-04', ctl: 51 },
				{ date: '2030-02-01', ctl: 58 },
				{ date: '2030-02-20', ctl: 62 },
			],
		}).form.trend,
	).toBe('Fitness 51 → 62 since 4 Jan')
})

test('one snapshot is not a trend, and the other end is not invented', () => {
	expect(
		panes({ snapshots: [{ date: '2030-02-20', ctl: 62 }] }).form.trend,
	).toBeNull()
	expect(panes({ snapshots: [] }).form.trend).toBeNull()
})

// ── This week: the plan's own words, and the decision that closed the last ──

test('the week pane says what the stream’s own week header says', () => {
	// One derivation, read twice: an overview that disagrees with the thing it
	// overviews is worse than no overview.
	const pane = panes({ thisWeek: week() }).week
	expect(pane.stats).toBe('2 of 5 done · 48 of 312 TSS')
	// Minus the clause the pane's heading already carries — the header's own
	// label is `Build 3 · This week`, and saying "this week" twice reads as two
	// claims rather than one.
	expect(pane.phase).toBe('Build 3')
})

test('without a plan there is no phase to name, and the heading is enough', () => {
	expect(
		panes({ thisWeek: week({ phaseLabel: 'This week' }) }).week.phase,
	).toBeNull()
})

test('adherence names its band and the track the ratio belongs to', () => {
	const weeklyAdherence: WeeklyAdherence = {
		ratio: 0.94,
		band: {
			label: 'On target',
			recommendation: 'matched the plan',
			tone: 'on-target',
		},
		sessionCount: 4,
		totalActual: 282,
		totalPlanned: 300,
	}
	expect(panes({ weeklyAdherence }).week.adherence).toBe(
		'On target · 94% of planned endurance load',
	)
})

test('an unmeasurable week says so rather than reading 0%', () => {
	expect(panes().week.adherence).toBe('Planned endurance load unavailable')
})

test('the strength companion is a count, never a second ratio (ADR 0046 §4)', () => {
	expect(
		panes({ strengthCount: { completed: 2, planned: 3 } }).week.strength,
	).toBe('2 of 3 lifting sessions logged')
	expect(panes().week.strength).toBe('No lifting sessions this week')
})

test('the Week Replan line names the stored outcome and quotes its reason', () => {
	const pane = panes({
		weekReplan: {
			outcome: 'adjusted',
			reason:
				'Last week came in 62% of plan with Form −18, so next week is 10% lighter.',
		},
	}).week
	expect(pane.replan).toEqual({
		outcome: 'This week adjusted',
		reason:
			'Last week came in 62% of plan with Form −18, so next week is 10% lighter.',
	})
})

test('a declined replan is still a decision, and says which', () => {
	expect(
		panes({ weekReplan: { outcome: 'no-change', reason: 'On target.' } }).week
			.replan?.outcome,
	).toBe('No change')
	expect(
		panes({
			weekReplan: {
				outcome: 'insufficient-data',
				reason: 'Nothing to compare.',
			},
		}).week.replan?.outcome,
	).toBe('No adjustment')
})

test('no stored decision renders no line — never an invented status', () => {
	expect(panes().week.replan).toBeNull()
})

test('an outcome the app has no word for falls back rather than printing the enum', () => {
	expect(
		panes({ weekReplan: { outcome: 'reshuffled', reason: 'Something new.' } })
			.week.replan?.outcome,
	).toBe('Week replan')
})

test('a week with nothing in it says so rather than showing an empty line', () => {
	const pane = panes({ thisWeek: null }).week
	expect(pane.phase).toBeNull()
	expect(pane.stats).toBe('Nothing written')
})

// ── Records: the Proof Strip, through its own builder ──

test('records come through the Proof Strip builder, gain and all (ADR 0021)', () => {
	const records: PersonalRecord[] = [
		{
			discipline: 'run',
			kind: 'farthest',
			value: 21_100,
			sessionId: 'session-1',
			achievedAt: new Date('2030-02-10T09:00:00Z'),
			previousValue: 10_000,
			delta: 11_100,
		},
		{
			discipline: 'swim',
			kind: 'farthest',
			value: 1_500,
			sessionId: 'session-2',
			achievedAt: new Date('2030-01-20T09:00:00Z'),
			previousValue: null,
			delta: null,
		},
	]
	expect(panes({ personalRecords: records }).records.records).toEqual([
		{
			discipline: 'run',
			disciplineLabel: 'Run',
			label: 'Longest run',
			value: '21.1 km',
			delta: '+11.1 km',
		},
		{
			discipline: 'swim',
			disciplineLabel: 'Swim',
			label: 'Longest swim',
			value: '1,500 m',
			delta: null,
		},
	])
})

test('no qualifying effort is an empty list, never a fabricated zero', () => {
	expect(panes().records.records).toEqual([])
})
