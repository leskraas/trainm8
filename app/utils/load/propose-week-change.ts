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
 *
 * Pure: the caller gathers the facts; no clock, no DB.
 */

import { formatSignedTsb } from '#app/utils/format.ts'
import { type SessionOwner } from '#app/utils/session-ownership.ts'
import { type WeeklyAdherence } from './adherence.ts'
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
}

/** The week's decision as the `WeekReplan` row stores it, plus its proposals. */
export type WeekChange = {
	/** `proposed` when at least one proposal is a change; else the hold's own outcome. */
	outcome: 'proposed' | 'no-change' | 'insufficient-data'
	/** The week-level reason the row stores (ADR 0025's composer). */
	reason: string
	proposals: ProposalDraft[]
}

/** The seam: anything that turns a week's facts into proposals of one type. */
export type ProposalAuthor = (facts: WeekChangeFacts) => WeekChange

const WEEKDAY = [
	'søndag',
	'mandag',
	'tirsdag',
	'onsdag',
	'torsdag',
	'fredag',
	'lørdag',
] as const

function weekday(date: string): string {
	return WEEKDAY[new Date(`${date}T00:00:00.000Z`).getUTCDay()]!
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

	const proposals = [...weekProposals, ...missedProposals(facts)]
	const changes = proposals.some((p) => p.payload.kind !== 'keep')
	return {
		outcome: changes
			? 'proposed'
			: decision.outcome === 'adjusted'
				? 'no-change'
				: decision.outcome,
		reason: decision.reason,
		proposals,
	}
}
