// An open-ended plan's two structural moves (#505 S6, ADR 0079 §2–5): appending
// its next round, and turning into a plan toward an Event the athlete adds.
//
// Both are ordinary phase edits underneath — a round is an ordinary Plan Outline
// phase, and the run-up to an Event is the family's own blocks — so what they
// write is what every other edit path reads and can change afterwards.

import { Prisma } from '@prisma/client'
import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createEvent } from '#app/utils/event.server.ts'
import { type ProposalPayload } from '#app/utils/load/week-replan-proposal.ts'
import {
	isCardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { layEnduranceSegments } from './authoring.server.ts'
import {
	phaseIndexForWeek,
	phaseStartIndices,
	RHYTHMS,
	type Rhythm,
} from './derive.ts'
import { fitRunUp } from './fit-proposal.ts'
import { familyForRhythm, familyRunUp } from './presets.ts'
import { stampWeekPattern } from './stamp.server.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'
import {
	clearPlanWeek,
	countPlanLaidSessions,
	readWeekOccupancy,
} from './week-sessions.server.ts'

type AddPhasePayload = Extract<ProposalPayload, { kind: 'add-phase' }>

/**
 * The Block Boundary Step a round's volume factor is written as: the step at
 * the new round's opening, against the round before (ADR 0040 §4). A factor of
 * 1 is continuity, which is `null` — no step authored.
 */
export function roundBoundaryStep(factor: number): number | null {
	if (factor === 1) return null
	return Math.round((factor - 1) * 10_000) / 10_000
}

/**
 * Append an open-ended plan's next round, inside the caller's transaction (the
 * proposal engine's). Writes nothing — and says so with `null` — when the plan
 * is no longer the athlete's open-ended one (an Event was added meanwhile), or
 * when `afterPhaseId` is no longer its last phase: a plan reshaped since the
 * proposal was written is not appended to on a stale reading.
 *
 * The round's endurance segments carry on from the round before it — its
 * ramp, its cuts and its Quality Session Mix, so an edit the athlete made to a
 * round is not lost at the next one — with the factor as the boundary step. A
 * strength track gets none: its segments float free of the phases (ADR 0047
 * §6). Returns the Monday the round opens on.
 */
export async function appendOpenEndedRound(
	tx: Prisma.TransactionClient,
	athleteId: string,
	round: AddPhasePayload,
): Promise<{ weekKey: string } | null> {
	const outline = await tx.planOutline.findFirst({
		where: { id: round.outlineId, athleteId, eventId: null },
		select: {
			id: true,
			startWeekKey: true,
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: { id: true, weeks: true },
			},
		},
	})
	const last = outline?.phases.at(-1)
	if (!outline || !last || last.id !== round.afterPhaseId) return null

	const created = await tx.planOutlinePhase.create({
		data: {
			outlineId: outline.id,
			orderIndex: outline.phases.length,
			name: round.name,
			weeks: round.weeks,
			rhythm: round.rhythm,
		},
		select: { id: true },
	})

	const previous = await tx.trainingTrackSegment.findMany({
		where: { phaseId: last.id, kind: 'endurance' },
		select: {
			trackId: true,
			ramp: true,
			recoveryCut: true,
			taperCut: true,
			mix: { select: { zone: true, sessionsPerWeek: true } },
		},
	})
	const boundaryStep = roundBoundaryStep(round.factor)
	for (const segment of previous) {
		await tx.trainingTrackSegment.create({
			data: {
				kind: 'endurance',
				trackId: segment.trackId,
				phaseId: created.id,
				ramp: segment.ramp,
				recoveryCut: segment.recoveryCut,
				taperCut: segment.taperCut,
				boundaryStep,
				...(segment.mix.length
					? {
							mix: {
								create: segment.mix.map(({ zone, sessionsPerWeek }) => ({
									zone,
									sessionsPerWeek,
								})),
							},
						}
					: {}),
			},
		})
	}

	const total = outline.phases.reduce((sum, phase) => sum + phase.weeks, 0)
	return { weekKey: weekKeyAt(outline.startWeekKey, total) }
}

// ── Adding an Event ─────────────────────────────────────────────────────────

export type AttachEventRefusal =
	/** Not this athlete's open-ended plan — or no longer open-ended. */
	| 'outline-not-found'
	| 'event-not-found'
	| 'event-cancelled'
	| 'event-past'
	/** The Event already has a plan of its own. */
	| 'event-already-planned'
	/** The Event falls in this week, so there is no week left to lay toward it. */
	| 'event-too-soon'

export type AttachEventResult =
	| {
			ok: true
			/** The round that ended early, at the length it was lived. */
			ended: { name: string; weeks: number }
			/** The phases laid toward the Event, in order. */
			phases: Array<{ name: string; weeks: number }>
			/** How many future weeks had their machine sessions re-laid or cleared. */
			relaid: number
	  }
	| { ok: false; reason: AttachEventRefusal }

function asRhythm(stored: string): Rhythm {
	return RHYTHMS.find((rhythm) => rhythm === stored) ?? 'none'
}

/**
 * Add an Event to an open-ended plan (#505 stories 7–8, ADR 0079 §4): the plan
 * becomes an ordinary plan toward that Event.
 *
 * - **The current round ends early**, resized to the weeks already lived,
 *   this week included; any round appended after it but not yet begun goes.
 * - **Phases toward the Event are laid from next week**: the family's run-up
 *   (`familyRunUp` — the blocks of its standard length after the base, since
 *   the rounds already lived were the base), fitted to the weeks left by the
 *   Season Fit rule (`fitRunUp` → `proposeFit`, the rule `fitPlanToEvent`
 *   applies): the taper is never touched, the first block absorbs first. The
 *   family is the one the current round reads as by its rhythm, Klassisk when
 *   it has none.
 * - **Lived weeks and the athlete's sessions stay.** Nothing before next week
 *   is touched. In each later week the plan laid, its machine sessions are
 *   re-laid at the new phases' targets through the stamp — whose clearing is
 *   `clearPlanWeek`, gated on ownership — or, where the athlete has adopted one
 *   of the week's plan sessions, or the week is past the Event, only cleared,
 *   so a week they took over is never laid a second time beside their own.
 */
export async function attachEventToOutline(
	userId: string,
	outlineId: string,
	eventId: string,
	now: Date = new Date(),
): Promise<AttachEventResult> {
	const timezone = await getAthleteTimezone(userId)
	const thisMonday = weekMonday(now, timezone)

	let attached: {
		ended: { name: string; weeks: number }
		phases: Array<{ name: string; weeks: number }>
	} | null
	try {
		attached = await prisma.$transaction(async (tx) => {
			const outline = await tx.planOutline.findFirst({
				where: { id: outlineId, athleteId: userId, eventId: null },
				select: {
					id: true,
					startWeekKey: true,
					phases: {
						orderBy: { orderIndex: 'asc' },
						select: { id: true, name: true, weeks: true, rhythm: true },
					},
				},
			})
			if (!outline || outline.phases.length === 0) {
				throw new Refusal('outline-not-found')
			}
			const event = await tx.event.findFirst({
				where: { id: eventId, athleteId: userId },
				select: {
					id: true,
					status: true,
					startDate: true,
					endDate: true,
					planOutline: { select: { id: true } },
				},
			})
			if (!event) throw new Refusal('event-not-found')
			if (event.status === 'cancelled') throw new Refusal('event-cancelled')
			if ((event.endDate ?? event.startDate) < now) {
				throw new Refusal('event-past')
			}
			if (event.planOutline) throw new Refusal('event-already-planned')

			const specs = outline.phases.map((phase) => ({
				weeks: phase.weeks,
				rhythm: asRhythm(phase.rhythm),
				tapers: false,
			}))
			// The week being lived; before the plan opens, its first week stands in.
			const current = Math.max(0, weekIndexOf(outline.startWeekKey, thisMonday))
			const eventWeek = weekIndexOf(
				outline.startWeekKey,
				weekMonday(event.startDate, timezone),
			)
			const weeksLeft = eventWeek - current
			if (weeksLeft < 1) throw new Refusal('event-too-soon')

			// The round being lived — or, past the plan's end, the last one, which
			// then runs on to this week.
			const endingIndex =
				phaseIndexForWeek(specs, current) ?? outline.phases.length - 1
			const ending = outline.phases[endingIndex]!
			const lived = current - phaseStartIndices(specs)[endingIndex]! + 1
			const family = familyForRhythm(asRhythm(ending.rhythm)) ?? 'classic'
			const runUp = fitRunUp(familyRunUp(family), weeksLeft)!

			await tx.planOutlinePhase.deleteMany({
				where: {
					outlineId: outline.id,
					id: { in: outline.phases.slice(endingIndex + 1).map((p) => p.id) },
				},
			})
			await tx.planOutlinePhase.update({
				where: { id: ending.id },
				data: { weeks: lived },
			})
			const created: Array<{ id: string }> = []
			for (const [offset, phase] of runUp.entries()) {
				created.push(
					await tx.planOutlinePhase.create({
						data: {
							outlineId: outline.id,
							orderIndex: endingIndex + 1 + offset,
							name: phase.name,
							weeks: phase.weeks,
							rhythm: phase.rhythm,
							tapers: phase.tapers,
						},
						select: { id: true },
					}),
				)
			}
			await layEnduranceSegments(
				tx,
				outline.id,
				created.map(({ id }, index) => ({
					phaseId: id,
					ramp: runUp[index]!.ramp,
					boundaryStep: runUp[index]!.boundaryStep,
					mix: runUp[index]!.mix,
				})),
			)
			await tx.planOutline.update({
				where: { id: outline.id },
				data: { eventId: event.id },
			})
			return {
				ended: { name: ending.name, weeks: lived },
				phases: runUp.map(({ name, weeks }) => ({ name, weeks })),
			}
		})
	} catch (error) {
		if (error instanceof Refusal) return { ok: false, reason: error.reason }
		// Two plans racing for one Event: `PlanOutline.eventId` is unique.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === 'P2002'
		) {
			return { ok: false, reason: 'event-already-planned' }
		}
		throw error
	}

	const relaid = await relayFutureWeeks(
		userId,
		outlineId,
		addDays(thisMonday, 7),
		timezone,
		now,
	)
	return { ok: true, ...attached, relaid }
}

class Refusal extends Error {
	readonly reason: AttachEventRefusal
	constructor(reason: AttachEventRefusal) {
		super(reason)
		this.reason = reason
	}
}

/**
 * Re-lay every week from `fromWeekKey` on that this plan laid sessions in, at
 * the plan's new targets. A week whose plan sessions are all still the
 * machine's and untrained is stamped again (`replace`, so the stamp's gated
 * clearing removes the old ones first); any other — an adopted plan session in
 * it, or a week the plan no longer reaches — has its machine sessions cleared
 * and nothing laid. Returns how many weeks were touched.
 */
async function relayFutureWeeks(
	userId: string,
	outlineId: string,
	fromWeekKey: string,
	timezone: string,
	now: Date,
): Promise<number> {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			planOutlineId: outlineId,
			source: { not: 'authored' },
		},
		select: { scheduledAt: true },
	})
	const weekKeys = [
		...new Set(sessions.map((s) => weekMonday(s.scheduledAt, timezone))),
	]
		.filter((weekKey) => weekKey >= fromWeekKey)
		.sort()
	if (weekKeys.length === 0) return 0

	const pattern = await prisma.weekPattern.findFirst({
		where: { outlineId, days: { some: {} } },
		orderBy: { orderIndex: 'asc' },
		select: { id: true },
	})
	let touched = 0
	for (const weekKey of weekKeys) {
		const [occupancy, laid] = await Promise.all([
			readWeekOccupancy(userId, outlineId, weekKey, timezone),
			countPlanLaidSessions(userId, outlineId, weekKey, timezone),
		])
		if (occupancy.replacing === 0) continue
		const restamped =
			pattern && laid === occupancy.replacing
				? await stampWeekPattern(
						userId,
						{ patternId: pattern.id, weekKeys: [weekKey], replace: true },
						now,
					)
				: null
		if (!restamped?.ok) {
			await prisma.$transaction((tx) =>
				clearPlanWeek(tx, userId, outlineId, weekKey, timezone),
			)
		}
		touched++
	}
	return touched
}

/**
 * Make a race and add it to the open-ended plan in one step — "Legg til et
 * løp" when the race is not on the calendar yet. An ordinary Event (a race,
 * priority A, the plan's own Disciplines), made only if the plan takes it: a
 * refused attach removes it again, so a refusal leaves nothing behind.
 */
export async function addRaceToOpenEndedPlan(
	userId: string,
	outlineId: string,
	race: { name: string; startDate: Date },
	now: Date = new Date(),
): Promise<AttachEventResult & { eventId?: string }> {
	const outline = await prisma.planOutline.findFirst({
		where: { id: outlineId, athleteId: userId, eventId: null },
		select: { tracks: { select: { discipline: true } } },
	})
	if (!outline) return { ok: false, reason: 'outline-not-found' }
	const disciplines = [
		...new Set(
			outline.tracks
				.map((track) => track.discipline)
				.filter((discipline) => isCardioDiscipline(discipline as Discipline)),
		),
	] as Discipline[]
	const event = await createEvent(userId, {
		name: race.name,
		kind: 'race',
		priority: 'A',
		startDate: race.startDate,
		endDate: null,
		disciplines: disciplines.length > 0 ? disciplines : ['run'],
		status: 'planned',
	})
	const attached = await attachEventToOutline(userId, outlineId, event.id, now)
	if (!attached.ok) {
		await prisma.event.delete({ where: { id: event.id } })
		return attached
	}
	return { ...attached, eventId: event.id }
}
