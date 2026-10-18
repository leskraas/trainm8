/**
 * The Autopilot Notice on the server (#576, ADR 0100 §4–5): reading what the
 * autopilot wrote at the latest close, and taking it back — one change, or
 * all of them (_Angre_ / _Angre alt_). Its lifecycle and history (#580): the
 * athlete seeing it, I dag letting it go once seen and begun, and every past
 * notice for _Se hele sesongen_.
 *
 * Every undo is `undoProposal`'s (#564): exact, idempotent, and refused once
 * the week has begun or a changed session has been trained. Nothing here
 * re-derives a change from its payload.
 */

import { type Prisma } from '@prisma/client'
import { addDays, localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import {
	type AutopilotNotice,
	type AutopilotNoticeProposal,
	buildAutopilotNotice,
	isNoticeOnToday,
} from './autopilot-notice.ts'
import { AutopilotOutcomeSchema } from './autopilot.ts'
import { readFirstUnbegunWeekKey } from './week-begun.server.ts'
import { readWeekEase } from './week-change-card.server.ts'
import {
	horizonWeekKey,
	lastClosedWeekKey,
	parseUnlaidReason,
} from './week-change.ts'
import { parseProposalPayload } from './week-replan-proposal.ts'
import {
	type UndoProposalResult,
	type UndoRefusal,
	undoProposal,
} from './week-replan-undo.server.ts'

/** What one closed week's notice is read from. */
const noticeReplanSelect = {
	weekKey: true,
	autopilotSeenAt: true,
	horizonUnlaid: true,
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
} satisfies Prisma.WeekReplanSelect

type NoticeReplan = Prisma.WeekReplanGetPayload<{
	select: typeof noticeReplanSelect
}>

/** Only a week that closed under autopilot and whose apply step has run. */
const appliedUnderAutopilot = {
	autopilot: true,
	autopilotAppliedAt: { not: null },
} satisfies Prisma.WeekReplanWhereInput

function noticeOf(
	replan: NoticeReplan,
	{
		timezone,
		now,
		firstUnbegun,
		eased,
	}: {
		timezone: string
		now: Date
		firstUnbegun: string
		eased: AutopilotNotice['eased']
	},
): AutopilotNotice {
	const comingWeekKey = addDays(replan.weekKey, 7)
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
	const unlaid = parseUnlaidReason(replan.horizonUnlaid)
	return buildAutopilotNotice({
		closedWeekKey: replan.weekKey,
		comingWeekKey,
		proposals,
		undoOpen: comingWeekKey >= firstUnbegun,
		eased,
		todayWeekKey: weekMonday(now, timezone),
		seen: replan.autopilotSeenAt != null,
		unlaid: unlaid
			? { weekKey: horizonWeekKey(replan.weekKey), reason: unlaid }
			: null,
	})
}

/**
 * The notice on I dag: the latest closed week's, while it still belongs there
 * (#580: until it has been seen and its week has begun). Null when that week
 * did not close under autopilot, its apply step has not run yet, or the notice
 * has left I dag — it is still at its week in _Se hele sesongen_.
 */
export async function readAutopilotNotice(
	userId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<AutopilotNotice | null> {
	const timezone = await getAthleteTimezone(userId)
	const closedWeekKey = lastClosedWeekKey(now, timezone)
	const replan = await prisma.weekReplan.findFirst({
		where: {
			athleteId: userId,
			weekKey: closedWeekKey,
			...appliedUnderAutopilot,
		},
		select: noticeReplanSelect,
	})
	if (!replan) return null

	const comingWeekKey = addDays(closedWeekKey, 7)
	const [firstUnbegun, eased] = await Promise.all([
		readFirstUnbegunWeekKey(userId, now, timezone),
		readWeekEase(userId, comingWeekKey),
	])
	const notice = noticeOf(replan, { timezone, now, firstUnbegun, eased })
	const onToday = isNoticeOnToday({
		begun: notice.begun,
		seenDayKey: replan.autopilotSeenAt
			? localDate(replan.autopilotSeenAt, timezone)
			: null,
		todayKey: localDate(now, timezone),
	})
	return onToday ? notice : null
}

/** How many past notices _Se hele sesongen_ keeps: the timeline's half year. */
const HISTORY_WEEKS = 27

/**
 * Every notice the autopilot wrote, newest first, for _Se hele sesongen_ to
 * show at the week each one laid (#580, spec #558 story 87): the lines and
 * reasons as they stand, whether or not the notice has left I dag. Read-only:
 * the way back (_Angre_, _Gjør uka lettere_) lives on I dag's notice.
 */
export async function readAutopilotHistory(
	userId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<AutopilotNotice[]> {
	const timezone = await getAthleteTimezone(userId)
	const replans = await prisma.weekReplan.findMany({
		where: { athleteId: userId, ...appliedUnderAutopilot },
		orderBy: { weekKey: 'desc' },
		take: HISTORY_WEEKS,
		select: noticeReplanSelect,
	})
	if (replans.length === 0) return []
	const firstUnbegun = await readFirstUnbegunWeekKey(userId, now, timezone)
	return replans.map((replan) =>
		noticeOf(replan, { timezone, now, firstUnbegun, eased: null }),
	)
}

/**
 * The athlete has seen a week's notice on I dag (#580). Only the first time
 * counts, and only a notice the autopilot wrote: a second post changes
 * nothing, and another week or another athlete's is not found.
 */
export async function markAutopilotNoticeSeen(
	userId: string,
	closedWeekKey: string,
	now: Date = new Date(),
): Promise<{ ok: boolean }> {
	const where = {
		athleteId: userId,
		weekKey: closedWeekKey,
		...appliedUnderAutopilot,
	}
	await prisma.weekReplan.updateMany({
		where: { ...where, autopilotSeenAt: null },
		data: { autopilotSeenAt: now },
	})
	return { ok: (await prisma.weekReplan.count({ where })) > 0 }
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
