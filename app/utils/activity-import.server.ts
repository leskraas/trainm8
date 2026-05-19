import { prisma } from './db.server.ts'

export type ActivityImportInput = {
	externalProvider: 'manual' | 'strava' | 'garmin'
	externalId: string
	startedAt: Date
	endedAt: Date
	durationSec: number
	distanceM?: number | null
	discipline: string
	hrAvg?: number | null
	powerAvg?: number | null
	paceAvgSecPerKm?: number | null
	polyline?: string | null
	rawJson: string
}

export async function createActivityImport(
	athleteId: string,
	input: ActivityImportInput,
) {
	return prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: input.externalProvider,
			externalId: input.externalId,
			startedAt: input.startedAt,
			endedAt: input.endedAt,
			durationSec: input.durationSec,
			distanceM: input.distanceM ?? null,
			discipline: input.discipline,
			hrAvg: input.hrAvg ?? null,
			powerAvg: input.powerAvg ?? null,
			paceAvgSecPerKm: input.paceAvgSecPerKm ?? null,
			polyline: input.polyline ?? null,
			rawJson: input.rawJson,
		},
		select: { id: true, startedAt: true, endedAt: true, discipline: true },
	})
}

export async function getInboxImports(athleteId: string) {
	return prisma.activityImport.findMany({
		where: { athleteId, promotedSessionId: null },
		orderBy: { startedAt: 'desc' },
		select: {
			id: true,
			athleteId: true,
			startedAt: true,
			endedAt: true,
			durationSec: true,
			distanceM: true,
			discipline: true,
			externalProvider: true,
			createdAt: true,
		},
	})
}

export type InboxImport = Awaited<ReturnType<typeof getInboxImports>>[number]

/**
 * Attempts to auto-match the import to a planned same-day same-discipline
 * WorkoutSession. Returns null if there are zero or multiple candidates.
 * athleteTimezone is an IANA tz string used to determine the calendar day.
 */
export async function autoMatchImport(
	athleteId: string,
	importId: string,
	athleteTimezone: string,
) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, startedAt: true, discipline: true },
	})
	if (!imported) return null

	const dayStart = toStartOfDayUTC(imported.startedAt, athleteTimezone)
	const dayEnd = toEndOfDayUTC(imported.startedAt, athleteTimezone)

	const candidates = await prisma.workoutSession.findMany({
		where: {
			userId: athleteId,
			scheduledAt: { gte: dayStart, lte: dayEnd },
			recordingId: null, // not already claimed
			workout: { discipline: imported.discipline },
		},
		select: { id: true },
	})

	if (candidates.length !== 1) return null

	const session = candidates[0]!
	await linkImportToSession(importId, session.id)
	return { importId, sessionId: session.id }
}

export async function promoteToExistingSession(
	athleteId: string,
	importId: string,
	sessionId: string,
) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true },
	})
	if (!imported) throw new Error('Import not found')

	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId: athleteId },
		select: { id: true },
	})
	if (!session) throw new Error('Session not found')

	await linkImportToSession(importId, sessionId)
}

export async function promoteToNewSession(athleteId: string, importId: string) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, startedAt: true },
	})
	if (!imported) throw new Error('Import not found')

	return prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.create({
			data: {
				userId: athleteId,
				workoutId: null,
				scheduledAt: imported.startedAt,
				status: 'completed',
				recordingId: importId,
			},
			select: { id: true, workoutId: true, recordingId: true, scheduledAt: true },
		})

		await tx.activityImport.update({
			where: { id: importId },
			data: { promotedSessionId: session.id },
		})

		return { session }
	})
}

export async function unlinkImport(athleteId: string, importId: string) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, promotedSessionId: true },
	})
	if (!imported || !imported.promotedSessionId) return

	const session = await prisma.workoutSession.findUnique({
		where: { id: imported.promotedSessionId },
		select: { id: true, workoutId: true },
	})
	if (!session) return

	const isRecordingOnly = session.workoutId === null

	await prisma.$transaction(async (tx) => {
		// Clear import's promoted pointer first to avoid FK issues
		await tx.activityImport.update({
			where: { id: importId },
			data: { promotedSessionId: null },
		})

		if (isRecordingOnly) {
			// Delete the recording-only session entirely
			await tx.workoutSession.delete({ where: { id: session.id } })
		} else {
			// Just clear the recording link on the planned session
			await tx.workoutSession.update({
				where: { id: session.id },
				data: { recordingId: null },
			})
		}
	})
}

async function linkImportToSession(importId: string, sessionId: string) {
	await prisma.$transaction([
		prisma.workoutSession.update({
			where: { id: sessionId },
			data: { recordingId: importId },
		}),
		prisma.activityImport.update({
			where: { id: importId },
			data: { promotedSessionId: sessionId },
		}),
	])
}

function toStartOfDayUTC(date: Date, timezone: string): Date {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	})
	const parts = formatter.formatToParts(date)
	const y = parts.find((p) => p.type === 'year')!.value
	const m = parts.find((p) => p.type === 'month')!.value
	const d = parts.find((p) => p.type === 'day')!.value
	return new Date(`${y}-${m}-${d}T00:00:00.000Z`)
}

function toEndOfDayUTC(date: Date, timezone: string): Date {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	})
	const parts = formatter.formatToParts(date)
	const y = parts.find((p) => p.type === 'year')!.value
	const m = parts.find((p) => p.type === 'month')!.value
	const d = parts.find((p) => p.type === 'day')!.value
	return new Date(`${y}-${m}-${d}T23:59:59.999Z`)
}
