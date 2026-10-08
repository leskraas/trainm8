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
import { NB_WEEKDAY_LABELS } from '#app/utils/labels.ts'
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

/** "Forrige uke ble 25 % tyngre enn planlagt" — the overshoot, in Norwegian. */
function overClause(ratio: number): string {
	return `Forrige uke ble ${percent(ratio - 1)} tyngre enn planlagt`
}

const THEIRS = 'Dette er din økt, så den endres bare hvis du sier ja.'

/** The week-level keep's reason, one per branch that holds the week. */
function keepReason(
	decision: Exclude<WeekReplanDecision, { outcome: 'adjusted' }>,
	facts: WeekChangeFacts,
): string {
	const ratio = facts.adherence?.ratio ?? 1
	const tsb = facts.tsb == null ? '' : formatSignedTsb(facts.tsb)
	switch (decision.why) {
		case 'no-adherence':
			return 'Forrige uke hadde ingen planlagt belastning å måle mot, så vi har for lite å gå på. Denne uka står som planlagt.'
		case 'under':
			return `Forrige uke ble ${percent(1 - ratio)} lettere enn planlagt. Vi legger ikke på noe ekstra – denne uka står som planlagt.`
		case 'on-target':
			return 'Forrige uke gikk som planlagt. Denne uka står som den er.'
		case 'form-untrusted':
			return `${overClause(ratio)}, men formtallet er først til å stole på etter ${facts.trust.requiredDays} dager (dag ${facts.trust.daysOfHistory} av ${facts.trust.requiredDays}). Vi endrer ingenting ennå.`
		case 'form-missing':
			return `${overClause(ratio)}, men vi har ikke noe formtall. Uten det endrer vi ingenting.`
		case 'fresh':
			return `${overClause(ratio)}, men formen er ${tsb} – du tåler det. Denne uka står som planlagt.`
		case 'nothing-adjustable':
			return `${overClause(ratio)} og formen er ${tsb}, men det er ingen økter igjen denne uka som kan gjøres lettere. Vi endrer ingenting.`
	}
}

function scaleReason(
	ratio: number,
	tsb: number,
	scale: number,
	owner: SessionOwner,
): string {
	const base = `${overClause(ratio)}, og formen er ${formatSignedTsb(tsb)}. Vi foreslår å gjøre denne økta ca. ${percent(1 - scale)} kortere.`
	return owner === 'athlete' ? `${base} ${THEIRS}` : base
}

/**
 * A swap of two sessions' days, as any rule that proposes one must write it.
 * Exported though no v1 rule proposes a swap yet: it is the one home of the
 * swap-reason rule below, for this author's later rules and for the next
 * author behind the same seam, so the rule is written and tested once rather
 * than left for each to remember.
 * Silence takes a swap only when **both** sessions are the machine's when it
 * applies, so when either is the athlete's the reason says so — the athlete
 * reads why the swap waits for their yes.
 */
export function swapProposal({
	target,
	other,
	targetWeekKey,
	why,
}: {
	target: { id: string; owner: SessionOwner }
	other: { id: string; owner: SessionOwner }
	targetWeekKey: string
	/** The rule's own reason, a full sentence. */
	why: string
}): ProposalDraft {
	const theirs = target.owner === 'athlete' || other.owner === 'athlete'
	return {
		payload: { kind: 'swap', otherSessionId: other.id },
		targetSessionId: target.id,
		targetWeekKey,
		reason: theirs ? `${why} ${THEIRS_IN_SWAP}` : why,
	}
}

const THEIRS_IN_SWAP =
	'En av øktene er din, så byttet skjer bare hvis du sier ja.'

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
	return facts.missedSessions.map((missed) => {
		const notDone = `«${missed.title}» ble ikke gjort ${weekday(missed.date)}, og står der som ikke gjort.`
		const draft = (payload: ProposalPayload, reason: string) => ({
			payload,
			targetSessionId: missed.id,
			targetWeekKey: facts.targetWeekKey,
			reason,
		})
		if (overloaded) {
			return draft(
				{ kind: 'keep' },
				`${notDone} Uka var tung nok likevel, så vi foreslår å la den gå.`,
			)
		}
		if (missed === key && freeDay) {
			return draft(
				{
					kind: 'move',
					fromDate: missed.date,
					toDate: freeDay,
					makeUp: true,
				},
				`${notDone} Vil du ta den igjen ${weekday(freeDay)}? Den dagen er ledig. Det gir mer trening denne uka, så den legges bare inn hvis du sier ja.`,
			)
		}
		if (missed === key) {
			return draft(
				{ kind: 'keep' },
				`${notDone} Det er ingen ledig dag igjen denne uka, så vi foreslår å la den gå.`,
			)
		}
		return draft(
			{ kind: 'keep' },
			`${notDone} Vi foreslår å la den gå, så uka ikke blir for full.`,
		)
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
			reason: `«${miss.title}» ble ikke gjort ${slot} to uker på rad. Kanskje ${slot} ikke passer? Vi foreslår å flytte den til ${weekday(toDate)}, som er ledig – bare denne gangen, eller fra nå av.`,
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
	const nextRound = facts.round ? proposeNextRound(facts.round) : null
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
				? `${overClause(facts.adherence!.ratio)}, og formen er ${formatSignedTsb(facts.tsb!)}. Vi foreslår å gjøre de neste øktene ca. ${percent(1 - decision.scale)} kortere.`
				: madeUpOn.size > 0
					? 'En økt forrige uke ble ikke gjort. Vi foreslår å ta den igjen, men bare hvis du sier ja.'
					: 'En økt er ikke gjort to uker på rad. Vi foreslår å flytte den til en dag som er ledig.',
			proposals,
		}
	}
	return {
		outcome: decision.outcome === 'adjusted' ? 'no-change' : decision.outcome,
		reason: decision.reason,
		proposals,
	}
}
