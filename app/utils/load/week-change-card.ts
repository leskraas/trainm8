/**
 * The _Ukeskiftet_ card's data (#505 stories 42–55, ADR 0080), as the server
 * reader (`week-change-card.server.ts`) hands it to the card, and the one rule
 * both sides read off it: whether a proposal can still be answered at all.
 *
 * Pure: no clock, no DB.
 */

import {
	type LoadDirection,
	type ProposalAnswer,
	type ProposalPayload,
	type ProposalScope,
	type WeekVolume,
} from '#app/utils/load/week-replan-proposal.ts'
import { type SessionOwner } from '#app/utils/session-ownership.ts'
import { type LedgerStatus } from '#app/utils/training.ts'

/** A session a proposal names, as the card says it. */
export type WeekChangeSession = {
	id: string
	/** The workout's title, or null for a session without one. */
	title: string | null
	discipline: string | null
	/** Its day, YYYY-MM-DD in the Athlete Timezone. */
	dayKey: string
	owner: SessionOwner
	status: LedgerStatus
}

export type WeekChangeProposal = {
	id: string
	payload: ProposalPayload
	reason: string
	loadDirection: LoadDirection
	scope: ProposalScope | null
	answer: ProposalAnswer
	answeredAt: Date | null
	appliedAt: Date | null
	targetWeekKey: string
	/** The session it is aimed at; null for a week-wide one, or one since deleted. */
	target: WeekChangeSession | null
	/** A swap's second session. */
	other: WeekChangeSession | null
}

export type WeekChangeData = {
	/** The closed week's Monday. */
	closedWeekKey: string
	/** The week the proposals land in, and the one "Gjør uka lettere" eases. */
	comingWeekKey: string
	/** The Week Replan's own week-level sentence. */
	reason: string
	/**
	 * Some proposal still waits for an answer the athlete can still give: the
	 * card asks. One whose session has passed meanwhile does not hold it open.
	 */
	open: boolean
	proposals: WeekChangeProposal[]
	/**
	 * The athlete's own "Gjør uka lettere −15 %" on the coming week, once made,
	 * with the week's planned volume before and after (null on an ease recorded
	 * before the numbers were kept).
	 */
	eased: {
		at: Date
		volumes: { before: WeekVolume; after: WeekVolume } | null
	} | null
}

/**
 * Whether a pending proposal can no longer do anything: the session it would
 * change has been done, missed or deleted, or the day it would put a session
 * on is behind today. An Ok would apply nothing, so the card says "for sent"
 * instead of asking — and such a proposal does not keep the card open.
 *
 * A keep and a next round are never too late: neither needs a session ahead.
 */
export function proposalTooLate(
	proposal: Pick<WeekChangeProposal, 'payload' | 'target' | 'other'>,
	todayKey: string,
): boolean {
	const { payload, target, other } = proposal
	const ahead = (session: WeekChangeSession | null) =>
		session != null && session.status === 'planned'
	switch (payload.kind) {
		case 'keep':
		case 'add-phase':
			return false
		case 'add':
			return payload.date < todayKey
		case 'move':
			return payload.makeUp
				? target == null || payload.toDate < todayKey
				: !ahead(target)
		case 'scale':
			return payload.scope === 'week' ? false : !ahead(target)
		case 'swap':
			return !ahead(target) || !ahead(other)
	}
}
