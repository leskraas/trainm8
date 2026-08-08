// The **two fit checks** a **Training Availability** supports, over the whole plan
// rather than over one Training Track.
//
// - **Days against days** (ADR 0047 §4): a week's sessions — the endurance tracks'
//   **Quality Session Count** *plus* the strength track's **Strength Frequency** —
//   against the count of trainable weekdays. Needs no conversion.
// - **Hours against hours** (ADR 0045 §8, unblocked by ADR 0050): the week's derived
//   endurance hours against the athlete's **Weekly Capacity**.
//
// **Neither supersedes the other, and they are computed independently.** They answer
// different questions — *can I fit the hard days* and *can I fit the hours* — and
// ADR 0050 §5 keeps both: the days check cannot tell five hours across five days from
// fifteen, and the hours check is silent for a plan whose hours are an **Unavailable
// Metric** and for an athlete who never authored a capacity. A week can fail one, the
// other, both, or neither.
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
// Five properties this module exists to hold:
//
// - **Each check compares like with like.** The days check counts sessions on both
//   sides and needs no conversion. The hours check derives a week's hours through the
//   **Volume Conversion** every other planned figure reads (ADR 0045), so the two
//   sides of it are hours and the derivation is the athlete's to inspect — an hours
//   comparison is honest only because the conversion is mix-aware, which is the
//   condition ADR 0043 §8 attached to deriving hours at all.
// - **Strength is on one side of the days check and neither side of the hours one.**
//   A lifting session is a session, so it fills a trainable day; but a strength track
//   has no per-session duration, so it prices no hours in either direction (ADR 0047
//   §5, ADR 0050 §3). The asymmetry is the model's, not an oversight, and it is why a
//   plan carrying strength still reads its cross-track hours total as Unavailable.
// - **A gap between strength segments is zero, not Unavailable.** "No lifting these
//   weeks" is the authored state, exactly as it is for the week's volume target.
//   The Unavailable case is narrower and different: a segment that authors no
//   **Strength Frequency** leaves its weeks with no second number, and the check
//   declines them rather than counting them as no lifting at all.
// - **Equality is silent, and both warn and never block.** A week that fills every
//   trainable day is a plan; two sessions can share a day; and the days are a
//   setting rather than a fact about the athlete's week. A week that spends exactly
//   the capacity is likewise the plan the athlete authored. No write path may consult
//   either and nothing here returns a validation error (ADR 0042 §9).
// - **The reading carries no wording.** Counts, hours and a span of weeks, exactly as
//   `RampWarning` and `BandFitWarning` carry numbers and a locator — the
//   surface words it, so the honesty rules stay where the athlete reads them.

import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	phaseIndexForWeek,
	roundToCurrency,
	strengthSegmentForWeek,
	totalWeeks,
	type PhaseSpec,
	type VolumeCurrency,
} from './derive.ts'
import { type SegmentReading, type WeekTargetReading } from './from-rows.ts'
import {
	qualitySessionCount,
	type QualitySessionMixEntry,
} from './quality-mix.ts'
import {
	convertWeeklyVolume,
	type ConversionContext,
	type ConversionProfile,
} from './volume-conversion.ts'

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

// ---------------------------------------------------------------------------
// Hours against hours — the week's derived endurance hours against the athlete's
// **Weekly Capacity** (ADR 0045 §8, unblocked by ADR 0050)
// ---------------------------------------------------------------------------

/** An endurance track as the hours check reads it: enough to price its weeks. */
export type HoursFitTrack = {
	discipline: Discipline
	currency: VolumeCurrency
	/** The derived weekly targets, in plan-week order. */
	targets: ReadonlyArray<Pick<WeekTargetReading, 'value'>>
	/** The phase-bound segments whose mixes price the weeks (ADR 0042 §8). */
	segments: ReadonlyArray<Pick<SegmentReading, 'phaseIndex' | 'mix'>>
}

const NO_PROFILE: ConversionProfile = {
	lthr: null,
	maxHr: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
}

const NO_CONTEXT: ConversionContext = { recipe: null, profile: NO_PROFILE }

/**
 * Every plan week's endurance hours, or `null` for a week no honest total exists
 * for — the left-hand side of the hours check.
 *
 * **Summed across the endurance tracks, and one `null` sinks the week.** A plan
 * carries one track per Discipline (ADR 0043 §1) and hours are commensurable across
 * them, but a total over *some* of the athlete's Disciplines would be read as their
 * whole week, which is the partial-sum defect ADR 0046 §2 names. A strength track is
 * skipped rather than declined: it prices no hours in either direction, and gating
 * the endurance tracks behind it would leave a hybrid athlete with no hours check at
 * all (ADR 0047 §5, ADR 0050 §3).
 *
 * **Not `plannedWeeklyLoad`'s hours.** The projection reads the same conversion, but
 * its gate is the **TSS** one: a week with no zone recipe has no TSS and often does
 * have hours — a run track authored in hours quotes them without deriving anything.
 * Reading the hours off a series that was `null`ed for a TSS reason would decline
 * comparisons this check can honestly make.
 */
export function weeklyEnduranceHours(input: {
	phases: PhaseSpec[]
	tracks: readonly HoursFitTrack[]
	/** The per-Discipline conversion inputs, as `readConversionContexts` reads them. */
	contexts: Partial<Record<Discipline, ConversionContext>>
}): Array<number | null> {
	const { phases, tracks, contexts } = input
	const endurance = tracks.filter((track) =>
		isCardioDiscipline(track.discipline),
	)
	const weeks = totalWeeks(phases)

	return Array.from({ length: weeks }, (_, week) => {
		// A plan with no endurance track at all has no hours, not zero hours: a pure
		// lifter's week costs time nothing in this model can price.
		if (endurance.length === 0) return null

		let total = 0
		for (const track of endurance) {
			const volume = track.targets[week]?.value ?? null
			// No **Season Anchor** in force, so the track prices no week at all — the
			// one way a target is absent (ADR 0047 §1).
			if (volume == null) return null
			const reading = convertWeeklyVolume({
				...(contexts[track.discipline] ?? NO_CONTEXT),
				discipline: track.discipline,
				currency: track.currency,
				volume,
				mix: mixForWeek(phases, track, week),
			}).hours
			if (!reading.available) return null
			total += reading.value
		}
		return total
	})
}

/**
 * The **Quality Session Mix** governing one week: the mix of the endurance segment
 * on the phase that holds it.
 *
 * `[]` where the phase has no segment — the same positive statement a stored segment
 * with no mix rows makes (ADR 0042 §6): a phase nobody has authored a progression
 * for has no quality sessions to price.
 */
function mixForWeek(
	phases: PhaseSpec[],
	track: Pick<HoursFitTrack, 'segments'>,
	week: number,
): readonly QualitySessionMixEntry[] {
	const phaseIndex = phaseIndexForWeek(phases, week)
	if (phaseIndex == null) return []
	return (
		track.segments.find((segment) => segment.phaseIndex === phaseIndex)?.mix ??
		[]
	)
}

/**
 * A stretch of weeks whose endurance hours outrun the athlete's **Weekly Capacity**.
 * Carries no wording.
 *
 * **Contiguity is the only thing that joins a run, and the run carries its worst
 * week.** The days check breaks a span on any change in the counts, because those
 * counts are small integers that genuinely repeat across a block. Hours are
 * continuous and move every week the ramp moves them, so the same rule would produce
 * one line per week — twenty lines for a twenty-week plan that never fits, which is
 * one thing to say said twenty times. `peakHours` is therefore the largest figure in
 * the run and is named as such: it is emphatically **not** what every week in the
 * span asks for.
 */
export type HoursFitWarning = {
	/** 0-based first and last plan week of the run. Single weeks have both equal. */
	fromWeekIndex: number
	toWeekIndex: number
	/** The largest weekly figure in the run — its worst week, not its average. */
	peakHours: number
	weeklyCapacityHours: number
}

/**
 * Soft, advisory, never blocking: every stretch of the plan whose endurance hours
 * outrun the athlete's **Weekly Capacity**.
 *
 * `weeklyCapacityHours` of `null` means the athlete has never authored one, which
 * yields no warnings at all — **unavailable, never passing** (ADR 0050). There is no
 * "explicitly emptied" counterpart here as there is for the weekday list: a capacity
 * of zero hours is not a statement an athlete makes about a week they train in, and
 * the schema refuses it.
 *
 * A week whose hours are `null` is **declined**, not compared: it breaks the run, so
 * no span ever claims a week the conversion could not price. A plan whose every week
 * is Unavailable produces nothing here and keeps the days check alone, which is
 * exactly the case ADR 0050 §5 keeps that check for.
 *
 * **Equality is silent**: only strictly greater warns. A plan that spends exactly the
 * capacity is the plan the athlete authored.
 *
 * **And equality is decided at the precision the athlete reads**, which is the one
 * place this module rounds. Rounding is otherwise the display layer's posture (ADR
 * 0045 §8) and the derived hours arrive as floats — but a warning is a sentence with
 * both numbers in it, and `8.04 h` against an `8 h` capacity would print "8.0 h/wk …
 * your weekly capacity is 8.0 h/wk", which reads as a defect rather than as a
 * warning. So the comparison is made on both sides at the hours currency's own
 * precision, and `peakHours` carries the figure that comparison used.
 */
export function hoursFitWarnings(
	weeklyHours: ReadonlyArray<number | null>,
	weeklyCapacityHours: number | null,
): HoursFitWarning[] {
	if (weeklyCapacityHours == null) return []
	const capacity = roundToCurrency(weeklyCapacityHours, 'hours')

	const warnings: HoursFitWarning[] = []
	for (let week = 0; week < weeklyHours.length; week++) {
		const raw = weeklyHours[week] ?? null
		const hours = raw == null ? null : roundToCurrency(raw, 'hours')
		if (hours == null || hours <= capacity) continue

		const open = warnings.at(-1)
		if (open != null && open.toWeekIndex === week - 1) {
			open.toWeekIndex = week
			open.peakHours = Math.max(open.peakHours, hours)
		} else {
			warnings.push({
				fromWeekIndex: week,
				toWeekIndex: week,
				peakHours: hours,
				weeklyCapacityHours,
			})
		}
	}
	return warnings
}
