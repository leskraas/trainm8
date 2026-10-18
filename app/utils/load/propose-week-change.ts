/**
 * The Week Replan's deterministic proposal author (#505, ADR 0080 step 1).
 *
 * Given the facts of a closed Training Week and the week after it, write the
 * proposals: what to change, and why, in plain Norwegian. Nothing here applies
 * anything — Ok, Nei takk and silence are `week-replan-proposals.server.ts`'s,
 * and they read only the proposal type, never this module. That is the
 * {@link ProposalAuthor} seam: AI later becomes a second author of the same
 * type, and the apply rules (ADR 0080 steps 2–5) do not move.
 *
 * The rules (v1):
 *
 * 1. **The week-level judgment is `decideWeekReplan`'s** (ADR 0025's band, TSB
 *    gate and 30 % floor, unchanged). When it would soften, every adjustable
 *    session of the coming week gets its own `scale` proposal at that factor —
 *    the athlete's own sessions too, but their reason says the session is
 *    theirs and changes only on a yes. When it holds, one week-level `keep`
 *    says why: "keep" is a real proposal, never the absence of one.
 * 2. **Each missed session of the closed week gets one proposal**, and the
 *    missed session itself stays on its day as _ikke gjort_ either way:
 *    - after a week that ran over plan, every missed session is let go — the
 *      load was done elsewhere, and making one up would undo any softening;
 *    - otherwise the **key** missed session (most Planned TSS; the earliest on a
 *      tie) is offered as a make-up `move` to the first free day still ahead in
 *      the coming week. That adds load, so it never applies without a yes;
 *    - every other missed session, and the key one when no day is free, is let
 *      go (`keep` on that session). One make-up a week at most, so a bad week
 *      never crams the next one.
 * 3. **A slot the machine laid that was missed two closed weeks running**
 *    gets a plain `move` of its coming occurrence to a free day ahead — the
 *    day may not suit the athlete, so the athlete chooses _bare denne gangen_
 *    or _fra nå av_. It keeps the load, so it is a reschedule, not more
 *    training; a free day the make-up already took is not offered again.
 * 4. **An open-ended plan whose last round just ended gets its next round**
 *    (`proposeNextRound`, ADR 0079 §3): more after a round done to plan, which
 *    waits for a yes; the same after missed weeks, which silence appends.
 *
 * Pure: the caller gathers the facts; no clock, no DB.
 */

import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { formatSignedTsb } from '#app/utils/format.ts'
import {
	AUTOPILOT_REASON_LABELS,
	NB_WEEKDAY_LABELS,
	WEEK_CHANGE_REASON_LABELS,
	WEEK_HOLD_REASON_LABELS,
} from '#app/utils/labels.ts'
import { type SessionOwner } from '#app/utils/session-ownership.ts'
import { type WeeklyAdherence } from './adherence.ts'
import { proposeNextRound, type RoundFacts } from './propose-next-round.ts'
import { type TsbTrust } from './trustworthiness.ts'
import {
	type ProposalDraft,
	type ProposalPayload,
} from './week-replan-proposal.ts'
import { decideWeekReplan, type WeekReplanDecision } from './week-replan.ts'

/** What the author is given about a closed week and the week after it. */
export type WeekChangeFacts = {
	/** The coming week's Monday (YYYY-MM-DD) — where every proposal lands. */
	targetWeekKey: string
	/** The closed week's Weekly Plan Adherence (ADR 0019); null when unmeasurable. */
	adherence: WeeklyAdherence | null
	tsb: number | null
	trust: TsbTrust
	/**
	 * The coming week's sessions a scale can act on — future, still scheduled,
	 * with quantified cardio — **whoever owns them**. Ownership decides what an
	 * answer may do, not what may be proposed.
	 */
	adjustableSessions: Array<{ id: string; owner: SessionOwner }>
	/** The closed week's planned sessions that were not done (_ikke gjort_). */
	missedSessions: Array<{
		id: string
		title: string
		/** Its day, YYYY-MM-DD in the Athlete Timezone. */
		date: string
		plannedTss: number | null
	}>
	/** Days of the coming week, still ahead, with no session on them. Ascending. */
	freeDays: string[]
	/**
	 * An open-ended plan whose last round ended with the closed week, or null
	 * (ADR 0079 §3). Present, the author proposes the next round.
	 */
	round?: RoundFacts | null
	/**
	 * The machine's slots missed two closed weeks running — the same workout
	 * (title and discipline) on the same weekday, _ikke gjort_ both times —
	 * with that slot's still-planned session in the coming week. Optional: an
	 * author fed no such facts proposes no slot move.
	 */
	repeatMisses?: Array<{
		title: string
		/** The coming week's session of the slot, and its day. */
		next: { id: string; date: string }
	}>
	/**
	 * The athlete is on Autopilot at this close (ADR 0100). It changes no rule
	 * and no payload — only the wording: the reasons are then statements of
	 * what the close does (_er gjort kortere_), since nothing waits for a yes
	 * and the Autopilot Notice shows them as they are stored.
	 */
	autopilot?: boolean
}

/** The week's decision as the `WeekReplan` row stores it, plus its proposals. */
export type WeekChange = {
	/** `proposed` when at least one proposal is a change; else the hold's own outcome. */
	outcome: 'proposed' | 'no-change' | 'insufficient-data'
	/**
	 * The week-level reason the row stores: ADR 0025's composer for a week that
	 * holds, and a Norwegian sentence saying what is proposed for `proposed` —
	 * which is never worded as though anything were already applied.
	 */
	reason: string
	proposals: ProposalDraft[]
}

/** The seam: anything that turns a week's facts into proposals of one type. */
export type ProposalAuthor = (facts: WeekChangeFacts) => WeekChange

function weekday(date: string): string {
	return NB_WEEKDAY_LABELS[weekdayIndex(date)]!
}

function percent(fraction: number): string {
	return `${Math.round(fraction * 100)} %`
}

/**
 * The reasons' words for this close: asking under _Spør meg først_, stating
 * under Autopilot (ADR 0100). The same keys, so no rule can tell them apart.
 */
function wordsFor(facts: Pick<WeekChangeFacts, 'autopilot'>) {
	return facts.autopilot ? AUTOPILOT_REASON_LABELS : WEEK_CHANGE_REASON_LABELS
}

/** The week-level keep's reason, one per branch that holds the week. */
function keepReason(
	decision: Exclude<WeekReplanDecision, { outcome: 'adjusted' }>,
	facts: WeekChangeFacts,
): string {
	const ratio = facts.adherence?.ratio ?? 1
	return WEEK_HOLD_REASON_LABELS[decision.why]({
		over: percent(ratio - 1),
		under: percent(1 - ratio),
		tsb: facts.tsb == null ? '' : formatSignedTsb(facts.tsb),
		requiredDays: facts.trust.requiredDays,
		daysOfHistory: facts.trust.daysOfHistory,
	})
}

function scaleReason(
	ratio: number,
	tsb: number,
	scale: number,
	owner: SessionOwner,
	R: ReturnType<typeof wordsFor>,
): string {
	const base = R.scale(
		percent(ratio - 1),
		formatSignedTsb(tsb),
		percent(1 - scale),
	)
	return owner === 'athlete' ? `${base} ${R.theirs}` : base
}

type Missed = WeekChangeFacts['missedSessions'][number]

/** The key missed session: most Planned TSS, the earliest on a tie. */
function keyMissed(missed: Missed[]): Missed | null {
	return (
		[...missed].sort(
			(a, b) =>
				(b.plannedTss ?? 0) - (a.plannedTss ?? 0) ||
				a.date.localeCompare(b.date),
		)[0] ?? null
	)
}

function missedProposals(facts: WeekChangeFacts): ProposalDraft[] {
	const overloaded = facts.adherence?.band.tone === 'over'
	const key = overloaded ? null : keyMissed(facts.missedSessions)
	const freeDay = facts.freeDays[0] ?? null
	const R = wordsFor(facts)
	return facts.missedSessions.map((missed) => {
		const notDone = R.notDone(missed.title, weekday(missed.date))
		const draft = (payload: ProposalPayload, reason: string) => ({
			payload,
			targetSessionId: missed.id,
			targetWeekKey: facts.targetWeekKey,
			reason,
		})
		if (overloaded) {
			return draft({ kind: 'keep' }, R.letGoHeavyWeek(notDone))
		}
		if (missed === key && freeDay) {
			return draft(
				{
					kind: 'move',
					fromDate: missed.date,
					toDate: freeDay,
					makeUp: true,
				},
				R.makeUp(notDone, weekday(freeDay)),
			)
		}
		if (missed === key) {
			return draft({ kind: 'keep' }, R.letGoNoFreeDay(notDone))
		}
		return draft({ kind: 'keep' }, R.letGo(notDone))
	})
}

/**
 * Rule 3: a move for each slot missed two weeks running, to the first free day
 * of the coming week that is not its own day and not already `taken`.
 */
function repeatMissProposals(
	facts: WeekChangeFacts,
	taken: ReadonlySet<string>,
): ProposalDraft[] {
	const used = new Set(taken)
	const drafts: ProposalDraft[] = []
	const R = wordsFor(facts)
	for (const miss of facts.repeatMisses ?? []) {
		const toDate = facts.freeDays.find(
			(day) => day !== miss.next.date && !used.has(day),
		)
		if (!toDate) continue
		used.add(toDate)
		const slot = weekday(miss.next.date)
		drafts.push({
			payload: {
				kind: 'move',
				fromDate: miss.next.date,
				toDate,
				makeUp: false,
			},
			targetSessionId: miss.next.id,
			targetWeekKey: facts.targetWeekKey,
			reason: R.slotMove(miss.title, slot, weekday(toDate)),
		})
	}
	return drafts
}

/** The v1 author: ADR 0025's judgment, plus one proposal per missed session. */
export const proposeWeekChange: ProposalAuthor = (facts) => {
	const decision = decideWeekReplan({
		adherence: facts.adherence,
		tsb: facts.tsb,
		trust: facts.trust,
		adjustableSessions: facts.adjustableSessions.map(({ id }) => ({ id })),
	})

	const R = wordsFor(facts)
	const softening = decision.outcome === 'adjusted'
	const weekProposals: ProposalDraft[] = softening
		? facts.adjustableSessions.map((session) => ({
				payload: { kind: 'scale', factor: decision.scale },
				targetSessionId: session.id,
				targetWeekKey: facts.targetWeekKey,
				// The adjusted branch is only reached with a ratio and a TSB.
				reason: scaleReason(
					facts.adherence!.ratio,
					facts.tsb!,
					decision.scale,
					session.owner,
					R,
				),
			}))
		: [
				{
					payload: { kind: 'keep' },
					targetSessionId: null,
					targetWeekKey: facts.targetWeekKey,
					reason: keepReason(decision, facts),
				},
			]

	const missed = missedProposals(facts)
	const madeUpOn = new Set(
		missed.flatMap((draft) =>
			draft.payload.kind === 'move' ? [draft.payload.toDate] : [],
		),
	)
	const slotMoves = repeatMissProposals(facts, madeUpOn)
	const weekChanges = [...weekProposals, ...missed, ...slotMoves]
	const nextRound = facts.round
		? proposeNextRound(facts.round, { autopilot: facts.autopilot })
		: null
	const proposals = nextRound ? [...weekChanges, nextRound] : weekChanges
	const changes = weekChanges.some((p) => p.payload.kind !== 'keep')
	if (!changes && nextRound) {
		// The week itself holds; the plan's next round is the one change.
		return { outcome: 'proposed', reason: nextRound.reason, proposals }
	}
	if (changes) {
		// Nothing has changed when this is written, so the week's reason says
		// what is proposed — never "softened", which would claim an apply.
		return {
			outcome: 'proposed',
			reason: softening
				? R.weekSoften(
						percent(facts.adherence!.ratio - 1),
						formatSignedTsb(facts.tsb!),
						percent(1 - decision.scale),
					)
				: madeUpOn.size > 0
					? R.weekMakeUp
					: R.weekSlotMove,
			proposals,
		}
	}
	return {
		outcome: decision.outcome === 'adjusted' ? 'no-change' : decision.outcome,
		reason: decision.reason,
		proposals,
	}
}
