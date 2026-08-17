/**
 * **The strength anchors' numbers, each named and each carrying its citation.**
 *
 * Nothing in this file is a house convention unless it says so. Every figure
 * either comes from a primary source quoted beside it, or is flagged as
 * convention/folklore — the repo's rule from the strength spec's cross-cutting
 * decisions, and the reason a reviewer can check a coefficient without leaving
 * the file.
 *
 * Research: `docs/research/` and `docs/wayfinder/out-of-the-box/strength-module-brief.md` §D.
 */
import { type EstimatorName } from '../strength-log.ts'

// ——— What a 1RM is worth as a measurement ————————————————————————————————

/**
 * **The 1RM test's own median test–retest CV, 4.2 %** (Grgic et al. 2020,
 * systematic review: 32 studies, n = 1595; median ICC 0.97). A re-test differing
 * by 3 % is *inside the noise* of the measurement.
 *
 * It is the floor on every band this module reports: no *estimator* may claim to
 * be tighter than the test it is estimating. See {@link estimatorSdPct}.
 */
export const ONE_RM_TEST_RETEST_CV_PCT = 4.2

/**
 * **The hard gate: an estimate is offered from ten reps or fewer, and refused
 * above it.**
 *
 * Not a tuning knob. Over 2–30 reps Brzycki's mean error is **+26.7 ± 101.7 %**;
 * restricted to ≤ 10 reps it is **−2.0 ± 10.5 %** (Mayhew et al. 2008, 103
 * women). Reynolds et al. 2006 concludes no more than 10 repetitions in a linear
 * equation. A ± 100 % SD is not uncertainty within a fit — it is not a fit — so
 * above this the answer is a refusal and never a `low` grade (ADR 0054).
 */
export const MAX_ESTIMATOR_REPS = 10

/**
 * The wide-range SDs the gate exists to keep out, kept here so the gate's reason
 * is checkable rather than asserted. Percent error SD over **2–30 reps**, same
 * table (Mayhew et al. 2008 Table 4).
 */
export const ESTIMATOR_WIDE_RANGE_SD_PCT = {
	brzycki: 101.7,
	lander: 70.7,
	adams: 16.1,
	wathen: 10.5,
	mayhew: 9.0,
	lombardi: 9.7,
	// Epley/Welday is not reported over the wide range in that table; it is
	// algebraically identical to Welday and shares the family's behaviour.
	epley: null,
} as const satisfies Record<EstimatorName, number | null>

// ——— The equations' coefficients, verbatim ————————————————————————————————
//
// Transcribed from Mayhew et al. 2008 Table 2. `RepWt` = the load used,
// `RTF` = repetitions performed to fatigue.

/** Epley (1985) / Welday: `RepWt × (1 + RTF/30)`. A poundage chart in a
 * University of Nebraska training manual, back-fitted into an equation — **not
 * peer-reviewed**, and the default only because it is near-unbiased at ≤ 10 reps
 * and is what every other app uses, which matters to an athlete comparing
 * numbers. The UI must not imply it is science. */
export const EPLEY_REPS_DIVISOR = 30

/** Brzycki (1993): `RepWt / (1.0278 − 0.0278·RTF)`. A practitioner article in
 * *JOPERD* with no reported sample or methodology. Divides by zero at 37 reps —
 * the reciprocal-linear family is wrong at both ends. */
export const BRZYCKI_INTERCEPT = 1.0278
export const BRZYCKI_SLOPE = 0.0278

/** Lander (1985): `RepWt / (1.013 − 0.0267123·RTF)`. Practitioner manual. */
export const LANDER_INTERCEPT = 1.013
export const LANDER_SLOPE = 0.0267123

/** Adams: `RepWt / (1 − 0.02·RTF)`. Divides by zero at 50 reps. */
export const ADAMS_SLOPE = 0.02

/** Mayhew et al. (1992): `RepWt / (0.522 + 0.419·e^(−0.055·RTF))` — fitted to
 * 435 college students as `%1RM = 52.2 + 41.9·e^(−0.055·reps)`, the **only one of
 * these with a documented empirical derivation of that size**. */
export const MAYHEW_INTERCEPT = 0.522
export const MAYHEW_COEFFICIENT = 0.419
export const MAYHEW_DECAY = 0.055

/** Wathen (1994): `RepWt / (0.488 + 0.538·e^(−0.075·RTF))`. A chapter in
 * Baechle's *Essentials*, not a study. */
export const WATHEN_INTERCEPT = 0.488
export const WATHEN_COEFFICIENT = 0.538
export const WATHEN_DECAY = 0.075

/** Lombardi (1989): `RTF^0.10 × RepWt`. Textbook. */
export const LOMBARDI_EXPONENT = 0.1

/**
 * **Berger, Reynolds, Brown, Cummings & Finn, Kemmler and Tucker are absent on
 * purpose.**
 *
 * Berger is systematically **−17.4 ± 7.2 %** at ≤ 10 reps: *precise and biased*,
 * which is worse than useless because it looks stable. Reynolds is a typographic
 * hazard — Mayhew's table prints `+ 0.4847` inside the exponent, a different
 * function, and the primary paper's own recommendation is a plain linear equation
 * from a 5RM. The rest are not in `ESTIMATOR_NAMES`, so they have no storable
 * `protocol` and an anchor written with one would fail the migration's CHECK.
 *
 * **O'Conner et al. (1989)** — `RepWt × (1 + RTF/40)`, −3.7 ± 9.1 % at ≤ 10 reps
 * — is defensible and *also* has no member in `ESTIMATOR_NAMES`. Adding it is a
 * change to `app/utils/strength-log.ts` plus the migration's CHECK, so it is not
 * offered here rather than being offered under a name nothing can store.
 */
export const OMITTED_ESTIMATORS = ['berger', 'reynolds', 'oconner'] as const

// ——— The error bars, verbatim ————————————————————————————————————————————

/**
 * **The band's width: the chosen equation's population SD, restricted to ≤ 10
 * reps.** Percent error SD in 103 women, Mayhew et al. 2008 Table 4.
 *
 * Never a decorative ± 2 %, and never the point estimate alone: **restricting to
 * ≤ 10 reps fixes the mean and leaves a ± 9–11 % individual SD in every single
 * row.** That is the honest width.
 */
export const ESTIMATOR_SD_PCT = {
	epley: 10.2,
	brzycki: 10.5,
	lander: 10.5,
	adams: 9.1,
	mayhew: 9.4,
	wathen: 10.6,
	lombardi: 9.2,
} as const satisfies Record<EstimatorName, number>

/**
 * **The mean bias, same table, same restriction.** Reported beside the band
 * rather than corrected for: a correction constant applied to a population mean
 * is a claim about *this* athlete that nobody measured.
 */
export const ESTIMATOR_MEAN_BIAS_PCT = {
	epley: 0.5,
	brzycki: -2.0,
	lander: -1.1,
	adams: -4.5,
	mayhew: 1.6,
	wathen: 0.7,
	lombardi: -0.9,
} as const satisfies Record<EstimatorName, number>

/**
 * The band this module will report for an equation: its population SD, floored
 * at the 1RM test's own test–retest CV so **no estimator can claim to be tighter
 * than the measurement it is estimating.** The floor never bites for the
 * equations offered today (all ≥ 9.1 %), and it is code rather than a coincidence
 * so that a future equation cannot smuggle in a ± 2 %.
 */
export function estimatorSdPct(estimator: EstimatorName): number {
	return Math.max(ESTIMATOR_SD_PCT[estimator], ONE_RM_TEST_RETEST_CV_PCT)
}

/** The equation as a reader can check it — shown in the derivation panel, so a
 * number an athlete compares against another app is reconstructible. */
export const ESTIMATOR_EQUATION_TEXT = {
	epley: 'load × (1 + reps / 30)',
	brzycki: 'load / (1.0278 − 0.0278 × reps)',
	lander: 'load / (1.013 − 0.0267123 × reps)',
	adams: 'load / (1 − 0.02 × reps)',
	mayhew: 'load / (0.522 + 0.419 × e^(−0.055 × reps))',
	wathen: 'load / (0.488 + 0.538 × e^(−0.075 × reps))',
	lombardi: 'reps^0.10 × load',
} as const satisfies Record<EstimatorName, string>

/**
 * **The default equation.** Epley/Welday: near-unbiased at ≤ 10 reps
 * (+0.5 ± 10.2 %) and what every other app uses. Mayhew, Wathen and Lombardi are
 * the defensible three from the exponential family and are selectable;
 * Brzycki, Lander and Adams are offered only for parity with other apps and are
 * gated at ten reps like everything else.
 */
export const DEFAULT_ESTIMATOR: EstimatorName = 'epley'

// ——— Grading, on strength's own terms ————————————————————————————————————

/**
 * **How long an anchor stays fresh: ~8 weeks.** ADR 0054's *recency* term, which
 * is one of only two of its four terms that exist in strength at all (coverage
 * and residual need several rep counts; **maximality has no signature** — a set
 * of 8 at RIR 4 and a set of 8 at RIR 0 are byte-identical in anything an app can
 * collect).
 *
 * Past it an estimate is **frozen and flagged, never decayed** (ADR 0054 §7).
 * Bosquet 2013 *is* a real decay curve, but it measures **cessation**; the stale
 * case here is an athlete who is training and untested, where the sign of the
 * error is ambiguous — a novice adding load weekly is stale **low** — and
 * 1×/week maintains strength (Rønnestad), so a decay curve would penalise exactly
 * the behaviour that preserves the quantity.
 */
export const ANCHOR_FRESH_DAYS = 56

/**
 * **`medium` needs six reps or fewer, explicitly at or near failure.** The rep
 * count is the dominant error term, and seven-to-ten reps grades `low`.
 * (Brief §D.7's grading table.)
 */
export const MEDIUM_CONFIDENCE_MAX_REPS = 6

/**
 * **What counts as "near failure" when the athlete reported an RIR: ≤ 2.**
 *
 * RIR is reliable only close to failure — pooled underprediction ≈ 0.9 reps
 * (Halperin 2022); SEM 2.64–3.38 reps in 141 trainees (Steele 2017); 259 coaches
 * judging video were off by 4.8 / 2.0 / 1.2 reps at 33 / 66 / 90 % through the set
 * (Emanuel 2022, coaching experience negligible). A logged `RIR 2` is on average
 * nearer RIR 3 and could be RIR 5, which biases any derived 1RM **downward** —
 * and that is **surfaced as a caveat, never corrected for**.
 */
export const NEAR_FAILURE_MAX_RIR = 2
