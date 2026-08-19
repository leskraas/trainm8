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
 * **It does not shrug.** Six structurally different refusals, each with its own
 * sentence, because *"we did not look"*, *"we looked and there is nothing"* and
 * *"what we found is not a bar weight"* are different statements:
 * {@link ONE_RM_REFUSALS}.
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
	type RepLoadBasis,
	WATHEN_COEFFICIENT,
	WATHEN_DECAY,
	WATHEN_INTERCEPT,
	estimatorSdPct,
} from './anchors.constants.ts'
import { loadKindComparability } from './program-rules.ts'

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
	/**
	 * **What kind of number `loadKg` is** — the stored `LoadValue.kind` the set was
	 * logged under, `null` where the caller cannot read it.
	 *
	 * **Required, and deliberately not optional.** A 1RM is a weight on a bar, and
	 * every percentage of a prescription is priced off it, so a kilo that includes
	 * the athlete (`bodyweightPlus`), inverts the sign (`assisted`), counts one hand
	 * (`perSide`) or is not a mass at all (`stackLevel`, `band`, `unloaded`) is not
	 * evidence about a maximum — it is a different quantity. A dip-belt bench at
	 * `effectiveKg` 104 read through Epley proposed 121.33 kg, a bar weight the
	 * athlete had never touched, and the accept path stored it. Making the field
	 * optional would let the next caller re-open that hole by omission; making it
	 * required means a new reader of a stored kilo cannot compile without saying
	 * what kind it is. The classification itself is `loadKindComparability`'s —
	 * one owner, asked here, never copied.
	 */
	loadKind: string | null
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
	/** No qualifying set record was handed over for this exercise. Nothing was
	 * read. **Not** a claim that the athlete's sets are unreadable — that is
	 * {@link 'sets-not-readable'}, and the two must not share a sentence. */
	'no-sets-logged',
	/**
	 * Sets were handed over and **none of them is a load lifted for a counted
	 * number of reps** — a timed hold states a duration, a set with no honest kilo
	 * states no load. An **unreadable presence, not an absence**: the work
	 * happened, and telling the athlete *"no sets logged"* about a Push-up whose
	 * own row reads *"bodyweight × 45 s"* is the app arguing with itself.
	 */
	'sets-not-readable',
	/** The best available set is above ten reps. Not uncertainty — not a fit. */
	'reps-out-of-range',
	/** No proximity-to-failure information. Maximality has no signature here. */
	'effort-unknown',
	/** No validated rep↔load mapping, and the corpus does not cover it. */
	'exercise-unmapped',
	/**
	 * Sets were logged, and none of their kilos is a weight on a bar — a
	 * bodyweight-derived, assisted, per-hand or non-mass load. Not an absence and
	 * not a weak reading: a different quantity, which no equation converts.
	 */
	'load-not-on-the-bar',
	/**
	 * Sets were logged and nothing says what kind of load they were. **Fail
	 * closed**: an unstated kind is not evidence about a bar, and reading it as one
	 * is how the fabricated kilo survived six rounds.
	 */
	'load-kind-unstated',
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
			/**
			 * The kilo **as derived**, carrying every digit the arithmetic produced.
			 * A `tested` reading is the load that was lifted, byte for byte; an
			 * estimate is the equation's own output. Rounding lives in `formatKg`, so
			 * one reading cannot print as two numbers on two surfaces.
			 */
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
 * of it is a weight on a bar, then whether any of that is inside the rep gate,
 * then whether the effort is known. A later gate never masks an earlier one —
 * *"we did not look"* must not read as *"your set was too long"*.
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
	// **Nothing handed over and nothing readable are two answers.** They used to
	// share one, so a Push-up whose only work is a 45-second hold was told *"No
	// sets logged for this lift yet"* on the same screen as its own
	// *"bodyweight × 45 s"* row. An absence is an absence; sets that cannot be read
	// as reps × load are a statement about the sets.
	if (usable.length === 0) {
		return refuse(
			input.sets.length === 0 ? 'no-sets-logged' : 'sets-not-readable',
		)
	}

	// **The chokepoint: a 1RM is a weight on a bar.** Asked before the rep gate and
	// before the effort gate, because *"that kilo is not a bar weight"* is a
	// statement about the number itself and must not surface as *"your set was too
	// long"*. `loadKindComparability` owns the classification — only `external` is
	// a weight on the bar — and every kilo this module turns into an anchor passes
	// through here, so no caller can read one without asking.
	const comparable = usable.filter(
		(set) => loadKindComparability(set.loadKind).kind === 'comparable',
	)
	if (comparable.length === 0) {
		const allUnstated = usable.every(
			(set) => loadKindComparability(set.loadKind).kind === 'unstated',
		)
		return refuse(allUnstated ? 'load-kind-unstated' : 'load-not-on-the-bar')
	}

	const inRange = comparable.filter((set) => set.reps <= MAX_ESTIMATOR_REPS)
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
	//
	// **Nothing here is rounded.** A reading is a value, and its precision is the
	// renderer's decision — `formatKg`, one house rule, every surface. A round
	// applied to the value itself made a `tested` single report 61.3 kg from a
	// 61.25 kg lift on the same screen that said no equation had been applied,
	// stored the 0.05 kg it invented, and then prescribed off it. Making a number
	// *loadable* is a real decision and it belongs to `roundToLoadable`, which
	// states it; an anchor is a measurement and gets no such treatment.
	const tested = source.reps === 1
	const valueKg = tested
		? source.loadKg
		: applyEstimator(protocol, source.loadKg, source.reps)
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
			lowKg: valueKg * (1 - sdPct / 100),
			highKg: valueKg * (1 + sdPct / 100),
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
 * **A weaker basis costs a grade.** An equation applied to a movement it was
 * never fitted to is not the same reading as the same equation on a bench press,
 * and the difference has to land somewhere the athlete can see and the database
 * can keep — so it lands on the confidence, and the stored anchor carries the
 * dropped grade because `acceptProposedExerciseOneRm` writes what this returns.
 *
 * It lives beside the estimator rather than in either server module because
 * **both of them read a 1RM off a set** — the propose surface and the program
 * engine's Anchor Re-estimate — and a grade that was one step down on one screen
 * and full on the other would be two answers about one lift.
 *
 * Only a formula's output is touched. A **tested single** is a measurement with
 * no equation in it (`construct: 'oneRm'`, `protocol: 'tested'`), so no borrowed
 * curve can be wrong about it and its grade stands. And `low` is the floor: the
 * step below a low grade is a refusal, and a refusal is a claim about the fit,
 * which is what `repLoadBasis`'s `unmapped` member already makes.
 */
export function gradeDownForRepLoadBasis(
	reading: OneRmReading,
	basis: RepLoadBasis,
): OneRmReading {
	if (reading.kind !== 'estimate') return reading
	if (reading.construct !== 'estimatedOneRm') return reading
	if (basis === 'fitted' || basis === 'unmapped') return reading
	return { ...reading, confidence: 'low' }
}

/**
 * The refusal as one sentence the surface can render in place, with what would
 * fix it. Seven reasons, seven sentences: collapsing them into one shrug is the
 * failure this vocabulary exists to prevent.
 *
 * `no-sets-logged` deliberately **does not claim the athlete logged nothing**.
 * This function is handed a list, not a database: a caller that filters
 * unreadable rows out before asking — the propose surface excludes rows with no
 * reps and no kilo in SQL — hands over an empty list for a lift the athlete
 * trains weekly, and *"No sets logged for this lift yet"* was then a sentence
 * about the query rather than about the athlete.
 */
export function oneRmRefusalText(refusal: OneRmRefusal): string {
	switch (refusal) {
		case 'no-sets-logged':
			return 'No readable working set for this lift, so there is nothing to estimate from. Log a working set at a stated load for a counted number of reps and this can be estimated.'
		case 'sets-not-readable':
			return 'Your sets on this lift state a duration, or a load with no honest kilo, so none of them is a load lifted for a counted number of reps. The work happened — it just cannot be read as a 1RM. Log a set of reps at a stated load and this can be estimated.'
		case 'reps-out-of-range':
			return `Your best set here is above ${MAX_ESTIMATOR_REPS} reps, where these equations stop being estimates at all. Log a set of ${MAX_ESTIMATOR_REPS} reps or fewer.`
		case 'effort-unknown':
			return 'None of your sets here says how close to failure it was, and in lifting there is no way to tell from the numbers. Mark a set as taken to failure, or record its reps in reserve.'
		case 'exercise-unmapped':
			return 'This movement has no validated reps-to-load relationship, so an estimate would be borrowing another lift’s curve. Record a rep max for it instead.'
		case 'load-not-on-the-bar':
			return 'Your sets here were not logged as a weight on the bar — they include your bodyweight, subtract an assist, count one hand, or are not a weight at all. A 1RM is a bar weight, so none of these can be read as one. Log a set as an external load, or record a rep max instead.'
		case 'load-kind-unstated':
			return 'Nothing on your sets here says what kind of load was lifted, so there is no way to tell a bar weight from a bodyweight one. Log a set stating its load and this can be estimated.'
	}
}
