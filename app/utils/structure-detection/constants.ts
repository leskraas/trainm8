import { type DetectionDiscipline } from './types.ts'

/**
 * Build-time calibration constants for the detection engine (ADR 0033: "numeric
 * cut points are build-time calibration, not domain decisions"). Every magic
 * number the #330 prototype validated against the seeded corpus lives here,
 * named and tunable — the pipeline never asserts a bare literal. Tune these
 * against the corpus, not the domain.
 */

/** The classifying channel a detected segment's intensity is read from. */
export type ClassifyChannel = 'power' | 'pace' | 'heartrate'

/** Per-discipline segmentation knobs (edge detection). */
type DisciplineKnobs = {
	/** Rolling-median denoise window, in samples (odd). Anti-noise, pre-PELT. */
	medianWindow: number
	/** Minimum segment dwell, in seconds — the anti-flicker floor for PELT. */
	minSegSec: number
	/**
	 * PELT penalty factor: penalty = `penaltyFactor · log(n)` on the
	 * median/MAD-normalized (unit-scale) signal. `6·log n` over-segmented easy
	 * runs in #330; `8` was the sweet spot across the corpus.
	 */
	penaltyFactor: number
}

export const DISCIPLINE_KNOBS: Record<DetectionDiscipline, DisciplineKnobs> = {
	run: { medianWindow: 5, minSegSec: 25, penaltyFactor: 8 },
	bike: { medianWindow: 5, minSegSec: 25, penaltyFactor: 8 },
}

/**
 * Analysis clamp for GPS pace spikes, in seconds per km. A single 20 s/km GPS
 * sample otherwise wrecks the denoise scale (#330 finding). Applied wherever the
 * pace channel is read (as an edge channel and as a classifying channel).
 */
export const PACE_CLAMP_SEC_PER_KM: readonly [number, number] = [120, 900]

/**
 * The value-margin gate, per classifying channel: the 2-means easy and hard
 * levels must sit at least this far apart (relative) before *any* structure is
 * mined. A secondary guard behind the band-separation gate — it stops 2-means
 * from splitting pure noise. HR ranges compress, so its margin is smaller.
 */
export const VALUE_MARGIN_GATE: Record<ClassifyChannel, number> = {
	power: 0.15,
	pace: 0.08,
	heartrate: 0.05,
}

/**
 * The band-separation honesty gate (ADR 0033, #330's single most important
 * knob): a work level counts as work only if it sits at least this many training
 * zones above the easy/baseline band. GPS/pace wobble on an easy run stays
 * inside one zone; a genuine effort crosses a zone boundary.
 */
export const MIN_BAND_SEPARATION = 1

/** A segment must last at least this long to count as a work rep (short-rep floor). */
export const MIN_WORK_SEC = 30

/**
 * Edge-channel preference for cutting segments, most→least responsive (#333
 * multi-metric fusion). Edge detection is decoupled from classification: a run
 * carries GPS pace *and*, increasingly, running power — and power responds
 * within a sample where GPS pace lags and wobbles across the same effort. Cutting
 * on the most responsive channel present is what lets the stream resolve the
 * short-rep sessions (45s on / 15s off) GPS pace smears into one blob; the
 * segment is still *classified* on the discipline's anchor channel (ADR 0035), so
 * the stored Intensity Target is unchanged. HR never sets edges (lag + drift).
 */
export const EDGE_CHANNEL_PREFERENCE: Record<
	DetectionDiscipline,
	ClassifyChannel[]
> = {
	bike: ['power'],
	run: ['power', 'pace'],
}

/**
 * The anti-flicker segmentation floor when edges come from the responsive power
 * channel — short enough to resolve a ~15s micro-interval recovery (at 5s
 * sampling, three samples). GPS pace keeps the coarser `DISCIPLINE_KNOBS.minSegSec`
 * (its wobble would over-segment at this floor); power is clean enough that the
 * PELT penalty, not the floor, governs. Below the honesty gate either way — a
 * finer cut never lowers the bar on what counts as real structure (ADR 0033).
 */
export const RESPONSIVE_EDGE_MIN_SEG_SEC = 10

/** HR lag lead-in trimmed before classifying on the settled interior (ADR 0035). */
export const HR_LEAD_IN_SEC = 30

/** Reps cluster together within these tolerances (duration & value, relative). */
export const REP_CLUSTER_DURATION_TOL = 0.3
export const REP_CLUSTER_VALUE_TOL = 0.12

/** A rep split only by a short pause (gap < this, similar value) is one rep. */
export const PAUSE_STITCH_MAX_GAP_SEC = 180
export const PAUSE_STITCH_VALUE_TOL = 0.08

/**
 * Recovery-sanity guard (ADR 0033): a "recovery" dwarfing the work it separates
 * is not an interval set. Recoveries may run up to this multiple of the mean
 * work duration, floored at an absolute ceiling so long steady-state efforts are
 * not punished.
 */
export const REC_SANITY_WORK_MULTIPLE = 3
export const REC_SANITY_ABS_CEILING_SEC = 600

/**
 * Minimum-coverage floor (ADR 0033): the structured portion must explain a
 * meaningful share of moving time, otherwise a couple of spikes in a long steady
 * activity would fabricate an interval set.
 */
export const MIN_MOTIF_COVERAGE = 0.15

/** A single sustained elevated block clears the gate only if it is this substantial. */
export const MIN_SUSTAINED_SEC = 300
export const MIN_SUSTAINED_COVERAGE = 0.1

/** A warm-up / cool-down tail is only emitted as its own block past this length. */
export const MIN_WARMUP_COOLDOWN_SEC = 120

/** Duration-weighted 2-means iteration cap (converges well within this). */
export const TWO_MEANS_MAX_ITERATIONS = 12

/**
 * How sharply a component's coefficient of variation is punished: score =
 * `max(0, 1 − cv · sharpness)`. Duration regularity is more forgiving than
 * intensity tightness (a rep's watts/pace should be tighter than its length).
 */
export const CV_DURATION_SHARPNESS = 2
export const CV_INTENSITY_SHARPNESS = 4

/**
 * A between-reps segment counts as a recovery only if it is at least this much
 * easier (relative) than the rep it follows — the alternation check.
 */
export const ALTERNATION_EASIER_MARGIN = 0.05

/**
 * Score for a single sustained elevated block (no repeats), from its coverage of
 * moving time: `base + coverageWeight · coverage`. Deliberately below the motif
 * ceiling — one block is weaker evidence than a clean repeated set.
 */
export const SUSTAINED_SCORE_BASE = 0.3
export const SUSTAINED_SCORE_COVERAGE_WEIGHT = 0.45

/** Score component weights for the repeat-motif hypothesis (sum to 1). */
export const MOTIF_SCORE_WEIGHTS = {
	regularity: 0.35,
	intensityTightness: 0.2,
	alternation: 0.25,
	coverage: 0.2,
} as const

/** k = 2 reps is weak evidence; k ≥ 3 is full weight. */
export const K_FACTOR_STRONG = 3
export const K_FACTOR_WEAK_MULTIPLIER = 0.55

/** The alternation multiplier when recoveries do not cleanly separate the reps. */
export const ALTERNATION_BROKEN = 0.3

/** Grade cut points on the internal 0–1 score (never stored; ADR 0032/0033). */
export const GRADE_HIGH_CUT = 0.7
export const GRADE_MEDIUM_CUT = 0.4
