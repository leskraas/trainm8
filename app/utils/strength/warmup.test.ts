import { expect, test } from 'vitest'
import {
	WARMUP_EMPTY_BAR_SETS,
	WARMUP_PUBLISHED_EXAMPLE_LB,
	WARMUP_REPS,
} from './plates.constants.ts'
import { type PlateInventory, calculatePlates } from './plates.ts'
import { warmupRamp } from './warmup.ts'

const KG_PER_LB = 0.45359237

const kgGym: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 25, count: 2 },
		{ weightKg: 20, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 5, count: 2 },
		{ weightKg: 2.5, count: 2 },
		{ weightKg: 1.25, count: 2 },
	],
	fixedDumbbellsKg: null,
}

// The vendor's own gym: pounds, so the published example can be checked in the
// units it was published in.
const lbGym: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 45 * KG_PER_LB }],
	plates: [45, 25, 10, 5, 2.5].map((lb) => ({
		weightKg: lb * KG_PER_LB,
		count: 4,
	})),
	fixedDumbbellsKg: null,
}

function loads(ramp: ReturnType<typeof warmupRamp>): number[] {
	if (ramp.outcome === 'unavailable') throw new Error('expected a ramp')
	return ramp.sets.map((set) => set.loadKg)
}

// ——— The published shape ——————————————————————————————————————————————————

test("the ramp reproduces the vendor's published 225 lb example to within one small plate", () => {
	const { workWeight, barWeight, rungsAboveBar } = WARMUP_PUBLISHED_EXAMPLE_LB
	const ramp = warmupRamp(workWeight * KG_PER_LB, { inventory: lbGym })
	if (ramp.outcome === 'unavailable') throw new Error('expected a ramp')

	const inLb = ramp.sets.map((set) => set.loadKg / KG_PER_LB)
	// Two empty-bar sets, then exactly as many rungs as the vendor published.
	expect(inLb).toHaveLength(WARMUP_EMPTY_BAR_SETS + rungsAboveBar.length)
	expect(inLb.slice(0, WARMUP_EMPTY_BAR_SETS).map(Math.round)).toEqual([
		barWeight,
		barWeight,
	])
	// The rungs land on the vendor's, within a 5 lb plate: the published numbers
	// come from a plate-aligned ramp on a lb rack, and the cap the vendor states
	// is violated by its own example, so exact equality would be a coincidence
	// dressed up as a rule.
	rungsAboveBar.forEach((published, index) => {
		const rung = Math.round(inLb[WARMUP_EMPTY_BAR_SETS + index]!)
		expect(Math.abs(rung - published)).toBeLessThanOrEqual(5)
	})
})

test('every warm-up set is five reps, as the program states', () => {
	const ramp = warmupRamp(100, { inventory: kgGym })
	if (ramp.outcome === 'unavailable') throw new Error('expected a ramp')
	for (const set of ramp.sets) expect(set.reps).toBe(WARMUP_REPS)
})

test('every warm-up set is marked a warm-up, which is what keeps it out of every aggregate', () => {
	const ramp = warmupRamp(100, { inventory: kgGym })
	if (ramp.outcome === 'unavailable') throw new Error('expected a ramp')
	for (const set of ramp.sets) expect(set.role).toBe('warmup')
	expect(ramp.sets.map((s) => s.orderIndex)).toEqual(
		ramp.sets.map((_, index) => index),
	)
})

// ——— Where it starts and where it stops ———————————————————————————————————

test('the ramp always starts at the empty bar, twice', () => {
	for (const workKg of [40, 60, 82.5, 100, 140]) {
		const ladder = loads(warmupRamp(workKg, { inventory: kgGym }))
		expect(ladder.slice(0, WARMUP_EMPTY_BAR_SETS)).toEqual([20, 20])
	}
})

test('the ramp always ends below the work weight, so the first hard set is the work set', () => {
	for (const workKg of [40, 55, 60, 82.5, 100, 137.5, 180]) {
		for (const load of loads(warmupRamp(workKg, { inventory: kgGym }))) {
			expect(load).toBeLessThan(workKg)
		}
	}
})

test('the ramp climbs — no rung ever repeats or steps back down', () => {
	for (const workKg of [45, 62.5, 100, 155]) {
		const ladder = loads(warmupRamp(workKg, { inventory: kgGym })).slice(
			WARMUP_EMPTY_BAR_SETS - 1,
		)
		for (let i = 1; i < ladder.length; i++) {
			expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!)
		}
	}
})

// ——— Every rung is a weight this gym can actually make ————————————————————

test('every rung is loadable on the athlete’s own inventory', () => {
	const coarseRack: PlateInventory = {
		bars: [{ weightKg: 20 }],
		plates: [
			{ weightKg: 20, count: 2 },
			{ weightKg: 10, count: 1 },
		],
		fixedDumbbellsKg: null,
	}
	for (const workKg of [60, 80, 100, 120]) {
		for (const load of loads(warmupRamp(workKg, { inventory: coarseRack }))) {
			expect(calculatePlates(load, coarseRack).outcome).toBe('exact')
		}
	}
})

test('a rack too coarse for a rung drops the rung rather than repeating a weight', () => {
	// Only 20s: the ramp can step 20 → 60 → 100 and nothing between, so a ladder
	// that wanted four rungs gets the two the rack can make.
	const twentiesOnly: PlateInventory = {
		bars: [{ weightKg: 20 }],
		plates: [{ weightKg: 20, count: 4 }],
		fixedDumbbellsKg: null,
	}
	const ladder = loads(warmupRamp(140, { inventory: twentiesOnly }))
	expect(new Set(ladder).size).toBe(ladder.length - (WARMUP_EMPTY_BAR_SETS - 1))
	expect(ladder).toEqual([20, 20, 60, 100])
})

// ——— The set count scales with the work weight ————————————————————————————

test('a heavier work weight gets more warm-up sets, and the lifter never enters into it', () => {
	const rungCount = (workKg: number) =>
		loads(warmupRamp(workKg, { inventory: kgGym })).length
	const ladders = [30, 60, 100, 140, 180].map(rungCount)
	for (let i = 1; i < ladders.length; i++) {
		expect(ladders[i]!).toBeGreaterThanOrEqual(ladders[i - 1]!)
	}
	expect(ladders.at(-1)!).toBeGreaterThan(ladders[0]!)
})

test('a work weight just above the bar is two empty-bar sets and nothing else', () => {
	expect(loads(warmupRamp(25, { inventory: kgGym }))).toEqual([20, 20])
})

test('a work weight at or below the bar has nothing to ramp and says so', () => {
	expect(warmupRamp(20, { inventory: kgGym })).toMatchObject({
		outcome: 'unavailable',
		reason: 'work-weight-is-not-above-the-bar',
	})
	expect(warmupRamp(15, { inventory: kgGym })).toMatchObject({
		outcome: 'unavailable',
	})
})

// ——— Loads with no kilos have no ramp ————————————————————————————————————

test('a stack level and a band have no kilos, so they have no ramp either', () => {
	expect(warmupRamp(7, { inventory: kgGym, kind: 'stackLevel' })).toMatchObject(
		{
			outcome: 'unavailable',
			reason: 'stack-level-is-an-ordinal',
		},
	)
	expect(warmupRamp(1, { inventory: kgGym, kind: 'band' })).toMatchObject({
		outcome: 'unavailable',
		reason: 'band-is-a-force-curve',
	})
})

test('a weighted dip ramps from the athlete’s own bodyweight upward', () => {
	const ramp = warmupRamp(40, {
		inventory: kgGym,
		kind: 'bodyweightPlus',
		bodyweightKg: 80,
	})
	if (ramp.outcome === 'unavailable') throw new Error('expected a ramp')
	// The "empty bar" of a weighted dip is the athlete: the first two sets carry
	// no plates at all.
	expect(
		ramp.sets.slice(0, WARMUP_EMPTY_BAR_SETS).map((s) => s.addedKg),
	).toEqual([0, 0])
	expect(ramp.sets.map((s) => s.loadKg)).toEqual(
		ramp.sets.map((s) => 80 + s.addedKg),
	)
	expect(ramp.sets.at(-1)!.addedKg).toBeLessThan(40)
})

test('a weighted dip with no bodyweight on file refuses rather than ramping from zero', () => {
	expect(
		warmupRamp(40, {
			inventory: kgGym,
			kind: 'bodyweightPlus',
			bodyweightKg: null,
		}),
	).toMatchObject({ outcome: 'unavailable', reason: 'no-bodyweight-on-file' })
})

test('a dumbbell and an assisted machine have no published ramp, and none is invented', () => {
	expect(
		warmupRamp(20, {
			inventory: { ...kgGym, fixedDumbbellsKg: [10, 15, 20] },
			kind: 'perSide',
		}),
	).toMatchObject({
		outcome: 'unavailable',
		reason: 'no-published-ramp-for-this-load-kind',
	})
	expect(
		warmupRamp(20, { inventory: kgGym, kind: 'assisted', bodyweightKg: 80 }),
	).toMatchObject({ reason: 'no-published-ramp-for-this-load-kind' })
})
