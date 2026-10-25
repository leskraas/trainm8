import { describe, expect, test } from 'vitest'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import {
	buildLoadRecomputeLine,
	buildPhaseBands,
	buildPlanContext,
	buildSessionNudge,
	buildTodayCard,
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
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: {
			id: 'workout-1',
			title: 'Morning Run',
			description: null,
			discipline: 'run',
			intent: 'endurance',
			archetype: null,
			activityKind: null,
			effortWord: null,
			blocks: [],
		},
		recording: null,
		sessionLog: null,
		setLogs: [],
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
		verticalM: null,
		gradePctMin: null,
		gradePctMax: null,
		cadenceRpmMin: null,
		cadenceRpmMax: null,
		rest: null,
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
		archetype: null,
		activityKind: null,
		effortWord: null,
		blocks: [
			{
				id: 'block-1',
				name: 'Main',
				orderIndex: 0,
				repeatCount: 1,
				seriesRepeatCount: 1,
				betweenSeriesRestSec: null,
				sendOff: null,
				steps,
			},
		],
	}
}

type ExerciseSet = WorkoutStep['sets'][number]

function exerciseSet(
	orderIndex: number,
	reps: number | null,
	weightKg: number | null,
): ExerciseSet {
	return {
		id: `set-${orderIndex}`,
		kind: 'reps',
		orderIndex,
		load:
			weightKg == null
				? null
				: JSON.stringify({ kind: 'absolute', kg: weightKg }),
		weightKg,
		pct1RM: null,
		effortCap: null,
		tempo: null,
		reps,
		durationSec: null,
		terminationRir: null,
		velocityLossPct: null,
	}
}

/** One lift of a program day: an exercise step carrying its working sets. */
function strengthStep(
	orderIndex: number,
	name: string,
	sets: ExerciseSet[],
): WorkoutStep {
	return {
		...cardioStep(null, null, orderIndex),
		id: `lift-${orderIndex}`,
		kind: 'strength',
		discipline: null,
		exerciseId: `exercise-${orderIndex}`,
		exercise: {
			id: `exercise-${orderIndex}`,
			name,
			primaryMuscle: 'quads',
			equipment: 'barbell',
		},
		sets,
	}
}

/** A strength day shape — what a program session's stamped copy looks like. */
function strengthWorkout(steps: WorkoutStep[], title = 'Workout A'): Workout {
	return {
		...runWorkout(steps),
		title,
		discipline: 'strength',
		intent: 'strength-max',
	}
}

const RUN_THRESHOLDS: DisciplineThresholdMap = {
	run: {
		lthr: 168,
		maxHr: 190,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: null,
		zoneSystem: null,
		zoneOverrides: null,
	},
}
const DAY_MS = 24 * 60 * 60 * 1000

const planFixture = (): ActivePlan => ({
	eventId: 'event-42',
	eventName: 'Spring Half Marathon',
	// 10-week plan finishing 14 days out ⇒ ~8 weeks elapsed.
	eventDate: new Date(NOW.getTime() + 14 * DAY_MS),
	planStart: new Date(NOW.getTime() + 14 * DAY_MS - 10 * 7 * DAY_MS),
	phases: [
		{ name: 'Base', weeks: 4 },
		{ name: 'Build', weeks: 3 },
		{ name: 'Peak', weeks: 2 },
		{ name: 'Taper', weeks: 1 },
	],
	// Per-week TSS as the Outline derives it, through the mix-aware Volume
	// Conversion (ADR 0045): a km-authored run track priced off the athlete's own
	// recipe, so the Build weeks carry both more volume and a harder mix.
	round: null,
	tracks: [],
	weekRoles: [],
	fillsWeeks: false,
	weeklyTss: [
		...Array<number>(4).fill(360),
		...Array<number>(3).fill(540),
		...Array<number>(2).fill(420),
		180,
	],
	loadBasis: {
		tracks: [
			{
				discipline: 'run',
				currency: 'km',
				contributes: true,
				marker: 'derived',
			},
		],
		conventions: ['minutes-in-zone-per-session', 'easy-pace-ratio'],
		formulae: ['rTSS'],
		substitutions: [],
	},
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

	// #181: the plan card must explain itself — spelled-out labels sourced from
	// the glossary's terms (Plan Outline phase, Weekly Plan Adherence), never
	// the expert shorthand "W9 of 10 · Peak" / "92% of plan".
	test('spells out the plan arc as "Week N of M · <Phase> phase" (#181)', () => {
		const ctx = buildPlanContext(
			planFixture(),
			adherence({ ratio: 0.92 }),
			NOW,
		)!
		expect(ctx.arcLabel).toBe('Week 9 of 10 · Peak phase')
	})

	// ADR 0046 §4: the ratio is a TSS ratio and strength has no TSS by decision,
	// so this figure was never the week's — it was endurance's, presented as the
	// week's. Its arithmetic is untouched; only its claim is.
	test('spells out Week Load as a share of the planned endurance load (#181, ADR 0046 §4)', () => {
		const ctx = buildPlanContext(
			planFixture(),
			adherence({ ratio: 0.92 }),
			NOW,
		)!
		expect(ctx.weekLoadLabel).toBe('92% of planned endurance load')
	})

	test('Week Load label stays honest when adherence is unavailable (#181)', () => {
		const ctx = buildPlanContext(planFixture(), null, NOW)!
		expect(ctx.weekLoadLabel).toBe('Planned endurance load unavailable')
	})

	// #184: the plan arc folds into the page header as a compact chip — the
	// countdown plus the same spelled-out arc, never "14d · Peak · W9/10".
	test('spells out the header plan-arc chip as countdown + arc (#184)', () => {
		const ctx = buildPlanContext(planFixture(), null, NOW)!
		expect(ctx.arcChipLabel).toBe('14 days to race · Week 9 of 10 · Peak phase')
	})

	test('the plan-arc chip uses the singular "day" on race-day eve (#184)', () => {
		const plan = planFixture()
		const ctx = buildPlanContext(
			plan,
			null,
			new Date(new Date(plan.eventDate!).getTime() - 12 * 60 * 60 * 1000),
		)!
		expect(ctx.arcChipLabel).toMatch(/^1 day to race · /)
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
		expect(bands.at(-1)!.end.getTime()).toBe(planFixture().eventDate!.getTime())
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

	// The strength branch (#477): a due lifting session is run, not read, so its
	// action opens the session runner rather than the Workout Detail View, and the
	// card states the lifts it will ask for.
	test('a due strength session points its action at the session runner and lists its lifts', () => {
		const card = buildTodayCard(
			[
				ledger({
					id: 'lift-day',
					scheduledAt: new Date('2030-01-02T18:00:00'),
					workout: strengthWorkout([
						strengthStep(0, 'Squat', [
							exerciseSet(0, 5, 82.5),
							exerciseSet(1, 5, 82.5),
							exerciseSet(2, 5, 82.5),
							exerciseSet(3, 5, 82.5),
							exerciseSet(4, 5, 82.5),
						]),
						strengthStep(1, 'Bench Press', [
							exerciseSet(0, 5, 60),
							exerciseSet(1, 5, 60),
						]),
					]),
				}),
			],
			NOW,
		)!
		expect(card.ctaTo).toBe('/training/sessions/lift-day/log')
		expect(card.cta).toBe('Log your sets')
		expect(card.title).toBe('Workout A')
		expect(card.lifts).toEqual([
			{ name: 'Squat', setCount: 5, reps: 5, loadLabel: '82,5 kg' },
			{ name: 'Bench Press', setCount: 2, reps: 5, loadLabel: '60 kg' },
		])
	})

	test('a strength lift whose sets disagree states the set count and no single weight, never an invented one', () => {
		const card = buildTodayCard(
			[
				ledger({
					scheduledAt: new Date('2030-01-02T18:00:00'),
					workout: strengthWorkout([
						strengthStep(0, 'Deadlift', [
							exerciseSet(0, 5, 100),
							exerciseSet(1, 3, 120),
						]),
						strengthStep(1, 'Chin-up', [exerciseSet(0, 8, null)]),
					]),
				}),
			],
			NOW,
		)!
		expect(card.lifts).toEqual([
			{ name: 'Deadlift', setCount: 2, reps: null, loadLabel: null },
			{ name: 'Chin-up', setCount: 1, reps: 8, loadLabel: null },
		])
	})

	test('a cardio session keeps the Workout Detail View and grows no strength half', () => {
		const card = buildTodayCard(
			[ledger({ scheduledAt: new Date('2030-01-02T18:00:00') })],
			NOW,
		)!
		expect(card.ctaTo).toBe('/training/sessions/ledger-1')
		expect(card.cta).toBe('View session')
		expect(card.lifts).toBeNull()
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

const trust = (overrides: Partial<TsbTrust> = {}): TsbTrust => ({
	trustworthy: true,
	daysOfHistory: 60,
	requiredDays: 42,
	...overrides,
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
			'Formen er lav (TSB −18) – økta lørdag er gjort om til en rolig time i sone 2.',
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
			'Formen er uthvilt (TSB +6) – neste økt står som planlagt.',
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
			'Formtallet er til å stole på etter 42 dager (dag 12 av 42).',
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
	 * one endurance-intent block, a single zone-2 cardio step, capped at an
	 * hour. With no recipe to read a band off, zone 2 is stored as its word. */
	function persistedEasedWorkout(): NonNullable<LedgerSession['workout']> {
		return {
			...runWorkout([
				cardioStep(
					JSON.stringify({ kind: 'zoneLabel', label: 'rolig' }),
					3600,
					0,
				),
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
			'Økta mandag ble ikke gjort – neste økt blir gjort lettere.',
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
			'Økta mandag ble ikke gjort – økta lørdag er gjort om til en rolig time i sone 2, så du ikke legger harde dager tett etter et opphold.',
		)
	})

	test('a huge repeat on the next session is read without expanding its reps', () => {
		// 1000 × 1000 × 10 s of zone 2: a million executed steps. The eased
		// target is one step, so the session cannot equal it, and saying so must
		// not walk every rep.
		const eased = persistedEasedWorkout()
		const huge: NonNullable<LedgerSession['workout']> = {
			...eased,
			blocks: eased.blocks.map((block) => ({
				...block,
				repeatCount: 1000,
				seriesRepeatCount: 1000,
				steps: block.steps.map((step) => ({ ...step, durationSec: 10 })),
			})),
		}
		const started = performance.now()
		const nudge = buildSessionNudge({
			ledger: [
				missedKeyMonday(),
				ledger({
					id: 'next',
					scheduledAt: new Date('2030-01-05T08:00:00'),
					status: 'scheduled',
					workout: huge,
				}),
			],
			current: { tsb: 1 },
			trust: trust(),
			sustained: null,
			now: NOW,
		})
		const elapsed = performance.now() - started
		expect(nudge.outcome).toBe('eased')
		if (nudge.outcome !== 'eased') throw new Error('expected eased')
		expect(nudge.reason).toBe(
			'Økta mandag ble ikke gjort – neste økt blir gjort lettere.',
		)
		expect(elapsed).toBeLessThan(50)
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
						archetype: null,
						activityKind: null,
						effortWord: null,
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
			'Økta mandag ble ikke gjort – neste økt er styrke, og den kan ikke lettes etter formen ennå.',
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
			'Formen er lav (TSB −18) – økta lørdag er gjort om til en rolig time i sone 2.',
		)
	})
})

// ── Load Recompute Notice (ADR 0046 §2) ──────────────────────────────────────

describe('buildLoadRecomputeLine', () => {
	test('names the drop, its cause, and that the athlete changed nothing', () => {
		const line = buildLoadRecomputeLine({
			kind: 'strength-left-the-triad',
			ctlBefore: 62.4,
			ctlAfter: 47.8,
		})
		expect(line).not.toBeNull()
		expect(line!.kicker).toBe('Kondisjonen er regnet ut på nytt')
		// The movement is spelled out in the same rounded units the triad shows,
		// and hedged to "up to … at the widest point" because the stored pair is
		// the day CTL moved most — which for a past gym block is not today.
		// The size is the gap between the two rounded figures it prints, so the
		// line agrees with itself: 62.4 → 47.8 is "14 — 62 → 48", never "15".
		expect(line!.movement).toBe(
			'Kondisjonen falt med opptil 14 — 62 → 48 på det meste',
		)
		// Why, in the athlete's terms — and the reassurance that this is the app
		// correcting itself, not their training slipping.
		expect(line!.explanation).toMatch(/styrke/i)
		expect(line!.explanation).toMatch(/treningen din er den samme/i)
		// The kind rides along so acknowledging this notice dismisses only it.
		expect(line!.kind).toBe('strength-left-the-triad')
	})

	test('never points the athlete at the discipline mix as the honest home', () => {
		// The mix is a share-of-total surface that still prices strength against
		// endurance TSS — its own open ruling. Copy that sent readers there would
		// vouch for a number this change hasn't fixed.
		const line = buildLoadRecomputeLine({
			kind: 'strength-left-the-triad',
			ctlBefore: 62.4,
			ctlAfter: 47.8,
		})
		// No pointer to that surface. ("mixing the two" is the copy describing what
		// it stopped doing, which is the opposite of a recommendation.)
		expect(line!.explanation).not.toMatch(/fordeling|discipline mix/i)
	})

	test('a correction that raised CTL says it rose (ADR 0107 §3)', () => {
		const line = buildLoadRecomputeLine({
			kind: 'swim-rest-left-the-pace',
			ctlBefore: 41.2,
			ctlAfter: 44.6,
		})
		expect(line).not.toBeNull()
		expect(line!.movement).toBe(
			'Kondisjonen steg med opptil 4 — 41 → 45 på det meste',
		)
		expect(line!.movement).not.toMatch(/falt/)
	})

	test('the swim correction names the rest at the wall and the file it read', () => {
		const line = buildLoadRecomputeLine({
			kind: 'swim-rest-left-the-pace',
			ctlBefore: 41.2,
			ctlAfter: 44.6,
		})
		expect(line!.kicker).toBe('Svømmeøktene er regnet ut på nytt')
		expect(line!.explanation).toMatch(/pausene ved kanten/i)
		expect(line!.explanation).toMatch(/bare lengdene du svømte/i)
		expect(line!.explanation).toMatch(/treningen din er den samme/i)
		expect(line!.kind).toBe('swim-rest-left-the-pace')
	})

	test('a huge movement is printed whole, in the units the triad shows', () => {
		const line = buildLoadRecomputeLine({
			kind: 'swim-rest-left-the-pace',
			ctlBefore: 0.4,
			ctlAfter: 1234.6,
		})
		expect(line!.movement).toBe(
			'Kondisjonen steg med opptil 1235 — 0 → 1235 på det meste',
		)
	})

	test('a movement the triad cannot show is left out, never "0 — 3 → 3"', () => {
		// The swim notice is owed for the pace even when CTL barely moved (ADR
		// 0107 §2); the line then says why, and names no movement.
		const line = buildLoadRecomputeLine({
			kind: 'swim-rest-left-the-pace',
			ctlBefore: 3.1,
			ctlAfter: 3.4,
		})
		expect(line).not.toBeNull()
		expect(line!.movement).toBeNull()
		expect(line!.explanation).toMatch(/bare lengdene du svømte/i)
	})

	test('renders nothing when there is no notice', () => {
		expect(buildLoadRecomputeLine(null)).toBeNull()
	})

	test('renders nothing for a kind it has no words for', () => {
		// Never invent an explanation: an unknown kind is silence, not a guess.
		expect(
			buildLoadRecomputeLine({
				kind: 'some-future-recompute',
				ctlBefore: 10,
				ctlAfter: 5,
			}),
		).toBeNull()
	})
})
