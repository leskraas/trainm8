/**
 * **The plate calculator** — what actually goes on the bar to make a number, on
 * *this* athlete's rack.
 *
 * The maths is trivial and the model is not (`docs/specs/strength-module.md`,
 * Slice 5). Four things a naive version gets wrong, each of which is silent until
 * it corrupts a record:
 *
 * 1. **A bounded inventory, not a greedy descent.** `count` is pairs the gym
 *    owns, and greedy fails at 140 kg with only two 20s a side. This is a bounded
 *    subset-sum over **integers** — 2.5 kg plates beside a 0.5 kg
 *    microplate are exactly what breaks float accumulation.
 * 2. **`round(w)` is defined as `calculatePlates(w).achievedKg`** ({@link
 *    roundToLoadable} is one line and calls the solver). Rounding *is* the plate
 *    solver run backwards, which is what makes a percentage-derived load always
 *    a loadable load — and what makes it impossible for the two to disagree.
 *    `achievedKg` and not `totalWeight`: a rounder answers in the unit it was
 *    asked in, and `totalWeight` is bodyweight-inclusive for three of the kinds.
 * 3. **The sign is a property of the equipment.** On an assisted machine more
 *    "weight" is *less* work, so its plates load a negative number.
 * 4. **A rack that cannot make the number says so.** It answers with the nearest
 *    weight the gym can actually make and states the gap, and it never quietly
 *    reports a weight nobody can load.
 *
 * And where there is no honest kilo there is no answer: a machine stack level is
 * an ordinal, a band is a force curve, an unloaded hold has no external load.
 * All three refuse — ADR 0008's Unavailable Metric principle, as ADR 0056 §3
 * applies it to load. Inventing a kilo so a plate line can stay populated is the
 * fabrication this repo forbids.
 *
 * Pure: no clock, no random source, no `prisma`, and nothing here mutates its
 * arguments. The eight-member load union is {@link LoadValue}'s, imported rather
 * than restated.
 */
import { z } from 'zod'
import { formatKg, type LoadValueKind } from '../strength-log.ts'
import {
	BARBELL_MULTIPLIER,
	DEFAULT_BAR_KG,
	LOAD_SCALE,
	SINGLE_HORN_MULTIPLIER,
} from './plates.constants.ts'

// ——— The gym ——————————————————————————————————————————————————————————————

/**
 * A **Plate Inventory** as the pure layer sees it — the JSON columns of
 * `PlateInventory` parsed, and nothing else. Without one the calculator is a lie
 * about what the gym owns, which is why ADR 0056 recorded it as not built.
 */
export const PlateInventorySchema = z.object({
	/** 20 kg Olympic, 15 kg women's bar, a trap bar. Empty = none stated. */
	bars: z
		.array(
			z.object({
				label: z.string().max(40).optional(),
				weightKg: z.number().positive(),
			}),
		)
		.default([]),
	/** `count` is **pairs owned**, which is the whole point of the entity. */
	plates: z
		.array(
			z.object({
				weightKg: z.number().positive(),
				count: z.number().int().nonnegative(),
			}),
		)
		.default([]),
	/**
	 * The fixed-dumbbell rack, where the gym has one. `null` is **no rack
	 * stated**, which is not the same as a rack with nothing in it — the first
	 * refuses, the second is an empty rack that can make nothing.
	 */
	fixedDumbbellsKg: z.array(z.number().positive()).nullable().default(null),
})
export type PlateInventory = z.infer<typeof PlateInventorySchema>

/**
 * What the *movement* does to the arithmetic — the Load Semantics an **Exercise
 * Variant** declares, in the only three numbers the solver needs.
 */
export type PlateOptions = {
	/** Which member of the load union this is. Defaults to `external`. */
	kind?: LoadValueKind
	/**
	 * How many plates a load consumes at a time: 2 for a barbell, 1 for a
	 * single-horn machine or a dip belt. Defaults per {@link kind}.
	 */
	multiplier?: number
	/** The bar in use. Defaults to the inventory's first bar, else 20 kg. */
	barKg?: number
	/** The athlete's bodyweight **now**, for the loads that resolve against it. */
	bodyweightKg?: number | null
}

// ——— The answer ———————————————————————————————————————————————————————————

/** One plate weight and how many of it go on **one** side. */
export type PlateCount = { weightKg: number; count: number }

/**
 * Why there is no plate line. Each member is a stated reason rather than an
 * absence, so a surface can say which one it is in one phrase.
 */
export const PLATE_REFUSALS = [
	/** A stack "7" is an ordinal with no mass behind it (ADR 0056 §3). */
	'stack-level-is-an-ordinal',
	/** A non-linear force curve; any kg conversion is fabricated. */
	'band-is-a-force-curve',
	/** A jump, an unloaded hold: no external load and no bodyweight claim. */
	'unloaded-has-no-external-load',
	/** A bodyweight-derived load with nothing on file to add to or subtract from. */
	'no-bodyweight-on-file',
	/** An assist heavier than the athlete is a number that cannot be true. */
	'assist-exceeds-bodyweight',
	/** `fixedDumbbellsKg` is NULL: this gym has not said what bells it has. */
	'no-dumbbell-rack-stated',
	/** A rack stated as empty can make nothing at all. */
	'dumbbell-rack-is-empty',
] as const
export type PlateRefusal = (typeof PLATE_REFUSALS)[number]

/**
 * What the rack can make of a target.
 *
 * `exact` and `nearest` carry the same fields on purpose — a caller that only
 * wants the number reads it without branching, and a caller that owes the athlete
 * the truth about the gap branches on `outcome`.
 *
 * **Two kilos, and which one a caller wants is almost always `achievedKg`.**
 * `requestedKg`, `achievedKg` and `gapKg` are one triple in the load's *own*
 * semantics — the unit the caller asked in, per hand for a dumbbell, kilos of help
 * on an assisted machine, kilos on the belt for a weighted dip. `totalWeight` is a
 * *different quantity*: the bodyweight-inclusive, sides-summed effective load.
 * They coincide for `external` and only for `external`, which is why every
 * boundary crossing found in this module's callers was invisible until a
 * bodyweight lift reached it.
 */
export type PlateSolution =
	| {
			outcome: 'exact' | 'nearest'
			/** Heaviest first, as the athlete loads it. Per side. */
			platesPerSide: PlateCount[]
			/** The plate mass on one side; the chosen bell for a fixed rack. */
			perSideKg: number
			/** The bar — or the athlete, for a bodyweight-derived load. */
			barKg: number
			/** What the plates contribute, **signed**: negative when assisting. */
			loadedKg: number
			/**
			 * The kilos this load actually is, as `effectiveLoadKg` reports them —
			 * **bodyweight-inclusive** for the three kinds that resolve against the
			 * athlete, and **doubled** for a per-hand bell.
			 *
			 * ⚠ This is *not* the quantity the caller asked in. Quoting it back to an
			 * athlete who typed a dip belt's `+31` prints `105.25`, and rounding with
			 * it writes the athlete's bodyweight into a working weight. Read
			 * {@link PlateSolution.achievedKg} for the caller's own quantity.
			 */
			totalWeight: number
			/** The number asked for, in the load's own semantics. */
			requestedKg: number
			/**
			 * **What the rack made, in the same quantity and unit as
			 * {@link PlateSolution.requestedKg}** — the belt's kilos for a weighted
			 * dip, the kilos of help on an assist stack, the bell per hand, the whole
			 * bar for a barbell. This is the number `gapKg` is measured in
			 * (`gapKg === achievedKg − requestedKg`), so it is the only one a gap
			 * sentence or a rounder may quote.
			 *
			 * `null` for `bodyweight`, and only for `bodyweight`: that Load Value
			 * carries **no number at all** (ADR 0056 §3), so there is nothing the rack
			 * made and nothing to round. A `bodyweight` solve is still `exact` — the
			 * athlete's own kilos are honest and live in `totalWeight`.
			 */
			achievedKg: number | null
			/** Achieved − requested, in the load's own semantics. 0 when exact. */
			gapKg: number
	  }
	| { outcome: 'unavailable'; reason: PlateRefusal; explanation: string }

const REFUSAL_TEXT: Record<PlateRefusal, string> = {
	'stack-level-is-an-ordinal':
		'A stack level has no kilos — this progresses against itself only.',
	'band-is-a-force-curve':
		'A band has no kilos — its force changes through the range.',
	'unloaded-has-no-external-load': 'This movement carries no external load.',
	'no-bodyweight-on-file':
		'No bodyweight on file, so this load has nothing to resolve against.',
	'assist-exceeds-bodyweight':
		'That is more help than the athlete weighs, which cannot be a load.',
	'no-dumbbell-rack-stated':
		'This gym has not said which dumbbells it has, so there is no bell to pick.',
	'dumbbell-rack-is-empty': 'This gym’s dumbbell rack is stated as empty.',
}

function refuse(reason: PlateRefusal): PlateSolution {
	return { outcome: 'unavailable', reason, explanation: REFUSAL_TEXT[reason] }
}

// ——— The solver ———————————————————————————————————————————————————————————

/**
 * What goes on the bar to make `kg`, on this rack.
 *
 * `kg` is read in the load's **own** semantics, matching the {@link LoadValue}
 * member named in `options.kind`: a barbell total including the bar, a dumbbell
 * *per hand*, the added kilos of a weighted dip, the kilos of *help* on an
 * assisted machine.
 */
export function calculatePlates(
	kg: number,
	inventory: PlateInventory,
	options: PlateOptions = {},
): PlateSolution {
	const kind = options.kind ?? 'external'
	const bodyweightKg = options.bodyweightKg ?? null

	// The three loads with no honest kilo, refused before any arithmetic runs.
	if (kind === 'stackLevel') return refuse('stack-level-is-an-ordinal')
	if (kind === 'band') return refuse('band-is-a-force-curve')
	if (kind === 'unloaded') return refuse('unloaded-has-no-external-load')

	// Bodyweight-derived loads resolve against the athlete or not at all.
	if (
		(kind === 'bodyweight' ||
			kind === 'bodyweightPlus' ||
			kind === 'assisted') &&
		bodyweightKg == null
	) {
		return refuse('no-bodyweight-on-file')
	}

	if (kind === 'bodyweight') {
		// Nothing to load: the load is the athlete. An exact answer with no plates
		// is not the same as a refusal, and conflating them would hide a real kilo.
		return {
			outcome: 'exact',
			platesPerSide: [],
			perSideKg: 0,
			barKg: bodyweightKg!,
			loadedKg: 0,
			totalWeight: bodyweightKg!,
			requestedKg: kg,
			// **No number of its own.** A `bodyweight` Load Value has no kilo field,
			// so `kg` here is whatever the caller happened to pass and the rack made
			// none of it. Reporting the athlete's weight as "achieved" is the
			// crossing that let `roundToLoadable` answer 22.5 with 74.
			achievedKg: null,
			gapKg: 0,
		}
	}

	if (kind === 'perSide') return solveFixedBell(kg, inventory)

	const multiplier = options.multiplier ?? defaultMultiplier(kind)
	const barKg =
		options.barKg ??
		(kind === 'assisted'
			? 0
			: kind === 'bodyweightPlus'
				? 0
				: (inventory.bars[0]?.weightKg ?? DEFAULT_BAR_KG))

	// The plate mass one side has to carry. A barbell number includes its bar; an
	// assist and a dip belt are the plate mass itself, so their "bar" is zero and
	// the athlete's own weight enters as `base` below.
	const targetUnits = Math.max(
		0,
		Math.round(((kg - barKg) * LOAD_SCALE) / multiplier),
	)
	const solved = solvePerSide(targetUnits, inventory.plates, multiplier)

	const perSideKg = fromUnits(solved.sumUnits)
	const signedLoaded = kind === 'assisted' ? -1 : 1
	const loadedKg = fromUnits(solved.sumUnits * multiplier * signedLoaded)
	// The athlete is the base for the bodyweight-derived loads; the bar is the
	// base for everything else. One code path, per the brief's
	// `useBodyweightForBar`.
	const base = kind === 'external' ? barKg : (bodyweightKg ?? barKg)
	const totalWeight = roundToScale(base + loadedKg)

	if (kind === 'assisted' && totalWeight <= 0) {
		return refuse('assist-exceeds-bodyweight')
	}

	// In the load's own semantics, "achieved" is the plate mass for the loads that
	// are quoted as plate mass, and the whole bar for a barbell.
	const achievedKg =
		kind === 'external' ? totalWeight : fromUnits(solved.sumUnits * multiplier)
	const gapKg = roundToScale(achievedKg - kg)

	return {
		outcome: gapKg === 0 ? 'exact' : 'nearest',
		platesPerSide: solved.counts,
		perSideKg,
		barKg: kind === 'external' ? barKg : (bodyweightKg ?? barKg),
		loadedKg,
		totalWeight,
		requestedKg: kg,
		achievedKg,
		gapKg,
	}
}

/**
 * **Which load kinds a plate line can be drawn for at all.**
 *
 * The five kinds a surface must not draw one for, each for its own reason: a
 * stack level is an ordinal, a band is a force curve, an unloaded hold has no
 * external load — and `bodyweight` has an honest kilo but *nothing on plates*, so
 * a plate line there would be a line about the athlete rather than about the
 * rack. `bodyweight` is why this is not simply "has an honest kilo": the solver
 * answers it exactly, and a caller drawing plates from that answer prints
 * *"empty bar"* under a set that never had a bar.
 */
export function hasPlateSolve(kind: LoadValueKind): boolean {
	return (
		kind !== 'stackLevel' &&
		kind !== 'band' &&
		kind !== 'unloaded' &&
		kind !== 'bodyweight'
	)
}

/**
 * **The solver options for the kind the athlete is actually loading with**, given
 * whatever the exercise variant declares — or `null` where there is nothing to
 * solve ({@link hasPlateSolve}).
 *
 * This exists because a variant's `barKg` and `multiplier` are **geometry that
 * belongs to its own kind**, and spreading them into a solve for a *different*
 * kind is how the log surface came to answer a dip belt with a 20 kg bar and a
 * pair of plates: a `bodyweightPlus` +30 solved as a barbell total reported the
 * athlete's 84 kg against the 30 they had typed, and an assisted set reported the
 * bodyweight with no assist at all. Both numbers contradicted the kilo the row
 * itself had stored.
 *
 * So the geometry travels only while the kind still agrees. `bodyweightKg` always
 * travels — it is a fact about the athlete, not about the implement — and every
 * other number falls back to the per-kind default {@link calculatePlates} states:
 * no bar and one plate at a time for a dip belt or an assist stack, the
 * inventory's bar and pairs for a barbell.
 */
export function plateOptionsForKind(
	kind: LoadValueKind,
	variant: PlateOptions = {},
): PlateOptions | null {
	if (!hasPlateSolve(kind)) return null
	const geometryApplies = variant.kind === kind
	return {
		kind,
		...(variant.bodyweightKg != null
			? { bodyweightKg: variant.bodyweightKg }
			: {}),
		...(geometryApplies && variant.multiplier != null
			? { multiplier: variant.multiplier }
			: {}),
		...(geometryApplies && variant.barKg != null
			? { barKg: variant.barKg }
			: {}),
	}
}

/**
 * **`round(w)`** — the plate solver run backwards. The nearest weight this rack
 * can actually make **in the unit the caller asked in**, or `null` where there is
 * no such weight.
 *
 * Deliberately not its own arithmetic: a second rounding rule beside the solver
 * is a rule that can disagree with it, and then a percentage-derived load lands
 * on a weight nobody can put on a bar.
 *
 * **A rounder returns the quantity it was handed.** This read `totalWeight`, and
 * `totalWeight` is bodyweight-inclusive for three of the eight kinds — so
 * rounding a weighted dip's `22.5` on a 74 kg athlete returned `96.5`, rounding
 * an assist returned `51.5`, and rounding *anything* on a `bodyweight` lift
 * returned `74`. Its caller is `strength-program.server.ts`'s `LoadableRounder`,
 * whose answer is written straight to `currentWorkingWeightKg` and appended to
 * `weightHistory`: an added load in, a bodyweight-inclusive total stored. Latent
 * only because all three seeded programs are barbell.
 *
 * So it reads {@link PlateSolution.achievedKg}, which is `requestedKg`'s own
 * quantity by construction. Per kind:
 *
 * - `external` — the whole bar, bar included. Unchanged.
 * - `bodyweightPlus` — the kilos **on the belt**, never the athlete plus the belt.
 * - `assisted` — the kilos of **help**, positive, never the net effective load.
 * - `perSide` — the bell **per hand**, never the doubled figure.
 * - `bodyweight` — **refuses.** A bodyweight Load Value carries no number, so
 *   there is nothing to round; `null` tells the engine to leave the number alone.
 * - `stackLevel`, `band`, `unloaded` — refuse, as they always did: an ordinal and
 *   a force curve are not kilos (ADR 0056 §3, ADR 0008).
 */
export function roundToLoadable(
	kg: number,
	inventory: PlateInventory,
	options: PlateOptions = {},
): number | null {
	const solved = calculatePlates(kg, inventory, options)
	return solved.outcome === 'unavailable' ? null : solved.achievedKg
}

/**
 * The plate line as the phone shows it — `20 · 20 · 10 · 2.5` under the weight
 * input, muted, updating as you type. A passive annotation, never a screen, and
 * never a sentence.
 */
export function plateLineText(solution: PlateSolution): string {
	if (solution.outcome === 'unavailable') return '—'
	if (solution.platesPerSide.length === 0) {
		return solution.perSideKg > 0
			? `${formatKg(solution.perSideKg)}`
			: 'empty bar'
	}
	return solution.platesPerSide
		.flatMap((plate) =>
			Array.from({ length: plate.count }, () => plate.weightKg),
		)
		.map(formatKg)
		.join(' · ')
}

// ——— A dumbbell rack is a pick, not a solve ——————————————————————————————

/**
 * A fixed rack is "largest bell at or under the target, else the lightest" —
 * and it says how far off it landed. Emitting an unloadable 22 kg because the
 * rack jumps 20 → 25 is exactly the silent lie the gap exists to prevent.
 */
function solveFixedBell(kg: number, inventory: PlateInventory): PlateSolution {
	const rack = inventory.fixedDumbbellsKg
	if (rack == null) return refuse('no-dumbbell-rack-stated')
	if (rack.length === 0) return refuse('dumbbell-rack-is-empty')

	const sorted = [...rack].sort((a, b) => b - a)
	const chosen = sorted.find((bell) => bell <= kg + 1e-9) ?? sorted.at(-1)!
	const gapKg = roundToScale(chosen - kg)
	return {
		outcome: gapKg === 0 ? 'exact' : 'nearest',
		// A bell has no plates on it, which is different from having none to spare.
		platesPerSide: [],
		perSideKg: chosen,
		barKg: 0,
		loadedKg: roundToScale(chosen * 2),
		// Per hand, doubled — the trap `perSide` exists for (ADR 0056 §3).
		totalWeight: roundToScale(chosen * 2),
		requestedKg: kg,
		// **Per hand**, because that is the unit `kg` arrived in. The doubled figure
		// is `totalWeight` and a rack that jumps 20 → 25 must not answer a request
		// for 22 with 40.
		achievedKg: chosen,
		gapKg,
	}
}

// ——— The bounded subset-sum ———————————————————————————————————————————————

function defaultMultiplier(kind: LoadValueKind): number {
	// A dip belt and an assist stack take one plate at a time; a bar takes a pair.
	return kind === 'bodyweightPlus' || kind === 'assisted'
		? SINGLE_HORN_MULTIPLIER
		: BARBELL_MULTIPLIER
}

/**
 * The bounded knapsack the brief specifies, over integers at {@link LOAD_SCALE}.
 *
 * Bounded because `count` is real: a gym with two 20s a side cannot pretend to a
 * third, and a greedy descent that takes the heaviest plate first strands itself
 * at weights this rack can genuinely make. Ties in distance go to the **lighter**
 * weight — never round a lifter up into a weight they did not ask for — and ties
 * in weight go to the composition with the fewest plates, then to the one that
 * puts the heaviest plates on first, which is how a lifter loads a bar.
 */
function solvePerSide(
	targetUnits: number,
	plates: PlateInventory['plates'],
	multiplier: number,
): { sumUnits: number; counts: PlateCount[] } {
	const types = plates
		.filter((p) => p.count > 0)
		.map((p) => ({
			/** The plate's weight as an integer at {@link LOAD_SCALE}. */
			scaled: Math.round(p.weightKg * LOAD_SCALE),
			weightKg: p.weightKg,
			// `count` is pairs, so a pair is two plates: a bar consumes them two at
			// a time and a single horn can use both.
			available: Math.floor((p.count * 2) / multiplier),
		}))
		.filter((p) => p.available > 0 && p.scaled > 0)
		.sort((a, b) => b.scaled - a.scaled)

	if (types.length === 0) return { sumUnits: 0, counts: [] }

	// Anything above `target + the heaviest plate` cannot be the nearest answer:
	// drop one plate from such a sum and you are still at or above the target.
	const cap = targetUnits + types[0]!.scaled
	let reachable = new Map<number, number[]>([[0, types.map(() => 0)]])
	types.forEach((type, index) => {
		const next = new Map(reachable)
		for (const [sum, counts] of reachable) {
			for (let n = 1; n <= type.available; n++) {
				const candidateSum = sum + n * type.scaled
				if (candidateSum > cap) break
				const candidate = counts.slice()
				candidate[index] = n
				const existing = next.get(candidateSum)
				if (!existing || isBetterComposition(candidate, existing)) {
					next.set(candidateSum, candidate)
				}
			}
		}
		reachable = next
	})

	let bestSum = 0
	let bestCounts = reachable.get(0)!
	for (const [sum, counts] of reachable) {
		const distance = Math.abs(sum - targetUnits)
		const bestDistance = Math.abs(bestSum - targetUnits)
		if (
			distance < bestDistance ||
			(distance === bestDistance && sum < bestSum) ||
			(sum === bestSum && isBetterComposition(counts, bestCounts))
		) {
			bestSum = sum
			bestCounts = counts
		}
	}

	return {
		sumUnits: bestSum,
		counts: types
			.map((type, index) => ({
				weightKg: type.weightKg,
				count: bestCounts[index] ?? 0,
			}))
			.filter((plate) => plate.count > 0),
	}
}

/** Fewest plates first, then the most of the heaviest plate. */
function isBetterComposition(
	candidate: number[],
	incumbent: number[],
): boolean {
	const total = (counts: number[]) => counts.reduce((sum, n) => sum + n, 0)
	if (total(candidate) !== total(incumbent)) {
		return total(candidate) < total(incumbent)
	}
	for (let i = 0; i < candidate.length; i++) {
		if (candidate[i] !== incumbent[i]) {
			return (candidate[i] ?? 0) > (incumbent[i] ?? 0)
		}
	}
	return false
}

function fromUnits(scaled: number): number {
	return roundToScale(scaled / LOAD_SCALE)
}

/** Scaled integers in, kilos out: never a float sum, and never a trailing
 * `0.30000000004`. */
function roundToScale(kg: number): number {
	return Math.round(kg * LOAD_SCALE) / LOAD_SCALE
}
