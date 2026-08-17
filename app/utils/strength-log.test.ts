import { expect, test } from 'vitest'
import {
	type LoggedSet,
	countsTowardWork,
	effectiveLoadKg,
	ghostsForRows,
	isMissedSet,
	loadValueText,
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
