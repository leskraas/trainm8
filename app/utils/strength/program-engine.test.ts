import { expect, test, vi } from 'vitest'
import {
	type AnchorReEstimator,
	type LiftOutcome,
	type ProgramInstanceState,
	type ProgramLiftState,
	applySession,
	nextSession,
} from './program-engine.ts'
import { type LoggedWorkSet, type ProgramDefinition } from './program-rules.ts'
import {
	GREYSKULL_DOUBLE_INCREMENT_AT_REPS,
	MADCOW_ROLLBACK_SESSIONS_BACK,
	STRONGLIFTS_EMPTY_BAR_START_KG,
	STRONGLIFTS_PULL_START_KG,
	greySkullLp,
	startingStrengthPhaseOne,
	strongLifts5x5Basic,
} from './program.constants.ts'

// ——— Fixtures ————————————————————————————————————————————————————————————

const IDS = {
	squat: 'ex_squat',
	benchPress: 'ex_bench',
	barbellRow: 'ex_row',
	overheadPress: 'ex_ohp',
	deadlift: 'ex_deadlift',
}
const NOW = '2026-08-14T17:00:00.000Z'

const strongLifts = strongLifts5x5Basic(IDS)

function liftState(
	exerciseId: string,
	weightKg: number,
	overrides: Partial<ProgramLiftState> = {},
): ProgramLiftState {
	const rule = strongLifts.liftRules.find((r) => r.exerciseId === exerciseId)
	return {
		exerciseId,
		equipment: null,
		currentWorkingWeightKg: weightKg,
		unroundedWorkingWeightKg: weightKg,
		trainingMaxKg: null,
		workingFraction: null,
		stallCount: 0,
		currentIncrement: rule?.increment ?? { kind: 'absolute', deltaKg: 2.5 },
		stallCutPctOverride: null,
		progressEveryNSessionsOverride: null,
		weightHistory: [],
		stallHistory: [],
		...overrides,
	}
}

function instance(
	lifts: ProgramLiftState[],
	nextDayId = 'A',
	definition: ProgramDefinition = strongLifts,
): ProgramInstanceState {
	return {
		programId: definition.id,
		variantId: definition.variantId,
		cursor: { kind: 'alternatingDays', nextDayId },
		lifts,
	}
}

/** `n` working sets of `reps` reps at `weightKg`, as the log would hold them. */
function sets(
	exerciseId: string,
	weightKg: number,
	reps: number[],
): LoggedWorkSet[] {
	return reps.map((count, index) => ({
		exerciseId,
		equipment: null,
		orderIndex: index,
		role: 'working',
		outcome: 'completed',
		reps: count,
		weightKg,
	}))
}

const FIVE_BY_FIVE = [5, 5, 5, 5, 5]

function outcomeFor(outcomes: LiftOutcome[], exerciseId: string): LiftOutcome {
	const found = outcomes.find((o) => o.exerciseId === exerciseId)
	if (!found) throw new Error(`no outcome for ${exerciseId}`)
	return found
}

function weightOf(state: ProgramInstanceState, exerciseId: string): number {
	const lift = state.lifts.find((l) => l.exerciseId === exerciseId)
	if (!lift) throw new Error(`no lift state for ${exerciseId}`)
	return lift.currentWorkingWeightKg
}

// ——— The success predicate is all-sets-all-reps, and nothing partial ————————

test('twenty-five of twenty-five reps adds this lift’s own increment', () => {
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 100)]),
		strongLifts,
		sets(IDS.squat, 100, FIVE_BY_FIVE),
		'session-1',
		NOW,
	)

	expect(weightOf(nextState, IDS.squat)).toBe(102.5)
	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome.kind).toBe('incremented')
	expect(outcome).toMatchObject({ fromKg: 100, toKg: 102.5 })
})

test('twenty-four of twenty-five repeats the weight — the predicate is every set, not most of them', () => {
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 100)]),
		strongLifts,
		sets(IDS.squat, 100, [5, 5, 5, 5, 4]),
		'session-1',
		NOW,
	)

	expect(weightOf(nextState, IDS.squat)).toBe(100)
	expect(outcomeFor(outcomes, IDS.squat)).toMatchObject({
		kind: 'repeated',
		weightKg: 100,
		stallCount: 1,
	})
})

test('a fifth set that was never logged is not a completed set, so the weight repeats', () => {
	const { nextState } = applySession(
		instance([liftState(IDS.squat, 100)]),
		strongLifts,
		sets(IDS.squat, 100, [5, 5, 5, 5]),
		'session-1',
		NOW,
	)

	expect(weightOf(nextState, IDS.squat)).toBe(100)
})

test('a racked set is dropped from the predicate rather than counted, and the session still did not make the weight', () => {
	const logged = sets(IDS.squat, 100, FIVE_BY_FIVE)
	logged[4] = { ...logged[4]!, outcome: 'abandoned', reps: 2 }

	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 100)]),
		strongLifts,
		logged,
		'session-1',
		NOW,
	)

	// Four completed sets of five is not five, so the weight holds — and the
	// abandoned set is not averaged in as "2 reps" anywhere.
	expect(weightOf(nextState, IDS.squat)).toBe(100)
	expect(outcomeFor(outcomes, IDS.squat).kind).toBe('repeated')
})

test('warm-up sets never satisfy the predicate', () => {
	const warmups: LoggedWorkSet[] = sets(IDS.squat, 40, FIVE_BY_FIVE).map(
		(set) => ({ ...set, role: 'warmup' }),
	)
	const { outcomes } = applySession(
		instance([liftState(IDS.squat, 100)]),
		strongLifts,
		warmups,
		'session-1',
		NOW,
	)

	// No working sets at all is "skipped", not "failed": a warm-up cannot fail a
	// program and must not touch the Stall Count.
	expect(outcomeFor(outcomes, IDS.squat).kind).toBe('skipped')
})

// ——— The Stall Count and the Stall Response ———————————————————————————————

test('the third consecutive miss triggers the Stall Response and resets the Stall Count', () => {
	let state = instance([liftState(IDS.squat, 100)])
	const missed = sets(IDS.squat, 100, [5, 5, 5, 5, 4])
	const kinds: string[] = []

	for (const sessionId of ['s1', 's2', 's3']) {
		const result = applySession(state, strongLifts, missed, sessionId, NOW, {
			performedDayId: 'A',
		})
		state = result.nextState
		kinds.push(outcomeFor(result.outcomes, IDS.squat).kind)
	}

	expect(kinds).toEqual(['repeated', 'repeated', 'stalled'])
	// −10 % of 100 kg, arithmetic and unrounded to plates: loadability is a
	// separate module and a separate line on the screen.
	expect(weightOf(state, IDS.squat)).toBe(90)
	const squat = state.lifts[0]!
	expect(squat.stallCount).toBe(0)
	expect(squat.stallHistory).toEqual([
		{ sessionId: 's3', fromKg: 100, toKg: 90, response: 'stallCut' },
	])
})

test('a session that made the weight resets the Stall Count, so two misses either side of it never add up to three', () => {
	let state = instance([liftState(IDS.squat, 100)])
	const missed = sets(IDS.squat, 100, [5, 5, 5, 5, 4])

	state = applySession(state, strongLifts, missed, 's1', NOW, {
		performedDayId: 'A',
	}).nextState
	state = applySession(
		state,
		strongLifts,
		sets(IDS.squat, 100, FIVE_BY_FIVE),
		's2',
		NOW,
		{ performedDayId: 'A' },
	).nextState
	const third = applySession(state, strongLifts, missed, 's3', NOW, {
		performedDayId: 'A',
	})

	expect(outcomeFor(third.outcomes, IDS.squat)).toMatchObject({
		kind: 'repeated',
		stallCount: 1,
	})
	expect(weightOf(third.nextState, IDS.squat)).toBe(102.5)
})

test('a Stall Cut says which percentage moved the weight and that the percentage is convention', () => {
	const state = instance([liftState(IDS.squat, 100, { stallCount: 2 })])
	const { outcomes } = applySession(
		state,
		strongLifts,
		sets(IDS.squat, 100, [5, 5, 5, 5, 1]),
		's3',
		NOW,
		{ performedDayId: 'A' },
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome.kind).toBe('stalled')
	expect('reason' in outcome && outcome.reason).toMatch(/10 %/)
	expect('reason' in outcome && outcome.reason).toMatch(/no trial/)
})

test('the athlete’s own stall-cut setting wins over the program’s, because the reference product exposes it per exercise', () => {
	const state = instance([
		liftState(IDS.squat, 100, { stallCount: 2, stallCutPctOverride: 20 }),
	])
	const { nextState } = applySession(
		state,
		strongLifts,
		sets(IDS.squat, 100, [5, 5, 5, 5, 1]),
		's3',
		NOW,
		{ performedDayId: 'A' },
	)

	expect(weightOf(nextState, IDS.squat)).toBe(80)
})

// ——— The lift, not the program, owns the rule —————————————————————————————

test('the deadlift progresses by its own rule inside a 5×5 program — one set of five, and a bigger jump', () => {
	const state = instance(
		[liftState(IDS.squat, 100), liftState(IDS.deadlift, 120)],
		'B',
	)
	const logged = [
		...sets(IDS.squat, 100, FIVE_BY_FIVE),
		// One set. Five sets of five would be a different lift's rule.
		...sets(IDS.deadlift, 120, [5]),
	]

	const { nextState } = applySession(state, strongLifts, logged, 's1', NOW)

	expect(weightOf(nextState, IDS.squat)).toBe(102.5)
	expect(weightOf(nextState, IDS.deadlift)).toBe(125)
})

test('a lift can be mid-stall while another is still adding weight, because progression state is per lift', () => {
	const state = instance(
		[
			liftState(IDS.squat, 100, { stallCount: 2 }),
			liftState(IDS.benchPress, 60),
		],
		'A',
	)
	const logged = [
		...sets(IDS.squat, 100, [5, 5, 5, 5, 3]),
		...sets(IDS.benchPress, 60, FIVE_BY_FIVE),
	]

	const { nextState } = applySession(state, strongLifts, logged, 's1', NOW)

	expect(weightOf(nextState, IDS.squat)).toBe(90)
	expect(weightOf(nextState, IDS.benchPress)).toBe(62.5)
})

test('the deadlift’s stall shrinks its own increment, exactly as the program publishes it', () => {
	const state = instance([liftState(IDS.deadlift, 120, { stallCount: 2 })], 'B')
	const { nextState } = applySession(
		state,
		strongLifts,
		sets(IDS.deadlift, 120, [3]),
		's3',
		NOW,
	)

	expect(nextState.lifts[0]!.currentIncrement).toEqual({
		kind: 'absolute',
		deltaKg: 2.5,
	})
	// And the shrunken increment is what the next success uses.
	const after = applySession(
		nextState,
		strongLifts,
		sets(IDS.deadlift, weightOf(nextState, IDS.deadlift), [5]),
		's4',
		NOW,
		{ performedDayId: 'B' },
	)
	expect(weightOf(after.nextState, IDS.deadlift)).toBe(110.5)
})

// ——— The cursor is stored, never counted ——————————————————————————————————

test('the A/B cursor advances on a skipped session without desyncing the program', () => {
	// Nothing was logged at all. The day still happened, so the cursor moves and
	// no lift is penalised for a session the athlete did not do.
	const state = instance(
		[liftState(IDS.squat, 100), liftState(IDS.benchPress, 60)],
		'A',
	)
	const { nextState, outcomes } = applySession(
		state,
		strongLifts,
		[],
		's1',
		NOW,
	)

	expect(nextState.cursor).toEqual({
		kind: 'alternatingDays',
		nextDayId: 'B',
	})
	expect(outcomes.every((o) => o.kind === 'skipped')).toBe(true)
	expect(nextState.lifts.map((l) => l.stallCount)).toEqual([0, 0])
	expect(nextState.lifts.map((l) => l.weightHistory.length)).toEqual([0, 0])
})

test('a lift that is not on today’s day is left alone entirely', () => {
	const state = instance(
		[liftState(IDS.benchPress, 60), liftState(IDS.overheadPress, 40)],
		'A',
	)
	const { nextState, outcomes } = applySession(
		state,
		strongLifts,
		sets(IDS.benchPress, 60, [5, 5, 5, 5, 2]),
		's1',
		NOW,
	)

	// The bench missed and repeats; the press is not on workout A and gets no
	// outcome, no history entry and no Stall Count.
	expect(outcomeFor(outcomes, IDS.benchPress).kind).toBe('repeated')
	expect(outcomes.some((o) => o.exerciseId === IDS.overheadPress)).toBe(false)
	const press = nextState.lifts.find((l) => l.exerciseId === IDS.overheadPress)!
	expect(press.stallCount).toBe(0)
	expect(press.weightHistory).toEqual([])
})

test('a back-filled session advances the cursor from the day that was performed, not from the day the cursor guessed', () => {
	const state = instance([liftState(IDS.squat, 100)], 'A')
	const { nextState } = applySession(
		state,
		strongLifts,
		sets(IDS.squat, 100, FIVE_BY_FIVE),
		's1',
		NOW,
		{ performedDayId: 'B' },
	)

	expect(nextState.cursor).toEqual({
		kind: 'alternatingDays',
		nextDayId: 'A',
	})
})

// ——— The whole run, as a fold ——————————————————————————————————————————————

test('six StrongLifts sessions fold to the weights the program publishes, ABA·BAB, with no calendar anywhere', () => {
	// The true cycle is two weeks / six sessions, and this is the test the spec
	// says makes the pure seam sufficient: the cursor, the predicate, the
	// increment and the per-lift rules, in one fold with no database.
	let state = instance(
		[
			liftState(IDS.squat, STRONGLIFTS_EMPTY_BAR_START_KG),
			liftState(IDS.benchPress, STRONGLIFTS_EMPTY_BAR_START_KG),
			liftState(IDS.barbellRow, STRONGLIFTS_PULL_START_KG),
			liftState(IDS.overheadPress, STRONGLIFTS_EMPTY_BAR_START_KG),
			liftState(IDS.deadlift, STRONGLIFTS_PULL_START_KG),
		],
		'A',
	)

	for (let session = 0; session < 6; session++) {
		const plan = nextSession(state, strongLifts, NOW)
		const logged = plan.lifts.flatMap((lift) =>
			lift.sets.map((set, index) => ({
				exerciseId: lift.exerciseId,
				equipment: null,
				orderIndex: index,
				role: 'working' as const,
				outcome: 'completed' as const,
				reps: set.reps,
				weightKg: set.weight.kind === 'resolved' ? set.weight.kg : null,
			})),
		)
		state = applySession(
			state,
			strongLifts,
			logged,
			`s${session}`,
			NOW,
		).nextState
	}

	// The squat is on both days, so it went up six times; the bench and the row
	// are on A only and the press and deadlift on B, so each went up three.
	expect(weightOf(state, IDS.squat)).toBe(35)
	expect(weightOf(state, IDS.benchPress)).toBe(27.5)
	expect(weightOf(state, IDS.barbellRow)).toBe(37.5)
	expect(weightOf(state, IDS.overheadPress)).toBe(27.5)
	// The deadlift's 5 kg jump, three times, and one set of five each time.
	expect(weightOf(state, IDS.deadlift)).toBe(45)
	expect(state.cursor).toEqual({ kind: 'alternatingDays', nextDayId: 'A' })
})

// ——— Progression frequency is a setting, not a constant ————————————————————

test('a lift set to progress every third workout holds the weight for two successes and moves on the third', () => {
	let state = instance([
		liftState(IDS.squat, 100, { progressEveryNSessionsOverride: 3 }),
	])
	const kinds: string[] = []

	for (const sessionId of ['s1', 's2', 's3']) {
		const result = applySession(
			state,
			strongLifts,
			sets(IDS.squat, weightOf(state, IDS.squat), FIVE_BY_FIVE),
			sessionId,
			NOW,
			{ performedDayId: 'A' },
		)
		state = result.nextState
		kinds.push(outcomeFor(result.outcomes, IDS.squat).kind)
	}

	expect(kinds).toEqual(['repeated', 'repeated', 'incremented'])
	expect(weightOf(state, IDS.squat)).toBe(102.5)
})

// ——— GreySkull: the AMRAP set is the rule —————————————————————————————————

test('GreySkull adds double the increment when the AMRAP set reaches ten reps, and says the threshold is reverse-engineered', () => {
	const greySkull = greySkullLp(IDS)
	const state: ProgramInstanceState = {
		programId: greySkull.id,
		variantId: greySkull.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [
			{
				...liftState(IDS.squat, 100),
				currentIncrement: greySkull.liftRules.find(
					(r) => r.exerciseId === IDS.squat,
				)!.increment,
			},
		],
	}

	const { nextState, outcomes } = applySession(
		state,
		greySkull,
		sets(IDS.squat, 100, [5, 5, GREYSKULL_DOUBLE_INCREMENT_AT_REPS]),
		's1',
		NOW,
	)

	expect(weightOf(nextState, IDS.squat)).toBe(105)
	expect(outcomeFor(outcomes, IDS.squat).reason).toMatch(
		/reverse-engineered from secondary sources/,
	)
})

test('GreySkull stalls on the first miss, because its response is immediate', () => {
	const greySkull = greySkullLp(IDS)
	const state: ProgramInstanceState = {
		programId: greySkull.id,
		variantId: greySkull.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [
			{
				...liftState(IDS.squat, 100),
				currentIncrement: greySkull.liftRules.find(
					(r) => r.exerciseId === IDS.squat,
				)!.increment,
			},
		],
	}

	const { nextState, outcomes } = applySession(
		state,
		greySkull,
		sets(IDS.squat, 100, [5, 5, 4]),
		's1',
		NOW,
	)

	expect(outcomeFor(outcomes, IDS.squat).kind).toBe('stalled')
	expect(weightOf(nextState, IDS.squat)).toBe(90)
})

// ——— Starting Strength: two things at once —————————————————————————————————

test('Starting Strength cuts the weight and shrinks the increment, because the program says both', () => {
	const startingStrength = startingStrengthPhaseOne(IDS)
	const rule = startingStrength.liftRules.find(
		(r) => r.exerciseId === IDS.squat,
	)!
	const state: ProgramInstanceState = {
		programId: startingStrength.id,
		variantId: startingStrength.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [
			{
				...liftState(IDS.squat, 100, { stallCount: 2 }),
				currentIncrement: rule.increment,
			},
		],
	}

	const { nextState } = applySession(
		state,
		startingStrength,
		sets(IDS.squat, 100, [5, 5, 3]),
		's3',
		NOW,
	)

	expect(weightOf(nextState, IDS.squat)).toBe(90)
	expect(nextState.lifts[0]!.currentIncrement).toEqual({
		kind: 'absolute',
		deltaKg: 2.5,
	})
})

test('Starting Strength’s press has its own published cut, and the squat’s does not follow it', () => {
	const startingStrength = startingStrengthPhaseOne(IDS)
	const rule = startingStrength.liftRules.find(
		(r) => r.exerciseId === IDS.overheadPress,
	)!
	const state: ProgramInstanceState = {
		programId: startingStrength.id,
		variantId: startingStrength.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'B' },
		lifts: [
			{
				...liftState(IDS.overheadPress, 50, { stallCount: 2 }),
				currentIncrement: rule.increment,
			},
		],
	}

	const { nextState } = applySession(
		state,
		startingStrength,
		sets(IDS.overheadPress, 50, [5, 5, 2]),
		's3',
		NOW,
	)

	// 8 %, the low end of the published 8–10 % range, and stated as such.
	expect(weightOf(nextState, IDS.overheadPress)).toBe(46)
})

// ——— The other two Stall Responses ————————————————————————————————————————

/** A one-lift program whose remedy is a Weight Rollback (Madcow's shape). */
function rollbackProgram(): ProgramDefinition {
	return {
		id: 'prog_rollback_test',
		key: 'rollback-test',
		variantId: 'v1',
		name: 'Rollback test',
		cursorKind: 'alternatingDays',
		initialCursor: { kind: 'alternatingDays', nextDayId: 'A' },
		dayIds: ['A'],
		liftRules: [
			{
				exerciseId: IDS.squat,
				equipment: null,
				dayIds: ['A'],
				setCount: 1,
				repsPerSet: 5,
				setWeightSources: [{ kind: 'workingWeight' }],
				trigger: { kind: 'perWeek' },
				successPredicate: { kind: 'allRepsOnTopSet' },
				increment: { kind: 'pctOfLastTopSet', pct: 2.5 },
				stallsBeforeResponse: 1,
				stallResponse: {
					kind: 'weightRollback',
					sessionsBack: MADCOW_ROLLBACK_SESSIONS_BACK,
				},
				incrementAdjustmentOnStall: { kind: 'unchanged' },
				defaultStartKg: null,
				startSeedRepMaxReps: null,
			},
		],
		provenanceNote: null,
	}
}

test('a Weight Rollback returns to a weight this lift actually used, read from its own history', () => {
	const program = rollbackProgram()
	const state: ProgramInstanceState = {
		programId: program.id,
		variantId: program.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [
			liftState(IDS.squat, 120, {
				currentIncrement: { kind: 'pctOfLastTopSet', pct: 2.5 },
				weightHistory: [
					{ sessionId: 'w1', weightKg: 105, succeeded: true },
					{ sessionId: 'w2', weightKg: 110, succeeded: true },
					{ sessionId: 'w3', weightKg: 115, succeeded: true },
					{ sessionId: 'w4', weightKg: 120, succeeded: true },
				],
			}),
		],
	}

	const { nextState, outcomes } = applySession(
		state,
		program,
		sets(IDS.squat, 120, [3]),
		'w5',
		NOW,
	)

	// Four sessions back is a weight on the list, not a percentage of anything.
	expect(weightOf(nextState, IDS.squat)).toBe(105)
	expect(outcomeFor(outcomes, IDS.squat)).toMatchObject({
		kind: 'stalled',
		response: 'weightRollback',
		moved: 'workingWeight',
	})
})

test('a Weight Rollback with no history to read says so, and changes nothing', () => {
	const program = rollbackProgram()
	const state: ProgramInstanceState = {
		programId: program.id,
		variantId: program.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [
			liftState(IDS.squat, 120, {
				currentIncrement: { kind: 'pctOfLastTopSet', pct: 2.5 },
			}),
		],
	}

	const { nextState, outcomes } = applySession(
		state,
		program,
		sets(IDS.squat, 120, [3]),
		'w1',
		NOW,
	)

	expect(weightOf(nextState, IDS.squat)).toBe(120)
	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome).toMatchObject({
		kind: 'stallResponseUnavailable',
		response: 'weightRollback',
		// The count is kept rather than reset: the condition that fired it is
		// still true, so the response is due again next session.
		stallCount: 1,
	})
	expect(nextState.lifts[0]!.stallHistory).toEqual([])
})

/** A one-lift program whose remedy is an Anchor Re-estimate (5/3/1's shape). */
function reEstimateProgram(): ProgramDefinition {
	return {
		id: 'prog_reestimate_test',
		key: 'reestimate-test',
		variantId: 'v1',
		name: 'Re-estimate test',
		cursorKind: 'alternatingDays',
		initialCursor: { kind: 'alternatingDays', nextDayId: 'A' },
		dayIds: ['A'],
		liftRules: [
			{
				exerciseId: IDS.squat,
				equipment: null,
				dayIds: ['A'],
				setCount: 1,
				repsPerSet: 1,
				setWeightSources: [{ kind: 'pctOfTrainingMax', pct: 95 }],
				trigger: { kind: 'perCycle', weeksPerCycle: 3 },
				successPredicate: { kind: 'minRepsOnAmrapSet', minReps: 3 },
				increment: { kind: 'absolute', deltaKg: 5 },
				stallsBeforeResponse: 1,
				stallResponse: {
					kind: 'anchorReEstimate',
					estimator: 'epley',
					trainingMaxPct: 90,
				},
				incrementAdjustmentOnStall: { kind: 'unchanged' },
				defaultStartKg: null,
				startSeedRepMaxReps: null,
			},
		],
		provenanceNote: null,
	}
}

test('an Anchor Re-estimate resets the training max through the injected estimator, and moves the training max rather than the working weight', () => {
	const program = reEstimateProgram()
	const state: ProgramInstanceState = {
		programId: program.id,
		variantId: program.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [
			liftState(IDS.squat, 152, {
				trainingMaxKg: 160,
				workingFraction: 0.9,
				currentIncrement: { kind: 'absolute', deltaKg: 5 },
			}),
		],
	}
	// The estimator is injected, so the engine imports no formula and this test
	// needs no fake module: 150 kg × 2 reps → a stated 160 kg.
	const reEstimateAnchor = vi.fn<AnchorReEstimator>(() => ({
		kind: 'estimate',
		oneRmKg: 160,
	}))

	const { nextState, outcomes } = applySession(
		state,
		program,
		sets(IDS.squat, 150, [2]),
		'c1',
		NOW,
		{ reEstimateAnchor },
	)

	expect(reEstimateAnchor).toHaveBeenCalledWith({
		exerciseId: IDS.squat,
		equipment: null,
		estimator: 'epley',
		weightKg: 150,
		reps: 2,
	})
	expect(nextState.lifts[0]!.trainingMaxKg).toBe(144)
	// The working weight is derived from the training max, so the response does
	// not touch it — and the outcome says which number moved.
	expect(weightOf(nextState, IDS.squat)).toBe(152)
	expect(outcomeFor(outcomes, IDS.squat)).toMatchObject({
		kind: 'stalled',
		response: 'anchorReEstimate',
		moved: 'trainingMax',
		fromKg: 160,
		toKg: 144,
	})
})

test('an Anchor Re-estimate with no estimator available says so and invents no training max', () => {
	const program = reEstimateProgram()
	const state: ProgramInstanceState = {
		programId: program.id,
		variantId: program.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [liftState(IDS.squat, 152, { trainingMaxKg: 160 })],
	}

	const { nextState, outcomes } = applySession(
		state,
		program,
		sets(IDS.squat, 150, [2]),
		'c1',
		NOW,
	)

	expect(nextState.lifts[0]!.trainingMaxKg).toBe(160)
	expect(outcomeFor(outcomes, IDS.squat).kind).toBe('stallResponseUnavailable')
})

test('an estimator that refuses is a refusal, not a zero — the refusal’s own words are carried through', () => {
	const program = reEstimateProgram()
	const state: ProgramInstanceState = {
		programId: program.id,
		variantId: program.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [liftState(IDS.squat, 152, { trainingMaxKg: 160 })],
	}

	const { nextState, outcomes } = applySession(
		state,
		program,
		sets(IDS.squat, 150, [2]),
		'c1',
		NOW,
		{
			reEstimateAnchor: () => ({
				kind: 'refusal',
				reason: 'reps-out-of-range',
			}),
		},
	)

	expect(nextState.lifts[0]!.trainingMaxKg).toBe(160)
	expect(outcomeFor(outcomes, IDS.squat).reason).toMatch(/reps-out-of-range/)
})

// ——— The purity contract ——————————————————————————————————————————————————

test('the engine mutates nothing it is given', () => {
	const state = instance([liftState(IDS.squat, 100)])
	const before = JSON.stringify(state)

	applySession(
		state,
		strongLifts,
		sets(IDS.squat, 100, FIVE_BY_FIVE),
		's1',
		NOW,
	)

	expect(JSON.stringify(state)).toBe(before)
})

test('the same logged session gives the same answer at any moment, because the calendar contributes nothing', () => {
	const state = instance([liftState(IDS.squat, 100, { stallCount: 2 })])
	const logged = sets(IDS.squat, 100, [5, 5, 5, 5, 4])

	const monday = applySession(state, strongLifts, logged, 's3', NOW, {
		performedDayId: 'A',
	})
	const threeMonthsLater = applySession(
		state,
		strongLifts,
		logged,
		's3',
		'2026-11-14T06:00:00.000Z',
		{ performedDayId: 'A' },
	)

	// A program paused for three months resumes exactly where it stopped: no
	// source in this family publishes a detraining rule, so none is invented.
	expect(threeMonthsLater.nextState.lifts).toEqual(monday.nextState.lifts)
	// `now` is an argument, and the only thing it does is stamp the outcome.
	expect(threeMonthsLater.outcomes[0]!.appliedAtISO).toBe(
		'2026-11-14T06:00:00.000Z',
	)
})

// ——— nextSession ——————————————————————————————————————————————————————————

test('the next session is the day the cursor names, at the weights the state holds', () => {
	const state = instance(
		[
			liftState(IDS.squat, 100),
			liftState(IDS.overheadPress, 45),
			liftState(IDS.deadlift, 140),
		],
		'B',
	)

	const plan = nextSession(state, strongLifts, NOW)

	expect(plan.dayId).toBe('B')
	expect(plan.lifts.map((l) => l.exerciseId)).toEqual([
		IDS.squat,
		IDS.overheadPress,
		IDS.deadlift,
	])
	expect(plan.lifts[0]!.sets).toHaveLength(5)
	expect(plan.lifts[0]!.sets[0]!.weight).toMatchObject({
		kind: 'resolved',
		kg: 100,
	})
	// The deadlift's one set, again from its own rule and not the program's.
	expect(plan.lifts[2]!.sets).toHaveLength(1)
})

test('a set priced off a training max nobody has says so rather than showing a kilo', () => {
	const program = reEstimateProgram()
	const state: ProgramInstanceState = {
		programId: program.id,
		variantId: program.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [liftState(IDS.squat, 100, { trainingMaxKg: null })],
	}

	const plan = nextSession(state, program, NOW)

	expect(plan.lifts[0]!.sets[0]!.weight).toMatchObject({
		kind: 'unavailable',
		reason: 'no-training-max',
	})
})

test('a training max on file prices the set as a percentage of it, and names the basis', () => {
	const program = reEstimateProgram()
	const state: ProgramInstanceState = {
		programId: program.id,
		variantId: program.variantId,
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [liftState(IDS.squat, 100, { trainingMaxKg: 160 })],
	}

	const plan = nextSession(state, program, NOW)

	expect(plan.lifts[0]!.sets[0]!.weight).toMatchObject({
		kind: 'resolved',
		kg: 152,
		basis: '95 % of a 160 kg training max',
	})
})
