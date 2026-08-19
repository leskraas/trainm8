import { expect, test } from 'vitest'
import {
	type LoggedSet,
	countsTowardWork,
	effectiveLoadKg,
	ghostsForRows,
	isMissedSet,
	loadValueText,
	readStoredSetLoad,
	statesWhatWasPerformed,
	strengthSummaryCount,
	strengthSummaryCountLabel,
} from './strength-log.ts'

// ——— What a kilo means across equipment ——————————————————————————————————

test('a barbell load is the number on the bar', () => {
	expect(effectiveLoadKg({ kind: 'external', kg: 100 }, 80)).toBe(100)
})

test('a dumbbell load is per hand, so a 32 kg press is 64 kg of work', () => {
	// The trap this exists for: a naive `weightKg` puts a "32 kg dumbbell press"
	// below a "60 kg barbell press" in a record list.
	expect(effectiveLoadKg({ kind: 'perSide', kg: 32, sides: 2 }, 80)).toBe(64)
})

test('bodyweight-derived loads resolve against the athlete, and refuse without one', () => {
	expect(effectiveLoadKg({ kind: 'bodyweight' }, 80)).toBe(80)
	expect(effectiveLoadKg({ kind: 'bodyweightPlus', addedKg: 20 }, 80)).toBe(100)
	// No bodyweight on file is a refusal, never "20 kg" — storing the added load
	// alone would make a weighted pull-up look lighter than a curl.
	expect(
		effectiveLoadKg({ kind: 'bodyweightPlus', addedKg: 20 }, null),
	).toBeNull()
	expect(effectiveLoadKg({ kind: 'bodyweight' }, null)).toBeNull()
})

test('an assisted machine subtracts — the sign belongs to the equipment', () => {
	expect(effectiveLoadKg({ kind: 'assisted', assistKg: 21 }, 80)).toBe(59)
	// An assist heavier than the athlete is not a lighter set, it is a number
	// that cannot be true.
	expect(effectiveLoadKg({ kind: 'assisted', assistKg: 90 }, 80)).toBeNull()
})

test('a stack level and a band have no honest kilo, and none is invented', () => {
	// The Unavailable Metric principle one level down: a machine level is an
	// ordinal and a band is a force curve. Inventing kilos to make a chart
	// continuous is exactly the fabrication the repo forbids.
	expect(effectiveLoadKg({ kind: 'stackLevel', level: 7 }, 80)).toBeNull()
	expect(effectiveLoadKg({ kind: 'band', band: 'red' }, 80)).toBeNull()
	expect(effectiveLoadKg({ kind: 'unloaded' }, 80)).toBeNull()
})

test('the load reads as a lifter would say it, per-hand meaning on its face', () => {
	expect(loadValueText({ kind: 'external', kg: 100 })).toBe('100 kg')
	expect(loadValueText({ kind: 'external', kg: 102.5 })).toBe('102.5 kg')
	expect(loadValueText({ kind: 'perSide', kg: 32, sides: 2 })).toBe('2 × 32 kg')
	expect(loadValueText({ kind: 'bodyweightPlus', addedKg: 20 })).toBe(
		'bodyweight + 20 kg',
	)
	expect(loadValueText({ kind: 'assisted', assistKg: 21 })).toBe(
		'assisted − 21 kg',
	)
	expect(loadValueText({ kind: 'stackLevel', level: 7 })).toBe('level 7')
	expect(loadValueText({ kind: 'band', band: 'red' })).toBe('red band')
})

// ——— Three senses of "failed" ————————————————————————————————————————————

test('missing the target is derived from the numbers, not a flag', () => {
	expect(
		isMissedSet({ outcome: 'completed', reps: 3, prescribedReps: 5 }),
	).toBe(true)
	expect(
		isMissedSet({ outcome: 'completed', reps: 5, prescribedReps: 5 }),
	).toBe(false)
	// Beating the target is not a miss.
	expect(
		isMissedSet({ outcome: 'completed', reps: 7, prescribedReps: 5 }),
	).toBe(false)
})

test('an abandoned set is not a missed one — it has no rep count to compare', () => {
	expect(
		isMissedSet({ outcome: 'abandoned', reps: 2, prescribedReps: 5 }),
	).toBe(false)
})

test('with nothing prescribed there is nothing to miss', () => {
	expect(
		isMissedSet({ outcome: 'completed', reps: 3, prescribedReps: null }),
	).toBe(false)
})

test('only a finished working set counts as work', () => {
	expect(countsTowardWork({ role: 'working', outcome: 'completed' })).toBe(true)
	expect(countsTowardWork({ role: 'warmup', outcome: 'completed' })).toBe(false)
	expect(countsTowardWork({ role: 'working', outcome: 'abandoned' })).toBe(
		false,
	)
})

test('a completed set has to say what was performed, and a count of seconds is a count', () => {
	const performed = (
		partial: Partial<Parameters<typeof statesWhatWasPerformed>[0]>,
	) =>
		statesWhatWasPerformed({
			role: 'working',
			outcome: 'completed',
			reps: null,
			repsLeft: null,
			durationSec: null,
			...partial,
		})

	// A weight with no count is not a set: it would mint a record off an effort
	// nobody made, and read as zero reps in the program's success predicate.
	expect(performed({})).toBe(false)
	expect(performed({ reps: 0 })).toBe(false)
	expect(performed({ reps: 5 })).toBe(true)
	// A timed hold is counted in seconds, and the other side of a unilateral set
	// is a count of its own.
	expect(performed({ durationSec: 45 })).toBe(true)
	expect(performed({ repsLeft: 8 })).toBe(true)
	// The two exemptions: abandoning a set is how you say it did not happen, and a
	// warm-up rung is a check-off that feeds no reading.
	expect(performed({ outcome: 'abandoned' })).toBe(true)
	expect(performed({ role: 'warmup' })).toBe(true)
})

// ——— The ghost ————————————————————————————————————————————————————————————

function set(partial: Partial<LoggedSet> & { orderIndex: number }): LoggedSet {
	return {
		role: 'working',
		outcome: 'completed',
		load: { kind: 'external', kg: 100 },
		reps: 5,
		repsLeft: null,
		durationSec: null,
		rir: null,
		toFailure: false,
		...partial,
	}
}

test('the ghost matches positionally, so a ramp shows the right row', () => {
	const ghosts = ghostsForRows(
		[
			set({ orderIndex: 0, load: { kind: 'external', kg: 60 }, reps: 8 }),
			set({ orderIndex: 1, load: { kind: 'external', kg: 80 }, reps: 5 }),
			set({ orderIndex: 2, load: { kind: 'external', kg: 100 }, reps: 3 }),
		],
		3,
	)
	expect(ghosts.map((g) => loadValueText(g!.load))).toEqual([
		'60 kg',
		'80 kg',
		'100 kg',
	])
	expect(ghosts.every((g) => !g!.extrapolated)).toBe(true)
})

test('an extra row borrows the last ghost and says so', () => {
	// An empty ghost on set 5 of 5 reads as "new territory" when it only means
	// "you did four last time" — so the row carries the last one, flagged.
	const ghosts = ghostsForRows([set({ orderIndex: 0 })], 3)
	expect(ghosts[0]!.extrapolated).toBe(false)
	expect(ghosts[1]!.extrapolated).toBe(true)
	expect(ghosts[2]!.extrapolated).toBe(true)
})

test('warm-ups and abandoned sets are dropped before matching', () => {
	// Otherwise adding a warm-up shifts every working row's ghost by one.
	const ghosts = ghostsForRows(
		[
			set({
				orderIndex: 0,
				role: 'warmup',
				load: { kind: 'external', kg: 40 },
			}),
			set({ orderIndex: 1, load: { kind: 'external', kg: 100 } }),
			set({
				orderIndex: 2,
				outcome: 'abandoned',
				load: { kind: 'external', kg: 100 },
			}),
		],
		2,
	)
	expect(loadValueText(ghosts[0]!.load)).toBe('100 kg')
	expect(ghosts[1]!.extrapolated).toBe(true)
})

test('no history is no ghost, never a fabricated one', () => {
	expect(ghostsForRows([], 3)).toEqual([null, null, null])
})

// ——— ADR 0046 §4's Summary Count ——————————————————————————————————————————

test('the Summary Count counts sessions with logged work', () => {
	expect(
		strengthSummaryCount([
			{ loggedWorkingSets: 5 },
			{ loggedWorkingSets: 0 },
			{ loggedWorkingSets: 3 },
		]),
	).toEqual({ completed: 2, planned: 3 })
})

test('an empty week is an absence, never 0 of 0', () => {
	// `0 of 0` reads as a completed week; a Summary Count is derived from
	// *existing* sessions, so with none there is nothing to count (ADR 0046 §4).
	expect(strengthSummaryCount([])).toBeNull()
	expect(strengthSummaryCountLabel(null)).toBe('No lifting sessions this week')
})

test('the count is one phrase, and it says which track', () => {
	expect(strengthSummaryCountLabel({ completed: 2, planned: 3 })).toBe(
		'2 of 3 lifting sessions logged',
	)
	expect(strengthSummaryCountLabel({ completed: 1, planned: 1 })).toBe(
		'1 of 1 lifting session logged',
	)
})

// ——— The stored kilo against the load that explains it ————————————————————

test('a set log whose stored kilo does not match the load that explains it is not believed', () => {
	// The row a verifier hand-wrote: 30 kg of load, 300 kg standing beside it. The
	// app believed all the way down to "Set used: 300 kg × 3" and a stored 330 kg
	// 1RM.
	const reading = readStoredSetLoad({
		load: JSON.stringify({ kind: 'external', kg: 30 }),
		effectiveKg: 300,
		bodyweightKg: null,
	})
	expect(reading.kind).toBe('contradicted')
	// Refused with the numbers named, so a surface can say what is wrong rather
	// than fall silent — and the 300 is quoted, never repaired to 30.
	if (reading.kind !== 'contradicted') throw new Error('expected a refusal')
	expect(reading.recordedEffectiveKg).toBe(300)
	// Refused, not repaired: the check reads what the load explains and says so,
	// and nothing anywhere writes that reading back over the stored number.
	expect(reading.explainedEffectiveKg).toBe(30)
	expect(reading.explanation).toMatch(/30 kg/)
	expect(reading.explanation).toMatch(/300 kg/)
})

test('a row whose stored kilo is the one its load explains is read as stored', () => {
	const reading = readStoredSetLoad({
		load: JSON.stringify({ kind: 'perSide', kg: 32, sides: 2 }),
		effectiveKg: 64,
		bodyweightKg: null,
	})
	expect(reading).toMatchObject({ kind: 'readable', effectiveKg: 64 })
})

test('a load column that cannot be read leaves the kilo beside it exactly as it was', () => {
	// The deliberate asymmetry: an unparseable row costs a qualifying clause, not a
	// fold. Failing closed here would freeze every imported and pre-`LoadValue`
	// row (see `unreadableLoad`).
	const reading = readStoredSetLoad({
		load: 'not json at all',
		effectiveKg: 100,
		bodyweightKg: null,
	})
	expect(reading).toMatchObject({ kind: 'uncheckable', effectiveKg: 100 })
})

test('a bodyweight-derived row is checked against the bodyweight stored beside it, not today’s', () => {
	// A dip at bodyweight 74 kg plus 20 kg, logged two years ago. The athlete is
	// 84 kg now, and that is not what this row is checked against: the bodyweight
	// stored beside the bake is the bodyweight *then*, which is the whole reason
	// the column exists (ADR 0056 §3).
	expect(
		readStoredSetLoad({
			load: JSON.stringify({ kind: 'bodyweightPlus', addedKg: 20 }),
			effectiveKg: 94,
			bodyweightKg: 74,
		}),
	).toMatchObject({ kind: 'readable', effectiveKg: 94 })
	// And a row baked against a bodyweight that is not the one standing beside it
	// fails the check honestly rather than being quietly rewritten to agree.
	const rewritten = readStoredSetLoad({
		load: JSON.stringify({ kind: 'bodyweightPlus', addedKg: 20 }),
		effectiveKg: 104,
		bodyweightKg: 74,
	})
	expect(rewritten.kind).toBe('contradicted')
	if (rewritten.kind !== 'contradicted') throw new Error('expected a refusal')
	expect(rewritten.recordedEffectiveKg).toBe(104)
	expect(rewritten.explainedEffectiveKg).toBe(94)
	// And a row with **no** bodyweight stored beside it cannot be checked at all:
	// the check has no bodyweight *then* to use, and reaching for today's would
	// refuse every honest row the moment the athlete's weight moved. Read as
	// logged, and said to be uncheckable.
	expect(
		readStoredSetLoad({
			load: JSON.stringify({ kind: 'bodyweightPlus', addedKg: 20 }),
			effectiveKg: 94,
			bodyweightKg: null,
		}),
	).toMatchObject({ kind: 'uncheckable', effectiveKg: 94 })
})
