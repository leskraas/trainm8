// Accepting the strength track the athlete's own lifting proposes (#505 story
// 15): one tap, and the plan lifts — a track with targets, a block over the
// weeks left, lifting days in the week pattern and sessions in the weeks ahead.
// The athlete sets none of it up by hand, and edits any of it afterwards
// through the ordinary paths.

import { Prisma } from '@prisma/client'
import { parseTrainableWeekdays } from '#app/utils/athlete-schema.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { MAX_QUALITY_SESSIONS_PER_WEEK } from './authoring-schema.ts'
import { type AddTrackRefusal } from './authoring.server.ts'
import { type StrengthGoal } from './derive.ts'
import { readStrengthTrackOffer } from './history.server.ts'
import { relayPlanFrom } from './open-ended.server.ts'
import { proposeStarterPattern } from './starter-pattern.ts'
import { weekIndexOf } from './week-keys.ts'

/**
 * The goal the proposed block starts on. A history of sets says how often and
 * how much the athlete lifts, not what for, so the block opens on the general
 * goal — moderate loads, the most sets — and says so; the athlete changes it on
 * the block like any other.
 */
export const PROPOSED_STRENGTH_GOAL: StrengthGoal = 'hypertrophy'

export type AcceptStrengthOfferResult =
	| {
			ok: true
			trackId: string
			/** The block laid over the weeks left, or null when none are left. */
			segmentId: string | null
			/** Lifting days added to the week pattern. */
			days: number
	  }
	| { ok: false; reason: AddTrackRefusal | 'no-strength-history' }

/**
 * Accept the offer, read again here rather than trusted from the form, so what
 * is added is what the athlete's lifting says today. In one transaction:
 *
 * - **The track**: `sets`, anchored on the window's weekly average from the
 *   Plan Start Week, like any track added later.
 * - **A strength block** over the plan's weeks from the first unbegun one to
 *   its end, at the offer's Strength Frequency, so every week ahead has a
 *   target (a strength track's target comes from its blocks). Its rates are
 *   left to the convention; its goal is {@link PROPOSED_STRENGTH_GOAL}.
 * - **Lifting days** in the plan's week pattern — as many as the frequency,
 *   on the athlete's available days from the front of the week, the starter
 *   pattern's rule — each a fixed day on the athlete's most recent strength
 *   session, so a stamped lifting day is the session they actually do.
 *
 * After commit the weeks the plan laid are laid again and the weeks up to the
 * horizon filled (`relayPlanFrom`), so the lifting sessions are on the
 * calendar; contained and logged, as every re-lay is.
 */
export async function addProposedStrengthTrack(
	athleteId: string,
	outlineId: string,
	now: Date = new Date(),
): Promise<AcceptStrengthOfferResult> {
	const offer = await readStrengthTrackOffer(athleteId, now)
	if (!offer) return { ok: false, reason: 'no-strength-history' }
	const timezone = await getAthleteTimezone(athleteId)
	const fromWeekKey = await readFirstUnbegunWeekKey(athleteId, now, timezone)
	const [shape, profile] = await Promise.all([
		prisma.workoutSession.findFirst({
			where: {
				userId: athleteId,
				status: 'completed',
				scheduledAt: { lte: now },
				workout: { discipline: 'strength' },
			},
			orderBy: { scheduledAt: 'desc' },
			select: { workoutId: true },
		}),
		prisma.athleteProfile.findUnique({
			where: { userId: athleteId },
			select: { trainableWeekdays: true },
		}),
	])
	const sessionsPerWeek = Math.min(
		offer.sessionsPerWeek,
		MAX_QUALITY_SESSIONS_PER_WEEK,
	)

	let result: AcceptStrengthOfferResult
	try {
		result = await prisma.$transaction(async (tx) => {
			const outline = await tx.planOutline.findFirst({
				where: { id: outlineId, athleteId },
				select: {
					id: true,
					startWeekKey: true,
					phases: { select: { weeks: true } },
					tracks: { select: { discipline: true } },
					patterns: {
						orderBy: { orderIndex: 'asc' },
						take: 1,
						select: {
							id: true,
							days: { select: { weekday: true, orderInDay: true } },
						},
					},
				},
			})
			if (!outline) {
				return { ok: false as const, reason: 'outline-not-found' as const }
			}
			if (outline.tracks.some((track) => track.discipline === 'strength')) {
				return {
					ok: false as const,
					reason: 'discipline-already-tracked' as const,
				}
			}

			const track = await tx.trainingTrack.create({
				data: {
					outlineId: outline.id,
					discipline: 'strength',
					currency: 'sets',
					anchors: {
						create: [
							{ fromWeekKey: outline.startWeekKey, value: offer.anchor.value },
						],
					},
				},
				select: { id: true },
			})

			const total = outline.phases.reduce((sum, phase) => sum + phase.weeks, 0)
			const opens =
				fromWeekKey > outline.startWeekKey ? fromWeekKey : outline.startWeekKey
			const weeks = total - weekIndexOf(outline.startWeekKey, opens)
			const segment =
				weeks >= 1
					? await tx.trainingTrackSegment.create({
							data: {
								kind: 'strength',
								trackId: track.id,
								startWeekKey: opens,
								weeks,
								goal: PROPOSED_STRENGTH_GOAL,
								sessionsPerWeek,
							},
							select: { id: true },
						})
					: null

			const pattern = outline.patterns[0]
			const proposal =
				pattern && shape?.workoutId
					? proposeStarterPattern({
							trainableWeekdays:
								profile?.trainableWeekdays == null
									? null
									: parseTrainableWeekdays(profile.trainableWeekdays),
							tracks: [
								{
									trackId: track.id,
									discipline: 'strength',
									sessionsPerWeek,
								},
							],
						})
					: null
			let days = 0
			if (pattern && shape?.workoutId && proposal) {
				const next = new Map<number, number>()
				for (const day of pattern.days) {
					next.set(
						day.weekday,
						Math.max(next.get(day.weekday) ?? 0, day.orderInDay + 1),
					)
				}
				for (const day of proposal.days) {
					const orderInDay = next.get(day.weekday) ?? 0
					next.set(day.weekday, orderInDay + 1)
					await tx.weekPatternDay.create({
						data: {
							patternId: pattern.id,
							weekday: day.weekday,
							orderInDay,
							kind: 'fixed',
							trackId: track.id,
							workoutId: shape.workoutId,
						},
					})
					days++
				}
			}

			return {
				ok: true as const,
				trackId: track.id,
				segmentId: segment?.id ?? null,
				days,
			}
		})
	} catch (error) {
		// A double-tapped accept: one strength track per plan is the database's
		// rule, and the loser's insert aborts.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === 'P2002'
		) {
			return { ok: false, reason: 'discipline-already-tracked' }
		}
		throw error
	}

	if (result.ok) {
		try {
			await relayPlanFrom(athleteId, outlineId, fromWeekKey, timezone, now)
		} catch (error) {
			console.error(
				'[strength-offer] laying weeks after adding a strength track failed',
				error,
			)
		}
	}
	return result
}
