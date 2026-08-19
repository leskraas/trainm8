import { expect, test } from 'vitest'
import { type LoadValue, LOAD_VALUE_KINDS } from '../strength-log.ts'
import { formatKg } from './program.constants.ts'
import {
	type OneRepMaxEstimator,
	type RecordLoadBasis,
	type RecordedSet,
	type StrengthRecord,
	type StrengthRecordOptions,
	ASSIST_INVERTED_NOTE,
	assistedRecordRefusal,
	deriveStrengthRecords as deriveStrengthRecordsAsOf,
	strengthRecordHeadline,
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
		// The effort is unstated unless a test states it, which is the ordinary
		// shape of a logged set: most sets say nothing about failure.
		rir: null,
		toFailure: false,
		...partial,
	}
}

function barbell(kg: number, partial: Partial<RecordedSet> = {}): RecordedSet {
	return set({ load: { kind: 'external', kg }, effectiveKg: kg, ...partial })
}

/**
 * Long after every fixture day, so a test that is not about the cutoff does not
 * have to state one. The cutoff is required by the real signature and is proven
 * on its own below — this only says "read as of after all of this happened".
 */
const AFTER_EVERYTHING = day(1000)

function deriveStrengthRecords(
	sets: RecordedSet[],
	options: Partial<StrengthRecordOptions> = {},
): StrengthRecord[] {
	return deriveStrengthRecordsAsOf(sets, { now: AFTER_EVERYTHING, ...options })
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

// ——— The cutoff every reading shares ————————————————————————————————————

test('a record is not announced from a session the history says has not happened', () => {
	// 11:00, and the athlete has already logged a Pull-up into tonight's session,
	// which is dated 23:30. `exerciseHistory` reads `performedAt <= now`, so it
	// cannot see that session yet — and a record read off it is a page arguing with
	// itself: "Heaviest bodyweight set: 109 kg — first time!" over "First time on
	// this lift".
	const eleven = new Date('2026-01-05T11:00:00Z')
	const tonight = barbell(109, {
		sessionId: 'tonight',
		performedAt: new Date('2026-01-05T23:30:00Z'),
		reps: 6,
	})

	expect(deriveStrengthRecords([tonight], { now: eleven })).toEqual([])

	// Not lost, only not yet: the same set is a record the moment its session's
	// day arrives, with no second rule to explain why.
	const later = deriveStrengthRecords([tonight], {
		now: new Date('2026-01-06T00:00:00Z'),
	})
	expect(find(later, 'heaviestLoad')?.value).toBe(109)
})

test('work that has not happened is not what a record beat, and does not close the debut window', () => {
	// The previous best and the prior-session count are read over the same cut of
	// the history as the record itself, so a session dated next week cannot make
	// today's first entry look like a beaten one.
	const records = deriveStrengthRecords(
		[
			barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
			barbell(120, { sessionId: 'next-week', performedAt: day(15), reps: 5 }),
		],
		{ now: day(5) },
	)
	const heaviest = find(records, 'heaviestLoad')
	expect(heaviest?.value).toBe(100)
	expect(heaviest?.previousValue).toBeNull()
	expect(heaviest?.sessionId).toBe('a')
})

test('an assisted session that has not happened does not explain an empty records strip', () => {
	// The refusal exists to say why the strip beside it is empty, so it may only be
	// said about work that strip could have contained.
	const assisted = set({
		exerciseId: 'pull-up',
		equipment: 'assisted-machine',
		performedAt: day(15),
		load: { kind: 'assisted', assistKg: 20 },
		effectiveKg: 54,
		reps: 8,
	})
	expect(assistedRecordRefusal([assisted], day(5))).toBeNull()
	expect(assistedRecordRefusal([assisted], day(20))).toBe(ASSIST_INVERTED_NOTE)
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

// ——— A kilo of what: the load basis ——————————————————————————————————————
//
// Every test below is a browser observation. The records surface filtered on
// `effectiveKg` alone and read `load.kind` only to find a stack level, so every
// kind that bakes a kilo landed in one pile and competed with the bar.

test('an assisted load does not set a heaviest-ever record, because its number grows as the work shrinks', () => {
	// Observed: an assisted squat logged `{ assisted, assistKg: 10 }` against a
	// 74 kg athlete baked `effectiveKg` 64 and the page said "Best 2-rep set:
	// 64 kg — first time!". Nothing was on the bar. And the direction is the real
	// objection: the assist coming *down* to 5 kg would read as a further record,
	// while the assist coming down to 0 — the athlete finally squatting unaided —
	// would read as the biggest record of all for the wrong reason.
	const records = deriveStrengthRecords([
		barbell(40, { sessionId: 'bar', performedAt: day(0), reps: 5 }),
		set({
			sessionId: 'assisted',
			performedAt: day(3),
			load: { kind: 'assisted', assistKg: 10 },
			effectiveKg: 64,
			reps: 2,
		}),
	])
	expect(records.map((r) => r.value)).not.toContain(64)
	expect(find(records, 'heaviestLoad')?.value).toBe(40)
	expect(find(records, 'repMax', 2)).toBeUndefined()
})

test('an assisted lift with no record says why, instead of showing an empty strip', () => {
	// The refusal is a sentence, not a silence: assisted pull-ups really are
	// getting better, and the athlete is owed the reason the app will not call any
	// of them a maximum.
	const assisted = set({
		exerciseId: 'pull-up',
		equipment: 'assisted-machine',
		load: { kind: 'assisted', assistKg: 20 },
		effectiveKg: 54,
		reps: 8,
	})
	expect(deriveStrengthRecords([assisted])).toEqual([])
	expect(assistedRecordRefusal([assisted], AFTER_EVERYTHING)).toBe(
		ASSIST_INVERTED_NOTE,
	)
	// Nothing is said about an absence that is not there, and a warm-up does not
	// conjure the sentence either — `countsTowardWork` is the one gate here too.
	expect(assistedRecordRefusal([barbell(100)], AFTER_EVERYTHING)).toBeNull()
	expect(
		assistedRecordRefusal(
			[set({ ...assisted, role: 'warmup' })],
			AFTER_EVERYTHING,
		),
	).toBeNull()
})

test('a weighted dip progresses against other weighted dips, not against a barbell lift', () => {
	// Both of these are real and neither is the other: the dip belt going 20 → 30
	// is progress, and it is progress *on the dip*, read against the last dip.
	const records = deriveStrengthRecords([
		set({
			sessionId: 'dip-1',
			exerciseId: 'dip',
			equipment: 'bodyweight',
			performedAt: day(0),
			load: { kind: 'bodyweightPlus', addedKg: 20 },
			effectiveKg: 94,
			reps: 5,
		}),
		set({
			sessionId: 'dip-2',
			exerciseId: 'dip',
			equipment: 'bodyweight',
			performedAt: day(7),
			load: { kind: 'bodyweightPlus', addedKg: 30 },
			effectiveKg: 104,
			reps: 5,
		}),
		// A plain bodyweight dip is the same progression — it is the same number
		// with nothing hung off it — so it is what the first weighted dip beat.
		set({
			sessionId: 'dip-0',
			exerciseId: 'dip',
			equipment: 'bodyweight',
			performedAt: day(-7),
			load: { kind: 'bodyweight' },
			effectiveKg: 74,
			reps: 5,
		}),
	])
	const heaviest = records.filter((r) => r.kind === 'heaviestLoad')
	expect(heaviest).toHaveLength(1)
	expect(heaviest[0]?.loadBasis).toBe('bodyweightDerived')
	expect(heaviest[0]?.value).toBe(104)
	expect(heaviest[0]?.previousValue).toBe(94)
	expect(heaviest[0]?.crossExerciseComparable).toBe(false)
	expect(strengthRecordLabel(heaviest[0]!)).toBe(
		'Heaviest bodyweight set: 104 kg — best so far · Includes your bodyweight — this progresses against other bodyweight sets only.',
	)
})

test('a bodyweight-derived kilo is never compared with a weight on the bar', () => {
	// Observed: one dip-belt row logged against Bench Press read "Heaviest ever:
	// 104 kg — up 74 kg" and "Best 5-rep set: 104 kg — up 74 kg" on a lift whose
	// heaviest real bar weight is 30 kg — beside the engine's own sentence saying
	// that number is not a weight on the bar.
	const records = deriveStrengthRecords(
		[
			barbell(20, {
				sessionId: 'a',
				exerciseId: 'bench',
				performedAt: day(0),
				reps: 5,
			}),
			barbell(30, {
				sessionId: 'b',
				exerciseId: 'bench',
				performedAt: day(7),
				reps: 5,
			}),
			set({
				sessionId: 'c',
				exerciseId: 'bench',
				performedAt: day(14),
				load: { kind: 'bodyweightPlus', addedKg: 30 },
				effectiveKg: 104,
				reps: 5,
			}),
		],
		{ oneRm: { name: 'epley', estimate: epley } },
	)
	const bar = records.filter((r) => r.loadBasis === 'bar')
	const bodyweight = records.filter((r) => r.loadBasis === 'bodyweightDerived')

	// The bar's records are the bar's, and 104 kg is not among them.
	expect(bar.map((r) => r.value)).not.toContain(104)
	expect(find(bar, 'heaviestLoad')?.value).toBe(30)
	expect(find(bar, 'repMax', 5)?.value).toBe(30)
	// The 104 kg reading exists, in its own partition, having beaten nothing —
	// it is the first bodyweight-derived set on this lift, not a 74 kg gain.
	expect(find(bodyweight, 'heaviestLoad')?.value).toBe(104)
	expect(find(bodyweight, 'heaviestLoad')?.previousValue).toBeNull()
	expect(find(bodyweight, 'heaviestLoad')?.delta).toBeNull()
	// No headline anywhere says "Heaviest ever" about the athlete's own weight.
	expect(
		records.map(strengthRecordHeadline).filter((h) => h === 'Heaviest ever'),
	).toEqual(['Heaviest ever'])
	expect(strengthRecordHeadline(find(bodyweight, 'heaviestLoad')!)).toBe(
		'Heaviest bodyweight set',
	)
	// And an estimated 1RM is a bar reading: the model is never handed a kilo that
	// includes the athlete, because an anchor priced off it would prescribe a bar
	// weight the athlete has never touched.
	expect(find(bar, 'e1RM')).toBeDefined()
	expect(find(bodyweight, 'e1RM')).toBeUndefined()
})

test('every load kind is either partitioned or refused, and none defaults into the bar', () => {
	// The classification is the program engine's own (`loadKindComparability`), so
	// a ninth `LoadValue` member cannot arrive here as a bar weight by omission —
	// which is exactly how this defect survived. Asserted per member rather than
	// per reason, so the table is readable beside ADR 0056 §3's.
	const loads: Array<{ load: LoadValue; basis: RecordLoadBasis | null }> = [
		{ load: { kind: 'external', kg: 100 }, basis: 'bar' },
		{ load: { kind: 'perSide', kg: 30, sides: 2 }, basis: 'perHand' },
		{ load: { kind: 'bodyweight' }, basis: 'bodyweightDerived' },
		{
			load: { kind: 'bodyweightPlus', addedKg: 20 },
			basis: 'bodyweightDerived',
		},
		{ load: { kind: 'assisted', assistKg: 10 }, basis: null },
		{ load: { kind: 'stackLevel', level: 7 }, basis: 'stackLevel' },
		{ load: { kind: 'band', band: 'red' }, basis: null },
		{ load: { kind: 'unloaded' }, basis: null },
	]
	// Every member of the union is covered, so growing it fails this test.
	expect(loads.map((l) => l.load.kind).sort()).toEqual(
		[...LOAD_VALUE_KINDS].sort(),
	)
	for (const { load, basis } of loads) {
		const records = deriveStrengthRecords([
			set({ load, effectiveKg: 60, reps: 5 }),
		])
		if (basis == null) {
			expect(records).toEqual([])
		} else {
			expect(records.length).toBeGreaterThan(0)
			expect(new Set(records.map((r) => r.loadBasis))).toEqual(new Set([basis]))
		}
	}
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
	// And the headline says *per-hand*, because 60 kg here is two 30 kg dumbbells
	// and not a bar. The estimated 1RM is absent for the same reason: an estimate
	// is priced against a bar.
	expect(strengthRecordLabel(find(records, 'heaviestLoad')!)).toBe(
		'Heaviest per-hand set: 60 kg — first time! · Per-hand kilos — this progresses against other per-hand sets only.',
	)
	expect(find(records, 'e1RM')).toBeUndefined()
})

test('inside the debut window a record that beat an earlier session says best so far, never first time', () => {
	// The defect this closes: with a 20 kg × 5 session visible on the same page, a
	// 22.5 kg set read "first time!" — a flat contradiction of what the athlete
	// could see. The window still suppresses the PR shout; it no longer claims a
	// first time.
	const records = deriveStrengthRecords([
		barbell(20, { sessionId: 'first', performedAt: day(0), reps: 5 }),
		barbell(22.5, { sessionId: 'second', performedAt: day(2), reps: 5 }),
	])
	const heaviest = find(records, 'heaviestLoad')!
	expect(heaviest.debut).toBe(true)
	expect(strengthRecordLabel(heaviest)).toBe(
		'Heaviest ever: 22.5 kg — best so far',
	)
})

test('a reading with nothing before it still says first time, even after other readings have history', () => {
	// The first three-rep set of a lift the athlete has five-rep history on: "Best
	// 3-rep set — first time!" is true, and the heaviest-ever reading beside it is
	// not a first time and does not say so.
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(105, { sessionId: 'b', performedAt: day(7), reps: 3 }),
	])
	expect(strengthRecordLabel(find(records, 'repMax', 3)!)).toBe(
		'Best 3-rep set: 105 kg — first time!',
	)
	expect(strengthRecordLabel(find(records, 'heaviestLoad')!)).toBe(
		'Heaviest ever: 105 kg — best so far',
	)
})

test('the estimator is told how close to failure the set was, so a model may refuse a set nobody graded', () => {
	// An estimate off a set that was not near failure understates the maximum, so
	// the licence to estimate is the set's own statement about its effort. The
	// rule is the model's; this module only has to hand the fact over.
	const nearFailureOnly: OneRepMaxEstimator = ({
		weightKg,
		reps,
		rir,
		toFailure,
	}) =>
		toFailure || (rir != null && rir <= 2) ? weightKg * (1 + reps / 30) : null

	const unmarked = deriveStrengthRecords([barbell(100, { reps: 5 })], {
		oneRm: { name: 'epley', estimate: nearFailureOnly },
	})
	expect(find(unmarked, 'e1RM')).toBeUndefined()
	// And the observed readings are untouched: 100 kg was lifted either way.
	expect(find(unmarked, 'heaviestLoad')?.value).toBe(100)

	const marked = deriveStrengthRecords(
		[barbell(100, { reps: 5, toFailure: true })],
		{ oneRm: { name: 'epley', estimate: nearFailureOnly } },
	)
	expect(find(marked, 'e1RM')?.value).toBeCloseTo(116.67, 2)
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
	// Two decimals, because every kilo on every strength surface goes through the
	// one house rule (`formatKg`) — and 119.58 minus the 116.67 it beat is exactly
	// the 2.91 the gain claims.
	expect(strengthRecordLabel(find(records, 'e1RM')!)).toBe(
		'Best estimated 1RM: 119.58 kg (brzycki) — up 2.91 kg',
	)
})

test('a tested single is not labelled with an equation that was not applied', () => {
	// A one-rep set *is* the measurement: `one-rm.ts` names running an equation over
	// it as forbidden — Epley would report 103.3 kg from a 100 kg single — and the
	// server model duly passes a single through untouched. The record then named the
	// injected model anyway, so the strip printed "61.25 kg (epley)" about a kilo
	// Epley never saw: an equation credited with a lift.
	const passesSinglesThrough: OneRepMaxEstimator = ({ weightKg, reps }) =>
		reps === 1
			? weightKg
			: epley({ weightKg, reps, rir: null, toFailure: true })
	const records = deriveStrengthRecords(
		[barbell(61.25, { sessionId: 'a', performedAt: day(0), reps: 1 })],
		{ oneRm: { name: 'epley', estimate: passesSinglesThrough } },
	)
	const e1rm = find(records, 'e1RM')!
	expect(e1rm.value).toBe(61.25)
	expect(e1rm.oneRmProtocol).toBe('tested')
	// No equation was applied, so there is no equation to name.
	expect(e1rm.estimator).toBeNull()
	expect(strengthRecordLabel(e1rm)).toBe(
		'Best tested 1RM: 61.25 kg (the load lifted) — first time!',
	)

	// And the equation is still named where one was actually applied: the label
	// follows what happened to the winning set, not what the model is called.
	const fromFive = deriveStrengthRecords(
		[
			barbell(61.25, { sessionId: 'a', performedAt: day(0), reps: 1 }),
			barbell(100, { sessionId: 'b', performedAt: day(7), reps: 5 }),
		],
		{ oneRm: { name: 'epley', estimate: passesSinglesThrough } },
	)
	const estimated = find(fromFive, 'e1RM')!
	expect(estimated.oneRmProtocol).toBe('epley')
	expect(strengthRecordLabel(estimated)).toContain('116.67 kg (epley)')
	expect(strengthRecordLabel(estimated)).toContain('Best estimated 1RM')
})

test("a weight the athlete's plates can make is stated as it was stored, not rounded to one decimal", () => {
	// 61.25 kg is a bar the app's own plate solver loads and prints as
	// `61.25 kg` — 1.25 kg pairs are real. One decimal restated the same stored
	// number as `61.3 kg`, so one weight read two ways on one screen.
	const records = deriveStrengthRecords([
		barbell(40, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(61.25, { sessionId: 'b', performedAt: day(7), reps: 5 }),
	])
	const heaviest = strengthRecordLabel(find(records, 'heaviestLoad')!)
	expect(heaviest).toContain('61.25 kg')
	expect(heaviest).not.toContain('61.3')
	expect(strengthRecordLabel(find(records, 'repMax', 5)!)).toContain('61.25 kg')
})

test('a delta agrees with the two weights it is derived from', () => {
	// The gain is not rounded on its own: an Epley reading of 119.583… beating one
	// of 116.666… is up 2.916…, which rounds to `2.92` while the two weights
	// either side of it read 119.58 and 116.67 — a difference of 2.91. A gain that
	// does not subtract is the same defect as a weight nobody lifted.
	const records = deriveStrengthRecords(
		[
			barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
			barbell(100, { sessionId: 'b', performedAt: day(7), reps: 5 }),
			barbell(100, { sessionId: 'c', performedAt: day(14), reps: 5 }),
			barbell(102.5, { sessionId: 'd', performedAt: day(21), reps: 5 }),
		],
		{ oneRm: { name: 'epley', estimate: epley } },
	)
	const record = find(records, 'e1RM')!
	const label = strengthRecordLabel(record)
	const shown = numberIn(label, /1RM: ([\d.]+) kg/)
	const gain = numberIn(label, /up ([\d.]+) kg/)
	expect(shown - gain).toBeCloseTo(Number(formatKg(record.previousValue!)), 5)

	// And the plain case closes exactly, in whole 1.25 kg steps.
	const plates = deriveStrengthRecords([
		barbell(40, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		barbell(40, { sessionId: 'b', performedAt: day(7), reps: 5 }),
		barbell(40, { sessionId: 'c', performedAt: day(14), reps: 5 }),
		barbell(61.25, { sessionId: 'd', performedAt: day(21), reps: 5 }),
	])
	expect(strengthRecordLabel(find(plates, 'heaviestLoad')!)).toBe(
		'Heaviest ever: 61.25 kg — up 21.25 kg',
	)
})

/** The number a reading actually printed, read back out of the sentence. */
function numberIn(label: string, pattern: RegExp): number {
	const found = label.match(pattern)?.[1]
	expect(found).toBeDefined()
	return Number(found)
}

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

test('a timed bodyweight hold takes no record, because a hold is not a heaviest lift', () => {
	// The reported defect: a 45-second push-up hold announced "Heaviest ever:
	// 74 kg — first time!". The 74 kg is the athlete's baked bodyweight, so the
	// number is in the log — but the set's whole content is a duration, and a
	// heaviest-weight reading off it is the wrong reading.
	const records = deriveStrengthRecords(
		[
			set({
				exerciseId: 'push-up-hold',
				equipment: 'bodyweight',
				load: { kind: 'bodyweight' },
				effectiveKg: 74,
				reps: null,
			}),
		],
		{ oneRm: { name: 'epley', estimate: epley } },
	)

	expect(records).toEqual([])
})

test('a hold does not take a level record either, on a machine that has one', () => {
	const records = deriveStrengthRecords([
		set({
			exerciseId: 'cable-hold',
			equipment: 'machine',
			load: { kind: 'stackLevel', level: 7 },
			effectiveKg: null,
			reps: null,
		}),
	])

	expect(records).toEqual([])
})

test('a hold in the history does not suppress the records of the sets that did count reps', () => {
	// The gate drops the hold from the readings and nothing else: the rep sets on
	// the same variant still hold every record they held.
	const records = deriveStrengthRecords([
		barbell(100, { sessionId: 'a', performedAt: day(0), reps: 5 }),
		set({
			sessionId: 'b',
			performedAt: day(2),
			load: { kind: 'external', kg: 140 },
			effectiveKg: 140,
			reps: null,
		}),
		barbell(105, { sessionId: 'c', performedAt: day(4), reps: 5 }),
	])

	expect(find(records, 'heaviestLoad')?.value).toBe(105)
	expect(find(records, 'repMax', 5)?.value).toBe(105)
})
