/**
 * The athlete's own taps on the Week Replan (#505, ADR 0080): Ok and Nei takk
 * on a proposal, "Gjør uka lettere −15 %", and "lås opp". Each is an explicit
 * yes (or no), so ownership never holds them back; what a yes writes is the
 * apply engine's (`week-replan-proposals.server.ts`), the same one silence
 * uses, so a proposal means the same thing whoever applies it.
 */

import {
	addDays,
	weekBoundsFromMondayUTC,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { sumBlockDistanceM, sumBlockDurationMin } from '#app/utils/dashboard.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import { ROUND_FACTOR_MAX, ROUND_FACTOR_MIN } from './week-change-schema.ts'
import {
	loadDirectionOf,
	type ProposalPayload,
	type ProposalScope,
} from './week-replan-proposal.ts'
import {
	afterApply,
	applyPayload,
	proposalData,
	proposalSelect,
	readStoredProposal,
	repriceSessions,
} from './week-replan-proposals.server.ts'

/** The athlete's "Gjør uka lettere −15 %" (#505 user story 51). */
export const EASE_WEEK_FACTOR = 0.85

const EASE_WEEK_REASON =
	'Du ba om en lettere uke, så de øktene som er igjen er gjort ca. 15 % kortere.'

// ── answering ───────────────────────────────────────────────────────────────

export type AnswerProposalResult =
	| { ok: true; applied: boolean }
	| {
			ok: false
			reason:
				| 'not-found'
				| 'already-answered'
				| 'already-applied'
				| 'scope-not-a-move'
				| 'scope-not-for-a-make-up'
				| 'factor-not-a-round'
				| 'factor-out-of-range'
	  }

// The range a round's volume factor may be edited within lives with the
// card's forms, so the browser and this function hold the same bounds.
export { ROUND_FACTOR_MAX, ROUND_FACTOR_MIN }

/**
 * The athlete's Ok or Nei takk on one proposal. Ok applies it (with the move
 * scope they chose, for a move); Nei takk applies nothing. `applied` is false
 * on an Ok when the target is gone or past by now — the answer is still kept.
 *
 * A make-up takes no "fra nå av": it is a copy of a missed session on a free
 * day, not a reschedule of a slot, so there is nothing to move onward.
 */
export async function answerProposal(
	userId: string,
	proposalId: string,
	answer: 'accepted' | 'declined',
	scope?: ProposalScope,
	now: Date = new Date(),
): Promise<AnswerProposalResult> {
	return answerWith(userId, proposalId, answer, { scope }, now)
}

/**
 * Ok on an open-ended plan's next round, at the volume factor the athlete
 * chose rather than the one proposed (#505 story 6, ADR 0079 §3). The stored
 * payload is rewritten with their factor before it applies, and its load
 * direction is read off it again — a factor brought down to 1 keeps the load,
 * one raised above 1 adds it — so what is recorded is what was applied.
 */
export async function acceptRoundWithFactor(
	userId: string,
	proposalId: string,
	factor: number,
	now: Date = new Date(),
): Promise<AnswerProposalResult> {
	if (
		!Number.isFinite(factor) ||
		factor < ROUND_FACTOR_MIN ||
		factor > ROUND_FACTOR_MAX
	) {
		return { ok: false, reason: 'factor-out-of-range' }
	}
	return answerWith(userId, proposalId, 'accepted', { factor }, now)
}

async function answerWith(
	userId: string,
	proposalId: string,
	answer: 'accepted' | 'declined',
	{ scope, factor }: { scope?: ProposalScope; factor?: number },
	now: Date,
): Promise<AnswerProposalResult> {
	const row = await prisma.weekReplanProposal.findFirst({
		where: { id: proposalId, athleteId: userId },
		select: proposalSelect,
	})
	if (!row) return { ok: false, reason: 'not-found' }
	const stored = readStoredProposal(row)
	if (stored.answer !== 'pending') {
		return { ok: false, reason: 'already-answered' }
	}
	if (stored.appliedAt) return { ok: false, reason: 'already-applied' }
	if (scope && stored.payload.kind !== 'move') {
		return { ok: false, reason: 'scope-not-a-move' }
	}
	if (
		scope === 'from-now-on' &&
		stored.payload.kind === 'move' &&
		stored.payload.makeUp
	) {
		return { ok: false, reason: 'scope-not-for-a-make-up' }
	}
	if (factor != null && stored.payload.kind !== 'add-phase') {
		return { ok: false, reason: 'factor-not-a-round' }
	}
	const payload: ProposalPayload =
		factor != null && stored.payload.kind === 'add-phase'
			? { ...stored.payload, factor }
			: stored.payload
	const proposal = {
		...stored,
		payload,
		loadDirection: loadDirectionOf(payload),
	}

	const timezone = await getAthleteTimezone(userId)
	const chosenScope: ProposalScope = scope ?? proposal.scope ?? 'this-time'
	const outcome = await prisma.$transaction(async (tx) => {
		// Claim the proposal first, so a concurrent silence sweep and this answer
		// can never both apply it.
		const claimed = await tx.weekReplanProposal.updateMany({
			where: { id: proposal.id, answer: 'pending', appliedAt: null },
			data: {
				answer,
				answeredAt: now,
				...(payload.kind === 'move' ? { scope: chosenScope } : {}),
				...(payload !== stored.payload
					? {
							payload: JSON.stringify(payload),
							loadDirection: proposal.loadDirection,
						}
					: {}),
			},
		})
		if (claimed.count === 0) return null
		if (answer === 'declined') return { applied: false, changed: [] }

		const result = await applyPayload(tx, {
			userId,
			proposal,
			scope: chosenScope,
			by: 'yes',
			now,
			timezone,
		})
		if (result.applied) {
			await tx.weekReplanProposal.update({
				where: { id: proposal.id },
				data: { appliedAt: now },
			})
		}
		return result
	})
	if (!outcome) return { ok: false, reason: 'already-answered' }

	await afterApply(userId, outcome, timezone, now)
	return { ok: true, applied: outcome.applied }
}

// ── Gjør uka lettere −15 % ──────────────────────────────────────────────────

/** A week's planned volume: the numbers "før → etter" are read from. */
export type WeekVolume = {
	/** Prescribed minutes over the week's sessions (0 when none prescribe time). */
	durationMin: number
	/** Prescribed metres over the week's sessions (0 when none prescribe distance). */
	distanceM: number
	/** Summed Planned TSS over the sessions that have one. */
	plannedTss: number
}

export type EaseWeekResult =
	| {
			ok: true
			proposalId: string
			sessionsChanged: number
			before: WeekVolume
			after: WeekVolume
	  }
	| { ok: false; reason: 'not-a-week' | 'already-eased' }

/**
 * "Gjør uka lettere −15 %": the athlete's tap, which is its own yes. Writes an
 * accepted week-wide scale proposal at {@link EASE_WEEK_FACTOR} and applies it
 * to every still-scheduled session left in the week — the athlete's own too,
 * since they asked. Once per week: a second tap (or a double submit) never
 * compounds to −28 %.
 */
export async function easeWeek(
	userId: string,
	weekKey: string,
	now: Date = new Date(),
): Promise<EaseWeekResult> {
	if (!isMonday(weekKey)) return { ok: false, reason: 'not-a-week' }
	const already = await prisma.weekReplanProposal.findFirst({
		where: {
			athleteId: userId,
			kind: 'scale',
			targetSessionId: null,
			targetWeekKey: weekKey,
			answer: 'accepted',
		},
		select: { id: true },
	})
	if (already) return { ok: false, reason: 'already-eased' }

	const timezone = await getAthleteTimezone(userId)
	const before = await readWeekVolume(userId, weekKey, timezone)
	// The closed week's decision this week answers to, when there is one.
	const replan = await prisma.weekReplan.findUnique({
		where: {
			athleteId_weekKey: { athleteId: userId, weekKey: addDays(weekKey, -7) },
		},
		select: { id: true },
	})

	const payload: ProposalPayload = {
		kind: 'scale',
		factor: EASE_WEEK_FACTOR,
		scope: 'week',
	}
	const { proposalId, changed } = await prisma.$transaction(async (tx) => {
		const row = await tx.weekReplanProposal.create({
			data: {
				...proposalData(
					userId,
					{
						payload,
						targetSessionId: null,
						targetWeekKey: weekKey,
						reason: EASE_WEEK_REASON,
					},
					replan?.id ?? null,
				),
				answer: 'accepted',
				answeredAt: now,
				appliedAt: now,
			},
			select: proposalSelect,
		})
		const result = await applyPayload(tx, {
			userId,
			proposal: readStoredProposal(row),
			scope: 'this-time',
			by: 'yes',
			now,
			timezone,
		})
		return { proposalId: row.id, changed: result.changed }
	})
	await repriceSessions(userId, changed)

	return {
		ok: true,
		proposalId,
		sessionsChanged: changed.length,
		before,
		after: await readWeekVolume(userId, weekKey, timezone),
	}
}

function isMonday(weekKey: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(weekKey) && weekdayIndex(weekKey) === 0
}

async function readWeekVolume(
	userId: string,
	weekKey: string,
	timezone: string,
): Promise<WeekVolume> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		select: {
			plannedTssValue: true,
			workout: {
				select: {
					blocks: {
						select: {
							repeatCount: true,
							seriesRepeatCount: true,
							steps: { select: { durationSec: true, distanceM: true } },
						},
					},
				},
			},
		},
	})
	return sessions.reduce<WeekVolume>(
		(sum, session) => ({
			durationMin:
				sum.durationMin +
				(sumBlockDurationMin(session.workout?.blocks ?? []) ?? 0),
			distanceM:
				sum.distanceM + (sumBlockDistanceM(session.workout?.blocks ?? []) ?? 0),
			plannedTss: sum.plannedTss + (session.plannedTssValue ?? 0),
		}),
		{ durationMin: 0, distanceM: 0, plannedTss: 0 },
	)
}

// ── lås opp ─────────────────────────────────────────────────────────────────

/**
 * "Lås opp": hand one of the athlete's own sessions back to the app, so the
 * Week Replan may adjust it without asking — including a proposal written
 * before the release, when the morning's silence has not run over it yet (a
 * release does not make it stale). A session that is
 * already the machine's is left as it is. Rewriting its prescription later
 * re-adopts it (`updateWorkoutSession` clears `releasedAt`).
 */
export async function releaseSession(
	userId: string,
	sessionId: string,
	now: Date = new Date(),
): Promise<
	{ ok: true; released: boolean } | { ok: false; reason: 'not-found' }
> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: { id: true, source: true, adoptedAt: true, releasedAt: true },
	})
	if (!session) return { ok: false, reason: 'not-found' }
	if (sessionOwner(session) === 'machine') return { ok: true, released: false }
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { releasedAt: now },
	})
	return { ok: true, released: true }
}
