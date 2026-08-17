/**
 * Build-time calibration for **Profile Analysis**, on the same principle
 * `structure-detection/constants.ts` states: numeric cut points are calibration,
 * not domain decisions, and the pipeline never asserts a bare literal.
 *
 * Every constant here that is *not* a published quantity carries the derivation
 * that produced it, because a threshold estimator whose refusal thresholds are
 * unexplained magic is exactly the thing the building principle forbids.
 */

/**
 * Tanaka's age-predicted maximum heart rate: `HRmax = 208 − 0.7 × age`.
 *
 * Promised by ADR 0005 §44 and depended on by
 * `structure-detection/classify.ts:227`, which resolves an HR classifier against
 * a `maxHr`-anchored recipe. Until this shipped, nothing upstream computed it
 * and `AthleteProfile.birthdate` was read by nothing at all.
 *
 * A **population regression**, so its confidence is pinned at `low` forever
 * (see `TANAKA_CONFIDENCE`) — the individual prediction interval is wide enough
 * that it must never outrank a value actually observed on this athlete.
 */
export const TANAKA_INTERCEPT = 208
export const TANAKA_SLOPE = 0.7

/** Ages outside this band are refused rather than extrapolated. */
export const TANAKA_AGE_RANGE: readonly [number, number] = [10, 100]

/**
 * The rolling window every history-reading rung looks back over, in days.
 *
 * 90 days is the interval literature's usual window for a power-duration fit:
 * long enough to collect efforts across the duration range, short enough that
 * the fit describes current fitness rather than last season's.
 */
export const ANALYSIS_WINDOW_DAYS = 90

/**
 * The mean-maximal durations the curve is sampled at, in seconds.
 *
 * The short rungs (5 s, 15 s, 30 s) are included **so they can be refused by
 * name**. At any grid this repo actually stores they are unrecoverable, and a
 * curve that silently omitted them would look complete; one that lists them as
 * refused says what the storage cost.
 */
export const MEAN_MAXIMAL_DURATIONS_SEC = [
	5, 15, 30, 60, 120, 180, 300, 480, 600, 900, 1200,
] as const

/**
 * The duration band the 2-parameter model is fitted over, in seconds.
 *
 * `P(t) = CP + W′/t` is well-behaved over roughly **2–20 min**
 * (`docs/research/zones-and-thresholds.md` §4). Below it the anaerobic
 * contribution dominates and the fit returns implausibly low CP with
 * implausibly high W′ — a documented failure mode, not a rare accident. Above
 * it, CP decay sets in and the hyperbola stops holding.
 */
export const CP_FIT_BAND_SEC: readonly [number, number] = [120, 1200]

/**
 * Minimum samples a mean-maximal window must span before its value is trusted.
 *
 * **The whole ADR 0020 problem lives in this number.** `ActivityStream` is a
 * *display* grid — `max(5, ceil(span / 999))` — so a 5 h ride lands on a 19 s
 * grid, and a 60-second "maximum" read off it is three samples of noise with a
 * plausible magnitude.
 *
 * Derivation: an even grid quantizes a window's true length to a multiple of
 * `resolutionSec`, so the length error is at most `resolutionSec / 2` and the
 * relative error at most `1 / (2n)` for `n` samples. At **n = 8** that is
 * **6.25 %**, which is the largest duration error worth calling a value at. It
 * means a 5 s grid can serve durations from 40 s and a 19 s grid from ~152 s —
 * i.e. on a long ride even the 2-minute rung is refused, which is the correct
 * and honest answer.
 *
 * Raise the fidelity, not this constant, when ADR 0020's analysis tier lands.
 */
export const MIN_SAMPLES_PER_WINDOW = 8

/**
 * Minimum distinct mean-maximal points inside {@link CP_FIT_BAND_SEC} before a
 * fit is attempted. Two points fit a line exactly and tell you nothing about
 * whether the model holds, so the residual would be meaningless.
 */
export const MIN_FIT_POINTS = 3

/**
 * Minimum ratio between the longest and shortest fitted duration.
 *
 * A fit over 8, 10 and 12 minutes is three points on nearly the same part of the
 * curve; the `1/t` term barely varies, so `CP` and `W′` trade off almost freely
 * and the asymptote is an extrapolation wearing a regression's clothes.
 */
export const MIN_FIT_DURATION_SPREAD = 3

/**
 * Plausibility bounds on the fitted parameters. Outside these the fit is
 * reported as `implausible-fit` rather than shown — the honest failure of a
 * least-squares fit is a refusal, not a small number.
 */
export const CP_PLAUSIBLE_W: readonly [number, number] = [50, 600]
export const W_PRIME_PLAUSIBLE_J: readonly [number, number] = [1_000, 60_000]

/**
 * Observed max HR is taken as a **high percentile of per-activity maxima**, not
 * the single global maximum.
 *
 * HR strap dropouts and cross-talk produce isolated 220 bpm spikes, and
 * `ActivityImport.hrMax` inherits them verbatim from the provider. One bad
 * sample in three years would otherwise set an athlete's whole zone ladder.
 *
 * The percentile is a judgement, not a published number, and
 * `docs/research/athlete-profile-from-history.md` §7 flags it as wanting
 * calibration against real data before it is treated as settled.
 */
export const OBSERVED_HR_PERCENTILE = 0.95

/** Below this many activities carrying HR, an observed max is not offered. */
export const MIN_HR_ACTIVITIES = 5

/** Physiologically plausible band for a recorded HR maximum, bpm. */
export const PLAUSIBLE_MAX_HR: readonly [number, number] = [120, 230]

/** Confidence cut points on the internal 0–1 score, the `grade.ts` idiom. */
export const GRADE_HIGH_CUT = 0.7
export const GRADE_MEDIUM_CUT = 0.4

/** An age regression is never more than `low`, whatever else is true. */
export const TANAKA_CONFIDENCE = 'low' as const

/**
 * How recency scores. A contributing effort from today scores 1; one at the far
 * edge of {@link ANALYSIS_WINDOW_DAYS} scores 0, linearly.
 */
export const RECENCY_FULL_DAYS = 0
export const RECENCY_ZERO_DAYS = ANALYSIS_WINDOW_DAYS

/**
 * How many distinct activities must contribute maxima before the *maximality*
 * term scores full.
 *
 * Maximality cannot be verified — nothing records that an effort was all-out
 * (`docs/research/athlete-profile-from-history.md` §2). Spread across
 * activities is the available proxy: a curve whose every point comes from one
 * ride is one ride's shape, not this athlete's.
 */
export const MAXIMALITY_FULL_ACTIVITIES = 4

/** Relative weights of the four confidence terms. Must sum to 1. */
export const CONFIDENCE_WEIGHTS = {
	coverage: 0.3,
	recency: 0.25,
	maximality: 0.25,
	residual: 0.2,
} as const

/**
 * How long an estimate stands before it reads as stale, in days.
 *
 * **Frozen and flagged, never decayed.** No literature validates any decay
 * function for a stale threshold (`docs/research/zones-and-thresholds.md` §4.5),
 * so the number does not move on its own — the app says it is old and stops
 * there. Inventing a decline is the fabrication the building principle forbids.
 */
export const ESTIMATE_STALE_AFTER_DAYS = 180
