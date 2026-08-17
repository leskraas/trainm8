import { expect, test } from 'vitest'
import { effectiveLoadKg } from '../strength-log.ts'
import { DEFAULT_BAR_KG } from './plates.constants.ts'
import {
	type PlateInventory,
	calculatePlates,
	plateLineText,
	roundToLoadable,
} from './plates.ts'

// A commercial rack: plenty of everything, `count` being pairs owned.
const commercialGym: PlateInventory = {
	bars: [
		{ label: 'Olympic', weightKg: 20 },
		{ label: "Women's", weightKg: 15 },
	],
	plates: [
		{ weightKg: 25, count: 4 },
		{ weightKg: 20, count: 4 },
		{ weightKg: 15, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 5, count: 2 },
		{ weightKg: 2.5, count: 2 },
		{ weightKg: 1.25, count: 2 },
	],
	fixedDumbbellsKg: null,
}

// A home rack with two 20s a side and nothing finer than 2.5.
const homeRack: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 20, count: 2 },
		{ weightKg: 10, count: 1 },
		{ weightKg: 5, count: 1 },
		{ weightKg: 2.5, count: 1 },
	],
	fixedDumbbellsKg: null,
}

// ——— The bar is part of the number ————————————————————————————————————————

test('a barbell load includes the bar, so 100 kg is 40 kg of plates a side', () => {
	const solved = calculatePlates(100, commercialGym)
	expect(solved.outcome).toBe('exact')
	if (solved.outcome === 'unavailable') return
	expect(solved.barKg).toBe(20)
	expect(solved.perSideKg).toBe(40)
	expect(solved.totalWeight).toBe(100)
})

test('the bar the athlete names beats the bar the inventory lists first', () => {
	const solved = calculatePlates(75, commercialGym, { barKg: 15 })
	if (solved.outcome === 'unavailable') throw new Error('expected a solution')
	expect(solved.barKg).toBe(15)
	expect(solved.perSideKg).toBe(30)
	expect(solved.totalWeight).toBe(75)
})

test('an inventory that lists no bars falls back to the stated 20 kg default', () => {
	const solved = calculatePlates(60, { ...commercialGym, bars: [] })
	if (solved.outcome === 'unavailable') throw new Error('expected a solution')
	expect(solved.barKg).toBe(DEFAULT_BAR_KG)
})

test('the empty bar is an exact answer with no plates on it', () => {
	const solved = calculatePlates(20, commercialGym)
	expect(solved).toMatchObject({
		outcome: 'exact',
		platesPerSide: [],
		perSideKg: 0,
		totalWeight: 20,
	})
})

test('a weight under the bar is the bar, and the gap says so', () => {
	const solved = calculatePlates(12, commercialGym)
	expect(solved).toMatchObject({
		outcome: 'nearest',
		totalWeight: 20,
		requestedKg: 12,
		gapKg: 8,
	})
})

// ——— A bounded inventory beats greedy descent ————————————————————————————

test('a bounded inventory beats greedy descent: 140 kg with only two 20s a side', () => {
	// Greedy takes 20 + 20 and is then stuck 20 kg short with nothing bigger
	// left. The rack can make it — 20 + 20 + 10 + 5 + 2.5 is 57.5, not 60 — so
	// the honest answer here is the nearest, and the point of the test is that a
	// greedy descent would have reported a *different* nearest.
	const solved = calculatePlates(140, homeRack)
	if (solved.outcome === 'unavailable') throw new Error('expected a solution')
	expect(solved.perSideKg).toBe(57.5)
	expect(solved.totalWeight).toBe(135)
	expect(solved.outcome).toBe('nearest')
})

test('a bounded inventory reaches a weight greedy descent cannot: 55 kg off two 15s', () => {
	// Greedy takes the 20 first and can then only reach 50 or 52.5. The pair of
	// 15s + a 2.5 makes 55 exactly, and only a bounded search finds it.
	const oddRack: PlateInventory = {
		bars: [{ weightKg: 20 }],
		plates: [
			{ weightKg: 20, count: 1 },
			{ weightKg: 15, count: 1 },
			{ weightKg: 2.5, count: 1 },
		],
		fixedDumbbellsKg: null,
	}
	const solved = calculatePlates(55, oddRack)
	expect(solved).toMatchObject({ outcome: 'exact', perSideKg: 17.5 })
})

test('a plate the gym owns one pair of is never used twice a side', () => {
	const solved = calculatePlates(100, homeRack)
	if (solved.outcome === 'unavailable') throw new Error('expected a solution')
	for (const plate of solved.platesPerSide) {
		const owned = homeRack.plates.find((p) => p.weightKg === plate.weightKg)!
		expect(plate.count).toBeLessThanOrEqual(owned.count)
	}
})

test('a single-horn machine takes plates one at a time, so a pair reaches twice as far', () => {
	// The same rack, loaded on one horn: both plates of a pair are usable, and
	// the smallest increment is one plate rather than two.
	const solved = calculatePlates(42.5, homeRack, {
		multiplier: 1,
		barKg: 0,
	})
	expect(solved).toMatchObject({ outcome: 'exact', totalWeight: 42.5 })
})

test('microplates beside 2.5s do not drift, even summed a dozen times', () => {
	const microRack: PlateInventory = {
		bars: [{ weightKg: 20 }],
		plates: [
			{ weightKg: 2.5, count: 6 },
			{ weightKg: 0.5, count: 6 },
		],
		fixedDumbbellsKg: null,
	}
	const solved = calculatePlates(56, microRack)
	expect(solved).toMatchObject({ outcome: 'exact', perSideKg: 18 })
})

// ——— Rounding is the solver run backwards ————————————————————————————————

test('round(w) is calculatePlates(w).totalWeight, for every weight in a long sweep', () => {
	for (let kg = 20; kg <= 200; kg += 0.5) {
		const solved = calculatePlates(kg, commercialGym)
		if (solved.outcome === 'unavailable') throw new Error('expected a solution')
		expect(roundToLoadable(kg, commercialGym)).toBe(solved.totalWeight)
	}
})

test('a rounded weight is always a weight the rack can make exactly', () => {
	for (let kg = 20; kg <= 200; kg += 0.5) {
		const rounded = roundToLoadable(kg, homeRack)!
		expect(calculatePlates(rounded, homeRack).outcome).toBe('exact')
	}
})

test('a rack that cannot make 102.5 kg says so rather than rounding silently', () => {
	const noFinePlates: PlateInventory = {
		bars: [{ weightKg: 20 }],
		plates: [
			{ weightKg: 20, count: 4 },
			{ weightKg: 10, count: 2 },
			{ weightKg: 5, count: 2 },
		],
		fixedDumbbellsKg: null,
	}
	const solved = calculatePlates(102.5, noFinePlates)
	expect(solved).toMatchObject({
		outcome: 'nearest',
		requestedKg: 102.5,
		totalWeight: 100,
		gapKg: -2.5,
	})
})

test('a rack with no plates at all is the bar and a gap, never an invented number', () => {
	const barOnly: PlateInventory = {
		bars: [{ weightKg: 20 }],
		plates: [],
		fixedDumbbellsKg: null,
	}
	expect(calculatePlates(60, barOnly)).toMatchObject({
		outcome: 'nearest',
		totalWeight: 20,
		gapKg: -40,
	})
})

// ——— The sign belongs to the equipment ———————————————————————————————————

test("an assisted machine's load is negative — 20 kg of help off an 80 kg athlete is 60 kg", () => {
	const solved = calculatePlates(20, commercialGym, {
		kind: 'assisted',
		bodyweightKg: 80,
		barKg: 0,
	})
	if (solved.outcome === 'unavailable') throw new Error('expected a solution')
	expect(solved.loadedKg).toBe(-20)
	expect(solved.totalWeight).toBe(60)
	// And it agrees with the union's own kilo function, which is the one place
	// this sign is allowed to be decided.
	expect(solved.totalWeight).toBe(
		effectiveLoadKg({ kind: 'assisted', assistKg: 20 }, 80),
	)
})

test('an assist heavier than the athlete is refused, exactly as the kilo function refuses it', () => {
	expect(
		calculatePlates(90, commercialGym, {
			kind: 'assisted',
			bodyweightKg: 80,
			barKg: 0,
		}),
	).toMatchObject({
		outcome: 'unavailable',
		reason: 'assist-exceeds-bodyweight',
	})
})

test('a bodyweight-derived load loads the plates and counts the athlete as the bar', () => {
	const solved = calculatePlates(21.25, commercialGym, {
		kind: 'bodyweightPlus',
		bodyweightKg: 80,
	})
	if (solved.outcome === 'unavailable') throw new Error('expected a solution')
	expect(solved.barKg).toBe(80)
	expect(solved.loadedKg).toBe(21.25)
	expect(solved.totalWeight).toBe(101.25)
})

test('a bodyweight-derived load with no bodyweight on file refuses rather than loading the belt alone', () => {
	expect(
		calculatePlates(20, commercialGym, {
			kind: 'bodyweightPlus',
			bodyweightKg: null,
		}),
	).toMatchObject({ outcome: 'unavailable', reason: 'no-bodyweight-on-file' })
})

// ——— Per hand is per hand ————————————————————————————————————————————————

test('a dumbbell rack answers per hand, and the total is both hands', () => {
	const withRack: PlateInventory = {
		...commercialGym,
		fixedDumbbellsKg: [10, 12.5, 15, 20, 25, 30],
	}
	const solved = calculatePlates(20, withRack, { kind: 'perSide' })
	if (solved.outcome === 'unavailable') throw new Error('expected a solution')
	expect(solved.perSideKg).toBe(20)
	expect(solved.totalWeight).toBe(40)
	expect(solved.platesPerSide).toEqual([])
})

test('a dumbbell rack takes the largest bell at or under the target, and states the gap', () => {
	const withRack: PlateInventory = {
		...commercialGym,
		fixedDumbbellsKg: [10, 12.5, 15, 20, 25, 30],
	}
	expect(calculatePlates(22, withRack, { kind: 'perSide' })).toMatchObject({
		outcome: 'nearest',
		perSideKg: 20,
		gapKg: -2,
	})
})

test('a target under the lightest bell falls back to the lightest and says how far off it is', () => {
	const withRack: PlateInventory = {
		...commercialGym,
		fixedDumbbellsKg: [10, 12.5, 15],
	}
	expect(calculatePlates(6, withRack, { kind: 'perSide' })).toMatchObject({
		outcome: 'nearest',
		perSideKg: 10,
		gapKg: 4,
	})
})

test('a gym with no dumbbell rack stated refuses rather than inventing a bell', () => {
	// NULL means "no rack stated", which is not the same as a rack with nothing
	// in it, and neither is a loadable dumbbell whose handle this app does not
	// model.
	expect(calculatePlates(20, commercialGym, { kind: 'perSide' })).toMatchObject(
		{ outcome: 'unavailable', reason: 'no-dumbbell-rack-stated' },
	)
})

// ——— Loads with no honest kilo ————————————————————————————————————————————

test('a stack level, a band and an unloaded hold have no plates and no honest kilo', () => {
	expect(calculatePlates(7, commercialGym, { kind: 'stackLevel' })).toEqual({
		outcome: 'unavailable',
		reason: 'stack-level-is-an-ordinal',
		explanation: expect.any(String),
	})
	expect(calculatePlates(0, commercialGym, { kind: 'band' })).toMatchObject({
		outcome: 'unavailable',
		reason: 'band-is-a-force-curve',
	})
	expect(calculatePlates(0, commercialGym, { kind: 'unloaded' })).toMatchObject(
		{ outcome: 'unavailable', reason: 'unloaded-has-no-external-load' },
	)
})

test('every refusal refuses exactly where the kilo function refuses', () => {
	for (const kind of ['stackLevel', 'band', 'unloaded'] as const) {
		const solved = calculatePlates(1, commercialGym, {
			kind,
			bodyweightKg: 80,
		})
		expect(solved.outcome).toBe('unavailable')
	}
	// bodyweight-only is the mirror image: no plates, but a real kilo.
	expect(
		calculatePlates(0, commercialGym, {
			kind: 'bodyweight',
			bodyweightKg: 80,
		}),
	).toMatchObject({ outcome: 'exact', platesPerSide: [], totalWeight: 80 })
})

test('rounding refuses where the solver refuses, rather than returning zero', () => {
	expect(roundToLoadable(7, commercialGym, { kind: 'band' })).toBeNull()
})

// ——— The passive annotation under the weight input ————————————————————————

test('the plate line reads heaviest first, as the athlete loads it', () => {
	// Of the compositions that make 41.25 a side with three plates, the one that
	// starts heaviest is the one a lifter actually loads.
	const solved = calculatePlates(102.5, commercialGym)
	expect(plateLineText(solved)).toBe('25 · 15 · 1.25')
})

test('the plate line for an empty bar says empty bar rather than an empty string', () => {
	expect(plateLineText(calculatePlates(20, commercialGym))).toBe('empty bar')
})

test('the plate line for a refused load is a dash, never a fabricated kilo', () => {
	expect(
		plateLineText(calculatePlates(7, commercialGym, { kind: 'band' })),
	).toBe('—')
})
