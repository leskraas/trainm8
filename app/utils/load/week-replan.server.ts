/**
 * The Week Replan on the server (#196, PRD #194, ADR 0025 as amended by ADR
 * 0080).
 *
 * Run by the week change (`week-change.server.ts`: the hourly job, and every
 * load recompute — never a GET), this checks whether the most recently closed
 * Training Week has a stored `WeekReplan` yet. The week closes Sunday 20:00 in
 * the Athlete Timezone (`lastClosedWeekKey`), so from Sunday evening the
 * closed week is the one still on the calendar. If none is stored, it gathers
 * the facts of that week and the one after it — the closed week's Weekly Plan
 * Adherence (ADR 0019 semantics unchanged), the current TSB and its trust
 * gate, the coming week's adjustable sessions with their owners, the closed
 * week's missed sessions and the coming week's free days — hands them to a
 * {@link ProposalAuthor} (`proposeWeekChange` by default), and stores the
 * `WeekReplan` row and its proposals in one transaction.
 *
 * **It proposes; it writes nothing onto the sessions** (ADR 0080 replaces ADR
 * 0025 §3). What an Ok, a Nei takk and silence then do is
 * `week-replan-proposals.server.ts`'s, and ownership is checked there, at apply
 * time.
 *
 * **At-most-once.** The unique (athlete, weekKey) row IS the idempotency
 * guard: the first evaluation wins, late data never re-opens it, and no second
 * set of proposals is ever written. Holding outcomes (`no-change`,
 * `insufficient-data`) are stored with their reason and an explicit `keep`
 * proposal, and are equally never re-evaluated; older closed weeks are never
 * retro-evaluated because only the most recently closed week's key is ever
 * considered.
 */

import { Prisma } from '@prisma/client'
import {
	addDays,
	localDate,
	weekBoundsFromMondayUTC,
} from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sessionOwner } from '#app/utils/session-ownership.ts'
import { deriveLedgerStatus } from '#app/utils/training.ts'
import { weeklyAdherence } from './adherence.ts'
import {
	proposeWeekChange,
	type ProposalAuthor,
	type WeekChangeFacts,
} from './propose-week-change.ts'
import { getCurrentLoad, getTsbTrust } from './snapshot.server.ts'
import { lastClosedWeekKey } from './week-change.ts'
import { recordProposals } from './week-replan-proposals.server.ts'

/** What one evaluation did: which week it judged, and whether it wrote. */
export type WeekReplanRun = {
	/** The closed week's Monday — the `WeekReplan.weekKey` evaluated. */
	weekKey: string
	/**
	 * True when this call stored the week's decision; false when one was
	 * already stored (by an earlier run, or a run that won the race).
	 */
	created: boolean
}

/**
 * Evaluate the Week Replan for the most recently closed Training Week and
 * store its proposals, at most once per (athlete, closed week). A no-op when
 * that week already has a stored decision. Owner-scoped throughout. `now` is
 * injectable for tests and is stored as the decision's `createdAt`, the
 * instant the morning's silence counts from. The author is the seam AI later
 * plugs into.
 */
export async function applyWeekReplanForUser(
	userId: string,
	now: Date = new Date(),
	author: ProposalAuthor = proposeWeekChange,
): Promise<WeekReplanRun> {
	// The same Athlete Timezone every load surface buckets with (#122), so the
	// closed week here is exactly the week Weekly Plan Adherence measured.
	const timezone = await getAthleteTimezone(userId)

	// The most recently closed Training Week (it closes Sunday 20:00 local). Its
	// Monday is the weekKey — the only key ever evaluated, so older closed weeks
	// are never retro-evaluated.
	const weekKey = lastClosedWeekKey(now, timezone)

	// At-most-once: any stored decision for this weekKey — proposed or held —
	// means the evaluation already happened and won.
	const existing = await prisma.weekReplan.findUnique({
		where: { athleteId_weekKey: { athleteId: userId, weekKey } },
		select: { id: true },
	})
	if (existing) return { weekKey, created: false }

	const targetWeekKey = addDays(weekKey, 7)
	const [adherence, currentLoad, trust, coming, missedSessions] =
		await Promise.all([
			getClosedWeekAdherence(userId, weekKey, timezone),
			getCurrentLoad(userId),
			getTsbTrust(userId, now),
			getComingWeek(userId, targetWeekKey, timezone, now),
			getMissedSessions(userId, weekKey, timezone, now),
		])
	const tsb = currentLoad?.tsb ?? null

	const change = author({
		targetWeekKey,
		adherence,
		tsb,
		trust,
		adjustableSessions: coming.adjustable,
		missedSessions,
		freeDays: coming.freeDays,
	})

	try {
		await prisma.$transaction(async (tx) => {
			const replan = await tx.weekReplan.create({
				data: {
					athleteId: userId,
					weekKey,
					outcome: change.outcome,
					reason: change.reason,
					adherenceRatio: adherence?.ratio ?? null,
					tsb,
					createdAt: now,
				},
				select: { id: true },
			})
			await recordProposals(tx, userId, change.proposals, replan.id)
		})
	} catch (error) {
		// Two recomputes can race past the findUnique check above; the unique
		// (athlete, weekKey) index then aborts the loser's whole transaction —
		// proposals included, so no week ever holds two sets. First evaluation
		// wins: the loser no-ops instead of failing an otherwise-valid recompute.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === 'P2002'
		) {
			return { weekKey, created: false }
		}
		throw error
	}
	return { weekKey, created: true }
}

/**
 * The closed week's Weekly Plan Adherence (ADR 0019, unchanged semantics):
 * summed actual over summed Planned TSS across the week's sessions, `null`
 * when unmeasurable — `weeklyAdherence` owns the exclusion gate.
 */
async function getClosedWeekAdherence(
	userId: string,
	weekKey: string,
	timezone: string,
) {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		select: { tssValue: true, plannedTssValue: true },
	})
	return weeklyAdherence(
		sessions.map((s) => ({
			plannedTss: s.plannedTssValue,
			actualTss: s.tssValue,
		})),
	)
}

/**
 * The coming week as the author needs it: its adjustable sessions (ADR 0025
 * §3) with their owners, and its free days.
 *
 * Adjustable means future (`scheduledAt > now`), still-`scheduled`, carrying a
 * Workout with at least one quantified cardio step. Strength steps and
 * unquantified cardio are structurally excluded — no load model to scale. The
 * athlete's own sessions are **in** the set: ownership decides what an answer
 * may do, and a proposal on one says it is theirs (ADR 0080 step 3).
 *
 * A free day is a day of the week still ahead of today with no session on it
 * at all.
 */
async function getComingWeek(
	userId: string,
	targetMonday: string,
	timezone: string,
	now: Date,
): Promise<{
	adjustable: WeekChangeFacts['adjustableSessions']
	freeDays: string[]
}> {
	const { start, end } = weekBoundsFromMondayUTC(targetMonday, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: start, lte: end } },
		orderBy: { scheduledAt: 'asc' },
		select: {
			id: true,
			status: true,
			scheduledAt: true,
			source: true,
			adoptedAt: true,
			releasedAt: true,
			workout: {
				select: {
					blocks: {
						select: {
							steps: {
								select: { kind: true, durationSec: true, distanceM: true },
							},
						},
					},
				},
			},
		},
	})

	const adjustable = sessions
		.filter(
			(session) =>
				session.status === 'scheduled' &&
				session.scheduledAt > now &&
				(session.workout?.blocks ?? []).some((block) =>
					block.steps.some(
						(step) =>
							step.kind === 'cardio' &&
							(step.durationSec != null || step.distanceM != null),
					),
				),
		)
		.map((session) => ({ id: session.id, owner: sessionOwner(session) }))

	const today = localDate(now, timezone)
	const taken = new Set(
		sessions.map((session) => localDate(session.scheduledAt, timezone)),
	)
	const freeDays = Array.from({ length: 7 }, (_, i) =>
		addDays(targetMonday, i),
	).filter((day) => day > today && !taken.has(day))
	return { adjustable, freeDays }
}

/**
 * The closed week's planned sessions that were not done — the same _ikke
 * gjort_ the ledger derives (`deriveLedgerStatus`: stored missed or skipped, or
 * still scheduled once its time passed). Only sessions with a Workout: a
 * recording-only session was never a plan to miss.
 */
async function getMissedSessions(
	userId: string,
	weekKey: string,
	timezone: string,
	now: Date,
): Promise<WeekChangeFacts['missedSessions']> {
	const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: start, lte: end },
			workoutId: { not: null },
			status: { not: 'completed' },
		},
		orderBy: { scheduledAt: 'asc' },
		select: {
			id: true,
			status: true,
			scheduledAt: true,
			plannedTssValue: true,
			workout: { select: { title: true } },
		},
	})
	return sessions
		.filter((session) => deriveLedgerStatus(session, now) === 'missed')
		.map((session) => ({
			id: session.id,
			title: session.workout?.title ?? 'Økta',
			date: localDate(session.scheduledAt, timezone),
			plannedTss: session.plannedTssValue,
		}))
}
