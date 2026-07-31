// The **`%1RM` soft warning**: a scheduled session whose authored load sits outside
// the band its strength segment's **Strength Goal** derives (ADR 0042 §9, ADR 0047
// §3).
//
// `strength-goal.ts` owns the decision — `isOutsideBand` is the bare predicate over
// one figure — and this module is the join that gives it real data: which segment a
// session's week falls in, which goal that segment authored, and which of the
// session's `%1RM`s miss the band that goal derives.
//
// Three properties it exists to hold:
//
// - **No schema change, because the quantity is already authored.**
//   `ExerciseSet.pct1RM` is a first-class stored value, mutually exclusive with
//   `weightKg`, so a session at 60% inside a `maximal-strength` segment is checkable
//   with no new mechanism (ADR 0047 §3). A session loaded entirely in kilograms has
//   nothing on this axis and is silently fine.
// - **It warns and never blocks** (ADR 0042 §9). Nothing here returns a validation
//   error and no write path may consult it: the goal derives the band, the athlete
//   authors the session, and a mismatch is a note.
// - **The reading carries no wording.** The session, the goal, the band and the
//   figures that missed it — the surface words it and `format.ts` renders the
//   percentages (ADR 0023), exactly as `RampWarning` and `AvailabilityFitWarning` do.
//
// Pure and data-shaped: the read boundary in `training.server.ts` prices each
// `WorkoutSession` into a plan-week index and hands over the `%1RM`s, so the
// decision is unit-testable with no database at all.

import { type StrengthGoal } from './derive.ts'
import {
	isOutsideBand,
	strengthPrescription,
	type Pct1RMBand,
} from './strength-goal.ts'

/**
 * A strength segment as the band check reads it: its dated window in index space and
 * the goal it authored. `goal` of `null` is a segment that authored none, which
 * derives no band — so its weeks have nothing to be outside of.
 */
export type BandFitSegment = {
	/** 0-based week this segment opens on, counted from the Outline's first week. */
	startWeekIndex: number
	weeks: number
	goal: StrengthGoal | null
}

/**
 * One scheduled session, already priced into plan-week space by the read boundary.
 *
 * `pct1RMs` is every authored `%1RM` the session's sets carry, in stored order. A set
 * priced in kilograms contributes none — the two columns are mutually exclusive — so
 * an empty list is a session with nothing on this axis rather than a session at 0%.
 */
export type BandFitSession = {
	sessionId: string
	/** 0-based plan week the session is scheduled in. */
	weekIndex: number
	pct1RMs: readonly number[]
}

/**
 * One session that misses its segment's band, with the band it missed. Carries no
 * wording.
 *
 * `outsidePct1RMs` is **distinct and ascending**: five sets at 60% inside a
 * `maximal-strength` segment is one thing wrong with the session, not five, and the
 * order is a property of the figures rather than of the stored rows.
 */
export type BandFitWarning = {
	sessionId: string
	weekIndex: number
	goal: StrengthGoal
	band: Pct1RMBand
	outsidePct1RMs: number[]
}

/**
 * The strength segment a week is lifted in, or null where it falls in a gap.
 *
 * **Deterministic on overlap**, by the same tie-break `strengthWeekTarget` uses — the
 * latest `startWeekIndex` wins — so a state the authoring service refuses can never
 * be read two ways by two surfaces.
 */
function segmentForWeek(
	segments: readonly BandFitSegment[],
	weekIndex: number,
): BandFitSegment | null {
	let holder: BandFitSegment | null = null
	for (const segment of segments) {
		const holds =
			segment.startWeekIndex <= weekIndex &&
			weekIndex < segment.startWeekIndex + segment.weeks
		if (holds && (!holder || segment.startWeekIndex >= holder.startWeekIndex)) {
			holder = segment
		}
	}
	return holder
}

/**
 * Every scheduled session whose authored `%1RM` sits outside the band its segment's
 * goal derives, in the order the sessions arrive.
 *
 * Silent for a session in a **gap** between segments, for a segment that authored no
 * goal, and for a session with no `%1RM` at all: each is a state with no band in it,
 * and none of the three is an error.
 */
export function bandFitWarnings(
	segments: readonly BandFitSegment[],
	sessions: readonly BandFitSession[],
): BandFitWarning[] {
	return sessions.flatMap((session) => {
		const goal = segmentForWeek(segments, session.weekIndex)?.goal
		if (goal == null) return []

		const outsidePct1RMs = [
			...new Set(session.pct1RMs.filter((pct) => isOutsideBand(goal, pct))),
		].sort((a, b) => a - b)
		if (outsidePct1RMs.length === 0) return []

		return [
			{
				sessionId: session.sessionId,
				weekIndex: session.weekIndex,
				goal,
				band: strengthPrescription(goal).band,
				outsidePct1RMs,
			},
		]
	})
}
