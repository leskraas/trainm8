import { z } from 'zod'
import { dayBoundsUTC, localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { publishActivityImportCreated } from './imports-events.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'

async function triggerRecomputeForImport(importId: string): Promise<void> {
	try {
		const imp = await prisma.activityImport.findUnique({
			where: { id: importId },
			select: {
				athleteId: true,
				startedAt: true,
				athlete: {
					select: {
						athleteProfile: { select: { timezone: true } },
					},
				},
			},
		})
		if (!imp) return
		const timezone = imp.athlete.athleteProfile?.timezone ?? 'UTC'
		const dateStr = localDate(imp.startedAt, timezone)
		await recomputeLoadFrom(imp.athleteId, dateStr)
	} catch {
		// Fire-and-forget: silently skip if DB is unavailable (e.g. test teardown)
	}
}

/**
 * The provider-neutral shape every import is filed as, validated at the insert
 * boundary. Optional physiological/mechanical metrics are `nullish` — absent
 * whenever the provider didn't report them. Distances are metres, speeds m/s,
 * times seconds. The type is inferred from the schema so the two never drift.
 */
export const ActivityImportInputSchema = z.object({
	externalProvider: z.enum(['manual', 'strava', 'intervalsicu', 'garmin']),
	externalId: z.string(),
	startedAt: z.date(),
	endedAt: z.date(),
	durationSec: z.number(),
	distanceM: z.number().nullish(),
	discipline: z.string(),
	hrAvg: z.number().nullish(),
	hrMax: z.number().nullish(),
	powerAvg: z.number().nullish(),
	powerMax: z.number().nullish(),
	powerWeightedAvg: z.number().nullish(),
	cadenceAvg: z.number().nullish(),
	paceAvgSecPerKm: z.number().nullish(),
	speedMaxMps: z.number().nullish(),
	elevationGainM: z.number().nullish(),
	kilojoules: z.number().nullish(),
	polyline: z.string().nullish(),
	lapsJson: z.string().nullish(),
	rawJson: z.string(),
})
export type ActivityImportInput = z.infer<typeof ActivityImportInputSchema>

/**
 * The provider-metric columns shared by insert and in-place update, so both
 * code paths persist the identical snapshot shape. Optional metrics collapse to
 * `null` when the provider omits them.
 */
function metricColumns(input: ActivityImportInput) {
	return {
		startedAt: input.startedAt,
		endedAt: input.endedAt,
		durationSec: input.durationSec,
		distanceM: input.distanceM ?? null,
		discipline: input.discipline,
		hrAvg: input.hrAvg ?? null,
		hrMax: input.hrMax ?? null,
		powerAvg: input.powerAvg ?? null,
		powerMax: input.powerMax ?? null,
		powerWeightedAvg: input.powerWeightedAvg ?? null,
		cadenceAvg: input.cadenceAvg ?? null,
		paceAvgSecPerKm: input.paceAvgSecPerKm ?? null,
		speedMaxMps: input.speedMaxMps ?? null,
		elevationGainM: input.elevationGainM ?? null,
		kilojoules: input.kilojoules ?? null,
		polyline: input.polyline ?? null,
		lapsJson: input.lapsJson ?? null,
		rawJson: input.rawJson,
	}
}

export async function createActivityImport(
	athleteId: string,
	input: ActivityImportInput,
) {
	const data = ActivityImportInputSchema.parse(input)
	const created = await prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: data.externalProvider,
			externalId: data.externalId,
			...metricColumns(data),
		},
		select: { id: true, startedAt: true, endedAt: true, discipline: true },
	})
	// Push a live "new import landed" event to the athlete's open Imports tabs
	// (#75). This is the single insert choke point, so manual sync (#72),
	// backfill (#74), file upload, and future webhook (#76) all publish here
	// after a successful insert without each call site having to remember to.
	publishActivityImportCreated(athleteId)
	return created
}

/**
 * Refresh a non-promoted import's snapshot in place from a fresh provider
 * payload (source-side `update`, #76). Promoted Recordings are immutable to
 * source-side changes (ADR 0012), so the update is guarded on
 * `promotedSessionId IS NULL` and reports whether a row was actually touched.
 */
export async function updateActivityImportSnapshot(
	input: ActivityImportInput,
): Promise<{ updated: boolean }> {
	const data = ActivityImportInputSchema.parse(input)
	const { count } = await prisma.activityImport.updateMany({
		where: {
			externalProvider: data.externalProvider,
			externalId: data.externalId,
			promotedSessionId: null,
		},
		data: metricColumns(data),
	})
	return { updated: count > 0 }
}

/**
 * Remove a non-promoted import on a source-side `delete` (#76). Promoted
 * Recordings survive — the athlete's training history is immutable to
 * source-side deletes (ADR 0012) — so the delete is guarded on
 * `promotedSessionId IS NULL`.
 */
export async function deleteActivityImportIfUnpromoted(
	externalProvider: string,
	externalId: string,
): Promise<{ deleted: boolean }> {
	const { count } = await prisma.activityImport.deleteMany({
		where: { externalProvider, externalId, promotedSessionId: null },
	})
	return { deleted: count > 0 }
}

export async function getInboxImports(athleteId: string) {
	return prisma.activityImport.findMany({
		where: { athleteId, promotedSessionId: null },
		orderBy: { startedAt: 'desc' },
		select: {
			id: true,
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

	// 'other' is an import-only discipline (ADR 0015): it has no modeled planned
	// session to match against, so it stays in the inbox for manual handling.
	if (imported.discipline === 'other') return null

	const { start: dayStart, end: dayEnd } = dayBoundsUTC(
		localDate(imported.startedAt, athleteTimezone),
		athleteTimezone,
	)

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
	await triggerRecomputeForImport(importId)
}

export async function promoteToNewSession(athleteId: string, importId: string) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, startedAt: true },
	})
	if (!imported) throw new Error('Import not found')

	const result = await prisma.$transaction(async (tx) => {
		const session = await tx.workoutSession.create({
			data: {
				userId: athleteId,
				workoutId: null,
				scheduledAt: imported.startedAt,
				status: 'completed',
				recordingId: importId,
			},
			select: {
				id: true,
				workoutId: true,
				recordingId: true,
				scheduledAt: true,
			},
		})

		await tx.activityImport.update({
			where: { id: importId },
			data: { promotedSessionId: session.id },
		})

		return { session }
	})
	await triggerRecomputeForImport(importId)
	return result
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
	await triggerRecomputeForImport(importId)
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
