/**
 * The next round of an open-ended plan, as a proposal (#505 stories 2–6, ADR
 * 0079 §2–3, §5): when the week that just closed is the last week of the
 * plan's last round, the week change proposes the round after it — `Blokk
 * n+1`, one block of the plan's rhythm — with its volume and the reason for it.
 *
 * **How the round went decides the volume**, read from the round's own weeks
 * in Planned and actual TSS (`weeklyLoad`, ADR 0019):
 *
 * - **Done to plan**: every week of the round had planned load, and each came
 *   in at {@link ADHERENCE_ON_TARGET_AT_OR_ABOVE} (85 %) of it or more —
 *   actual over planned summed independently, so a missed session counts as
 *   nothing done rather than dropping out of the ratio the way a Weekly Plan
 *   Adherence would let it. The next round steps up by {@link ROUND_STEP_UP}.
 *   That adds load, so it waits for a yes.
 * - **Missed weeks**: one or more weeks came in under 85 % of plan. The next
 *   round keeps the volume (factor 1), and the reason says how many weeks
 *   slipped. Keeping load applies on silence, so the plan keeps moving.
 * - **Not measurable**: a week with no planned load has nothing to grade
 *   against, so the round is not called done to plan — it keeps the volume too,
 *   and says why. Never a step up on weeks nobody could measure.
 *
 * Pure: the caller reads the plan and the weeks; no clock, no DB.
 */

import { openEndedRoundName } from '#app/utils/labels.ts'
import { type Rhythm } from '#app/utils/plan-outline/derive.ts'
import { PRESET_RAMP } from '#app/utils/plan-outline/presets.ts'
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

/** What the author needs about an open-ended plan whose round just ended. */
export type RoundFacts = {
	outlineId: string
	/** The round that ended — the plan's last phase. */
	phaseId: string
	/** Its 1-based position, the "n" of _Blokk n_. */
	round: number
	/** The Monday (YYYY-MM-DD) the next round opens on. */
	nextWeekKey: string
	/** One block of the plan's rhythm (`openEndedRound`). */
	next: { weeks: number; rhythm: Rhythm }
	/** The ended round's weeks, each as its sessions' Planned and actual TSS. */
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

/**
 * Grade a round's weeks: missed weeks first (a slipped week is the stronger
 * statement), then unmeasurable ones, and done to plan only when every week
 * is measured and on plan.
 */
export function roundVerdict(weeks: RoundFacts['weeks']): RoundVerdict {
	let missed = 0
	let unmeasured = 0
	for (const week of weeks) {
		const load = weeklyLoad(week.sessions)
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

function weeksWord(count: number): string {
	return count === 1 ? '1 uke' : `${count} uker`
}

/** Why the next round is the size it is, in plain Norwegian. */
export function roundReason(
	verdict: RoundVerdict,
	round: number,
	total: number,
): string {
	const ended = openEndedRoundName(round)
	const next = openEndedRoundName(round + 1)
	switch (verdict.kind) {
		case 'done-to-plan':
			return `${ended} gikk etter planen: alle ${weeksWord(total)} ble gjort som planlagt. Vi foreslår ${next} med ca. ${Math.round((ROUND_STEP_UP - 1) * 100)} % mer trening. Det er mer belastning, så den legges bare inn hvis du sier ja.`
		case 'missed-weeks':
			return `I ${ended} ble ${verdict.missed} av ${weeksWord(total)} ikke gjort som planlagt. Vi foreslår ${next} med like mye trening som ${ended}, så planen ikke presser deg etter en tung blokk.`
		case 'unmeasured':
			return `Vi kunne ikke måle hele ${ended}: ${verdict.unmeasured} av ${weeksWord(total)} hadde ingen planlagt belastning å måle mot. Vi foreslår ${next} med like mye trening som ${ended}.`
	}
}

/** The next round's proposal: an `add-phase` aimed at the plan, never a session. */
export function proposeNextRound(facts: RoundFacts): ProposalDraft {
	const verdict = roundVerdict(facts.weeks)
	return {
		payload: {
			kind: 'add-phase',
			outlineId: facts.outlineId,
			afterPhaseId: facts.phaseId,
			name: openEndedRoundName(facts.round + 1),
			weeks: facts.next.weeks,
			rhythm: facts.next.rhythm,
			factor: roundFactor(verdict),
		},
		targetSessionId: null,
		targetWeekKey: facts.nextWeekKey,
		reason: roundReason(verdict, facts.round, facts.weeks.length),
	}
}
