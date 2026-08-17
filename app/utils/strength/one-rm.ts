/**
 * **1RM estimation** — a set the athlete already logged in, a **proposed**
 * `estimatedOneRm` or a stated refusal out.
 *
 * Pure in the sense ADR 0053 §2 fixed for the season generator and
 * `profile-analysis/estimate.ts` for thresholds: it **reads no clock** (`now` is
 * an argument), has no random source, mutates nothing and cannot query. The
 * server half assembles the sets and writes only what the athlete accepted.
 *
 * Three things this module exists to refuse to do.
 *
 * **It does not grade what is not a fit.** Above ten reps the answer is a
 * refusal, not a `low` confidence — over 2–30 reps Brzycki's mean error is
 * +26.7 ± 101.7 %, and at ≤ 10 reps it is −2.0 ± 10.5 %. ADR 0054's rule
 * verbatim: *"a grade communicates uncertainty **within** a valid fit; it must
 * not be asked to carry 'this is not a fit at all'."*
 *
 * **It does not shrug.** Four structurally different refusals, each with its own
 * sentence, because *"we did not look"* and *"we looked and there is nothing"*
 * are different statements: {@link ONE_RM_REFUSALS}.
 *
 * **It does not present a point estimate alone.** Every estimate carries a band
 * whose width is the chosen equation's own population SD, floored at the 1RM
 * test's median 4.2 % test–retest CV so no estimator claims to be tighter than
 * the measurement it is estimating.
 *
 * Nothing here writes. This is a proposal engine — **derived-then-authored**
 * (ADR 0050): the athlete accepts, and then the number is theirs and nothing
 * re-reads their history to move it underneath them.
 */
import { type AnchorConfidence, type EstimatorName } from '../strength-log.ts'
import {
	ADAMS_SLOPE,
	ANCHOR_FRESH_DAYS,
	BRZYCKI_INTERCEPT,
	BRZYCKI_SLOPE,
	DEFAULT_ESTIMATOR,
	EPLEY_REPS_DIVISOR,
	ESTIMATOR_EQUATION_TEXT,
	ESTIMATOR_MEAN_BIAS_PCT,
	LANDER_INTERCEPT,
	LANDER_SLOPE,
	LOMBARDI_EXPONENT,
	MAX_ESTIMATOR_REPS,
	MAYHEW_COEFFICIENT,
	MAYHEW_DECAY,
	MAYHEW_INTERCEPT,
	MEDIUM_CONFIDENCE_MAX_REPS,
	NEAR_FAILURE_MAX_RIR,
	ONE_RM_TEST_RETEST_CV_PCT,
	WATHEN_COEFFICIENT,
	WATHEN_DECAY,
	WATHEN_INTERCEPT,
	estimatorSdPct,
} from './anchors.constants.ts'

const DAY_MS = 86_400_000

// ——— What a reading is made of ————————————————————————————————————————————

/**
 * One logged set as the estimator reads it. The caller has already resolved the
 * kilo (`effectiveKg` on the set log, baked at log time) and already dropped
 * warm-ups and abandoned sets — a record is always a record of work.
 */
export type EstimatorSet = {
	/** The set the estimate was read from, so the derivation can be **shown**. */
	setLogId: string | null
	loadKg: number
	reps: number
	performedAt: Date
	/** The athlete's reported reps-in-reserve, where they reported one. */
	rir: number | null
	/** The set was taken to failure *on purpose* — a plan, not an outcome. */
	toFailure: boolean
}

export type OneRmInput = {
	/** Injected, never read from a clock — the module is pure. */
	now: Date
	/** This exercise's qualifying working sets, in any order. */
	sets: readonly EstimatorSet[]
	/** Which equation to apply. Epley/Welday when omitted. */
	estimator?: EstimatorName
	/**
	 * Whether this movement has a validated rep↔load mapping at all. Rows,
	 * overhead presses, deadlift variations and most isolation work have **none**
	 * (LeSuer 1997 found every equation significantly underestimated the deadlift;
	 * Nuzzo 2024 needs separate `REPS ~ %1RM` tables for bench and leg press), so
	 * the alternative to this flag is borrowing the bench press's curve.
	 */
	hasValidatedRepLoadMapping: boolean
}

/**
 * Why no estimate was produced — a **closed vocabulary of first-class answers**,
 * not an absence. Each one is a different sentence on the surface.
 */
export const ONE_RM_REFUSALS = [
	/** No qualifying set record exists for this exercise. Nothing was read. */
	'no-sets-logged',
	/** The best available set is above ten reps. Not uncertainty — not a fit. */
	'reps-out-of-range',
	/** No proximity-to-failure information. Maximality has no signature here. */
	'effort-unknown',
	/** No validated rep↔load mapping, and the corpus does not cover it. */
	'exercise-unmapped',
] as const
export type OneRmRefusal = (typeof ONE_RM_REFUSALS)[number]

/** What the reading looked at, so the derivation is shown rather than claimed. */
export type OneRmBasis = {
	/** How many qualifying sets were in scope. */
	setsRead: number
	/** The set actually read — load, reps, date and RIR — or `null`. */
	source: {
		setLogId: string | null
		loadKg: number
		reps: number
		performedAtISO: string
		rir: number | null
		toFailure: boolean
	} | null
	/** Days from the source set to `now`, `null` where nothing was read. */
	recencyDays: number | null
	/** The equation as a reader can check it. */
	equationText: string
	/**
	 * The source set is older than {@link ANCHOR_FRESH_DAYS}. **Flagged, never
	 * decayed**: nobody can tell whether an untested lifter who is still training
	 * got weaker or stronger.
	 */
	stale: boolean
}

/**
 * The honest width of an estimate: the equation's population SD as kilos either
 * side, with the equation's mean bias reported beside it rather than corrected
 * for.
 */
export type OneRmBand = {
	lowKg: number
	highKg: number
	sdPct: number
	meanBiasPct: number
}

/**
 * A number with its provenance, or a refusal with its reason — the same tagged
 * union `profile-analysis/estimate.ts` uses, for the same reason.
 */
export type OneRmReading =
	| {
			kind: 'estimate'
			/**
			 * `estimatedOneRm` for a formula's output — a different claim from a
			 * performed maximal single, which is why they never share a construct.
			 *
			 * `oneRm` appears in exactly one case: a **single taken to failure**,
			 * which *is* a tested maximum and must not be run through an equation.
			 * Epley would report 103.3 kg from a 100 kg single, fabricating 3.3 kg
			 * above a number the athlete actually lifted.
			 */
			construct: 'oneRm' | 'estimatedOneRm'
			protocol: EstimatorName | 'tested'
			valueKg: number
			/**
			 * **The reps the estimate was read from — required, never optional.** It
			 * is the single largest determinant of the error, the column the stored
			 * anchor makes NOT NULL for an `estimatedOneRm`, and without it the
			 * number can neither be re-derived nor re-graded.
			 */
			reps: number
			/**
			 * `high` is reachable only through the tested single above. A formula's
			 * output grades `medium` at best, because `high` means a lift was
			 * actually tested.
			 */
			confidence: AnchorConfidence
			band: OneRmBand
			basis: OneRmBasis
	  }
	| {
			kind: 'refusal'
			construct: 'estimatedOneRm'
			protocol: EstimatorName
			refusal: OneRmRefusal
			basis: OneRmBasis
	  }

// ——— The equations ————————————————————————————————————————————————————————

/**
 * The published equation, applied verbatim. `load` is `RepWt`, `reps` is `RTF`.
 *
 * Two families, and the split matters: *reciprocal-linear* (Brzycki, Lander,
 * Adams, Epley/Welday) is a straight line and is wrong at both ends — Brzycki
 * divides by zero at 37 reps, Adams at 50 — while *exponential/power* (Mayhew,
 * Wathen, Lombardi) is a curve that flattens, which is the correct shape. The
 * ten-rep gate is what keeps the first family inside the range where it behaves.
 */
export function applyEstimator(
	estimator: EstimatorName,
	loadKg: number,
	reps: number,
): number {
	switch (estimator) {
		case 'epley':
			return loadKg * (1 + reps / EPLEY_REPS_DIVISOR)
		case 'brzycki':
			return loadKg / (BRZYCKI_INTERCEPT - BRZYCKI_SLOPE * reps)
		case 'lander':
			return loadKg / (LANDER_INTERCEPT - LANDER_SLOPE * reps)
		case 'adams':
			return loadKg / (1 - ADAMS_SLOPE * reps)
		case 'mayhew':
			return (
				loadKg /
				(MAYHEW_INTERCEPT + MAYHEW_COEFFICIENT * Math.exp(-MAYHEW_DECAY * reps))
			)
		case 'wathen':
			return (
				loadKg /
				(WATHEN_INTERCEPT + WATHEN_COEFFICIENT * Math.exp(-WATHEN_DECAY * reps))
			)
		case 'lombardi':
			return loadKg * Math.pow(reps, LOMBARDI_EXPONENT)
	}
}

// ——— The reading ——————————————————————————————————————————————————————————

/**
 * Propose a 1RM from the best set the athlete already did, or state why not.
 *
 * The order of the gates is the order of the honest answers: whether the app may
 * model this movement at all, then whether anything was logged, then whether any
 * of it is inside the rep gate, then whether the effort is known. A later gate
 * never masks an earlier one — *"we did not look"* must not read as *"your set
 * was too long"*.
 */
export function estimateOneRm(input: OneRmInput): OneRmReading {
	const protocol = input.estimator ?? DEFAULT_ESTIMATOR
	const equationText = ESTIMATOR_EQUATION_TEXT[protocol]
	const emptyBasis: OneRmBasis = {
		setsRead: input.sets.length,
		source: null,
		recencyDays: null,
		equationText,
		stale: false,
	}
	const refuse = (refusal: OneRmRefusal): OneRmReading => ({
		kind: 'refusal',
		construct: 'estimatedOneRm',
		protocol,
		refusal,
		basis: emptyBasis,
	})

	if (!input.hasValidatedRepLoadMapping) return refuse('exercise-unmapped')

	const usable = input.sets.filter(
		(set) => set.reps >= 1 && Number.isFinite(set.loadKg) && set.loadKg > 0,
	)
	if (usable.length === 0) return refuse('no-sets-logged')

	const inRange = usable.filter((set) => set.reps <= MAX_ESTIMATOR_REPS)
	if (inRange.length === 0) return refuse('reps-out-of-range')

	const nearFailure = inRange.filter(isNearFailure)
	if (nearFailure.length === 0) return refuse('effort-unknown')

	// The **best available** set, where best is the heaviest estimate it supports
	// — a lifter's 5 × 100 kg says more about their maximum than their 10 × 60 kg
	// does. Ties go to the more recent set, so a repeat of the same effort moves
	// the derivation forward rather than pinning it to the first one ever logged.
	const reading = (set: EstimatorSet) =>
		set.reps === 1 ? set.loadKg : applyEstimator(protocol, set.loadKg, set.reps)
	const source = nearFailure.reduce((best, set) => {
		const candidate = reading(set)
		const incumbent = reading(best)
		if (candidate > incumbent) return set
		if (candidate === incumbent && set.performedAt > best.performedAt)
			return set
		return best
	})

	const recencyDays = Math.max(
		0,
		(input.now.getTime() - source.performedAt.getTime()) / DAY_MS,
	)
	const stale = recencyDays > ANCHOR_FRESH_DAYS

	// **A single taken to failure is not an estimate.** It is the measurement, so
	// no equation touches it, the provenance says `tested`, and the band is the
	// 1RM test's own median test–retest CV rather than a prediction interval.
	const tested = source.reps === 1
	const valueKg = tested
		? roundKg(source.loadKg)
		: roundKg(applyEstimator(protocol, source.loadKg, source.reps))
	const sdPct = tested ? ONE_RM_TEST_RETEST_CV_PCT : estimatorSdPct(protocol)

	return {
		kind: 'estimate',
		construct: tested ? 'oneRm' : 'estimatedOneRm',
		protocol: tested ? 'tested' : protocol,
		valueKg,
		reps: source.reps,
		confidence: tested
			? gradeTestedSingle(stale)
			: gradeEstimate(source.reps, stale),
		band: {
			lowKg: roundKg(valueKg * (1 - sdPct / 100)),
			highKg: roundKg(valueKg * (1 + sdPct / 100)),
			sdPct,
			meanBiasPct: tested ? 0 : ESTIMATOR_MEAN_BIAS_PCT[protocol],
		},
		basis: {
			...emptyBasis,
			equationText: tested
				? 'the load lifted — a single to failure is the measurement, so no equation is applied'
				: equationText,
			source: {
				setLogId: source.setLogId,
				loadKg: source.loadKg,
				reps: source.reps,
				performedAtISO: source.performedAt.toISOString(),
				rir: source.rir,
				toFailure: source.toFailure,
			},
			recencyDays,
			stale,
		},
	}
}

/**
 * **Is this set's effort known at all?** Taken to failure, or reported within
 * {@link NEAR_FAILURE_MAX_RIR} of it.
 *
 * The one place the honest statement is *stronger* than ADR 0054's: in cardio a
 * maximal effort has signatures, in strength there is **no signature without bar
 * velocity**. So an unmarked set is not a weak reading, it is no reading — and a
 * set stopped five reps short is a fact about a submaximal set, not evidence
 * about a maximum.
 */
function isNearFailure(set: EstimatorSet): boolean {
	if (set.toFailure) return true
	return set.rir != null && set.rir <= NEAR_FAILURE_MAX_RIR
}

/**
 * The grade, on the only two of ADR 0054's four terms that exist here: **reps**
 * and **recency**.
 *
 * `high` is structurally unreachable — it means a tested 1RM or a directly
 * observed rep max at ≤ 5 reps, and a formula's output is neither.
 */
function gradeEstimate(
	reps: number,
	stale: boolean,
): Exclude<AnchorConfidence, 'high'> {
	if (stale) return 'low'
	return reps <= MEDIUM_CONFIDENCE_MAX_REPS ? 'medium' : 'low'
}

/**
 * A tested single grades `high` while it is fresh, and is **frozen and flagged**
 * rather than decayed once it is not: an athlete who is training and untested is
 * stale in an ambiguous direction, so the grade drops and the number stands.
 */
function gradeTestedSingle(stale: boolean): AnchorConfidence {
	return stale ? 'low' : 'high'
}

/**
 * The refusal as one sentence the surface can render in place, with what would
 * fix it. Four reasons, four sentences: collapsing them into one shrug is the
 * failure this vocabulary exists to prevent.
 */
export function oneRmRefusalText(refusal: OneRmRefusal): string {
	switch (refusal) {
		case 'no-sets-logged':
			return 'No sets logged for this lift yet, so there is nothing to read. Log a working set and this can be estimated.'
		case 'reps-out-of-range':
			return `Your best set here is above ${MAX_ESTIMATOR_REPS} reps, where these equations stop being estimates at all. Log a set of ${MAX_ESTIMATOR_REPS} reps or fewer.`
		case 'effort-unknown':
			return 'None of your sets here says how close to failure it was, and in lifting there is no way to tell from the numbers. Mark a set as taken to failure, or record its reps in reserve.'
		case 'exercise-unmapped':
			return 'This movement has no validated reps-to-load relationship, so an estimate would be borrowing another lift’s curve. Record a rep max for it instead.'
	}
}

/** Kilos to one decimal — the precision a bar is actually loaded to. Plate
 * rounding is the plate calculator's job and deliberately not done here. */
function roundKg(kg: number): number {
	return Math.round(kg * 10) / 10
}
