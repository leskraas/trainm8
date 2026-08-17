import { type CardioDiscipline } from '../workout-schema.ts'

/**
 * **Profile Analysis** — the pure vocabulary for turning an athlete's own
 * imported history into a **Threshold Estimate** (research:
 * `docs/research/athlete-profile-from-history.md`).
 *
 * The whole module is a *proposal engine*. Nothing here writes a threshold, and
 * nothing here is allowed to: an estimate is shown with its derivation and the
 * athlete accepts it, which is the **derived-then-authored** rule ADR 0050
 * already set for **Weekly Capacity**. What the app may assert on its own is
 * that it *read* something; what it may never assert is that this is the
 * athlete's number.
 */

/**
 * **What was actually measured** — the physiological quantity, not the column it
 * lands in.
 *
 * This is the axis ADR 0005 is missing and the reason its
 * `source: manual | inferred | auto` cannot express what this module produces.
 * `docs/research/zones-and-thresholds.md` §3.1/§3.2 measures FTP from a 60-min
 * TT, from `0.95 × 20 min`, from `0.75 × ramp MAP` and from a **CP** fit as four
 * different numbers for one rider, up to ~20 W apart — two of them `manual` and
 * two `auto`, so the old enum puts the wrong pairs together.
 *
 * `cp` and `ftp` are **separate members on purpose.** The head-to-head is
 * 256 ± 50 W vs 249 ± 44 W with limits of agreement −19 to +33 W, a gap that
 * widens with fitness, and the authors state the two should not be used
 * interchangeably. A CP written into `DisciplineProfile.ftp` without saying so
 * is a fabrication with a correct-looking number in it.
 */
export const THRESHOLD_CONSTRUCTS = [
	'maxHr',
	'lthr',
	/** The 60-minute-power construct. */
	'ftp',
	/** The asymptote of the hyperbolic power–duration relationship. Not FTP. */
	'cp',
	'thresholdPace',
	'criticalSpeed',
	'css',
	'runPower',
] as const
export type ThresholdConstruct = (typeof THRESHOLD_CONSTRUCTS)[number]

/**
 * **How the number was arrived at.** The second half of the provenance pair.
 *
 * `provider` is here and is deliberately *not* something the app may adopt on
 * its own: a connected account's own computed threshold is offered as a
 * pre-fill the athlete confirms, never asserted. That is the same line
 * `app/integrations/intervalsicu/ingest.server.ts:49` already draws when it
 * declines to import `icu_training_load`, CTL and ATL.
 */
export const THRESHOLD_PROTOCOLS = [
	/** The athlete typed it. */
	'manual',
	/** A 60-minute maximal effort. */
	'tt60',
	/** `0.95 × 20-minute power`. */
	'ftp20',
	/** `0.75 × ramp MAP`. */
	'ramp',
	/** Least squares of `P(t) = CP + W′/t` over the mean-maximal curve. */
	'cp-fit',
	/** Resolved from a **Performance Result** through a race-equivalence model. */
	'race-equivalence',
	/** The maximum this athlete has actually been recorded producing. */
	'observed',
	/** The `208 − 0.7 × age` population regression. */
	'tanaka',
	/** A connected account's own number, confirmed by the athlete. */
	'provider',
] as const
export type ThresholdProtocol = (typeof THRESHOLD_PROTOCOLS)[number]

/**
 * The ordinal confidence vocabulary the app already speaks — **Detection
 * Confidence** (ADR 0033) and **Load Confidence**. Never a bespoke 0–1 scale,
 * and never a percentage: a fourth vocabulary for the same idea is the thing
 * ADR 0033 exists to prevent.
 */
export type EstimateConfidence = 'high' | 'medium' | 'low'

/**
 * Why a rung produced nothing. An estimate that cannot be made is **stated**,
 * never omitted — the same rule the generator's `unfilled` slots hold (ADR 0053
 * §3) and the same reason a **Structure Detection** returns `null` rather than
 * a shaky guess.
 */
export const ESTIMATE_REFUSALS = [
	/** No `birthdate` on the **Athlete Profile**. */
	'no-birthdate',
	/** Nothing in the window carried the channel this rung reads. */
	'no-data',
	/**
	 * The stored stream's grid is too coarse for the durations the model needs
	 * (ADR 0020). The honest failure of a *display* grid asked to do analysis.
	 */
	'resolution',
	/** Enough channel, not enough distinct efforts to fit anything to. */
	'insufficient-efforts',
	/** The durations that survived all sit together, so a fit would extrapolate. */
	'insufficient-spread',
	/** The fit returned a physically impossible parameter. */
	'implausible-fit',
	/** This rung is not built yet, and says so rather than degrading. */
	'unbuilt',
] as const
export type EstimateRefusal = (typeof ESTIMATE_REFUSALS)[number]

/** What the estimate read, so the derivation can be shown rather than claimed. */
export type EstimateBasis = {
	/** How many **Activity Imports** were in scope. */
	activityCount: number
	/** How many of them actually contributed a value. */
	contributingCount: number
	/** The window read, as ISO dates. Null on a rung that reads no window. */
	fromISO: string | null
	toISO: string | null
	/** The most recent contributing activity, ISO. */
	latestISO: string | null
	/** Mean-maximal durations that produced a usable value, seconds. */
	durationsUsedSec: number[]
	/** Durations refused for coarseness, seconds — named, not silently dropped. */
	durationsRefusedSec: number[]
	/** Goodness of fit where a fit happened, as r². */
	rSquared: number | null
}

/**
 * One rung's answer: a number with its provenance, or a refusal with a reason.
 *
 * A discriminated union rather than a nullable value, because "we did not look"
 * and "we looked and there is nothing" are different statements and the surface
 * says different things about them.
 */
export type ThresholdEstimate =
	| {
			kind: 'estimate'
			discipline: CardioDiscipline
			construct: ThresholdConstruct
			protocol: ThresholdProtocol
			/** Watts, bpm, or seconds — the unit its construct implies. */
			value: number
			confidence: EstimateConfidence
			basis: EstimateBasis
			/**
			 * A second number the same fit produced and that is **not** offered.
			 * `W′` from a curve whose short anchors were refused is a residual sink,
			 * so it is carried for the derivation panel and never proposed.
			 */
			companion: { label: string; value: number } | null
	  }
	| {
			kind: 'refusal'
			discipline: CardioDiscipline
			construct: ThresholdConstruct
			protocol: ThresholdProtocol
			refusal: EstimateRefusal
			basis: EstimateBasis
	  }

/** An empty basis — the shape a rung that read nothing still owes its reader. */
export const EMPTY_BASIS: EstimateBasis = {
	activityCount: 0,
	contributingCount: 0,
	fromISO: null,
	toISO: null,
	latestISO: null,
	durationsUsedSec: [],
	durationsRefusedSec: [],
	rSquared: null,
}

/**
 * Which `DisciplineProfile` column an accepted estimate would land in, or `null`
 * where the construct has no column.
 *
 * Separate from the construct **on purpose**: `cp` lands in `ftp` because that
 * is the only column the app has, and the `ThresholdEvent` written alongside
 * records `construct: 'cp'` so the history knows the two are not the same
 * quantity. The coercion happens once, here, where it can be read.
 */
export const CONSTRUCT_COLUMN = {
	maxHr: 'maxHr',
	lthr: 'lthr',
	ftp: 'ftp',
	cp: 'ftp',
	thresholdPace: 'thresholdPaceSecPerKm',
	criticalSpeed: 'thresholdPaceSecPerKm',
	css: 'cssSecPer100m',
	runPower: 'runPowerThresholdW',
} as const satisfies Record<ThresholdConstruct, string>

/**
 * The `ThresholdEvent.kind` an accepted estimate is filed under — the existing
 * vocabulary, unchanged, so the threshold history keeps reading as one series
 * per quantity rather than splitting when the protocol changes.
 */
export const CONSTRUCT_EVENT_KIND = {
	maxHr: 'maxHr',
	lthr: 'lthr',
	ftp: 'ftp',
	cp: 'ftp',
	thresholdPace: 'thresholdPace',
	criticalSpeed: 'thresholdPace',
	css: 'css',
	runPower: 'runPower',
} as const satisfies Record<ThresholdConstruct, string>
