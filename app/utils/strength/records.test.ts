import { expect, test } from 'vitest'
import { type LoadValue } from '../strength-log.ts'
import {
	type OneRepMaxEstimator,
	type RecordedSet,
	type StrengthRecord,
	deriveStrengthRecords,
	strengthRecordLabel,
} from './records.ts'

// ——— Fixtures ————————————————————————————————————————————————————————————
//
// A set is written the way it was logged: a `LoadValue` plus the `effectiveKg`
// that was *baked beside it at log time*. Nothing in this module re-derives that
// number, which is the whole point of the bake (ADR 0056 §3).

const DAY = 24 * 60 * 60 * 1000
const start = new Date('2026-01-05T09:00:00Z')

function day(n: number): Date {
	return new Date(start.getTime() + n * DAY)
}

function set(partial: Partial<RecordedSet> = {}): RecordedSet {
	const load: LoadValue = partial.load ?? { kind: 'external', kg: 100 }
	return {
		sessionId: 's1',
		exerciseId: 'squat',
		equipment: 'barbell',
		performedAt: day(0),
		role: 'working',
		outcome: 'completed',
		load,
		effectiveKg: load.kind === 'external' ? load.kg : null,
		reps: 5,
		...partial,
	}
}

function barbell(kg: number, partial: Partial<RecordedSet> = {}): RecordedSet {
	return set({ load: { kind: 'external', kg }, effectiveKg: kg, ...partial })
}

function find(
	records: StrengthRecord[],
	kind: StrengthRecord['kind'],
	reps: number | null = null,
): StrengthRecord | undefined {
	return records.find((r) => r.kind === kind && r.reps === reps)
}

/** Epley, injected. This module never implements or imports an estimator. */
const epley: OneRepMaxEstimator = ({ weightKg, reps }) =>
	reps > 10 ? null : weightKg * (1 + reps / 30)

// ——— The three honest readings ———————————————————————————————————————————

test('the heaviest working set ever is a record, whatever the reps', () => {
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(120, { sessionId: 'b', performedAt: day(2), reps: 1 }),
		barbell(110, { sessionId: 'c', performedAt: day(4), reps: 3 }),
	])
	const heaviest = find(records, 'heaviestLoad')
	expect(heaviest?.value).toBe(120)
	expect(heaviest?.sessionId).toBe('b')
	expect(heaviest?.unit).toBe('kg')
})

test('a rep-max record is the best load at exactly that rep count', () => {
	// The least model-dependent record there is: no equation stands between the
	// bar and the reading, so a best five is not a best single wearing a formula.
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(140, { sessionId: 'b', performedAt: day(2), reps: 1 }),
		barbell(105, { sessionId: 'c', performedAt: day(4), reps: 5 }),
		barbell(102, { sessionId: 'd', performedAt: day(6), reps: 3 }),
	])
	expect(find(records, 'repMax', 5)?.value).toBe(105)
	expect(find(records, 'repMax', 1)?.value).toBe(140)
	expect(find(records, 'repMax', 3)?.value).toBe(102)
	// A 140 kg single does not become a 140 kg five.
	expect(find(records, 'repMax', 5)?.sessionId).toBe('c')
})

test('the estimated 1RM comes from an injected estimator, and none is invented without one', () => {
	const sets = [
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(90, { sessionId: 'b', performedAt: day(2), reps: 8 }),
	]
	const withEstimator = deriveStrengthRecords(sets, {
		oneRm: { name: 'epley', estimate: epley },
	})
	const e1rm = find(withEstimator, 'e1RM')
	expect(e1rm?.value).toBeCloseTo(116.67, 2)
	// The equation is named on the record, so the axis can name its own model.
	expect(e1rm?.estimator).toBe('epley')
	// With no estimator injected there is no estimate — the module owns no model.
	expect(find(deriveStrengthRecords(sets), 'e1RM')).toBeUndefined()
})

test('an estimator that refuses a set leaves that set out rather than grading it', () => {
	// The ≤ 10-rep gate lives in the estimator; here it simply means the 20-rep
	// set contributes nothing, and a set of 20 never sets a 1RM record.
	const records = deriveStrengthRecords(
		[
			barbell(60, { sessionId: 'a', performedAt: day(0), reps: 20 }),
			barbell(100, { sessionId: 'b', performedAt: day(2), reps: 3 }),
		],
		{ oneRm: { name: 'epley', estimate: epley } },
	)
	expect(find(records, 'e1RM')?.sessionId).toBe('b')
})

// ——— The gates every aggregate shares ————————————————————————————————————

test('an abandoned set is dropped from every aggregate', () => {
	const records = deriveStrengthRecords(
		[
			barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
			barbell(140, {
				sessionId: 'b',
				performedAt: day(2),
				reps: 5,
				outcome: 'abandoned',
			}),
		],
		{ oneRm: { name: 'epley', estimate: epley } },
	)
	expect(find(records, 'heaviestLoad')?.value).toBe(100)
	expect(find(records, 'repMax', 5)?.value).toBe(100)
	expect(find(records, 'e1RM')?.sessionId).toBe('a')
})

test('a warm-up never sets a record, however heavy it was logged', () => {
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(140, {
			sessionId: 'b',
			performedAt: day(2),
			reps: 5,
			role: 'warmup',
		}),
	])
	expect(find(records, 'heaviestLoad')?.value).toBe(100)
})

test('a set with no honest kilo is absent from the kilo records rather than counted as zero', () => {
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		set({
			sessionId: 'b',
			performedAt: day(2),
			load: { kind: 'band', band: 'red' },
			effectiveKg: null,
			reps: 12,
		}),
	])
	expect(find(records, 'heaviestLoad')?.value).toBe(100)
	expect(find(records, 'repMax', 12)).toBeUndefined()
})

// ——— A kilo is not a kilo ————————————————————————————————————————————————

test('a stack-level exercise progresses against itself and says it cannot be compared', () => {
	// Level 6 → 7 is real. A kilo for it would be fabricated, so the record is in
	// levels, is flagged uncomparable, and carries the phrase that says why.
	const records = deriveStrengthRecords([
		set({
			sessionId: 'a',
			exerciseId: 'lat-pulldown',
			equipment: 'machine',
			performedAt: day(0),
			load: { kind: 'stackLevel', level: 6 },
			effectiveKg: null,
			reps: 10,
		}),
		set({
			sessionId: 'b',
			exerciseId: 'lat-pulldown',
			equipment: 'machine',
			performedAt: day(3),
			load: { kind: 'stackLevel', level: 7 },
			effectiveKg: null,
			reps: 10,
		}),
	])
	const best = find(records, 'stackLevel')
	expect(best?.value).toBe(7)
	expect(best?.unit).toBe('level')
	expect(best?.previousValue).toBe(6)
	expect(best?.crossExerciseComparable).toBe(false)
	expect(best?.unavailableNote).toBe(
		'No kilos — this progresses against itself only.',
	)
	// And it is not smuggled into the kilo readings.
	expect(find(records, 'heaviestLoad')).toBeUndefined()
})

test('a band has no ordering, so it sets no record at all rather than a fabricated one', () => {
	const records = deriveStrengthRecords([
		set({
			exerciseId: 'face-pull',
			equipment: 'band',
			load: { kind: 'band', band: 'red' },
			effectiveKg: null,
			reps: 15,
		}),
		set({
			sessionId: 's2',
			exerciseId: 'face-pull',
			equipment: 'band',
			performedAt: day(3),
			load: { kind: 'band', band: 'black' },
			effectiveKg: null,
			reps: 15,
		}),
	])
	expect(records).toEqual([])
})

test('a bodyweight-derived record uses the kilos baked at log time, not today’s bodyweight', () => {
	// The athlete weighed 80 kg two years ago and weighs 74 kg now. The old
	// weighted dip stays a 100 kg dip: nothing here recomputes `effectiveKg`.
	const records = deriveStrengthRecords([
		set({
			sessionId: 'old',
			exerciseId: 'dip',
			equipment: 'bodyweight',
			performedAt: day(0),
			load: { kind: 'bodyweightPlus', addedKg: 20 },
			effectiveKg: 100,
			reps: 5,
		}),
		set({
			sessionId: 'new',
			exerciseId: 'dip',
			equipment: 'bodyweight',
			performedAt: day(700),
			load: { kind: 'bodyweightPlus', addedKg: 20 },
			effectiveKg: 94,
			reps: 5,
		}),
	])
	expect(find(records, 'heaviestLoad')?.value).toBe(100)
	expect(find(records, 'heaviestLoad')?.sessionId).toBe('old')
})

// ——— The progression key ————————————————————————————————————————————————

test('a record is keyed by exercise and equipment, so barbell and dumbbell bench progress separately', () => {
	const records = deriveStrengthRecords([
		barbell(100, {
			sessionId: 'a',
			exerciseId: 'bench',
			equipment: 'barbell',
			performedAt: day(0),
			reps: 5,
		}),
		set({
			sessionId: 'b',
			exerciseId: 'bench',
			equipment: 'dumbbell',
			performedAt: day(2),
			load: { kind: 'perSide', kg: 32, sides: 2 },
			effectiveKg: 64,
			reps: 5,
		}),
	])
	const heaviest = records.filter((r) => r.kind === 'heaviestLoad')
	expect(heaviest).toHaveLength(2)
	expect(heaviest.map((r) => [r.equipment, r.value])).toEqual([
		['barbell', 100],
		['dumbbell', 64],
	])
	// A dumbbell day is never a regression on the barbell lift.
	expect(heaviest.every((r) => r.previousValue === null)).toBe(true)
})

// ——— What the record beat ————————————————————————————————————————————————

test('the previous best is what the record beat, and a debut has nothing before it', () => {
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(105, { sessionId: 'b', performedAt: day(7), reps: 5 }),
		barbell(102, { sessionId: 'c', performedAt: day(14), reps: 5 }),
	])
	const best = find(records, 'repMax', 5)
	expect(best?.value).toBe(105)
	expect(best?.previousValue).toBe(100)
	expect(best?.delta).toBe(5)

	const debut = find(
		deriveStrengthRecords([barbell(100, { reps: 5 })]),
		'repMax',
		5,
	)
	expect(debut?.previousValue).toBeNull()
	expect(debut?.delta).toBeNull()
})

test('the earliest set holds a tied record, so the original setter keeps it', () => {
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'first', performedAt: day(0), reps: 5 }),
		barbell(100, { sessionId: 'later', performedAt: day(7), reps: 5 }),
	])
	expect(find(records, 'repMax', 5)?.sessionId).toBe('first')
})

// ——— A first entry is not a record ———————————————————————————————————————

test('a first-ever dumbbell bench reads as a first time, not as four PRs', () => {
	const records = deriveStrengthRecords(
		[
			set({
				exerciseId: 'bench',
				equipment: 'dumbbell',
				load: { kind: 'perSide', kg: 30, sides: 2 },
				effectiveKg: 60,
				reps: 8,
			}),
		],
		{ oneRm: { name: 'epley', estimate: epley } },
	)
	expect(records.every((r) => r.debut)).toBe(true)
	expect(strengthRecordLabel(find(records, 'heaviestLoad')!)).toBe(
		'Heaviest ever: 60 kg — first time!',
	)
})

test('a record stops being a debut once the variant has three sessions behind it', () => {
	const history = [0, 7, 14].map((n) =>
		barbell(100, { sessionId: `s${n}`, performedAt: day(n), reps: 5 }),
	)
	const records = deriveStrengthRecords([
		...history,
		barbell(105, { sessionId: 'pr', performedAt: day(21), reps: 5 }),
	])
	expect(find(records, 'repMax', 5)?.debut).toBe(false)
})

// ——— The reading ————————————————————————————————————————————————————————

test('a record reads as one phrase, and an uncomparable one says so in it', () => {
	const kg = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(105, { sessionId: 'b', performedAt: day(7), reps: 5 }),
		barbell(107.5, { sessionId: 'c', performedAt: day(14), reps: 5 }),
		barbell(110, { sessionId: 'd', performedAt: day(21), reps: 5 }),
	])
	expect(strengthRecordLabel(find(kg, 'repMax', 5)!)).toBe(
		'Best 5-rep set: 110 kg — up 2.5 kg',
	)
	expect(strengthRecordLabel(find(kg, 'heaviestLoad')!)).toBe(
		'Heaviest ever: 110 kg — up 2.5 kg',
	)

	const stack = deriveStrengthRecords([
		set({
			sessionId: 'a',
			exerciseId: 'lat-pulldown',
			equipment: 'machine',
			performedAt: day(0),
			load: { kind: 'stackLevel', level: 6 },
			effectiveKg: null,
		}),
	])
	expect(strengthRecordLabel(find(stack, 'stackLevel')!)).toBe(
		'Best level: 6 — first time! · No kilos — this progresses against itself only.',
	)
})

test('an estimated 1RM names its equation in the reading, because the number is a model', () => {
	const records = deriveStrengthRecords(
		[
			barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
			barbell(100, { sessionId: 'b', performedAt: day(7), reps: 5 }),
			barbell(100, { sessionId: 'c', performedAt: day(14), reps: 5 }),
			barbell(102.5, { sessionId: 'd', performedAt: day(21), reps: 5 }),
		],
		{ oneRm: { name: 'brzycki', estimate: epley } },
	)
	expect(strengthRecordLabel(find(records, 'e1RM')!)).toBe(
		'Best estimated 1RM: 119.6 kg (brzycki) — up 2.9 kg',
	)
})

// ——— What this module refuses to compute ————————————————————————————————

test('neither session tonnage nor a logging streak is exported, because neither is a reading about training', async () => {
	// Declined, not deferred (ADR 0056's considered options): tonnage rewards
	// junk volume and inverts the portability thesis, and a streak measures
	// app-opening. There is deliberately nothing here to import.
	const module: Record<string, unknown> = await import('./records.ts')
	expect(
		Object.keys(module).filter((name) => /tonnage|streak|volume/i.test(name)),
	).toEqual([])
})
