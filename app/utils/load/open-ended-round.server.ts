/**
 * The facts of an open-ended plan's round that is ending, as the week change's
 * author reads them (#505 S6, ADR 0079 §3). Null whenever there is no round to
 * propose: no open-ended plan, a plan resting behind a race plan, a closed
 * week before the round's second-to-last, or a next round already proposed and
 * still waiting, or already appended.
 *
 * A round is proposed at the close of the plan's **second-to-last** week, so
 * the answer can land before the horizon reaches the new round. Each later
 * close proposes again while nothing is pending or appended — a round the
 * athlete declined is asked about again rather than leaving the plan to end on
 * a no — and each time grades the most recent lived weeks (at most a round's
 * length, never before the round opened), so a re-proposal reads what has
 * happened since, not the same stale round again. Where the new round lands
 * when it applies is `appendOpenEndedRound`'s: never in the past.
 *
 * None either when the next round would take the plan past `MAX_PLAN_WEEKS`:
 * an open-ended plan runs for at most two years of rounds, the longest season
 * the Sesong edits can change (ADR 0079 "As built (#505 gaps)").
 */

import { weekBoundsFromMondayUTC } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { isOutlineResting } from '#app/utils/plan-outline/active-outline.server.ts'
import { MAX_PLAN_WEEKS } from '#app/utils/plan-outline/authoring-schema.ts'
import { rhythmOf, type Rhythm } from '#app/utils/plan-outline/derive.ts'
import { isSimpleActivityTrack } from '#app/utils/plan-outline/from-rows.ts'
import {
	openEndedRound,
	outlineFamily,
} from '#app/utils/plan-outline/presets.ts'
import { weekIndexOf, weekKeyAt } from '#app/utils/plan-outline/week-keys.ts'
import { type RoundFacts } from './propose-next-round.ts'
import { parseProposalPayload } from './week-replan-proposal.ts'

/**
 * The next round's length and rhythm: one block of the family the plan follows
 * (`outlineFamily`: the family it records, else the one its last round's
 * rhythm reads as → `openEndedRound`), or — for a plan with neither, a round
 * with no rhythm — that round's own length and rhythm again.
 */
export function nextRoundShape(
	family: string | null,
	last: { weeks: number; rhythm: Rhythm },
): {
	weeks: number
	rhythm: Rhythm
} {
	const follows = outlineFamily(family, last.rhythm)
	if (!follows) return { weeks: last.weeks, rhythm: last.rhythm }
	const { weeks, rhythm } = openEndedRound(follows)
	return { weeks, rhythm }
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
			family: true,
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: {
					id: true,
					weeks: true,
					rhythm: true,
					segments: {
						where: { kind: 'endurance' },
						select: { ramp: true, track: { select: { discipline: true } } },
					},
				},
			},
		},
	})
	const last = outline?.phases.at(-1)
	if (!outline || !last) return null
	if (await isOutlineResting(userId, { eventId: null }, now)) return null

	const total = outline.phases.reduce((sum, phase) => sum + phase.weeks, 0)
	const closed = weekIndexOf(outline.startWeekKey, closedWeekKey)
	if (closed < total - 2) return null

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

	const next = nextRoundShape(outline.family, {
		weeks: last.weeks,
		rhythm: rhythmOf(last.rhythm),
	})
	if (total + next.weeks > MAX_PLAN_WEEKS) return null

	const roundStart = total - last.weeks
	const firstGraded = Math.max(roundStart, closed - last.weeks + 1)
	const weeks = await Promise.all(
		Array.from(
			{ length: Math.max(0, closed - firstGraded + 1) },
			async (_, offset) => {
				const weekKey = weekKeyAt(outline.startWeekKey, firstGraded + offset)
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
			},
		),
	)

	// The ramp the next round carries on (`appendOpenEndedRound`); a Simple
	// Activity track takes no step, so its ramp is not one the round steps on.
	const ramps = last.segments
		.filter((segment) => !isSimpleActivityTrack(segment.track.discipline))
		.flatMap((segment) => (segment.ramp == null ? [] : [segment.ramp]))

	return {
		outlineId: outline.id,
		phaseId: last.id,
		ramp: ramps.length > 0 ? Math.max(...ramps) : null,
		round: outline.phases.length,
		nextWeekKey: weekKeyAt(outline.startWeekKey, total),
		next,
		weeks,
	}
}
