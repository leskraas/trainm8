// How a season that misses its Event could be made to land on it — as a
// **proposal**, never as a correction — and the one rule that decides which
// blocks give.
//
// **The Season Fit rule, in one line: base absorbs first, the taper never.**
// Stated in full on `proposeFit` below, in ADR 0048 §3 and in `CONTEXT.md` under
// **Season Fit**. It is written down in those three places on purpose: a rule
// that exists only as the shape of a loop is a rule nobody can disagree with,
// and this one makes a claim about the athlete's race that they are entitled to
// argue with.
//
// A **Periodization Preset** is a fixed length and nothing stretches it to fill a
// run-in (ADR 0044 §3, `presets.ts`): a 21-week shape applied 12 weeks out leaves
// a plan that runs nine weeks past the Event, and the surface *says so* rather
// than quietly resizing what the shape recommended. That rule is about the app
// acting on its own. It leaves an athlete who does not plan for a living holding
// a true sentence — "your plan runs 9 weeks past your event" — and no idea which
// block to shorten, which is the gap this module closes.
//
// Nine shapes now ship rather than three, so the remainder this module has to
// absorb is small by construction — every run-in from ten to twenty-seven weeks
// is within two weeks of a shape. Breadth and the rule are two halves of one
// answer: more shapes mean the rule fires less often, and the rule means the
// gaps between shapes are not dead ground.
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
 * **Where the weeks go — the rule, stated.**
 *
 *   1. **The taper is never touched**, in either direction. Its length is the one
 *      part of a shape that is about the Event rather than about accumulation. A
 *      compressed taper is the single change that reliably costs an athlete the
 *      race they are fitting the calendar for, so it is not on the table at all.
 *   2. **Base absorbs first.** Every week — added or taken — goes to the *first*
 *      non-tapering phase before any other phase is considered.
 *   3. **Then forward through the season, block by block.** Where the base has
 *      reached its floor and weeks are still to come off, the next non-tapering
 *      phase gives, then the one after it. The **Peak** gives last, because it is
 *      the block nearest the Event and the most race-specific work in the season.
 *      The ordering is one sentence: *the further a block is from the Event, the
 *      sooner it gives.*
 *   4. **No block is trimmed out of existence** (`MIN_PHASE_WEEKS`), and a trim
 *      that cannot land in full is no proposal at all.
 *
 * Rule 2 is the one that changed, and it replaces a proportional rule — take from
 * whichever block is currently longest — that ADR 0048 §3 shipped. Proportional
 * spreading reads fairer and is worse: it takes weeks off the Peak while the base
 * is still long, which is a *different season* rather than a shorter run-up to
 * the same one. It also could not be said in a sentence, and a fitting rule that
 * an athlete cannot predict is one they cannot disagree with. ADR 0048 §3 is
 * amended rather than superseded — every other clause of it stands.
 *
 * The rule is deliberately **blunt about the base**: a base can come all the way
 * down to one week before the build gives anything. That is not an oversight. The
 * proposal names every block it changes before it is applied, so an athlete who
 * does not want a one-week base reads that and declines — which is a better
 * failure than a rule that quietly protects a proportion nobody chose.
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
		// Season order, front to back: the base is spent to its floor before the
		// block after it gives a week, and the Peak — nearest the Event — gives last.
		let remaining = -delta
		for (const phase of candidates) {
			if (remaining === 0) break
			const give = Math.min(remaining, phase.weeks - MIN_PHASE_WEEKS)
			if (give <= 0) continue
			weeks.set(phase.index, phase.weeks - give)
			remaining -= give
		}
		// Nothing left to take: the season cannot be shortened this far without
		// removing a block, so there is no proposal rather than a partial one.
		if (remaining > 0) return null
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

/**
 * What the rule did, as a clause: `shortens Base by 7 and Build by 2`.
 *
 * It lives beside the rule rather than in a route because **two** surfaces state
 * it and they must not word it differently: the shape step says what fitting a
 * candidate *would* do before the athlete picks it (ADR 0048 §2), and the plan
 * page offers the same edit afterwards. A shape whose fit is described one way on
 * the picker and another way on the plan is a shape the athlete cannot check.
 *
 * Every block the proposal touches is named. There is no "and 2 others" — the
 * whole point of stating a fitting rule is that its output is auditable against
 * the blocks on the page.
 */
export function fitRuleSummary(proposal: FitProposal): string {
	const verb = proposal.delta > 0 ? 'lengthens' : 'shortens'
	const clauses = proposal.changes.map((change) => {
		const by = Math.abs(change.to - change.from)
		return `${change.name} by ${by === 1 ? '1 week' : `${by} weeks`}`
	})
	return `${verb} ${joinClauses(clauses)}`
}

/** `a`, `a and b`, `a, b and c` — the list separator English actually uses. */
function joinClauses(clauses: string[]): string {
	if (clauses.length <= 1) return clauses.join('')
	return `${clauses.slice(0, -1).join(', ')} and ${clauses.at(-1)}`
}
