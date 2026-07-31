// The **ramp guard**: one documented constant, and a warning where the athlete's
// authored progression is steeper than the convention (ADR 0040 §12–13).
//
// Three properties the guard has to hold, each of which was a defect in the
// prototype this replaces:
//
// - **It warns and never blocks.** No platform in the #374 survey blocks on a ramp
//   figure. Nothing here returns a validation error, and no write path consults it.
// - **Its subject is what the athlete *authored*** — a segment's **Volume Ramp**
//   and its **Block Boundary Step** — and never a week-over-week difference. A
//   diff-based guard fires on a recovery week's rebound and on a taper, both of
//   which are the plan working as designed.
// - **A deliberate drop is intent.** A negative ramp or a negative boundary step
//   is the athlete saying "volume comes down here"; the guard has nothing to say
//   about it (ADR 0040 §4).
//
// The copy belongs to the surface, not to this module, but the rule it must follow
// is documented on `RAMP_GUARD_MAX`: a **convention**, never injury prevention.

import { type EnduranceSegmentSpec, type PhaseSpec } from './derive.ts'

/**
 * The steepest weekly progression the guard treats as conventional: **+8% per
 * loading week**.
 *
 * One constant, in code beside the domain knowledge it belongs with (ADR 0006),
 * replacing the prototype's four copies of `RAMP_WARN = 8` / `RAMP_HOT = 12`. The
 * two-level scheme is gone with them: a second threshold implies a second kind of
 * consequence, and there is only one — a warning.
 *
 * **It is a conservative convention and must never be presented as injury
 * prevention.** The 10% rule has a failed RCT behind it (Buist et al. 2008,
 * n=532: 20.8% vs 20.3% injured, P=.90); Nielsen et al. 2014's primary outcome
 * was also null and its authors advise <30%; Gabbett calls <10% "more of a guide
 * than a rule". 5–8%/week is where the coaching literature sits, so that is what
 * the copy may claim and no more (ADR 0040 §13).
 */
export const RAMP_GUARD_MAX = 0.08

/** Which authored number the guard is speaking about. */
export type RampWarningSubject = 'ramp' | 'boundary-step'

/**
 * One warning: the number the athlete authored, and where. Carries no wording —
 * the surface words it, so the honesty rules on `RAMP_GUARD_MAX` are enforced
 * where the athlete reads them rather than duplicated as strings in here.
 */
export type RampWarning = {
	subject: RampWarningSubject
	/** Position in the phase sequence, so the surface can name the phase. */
	phaseIndex: number
	/** The authored fraction — `0.12` for +12%. */
	authored: number
}

/**
 * Every authored number in this track's endurance segments that is steeper than
 * the convention, in phase order.
 *
 * `phases` is read for its length only: a segment addressing a phase the season no
 * longer has authors nothing the athlete can see, so warning about it would point
 * at a card that is not on the page.
 */
export function rampWarnings(
	phases: PhaseSpec[],
	segments: EnduranceSegmentSpec[],
): RampWarning[] {
	const warnings: RampWarning[] = []

	for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
		const segment = segments.find(
			(candidate) => candidate.phaseIndex === phaseIndex,
		)
		if (!segment) continue
		// Ramp before boundary step, matching the order the segment authors them in:
		// the ramp is the progression through the block and the step is its opening.
		if (isSteep(segment.ramp)) {
			warnings.push({ subject: 'ramp', phaseIndex, authored: segment.ramp })
		}
		if (isSteep(segment.boundaryStep)) {
			warnings.push({
				subject: 'boundary-step',
				phaseIndex,
				authored: segment.boundaryStep,
			})
		}
	}

	return warnings
}

/**
 * Steeper than the convention *upward*. A drop is intent, so it is never steep.
 *
 * Narrows rather than returning a bare boolean, so the caller reads the number it
 * just tested instead of asserting it non-null a line later.
 */
function isSteep(authored: number | null): authored is number {
	return authored != null && authored > RAMP_GUARD_MAX
}
