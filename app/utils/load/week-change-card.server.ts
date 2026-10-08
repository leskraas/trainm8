/**
 * The reader behind the _Ukeskiftet_ card on I dag (#505 stories 42–55, ADR
 * 0080): the latest closed week's Week Replan and its proposals, each with the
 * session it is aimed at, plus whether the athlete has already made the coming
 * week easier.
 *
 * The card is **open** from the close (Sunday 20:00 local) until every
 * proposal is answered or applied. Home asks only for an open card, so on the
 * days in between it costs one indexed lookup and ships nothing; the card's
 * own resource route asks for it either way, so the answer the athlete just
 * gave comes back with what it changed, even when it was the last one.
 *
 * What the week that went looked like — the three numbers per track, the
 * missed and the extra sessions — is not read here: home's ledger already
 * holds that week, and the presenter builds it with the same week model
 * (`week-volumes.ts`), graded through Sunday once the week has closed.
 */

import { type Prisma } from '@prisma/client'
import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	proposalTooLate,
	type WeekChangeData,
	type WeekChangeProposal,
	type WeekChangeSession,
} from '#app/utils/load/week-change-card.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import {
	parseProposalPayload,
	type ProposalPayload,
} from '#app/utils/load/week-replan-proposal.ts'
import {
	proposalSelect,
	readStoredProposal,
} from '#app/utils/load/week-replan-proposals.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import { deriveLedgerStatus } from '#app/utils/training.ts'

const sessionSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	source: true,
	adoptedAt: true,
	releasedAt: true,
	workout: { select: { title: true, discipline: true } },
} satisfies Prisma.WorkoutSessionSelect

type SessionRow = Prisma.WorkoutSessionGetPayload<{
	select: typeof sessionSelect
}>

/**
 * The athlete's own "Gjør uka lettere": a week-wide scale, which only their tap
 * writes. It hangs off the closed week's Week Replan, but it is an answer the
 * athlete gave, not a proposal for them to answer.
 */
function isEase(payload: ProposalPayload): boolean {
	return payload.kind === 'scale' && payload.scope === 'week'
}

/**
 * The latest closed week's card, or null when there is no Week Replan for it
 * (or, with `onlyOpen`, when nothing is left to answer).
 */
export async function readWeekChange(
	userId: string,
	{
		now = new Date(),
		onlyOpen = false,
	}: { now?: Date; onlyOpen?: boolean } = {},
): Promise<WeekChangeData | null> {
	const timezone = await getAthleteTimezone(userId)
	const closedWeekKey = lastClosedWeekKey(now, timezone)
	const replan = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: { athleteId: userId, weekKey: closedWeekKey },
		},
		select: {
			reason: true,
			proposals: {
				orderBy: { createdAt: 'asc' },
				select: {
					...proposalSelect,
					answeredAt: true,
					targetSession: { select: sessionSelect },
				},
			},
		},
	})
	if (!replan) return null

	const stored = replan.proposals
		.map((row) => ({ ...row, ...readStoredProposal(row) }))
		.filter((proposal) => !isEase(proposal.payload))
	const otherIds = stored.flatMap((p) =>
		p.payload.kind === 'swap' ? [p.payload.otherSessionId] : [],
	)
	const others =
		otherIds.length === 0
			? []
			: await prisma.workoutSession.findMany({
					where: { id: { in: otherIds }, userId },
					select: sessionSelect,
				})
	const toSession = (session: SessionRow | null | undefined) =>
		session ? weekChangeSession(session, timezone, now) : null
	const proposals: WeekChangeProposal[] = stored.map(
		({ payload, ...proposal }) => ({
			id: proposal.id,
			payload,
			reason: proposal.reason,
			loadDirection: proposal.loadDirection,
			scope: proposal.scope,
			answer: proposal.answer,
			answeredAt: proposal.answeredAt,
			appliedAt: proposal.appliedAt,
			targetWeekKey: proposal.targetWeekKey,
			target: toSession(proposal.targetSession),
			other:
				payload.kind === 'swap'
					? toSession(others.find((s) => s.id === payload.otherSessionId))
					: null,
		}),
	)
	const todayKey = localDate(now, timezone)
	const open = proposals.some(
		(proposal) =>
			proposal.answer === 'pending' &&
			!proposal.appliedAt &&
			!proposalTooLate(proposal, todayKey),
	)
	if (onlyOpen && !open) return null

	const comingWeekKey = addDays(closedWeekKey, 7)
	const eased = await prisma.weekReplanProposal.findFirst({
		where: {
			athleteId: userId,
			kind: 'scale',
			targetSessionId: null,
			targetWeekKey: comingWeekKey,
			answer: 'accepted',
		},
		select: {
			appliedAt: true,
			answeredAt: true,
			createdAt: true,
			payload: true,
		},
	})

	return {
		closedWeekKey,
		comingWeekKey,
		reason: replan.reason,
		open,
		proposals,
		eased: eased ? easedOf(eased) : null,
	}
}

function easedOf(row: {
	appliedAt: Date | null
	answeredAt: Date | null
	createdAt: Date
	payload: string
}): NonNullable<WeekChangeData['eased']> {
	const payload = parseProposalPayload(row.payload)
	return {
		at: row.appliedAt ?? row.answeredAt ?? row.createdAt,
		volumes:
			payload.kind === 'scale' && payload.volumes ? payload.volumes : null,
	}
}

function weekChangeSession(
	session: SessionRow,
	timezone: string,
	now: Date,
): WeekChangeSession {
	return {
		id: session.id,
		title: session.workout?.title ?? null,
		discipline: session.workout?.discipline ?? null,
		dayKey: localDate(session.scheduledAt, timezone),
		owner: sessionOwner(session),
		status: deriveLedgerStatus(session, now),
	}
}
