/**
 * The facts of an open-ended plan's round that has just ended, as the week
 * change's author reads them (#505 S6, ADR 0079 §3). Null whenever there is no
 * round to propose: no open-ended plan, a plan resting behind a race plan, a
 * closed week before the plan's last week, or a next round already proposed
 * and still waiting, or already appended.
 *
 * A round is proposed at the close of the plan's last week. Past it, each
 * close proposes again while nothing is pending or appended — so a round the
 * athlete declined is asked about again at the next close rather than leaving
 * the plan to end on a no.
 */

import { weekBoundsFromMondayUTC } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { isOutlineResting } from '#app/utils/plan-outline/active-outline.server.ts'
import { RHYTHMS, type Rhythm } from '#app/utils/plan-outline/derive.ts'
import {
	familyForRhythm,
	openEndedRound,
} from '#app/utils/plan-outline/presets.ts'
import { weekIndexOf, weekKeyAt } from '#app/utils/plan-outline/week-keys.ts'
import { type RoundFacts } from './propose-next-round.ts'
import { parseProposalPayload } from './week-replan-proposal.ts'

function asRhythm(stored: string): Rhythm {
	return RHYTHMS.find((rhythm) => rhythm === stored) ?? 'none'
}

/**
 * The next round's length and rhythm: one block of the family the plan's last
 * round reads as (`familyForRhythm` → `openEndedRound`), or — for a round with
 * no rhythm, which no family has — that round's own length and rhythm again.
 */
export function nextRoundShape(last: { weeks: number; rhythm: Rhythm }): {
	weeks: number
	rhythm: Rhythm
} {
	const family = familyForRhythm(last.rhythm)
	return family
		? openEndedRound(family)
		: { weeks: last.weeks, rhythm: last.rhythm }
}

export async function readRoundFacts(
	userId: string,
	closedWeekKey: string,
	timezone: string,
	now: Date,
): Promise<RoundFacts | null> {
	const outline = await prisma.planOutline.findFirst({
		where: { athleteId: userId, eventId: null },
		select: {
			id: true,
			startWeekKey: true,
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: { id: true, weeks: true, rhythm: true },
			},
		},
	})
	const last = outline?.phases.at(-1)
	if (!outline || !last) return null
	if (await isOutlineResting(userId, { eventId: null }, now)) return null

	const total = outline.phases.reduce((sum, phase) => sum + phase.weeks, 0)
	if (weekIndexOf(outline.startWeekKey, closedWeekKey) < total - 1) return null

	// One round waiting, or appended, at a time.
	const proposed = await prisma.weekReplanProposal.findMany({
		where: {
			athleteId: userId,
			kind: 'add-phase',
			OR: [{ answer: 'pending' }, { appliedAt: { not: null } }],
		},
		select: { payload: true },
	})
	if (
		proposed.some((row) => {
			const payload = parseProposalPayload(row.payload)
			return payload.kind === 'add-phase' && payload.afterPhaseId === last.id
		})
	) {
		return null
	}

	const firstWeek = total - last.weeks
	const weeks = await Promise.all(
		Array.from({ length: last.weeks }, async (_, offset) => {
			const weekKey = weekKeyAt(outline.startWeekKey, firstWeek + offset)
			const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
			const sessions = await prisma.workoutSession.findMany({
				where: { userId, scheduledAt: { gte: start, lte: end } },
				select: { plannedTssValue: true, tssValue: true },
			})
			return {
				weekKey,
				sessions: sessions.map((session) => ({
					plannedTss: session.plannedTssValue,
					actualTss: session.tssValue,
				})),
			}
		}),
	)

	return {
		outlineId: outline.id,
		phaseId: last.id,
		round: outline.phases.length,
		nextWeekKey: weekKeyAt(outline.startWeekKey, total),
		next: nextRoundShape({ weeks: last.weeks, rhythm: asRhythm(last.rhythm) }),
		weeks,
	}
}
