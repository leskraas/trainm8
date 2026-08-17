import {
	CONFIDENCE_WEIGHTS,
	GRADE_HIGH_CUT,
	GRADE_MEDIUM_CUT,
	MAXIMALITY_FULL_ACTIVITIES,
	RECENCY_ZERO_DAYS,
} from './constants.ts'
import { type EstimateConfidence } from './types.ts'

/**
 * Grading a **Threshold Estimate**, on the four terms
 * `docs/research/zones-and-thresholds.md` §4 names: **coverage**, **recency**,
 * **maximality** and **residual**.
 *
 * The internal score is 0–1 and, exactly as ADR 0033 requires of a **Detection
 * Confidence**, it is **never stored and never displayed**. Only the ordinal
 * label leaves this module. A percentage on a threshold estimate would imply a
 * calibration nobody has done.
 */

export type ConfidenceTerms = {
	/** Fraction of the model's duration band that produced a usable value. */
	coverage: number
	/** Days since the most recent contributing effort. */
	recencyDays: number
	/** Distinct activities the contributing efforts came from. */
	contributingActivities: number
	/** Goodness of fit, r², or `null` where no fit was involved. */
	rSquared: number | null
}

/** Clamp to the unit interval — every term below is a 0–1 fraction. */
function unit(value: number): number {
	return Math.min(1, Math.max(0, value))
}

/**
 * The four terms, weighted, as one 0–1 score.
 *
 * **Maximality is a proxy and is labelled as one.** Nothing in the data records
 * that an effort was all-out, so it cannot be verified
 * (`docs/research/athlete-profile-from-history.md` §2). Spread across distinct
 * activities is what is available: a curve whose every point comes from one ride
 * describes that ride, not this athlete.
 *
 * Where no fit happened the residual term is dropped and the remaining three are
 * re-normalized, rather than scored zero — an observed maximum has no residual
 * because it is a reading, not a regression, and scoring it as a bad fit would
 * be a category error.
 */
export function scoreEstimate(terms: ConfidenceTerms): number {
	const coverage = unit(terms.coverage)
	const recency = unit(1 - terms.recencyDays / RECENCY_ZERO_DAYS)
	const maximality = unit(
		terms.contributingActivities / MAXIMALITY_FULL_ACTIVITIES,
	)

	const weights = CONFIDENCE_WEIGHTS
	if (terms.rSquared == null) {
		const total = weights.coverage + weights.recency + weights.maximality
		return (
			(coverage * weights.coverage +
				recency * weights.recency +
				maximality * weights.maximality) /
			total
		)
	}

	return (
		coverage * weights.coverage +
		recency * weights.recency +
		maximality * weights.maximality +
		unit(terms.rSquared) * weights.residual
	)
}

/** The 0–1 score as the ordinal label, the `structure-detection/grade.ts` idiom. */
export function gradeEstimate(score: number): EstimateConfidence {
	if (score >= GRADE_HIGH_CUT) return 'high'
	if (score >= GRADE_MEDIUM_CUT) return 'medium'
	return 'low'
}

const RANK: Record<EstimateConfidence, number> = { low: 0, medium: 1, high: 2 }

/**
 * Apply a ceiling, the way ADR 0033 caps an HR-classified detection at
 * `medium`. Used where the *method* has a trust limit no amount of data can
 * lift — a population regression being the clearest case.
 */
export function capConfidence(
	grade: EstimateConfidence,
	ceiling: EstimateConfidence,
): EstimateConfidence {
	return RANK[grade] > RANK[ceiling] ? ceiling : grade
}
