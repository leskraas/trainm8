import { describe, expect, test } from 'vitest'
import { type LoadSnapshot } from '#app/components/form-load-card.tsx'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import {
	buildFitnessProjection,
	buildPhaseBands,
	buildPlanContext,
	buildProofStrip,
	buildRecentCompare,
	buildSessionNudge,
	buildTodayCard,
	buildWeekTimeline,
	buildWeeklyBuild,
	sessionCtaLabel,
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

type Workout = NonNullable<LedgerSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

function cardioStep(
	intensity: string | null,
	durationSec: number | null,
	orderIndex: number,
	discipline = 'run',
): WorkoutStep {
	return {
		id: `step-${orderIndex}`,
		kind: 'cardio',
		notes: null,
		discipline,
		intensity,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex,
		durationSec,
		distanceM: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
	}
}

/** A run workout with a single cardio block carrying the given steps. */
function runWorkout(steps: WorkoutStep[]): Workout {
	return {
		id: 'workout-1',
		title: 'Tempo Run',
		description: null,
		discipline: 'run',
		intent: 'tempo',
		blocks: [
			{ id: 'block-1', name: 'Main', orderIndex: 0, repeatCount: 1, steps },
		],
	}
}

const RUN_THRESHOLDS: DisciplineThresholdMap = {
	run: {
		lthr: 168,
		maxHr: 190,
		ftp: null,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: null,
		zoneSystem: null,
		zoneOverrides: null,
	},
}

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

	test('labels each day via the shared formatting layer (weekday + day)', () => {
		const cells = buildWeekTimeline([], NOW)
		expect(cells.map((c) => c.dayLabel)).toEqual([
			'Mon 31',
			'Tue 1',
			'Wed 2',
			'Thu 3',
			'Fri 4',
			'Sat 5',
			'Sun 6',
		])
	})

	test('renders a raw TSS float as the integer athletes read (#172)', () => {
		const cells = buildWeekTimeline(
			[
				ledger({
					id: 'float',
					scheduledAt: new Date('2030-01-01T08:00:00'),
					status: 'completed',
					tssValue: 120.6488888888889,
				}),
			],
			NOW,
		)
		const tue = cells.find((c) => c.session?.id === 'float')!
		expect(tue.session?.tss).toBe(121)
	})

	test('buckets days in the Athlete Timezone, not the runtime zone', () => {
		// 23:30 UTC on Wednesday is already Thursday in Oslo (UTC+1).
		const cells = buildWeekTimeline(
			[
				ledger({
					id: 'late',
					scheduledAt: new Date('2030-01-02T23:30:00Z'),
					status: 'scheduled',
				}),
			],
			new Date('2030-01-02T12:00:00Z'),
			{},
			'Europe/Oslo',
		)
		const thu = cells.find((c) => c.session?.id === 'late')!
		expect(thu.dayLabel).toBe('Thu 3')
	})

	test('each stop resolves its own headline metric target', () => {
		const cells = buildWeekTimeline(
			[
				ledger({
					scheduledAt: new Date('2030-01-03T08:00:00'),
					workout: runWorkout([
						cardioStep(
							JSON.stringify({
								kind: 'hrPct',
								ref: 'lthr',
								minPct: 95,
								maxPct: 99,
							}),
							1200,
							0,
						),
					]),
				}),
			],
			NOW,
			RUN_THRESHOLDS,
		)
		const fri = cells.find((c) => c.date.getDate() === 3)!
		// 95–99% of LTHR 168 → 160–166 bpm.
		expect(fri.session?.target).toEqual({
			kind: 'metric',
			metric: 'hr',
			text: '160–166 bpm',
		})
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

	test('rounds planned & actual TSS and formats the date via the shared layer (#172)', () => {
		const [row] = buildRecentCompare(
			[
				ledger({
					id: 'float',
					scheduledAt: new Date('2029-12-28T08:00:00'),
					status: 'completed',
					tssValue: 120.6488888888889,
					plannedTssValue: 99.4,
				}),
			],
			NOW,
		)
		expect(row!.actualTss).toBe(121)
		expect(row!.plannedTss).toBe(99)
		expect(row!.dateLabel).toBe('28 Dec')
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
		{ name: 'Base', weeks: 4, weeklyLoadHours: 6 },
		{ name: 'Build', weeks: 3, weeklyLoadHours: 9 },
		{ name: 'Peak', weeks: 2, weeklyLoadHours: 7 },
		{ name: 'Taper', weeks: 1, weeklyLoadHours: 3 },
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

	test('rounds a fractional planned TSS and carries a shared-format date label', () => {
		const card = buildTodayCard(
			[
				ledger({
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					plannedTssValue: 55.5555555,
				}),
			],
			NOW,
		)!
		expect(card.plannedTss).toBe(56)
		expect(card.dateLabel).toBe('5 Jan')
	})

	test('resolves the headline metric target against the athlete thresholds', () => {
		const card = buildTodayCard(
			[
				ledger({
					scheduledAt: new Date('2030-01-02T18:00:00'),
					workout: runWorkout([
						cardioStep('easy', 600, 0),
						cardioStep(
							JSON.stringify({
								kind: 'pace',
								minSecPerKm: 245,
								maxSecPerKm: 255,
							}),
							1200,
							1,
						),
					]),
				}),
			],
			NOW,
			RUN_THRESHOLDS,
		)!
		expect(card.target).toEqual({
			kind: 'metric',
			metric: 'pace',
			text: '4:05–4:15 /km',
		})
	})

	test('target is null (not fabricated) when the workout has no metric target', () => {
		const card = buildTodayCard(
			[ledger({ scheduledAt: new Date('2030-01-02T18:00:00') })],
			NOW,
			RUN_THRESHOLDS,
		)!
		expect(card.target).toBeNull()
	})

	test('carries the honest Session Status CTA — a scheduled session is viewed, never started (#179)', () => {
		const card = buildTodayCard(
			[ledger({ scheduledAt: new Date('2030-01-02T18:00:00') })],
			NOW,
		)!
		expect(card.cta).toBe('View session')
	})
})

// The tiny Session Status → CTA mapping the Today hero renders and the #184
// decision strip will consume. In-app recording is a stated non-goal, so no
// status may ever yield a "start"/"record" promise — the link opens the
// Workout Detail View, and the only extra affordance there is the Session Log
// form (reflection).
describe('sessionCtaLabel', () => {
	test('a scheduled session is "View session"', () => {
		expect(sessionCtaLabel({ status: 'scheduled', hasSessionLog: false })).toBe(
			'View session',
		)
	})

	test('a completed session without a Session Log is "Log session" — time to reflect', () => {
		expect(sessionCtaLabel({ status: 'completed', hasSessionLog: false })).toBe(
			'Log session',
		)
	})

	test('a completed session with its log written goes back to "View session"', () => {
		expect(sessionCtaLabel({ status: 'completed', hasSessionLog: true })).toBe(
			'View session',
		)
	})

	test('skipped and missed sessions are "View session" — nothing to start, nothing to log', () => {
		expect(sessionCtaLabel({ status: 'skipped', hasSessionLog: false })).toBe(
			'View session',
		)
		expect(sessionCtaLabel({ status: 'missed', hasSessionLog: false })).toBe(
			'View session',
		)
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

const snapshot = (date: string, ctl: number): LoadSnapshot => ({
	date,
	ctl,
	atl: ctl,
	tsb: 0,
})

const trust = (overrides: Partial<TsbTrust> = {}): TsbTrust => ({
	trustworthy: true,
	daysOfHistory: 60,
	requiredDays: 42,
	...overrides,
})

const DAY = 24 * 60 * 60 * 1000

describe('buildFitnessProjection', () => {
	test('is null without an active plan (the curve simply ends at today)', () => {
		expect(
			buildFitnessProjection(null, [snapshot('2030-01-02', 50)], trust()),
		).toBeNull()
	})

	test('projects dashed CTL points from the latest snapshot to race day', () => {
		const proj = buildFitnessProjection(
			planFixture(),
			[snapshot('2029-12-30', 38), snapshot('2030-01-02', 40)],
			trust(),
		)
		expect(proj?.status).toBe('projected')
		if (proj?.status !== 'projected') throw new Error('expected projected')
		// Joins the measured curve exactly at the most recent snapshot.
		expect(proj.points[0]).toEqual({ date: '2030-01-02', ctl: 40 })
		// Reaches essentially race day (14 days out) and every CTL is a real number.
		const eventMs = planFixture().eventDate.getTime()
		const lastMs = Date.parse(proj.points.at(-1)!.date)
		expect(lastMs).toBeLessThanOrEqual(eventMs)
		expect(eventMs - lastMs).toBeLessThan(DAY)
		expect(proj.points.every((p) => Number.isFinite(p.ctl))).toBe(true)
		// Climbs toward the prescribed load, away from the low anchor.
		expect(proj.points[1]!.ctl).toBeGreaterThan(proj.points[0]!.ctl)
	})

	test('is an Unavailable state (not a guess) until the CTL baseline is trustworthy', () => {
		const proj = buildFitnessProjection(
			planFixture(),
			[snapshot('2030-01-02', 40)],
			trust({ trustworthy: false, daysOfHistory: 20 }),
		)
		expect(proj?.status).toBe('unavailable')
		if (proj?.status !== 'unavailable') throw new Error('expected unavailable')
		expect(proj.reason).toContain('20/42')
	})

	test('is Unavailable when the plan carries no weekly-load pattern', () => {
		const planWithoutLoads: ActivePlan = {
			...planFixture(),
			phases: planFixture().phases.map((p) => ({
				...p,
				weeklyLoadHours: null,
			})),
		}
		const proj = buildFitnessProjection(
			planWithoutLoads,
			[snapshot('2030-01-02', 40)],
			trust(),
		)
		expect(proj?.status).toBe('unavailable')
		if (proj?.status !== 'unavailable') throw new Error('expected unavailable')
		expect(proj.reason).toMatch(/weekly-load/i)
	})
})

describe('buildSessionNudge', () => {
	// A trustworthy, fatigued Form on a cardio next-session → eased. The builder
	// reuses buildTodayCard's next-session selection and the card's reconcile
	// logic; here we assert the composed outcome, not internal calls.
	test('fatigued Form eases the next planned cardio session, naming the weekday', () => {
		const nudge = buildSessionNudge({
			ledger: [
				ledger({
					id: 'next',
					// A Saturday, after NOW (a Wednesday).
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					workout: runWorkout([cardioStep('easy', 90 * 60, 0)]),
				}),
			],
			current: { tsb: -18 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		expect(nudge.outcome).toBe('eased')
		if (nudge.outcome !== 'eased') throw new Error('expected eased')
		expect(nudge.target.discipline).toBe('run')
		expect(nudge.reason).toBe(
			"Form is low (TSB −18) — eased Saturday's session to a Z2 endurance hour.",
		)
	})

	test('fresh Form holds the next planned session', () => {
		const nudge = buildSessionNudge({
			ledger: [
				ledger({
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					workout: runWorkout([cardioStep('easy', 60 * 60, 0)]),
				}),
			],
			current: { tsb: 6 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		expect(nudge.outcome).toBe('held')
		if (nudge.outcome !== 'held') throw new Error('expected held')
		expect(nudge.reason).toBe(
			'Form is fresh (TSB +6) — your next session stands.',
		)
	})

	test('cold-start (no trustworthy Form, no sustained deviation) is unavailable', () => {
		const nudge = buildSessionNudge({
			ledger: [
				ledger({
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
				}),
			],
			current: null,
			trust: trust({ trustworthy: false, daysOfHistory: 12 }),
			sustained: null,
			now: NOW,
		})
		expect(nudge.outcome).toBe('unavailable')
		if (nudge.outcome !== 'unavailable') throw new Error('expected unavailable')
		expect(nudge.reason).toBe(
			'Your Form reading is reliable after 42 days — day 12/42.',
		)
	})

	test('no upcoming planned session yields none', () => {
		const nudge = buildSessionNudge({
			ledger: [
				ledger({
					scheduledAt: new Date('2029-12-20T08:00:00'),
					status: 'completed',
					tssValue: 50,
				}),
			],
			current: { tsb: -18 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		expect(nudge).toEqual({ outcome: 'none' })
	})

	// ── the miss-driven nudge + display honesty guard (#187, PRD #163) ─────────
	// The miss signal is selected from the SAME ledger the builder already reads
	// (`selectQualifyingMiss`, #185), so the server applier and the home surface
	// run one identical decision — no caller assembles the miss by hand (#186).

	/** A key (above-Z2) prescription missed on Monday — the qualifying miss. */
	function missedKeyMonday(): LedgerSession {
		return ledger({
			id: 'missed-key',
			// The Monday before NOW — past + still scheduled ⇒ derived missed.
			scheduledAt: new Date('2029-12-31T08:00:00'),
			status: 'scheduled',
			workout: runWorkout([
				cardioStep('easy', 600, 0),
				cardioStep('threshold', 1200, 1),
			]),
		})
	}

	/** The canonical eased prescription as the applier persists it (#158/#186):
	 * one endurance-intent block, a single Z2 cardio step, capped at an hour. */
	function persistedEasedWorkout(): NonNullable<LedgerSession['workout']> {
		return {
			...runWorkout([
				cardioStep(JSON.stringify({ kind: 'zoneLabel', label: 'Z2' }), 3600, 0),
			]),
			intent: 'endurance',
		}
	}

	test('a miss-driven ease not yet persisted renders the honest acknowledgement, never a past-tense claim', () => {
		const nudge = buildSessionNudge({
			ledger: [
				missedKeyMonday(),
				ledger({
					id: 'next',
					// A Saturday, after NOW (a Wednesday) — still the original tempo plan.
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					workout: runWorkout([cardioStep('threshold', 90 * 60, 0)]),
				}),
			],
			// Neutral Form: the miss, not a back-off signal, drives the ease.
			current: { tsb: 1 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		expect(nudge.outcome).toBe('eased')
		if (nudge.outcome !== 'eased') throw new Error('expected eased')
		expect(nudge.reason).toBe(
			"You missed Monday's session — easing your next session.",
		)
	})

	test('a miss-driven ease already persisted renders the past-tense eased reason with real labels', () => {
		const nudge = buildSessionNudge({
			ledger: [
				missedKeyMonday(),
				ledger({
					id: 'next',
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					workout: persistedEasedWorkout(),
				}),
			],
			current: { tsb: 1 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		expect(nudge.outcome).toBe('eased')
		if (nudge.outcome !== 'eased') throw new Error('expected eased')
		expect(nudge.reason).toBe(
			"You missed Monday's session — eased Saturday's session to a Z2 endurance hour so you don't stack hard days after a gap.",
		)
	})

	test('a miss with a strength next session is held with the honest miss-driven reason', () => {
		const nudge = buildSessionNudge({
			ledger: [
				missedKeyMonday(),
				ledger({
					id: 'next',
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					workout: {
						id: 'workout-2',
						title: 'Gym',
						description: null,
						discipline: 'strength',
						intent: 'strength',
						blocks: [],
					},
				}),
			],
			current: { tsb: 1 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		expect(nudge.outcome).toBe('held')
		if (nudge.outcome !== 'held') throw new Error('expected held')
		expect(nudge.reason).toBe(
			"You missed Monday's session — next session is strength, no Form-based ease yet.",
		)
	})

	test('a Form back-off ease is never guarded: it subsumes a co-occurring miss and keeps its reason', () => {
		const nudge = buildSessionNudge({
			ledger: [
				missedKeyMonday(),
				ledger({
					id: 'next',
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					workout: runWorkout([cardioStep('threshold', 90 * 60, 0)]),
				}),
			],
			current: { tsb: -18 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		expect(nudge.outcome).toBe('eased')
		if (nudge.outcome !== 'eased') throw new Error('expected eased')
		expect(nudge.reason).toBe(
			"Form is low (TSB −18) — eased Saturday's session to a Z2 endurance hour.",
		)
	})
})
