import { describe, expect, test } from 'vitest'
import {
	ADHERENCE_ON_TARGET_AT_OR_ABOVE,
	ADHERENCE_OVER_ABOVE,
} from '#app/utils/load/adherence.ts'
import { type SessionRow } from '#app/utils/session-ledger-rows.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import { toSessionLedgerEntry } from '#app/utils/training.ts'
import { buildRowContent, type RowWeekContext } from './row-content.ts'

// A fixed Wednesday at local noon, matching the cockpit presenter's fixtures:
// TZ-independent, and noon leaves room either side for a past/future session.
const NOW = new Date('2030-01-02T12:00:00')
const EARLIER_TODAY = new Date('2030-01-02T08:00:00')
const LATER_TODAY = new Date('2030-01-02T18:00:00')

type Workout = NonNullable<LedgerSession['workout']>
type WorkoutBlock = Workout['blocks'][number]
type WorkoutStep = WorkoutBlock['steps'][number]
type ExerciseSet = WorkoutStep['sets'][number]
type Recording = NonNullable<LedgerSession['recording']>

const PLANNED_WEEK: RowWeekContext = { imported: false, isNow: false }
const THIS_WEEK: RowWeekContext = { imported: false, isNow: true }
const IMPORTED_WEEK: RowWeekContext = { imported: true, isNow: false }

function step(overrides: Partial<WorkoutStep> = {}): WorkoutStep {
	return {
		id: 'step-1',
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity: null,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex: 0,
		durationSec: null,
		distanceM: null,
		verticalM: null,
		gradePct: null,
		cadenceRpmMin: null,
		cadenceRpmMax: null,
		rest: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

function exerciseSet(orderIndex: number): ExerciseSet {
	return {
		id: `set-${orderIndex}`,
		kind: 'reps',
		orderIndex,
		load: JSON.stringify({ kind: 'absolute', kg: 90 }),
		weightKg: 90,
		pct1RM: null,
		effortCap: null,
		tempo: null,
		reps: 5,
		durationSec: null,
		terminationRir: null,
		velocityLossPct: null,
	}
}

function block(
	steps: WorkoutStep[],
	overrides: Partial<WorkoutBlock> = {},
): WorkoutBlock {
	return {
		id: 'block-1',
		name: 'Main',
		orderIndex: 0,
		repeatCount: 1,
		seriesRepeatCount: 1,
		betweenSeriesRestSec: null,
		sendOff: null,
		steps,
		...overrides,
	}
}

function workout(
	blocks: WorkoutBlock[],
	overrides: Partial<Workout> = {},
): Workout {
	return {
		id: 'workout-1',
		title: 'Long easy run',
		description: null,
		discipline: 'run',
		intent: 'endurance',
		archetype: null,
		blocks,
		...overrides,
	}
}

function recording(overrides: Partial<Recording> = {}): Recording {
	return {
		id: 'recording-1',
		discipline: 'run',
		durationSec: 3000,
		distanceM: 9200,
		startedAt: EARLIER_TODAY,
		endedAt: NOW,
		phaseBarsJson: null,
		...overrides,
	}
}

/**
 * A ledger row built the way the stream builds one — the entry comes from
 * `toSessionLedgerEntry`, never hand-written, so a change to how status,
 * duration or the Adherence Band derive shows up in these expectations rather
 * than being papered over by a fixture.
 */
function row(overrides: Partial<LedgerSession> = {}): SessionRow {
	const session: LedgerSession = {
		id: 'session-1',
		scheduledAt: EARLIER_TODAY,
		status: 'completed',
		source: 'authored',
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: null,
		recording: null,
		sessionLog: null,
		...overrides,
	}
	return {
		kind: 'session',
		id: session.id,
		session,
		entry: toSessionLedgerEntry(session, NOW),
		bars: [],
		groups: [],
		isPast: session.scheduledAt.getTime() < NOW.getTime(),
	}
}

// ---------------------------------------------------------------------------
// Rule 1 — two lines, two kinds of load
// ---------------------------------------------------------------------------

describe('rule 1: line 1 is external load, per discipline', () => {
	test('a completed run reads distance, duration and pace', () => {
		const content = buildRowContent(
			row({
				workout: workout([block([step()])], { discipline: 'run' }),
				// 9.2 km in 50 min = 326 s/km.
				recording: recording({ distanceM: 9200, durationSec: 3000 }),
			}),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('9.2 km · 50 min · 5:26 /km')
	})

	test('a completed bike ride reads km/h rather than pace', () => {
		const content = buildRowContent(
			row({
				workout: workout([block([step({ discipline: 'bike' })])], {
					discipline: 'bike',
				}),
				recording: recording({
					discipline: 'bike',
					distanceM: 16000,
					durationSec: 2400,
				}),
			}),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('16 km · 40 min · 24.0 km/h')
	})

	test('a completed swim keeps metres and reads pace per 100 m', () => {
		const content = buildRowContent(
			row({
				workout: workout([block([step({ discipline: 'swim' })])], {
					discipline: 'swim',
				}),
				recording: recording({
					discipline: 'swim',
					distanceM: 2000,
					durationSec: 2400,
				}),
			}),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('2,000 m · 40 min · 2:00 /100m')
	})

	test('a treadmill-style recording with no distance states duration only', () => {
		const content = buildRowContent(
			row({ recording: recording({ distanceM: null, durationSec: 3000 }) }),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('50 min')
	})

	test('a zero distance is not a distance', () => {
		const content = buildRowContent(
			row({ recording: recording({ distanceM: 0, durationSec: 3000 }) }),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('50 min')
	})

	test('a completed strength session has no external load to state', () => {
		// The strength actual is `ExerciseSetLog`, which a ledger row does not
		// carry — so `Squat 82.5 × 5` is impossible and nothing is invented. The
		// prescription's duration must NOT leak onto a "what you did" line.
		const content = buildRowContent(
			row({
				workout: workout(
					[block([step({ kind: 'strength', durationSec: 2700 })])],
					{ discipline: 'strength' },
				),
				recording: null,
				tssValue: 42,
				sessionLog: { id: 'log-1', rpe: 6 },
			}),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBeNull()
		expect(content.internalLoad).toBe('42 TSS · RPE 6')
	})
})

describe('rule 1 / rule 8: line 2 is internal load', () => {
	test('RPE from the Session Log rides on line 2', () => {
		const content = buildRowContent(
			row({
				recording: recording(),
				tssValue: 88,
				plannedTssValue: 91,
				sessionLog: { id: 'log-1', rpe: 8 },
			}),
			PLANNED_WEEK,
		)
		// The chip already says 88, so line 2 does not repeat it.
		expect(content.internalLoad).toBe('RPE 8')
	})

	test('no RPE and a chip that states the load leaves line 2 empty', () => {
		const content = buildRowContent(
			row({ recording: recording(), tssValue: 88, plannedTssValue: 91 }),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).toBeNull()
	})

	test('the actual TSS appears on line 2 when no chip states it', () => {
		const content = buildRowContent(
			row({
				source: 'recorded',
				recording: recording({ discipline: 'bike', distanceM: 14000 }),
				tssValue: 24,
				sessionLog: { id: 'log-1', rpe: 2 },
			}),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).toBe('24 TSS · RPE 2')
	})
})

// ---------------------------------------------------------------------------
// Rules 2 and 3 — HR drift and quality-session reps. No inputs exist.
// ---------------------------------------------------------------------------

describe('rules 2 and 3: nothing is invented where the data does not exist', () => {
	test('no HR drift clause is emitted, because no field carries it', () => {
		const content = buildRowContent(
			row({
				recording: recording(),
				tssValue: 88,
				plannedTssValue: 91,
				sessionLog: { id: 'log-1', rpe: 8 },
			}),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).not.toMatch(/drift/i)
		expect(content.internalLoad).not.toMatch(/bpm/i)
	})

	test('a quality session says nothing about its reps', () => {
		const content = buildRowContent(
			row({
				workout: workout(
					[block([step({ intensityPaceMin: 248 })], { repeatCount: 4 })],
					{ intent: 'threshold', archetype: 'threshold-intervals' },
				),
				recording: recording({ distanceM: 11400, durationSec: 3720 }),
				tssValue: 88,
				plannedTssValue: 91,
				sessionLog: { id: 'log-1', rpe: 8 },
			}),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).toBe('RPE 8')
		expect(content.externalLoad).toBe('11.4 km · 62 min · 5:26 /km')
	})
})

// ---------------------------------------------------------------------------
// Rule 4 — the compliance chip names its basis and its band
// ---------------------------------------------------------------------------

describe('rule 4: the compliance chip names its basis and its band', () => {
	function chip(tssValue: number, plannedTssValue: number) {
		const content = buildRowContent(
			row({ recording: recording(), tssValue, plannedTssValue }),
			PLANNED_WEEK,
		)
		return content.chips.find((c) => c.id === 'compliance')
	}

	test('an on-target session names TSS, both sides and the band', () => {
		expect(chip(88, 91)).toEqual({
			id: 'compliance',
			label: 'TSS 88 / 91 · ON TARGET',
			tone: 'primary',
		})
	})

	test('an under session reads UNDER in a warning tone', () => {
		expect(chip(21, 30)).toEqual({
			id: 'compliance',
			label: 'TSS 21 / 30 · UNDER',
			tone: 'warn',
		})
	})

	test('an over session reads OVER in a warning tone', () => {
		expect(chip(130, 100)).toEqual({
			id: 'compliance',
			label: 'TSS 130 / 100 · OVER',
			tone: 'warn',
		})
	})

	test('exactly 0.85 is still ON TARGET — the under edge is exclusive', () => {
		expect(ADHERENCE_ON_TARGET_AT_OR_ABOVE).toBe(0.85)
		expect(chip(85, 100)?.label).toBe('TSS 85 / 100 · ON TARGET')
	})

	test('a hair under 0.85 is UNDER', () => {
		expect(chip(84.9, 100)?.label).toBe('TSS 85 / 100 · UNDER')
	})

	test('exactly 1.08 is still ON TARGET — the over edge is exclusive', () => {
		expect(ADHERENCE_OVER_ABOVE).toBe(1.08)
		expect(chip(108, 100)?.label).toBe('TSS 108 / 100 · ON TARGET')
	})

	test('a hair over 1.08 is OVER', () => {
		expect(chip(108.1, 100)?.label).toBe('TSS 108 / 100 · OVER')
	})

	test('the chip rounds both sides to the load numbers athletes read', () => {
		expect(chip(87.6, 91.4)?.label).toBe('TSS 88 / 91 · ON TARGET')
	})

	test('a completed strength session bands on TSS, since no set actual exists', () => {
		const content = buildRowContent(
			row({
				workout: workout([block([step({ kind: 'strength' })])], {
					discipline: 'strength',
				}),
				tssValue: 44,
				plannedTssValue: 45,
			}),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([
			{ id: 'compliance', label: 'TSS 44 / 45 · ON TARGET', tone: 'primary' },
		])
	})
})

// ---------------------------------------------------------------------------
// Rule 5 — no band without both sides
// ---------------------------------------------------------------------------

describe('rule 5: no band without both sides', () => {
	test('an unplanned session refuses a percentage and says so', () => {
		const content = buildRowContent(
			row({ source: 'recorded', recording: recording(), tssValue: 24 }),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([
			{
				id: 'compliance',
				label: 'UNPLANNED · NO PLAN TO COMPARE',
				tone: 'muted',
			},
		])
	})

	test('a detected session is unplanned even though it carries a Planned TSS', () => {
		// ADR 0033: the structure was derived from this very recording, so banding
		// it would be the app grading a ride against itself.
		const content = buildRowContent(
			row({
				source: 'detected',
				workout: workout([block([step()])]),
				recording: recording(),
				tssValue: 88,
				plannedTssValue: 91,
			}),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([
			{
				id: 'compliance',
				label: 'UNPLANNED · NO PLAN TO COMPARE',
				tone: 'muted',
			},
		])
	})

	test('a generated session with only an actual gets no chip at all', () => {
		const content = buildRowContent(
			row({ source: 'generated', recording: recording(), tssValue: 88 }),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([])
	})

	test('a session with only a Planned TSS gets no chip', () => {
		const content = buildRowContent(
			row({ recording: recording(), plannedTssValue: 91 }),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([])
	})

	test('a non-positive Planned TSS cannot anchor a denominator', () => {
		const content = buildRowContent(
			row({ recording: recording(), tssValue: 40, plannedTssValue: 0 }),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([])
	})

	test('an imported week gets no compliance chip', () => {
		const content = buildRowContent(
			row({ recording: recording(), tssValue: 88, plannedTssValue: 91 }),
			IMPORTED_WEEK,
		)
		expect(content.chips).toEqual([])
		// …and the load moves to line 2, because nothing else now states it.
		expect(content.internalLoad).toBe('88 TSS')
	})

	test('an imported week suppresses even the UNPLANNED chip', () => {
		const content = buildRowContent(
			row({ source: 'recorded', recording: recording(), tssValue: 88 }),
			IMPORTED_WEEK,
		)
		expect(content.chips).toEqual([])
	})

	test('an imported row still reads its external load in full', () => {
		const content = buildRowContent(
			row({
				source: 'recorded',
				recording: recording({ distanceM: 8100, durationSec: 2700 }),
			}),
			IMPORTED_WEEK,
		)
		expect(content.externalLoad).toBe('8.1 km · 45 min · 5:33 /km')
	})
})

// ---------------------------------------------------------------------------
// Rule 6 — a missed session invents nothing
// ---------------------------------------------------------------------------

describe('rule 6: a missed session invents nothing', () => {
	test('a session stored as missed reads "Nothing recorded" and MISSED', () => {
		const content = buildRowContent(
			row({
				status: 'missed',
				scheduledAt: EARLIER_TODAY,
				workout: workout([block([step({ durationSec: 3000 })])]),
				plannedTssValue: 42,
			}),
			THIS_WEEK,
		)
		expect(content.externalLoad).toBe('Nothing recorded')
		expect(content.internalLoad).toBeNull()
		expect(content.chips).toEqual([
			{ id: 'compliance', label: 'MISSED', tone: 'bad' },
		])
	})

	test('a skipped session is missed too', () => {
		const content = buildRowContent(
			row({ status: 'skipped', workout: workout([block([step()])]) }),
			THIS_WEEK,
		)
		expect(content.externalLoad).toBe('Nothing recorded')
		expect(content.chips[0]?.label).toBe('MISSED')
	})

	test('a past session still marked scheduled is missed', () => {
		const content = buildRowContent(
			row({
				status: 'scheduled',
				scheduledAt: new Date('2030-01-01T08:00:00'),
				workout: workout([block([step()])]),
			}),
			THIS_WEEK,
		)
		expect(content.externalLoad).toBe('Nothing recorded')
		expect(content.chips[0]?.label).toBe('MISSED')
	})

	test('a missed session in an imported week gets no chip', () => {
		const content = buildRowContent(
			row({ status: 'missed', workout: workout([block([step()])]) }),
			IMPORTED_WEEK,
		)
		expect(content.chips).toEqual([])
	})

	test('the block context the rule also wants is not invented', () => {
		const content = buildRowContent(
			row({ status: 'missed', workout: workout([block([step()])]) }),
			THIS_WEEK,
		)
		// "Second quality session missed in this block" needs the other sessions
		// in the block; one row plus its week context is not that.
		expect(content.internalLoad).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// Rule 7 — planned rows are instructions, not results
// ---------------------------------------------------------------------------

describe('rule 7: planned rows are instructions', () => {
	function plannedRow(w: Workout, overrides: Partial<LedgerSession> = {}) {
		return row({
			status: 'scheduled',
			scheduledAt: LATER_TODAY,
			source: 'generated',
			workout: w,
			plannedTssValue: 42,
			...overrides,
		})
	}

	test('a duration-quantified run states minutes, Planned TSS and "planned"', () => {
		const content = buildRowContent(
			plannedRow(
				workout([
					block([
						step({
							durationSec: 3000,
							intensityPaceMin: 325,
							intensityPaceMax: 340,
							intensityHrMax: 145,
						}),
					]),
				]),
			),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('50 min · 42 TSS planned')
		expect(content.internalLoad).toBe('5:25–5:40 /km · under 145 bpm')
	})

	test('a distance-quantified run puts the distance in the target', () => {
		const content = buildRowContent(
			plannedRow(
				workout([
					block([
						step({
							distanceM: 9000,
							intensityPaceMin: 325,
							intensityPaceMax: 340,
							intensityHrMax: 145,
						}),
					]),
				]),
			),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('42 TSS planned')
		expect(content.internalLoad).toBe('9 km at 5:25–5:40 /km · under 145 bpm')
	})

	test('a repeated block multiplies both the duration and the distance', () => {
		const content = buildRowContent(
			plannedRow(
				workout([
					block([step({ distanceM: 1000, intensityPaceMin: 240 })], {
						repeatCount: 4,
						seriesRepeatCount: 2,
					}),
				]),
			),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).toBe('8 km at 4:00 /km')
	})

	test('a single-bound pace target reads as one pace', () => {
		const content = buildRowContent(
			plannedRow(
				workout([block([step({ durationSec: 1800, intensityPaceMin: 330 })])]),
			),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).toBe('5:30 /km')
	})

	test('steps disagreeing on pace produce no session-wide window', () => {
		const content = buildRowContent(
			plannedRow(
				workout([
					block([
						step({ id: 'wu', durationSec: 600, intensityPaceMin: 400 }),
						step({
							id: 'work',
							orderIndex: 1,
							durationSec: 1200,
							intensityPaceMin: 250,
							intensityPaceMax: 255,
							intensityHrMax: 172,
						}),
					]),
				]),
			),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('30 min · 42 TSS planned')
		expect(content.internalLoad).toBe('under 172 bpm')
	})

	test('the HR cap is the loosest one, the only ceiling true of the session', () => {
		const content = buildRowContent(
			plannedRow(
				workout([
					block([
						step({ id: 'wu', durationSec: 600, intensityHrMax: 145 }),
						step({
							id: 'work',
							orderIndex: 1,
							durationSec: 1200,
							intensityHrMax: 172,
						}),
					]),
				]),
			),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).toBe('under 172 bpm')
	})

	test('an unresolved prescription states no target at all', () => {
		const content = buildRowContent(
			plannedRow(workout([block([step({ durationSec: 3000 })])])),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('50 min · 42 TSS planned')
		expect(content.internalLoad).toBeNull()
	})

	test('a planned strength session states its set count', () => {
		const content = buildRowContent(
			plannedRow(
				workout(
					[
						block(
							[
								step({
									kind: 'strength',
									discipline: null,
									sets: [1, 2, 3, 4, 5].map(exerciseSet),
								}),
							],
							{ repeatCount: 3 },
						),
					],
					{ discipline: 'strength', title: 'Workout A' },
				),
			),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBe('42 TSS planned')
		expect(content.internalLoad).toBe('15 sets')
	})

	test('a planned strength session with no authored sets states nothing', () => {
		const content = buildRowContent(
			plannedRow(
				workout([block([step({ kind: 'strength', discipline: null })])], {
					discipline: 'strength',
				}),
			),
			PLANNED_WEEK,
		)
		expect(content.internalLoad).toBeNull()
	})

	test('the load delta the rule also wants is not invented', () => {
		const content = buildRowContent(
			plannedRow(
				workout(
					[
						block([
							step({
								kind: 'strength',
								discipline: null,
								sets: [exerciseSet(0)],
							}),
						]),
					],
					{ discipline: 'strength' },
				),
			),
			PLANNED_WEEK,
		)
		// "first time at 90 kg" needs the lift's history; the set is at 90 kg and
		// the row still refuses to claim it is a first.
		expect(content.internalLoad).toBe('1 set')
		expect(content.internalLoad).not.toMatch(/first time/)
	})

	test('a planned session with nothing quantified has no line 1', () => {
		const content = buildRowContent(
			plannedRow(workout([block([step()])]), { plannedTssValue: null }),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBeNull()
	})

	test('a planned session with no workout has neither line', () => {
		const content = buildRowContent(
			row({
				status: 'scheduled',
				scheduledAt: LATER_TODAY,
				workout: null,
				recording: null,
			}),
			PLANNED_WEEK,
		)
		expect(content.externalLoad).toBeNull()
		expect(content.internalLoad).toBeNull()
	})

	test('a planned row carries no compliance chip — nothing has happened yet', () => {
		const content = buildRowContent(
			plannedRow(workout([block([step({ durationSec: 3000 })])])),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([])
	})

	test('the rule applies to a far-future week exactly as to this one', () => {
		const w = workout([
			block([
				step({ distanceM: 9000, intensityPaceMin: 325, intensityPaceMax: 340 }),
			]),
		])
		const far = buildRowContent(
			plannedRow(w, { scheduledAt: new Date('2030-04-10T08:00:00') }),
			PLANNED_WEEK,
		)
		const near = buildRowContent(plannedRow(w), THIS_WEEK)
		expect(far.internalLoad).toBe('9 km at 5:25–5:40 /km')
		expect(far.internalLoad).toBe(near.internalLoad)
	})
})

// ---------------------------------------------------------------------------
// Rule 8 — chips that exist because the app has them
// ---------------------------------------------------------------------------

describe('rule 8: the chips the app can actually supply', () => {
	test('the Replan Note is a quiet chip, verbatim', () => {
		const content = buildRowContent(
			row({
				status: 'scheduled',
				scheduledAt: LATER_TODAY,
				workout: workout([block([step({ durationSec: 2400 })])]),
				plannedTssValue: 34,
				replanReason: 'Eased by the week replan',
			}),
			PLANNED_WEEK,
		)
		expect(content.chips).toEqual([
			{ id: 'replan', label: 'Eased by the week replan', tone: 'muted' },
		])
	})

	test('a completed session carries its Replan Note after the band', () => {
		const content = buildRowContent(
			row({
				recording: recording(),
				tssValue: 88,
				plannedTssValue: 91,
				replanReason: 'Legs came round after rep two',
			}),
			PLANNED_WEEK,
		)
		expect(content.chips.map((c) => c.id)).toEqual(['compliance', 'replan'])
	})

	test('no PR chip is ever emitted — a row cannot know about a best effort', () => {
		const content = buildRowContent(
			row({ recording: recording(), tssValue: 88, plannedTssValue: 91 }),
			PLANNED_WEEK,
		)
		expect(content.chips.map((c) => c.id)).not.toContain('pr')
	})
})

// ---------------------------------------------------------------------------
// Today's row
// ---------------------------------------------------------------------------

describe("today's row", () => {
	test('a planned session today reads TODAY · NOT DONE YET', () => {
		const content = buildRowContent(
			row({
				status: 'scheduled',
				scheduledAt: LATER_TODAY,
				workout: workout([block([step({ durationSec: 3720 })])]),
				plannedTssValue: 91,
			}),
			THIS_WEEK,
			{ isToday: true },
		)
		expect(content.chips).toEqual([
			{ id: 'today', label: 'TODAY · NOT DONE YET', tone: 'primary' },
		])
		expect(content.externalLoad).toBe('62 min · 91 TSS planned')
	})

	test('a session already done today is not "not done yet"', () => {
		const content = buildRowContent(
			row({ recording: recording(), tssValue: 88, plannedTssValue: 91 }),
			THIS_WEEK,
			{ isToday: true },
		)
		expect(content.chips.map((c) => c.id)).toEqual(['compliance'])
	})

	test('a session missed earlier today is not "not done yet" either', () => {
		const content = buildRowContent(
			row({ status: 'missed', workout: workout([block([step()])]) }),
			THIS_WEEK,
			{ isToday: true },
		)
		expect(content.chips.map((c) => c.label)).toEqual(['MISSED'])
	})

	test('the today chip leads, then the band, then the Replan Note', () => {
		const content = buildRowContent(
			row({
				status: 'scheduled',
				scheduledAt: LATER_TODAY,
				workout: workout([block([step({ durationSec: 3000 })])]),
				plannedTssValue: 42,
				replanReason: 'Eased by the week replan',
			}),
			THIS_WEEK,
			{ isToday: true },
		)
		expect(content.chips.map((c) => c.id)).toEqual(['today', 'replan'])
	})

	test('omitting the options object is the same as not being today', () => {
		const base = row({
			status: 'scheduled',
			scheduledAt: LATER_TODAY,
			workout: workout([block([step({ durationSec: 3000 })])]),
			plannedTssValue: 42,
		})
		expect(buildRowContent(base, THIS_WEEK)).toEqual(
			buildRowContent(base, THIS_WEEK, { isToday: false }),
		)
	})
})

// ---------------------------------------------------------------------------
// The week context
// ---------------------------------------------------------------------------

describe('the week context', () => {
	test('isNow changes nothing — rule 7 applies to every planned week', () => {
		const base = row({
			status: 'scheduled',
			scheduledAt: LATER_TODAY,
			workout: workout([
				block([
					step({
						durationSec: 3000,
						intensityPaceMin: 325,
						intensityPaceMax: 340,
					}),
				]),
			]),
			plannedTssValue: 42,
		})
		expect(buildRowContent(base, { imported: false, isNow: true })).toEqual(
			buildRowContent(base, { imported: false, isNow: false }),
		)
	})

	test('imported changes only the chips, never the two lines', () => {
		const base = row({
			recording: recording(),
			tssValue: 88,
			plannedTssValue: 91,
			sessionLog: { id: 'log-1', rpe: 8 },
		})
		const planned = buildRowContent(base, PLANNED_WEEK)
		const imported = buildRowContent(base, IMPORTED_WEEK)
		expect(imported.externalLoad).toBe(planned.externalLoad)
		expect(planned.chips).toHaveLength(1)
		expect(imported.chips).toHaveLength(0)
		// The one difference on line 2: with no chip to carry it, the load moves in.
		expect(planned.internalLoad).toBe('RPE 8')
		expect(imported.internalLoad).toBe('88 TSS · RPE 8')
	})
})
