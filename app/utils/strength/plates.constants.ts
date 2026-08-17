/**
 * **The published numbers the plate calculator and the warm-up ramp stand on.**
 *
 * Every value here is either a figure the reference product states in its own
 * words, or a unit conversion of one. Nothing in this file is a number somebody
 * felt was about right: an unsourced constant that *looks* published is how a
 * fabricated metric gets a trusted vocabulary
 * (`docs/wayfinder/out-of-the-box/strength-module-brief.md` §A.1.8 for the shape
 * of that failure).
 *
 * Sources, once:
 * - **brief §A.2.1** — warm-up generation: the 45 lb jump cap, the two
 *   empty-bar sets, the fives, the worked 225 lb example, and set count scaling
 *   with the *work weight* rather than the lifter.
 * - **brief §A.2.3 / §B.8** — the plate calculator: per-plate inventory, an
 *   adjustable bar, `multiplier`, and integer-scaled arithmetic.
 * - **`docs/specs/strength-module.md`** Slice 5 — the same two, as specified.
 */

/** Pounds to kilograms, exactly, for converting the published lb figures. */
const KG_PER_LB = 0.45359237

// ——— The bar ——————————————————————————————————————————————————————————————

/**
 * The bar assumed when a **Plate Inventory** states no bars at all.
 *
 * A stated default, not a claim about the gym: the reference product ships an
 * adjustable bar weight with the men's Olympic bar as its default (brief
 * §A.2.3), and 20 kg is that bar. A `PlateInventory` that lists bars always
 * wins over this.
 */
export const DEFAULT_BAR_KG = 20

/**
 * How many plates a load consumes at a time. A barbell takes them in pairs; a
 * loadable machine with one horn takes them one at a time (brief §B.8). This is
 * also why the smallest achievable increment is `2 × smallestPlate` on a bar and
 * `1 × smallestPlate` on a horn.
 */
export const BARBELL_MULTIPLIER = 2
export const SINGLE_HORN_MULTIPLIER = 1

// ——— Arithmetic ———————————————————————————————————————————————————————————

/**
 * The solver works in **integers**, at the brief's `roundTo000005` precision —
 * hundredths of a gram. 2.5 kg plates beside a 0.5 kg microplate are exactly what
 * breaks float accumulation (brief §B.8), so no comparison in this module is made
 * against a float sum.
 *
 * Finer than grams on purpose: a 45 lb plate is 20.41165665 kg, and quantising
 * that to whole grams drifts a gram and a half over four plates — enough to grow
 * a spurious rung on the warm-up ramp of a gym that works in pounds.
 */
export const LOAD_SCALE = 100_000

// ——— The warm-up ramp —————————————————————————————————————————————————————

/**
 * _"two sets of five reps with the empty bar"_ (brief §A.1.6). Two, always,
 * regardless of the work weight — only the rungs above the bar scale.
 */
export const WARMUP_EMPTY_BAR_SETS = 2

/**
 * _"several heavier warm up sets of five reps until you reach your work
 * weight"_ (brief §A.1.6). Every rung is a five, including the empty-bar sets.
 */
export const WARMUP_REPS = 5

/**
 * _"not giving jumps in weight larger than 45lb on the warmup sets"_ (brief
 * §A.2.1) — 45 lb, in kilos.
 *
 * ⚠ Used **only to count the rungs**, and never asserted in copy. The vendor's
 * own worked example (45 → 95 → 135 → 185 → 225 lb) breaks this cap on two of
 * four jumps, so the cap cannot be the mechanism; the mechanism is the
 * plate-aligned ramp, which is an inference and unpublished. Counting rungs with
 * the cap reproduces the published example exactly — a 225 lb squat off a 45 lb
 * bar yields three rungs — while snapping each rung to what the rack can
 * actually make is what lets a jump land slightly over it, as the vendor's does.
 */
export const WARMUP_JUMP_CAP_KG = 45 * KG_PER_LB

/**
 * The published worked example, kept next to the rule it is the check on:
 * a 225 lb work weight off a 45 lb bar shows `5×45, 5×45, 5×95, 5×135, 5×185`
 * and then the work sets (brief §A.2.1). Three rungs above two empty-bar sets.
 */
export const WARMUP_PUBLISHED_EXAMPLE_LB = {
	workWeight: 225,
	barWeight: 45,
	rungsAboveBar: [95, 135, 185],
} as const
