/**
 * The next round of an open-ended plan, as a proposal (#505 stories 2–6, ADR
 * 0079 §2–3, §5): at the close of the round's second-to-last week, the week
 * change proposes the round after it — `Blokk n+1`, one block of the plan's
 * rhythm — with its volume and the reason for it. A week early on purpose: a
 * yes (or the morning's silence) then lands before the horizon reaches the new
 * round, so its first week is laid like any other.
 *
 * **How the round has gone decides the volume**, read from the weeks lived so
 * far, and from the **planned** sessions in them only — a session with Planned
 * TSS, and what was done of it. An extra session the plan never asked for adds
 * nothing to "done to plan": an unplanned long ride does not make up for the
 * planned week it replaced.
 *
 * - **Done to plan**: every graded week had planned sessions, and their actual
 *   TSS came to {@link ADHERENCE_ON_TARGET_AT_OR_ABOVE} (85 %) of their Planned
 *   TSS or more — a planned session not done counts as nothing done, rather
 *   than dropping out of the ratio as a Weekly Plan Adherence would let it. The
 *   next round steps up by {@link ROUND_STEP_UP}. That adds load, so it waits
 *   for a yes.
 * - **Missed weeks**: one or more graded weeks came in under 85 %. The next
 *   round keeps the volume (factor 1), and silence appends it.
 * - **Not measurable**: a graded week with no planned session has nothing to
 *   grade against, so it is never called done to plan — the volume stays.
 * - **Too early**: no lived week of the round to grade (a one-week round). The
 *   volume stays.
 *
 * Pure: the caller reads the plan and the weeks; no clock, no DB.
 */

import { nextRoundReason, openEndedRoundName } from '#app/utils/labels.ts'
import { type Rhythm } from '#app/utils/plan-outline/derive.ts'
import { PRESET_RAMP } from '#app/utils/plan-outline/presets.ts'
import { RAMP_GUARD_MAX } from '#app/utils/plan-outline/ramp-guard.ts'
import { ADHERENCE_ON_TARGET_AT_OR_ABOVE, weeklyLoad } from './adherence.ts'
import { type ProposalDraft } from './week-replan-proposal.ts'

/**
 * How much a round done to plan grows the next one: **+5 %**, the same Volume
 * Ramp convention every preset authors per loading week (`PRESET_RAMP`) and
 * inside the ramp guard's +8 % (`RAMP_GUARD_MAX`), so the step it writes as a
 * Block Boundary Step never trips a warning. One modest step per round, not
 * per week: a four-week round of 3:1 then grows about as fast as the build
 * blocks of a dated plan's base, and no faster.
 */
export const ROUND_STEP_UP = 1 + PRESET_RAMP

/** What the author needs about an open-ended plan whose round is ending. */
export type RoundFacts = {
	outlineId: string
	/** The round that is ending — the plan's last phase. */
	phaseId: string
	/** Its 1-based position, the "n" of _Blokk n_. */
	round: number
	/** The Monday (YYYY-MM-DD) after the plan's last week, where it would open. */
	nextWeekKey: string
	/** One block of the plan's rhythm (`openEndedRound`). */
	next: { weeks: number; rhythm: Rhythm }
	/**
	 * The steepest Volume Ramp the ending round carries into the next — its
	 * endurance segments', the Simple Activities' aside (they take no step) —
	 * or null for none. Read by {@link guardedRoundFactor}.
	 */
	ramp: number | null
	/**
	 * The lived weeks graded — the most recent ones, at most a round's length,
	 * never before the round opened — each as its sessions' Planned and actual
	 * TSS.
	 */
	weeks: Array<{
		weekKey: string
		sessions: Array<{ plannedTss: number | null; actualTss: number | null }>
	}>
}

/** How a round went, by its weeks. */
export type RoundVerdict =
	| { kind: 'done-to-plan' }
	| { kind: 'missed-weeks'; missed: number }
	| { kind: 'unmeasured'; unmeasured: number }
	| { kind: 'too-early' }

/**
 * Grade a round's weeks: missed weeks first (a slipped week is the stronger
 * statement), then unmeasurable ones, and done to plan only when every week
 * is measured and on plan. Only planned sessions are read.
 */
export function roundVerdict(weeks: RoundFacts['weeks']): RoundVerdict {
	if (weeks.length === 0) return { kind: 'too-early' }
	let missed = 0
	let unmeasured = 0
	for (const week of weeks) {
		const load = weeklyLoad(
			week.sessions.filter(
				(session) => session.plannedTss != null && session.plannedTss > 0,
			),
		)
		if (load.plannedTss == null) {
			unmeasured++
			continue
		}
		if (
			(load.actualTss ?? 0) / load.plannedTss <
			ADHERENCE_ON_TARGET_AT_OR_ABOVE
		)
			missed++
	}
	if (missed > 0) return { kind: 'missed-weeks', missed }
	if (unmeasured > 0) return { kind: 'unmeasured', unmeasured }
	return { kind: 'done-to-plan' }
}

/** The factor a verdict earns: a step up only for a round done to plan. */
export function roundFactor(verdict: RoundVerdict): number {
	return verdict.kind === 'done-to-plan' ? ROUND_STEP_UP : 1
}

/**
 * The factor the next round is authored at (ADR 0100 §3), in both modes: the
 * verdict's, but never so much that the round's first week rises past the
 * ramp guard's 8 % over the round's last loading week (#584). That week sits
 * one ramp step **and** the boundary step above it, so a +5 % ramp and a +5 %
 * round would be +10.25 %; under a +5 % ramp the round steps up about 2.9 %.
 * A ramp at the guard or past it leaves no room, and the round keeps the
 * volume. Floored to the boundary step's four decimals (`roundBoundaryStep`),
 * so the rounding cannot carry it back over. The same under Spør meg først as
 * under autopilot: the author's proposal does not depend on the mode.
 */
export function guardedRoundFactor(
	factor: number,
	ramp: number | null,
): number {
	const room = (1 + RAMP_GUARD_MAX) / (1 + Math.max(ramp ?? 0, 0))
	if (factor <= room) return factor
	return Math.max(1, Math.floor(room * 10_000) / 10_000)
}

/** The next round's proposal: an `add-phase` aimed at the plan, never a session. */
export function proposeNextRound(
	facts: RoundFacts,
	{ autopilot = false }: { autopilot?: boolean } = {},
): ProposalDraft {
	const verdict = roundVerdict(facts.weeks)
	const factor = guardedRoundFactor(roundFactor(verdict), facts.ramp)
	return {
		payload: {
			kind: 'add-phase',
			outlineId: facts.outlineId,
			afterPhaseId: facts.phaseId,
			name: openEndedRoundName(facts.round + 1),
			weeks: facts.next.weeks,
			rhythm: facts.next.rhythm,
			factor,
		},
		targetSessionId: null,
		targetWeekKey: facts.nextWeekKey,
		reason: nextRoundReason(
			verdict,
			facts.round,
			facts.weeks.length,
			Math.round((factor - 1) * 100),
			{ autopilot },
		),
	}
}
