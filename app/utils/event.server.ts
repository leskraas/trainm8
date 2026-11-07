import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import { keepEventResultsInStep } from './event-result.server.ts'
import { eventTakesDistance } from './event-result.ts'
import {
	type EventAuthoringInput,
	parseEventDisciplines,
} from './event-schema.ts'

const eventSelect = {
	id: true,
	name: true,
	kind: true,
	priority: true,
	startDate: true,
	endDate: true,
	disciplines: true,
	target: true,
	location: true,
	status: true,
	notes: true,
	distanceM: true,
	resultSessionId: true,
	athleteId: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.EventSelect

export type EventRecord = Prisma.EventGetPayload<{ select: typeof eventSelect }>

function serializeInput(input: EventAuthoringInput) {
	return {
		name: input.name,
		kind: input.kind,
		priority: input.priority,
		startDate: input.startDate,
		endDate: input.endDate ?? null,
		disciplines: JSON.stringify(input.disciplines),
		target: input.target ? JSON.stringify(input.target) : null,
		location: input.location ?? null,
		status: input.status,
		notes: input.notes ?? null,
		// Only a run-only race or time trial carries an Event Distance; saving
		// one that is not clears it (ADR 0112 §1).
		distanceM: eventTakesDistance(input.kind, input.disciplines)
			? (input.distanceM ?? null)
			: null,
	}
}

// An Event Result is one of the athlete's own sessions. A session id from a
// form is only an id, so check its owner before an Event points at it.
async function ownSessionIdOrNull(
	athleteId: string,
	sessionId: string | null | undefined,
): Promise<string | null> {
	if (!sessionId) return null
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId: athleteId },
		select: { id: true },
	})
	return session?.id ?? null
}

export async function createEvent(
	athleteId: string,
	input: EventAuthoringInput,
): Promise<EventRecord> {
	const created = await prisma.event.create({
		data: {
			athleteId,
			...serializeInput(input),
			resultSessionId: await ownSessionIdOrNull(
				athleteId,
				input.resultSessionId,
			),
		},
		select: eventSelect,
	})
	if (!created.resultSessionId) return created
	return keepEventResultsInStep({ eventIds: [created.id] }, async () => created)
}

export async function updateEvent(
	athleteId: string,
	eventId: string,
	input: EventAuthoringInput,
): Promise<EventRecord | null> {
	const existing = await prisma.event.findFirst({
		where: { id: eventId, athleteId },
		select: { id: true },
	})
	if (!existing) return null

	const resultSessionId = await ownSessionIdOrNull(
		athleteId,
		input.resultSessionId,
	)
	// The distance, the kind, the disciplines or the result session can each
	// make, rewrite or remove the Event's result.
	return keepEventResultsInStep({ eventIds: [eventId] }, () =>
		prisma.event.update({
			where: { id: eventId },
			data: { ...serializeInput(input), resultSessionId },
			select: eventSelect,
		}),
	)
}

/**
 * Set or clear a done Event's **Event Distance** from its result section
 * (#670): the one write the Event page makes for an Event after the race, and
 * the same path to the reconcile the form's save takes. Refused (null) for an
 * Event that is not the athlete's, or one that takes no distance.
 */
export async function setEventDistance(
	athleteId: string,
	eventId: string,
	distanceM: number | null,
): Promise<EventRecord | null> {
	const existing = await prisma.event.findFirst({
		where: { id: eventId, athleteId },
		select: { kind: true, disciplines: true },
	})
	if (!existing) return null
	if (!eventTakesDistance(existing.kind, existing.disciplines)) return null
	return keepEventResultsInStep({ eventIds: [eventId] }, () =>
		prisma.event.update({
			where: { id: eventId },
			data: { distanceM },
			select: eventSelect,
		}),
	)
}

export async function deleteEvent(
	athleteId: string,
	eventId: string,
): Promise<{ id: string } | null> {
	const existing = await prisma.event.findFirst({
		where: { id: eventId, athleteId },
		select: { id: true },
	})
	if (!existing) return null

	// The cascade takes the result row and skips the recompute, so the delete
	// runs inside the reconcile, which sees the row go.
	return keepEventResultsInStep({ eventIds: [eventId] }, () =>
		prisma.event.delete({
			where: { id: eventId },
			select: { id: true },
		}),
	)
}

export async function getEventById(
	athleteId: string,
	eventId: string,
): Promise<EventRecord | null> {
	return prisma.event.findFirst({
		where: { id: eventId, athleteId },
		select: eventSelect,
	})
}

export async function getEventsForUser(
	athleteId: string,
): Promise<EventRecord[]> {
	return prisma.event.findMany({
		where: { athleteId },
		orderBy: { startDate: 'asc' },
		select: eventSelect,
	})
}

const candidateSessionSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	workout: {
		select: {
			id: true,
			title: true,
			discipline: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type CandidateSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof candidateSessionSelect
}>

export async function getCandidateSessionsForEvent(
	athleteId: string,
	eventId: string,
): Promise<CandidateSession[]> {
	const event = await getEventById(athleteId, eventId)
	if (!event) return []

	const disciplines = parseEventDisciplines(event.disciplines)
	const startOfDay = new Date(event.startDate)
	startOfDay.setUTCHours(0, 0, 0, 0)

	const endDay = event.endDate ?? event.startDate
	const endOfDay = new Date(endDay)
	endOfDay.setUTCHours(23, 59, 59, 999)

	return prisma.workoutSession.findMany({
		where: {
			userId: athleteId,
			scheduledAt: { gte: startOfDay, lte: endOfDay },
			workout: {
				discipline: { in: disciplines },
			},
		},
		orderBy: { scheduledAt: 'asc' },
		select: candidateSessionSelect,
	})
}

export async function setEventResult(
	athleteId: string,
	eventId: string,
	sessionId: string,
): Promise<EventRecord | null> {
	const existing = await prisma.event.findFirst({
		where: { id: eventId, athleteId },
		select: { id: true },
	})
	if (!existing) return null
	if (!(await ownSessionIdOrNull(athleteId, sessionId))) return null

	return keepEventResultsInStep({ eventIds: [eventId] }, () =>
		prisma.event.update({
			where: { id: eventId },
			data: { resultSessionId: sessionId, status: 'completed' },
			select: eventSelect,
		}),
	)
}

export async function unlinkEventResult(
	athleteId: string,
	eventId: string,
): Promise<EventRecord | null> {
	const existing = await prisma.event.findFirst({
		where: { id: eventId, athleteId },
		select: { id: true },
	})
	if (!existing) return null

	return keepEventResultsInStep({ eventIds: [eventId] }, () =>
		prisma.event.update({
			where: { id: eventId },
			data: { resultSessionId: null, status: 'planned' },
			select: eventSelect,
		}),
	)
}

export async function cancelEvent(
	athleteId: string,
	eventId: string,
): Promise<EventRecord | null> {
	const existing = await prisma.event.findFirst({
		where: { id: eventId, athleteId },
		select: { id: true },
	})
	if (!existing) return null

	return keepEventResultsInStep({ eventIds: [eventId] }, () =>
		prisma.event.update({
			where: { id: eventId },
			data: { status: 'cancelled', resultSessionId: null },
			select: eventSelect,
		}),
	)
}
