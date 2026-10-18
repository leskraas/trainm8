/**
 * The Autopilot Notice on the server (#576, ADR 0100 §4–5): reading what the
 * autopilot wrote at the latest close, and taking it back — one change, or
 * all of them (_Angre_ / _Angre alt_).
 *
 * Every undo is `undoProposal`'s (#564): exact, idempotent, and refused once
 * the week has begun or a changed session has been trained. Nothing here
 * re-derives a change from its payload.
 */

import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import {
	type AutopilotNotice,
	type AutopilotNoticeProposal,
	buildAutopilotNotice,
} from './autopilot-notice.ts'
import { AutopilotOutcomeSchema } from './autopilot.ts'
import { readFirstUnbegunWeekKey } from './week-begun.server.ts'
import { readWeekEase } from './week-change-card.server.ts'
import { lastClosedWeekKey } from './week-change.ts'
import { parseProposalPayload } from './week-replan-proposal.ts'
import {
	type UndoProposalResult,
	type UndoRefusal,
	undoProposal,
} from './week-replan-undo.server.ts'

/**
 * The notice for the latest closed week, or null when that week did not close
 * under autopilot (or its apply step has not run yet).
 */
export async function readAutopilotNotice(
	userId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<AutopilotNotice | null> {
	const timezone = await getAthleteTimezone(userId)
	const closedWeekKey = lastClosedWeekKey(now, timezone)
	const replan = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: { athleteId: userId, weekKey: closedWeekKey },
		},
		select: {
			autopilot: true,
			autopilotAppliedAt: true,
			proposals: {
				// Only what the autopilot looked at: never the athlete's own ease.
				where: { autopilotOutcome: { not: null } },
				orderBy: { createdAt: 'asc' },
				select: {
					id: true,
					payload: true,
					reason: true,
					autopilotOutcome: true,
					undoneAt: true,
					targetSession: {
						select: {
							scheduledAt: true,
							source: true,
							adoptedAt: true,
							releasedAt: true,
							workout: { select: { title: true } },
						},
					},
				},
			},
		},
	})
	if (!replan?.autopilot || !replan.autopilotAppliedAt) return null

	const comingWeekKey = addDays(closedWeekKey, 7)
	const proposals: AutopilotNoticeProposal[] = replan.proposals.map((row) => ({
		id: row.id,
		payload: parseProposalPayload(row.payload),
		reason: row.reason,
		outcome: AutopilotOutcomeSchema.parse(row.autopilotOutcome),
		undone: row.undoneAt != null,
		target: row.targetSession
			? {
					title: row.targetSession.workout?.title ?? null,
					dayKey: localDate(row.targetSession.scheduledAt, timezone),
					owner: sessionOwner(row.targetSession),
				}
			: null,
	}))
	const [firstUnbegun, eased] = await Promise.all([
		readFirstUnbegunWeekKey(userId, now, timezone),
		readWeekEase(userId, comingWeekKey),
	])
	return buildAutopilotNotice({
		closedWeekKey,
		comingWeekKey,
		proposals,
		undoOpen: comingWeekKey >= firstUnbegun,
		eased,
	})
}

/** One _Angre_ on the notice: only a change the autopilot made. */
export async function undoAutopilotChange(
	userId: string,
	proposalId: string,
	now: Date = new Date(),
): Promise<UndoProposalResult> {
	const proposal = await prisma.weekReplanProposal.findFirst({
		where: { id: proposalId, athleteId: userId, autopilotOutcome: 'applied' },
		select: { id: true },
	})
	if (!proposal) return { ok: false, reason: 'not-found' }
	return undoProposal(userId, proposal.id, now)
}

export type UndoWeekResult =
	| { ok: true; undone: number; refused: UndoRefusal[] }
	| { ok: false; reason: UndoRefusal }

/**
 * _Angre alt_: every change the autopilot made at a week's close and that
 * still stands, newest first — so two changes to one session unwind in the
 * order they were written. What can be undone is; a refusal (one session
 * trained since, say) is reported and leaves its change standing.
 */
export async function undoAutopilotWeek(
	userId: string,
	closedWeekKey: string,
	now: Date = new Date(),
): Promise<UndoWeekResult> {
	const replan = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: { athleteId: userId, weekKey: closedWeekKey },
		},
		select: {
			autopilot: true,
			proposals: {
				where: { autopilotOutcome: 'applied', undoneAt: null },
				orderBy: { createdAt: 'desc' },
				select: { id: true, payload: true },
			},
		},
	})
	if (!replan?.autopilot) return { ok: false, reason: 'not-found' }
	let undone = 0
	const refused: UndoRefusal[] = []
	for (const proposal of replan.proposals) {
		// A keep wrote nothing: there is nothing of it to take back.
		if (parseProposalPayload(proposal.payload).kind === 'keep') continue
		const result = await undoProposal(userId, proposal.id, now)
		if (!result.ok) refused.push(result.reason)
		else if (result.undone) undone++
	}
	if (undone === 0 && refused.length > 0) {
		return { ok: false, reason: refused[0]! }
	}
	return { ok: true, undone, refused }
}
