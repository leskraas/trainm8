// The **days-against-days fit check**, over the whole plan rather than over one
// Training Track: a week's sessions — the endurance tracks' **Quality Session
// Count** *plus* the strength track's **Strength Frequency** — against the count
// of trainable weekdays **Training Availability** stores (ADR 0047 §4).
//
// **Why it is a module of its own, and not `quality-mix.ts`'s.** ADR 0045 §8 could
// only deliver the endurance half, "for the same reason §4 is: strength authors no
// session count", so the check began life beside the mix it read and warned per
// phase. Both halves are now stored, and the combined check is neither per track —
// it sums across them — nor per phase — a strength segment floats free of the
// phases (ADR 0047 §6), so one phase can hold weeks with lifting and weeks without.
// It is per **week**, over every track at once, which is a different object from
// anything the mix module owns; the per-phase reading it superseded is gone rather
// than kept beside it, so no surface can show two overlapping claims about a week.
//
// Four properties this module exists to hold:
//
// - **Days against days, and never anything else.** Training Availability stores
//   `trainableWeekdays` and a clock time and no capacity at all (ADR 0045 §8), so
//   this comparison needs no conversion — and can never become an hours one,
//   however honestly a week's hours are derived.
// - **A gap between strength segments is zero, not Unavailable.** "No lifting these
//   weeks" is the authored state, exactly as it is for the week's volume target.
//   The Unavailable case is narrower and different: a segment that authors no
//   **Strength Frequency** leaves its weeks with no second number, and the check
//   declines them rather than counting them as no lifting at all.
// - **Equality is silent, and it warns and never blocks.** A week that fills every
//   trainable day is a plan; two sessions can share a day; and the days are a
//   setting rather than a fact about the athlete's week. No write path may consult
//   this and nothing here returns a validation error (ADR 0042 §9).
// - **The reading carries no wording.** Counts and a span of weeks, exactly as
//   `RampWarning` and `BandFitWarning` carry numbers and a locator — the
//   surface words it, so the honesty rules stay where the athlete reads them.

import {
	phaseIndexForWeek,
	strengthSegmentForWeek,
	totalWeeks,
	type PhaseSpec,
} from './derive.ts'
import {
	qualitySessionCount,
	type QualitySessionMixEntry,
} from './quality-mix.ts'

/**
 * An endurance segment as the fit check reads it: which phase it spans, and the
 * **Quality Session Mix** the count is derived from (ADR 0042 §4).
 *
 * Structurally what `from-rows.ts`'s `SegmentReading` already is, so the surface's
 * rows pass straight in without a second shape to keep in step.
 */
export type EnduranceFitSegment = {
	kind: 'endurance'
	phaseIndex: number
	mix: readonly QualitySessionMixEntry[]
}

/**
 * A strength segment as the fit check reads it: its dated window in index space,
 * and the **Strength Frequency** it authors.
 *
 * `sessionsPerWeek` of `null` is a segment that authored no frequency — the one
 * state that makes a lifting week uncheckable.
 */
export type StrengthFitSegment = {
	kind: 'strength'
	/** 0-based week this segment opens on, counted from the Outline's first week. */
	startWeekIndex: number
	weeks: number
	sessionsPerWeek: number | null
}

/**
 * One Training Track segment, of either kind, in the same index space the rest of
 * the derivation works in. Discriminated exactly as `SegmentSpec` is, so a caller
 * flattening every track's segments into one list — which is what "cross-track"
 * means here — writes no mapping beyond the mix an endurance segment carries.
 */
export type FitSegment = EnduranceFitSegment | StrengthFitSegment

/** What one week asks for, split by where each half comes from. */
export type WeekSessionDemand = {
	/** Derived: the phases' **Quality Session Count**, summed over the tracks. */
	qualitySessions: number
	/** Authored: the **Strength Frequency** of the segment covering this week. */
	strengthSessions: number
}

/**
 * The strength segment a week is lifted in, or null where it falls in a gap.
 *
 * The tie-break itself is `derive.ts`'s and is not restated here: two segments
 * holding one week is a state the authoring service refuses, and the one rule
 * that resolves it — latest `startWeekIndex` wins — is exported so this check and
 * the week's target cannot read one overlap two ways. All this arm adds is the
 * narrowing to the strength kind.
 */
function strengthSegmentHolding(
	segments: readonly FitSegment[],
	weekIndex: number,
): StrengthFitSegment | null {
	return strengthSegmentForWeek(
		segments.filter((s): s is StrengthFitSegment => s.kind === 'strength'),
		weekIndex,
	)
}

/**
 * How many sessions one plan week asks for, or `null` where the question cannot be
 * answered honestly.
 *
 * Three answers, in this order:
 *
 * 1. A week **outside the plan** has no demand — there is no phase to read a mix
 *    from and nothing the athlete authored for it.
 * 2. A week inside a strength segment that authors **no frequency** is `null`: the
 *    second half of the comparison is missing, and counting it as zero would read
 *    as "no lifting" for a week the athlete did author lifting in.
 * 3. Otherwise the two counts, with a **gap** between strength segments
 *    contributing `0` — the authored "no lifting these weeks" (ADR 0047 §6).
 *
 * Every track's segment for the week counts, because a session is a session
 * whichever track prescribes it: a plan carries one track per Discipline (ADR 0043
 * §1), and "does my week fit" can only be asked of the whole week. A per-track
 * figure would answer a question nobody has, and the combined figure is a sum over
 * tracks by construction anyway — that is what ADR 0047 §4 delivered.
 */
export function weekSessionDemand(
	phases: PhaseSpec[],
	segments: readonly FitSegment[],
	weekIndex: number,
): WeekSessionDemand | null {
	const phaseIndex = phaseIndexForWeek(phases, weekIndex)
	if (phaseIndex == null) return null

	const strength = strengthSegmentHolding(segments, weekIndex)
	if (strength && strength.sessionsPerWeek == null) return null

	const qualitySessions = segments.reduce(
		(total, segment) =>
			segment.kind === 'endurance' && segment.phaseIndex === phaseIndex
				? total + qualitySessionCount(segment.mix)
				: total,
		0,
	)

	return { qualitySessions, strengthSessions: strength?.sessionsPerWeek ?? 0 }
}

/**
 * A stretch of weeks that ask for more sessions than the athlete has trainable
 * weekdays, and how much of it is which kind of work. Carries no wording.
 *
 * A **span** rather than one entry per week: the check has to be per-week, because
 * a strength segment can open and close inside a phase, but an eight-week block
 * that asks the same thing every week is one thing to say and not eight. Runs break
 * on any change in the counts, on a week that fits, and on a week the check
 * declines — so no span ever claims weeks it did not check.
 */
export type AvailabilityFitWarning = {
	/** 0-based first and last plan week of the run. Single weeks have both equal. */
	fromWeekIndex: number
	toWeekIndex: number
	qualitySessions: number
	strengthSessions: number
	trainableWeekdays: number
}

/**
 * Soft, advisory, never blocking: every stretch of the plan whose weeks ask for
 * more sessions than the athlete has trainable weekdays.
 *
 * `trainableWeekdays` of `null` means the athlete never set their availability,
 * which yields no warnings at all — the app has nothing to compare against and does
 * not guess. An explicitly emptied list is `0`, which is a statement they made and
 * is compared like any other number.
 *
 * **Equality is silent**: only strictly greater warns. A mix and a lifting schedule
 * that between them fill every trainable day is a plan, not a mistake — two
 * sessions can share a day, and the day list is a setting rather than a fact.
 */
export function availabilityFitWarnings(
	phases: PhaseSpec[],
	segments: readonly FitSegment[],
	trainableWeekdays: number | null,
): AvailabilityFitWarning[] {
	if (trainableWeekdays == null) return []

	const warnings: AvailabilityFitWarning[] = []
	for (let week = 0; week < totalWeeks(phases); week++) {
		const demand = weekSessionDemand(phases, segments, week)
		if (!demand) continue
		if (demand.qualitySessions + demand.strengthSessions <= trainableWeekdays) {
			continue
		}

		const open = warnings.at(-1)
		const continues =
			open != null &&
			open.toWeekIndex === week - 1 &&
			open.qualitySessions === demand.qualitySessions &&
			open.strengthSessions === demand.strengthSessions
		if (continues) {
			open.toWeekIndex = week
		} else {
			warnings.push({
				fromWeekIndex: week,
				toWeekIndex: week,
				...demand,
				trainableWeekdays,
			})
		}
	}
	return warnings
}
