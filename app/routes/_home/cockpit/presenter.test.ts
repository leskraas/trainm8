import { describe, expect, test } from 'vitest'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import {
	buildPhaseBands,
	buildPlanContext,
	buildProofStrip,
	buildRecentCompare,
	buildTodayCard,
	buildWeekTimeline,
	buildWeeklyBuild,
	startOfWeekMonday,
} from './presenter.ts'

// A fixed Wednesday at local noon — TZ-independent because every builder works
// in local time and noon avoids DST edges. The Monday of this week is Dec 31.
const NOW = new Date('2030-01-02T12:00:00')

function ledger(overrides: Partial<LedgerSession> = {}): LedgerSession {
	return {
		id: 'ledger-1',
		scheduledAt: new Date('2030-01-02T08:00:00'),
		status: 'scheduled',
		source: 'authored',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		workout: {
			id: 'workout-1',
			title: 'Morning Run',
			description: null,
			discipline: 'run',
			intent: 'endurance',
			blocks: [],
		},
		recording: null,
		sessionLog: null,
		...overrides,
	}
}

function adherence(overrides: Partial<WeeklyAdherence> = {}): WeeklyAdherence {
	return {
		ratio: 1,
		band: {
			label: 'On target',
			recommendation: 'matched the plan',
			tone: 'on-target',
		},
		sessionCount: 3,
		totalActual: 300,
		totalPlanned: 300,
		...overrides,
	}
}

describe('startOfWeekMonday', () => {
	test('returns the Monday 00:00 of the week containing the date', () => {
		const monday = startOfWeekMonday(NOW)
		expect(monday.getDay()).toBe(1)
		expect(monday.getHours()).toBe(0)
		// Wednesday Jan 2 → Monday Dec 31.
		expect(monday.getDate()).toBe(31)
		expect(monday.getMonth()).toBe(11)
	})

	test('a Monday maps to itself', () => {
		const monday = startOfWeekMonday(new Date('2029-12-31T15:00:00'))
		expect(monday.getDate()).toBe(31)
	})

	test('a Sunday maps back to the prior Monday', () => {
		const monday = startOfWeekMonday(new Date('2030-01-06T09:00:00'))
		expect(monday.getDate()).toBe(31)
	})
})

describe('buildWeekTimeline', () => {
	test('lays out seven Mon→Sun cells, marking today and resting empty days', () => {
		const cells = buildWeekTimeline([], NOW)
		expect(cells).toHaveLength(7)
		expect(cells[0]!.date.getDay()).toBe(1) // Monday first
		expect(cells.every((c) => c.state === 'rest' && c.session === null)).toBe(
			true,
		)
		const today = cells.find((c) => c.isToday)
		expect(today?.date.getDate()).toBe(2) // Wednesday Jan 2
	})

	test('places a completed session and surfaces its actual TSS', () => {
		const cells = buildWeekTimeline(
			[
				ledger({
					id: 'done',
					scheduledAt: new Date('2030-01-01T08:00:00'),
					status: 'completed',
					tssValue: 72,
					plannedTssValue: 80,
				}),
			],
			NOW,
		)
		const tue = cells.find((c) => c.date.getDate() === 1)!
		expect(tue.state).toBe('completed')
		expect(tue.session?.tss).toBe(72) // actual, not planned
		expect(tue.session?.title).toBe('Morning Run')
	})

	test('a planned future session shows planned TSS; a past scheduled one reads missed', () => {
		const cells = buildWeekTimeline(
			[
				ledger({
					id: 'planned',
					scheduledAt: new Date('2030-01-04T08:00:00'),
					status: 'scheduled',
					plannedTssValue: 90,
				}),
				ledger({
					id: 'missed',
					scheduledAt: new Date('2029-12-31T08:00:00'),
					status: 'scheduled', // past + still scheduled ⇒ missed
				}),
			],
			NOW,
		)
		const fri = cells.find((c) => c.date.getDate() === 4)!
		expect(fri.state).toBe('planned')
		expect(fri.session?.tss).toBe(90)
		const mon = cells.find((c) => c.date.getDate() === 31)!
		expect(mon.state).toBe('missed')
	})

	test('ignores sessions outside the current week', () => {
		const cells = buildWeekTimeline(
			[ledger({ scheduledAt: new Date('2030-01-20T08:00:00') })],
			NOW,
		)
		expect(cells.every((c) => c.session === null)).toBe(true)
	})
})

describe('buildRecentCompare', () => {
	test('keeps only completed sessions, newest first, up to the limit', () => {
		const rows = buildRecentCompare(
			[
				ledger({
					id: 'c1',
					scheduledAt: new Date('2029-12-20T08:00:00'),
					status: 'completed',
					tssValue: 50,
					plannedTssValue: 50,
				}),
				ledger({
					id: 'planned',
					scheduledAt: new Date('2030-01-09T08:00:00'),
					status: 'scheduled',
				}),
				ledger({
					id: 'c2',
					scheduledAt: new Date('2029-12-28T08:00:00'),
					status: 'completed',
					tssValue: 60,
					plannedTssValue: 50,
				}),
			],
			NOW,
			2,
		)
		expect(rows.map((r) => r.id)).toEqual(['c2', 'c1'])
	})

	test('exposes the adherence band only when both planned & actual TSS exist', () => {
		const [withBand, withoutBand] = buildRecentCompare(
			[
				ledger({
					id: 'over',
					scheduledAt: new Date('2029-12-28T08:00:00'),
					status: 'completed',
					tssValue: 120,
					plannedTssValue: 100,
				}),
				ledger({
					id: 'noplan',
					scheduledAt: new Date('2029-12-27T08:00:00'),
					status: 'completed',
					tssValue: 80,
					plannedTssValue: null,
				}),
			],
			NOW,
		)
		expect(withBand!.band?.tone).toBe('over')
		expect(withoutBand!.band).toBeNull()
	})
})

describe('buildWeeklyBuild', () => {
	test('maps trailing weeks to bars, marking the last as current and nulls as gaps', () => {
		const bars = buildWeeklyBuild(
			[
				adherence({ totalPlanned: 200, totalActual: 180 }),
				null,
				adherence({ totalPlanned: 300, totalActual: 312 }),
			],
			NOW,
		)
		expect(bars).toHaveLength(3)
		expect(bars[2]!.isCurrent).toBe(true)
		expect(bars[0]!.isCurrent).toBe(false)
		// Oldest bar sits two weeks before the current week's Monday.
		expect(bars[2]!.weekStart.getDate()).toBe(31)
		expect(bars[0]!.weekStart.getDate()).toBe(17)
		expect(bars[2]!).toMatchObject({ plannedTss: 300, actualTss: 312 })
		expect(bars[1]!).toMatchObject({ plannedTss: null, actualTss: null })
	})
})

const planFixture = (): ActivePlan => ({
	eventId: 'event-42',
	eventName: 'Spring Half Marathon',
	// 10-week plan finishing 14 days out ⇒ ~8 weeks elapsed.
	eventDate: new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000),
	phases: [
		{ name: 'Base', weeks: 4 },
		{ name: 'Build', weeks: 3 },
		{ name: 'Peak', weeks: 2 },
		{ name: 'Taper', weeks: 1 },
	],
})

describe('buildPlanContext', () => {
	test('is null without an active plan (road-to-race frame collapses)', () => {
		expect(buildPlanContext(null, null, NOW)).toBeNull()
	})

	test('summarizes countdown, phase, week N/M and week-load %', () => {
		const ctx = buildPlanContext(
			planFixture(),
			adherence({ ratio: 0.92 }),
			NOW,
		)!
		expect(ctx.daysToEvent).toBe(14)
		expect(ctx.totalWeeks).toBe(10)
		expect(ctx.weekInPlan).toBe(9)
		expect(ctx.phase).toBe('Peak')
		expect(ctx.weekLoadPct).toBe(92)
	})

	test('week-load is null (not fabricated) when adherence is unavailable', () => {
		const ctx = buildPlanContext(planFixture(), null, NOW)!
		expect(ctx.weekLoadPct).toBeNull()
	})
})

describe('buildPhaseBands', () => {
	test('is empty without a plan', () => {
		expect(buildPhaseBands(null, NOW)).toEqual([])
	})

	test('derives contiguous phase date ranges and flags the current phase', () => {
		const bands = buildPhaseBands(planFixture(), NOW)
		expect(bands.map((b) => b.name)).toEqual(['Base', 'Build', 'Peak', 'Taper'])
		// Contiguous: each phase starts where the previous ended.
		expect(bands[1]!.start.getTime()).toBe(bands[0]!.end.getTime())
		// Plan starts 10 weeks before the event; last phase ends on the event date.
		expect(bands.at(-1)!.end.getTime()).toBe(planFixture().eventDate.getTime())
		expect(bands.find((b) => b.isCurrent)?.name).toBe('Peak')
	})
})

describe('buildTodayCard', () => {
	test('is null when nothing is planned from today onward', () => {
		expect(
			buildTodayCard(
				[
					ledger({
						scheduledAt: new Date('2029-12-20T08:00:00'),
						status: 'completed',
						tssValue: 50,
					}),
				],
				NOW,
			),
		).toBeNull()
	})

	test('picks the soonest upcoming planned session and flags whether it is today', () => {
		const today = buildTodayCard(
			[
				ledger({
					id: 'later',
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					plannedTssValue: 70,
				}),
				ledger({
					id: 'today',
					scheduledAt: new Date('2030-01-02T18:00:00'),
					status: 'scheduled',
					plannedTssValue: 55,
				}),
			],
			NOW,
		)!
		expect(today.id).toBe('today')
		expect(today.isToday).toBe(true)
		expect(today.plannedTss).toBe(55)
	})
})

describe('buildProofStrip', () => {
	function record(overrides: Partial<PersonalRecord> = {}): PersonalRecord {
		return {
			discipline: 'run',
			kind: 'farthest',
			value: 21_100,
			sessionId: 'session-1',
			achievedAt: new Date('2030-01-01T08:00:00Z'),
			previousValue: 10_000,
			delta: 11_100,
			...overrides,
		}
	}

	test('empty records ⇒ empty strip (the empty/Unavailable state)', () => {
		expect(buildProofStrip([])).toEqual([])
	})

	test('labels and formats a run record in kilometres', () => {
		expect(buildProofStrip([record()])[0]).toEqual({
			discipline: 'run',
			disciplineLabel: 'Run',
			label: 'Longest run',
			value: '21.1 km',
			delta: '+11.1 km',
		})
	})

	test('uses the Ride label and kilometres for bike records', () => {
		const proof = buildProofStrip([
			record({ discipline: 'bike', value: 82_400, delta: 12_000 }),
		])[0]!
		expect(proof.label).toBe('Longest ride')
		expect(proof.value).toBe('82.4 km')
		// Whole-kilometre gains drop the decimal — the shared distance formatter.
		expect(proof.delta).toBe('+12 km')
	})

	test('formats swim records in metres with grouping', () => {
		const proof = buildProofStrip([
			record({ discipline: 'swim', value: 1_500, delta: 200 }),
		])[0]!
		expect(proof.label).toBe('Longest swim')
		expect(proof.value).toBe('1,500 m')
		expect(proof.delta).toBe('+200 m')
	})

	test('a first-ever record has no delta (never a fabricated +0)', () => {
		expect(
			buildProofStrip([record({ previousValue: null, delta: null })])[0]!.delta,
		).toBeNull()
	})
})
