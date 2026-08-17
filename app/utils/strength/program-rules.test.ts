import { expect, test } from 'vitest'
import {
	type Increment,
	type LoggedWorkSet,
	IncrementSchema,
	ProgramCursorSchema,
	StallResponseSchema,
	SuccessPredicateSchema,
	adjustedIncrement,
	advanceCursor,
	amrapSet,
	countsTowardProgression,
	evaluateSuccessPredicate,
	incrementedWeightKg,
	liftIsOnDay,
	progressionSets,
	topSet,
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

// ——— The success predicates ———————————————————————————————————————————————

test('an unlogged lift is a third answer, and not a failure', () => {
	expect(
		evaluateSuccessPredicate(
			{ kind: 'allRepsAllSets' },
			{ setCount: 5, repsPerSet: 5 },
			[],
		),
	).toBeNull()
})

test('all-reps-all-sets means every prescribed set, so a short session fails on the count alone', () => {
	const rule = { setCount: 5, repsPerSet: 5 }
	const full = [0, 1, 2, 3, 4].map((orderIndex) => set({ orderIndex }))

	expect(evaluateSuccessPredicate({ kind: 'allRepsAllSets' }, rule, full)).toBe(
		true,
	)
	expect(
		evaluateSuccessPredicate(
			{ kind: 'allRepsAllSets' },
			rule,
			full.slice(0, 4),
		),
	).toBe(false)
})

test('a ramped program is judged on its top set, and its lighter sets cannot fail it', () => {
	const ramp = [
		set({ orderIndex: 0, weightKg: 80, reps: 5 }),
		set({ orderIndex: 1, weightKg: 100, reps: 5 }),
	]
	expect(
		evaluateSuccessPredicate(
			{ kind: 'allRepsOnTopSet' },
			{ setCount: 5, repsPerSet: 5 },
			ramp,
		),
	).toBe(true)
})

test('an AMRAP program is judged on the last set’s rep count and nothing else', () => {
	const predicate = { kind: 'minRepsOnAmrapSet', minReps: 5 } as const
	const rule = { setCount: 3, repsPerSet: 5 }

	expect(
		evaluateSuccessPredicate(predicate, rule, [
			set({ orderIndex: 0, reps: 3 }),
			set({ orderIndex: 1, reps: 9 }),
		]),
	).toBe(true)
	expect(
		evaluateSuccessPredicate(predicate, rule, [
			set({ orderIndex: 0, reps: 5 }),
			set({ orderIndex: 1, reps: 4 }),
		]),
	).toBe(false)
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
