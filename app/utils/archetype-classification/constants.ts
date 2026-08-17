/**
 * Build-time calibration for the archetype reader (ADR 0033: "numeric cut points
 * are build-time calibration, not domain decisions"). Every threshold
 * `workout-taxonomy.md` §8.2 names lives here, named and tunable — the branches
 * never assert a bare literal. Tune these against the seeded corpus, not against
 * the domain.
 *
 * Ranges are inclusive at both ends and read `[min, max]`.
 */

/** Nothing shorter than this is `long` for anybody, whatever their week holds. */
export const LONG_ABS_MIN_SEC = 5400
/** ...and it must also be this multiple of the athlete's own median session. */
export const LONG_REL_MULTIPLE = 1.5

/** `recovery` is defined by its ceiling, not by an adaptation (§2.1). */
export const RECOVERY_MAX_SEC = 2700
export const RECOVERY_MAX_IF = 0.62

/** A stray 2 % above LT2 does not make a run hard. */
export const EASY_MAX_Z3_FRAC = 0.02
/** ...and an easy run stays mostly below LT1 too. */
export const EASY_MAX_Z2_FRAC = 0.15

/** Session IF band for the merged tempo/steady reading. */
export const TEMPO_IF_BAND: readonly [number, number] = [0.8, 0.9]
/** ...which also wants most of the session actually sitting between LT1 and LT2. */
export const TEMPO_MIN_Z2_FRAC = 0.5

/** Mixed intensity with no detectable set reads as speed play. */
export const FARTLEK_MIN_MIXED_FRAC = 0.25
/** Repeated efforts this irregular in length are a fartlek, not a set. */
export const FARTLEK_MIN_REP_CV = 0.35
/** ...and it takes three of them before "irregular" means anything. */
export const FARTLEK_MIN_REPS = 3

/** A near-maximal sustained effort is a test, whatever it was called. */
export const TT_MIN_IF = 0.95

/** A discipline change inside this gap is one brick, not two sessions. */
export const BRICK_MAX_GAP_SEC = 600

/** Reps this long, at this intensity, read as threshold work. */
export const THRESHOLD_REP_SEC: readonly [number, number] = [240, 1500]
export const THRESHOLD_MIN_MEAN_ZONE = 3.5
export const THRESHOLD_MAX_MEAN_ZONE = 4.6

/** VO₂max, long reps: 2.5–10 min above LT2. */
export const VO2_LONG_REP_SEC: readonly [number, number] = [150, 600]
export const VO2_MIN_MEAN_ZONE = 4.5

/** VO₂max, short reps: micro-intervals with incomplete recovery. */
export const VO2_SHORT_REP_SEC: readonly [number, number] = [15, 75]
export const VO2_SHORT_MAX_REST_RATIO = 1.2
export const VO2_SHORT_MIN_REPS = 8

/** Anaerobic capacity: near-maximal reps bought with long recoveries. */
export const ANAEROBIC_REP_SEC: readonly [number, number] = [20, 120]
export const ANAEROBIC_MIN_REST_RATIO = 2
export const ANAEROBIC_MIN_MEAN_ZONE = 4.8

/**
 * Sub-threshold, the Norwegian method's shape: many controlled reps at the Z3/Z4
 * seam with floats rather than recoveries, accumulating real volume. Tested
 * *before* threshold because it is the denser pattern and the generic threshold
 * rule would swallow it (§8.3).
 */
export const SUBTHRESHOLD_MAX_MEAN_ZONE = 4
export const SUBTHRESHOLD_MIN_REPS = 5
export const SUBTHRESHOLD_MAX_REST_RATIO = 0.35
/** ≥ 30 min of accumulated work — the volume is the whole point of the method. */
export const SUBTHRESHOLD_MIN_TOTAL_WORK_SEC = 1800

/**
 * Neuromuscular: tiny reps, full recovery, trivial total work. Tested before
 * every other structured branch so 8 × 20 s strides on the end of an easy run
 * cannot promote the day to a quality session (§8.3, `workouts-running.md` §8).
 */
export const NEURO_REP_SEC: readonly [number, number] = [5, 30]
export const NEURO_MAX_TOTAL_WORK_SEC = 300
export const NEURO_MIN_REST_RATIO = 6
