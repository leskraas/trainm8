import { expect, test } from 'vitest'
import { LOAD_VALUE_KINDS } from '../strength-log.ts'
import {
	type Increment,
	type LoggedWorkSet,
	KILO_LOAD_BASES,
	PROGRAM_LOAD_VALUE_KINDS,
	IncrementSchema,
	ProgramCursorSchema,
	StallResponseSchema,
	SuccessPredicateSchema,
	adjustedIncrement,
	advanceCursor,
	amrapSet,
	countsTowardProgression,
	compareLoggedLoad,
	gradeSession,
	incrementedWeightKg,
	kiloLoadBasis,
	liftIsOnDay,
	loadKindComparability,
	loadKindLabel,
	progressionSets,
	topSet,
	unreadableLoad,
} from './program-rules.ts'
import {
	NSUNS_TRAINING_MAX_TABLE_LOW_END_KG,
	STRONGLIFTS_VOLUME_LADDER,
	strongLifts5x5Basic,
} from './program.constants.ts'

function set(
	overrides: Partial<LoggedWorkSet> & { orderIndex: number },
): LoggedWorkSet {
	return {
		exerciseId: 'ex_squat',
		equipment: null,
		role: 'working',
		outcome: 'completed',
		reps: 5,
		weightKg: 100,
		...overrides,
	}
}

// ——— What the engine is allowed to read ———————————————————————————————————

test('only worked, finished, non-warm-up sets reach a progression rule', () => {
	expect(
		countsTowardProgression({ role: 'working', outcome: 'completed' }),
	).toBe(true)
	expect(
		countsTowardProgression({ role: 'warmup', outcome: 'completed' }),
	).toBe(false)
	expect(
		countsTowardProgression({ role: 'working', outcome: 'abandoned' }),
	).toBe(false)
	// A back-off set is neither the work nor a warm-up, and Madcow's 1×8 must not
	// become the top set that decides next week's weight.
	expect(
		countsTowardProgression({ role: 'backoff', outcome: 'completed' }),
	).toBe(false)
})

test('a lift reads only its own sets, and the progression key is the exercise and the equipment together', () => {
	const logged = [
		set({ orderIndex: 0 }),
		set({ orderIndex: 1, exerciseId: 'ex_bench' }),
		set({ orderIndex: 2, equipment: 'dumbbell' }),
	]

	expect(
		progressionSets(logged, { exerciseId: 'ex_squat', equipment: null }),
	).toHaveLength(1)
	// Barbell and dumbbell bench are the same movement with separate
	// progressions, so the pair is the key and not the exercise alone.
	expect(
		progressionSets(logged, { exerciseId: 'ex_squat', equipment: 'dumbbell' }),
	).toHaveLength(1)
})

test('the top set is the heaviest set and the AMRAP set is the last one, and a ramp makes them different sets', () => {
	const ramp = [
		set({ orderIndex: 0, weightKg: 80 }),
		set({ orderIndex: 1, weightKg: 100 }),
		set({ orderIndex: 2, weightKg: 90, reps: 8 }),
	]

	expect(topSet(ramp)?.weightKg).toBe(100)
	expect(amrapSet(ramp)?.reps).toBe(8)
})

test('a set with no honest kilo can never become a top set', () => {
	// A machine stack level or a band has no kilos, and inventing one to make a
	// percentage-of-top-set rule work would fabricate next week's weight.
	const logged = [set({ orderIndex: 0, weightKg: null })]
	expect(topSet(logged)).toBeNull()
})

// ——— The success predicates, on both axes ————————————————————————————————

/** Five sets at one weight, which is what a StrongLifts session prescribes. */
const AT_100 = [100, 100, 100, 100, 100]

test('an unlogged lift is a third answer, and not a failure', () => {
	expect(
		gradeSession(
			{
				setCount: 5,
				repsPerSet: 5,
				successPredicate: { kind: 'allRepsAllSets' },
			},
			[],
			AT_100,
		),
	).toEqual({ kind: 'notLogged' })
})

test('all-reps-all-sets means every prescribed set, so a short session fails on the count alone', () => {
	const rule = {
		setCount: 5,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsAllSets' },
	} as const
	const full = [0, 1, 2, 3, 4].map((orderIndex) => set({ orderIndex }))

	expect(gradeSession(rule, full, AT_100)).toEqual({
		kind: 'made',
		atKg: 100,
		loadStated: true,
		loggedLoadKind: null,
	})
	expect(gradeSession(rule, full.slice(0, 4), AT_100)).toMatchObject({
		kind: 'missedReps',
	})
})

test('a session logged lighter than prescribed is not credited as the prescribed weight', () => {
	// The browser repro, exactly: the grid prescribed 62.5 kg and every set was
	// logged at 20 kg with all five reps. The rep count is perfect and the session
	// is still not a 62.5 kg session.
	const rule = {
		setCount: 5,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsAllSets' },
	} as const
	const stripped = [0, 1, 2, 3, 4].map((orderIndex) =>
		set({ orderIndex, weightKg: 20, reps: 5 }),
	)

	expect(gradeSession(rule, stripped, [62.5, 62.5, 62.5, 62.5, 62.5])).toEqual({
		kind: 'liftedLighter',
		loggedKg: 20,
		prescribedKg: 62.5,
		lighterSetCount: 5,
		gradedSetCount: 5,
		loggedLoadKind: null,
	})
})

test('one back-off set inside an all-sets session means the session was not that weight', () => {
	const rule = {
		setCount: 5,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsAllSets' },
	} as const
	const sets = [0, 1, 2, 3, 4].map((orderIndex) =>
		set({ orderIndex, weightKg: orderIndex === 4 ? 90 : 100 }),
	)

	expect(gradeSession(rule, sets, AT_100)).toEqual({
		kind: 'liftedLighter',
		loggedKg: 90,
		prescribedKg: 100,
		// One of the five, and the verdict says which — the sentence built on it
		// used to read as if the whole session had been at 90 kg.
		lighterSetCount: 1,
		gradedSetCount: 5,
		loggedLoadKind: null,
	})
})

test('a heavier session than the one prescribed is a success, graded at the weight that was lifted', () => {
	const rule = {
		setCount: 5,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsAllSets' },
	} as const
	const heavier = [0, 1, 2, 3, 4].map((orderIndex) =>
		set({ orderIndex, weightKg: 105 }),
	)

	expect(gradeSession(rule, heavier, AT_100)).toEqual({
		kind: 'made',
		atKg: 105,
		loadStated: true,
		loggedLoadKind: null,
	})
})

test('a load within half a kilo of the prescription is the same weight, and a whole increment under it is not', () => {
	// The tolerance has to be wide enough that two racks rounding one percentage
	// agree, and narrow enough that it can never swallow this family's smallest
	// published jump.
	expect(compareLoggedLoad(100, 100.4)).toBe('at-or-above')
	expect(compareLoggedLoad(100, 100.6)).toBe('lighter')
	expect(compareLoggedLoad(101.25, 100)).toBe('at-or-above')
	// Neither side is evidence about the other where one of them has no kilo.
	expect(compareLoggedLoad(null, 100)).toBe('not-comparable')
	expect(compareLoggedLoad(100, null)).toBe('not-comparable')
})

test('a lift with no honest kilo is graded on its reps and says the load could not be read', () => {
	// A machine stack level is an ordinal (ADR 0056 §3): there is no kilo to
	// compare, so the load axis is stated as absent rather than forced.
	const rule = {
		setCount: 3,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsAllSets' },
	} as const
	const stack = [0, 1, 2].map((orderIndex) =>
		set({ orderIndex, weightKg: null }),
	)

	expect(gradeSession(rule, stack, [null, null, null])).toEqual({
		kind: 'made',
		atKg: null,
		loadStated: false,
		loggedLoadKind: null,
	})
})

test('a kilo-priced lift logged with no honest kilo is unverifiable, and nothing moves', () => {
	// The browser repro of FAIL A: the grid prescribed 90 kg, the athlete switched
	// *How this is loaded* to Machine level and logged 5×5 at level 3. Every row
	// said "no kilos recorded" and the fold answered "90 kg → 92.5 kg".
	//
	// `compareLoggedLoad` refuses to call an ordinal lighter — rightly — so the
	// lighter check cannot fire, and the load axis used to fall through into a
	// `made`. It is not absent from the claim here; it is **unreadable**.
	const rule = {
		setCount: 5,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsAllSets' },
	} as const
	const stackLevels = [0, 1, 2, 3, 4].map((orderIndex) =>
		set({ orderIndex, weightKg: null, reps: 5 }),
	)

	expect(gradeSession(rule, stackLevels, [90, 90, 90, 90, 90])).toEqual({
		kind: 'unverifiable',
		prescribedKg: 90,
		unreadableSetCount: 5,
		gradedSetCount: 5,
		// No kind was stated by the caller here, so the reason is the plain absence.
		loggedLoadKind: null,
		reason: 'noKiloLogged',
	})
})

// ——— A kilo that measures something other than the bar ————————————————————

/** Five sets of five, logged under one `LoadValue` kind at one baked kilo — the
 * shape `toLoggedWorkSets` hands the engine. */
function fiveSetsLoggedAs(kind: string, weightKg: number | null) {
	return [0, 1, 2, 3, 4].map((orderIndex) =>
		set({ orderIndex, weightKg, reps: 5, loadKind: kind }),
	)
}

const FIVE_BY_FIVE_RULE = {
	setCount: 5,
	repsPerSet: 5,
	successPredicate: { kind: 'allRepsAllSets' },
} as const

test('a barbell lift logged as a bodyweight load is unverifiable, and nothing moves', () => {
	// The browser repro, fourth round: a barbell squat prescribed **25 kg**, five
	// sets logged with load kind Bodyweight, which bakes the athlete's own 74 kg
	// into `effectiveKg`. 74 ≥ 25, so the load axis passed and the app published
	// "Back Squat 74 kg → 77.5 kg" — while the very same paragraph said the 74 kg
	// was "not a weight on the bar". The caveat was prose; the verdict is now the
	// same value the sentence reads.
	const verdict = gradeSession(
		FIVE_BY_FIVE_RULE,
		fiveSetsLoggedAs('bodyweight', 74),
		[25, 25, 25, 25, 25],
	)

	expect(verdict).toEqual({
		kind: 'unverifiable',
		prescribedKg: 25,
		unreadableSetCount: 5,
		gradedSetCount: 5,
		loggedLoadKind: 'bodyweight',
		reason: 'bodyweightDerived',
	})
})

test('an assisted load is not read as a weight on the bar', () => {
	// The overhead press repro: `{"kind":"assisted","assistKg":10}` against a
	// 64 kg prescription, narrated as "Every rep of every set at 64 kg" with no
	// caveat at all. The assist number is **sign-inverted** (ADR 0056 §3): more of
	// it is less work, so comparing it to a bar weight gets the direction of
	// progress wrong, not just the magnitude.
	const verdict = gradeSession(
		FIVE_BY_FIVE_RULE,
		fiveSetsLoggedAs('assisted', 64),
		[64, 64, 64, 64, 64],
	)

	expect(verdict).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 64,
		loggedLoadKind: 'assisted',
		reason: 'assistInverted',
	})
})

test('a per-hand load is not compared to a barbell prescription', () => {
	// A 32 kg dumbbell in each hand is 64 kg of work, and `effectiveLoadKg`
	// doubles it — so the number is real, and it is not the number a barbell
	// prescription names. Both directions are wrong: read as a bar weight it is
	// double, and the athlete's own "32 kg" is half.
	const verdict = gradeSession(
		FIVE_BY_FIVE_RULE,
		fiveSetsLoggedAs('perSide', 64),
		[60, 60, 60, 60, 60],
	)

	expect(verdict).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 60,
		loggedLoadKind: 'perSide',
		reason: 'perHand',
	})
})

test('an incomparable load is not called lighter and is not counted as a miss either', () => {
	// Both of the two wrong answers, refused in one place. A bodyweight kilo that
	// comes in *under* the prescription is not a light session — an absence of
	// evidence is not evidence of a lighter bar — and a rep count short of the
	// prescription is not a miss, because a Stall Cut taken off a number that
	// measures something else is the same fabrication pointing downwards.
	expect(
		gradeSession(
			FIVE_BY_FIVE_RULE,
			fiveSetsLoggedAs('bodyweight', 74),
			[120, 120, 120, 120, 120],
		),
	).toMatchObject({ kind: 'unverifiable', reason: 'bodyweightDerived' })
	const missedReps = fiveSetsLoggedAs('assisted', 64).map((logged) => ({
		...logged,
		reps: 2,
	}))
	expect(
		gradeSession(FIVE_BY_FIVE_RULE, missedReps, [64, 64, 64, 64, 64]),
	).toMatchObject({ kind: 'unverifiable', reason: 'assistInverted' })
})

test('a top-set family logged entirely on an incomparable load is unverifiable rather than a missed top set', () => {
	// `topSet` refuses an incomparable set, so there is no top set at all — and
	// that used to fall through to `missedReps`, which is a stall counted off
	// evidence nobody can read. Madcow's `+2.5 % of your top set` would otherwise
	// price next week off the athlete's bodyweight.
	const madcow = {
		setCount: 5,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsOnTopSet' },
	} as const

	expect(
		gradeSession(
			madcow,
			fiveSetsLoggedAs('bodyweight', 74),
			[60, 70, 80, 90, 100],
		),
	).toMatchObject({
		kind: 'unverifiable',
		prescribedKg: 100,
		loggedLoadKind: 'bodyweight',
		reason: 'bodyweightDerived',
	})
})

test('a prescription and a log of the same kind still grade normally', () => {
	// The rule is comparability, not suspicion. A weight on the bar against a
	// kilo-priced prescription grades exactly as it always did…
	expect(
		gradeSession(
			FIVE_BY_FIVE_RULE,
			fiveSetsLoggedAs('external', 90),
			[90, 90, 90, 90, 90],
		),
	).toEqual({
		kind: 'made',
		atKg: 90,
		loadStated: true,
		loggedLoadKind: 'external',
	})
	// …and where the *prescription* has no kilo either, a bodyweight lift
	// progresses against itself on its reps: ADR 0056 §3 and ADR 0008's
	// Unavailable Metric. Nothing here is a barbell claim, so nothing is refused.
	expect(
		gradeSession(FIVE_BY_FIVE_RULE, fiveSetsLoggedAs('bodyweight', 74), [
			null,
			null,
			null,
			null,
			null,
		]),
	).toEqual({
		kind: 'made',
		atKg: 74,
		loadStated: true,
		loggedLoadKind: 'bodyweight',
	})
	// And a stack level against an unpriced prescription, which is the same rule
	// with no number on either side.
	expect(
		gradeSession(FIVE_BY_FIVE_RULE, fiveSetsLoggedAs('stackLevel', null), [
			null,
			null,
			null,
			null,
			null,
		]),
	).toEqual({
		kind: 'made',
		atKg: null,
		loadStated: false,
		loggedLoadKind: 'stackLevel',
	})
})

test('every LoadValue member is classified explicitly, so a new one cannot default to comparable', () => {
	// **The exhaustiveness bar, asserted three ways**, because defaulting into
	// "comparable" is how this bug survived four rounds of fixes.
	//
	// 1. The union this module restates is the union `strength-log.ts` stores. A
	//    ninth `LoadValue` member fails *here*, in a test whose name says what to
	//    do about it, rather than silently becoming a weight on the bar.
	expect([...PROGRAM_LOAD_VALUE_KINDS]).toEqual([...LOAD_VALUE_KINDS])
	// 2. Every member has a decision and a label. (`loadKindComparability`'s own
	//    switch has no default branch — its `never` assignment is a *compile*
	//    error when the tuple grows, and `LOAD_KIND_LABELS` is a `Record` over the
	//    union for the same reason. This is the runtime half of the same bar.)
	const decisions = Object.fromEntries(
		LOAD_VALUE_KINDS.map((kind) => {
			const comparability = loadKindComparability(kind)
			expect(loadKindLabel(kind)).toBeTruthy()
			return [
				kind,
				comparability.kind === 'incomparable'
					? comparability.reason
					: comparability.kind,
			]
		}),
	)
	// 3. The table itself — ADR 0056 §3 is the authority on what each number
	//    means, and exactly one of the eight is a weight on a bar.
	expect(decisions).toEqual({
		external: 'comparable',
		perSide: 'perHand',
		bodyweight: 'bodyweightDerived',
		bodyweightPlus: 'bodyweightDerived',
		assisted: 'assistInverted',
		stackLevel: 'notAWeight',
		band: 'notAWeight',
		unloaded: 'notAWeight',
	})
	expect(
		LOAD_VALUE_KINDS.filter(
			(kind) => loadKindComparability(kind).kind === 'comparable',
		),
	).toEqual(['external'])
	// A kind this module has never heard of **fails closed**: an unrecognised
	// number is not evidence about a bar. This is what a ninth member does before
	// anybody has classified it, and it is the safe answer rather than the
	// crediting one.
	expect(loadKindComparability('somethingNew')).toEqual({
		kind: 'incomparable',
		reason: 'notAWeight',
	})
	// And an *unstated* kind is neither: the caller does not know, so this module
	// refuses nothing and the kilo is read as it always was.
	expect(loadKindComparability(null)).toEqual({ kind: 'unstated' })
})

test('an unparseable row costs a qualifying clause and not a fold, so an unstated load kind is still graded', () => {
	// **The Gap-3 decision, pinned with its reason so it is not "fixed" into a
	// refusal.** `unstated` is *the caller did not say what kind this was* — a fact
	// about the row, not about the bar — and it stays **readable** here.
	//
	// Why open: an `unstated` kind is unreachable from a parsed `LoadValue` (the
	// union has no unlabelled member), so it only ever describes a hand-written,
	// imported or pre-`LoadValue` row — one the athlete cannot go back and fix.
	// Failing closed would make such a row permanently `unverifiable`: a program
	// that quietly stops progressing, which is this module's own failure mode
	// pointing the other way. The cost is a qualifying clause in the sentence, and
	// `program-engine.ts` prints it.
	expect(unreadableLoad({ weightKg: 100, loadKind: 'external' })).toBeNull()
	expect(unreadableLoad({ weightKg: 100 })).toBeNull()
	// So the same session grades the same way whether the kind was recorded or not,
	// and a row nobody can classify is not a session nobody can grade.
	const rule = {
		setCount: 1,
		repsPerSet: 5,
		successPredicate: { kind: 'allRepsAllSets' } as const,
	}
	expect(gradeSession(rule, [set({ orderIndex: 0 })], [100])).toEqual({
		kind: 'made',
		atKg: 100,
		loadStated: true,
		loggedLoadKind: null,
	})
	// The absence still costs something: with no kilo at all there is nothing to
	// read, and *that* is a refusal — `unstated` buys the kilo the benefit of the
	// doubt, never the missing kilo.
	expect(unreadableLoad({ weightKg: null })).toEqual({
		loggedLoadKind: null,
		reason: 'noKiloLogged',
	})
	// And the choice is the *same at every point that asks*, because the two points
	// ask different questions. A **ranking** has nowhere to put the clause — a
	// heaviest-ever is one number and a curve is one axis — so `kiloLoadBasis`
	// fails closed on an unstated kind, exactly as the 1RM estimator does, and the
	// row takes no record rather than joining the bar's pile.
	expect(kiloLoadBasis(null)).toBeNull()
	expect(kiloLoadBasis('external')).toBe('bar')
	expect(kiloLoadBasis('perSide')).toBe('perHand')
	expect(kiloLoadBasis('bodyweight')).toBe('bodyweightDerived')
	expect(kiloLoadBasis('bodyweightPlus')).toBe('bodyweightDerived')
	// Sign-inverted, an ordinal, a force curve and no load at all: no pile, and no
	// maximum to take.
	expect(
		['assisted', 'stackLevel', 'band', 'unloaded'].map(kiloLoadBasis),
	).toEqual([null, null, null, null])
	expect([...KILO_LOAD_BASES]).toEqual(['bar', 'perHand', 'bodyweightDerived'])
})

test('reps alone are a made verdict where neither side has a kilo — the grading vocabulary can say it, and no program lift can currently supply it', () => {
	// The other half of the same rule **as a vocabulary**, and the honest caveat
	// is the whole reason this test is named the way it is.
	//
	// Where the *prescription* has no kilo either, the reps genuinely are the whole
	// of what can be read, and `gradeSession` says so (ADR 0056 §3, ADR 0008's
	// Unavailable Metric). At *this* seam an all-null `prescribedKg` is an ordinary
	// input and this is a real contract.
	//
	// What it is **not** is a claim about the app. No program lift can hand this
	// array in: `ProgramLiftState.currentWorkingWeightKg` is a non-null kilo, and
	// `readStampedPrescription` folds an all-null stamp back to that state. So a
	// program lift on a stack or a band is `unverifiable` forever, and level 6 → 7
	// is progress the app cannot record. See `program-engine.ts`'s module note for
	// what closing that gap needs. This test asserts the grader, not a journey.
	const rule = {
		setCount: 3,
		repsPerSet: 8,
		successPredicate: { kind: 'allRepsAllSets' },
	} as const
	const stackLevels = [0, 1, 2].map((orderIndex) =>
		set({ orderIndex, weightKg: null, reps: 8 }),
	)

	expect(gradeSession(rule, stackLevels, [null, null, null])).toEqual({
		kind: 'made',
		atKg: null,
		loadStated: false,
		loggedLoadKind: null,
	})
})

test('a ramped program is judged on its top set, and its lighter sets cannot fail it', () => {
	const ramp = [
		set({ orderIndex: 0, weightKg: 80, reps: 5 }),
		set({ orderIndex: 1, weightKg: 100, reps: 5 }),
	]
	expect(
		gradeSession(
			{
				setCount: 5,
				repsPerSet: 5,
				successPredicate: { kind: 'allRepsOnTopSet' },
			},
			ramp,
			[80, 100],
		),
	).toEqual({
		kind: 'made',
		atKg: 100,
		loadStated: true,
		loggedLoadKind: null,
	})
})

test('a ramp whose top set never reached the prescribed weight did not make it', () => {
	const short = [
		set({ orderIndex: 0, weightKg: 70, reps: 5 }),
		set({ orderIndex: 1, weightKg: 85, reps: 5 }),
	]
	expect(
		gradeSession(
			{
				setCount: 2,
				repsPerSet: 5,
				successPredicate: { kind: 'allRepsOnTopSet' },
			},
			short,
			[80, 100],
		),
	).toEqual({
		kind: 'liftedLighter',
		loggedKg: 85,
		prescribedKg: 100,
		lighterSetCount: 1,
		gradedSetCount: 1,
		loggedLoadKind: null,
	})
})

test('an AMRAP program is judged on the last set’s rep count and the weight that set was priced at', () => {
	const rule = {
		setCount: 3,
		repsPerSet: 5,
		successPredicate: { kind: 'minRepsOnAmrapSet', minReps: 5 },
	} as const

	expect(
		gradeSession(
			rule,
			[set({ orderIndex: 0, reps: 3 }), set({ orderIndex: 1, reps: 9 })],
			[100, 100],
		),
	).toMatchObject({ kind: 'made' })
	expect(
		gradeSession(
			rule,
			[set({ orderIndex: 0, reps: 5 }), set({ orderIndex: 1, reps: 4 })],
			[100, 100],
		),
	).toMatchObject({ kind: 'missedReps' })
	// Nine reps on a set 30 kg under the one that was prescribed is not the
	// AMRAP the program asked for.
	expect(
		gradeSession(
			rule,
			[
				set({ orderIndex: 0, reps: 5, weightKg: 70 }),
				set({ orderIndex: 1, reps: 9, weightKg: 70 }),
			],
			[100, 100],
		),
	).toEqual({
		kind: 'liftedLighter',
		loggedKg: 70,
		prescribedKg: 100,
		lighterSetCount: 1,
		gradedSetCount: 1,
		loggedLoadKind: null,
	})
})

// ——— The four increments ——————————————————————————————————————————————————

test('an absolute increment adds its published jump', () => {
	expect(incrementedWeightKg({ kind: 'absolute', deltaKg: 2.5 }, 100, [])).toBe(
		102.5,
	)
})

test('a percentage-of-top-set increment reads the set that was actually lifted, and refuses when there is none', () => {
	const increment = { kind: 'pctOfLastTopSet', pct: 2.5 } as const

	expect(
		incrementedWeightKg(increment, 100, [
			set({ orderIndex: 0, weightKg: 100 }),
		]),
	).toBe(102.5)
	// "+2.5 % of something else" is not the rule, so the honest answer is none.
	expect(incrementedWeightKg(increment, 100, [])).toBeNull()
})

test('a rep-table increment looks the jump up, and its lowest row is a published zero rather than a refusal', () => {
	const increment: Increment = {
		kind: 'byAmrapReps',
		table: NSUNS_TRAINING_MAX_TABLE_LOW_END_KG.map((row) => ({ ...row })),
	}

	expect(
		incrementedWeightKg(increment, 100, [set({ orderIndex: 0, reps: 7 })]),
	).toBe(105)
	expect(
		incrementedWeightKg(increment, 100, [set({ orderIndex: 0, reps: 3 })]),
	).toBe(102.5)
	// "0-1 reps: increase TM by 0 pounds" is an instruction to hold, not an
	// absence of one.
	expect(
		incrementedWeightKg(increment, 100, [set({ orderIndex: 0, reps: 1 })]),
	).toBe(100)
})

test('a multiplied increment doubles only at the published rep threshold', () => {
	const increment = {
		kind: 'multipliedOnAmrap',
		baseDeltaKg: 2.5,
		atOrAboveReps: 10,
		factor: 2,
	} as const

	expect(
		incrementedWeightKg(increment, 100, [set({ orderIndex: 0, reps: 9 })]),
	).toBe(102.5)
	expect(
		incrementedWeightKg(increment, 100, [set({ orderIndex: 0, reps: 10 })]),
	).toBe(105)
})

test('float noise never reaches a kilo, and rounding to plates is somebody else’s job', () => {
	// 100 × 1.025 is 102.49999999999999 in floating point, and a weight with
	// fifteen decimals in it is a bug on every surface that shows it. This is not
	// plate rounding: the engine emits the arithmetic weight and the plate layer
	// says what the gym can make of it.
	expect(
		incrementedWeightKg({ kind: 'pctOfLastTopSet', pct: 2.5 }, 100, [
			set({ orderIndex: 0, weightKg: 100 }),
		]),
	).toBe(102.5)
})

// ——— The increment is state, not a constant ————————————————————————————————

test('a stall can shrink a lift’s increment, and only an absolute jump can be shrunk', () => {
	expect(
		adjustedIncrement({ kind: 'absolute', deltaKg: 5 }, { kind: 'halve' }),
	).toEqual({ kind: 'absolute', deltaKg: 2.5 })
	expect(
		adjustedIncrement(
			{ kind: 'absolute', deltaKg: 5 },
			{ kind: 'stepDown', toDeltaKg: 2.5 },
		),
	).toEqual({ kind: 'absolute', deltaKg: 2.5 })
	// Halving a percentage is not a published rule anywhere, so nothing is
	// invented for the other three bases.
	expect(
		adjustedIncrement({ kind: 'pctOfLastTopSet', pct: 2.5 }, { kind: 'halve' }),
	).toEqual({ kind: 'pctOfLastTopSet', pct: 2.5 })
})

// ——— The cursor ———————————————————————————————————————————————————————————

test('an alternating cursor walks the program’s own day list and wraps, so ABA·BAB needs no session count', () => {
	const dayIds = ['A', 'B']
	const first = advanceCursor(
		{ kind: 'alternatingDays', nextDayId: 'A' },
		dayIds,
		'A',
	)
	expect(first.cursor).toEqual({ kind: 'alternatingDays', nextDayId: 'B' })
	expect(advanceCursor(first.cursor, dayIds, 'B').cursor).toEqual({
		kind: 'alternatingDays',
		nextDayId: 'A',
	})
})

test('a day the definition does not know leaves the cursor where it is, rather than resetting the program to day one', () => {
	const cursor = { kind: 'alternatingDays', nextDayId: 'B' } as const
	expect(advanceCursor(cursor, ['A', 'B'], 'Z').cursor).toEqual(cursor)
})

test('a cycle cursor advances its week only when the day list has been walked through', () => {
	const cursor = {
		kind: 'weekInCycle',
		weekIndex: 0,
		weeksPerCycle: 3,
		nextDayId: 'A',
	} as const
	const dayIds = ['A', 'B', 'C']

	const midWeek = advanceCursor(cursor, dayIds, 'A')
	expect(midWeek.cursor).toMatchObject({ weekIndex: 0, nextDayId: 'B' })
	expect(midWeek.weekCompleted).toBe(false)

	const weekEnd = advanceCursor(midWeek.cursor, dayIds, 'C')
	expect(weekEnd.cursor).toMatchObject({ weekIndex: 1, nextDayId: 'A' })
	expect(weekEnd.weekCompleted).toBe(true)
	expect(weekEnd.cycleCompleted).toBe(false)
})

test('a named-role week cycles volume, recovery and intensity in order', () => {
	const volume = { kind: 'weeklyRoles', nextRole: 'volume' } as const
	const recovery = advanceCursor(volume, [], null).cursor
	expect(recovery).toEqual({ kind: 'weeklyRoles', nextRole: 'recovery' })
	const intensity = advanceCursor(recovery, [], null).cursor
	expect(intensity).toEqual({ kind: 'weeklyRoles', nextRole: 'intensity' })
	expect(advanceCursor(intensity, [], null)).toMatchObject({
		cursor: { nextRole: 'volume' },
		weekCompleted: true,
	})
})

test('a lift belongs to the days its own rule names — StrongLifts’ squat is on both, its bench on one', () => {
	const program = strongLifts5x5Basic({
		squat: 'ex_squat',
		benchPress: 'ex_bench',
	})
	const squat = program.liftRules.find((r) => r.exerciseId === 'ex_squat')!
	const bench = program.liftRules.find((r) => r.exerciseId === 'ex_bench')!

	expect(liftIsOnDay(squat, 'A')).toBe(true)
	expect(liftIsOnDay(squat, 'B')).toBe(true)
	expect(liftIsOnDay(bench, 'B')).toBe(false)
})

// ——— The JSON columns are parsed, not trusted ——————————————————————————————

test('the rule unions are parsed at the seam, so a JSON column cannot smuggle in a kind nobody implements', () => {
	// The schema stores these unions as JSON strings; the vocabulary is pinned
	// here rather than by a CHECK inside a JSON string.
	expect(
		IncrementSchema.safeParse({ kind: 'absolute', deltaKg: 2.5 }).success,
	).toBe(true)
	expect(IncrementSchema.safeParse({ kind: 'deload', pct: 10 }).success).toBe(
		false,
	)
	expect(
		StallResponseSchema.safeParse({ kind: 'stallCut', pct: 10 }).success,
	).toBe(true)
	// `deload` is ADR 0047's planned week and is not a Stall Response.
	expect(
		StallResponseSchema.safeParse({ kind: 'deload', pct: 10 }).success,
	).toBe(false)
	expect(
		SuccessPredicateSchema.safeParse({ kind: 'mostRepsAllSets' }).success,
	).toBe(false)
	expect(
		ProgramCursorSchema.safeParse({ kind: 'sessionCount', count: 12 }).success,
	).toBe(false)
})

test('there is no volume-ladder rule to parse, because the ladder is not the program’s rule', () => {
	// Recorded as an absence with its provenance rather than implemented: the
	// 5×5 → 3×5 → 1×5 ladder appears in none of StrongLifts' own published rules.
	expect(STRONGLIFTS_VOLUME_LADDER.status).toBe('folklore')
	const program = strongLifts5x5Basic({ squat: 'ex_squat' })
	// No rule carries it — the only mention anywhere in a definition is the
	// provenance note that says it is not the program's rule.
	expect(JSON.stringify(program.liftRules)).not.toMatch(/ladder/i)
	expect(program.provenanceNote).toMatch(/ladder is not StrongLifts/)
	// And the banned word for this layer appears nowhere in a definition:
	// `deload` is ADR 0047's planned week and nothing else.
	expect(JSON.stringify(program)).not.toMatch(/deload/i)
})
