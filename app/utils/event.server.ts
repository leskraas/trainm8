import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
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
		resultSessionId: input.resultSessionId ?? null,
	}
}

export async function createEvent(
	athleteId: string,
	input: EventAuthoringInput,
): Promise<EventRecord> {
	return prisma.event.create({
		data: { athleteId, ...serializeInput(input) },
		select: eventSelect,
	})
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

	return prisma.event.update({
		where: { id: eventId },
		data: serializeInput(input),
		select: eventSelect,
	})
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

	return prisma.event.delete({
		where: { id: eventId },
		select: { id: true },
	})
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

	return prisma.event.update({
		where: { id: eventId },
		data: { resultSessionId: sessionId, status: 'completed' },
		select: eventSelect,
	})
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

	return prisma.event.update({
		where: { id: eventId },
		data: { resultSessionId: null, status: 'planned' },
		select: eventSelect,
	})
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

	return prisma.event.update({
		where: { id: eventId },
		data: { status: 'cancelled', resultSessionId: null },
		select: eventSelect,
	})
}
