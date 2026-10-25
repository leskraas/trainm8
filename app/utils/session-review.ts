// The planned-vs-actual comparison that anchors the completed Workout Detail
// View (PRD #135, ADR 0019). Pure derivation: it pairs the materialized actual
// and Planned TSS — plus the prescribed and recorded duration/distance — into
// three comparison rows, so the route can render the verdict as text/tabular
// content without reading a chart. Honesty over guessing (ADR 0008): a side the
// model can't supply stays `null` (the caller renders "—"), never a fabricated
// number, and the Adherence Band only resolves when both TSS values exist.
import { plannedMinutes, sumBlockDistanceM } from './dashboard.ts'
import { type DisciplineThresholdMap } from './intensity-target.ts'
import { type AdherenceBand, sessionAdherence } from './load/adherence.ts'
import {
	type PlannedMetric,
	type PlannedSessionMetric,
	plannedMetricValue,
	readPlannedMetric,
} from './planned-discipline.ts'

/** One planned-vs-actual comparison; either side is `null` when unavailable. */
export type ReviewMetric = {
	planned: number | null
	/**
	 * The planned side as read through the planned discipline
	 * (`planned-discipline.ts`): the number, or the Unavailable Metric with its
	 * reason. `planned` is its value.
	 */
	plannedRead: PlannedMetric<number>
	actual: number | null
}

export type ReviewComparison = {
	/** Actual vs Planned TSS, with the Adherence Band when both are present. */
	tss: ReviewMetric & { band: AdherenceBand | null }
	/** Prescribed vs recorded moving time, in seconds. */
	duration: ReviewMetric & {
		/** The planned time was timed through a pace: it reads `≈ 50 min`. */
		plannedEstimated: boolean
	}
	/** Prescribed vs recorded distance, in metres. */
	distance: ReviewMetric
}

/** The minimal session shape the comparison reads — structural, so it's easy to
 * exercise in isolation (mirrors `toSessionLedgerEntry`). */
export type ReviewSession = {
	tssValue: number | null
	plannedTssValue: number | null
	workout: {
		/**
		 * The planned session's Discipline. Absent reads as a measured one — the
		 * route always passes it (the session's own select), so `other` is caught.
		 */
		discipline?: string
		blocks: Array<{
			repeatCount: number
			seriesRepeatCount?: number | null
			betweenSeriesRestSec?: number | null
			steps: Array<{
				kind?: string
				discipline?: string | null
				/** Stored Intensity Target JSON: the pace a distance step is timed by. */
				intensity?: string | null
				durationSec: number | null
				distanceM: number | null
			}>
		}>
	} | null
	recording: {
		durationSec: number | null
		distanceM: number | null
	} | null
}

export function buildReviewComparison(
	session: ReviewSession,
	/** What a distance step's pace resolves against (#615). */
	thresholds: DisciplineThresholdMap,
): ReviewComparison {
	// Only the prescription is planned; a recording-only session has no planned
	// side, so an unknown ('') discipline keeps today's reading.
	const discipline = session.workout?.discipline ?? ''
	const read = (metric: PlannedSessionMetric, measure: () => number | null) =>
		readPlannedMetric(discipline, metric, measure)

	const plannedTss = read('planned-tss', () => session.plannedTssValue)
	const planned = session.workout
		? plannedMinutes(session.workout.blocks, {
				thresholds,
				discipline: session.workout.discipline,
			})
		: null
	const plannedTime = read('planned-time', () =>
		planned != null ? planned.minutes * 60 : null,
	)
	const plannedDistance = read('planned-distance', () =>
		session.workout ? sumBlockDistanceM(session.workout.blocks) : null,
	)
	const plannedTssValue = plannedMetricValue(plannedTss)

	return {
		tss: {
			planned: plannedTssValue,
			plannedRead: plannedTss,
			actual: session.tssValue,
			// The both-present / positive-denominator gate lives in
			// `sessionAdherence`, shared with the ledger so bands never drift.
			band: sessionAdherence(session.tssValue, plannedTssValue)?.band ?? null,
		},
		duration: {
			planned: plannedMetricValue(plannedTime),
			plannedRead: plannedTime,
			plannedEstimated: planned?.estimated ?? false,
			actual: session.recording?.durationSec ?? null,
		},
		distance: {
			planned: plannedMetricValue(plannedDistance),
			plannedRead: plannedDistance,
			actual: session.recording?.distanceM ?? null,
		},
	}
}
