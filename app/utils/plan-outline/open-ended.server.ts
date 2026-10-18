// An open-ended plan's two structural moves (#505 S6, ADR 0079 §2–5): appending
// its next round, and turning into a plan toward an Event the athlete adds.
//
// Both are ordinary phase edits underneath — a round is an ordinary Plan Outline
// phase, and the run-up to an Event is the family's own blocks — so what they
// write is what every other edit path reads and can change afterwards.

import { Prisma } from '@prisma/client'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { fillPlanWeeksToHorizon } from '#app/utils/load/horizon-fill.server.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import {
	parseProposalPayload,
	type ProposalPayload,
} from '#app/utils/load/week-replan-proposal.ts'
import { CARDIO_DISCIPLINES } from '#app/utils/workout-schema.ts'
import { MAX_PLAN_WEEKS } from './authoring-schema.ts'
import { layEnduranceSegments } from './authoring.server.ts'
import { phaseIndexForWeek, phaseStartIndices, rhythmOf } from './derive.ts'
import { fitRunUp } from './fit-proposal.ts'
import { isSimpleActivityTrack, SIMPLE_ACTIVITY_SEGMENT } from './from-rows.ts'
import { familyRunUp, outlineFamily } from './presets.ts'
import { stampWeekPattern } from './stamp.server.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'
import { clearPlanWeek, readWeekOccupancy } from './week-sessions.server.ts'

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
 * **Never in the past.** The round opens where the plan ends, when that week
 * has not begun; otherwise — the answer came after the plan's end passed — on
 * the first week not yet begun (`readFirstUnbegunWeekKey`: this Monday when the
 * apply is on a Monday nothing has been trained on yet, as the morning's
 * silence is, else next Monday). The
 * weeks between the old end and that Monday are lived weeks no round covered,
 * so the last round is extended over them: the plan stays contiguous and those
 * weeks keep the rhythm they were lived on.
 *
 * The round's endurance segments carry on from the round before it — its
 * ramp, its cuts and its Quality Session Mix, so an edit the athlete made to a
 * round is not lost at the next one — with the factor as the boundary step.
 * A strength track's segments float free of the phases (ADR 0047 §6), so they
 * get no new one: a lifting block that ran to the plan's end is **extended**
 * to the new end instead, so strength keeps going in every round rather than
 * stopping where the first round did. A block that ended earlier — the athlete
 * stopped lifting — stays where it ended.
 *
 * **At most `MAX_PLAN_WEEKS`.** A plan longer than two years is one no Sesong
 * edit can change (each refuses `plan-too-long`), so a round that would take
 * the plan past it is not appended; `readRoundFacts` stops proposing one
 * first (ADR 0079 "As built (#505 gaps)"). Returns the Monday the round opens
 * on and the phase it appended — what the proposal's before-image keeps, so
 * an undo can re-lay that round at factor 1 (#564).
 */
export async function appendOpenEndedRound(
	tx: Prisma.TransactionClient,
	athleteId: string,
	round: AddPhasePayload,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<{ weekKey: string; phaseId: string } | null> {
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

	const end = weekKeyAt(
		outline.startWeekKey,
		outline.phases.reduce((sum, phase) => sum + phase.weeks, 0),
	)
	const unbegun = await readFirstUnbegunWeekKey(athleteId, now, timezone, tx)
	const opens = end >= unbegun ? end : unbegun
	const newEnd = weekKeyAt(opens, round.weeks)
	if (weekIndexOf(outline.startWeekKey, newEnd) > MAX_PLAN_WEEKS) return null
	if (opens > end) {
		await tx.planOutlinePhase.update({
			where: { id: last.id },
			data: { weeks: last.weeks + weekIndexOf(end, opens) },
		})
	}

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
			track: { select: { discipline: true } },
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
				// The Simple Activities' fixed days stay as they are: their track
				// takes no step up into the next round (#572).
				...(isSimpleActivityTrack(segment.track.discipline)
					? SIMPLE_ACTIVITY_SEGMENT
					: {
							ramp: segment.ramp,
							recoveryCut: segment.recoveryCut,
							taperCut: segment.taperCut,
							boundaryStep,
						}),
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

	// Lifting carries on: a strength block that ran to the old end runs to the
	// new one, the lived gap included.
	const lifting = await tx.trainingTrackSegment.findMany({
		where: { kind: 'strength', track: { outlineId: outline.id } },
		select: { id: true, startWeekKey: true, weeks: true },
	})
	for (const segment of lifting) {
		if (segment.startWeekKey == null || segment.weeks == null) continue
		if (weekKeyAt(segment.startWeekKey, segment.weeks) !== end) continue
		await tx.trainingTrackSegment.update({
			where: { id: segment.id },
			data: { weeks: weekIndexOf(segment.startWeekKey, newEnd) },
		})
	}

	return { weekKey: opens, phaseId: created.id }
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
			eventId: string
			/** The round that ended early, at the length it was lived. */
			ended: { name: string; weeks: number }
			/** The phases laid toward the Event, in order. */
			phases: Array<{ name: string; weeks: number }>
	  }
	| { ok: false; reason: AttachEventRefusal }

type Attached = Extract<AttachEventResult, { ok: true }>

/**
 * Add an Event to an open-ended plan (#505 stories 7–8, ADR 0079 §4): the plan
 * becomes an ordinary plan toward that Event.
 *
 * - **The current round ends early**, resized to the weeks already lived,
 *   this week included; any round appended after it but not yet begun goes,
 *   and a next round still waiting for an answer is closed (declined): there
 *   is no next round on a plan toward a race.
 * - **Phases toward the Event are laid from next week**: the family's run-up
 *   (`familyRunUp` — the blocks of its standard length after the base, since
 *   the rounds already lived were the base), fitted to the weeks left by the
 *   Season Fit rule (`fitRunUp` → `proposeFit`, the rule `fitPlanToEvent`
 *   applies): the taper is never touched, the first block absorbs first. The
 *   family is the one the plan records (`outlineFamily`), else the one the
 *   current round reads as by its rhythm, Klassisk when it has none.
 * - **Lived weeks and the athlete's sessions stay.** After commit
 *   (`layAfterAttach`), each later week the plan laid is laid again at the new
 *   phases' targets, and every week not yet begun up to the horizon that was
 *   never laid gets its sessions.
 */
export async function attachEventToOutline(
	userId: string,
	outlineId: string,
	eventId: string,
	now: Date = new Date(),
): Promise<AttachEventResult> {
	const timezone = await getAthleteTimezone(userId)
	const result = await refusing(() =>
		prisma.$transaction((tx) =>
			attachInTx(tx, userId, outlineId, eventId, { now, timezone }),
		),
	)
	if (result.ok) await layAfterAttach(userId, outlineId, timezone, now)
	return result
}

/**
 * Make a race and add it to the open-ended plan — "Legg til et løp" when the
 * race is not on the calendar yet. An ordinary Event (a race, priority A, the
 * plan's endurance Disciplines), made in **the same transaction** as the
 * attach: a refusal or a throw leaves no race behind.
 */
export async function addRaceToOpenEndedPlan(
	userId: string,
	outlineId: string,
	race: { name: string; startDate: Date },
	now: Date = new Date(),
): Promise<AttachEventResult> {
	const timezone = await getAthleteTimezone(userId)
	const result = await refusing(() =>
		prisma.$transaction(async (tx) => {
			const outline = await tx.planOutline.findFirst({
				where: { id: outlineId, athleteId: userId, eventId: null },
				select: { tracks: { select: { discipline: true } } },
			})
			if (!outline) throw new Refusal('outline-not-found')
			const disciplines = [
				...new Set(
					outline.tracks.flatMap((track) =>
						CARDIO_DISCIPLINES.filter((d) => d === track.discipline),
					),
				),
			]
			const event = await tx.event.create({
				data: {
					athleteId: userId,
					name: race.name,
					kind: 'race',
					priority: 'A',
					startDate: race.startDate,
					endDate: null,
					disciplines: JSON.stringify(
						disciplines.length > 0 ? disciplines : ['run'],
					),
					status: 'planned',
				},
				select: { id: true },
			})
			return attachInTx(tx, userId, outlineId, event.id, { now, timezone })
		}),
	)
	if (result.ok) await layAfterAttach(userId, outlineId, timezone, now)
	return result
}

class Refusal extends Error {
	readonly reason: AttachEventRefusal
	constructor(reason: AttachEventRefusal) {
		super(reason)
		this.reason = reason
	}
}

/** A refusal thrown inside the transaction (rolling it back) as a result. */
async function refusing(
	attach: () => Promise<Attached>,
): Promise<AttachEventResult> {
	try {
		return await attach()
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
}

/** The structural half of an attach, inside the caller's transaction. */
async function attachInTx(
	tx: Prisma.TransactionClient,
	userId: string,
	outlineId: string,
	eventId: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<Attached> {
	const outline = await tx.planOutline.findFirst({
		where: { id: outlineId, athleteId: userId, eventId: null },
		select: {
			id: true,
			startWeekKey: true,
			family: true,
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
	if ((event.endDate ?? event.startDate) < now) throw new Refusal('event-past')
	if (event.planOutline) throw new Refusal('event-already-planned')

	const specs = outline.phases.map((phase) => ({
		weeks: phase.weeks,
		rhythm: rhythmOf(phase.rhythm),
		tapers: false,
	}))
	// The week being lived; before the plan opens, its first week stands in.
	const current = Math.max(
		0,
		weekIndexOf(outline.startWeekKey, weekMonday(now, timezone)),
	)
	const weeksLeft =
		weekIndexOf(outline.startWeekKey, weekMonday(event.startDate, timezone)) -
		current
	const endingIndex =
		phaseIndexForWeek(specs, current) ?? outline.phases.length - 1
	const ending = outline.phases[endingIndex]
	if (!ending) throw new Refusal('outline-not-found')
	const runUp = fitRunUp(
		familyRunUp(
			outlineFamily(outline.family, rhythmOf(ending.rhythm)) ?? 'classic',
		),
		weeksLeft,
	)
	if (!runUp) throw new Refusal('event-too-soon')
	// The round being lived — or, past the plan's end, the last one, which then
	// runs on to this week.
	const lived = current - (phaseStartIndices(specs)[endingIndex] ?? 0) + 1

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
	const laid = []
	for (const [offset, phase] of runUp.entries()) {
		const row = await tx.planOutlinePhase.create({
			data: {
				outlineId: outline.id,
				orderIndex: endingIndex + 1 + offset,
				name: phase.name,
				weeks: phase.weeks,
				rhythm: phase.rhythm,
				tapers: phase.tapers,
			},
			select: { id: true },
		})
		laid.push({
			phaseId: row.id,
			ramp: phase.ramp,
			boundaryStep: phase.boundaryStep,
			mix: phase.mix,
		})
	}
	await layEnduranceSegments(tx, outline.id, laid)
	await tx.planOutline.update({
		where: { id: outline.id },
		data: { eventId: event.id },
	})
	await closePendingRounds(tx, userId, outline.id, now)

	return {
		ok: true,
		eventId: event.id,
		ended: { name: ending.name, weeks: lived },
		phases: runUp.map(({ name, weeks }) => ({ name, weeks })),
	}
}

/**
 * A next round still waiting for an answer is obsolete once the plan runs
 * toward a race, or once it switches philosophy (its round follows the old
 * family): it is closed as declined, so nothing offers it again and silence
 * never reaches it.
 */
export async function closePendingRounds(
	tx: Prisma.TransactionClient,
	userId: string,
	outlineId: string,
	now: Date,
) {
	const pending = await tx.weekReplanProposal.findMany({
		where: {
			athleteId: userId,
			kind: 'add-phase',
			answer: 'pending',
			appliedAt: null,
		},
		select: { id: true, payload: true },
	})
	const ids = pending
		.filter((row) => {
			const payload = parseProposalPayload(row.payload)
			return payload.kind === 'add-phase' && payload.outlineId === outlineId
		})
		.map((row) => row.id)
	if (ids.length === 0) return
	await tx.weekReplanProposal.updateMany({
		where: { id: { in: ids } },
		data: { answer: 'declined', answeredAt: now },
	})
}

/**
 * The calendar half of an attach, after commit: later weeks the plan laid are
 * laid again at the new targets, then the weeks up to the horizon it never
 * laid are filled. **Contained**: the plan already runs toward its Event, so a
 * failure here is logged rather than turned into a refused attach. Each week
 * is written in a transaction of its own — a week is either still the old
 * plan's sessions or the new plan's, never half of each — and the week change
 * keeps laying the horizon from the next close on.
 */
async function layAfterAttach(
	userId: string,
	outlineId: string,
	timezone: string,
	now: Date,
) {
	try {
		// From the first week not yet begun: a lived week is never re-laid.
		await relayPlanFrom(
			userId,
			outlineId,
			await readFirstUnbegunWeekKey(userId, now, timezone),
			timezone,
			now,
		)
	} catch (error) {
		console.error(
			'[open-ended] laying weeks after adding an Event failed',
			error,
		)
	}
}
/**
 * Lay the plan's weeks again from the first one not yet begun, after a change
 * to how its weeks are laid (a day choice, its undo, a dropped day). Never
 * fails the change it follows: a failure is logged under `label`, and the
 * weeks are laid on the next change or horizon fill.
 */
export async function relayPlanFromFirstUnbegunWeek(
	userId: string,
	outlineId: string,
	now: Date,
	label: string,
) {
	try {
		const timezone = await getAthleteTimezone(userId)
		const from = await readFirstUnbegunWeekKey(userId, now, timezone)
		await relayPlanFrom(userId, outlineId, from, timezone, now)
	} catch (error) {
		console.error(`[${label}] laying weeks after a change failed`, error)
	}
}

/**
 * After the plan's phases changed under weeks already on the calendar: lay
 * every week from `fromWeekKey` on that the plan laid again at its new
 * targets, then fill the weeks up to the horizon it never laid. Shared by
 * adding an Event, switching philosophy and the Sesong edits; the caller
 * contains a failure. `onlyWeekKeys` narrows the re-lay to the weeks an edit
 * changed (a Sesong edit knows them), so a week it left alone keeps its
 * sessions as they are.
 */
export async function relayPlanFrom(
	userId: string,
	outlineId: string,
	fromWeekKey: string,
	timezone: string,
	now: Date,
	{ onlyWeekKeys }: { onlyWeekKeys?: readonly string[] } = {},
): Promise<void> {
	await relayFutureWeeks(userId, outlineId, fromWeekKey, timezone, now, {
		onlyWeekKeys,
	})
	await fillPlanWeeksToHorizon(userId, timezone, now)
}

/**
 * Re-lay every week from `fromWeekKey` on that this plan laid sessions in, at
 * the plan's new targets: stamped again (`replace`, so the stamp's gated
 * clearing removes only the machine's untrained sessions) **around** the plan
 * sessions it keeps (`aroundKeptSessions`) — an adopted session still fills
 * its weekday's slot for its Discipline, and the pattern's other days are laid
 * at the new targets, so the week reaches its target with the athlete's
 * session in it rather than falling below it. Chosen over leaving the old
 * machine sessions in such a week, which would keep that week at the old
 * plan's numbers beside a new plan. A week the plan no longer reaches (or a
 * plan with no pattern) has its machine sessions cleared and nothing laid.
 * Returns how many weeks were touched.
 */
async function relayFutureWeeks(
	userId: string,
	outlineId: string,
	fromWeekKey: string,
	timezone: string,
	now: Date,
	{ onlyWeekKeys }: { onlyWeekKeys?: readonly string[] } = {},
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
		.filter((weekKey) => !onlyWeekKeys || onlyWeekKeys.includes(weekKey))
		.sort()
	if (weekKeys.length === 0) return 0

	const pattern = await prisma.weekPattern.findFirst({
		where: { outlineId, days: { some: {} } },
		orderBy: { orderIndex: 'asc' },
		select: { id: true },
	})
	let touched = 0
	for (const weekKey of weekKeys) {
		const occupancy = await readWeekOccupancy(
			userId,
			outlineId,
			weekKey,
			timezone,
		)
		if (occupancy.replacing === 0) continue
		const restamped = pattern
			? await stampWeekPattern(
					userId,
					{ patternId: pattern.id, weekKeys: [weekKey], replace: true },
					now,
					{ aroundKeptSessions: true },
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
