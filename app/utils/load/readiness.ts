/**
 * Translate a Form (TSB) value into a plain-language readiness label.
 *
 * The product thesis is heavy analysis surfaced as one simple, trustworthy
 * number — so once TSB is trustworthy (see `trustworthiness.ts`), the Coach
 * card shows this label + a short recommendation instead of a bare number.
 *
 * Pure and page-agnostic: no UI or loader coupling. The signed-number display
 * (e.g. "+5 — fresh, go for the session") is composed by the caller.
 */

export type ReadinessTone = 'fresh' | 'neutral' | 'fatigued'

export type Readiness = {
	/** One-word state, e.g. "Fresh". */
	label: string
	/** Short imperative recommendation, e.g. "go for the session". */
	recommendation: string
	/** Severity band for styling/iconography. */
	tone: ReadinessTone
}

/**
 * TSB at/above this is "fresh" — rested enough to go hard. (Positive TSB means
 * fitness exceeds fatigue.)
 */
export const TSB_FRESH_AT_OR_ABOVE = 5

/**
 * TSB at/below this is "fatigued" — under meaningful load, favour recovery.
 * Between this and the fresh boundary is the neutral band.
 */
export const TSB_FATIGUED_AT_OR_BELOW = -10

export function readinessFromTsb(tsb: number): Readiness {
	if (tsb >= TSB_FRESH_AT_OR_ABOVE) {
		return {
			label: 'Fresh',
			recommendation: 'rested — go for the session',
			tone: 'fresh',
		}
	}
	if (tsb <= TSB_FATIGUED_AT_OR_BELOW) {
		return {
			label: 'Fatigued',
			recommendation: 'heavy — take it easy today',
			tone: 'fatigued',
		}
	}
	return {
		label: 'Neutral',
		recommendation: 'balanced — train as planned',
		tone: 'neutral',
	}
}
