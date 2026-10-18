/**
 * The Autopilot Notice (UI _Neste uke er lagt ut_; #576, ADR 0100 §5): what
 * the autopilot wrote at a week's close, as lines the athlete reads on I dag.
 *
 * One line per proposal of the week's decision, in the author's order: a
 * change it made, with its stored reason and _Angre_; a session it left alone
 * because it is the athlete's; a missed session it let go; a step the guards
 * held. It states; it never asks — that is the Week Change Card's, under
 * _Spør meg først_.
 *
 * How long the notice stays on I dag, its history behind _Se hele sesongen_
 * and the could-not-lay line are #580's.
 *
 * Pure: no clock, no DB. The server reader is `autopilot-notice.server.ts`.
 */

import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import {
	AUTOPILOT_NOTICE_LABELS as L,
	NB_WEEKDAY_LABELS,
} from '#app/utils/labels.ts'
import { type SessionOwner } from '#app/utils/session-ownership.ts'
import { AUTOPILOT_STEP_UP_MAX, type AutopilotOutcome } from './autopilot.ts'
import { type WeekChangeData } from './week-change-card.ts'
import { type ProposalPayload } from './week-replan-proposal.ts'

/** One proposal of the decision, as the reader hands it in. */
export type AutopilotNoticeProposal = {
	id: string
	payload: ProposalPayload
	/** The stored Norwegian reason — worded as done, for a week closed under autopilot. */
	reason: string
	outcome: AutopilotOutcome
	undone: boolean
	/** The session it is aimed at, as it stands; null for a week-wide one. */
	target: { title: string | null; dayKey: string; owner: SessionOwner } | null
}

export type AutopilotNoticeLine = {
	proposalId: string
	/**
	 * `changed`: written, and can be undone; `kept`: the week stands as planned;
	 * `left-alone`: the athlete's own session stands; `let-go`: a missed
	 * session stays _ikke gjort_; `held`: nothing written (the guards, or nothing
	 * left to change).
	 */
	kind: 'changed' | 'kept' | 'left-alone' | 'let-go' | 'held'
	/** What the line is about, when the reason does not name it. */
	subject: string | null
	text: string
	/** A change's way back: offered, already taken, or past its window. */
	undo: 'offered' | 'undone' | 'closed' | null
}

export type AutopilotNotice = {
	closedWeekKey: string
	/** The week the changes landed in, and the one _Gjør uka lettere_ eases. */
	comingWeekKey: string
	lines: AutopilotNoticeLine[]
	/** How many changes can still be undone — _Angre alt_ shows from two. */
	undoable: number
	/** Said once under the lines when the window has closed on a change. */
	closedLine: string | null
	/** The athlete's own _Gjør uka lettere −15 %_, once made (ADR 0100 §5). */
	eased: WeekChangeData['eased']
}

function weekdayOf(dayKey: string): string {
	return NB_WEEKDAY_LABELS[weekdayIndex(dayKey)]!
}

function subjectOf(target: AutopilotNoticeProposal['target']): string | null {
	return target?.title
		? L.subject(target.title, weekdayOf(target.dayKey))
		: null
}

function percent(fraction: number): string {
	return `${Math.round(fraction * 100)} %`
}

function lineOf(
	proposal: AutopilotNoticeProposal,
	undoOpen: boolean,
): AutopilotNoticeLine {
	const { id, payload, reason, outcome, target } = proposal
	const line = (
		kind: AutopilotNoticeLine['kind'],
		text: string,
		subject: string | null = null,
		undo: AutopilotNoticeLine['undo'] = null,
	): AutopilotNoticeLine => ({ proposalId: id, kind, subject, text, undo })

	switch (outcome) {
		case 'applied': {
			if (payload.kind === 'keep') {
				return target ? line('let-go', reason) : line('kept', reason)
			}
			const undo = proposal.undone ? 'undone' : undoOpen ? 'offered' : 'closed'
			// A slot move's and a round's reasons name what they moved; a scale
			// on one session says only "økta", so the line names it.
			const subject = payload.kind === 'scale' ? subjectOf(target) : null
			return line('changed', reason, subject, undo)
		}
		case 'left-alone':
			return line(
				'left-alone',
				target?.title
					? L.leftAlone(weekdayOf(target.dayKey), target.title)
					: L.leftAloneUnnamed,
			)
		case 'not-placed':
			// A make-up's stored reason already says it was let go; an extra
			// session has no reason of the autopilot's own.
			return payload.kind === 'move'
				? line('let-go', reason)
				: line('let-go', L.notPlacedExtra)
		case 'over-guard':
			return line(
				'held',
				L.overGuard(percent(AUTOPILOT_STEP_UP_MAX - 1)),
				subjectOf(target),
			)
		case 'gone':
			return line('held', target?.title ? L.gone(target.title) : L.goneUnnamed)
	}
}

export function buildAutopilotNotice({
	closedWeekKey,
	comingWeekKey,
	proposals,
	undoOpen,
	eased,
}: {
	closedWeekKey: string
	comingWeekKey: string
	proposals: AutopilotNoticeProposal[]
	/** Whether the week the changes landed in is still not begun (ADR 0100 §4). */
	undoOpen: boolean
	eased: AutopilotNotice['eased']
}): AutopilotNotice {
	const lines = proposals.map((proposal) => lineOf(proposal, undoOpen))
	return {
		closedWeekKey,
		comingWeekKey,
		lines,
		undoable: lines.filter((line) => line.undo === 'offered').length,
		closedLine: lines.some((line) => line.undo === 'closed') ? L.closed : null,
		eased,
	}
}
