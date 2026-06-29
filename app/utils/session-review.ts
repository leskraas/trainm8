// The planned-vs-actual comparison that anchors the completed Workout Detail
// View (PRD #135, ADR 0019). Pure derivation: it pairs the materialized actual
// and Planned TSS — plus the prescribed and recorded duration/distance — into
// three comparison rows, so the route can render the verdict as text/tabular
// content without reading a chart. Honesty over guessing (ADR 0008): a side the
// model can't supply stays `null` (the caller renders "—"), never a fabricated
// number, and the Adherence Band only resolves when both TSS values exist.
import { sumBlockDistanceM, sumBlockDurationMin } from './dashboard.ts'
import { type AdherenceBand, sessionAdherence } from './load/adherence.ts'

/** One planned-vs-actual comparison; either side is `null` when unavailable. */
export type ReviewMetric = {
	planned: number | null
	actual: number | null
}

export type ReviewComparison = {
	/** Actual vs Planned TSS, with the Adherence Band when both are present. */
	tss: ReviewMetric & { band: AdherenceBand | null }
	/** Prescribed vs recorded moving time, in seconds. */
	duration: ReviewMetric
	/** Prescribed vs recorded distance, in metres. */
	distance: ReviewMetric
}

/** The minimal session shape the comparison reads — structural, so it's easy to
 * exercise in isolation (mirrors `toSessionLedgerEntry`). */
export type ReviewSession = {
	tssValue: number | null
	plannedTssValue: number | null
	workout: {
		blocks: Array<{
			repeatCount: number
			steps: Array<{ durationSec: number | null; distanceM: number | null }>
		}>
	} | null
	recording: {
		durationSec: number | null
		distanceM: number | null
	} | null
}

export function buildReviewComparison(session: ReviewSession): ReviewComparison {
	const plannedMin = session.workout
		? sumBlockDurationMin(session.workout.blocks)
		: null
	const plannedDistanceM = session.workout
		? sumBlockDistanceM(session.workout.blocks)
		: null

	return {
		tss: {
			planned: session.plannedTssValue,
			actual: session.tssValue,
			// The both-present / positive-denominator gate lives in
			// `sessionAdherence`, shared with the ledger so bands never drift.
			band:
				sessionAdherence(session.tssValue, session.plannedTssValue)?.band ??
				null,
		},
		duration: {
			planned: plannedMin != null ? plannedMin * 60 : null,
			actual: session.recording?.durationSec ?? null,
		},
		distance: {
			planned: plannedDistanceM,
			actual: session.recording?.distanceM ?? null,
		},
	}
}
