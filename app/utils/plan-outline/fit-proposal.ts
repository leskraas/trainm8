// How a season that misses its Event could be made to land on it — as a
// **proposal**, never as a correction.
//
// A **Periodization Preset** is a fixed length and nothing stretches it to fill a
// run-in (ADR 0044 §3, `presets.ts`): a 21-week shape applied 12 weeks out leaves
// a plan that runs nine weeks past the Event, and the surface *says so* rather
// than quietly resizing what the shape recommended. That rule is about the app
// acting on its own. It leaves an athlete who does not plan for a living holding
// a true sentence — "your plan runs 9 weeks past your event" — and no idea which
// block to shorten, which is the gap this module closes.
//
// So: the app computes the edit, **names it in full**, and applies it only when
// the athlete taps. What lands is the ordinary resize they could have typed, on
// blocks that stay theirs to edit afterwards. Nothing here runs on its own, and
// nothing here runs at read time — a proposal is a reading, and applying it is an
// act the athlete takes.
//
// Pure: phases in, changes out. The service (`fitPlanToEvent`) recomputes this
// from stored rows rather than trusting a posted one, so the proposal an athlete
// tapped and the edit that lands cannot describe different seasons.

import { type EventFit } from './event-fit.ts'

/** A phase, as far as fitting is concerned: how long it is and whether it tapers. */
export type FittablePhase = {
	name: string
	weeks: number
	tapers: boolean
}

/** One phase's resize, in the proposal's own order. */
export type FitChange = {
	/** Position in the season, which is how the service addresses the phase. */
	index: number
	name: string
	from: number
	to: number
}

export type FitProposal = {
	/** Weeks the season gains (positive) or loses (negative). Never zero. */
	delta: number
	changes: FitChange[]
}

/**
 * A phase must keep at least one week. A phase resized to zero is a *deleted*
 * block wearing a resize's clothes, and deleting a block an athlete's shape chose
 * for them is not something a one-tap fit gets to do.
 */
const MIN_PHASE_WEEKS = 1

/**
 * The edit that would make the season end on the Event's week, or `null` where
 * there is nothing to propose.
 *
 * `null` in three cases, and each is a refusal to fabricate rather than a gap:
 *
 *   - the plan already ends on the Event's week, so there is no edit;
 *   - no phase may take the change — every candidate is already at its floor, or
 *     the season is nothing but a taper;
 *   - the change cannot be absorbed **in full**, because a partial fit would
 *     leave the athlete with a plan that still misses the Event *and* blocks they
 *     did not shorten. Better to say the shape cannot be trimmed that far and let
 *     them remove a block, which is a decision and not arithmetic.
 *
 * **Where the weeks go.** A tapering phase is never touched: its length is the
 * one part of a shape that is about the Event rather than about accumulation, and
 * an athlete fitting a calendar is not asking to re-plan their taper.
 *
 *   - **Adding** weeks puts every one of them in the *first* non-tapering phase.
 *     That is the base, and lengthening the base is what a longer run-in is for —
 *     a longer Peak is a different plan, not a longer version of this one.
 *   - **Taking** weeks takes them one at a time from whichever non-tapering phase
 *     is currently longest, ties going to the *later* one. This keeps a season's
 *     proportions rather than gutting one block, it cannot reach a short block
 *     until the long ones have come down to meet it, and the tie-break is what
 *     keeps the base at least as long as the build it feeds rather than letting
 *     the first block absorb every week.
 */
export function proposeFit(
	phases: readonly FittablePhase[],
	fit: EventFit,
): FitProposal | null {
	if (fit.kind === 'ends-on-event-week') return null
	const delta = fit.kind === 'ends-before' ? fit.weeks : -fit.weeks

	// Indices into the season, so a change addresses the phase by position and the
	// filtered order never becomes the authored one.
	const candidates = phases
		.map((phase, index) => ({ ...phase, index }))
		.filter((phase) => !phase.tapers)
	if (candidates.length === 0) return null

	const weeks = new Map(candidates.map((phase) => [phase.index, phase.weeks]))

	if (delta > 0) {
		const first = candidates[0]!
		weeks.set(first.index, first.weeks + delta)
	} else {
		for (let taken = 0; taken < -delta; taken++) {
			// The longest candidate that still has a week to give, earliest first.
			const target = candidates
				.filter((phase) => weeks.get(phase.index)! > MIN_PHASE_WEEKS)
				.sort(
					(a, b) =>
						weeks.get(b.index)! - weeks.get(a.index)! || b.index - a.index,
				)[0]
			// Nothing left to take: the season cannot be shortened this far without
			// removing a block, so there is no proposal rather than a partial one.
			if (!target) return null
			weeks.set(target.index, weeks.get(target.index)! - 1)
		}
	}

	const changes = candidates
		.filter((phase) => weeks.get(phase.index)! !== phase.weeks)
		.map((phase) => ({
			index: phase.index,
			name: phase.name,
			from: phase.weeks,
			to: weeks.get(phase.index)!,
		}))

	return changes.length === 0 ? null : { delta, changes }
}
