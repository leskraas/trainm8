import { expect, test, vi } from 'vitest'
import {
	type AnchorReEstimator,
	type LiftOutcome,
	type LoadableRounder,
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
	// At the weight the second session produced — a miss is a miss only at the
	// weight that was actually prescribed.
	const third = applySession(
		state,
		strongLifts,
		sets(IDS.squat, 102.5, [5, 5, 5, 5, 4]),
		's3',
		NOW,
		{ performedDayId: 'A' },
	)

	expect(outcomeFor(third.outcomes, IDS.squat)).toMatchObject({
		kind: 'repeated',
		stallCount: 1,
	})
	expect(weightOf(third.nextState, IDS.squat)).toBe(102.5)
})

// ——— The load axis, and the sentence that quotes it ——————————————————————

test('a session logged lighter than prescribed is not credited as the prescribed weight', () => {
	// The browser repro: the grid prescribed 62.5 kg, the athlete stripped the bar
	// to 20 kg and logged 5×5. Every rep of every set — of a session that was not
	// the one the program asked for.
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 62.5, { stallCount: 1 })]),
		strongLifts,
		sets(IDS.squat, 20, FIVE_BY_FIVE),
		'session-1',
		NOW,
	)

	// The weight does not move, and it does not move *down* either.
	expect(weightOf(nextState, IDS.squat)).toBe(62.5)
	expect(outcomeFor(outcomes, IDS.squat)).toMatchObject({
		kind: 'liftedLighter',
		prescribedKg: 62.5,
		loggedKg: 20,
		// Neither credited nor counted against: the Stall Count stands exactly
		// where it stood, because nothing was attempted at 62.5 kg.
		stallCount: 1,
	})
	// And nothing is written to the weight history claiming a 62.5 kg session.
	expect(nextState.lifts[0]!.weightHistory).toEqual([])
})

test('the outcome sentence quotes the weight that was lifted, never one that was not', () => {
	const lighter = applySession(
		instance([liftState(IDS.squat, 62.5)]),
		strongLifts,
		sets(IDS.squat, 20, FIVE_BY_FIVE),
		'session-1',
		NOW,
	)
	const sentence = outcomeFor(lighter.outcomes, IDS.squat).reason
	// Both numbers are named, and the claim the app used to make — "every rep of
	// every set at 62.5 kg" — is nowhere in it.
	expect(sentence).toContain('20 kg')
	expect(sentence).toContain('62.5 kg')
	expect(sentence).not.toMatch(/every set at 62\.5 kg/)

	// And on a real success the quoted weight is the logged one, not the stored
	// prescription.
	const made = applySession(
		instance([liftState(IDS.squat, 100)]),
		strongLifts,
		sets(IDS.squat, 100, FIVE_BY_FIVE),
		'session-2',
		NOW,
	)
	expect(outcomeFor(made.outcomes, IDS.squat).reason).toContain(
		'Every rep of every set at 100 kg',
	)
})

test('a heavier session than the one prescribed increments from the weight that was lifted', () => {
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 100)]),
		strongLifts,
		sets(IDS.squat, 105, FIVE_BY_FIVE),
		'session-1',
		NOW,
	)

	// Not under-credited back to 102.5: the athlete made 105 kg, so the jump is
	// taken from there — and the sentence says the prescription was beaten.
	expect(weightOf(nextState, IDS.squat)).toBe(107.5)
	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome).toMatchObject({
		kind: 'incremented',
		fromKg: 105,
		toKg: 107.5,
	})
	expect(outcome.reason).toContain('Every rep of every set at 105 kg')
	expect(outcome.reason).toContain('5 kg over the 100 kg prescribed')
})

/** Five working sets with no honest kilo on any of them — a machine stack
 * level, a band, an unloaded hold (ADR 0056 §3). */
const stackLevelSets = FIVE_BY_FIVE.map((reps, index) => ({
	exerciseId: IDS.squat,
	equipment: null,
	orderIndex: index,
	role: 'working' as const,
	outcome: 'completed' as const,
	reps,
	weightKg: null,
}))

test('a kilo-priced lift logged with no honest kilo is unverifiable, and nothing moves', () => {
	// FAIL A, end to end at this seam: 90 kg prescribed, 5×5 logged at stack level
	// 3, and the app answered "90 kg → 92.5 kg (5×5 completed)" — appending
	// `{weightKg: 90, succeeded: true}` to a history no set log can re-derive, for
	// a weight that appears nowhere in the log.
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 90, { stallCount: 1 })]),
		strongLifts,
		stackLevelSets,
		'session-1',
		NOW,
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 90,
		weightKg: 90,
	})
	// Neither a success nor a miss, and said as exactly that.
	expect(outcome.reason).toContain('no kilos')
	expect(outcome.reason).toContain('neither a success nor a miss')
	expect(outcome.reason).not.toContain('92.5')

	// **Nothing moved**, and above all not the weight history.
	const squat = nextState.lifts[0]!
	expect(squat.currentWorkingWeightKg).toBe(90)
	expect(squat.stallCount).toBe(1)
	expect(squat.weightHistory).toEqual([])
	expect(squat.stallHistory).toEqual([])
})

test('a program lift logged on a machine stack cannot progress yet, and the fold says so rather than inventing a kilo', () => {
	// **This test replaces a falsely-green one**, and the replacement is the point.
	//
	// The deleted test asserted that a stack-level lift "still progresses against
	// itself" — level 6 → 7 — and it passed only because it injected
	// `stampedPrescription: () => [null, null, null, null, null]`, which **no
	// production code can produce**. `ProgramLiftState.currentWorkingWeightKg` is a
	// non-null kilo, and `readStampedPrescription` collapses an all-null stamp to
	// "no stamp" and falls back to resolving from that state — so every prescription
	// a program lift can present is a kilo. The test certified a path that does not
	// exist, which is worse than having no test at all.
	//
	// What production actually does, with no injected reader and therefore the real
	// fallback, is this: the lift is priced in kilos, the log has none, and the fold
	// is `unverifiable` forever. Level 6 → 7 is real progress under ADR 0056 §3 and
	// the app cannot record it. That is a **stated gap**, not a behaviour, and the
	// sentence the athlete reads says so in as many words.
	const { nextState, outcomes } = applySession(
		instance([
			liftState(IDS.squat, 6, {
				currentIncrement: { kind: 'absolute', deltaKg: 1 },
			}),
		]),
		strongLifts,
		stackLevelSets,
		'session-1',
		NOW,
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome.kind).toBe('unverifiable')
	// Nothing moved — no invented level, and no invented kilo either.
	expect(weightOf(nextState, IDS.squat)).toBe(6)
	expect(nextState.lifts[0]!.weightHistory).toEqual([])
	// And the gap is named, so the athlete is not left to conclude their training
	// was judged and found wanting.
	expect(outcome.reason).toContain('cannot progress inside a program yet')
	expect(outcome.reason).toContain('That is a gap in the app')
})

test('a session is graded against the weight it was stamped with, not the weight the state moved to', () => {
	// FAIL B: the grid was stamped at 60 kg, one set was logged at 60, the working
	// weight was changed to 90 on the overview, and the remaining sets were logged
	// at the 60 kg the grid asked for. The engine graded against live state and
	// answered "logged at 60 kg, not the 90 kg 5×5 it prescribed" — about a
	// prescription that was never on screen.
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 90)]),
		strongLifts,
		sets(IDS.squat, 60, FIVE_BY_FIVE),
		'session-1',
		NOW,
		{ stampedPrescription: () => [60, 60, 60, 60, 60] },
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	// The session matched the screen, so it is credited — and from 60 kg, which is
	// the weight it was actually run at.
	expect(outcome).toMatchObject({
		kind: 'incremented',
		fromKg: 60,
		toKg: 62.5,
	})
	expect(outcome.reason).toContain('Every rep of every set at 60 kg')
	// The change is not lost silently either: the sentence says which number the
	// session was run at and which one the working weight had been moved to.
	expect(outcome.reason).toContain('stamped at 60 kg')
	expect(outcome.reason).toContain('90 kg')
	// And the history records 60 kg — the weight the athlete actually lifted.
	expect(nextState.lifts[0]!.weightHistory).toEqual([
		{ sessionId: 'session-1', weightKg: 60, succeeded: true },
	])
})

test('every outcome reads where the lift stands off the lift state, never off the stamp it was graded against', () => {
	// The athlete saved **77.5 kg** by hand after the session was stamped at 60 kg.
	// Grading from the 60 kg stamp is correct. Saying the lift "stays at 60 kg" is
	// not: the fold leaves the state alone, so the lift stands at 77.5. Both the
	// reported members are here, plus the two others that move nothing.
	const stampedAt60 = { stampedPrescription: () => [60, 60, 60, 60, 60] }
	const state = () => instance([liftState(IDS.squat, 77.5, { stallCount: 0 })])

	// `repeated` on a miss — the browser's "Stall Count 1: Back Squat stays at
	// 60 kg" about a lift standing at 77.5.
	const missed = applySession(
		state(),
		strongLifts,
		sets(IDS.squat, 60, [5, 5, 5, 5, 4]),
		'session-1',
		NOW,
		stampedAt60,
	)
	expect(outcomeFor(missed.outcomes, IDS.squat)).toMatchObject({
		kind: 'repeated',
		// Where it stands: the athlete's own number, untouched.
		standsAtKg: 77.5,
		// What this session was run at, which is what repeats and what the history
		// records. A different question, and a different field.
		weightKg: 60,
	})
	expect(weightOf(missed.nextState, IDS.squat)).toBe(77.5)

	// `liftedLighter` — the browser's "Back Squat stays at 120 kg — logged at
	// 100 kg" about a lift standing at 60.
	const lighter = applySession(
		state(),
		strongLifts,
		sets(IDS.squat, 40, FIVE_BY_FIVE),
		'session-1',
		NOW,
		stampedAt60,
	)
	expect(outcomeFor(lighter.outcomes, IDS.squat)).toMatchObject({
		kind: 'liftedLighter',
		standsAtKg: 77.5,
		prescribedKg: 60,
		loggedKg: 40,
	})

	// `unverifiable` was always right, and stays right.
	const unreadable = applySession(
		state(),
		strongLifts,
		stackLevelSets,
		'session-1',
		NOW,
		stampedAt60,
	)
	expect(outcomeFor(unreadable.outcomes, IDS.squat)).toMatchObject({
		kind: 'unverifiable',
		standsAtKg: 77.5,
	})

	// `skipped` likewise.
	const skipped = applySession(
		state(),
		strongLifts,
		[],
		'session-1',
		NOW,
		stampedAt60,
	)
	expect(outcomeFor(skipped.outcomes, IDS.squat)).toMatchObject({
		kind: 'skipped',
		standsAtKg: 77.5,
	})

	// And the two that do move say where they moved to, read from the state they
	// just wrote.
	const made = applySession(
		state(),
		strongLifts,
		sets(IDS.squat, 60, FIVE_BY_FIVE),
		'session-1',
		NOW,
		stampedAt60,
	)
	expect(outcomeFor(made.outcomes, IDS.squat)).toMatchObject({
		kind: 'incremented',
		standsAtKg: 62.5,
	})
	expect(weightOf(made.nextState, IDS.squat)).toBe(62.5)
})

test('a fold that writes over a weight the athlete saved by hand says which number it replaced', () => {
	// The session was stamped at 60 kg and the athlete then saved 120 kg on the
	// overview. Grading from the stamp is correct and the fold moves 60 → 62.5 —
	// which silently discards the 120 they typed. Grading from the stamp is not
	// negotiable; discarding their input without a word is.
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 120)]),
		strongLifts,
		sets(IDS.squat, 60, FIVE_BY_FIVE),
		'session-1',
		NOW,
		{ stampedPrescription: () => [60, 60, 60, 60, 60] },
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(weightOf(nextState, IDS.squat)).toBe(62.5)
	expect(outcome.reason).toContain('stamped at 60 kg')
	expect(outcome.reason).toContain('120 kg you saved')
	// The discard, said out loud, with the way back.
	expect(outcome.reason).toContain('is replaced by 62.5 kg')
	expect(outcome.reason).toContain('save it again')
})

test('a fold that moves nothing says the weight the athlete saved by hand is the one that stands', () => {
	const { outcomes } = applySession(
		instance([liftState(IDS.squat, 120)]),
		strongLifts,
		sets(IDS.squat, 60, [5, 5, 5, 5, 4]),
		'session-1',
		NOW,
		{ stampedPrescription: () => [60, 60, 60, 60, 60] },
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome.reason).toContain(
		'stamped at 60 kg and is graded against that',
	)
	expect(outcome.reason).toContain('still stands at the 120 kg you saved')
})

test('a program that responds to a single miss is never told it missed 1 sessions in a row', () => {
	const stallsOnFirstMiss: ProgramDefinition = {
		...strongLifts,
		liftRules: strongLifts.liftRules.map((rule) =>
			rule.exerciseId === IDS.squat
				? { ...rule, stallsBeforeResponse: 1 }
				: rule,
		),
	}
	const { outcomes } = applySession(
		instance([liftState(IDS.squat, 100)], 'A', stallsOnFirstMiss),
		stallsOnFirstMiss,
		sets(IDS.squat, 100, [5, 5, 5, 5, 4]),
		'session-1',
		NOW,
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome.kind).toBe('stalled')
	expect(outcome.reason).not.toContain('1 sessions')
	expect(outcome.reason).toContain('Missed the session at 100 kg')
})

test('a barbell lift logged as a bodyweight load is unverifiable, and nothing moves', () => {
	// **The fourth disguise, at the fold.** A barbell squat prescribed 25 kg, five
	// sets logged with load kind Bodyweight, which bakes the athlete's own 74 kg
	// into `effectiveKg`. 74 ≥ 25, so the load axis passed: the app published
	// "Back Squat 74 kg → 77.5 kg", wrote `{weightKg: 74, succeeded: true}` and
	// moved the lift 25 → 77.5 — in the same paragraph as the words "not a weight
	// on the bar". The caveat reached the prose and never the decision.
	const bodyweightLogged: LoggedWorkSet[] = sets(
		IDS.squat,
		74,
		FIVE_BY_FIVE,
	).map((set) => ({ ...set, loadKind: 'bodyweight' }))

	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 25)]),
		strongLifts,
		bodyweightLogged,
		'session-1',
		NOW,
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 25,
		standsAtKg: 25,
		unreadableSetCount: 5,
		gradedSetCount: 5,
		loggedLoadKind: 'bodyweight',
		unreadableReason: 'bodyweightDerived',
	})
	// The sentence names the kind that was logged and what its number is.
	expect(outcome.reason).toContain('logged as a bodyweight load')
	expect(outcome.reason).toContain('not a weight on the bar')
	expect(outcome.reason).toContain('nothing moved')
	// **Nothing moves**, and above all not the one field no set log can re-derive.
	const squat = nextState.lifts.find((lift) => lift.exerciseId === IDS.squat)!
	expect(squat.currentWorkingWeightKg).toBe(25)
	expect(squat.weightHistory).toEqual([])
	expect(squat.stallCount).toBe(0)
})

test('an assisted load is not read as a weight on the bar', () => {
	// The overhead press repro: `{"kind":"assisted","assistKg":10}` and a 64 kg
	// prescription, narrated "Overhead Press 64 kg → 67.5 kg / Every rep of every
	// set at 64 kg" with no caveat at all. The assist number is sign-inverted —
	// more of it is *less* work — so it cannot be read against a bar weight in
	// either direction.
	const assisted: LoggedWorkSet[] = sets(
		IDS.overheadPress,
		64,
		FIVE_BY_FIVE,
	).map((set) => ({ ...set, loadKind: 'assisted' }))

	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.overheadPress, 64)], 'B'),
		strongLifts,
		assisted,
		'session-1',
		NOW,
	)

	const outcome = outcomeFor(outcomes, IDS.overheadPress)
	expect(outcome).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 64,
		loggedLoadKind: 'assisted',
		unreadableReason: 'assistInverted',
	})
	expect(outcome.reason).toContain('how much the machine took')
	const press = nextState.lifts.find(
		(lift) => lift.exerciseId === IDS.overheadPress,
	)!
	expect(press.currentWorkingWeightKg).toBe(64)
	expect(press.weightHistory).toEqual([])
})

test('a per-hand load is not compared to a barbell prescription', () => {
	// 32 kg in each hand is 64 kg of work and `effectiveLoadKg` doubles it, so the
	// number is real and it is not the number a barbell prescription names.
	const perSide: LoggedWorkSet[] = sets(IDS.squat, 64, FIVE_BY_FIVE).map(
		(set) => ({ ...set, loadKind: 'perSide' }),
	)

	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 60)]),
		strongLifts,
		perSide,
		'session-1',
		NOW,
	)

	expect(outcomeFor(outcomes, IDS.squat)).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 60,
		loggedLoadKind: 'perSide',
		unreadableReason: 'perHand',
	})
	expect(weightOf(nextState, IDS.squat)).toBe(60)
})

test('a Stall Cut is not taken on a load that cannot be read against the prescription', () => {
	// The check runs **before the rep count**, so the wrong answer pointing
	// downwards is refused too: two reps a set on an assisted machine is not a
	// missed 90 kg session, and a lift one miss from its Stall Cut does not take it
	// on evidence nobody can read.
	const assistedAndShort: LoggedWorkSet[] = sets(
		IDS.squat,
		64,
		[2, 2, 2, 2, 2],
	).map((set) => ({ ...set, loadKind: 'assisted' }))

	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 90, { stallCount: 2 })]),
		strongLifts,
		assistedAndShort,
		'session-1',
		NOW,
	)

	expect(outcomeFor(outcomes, IDS.squat).kind).toBe('unverifiable')
	const squat = nextState.lifts.find((lift) => lift.exerciseId === IDS.squat)!
	// The Stall Count is left exactly where it stood — not advanced to 3, which
	// would have cut the weight 10 % on the next readable session either way.
	expect(squat.stallCount).toBe(2)
	expect(squat.currentWorkingWeightKg).toBe(90)
	expect(squat.weightHistory).toEqual([])
})

test('a session with kilos on some sets and none on others carries both counts, so the headline cannot say none were logged', () => {
	// Two sets at exactly 90 kg and three as a stack level, against a 90 kg
	// prescription. `unverifiable` is right; "no kilos were logged" is not.
	const mixed: LoggedWorkSet[] = FIVE_BY_FIVE.map((reps, index) => ({
		exerciseId: IDS.squat,
		equipment: null,
		orderIndex: index,
		role: 'working' as const,
		outcome: 'completed' as const,
		reps,
		weightKg: index < 2 ? 90 : null,
	}))

	const { outcomes } = applySession(
		instance([liftState(IDS.squat, 90)]),
		strongLifts,
		mixed,
		'session-1',
		NOW,
	)

	expect(outcomeFor(outcomes, IDS.squat)).toMatchObject({
		kind: 'unverifiable',
		unreadableSetCount: 3,
		gradedSetCount: 5,
	})
})

test('the outcome sentence describes a mixed session without claiming the whole of it was light', () => {
	// Set 1 at 40 kg and sets 2–5 at 82.5 kg. The verdict was right — this is not
	// an 82.5 kg 5×5 — and the sentence was not: it read "This session was logged
	// at 40 kg", as if all of it had been.
	const mixed = FIVE_BY_FIVE.map((reps, index) => ({
		exerciseId: IDS.squat,
		equipment: null,
		orderIndex: index,
		role: 'working' as const,
		outcome: 'completed' as const,
		reps,
		weightKg: index === 0 ? 40 : 82.5,
	}))

	const { outcomes } = applySession(
		instance([liftState(IDS.squat, 82.5)]),
		strongLifts,
		mixed,
		'session-1',
		NOW,
	)

	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome).toMatchObject({ kind: 'liftedLighter', loggedKg: 40 })
	expect(outcome.reason).toContain('1 of the 5 sets')
	expect(outcome.reason).toContain('the lightest at 40 kg')
	expect(outcome.reason).toContain('The other 4 were at or above it')
	expect(outcome.reason).not.toMatch(/session was logged at 40 kg/)
})

// ——— A prescribed weight is a weight somebody can load ————————————————————

/** A rack that makes multiples of 2.5 kg and nothing finer — the injected
 * {@link LoadableRounder} seam, without a plate inventory or a query. */
const toTwoAndAHalf: LoadableRounder = ({ kg }) =>
	Math.max(0, Math.ceil(kg / 2.5 - 0.5)) * 2.5

test('a Stall Cut lands on a weight the rack can actually load, and says so', () => {
	// 10 % off 22.5 kg is 20.25 kg. No bar makes 20.25 kg, and the app used to
	// store it, prescribe it and then contradict itself about it on one screen.
	const { nextState, outcomes } = applySession(
		instance([liftState(IDS.squat, 22.5, { stallCount: 2 })]),
		strongLifts,
		sets(IDS.squat, 22.5, [5, 5, 5, 5, 3]),
		'session-1',
		NOW,
		{ roundToLoadable: toTwoAndAHalf },
	)

	expect(weightOf(nextState, IDS.squat)).toBe(20)
	// The arithmetic intent is kept beside it, so the next percentage does not
	// compound the rounding.
	expect(nextState.lifts[0]!.unroundedWorkingWeightKg).toBeCloseTo(20.25, 5)
	const outcome = outcomeFor(outcomes, IDS.squat)
	expect(outcome).toMatchObject({ kind: 'stalled', fromKg: 22.5, toKg: 20 })
	expect(outcome.reason).toContain('20 kg')
	// **What can honestly be said about loadability.** With no gym on file this
	// sentence used to claim "20.25 kg is not a weight that can be loaded" — a
	// statement about a rack nobody had described. What is true is the app's own
	// stated default step, which the reason never used to mention.
	expect(outcome.reason).toContain('No gym is on file')
	expect(outcome.reason).toContain('2.5 kg default step')
	expect(outcome.reason).not.toContain('not a weight that can be loaded')
	expect(nextState.lifts[0]!.stallHistory).toEqual([
		{ sessionId: 'session-1', fromKg: 22.5, toKg: 20, response: 'stallCut' },
	])
})

test('a percentage-priced set is prescribed at a weight the rack can make, with the exact figure kept beside it', () => {
	const state: ProgramInstanceState = {
		programId: 'p',
		variantId: 'v1',
		cursor: { kind: 'alternatingDays', nextDayId: 'A' },
		lifts: [
			liftState(IDS.squat, 76.5, { trainingMaxKg: 90, workingFraction: 0.9 }),
		],
	}
	const definition: ProgramDefinition = {
		...strongLifts,
		dayIds: ['A'],
		liftRules: [
			{
				...strongLifts.liftRules[0]!,
				exerciseId: IDS.squat,
				dayIds: ['A'],
				setCount: 1,
				setWeightSources: [{ kind: 'pctOfTrainingMax', pct: 85 }],
			},
		],
	}

	const resolved = nextSession(state, definition, NOW, {
		roundToLoadable: toTwoAndAHalf,
	}).lifts[0]!.sets[0]!.weight
	// 85 % of 90 kg is 76.5 kg, which no bar makes.
	expect(resolved).toMatchObject({ kind: 'resolved', kg: 77.5 })
	expect(
		resolved.kind === 'resolved' ? resolved.unroundedKg : null,
	).toBeCloseTo(76.5, 5)
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
		sets(IDS.squat, 152, [2]),
		'c1',
		NOW,
		{ reEstimateAnchor },
	)

	expect(reEstimateAnchor).toHaveBeenCalledWith({
		exerciseId: IDS.squat,
		equipment: null,
		estimator: 'epley',
		// The **row** the engine read, named — `null` here because these hand-built
		// sets name none. The server's estimator reads the row's own load kind, RIR
		// and date, and it may not go looking for a row by its numbers.
		setLogId: null,
		weightKg: 152,
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
		sets(IDS.squat, 152, [2]),
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
		sets(IDS.squat, 152, [2]),
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
