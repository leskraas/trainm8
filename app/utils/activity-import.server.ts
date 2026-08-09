import { z } from 'zod'
import { dayBoundsUTC, localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { publishActivityImportCreated } from './imports-events.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'
import {
	materializeDetectedStructure,
	parseStoredWorkoutStructure,
} from './workout.server.ts'

/**
 * Resolve the load-recompute an import's date implies, without running it yet.
 * Split in two so a caller that is about to *delete* the import can capture the
 * date first and still recompute afterwards.
 */
async function recomputeFromImportDate(
	importId: string,
): Promise<() => Promise<void>> {
	const noop = async () => {}
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
		if (!imp) return noop
		const timezone = imp.athlete.athleteProfile?.timezone ?? 'UTC'
		const dateStr = localDate(imp.startedAt, timezone)
		return async () => {
			try {
				await recomputeLoadFrom(imp.athleteId, dateStr)
			} catch {
				// Fire-and-forget: silently skip if the DB is unavailable.
			}
		}
	} catch {
		// Fire-and-forget: silently skip if DB is unavailable (e.g. test teardown)
		return noop
	}
}

async function triggerRecomputeForImport(importId: string): Promise<void> {
	const recompute = await recomputeFromImportDate(importId)
	await recompute()
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
	// Push a live "new import landed" event to the athlete's open tabs (#75).
	// This is the single insert choke point, so manual sync (#72), backfill
	// (#74), file upload, and webhook (#76) all publish here after a successful
	// insert without each call site having to remember to.
	publishActivityImportCreated(athleteId)
	return created
}

/**
 * Is this import still an **auto-save mirror** — a plain reflection of the
 * source activity that the athlete has not built anything on?
 *
 * ADR 0012 keyed its source-side rules on "not yet promoted": an inbox item was
 * fair game to refresh or delete, a promoted Recording was frozen training
 * history. Auto-save (ADR 0049) promotes on arrival, so that line would freeze
 * everything the instant it landed. The same intent is now drawn one step
 * later: a mirror is the recording-only Workout Session auto-save stood up,
 * still structureless (no Workout materialized or authored onto it) and
 * carrying no Session Log. Anything else — matched to a planned session,
 * detection materialized, logged by the athlete — is history and stays frozen.
 */
export async function isAutoSaveMirror(importId: string): Promise<boolean> {
	const imported = await prisma.activityImport.findUnique({
		where: { id: importId },
		select: {
			promotedSession: {
				select: {
					workoutId: true,
					sessionLog: { select: { id: true } },
				},
			},
		},
	})
	if (!imported) return false
	// No session at all — a pre-auto-save leftover, or an import mid-flight. Even
	// less is built on it than on a mirror, so it follows the same rules.
	const session = imported.promotedSession
	if (!session) return true
	return session.workoutId === null && session.sessionLog === null
}

/**
 * Refresh an auto-save mirror's snapshot in place from a fresh provider payload
 * (source-side `update`, #76). A Recording the athlete has built on is immutable
 * to source-side changes (ADR 0012 as amended by ADR 0049); reports whether a
 * row was actually touched.
 */
export async function updateActivityImportSnapshot(
	input: ActivityImportInput,
): Promise<{ updated: boolean }> {
	const data = ActivityImportInputSchema.parse(input)
	const existing = await prisma.activityImport.findUnique({
		where: {
			externalProvider_externalId: {
				externalProvider: data.externalProvider,
				externalId: data.externalId,
			},
		},
		select: { id: true },
	})
	if (!existing) return { updated: false }
	if (!(await isAutoSaveMirror(existing.id))) return { updated: false }

	await prisma.activityImport.update({
		where: { id: existing.id },
		data: metricColumns(data),
	})
	return { updated: true }
}

/**
 * Remove an auto-save mirror on a source-side `delete` (#76) — the recording-only
 * Workout Session auto-save created goes with it, since the session exists only
 * to carry this import. A Recording the athlete has built on survives: their
 * training history is immutable to source-side deletes (ADR 0012 / ADR 0049).
 */
export async function deleteImportIfAutoSaveMirror(
	externalProvider: string,
	externalId: string,
): Promise<{ deleted: boolean }> {
	const existing = await prisma.activityImport.findUnique({
		where: { externalProvider_externalId: { externalProvider, externalId } },
		select: { id: true, promotedSessionId: true },
	})
	if (!existing) return { deleted: false }
	if (!(await isAutoSaveMirror(existing.id))) return { deleted: false }

	// The recompute reads the import's date, so resolve it before the rows go.
	const recompute = await recomputeFromImportDate(existing.id)

	await prisma.$transaction(async (tx) => {
		// Release the FKs in both directions before deleting either row.
		await tx.activityImport.update({
			where: { id: existing.id },
			data: { promotedSessionId: null },
		})
		if (existing.promotedSessionId) {
			await tx.workoutSession.delete({
				where: { id: existing.promotedSessionId },
			})
		}
		await tx.activityImport.delete({ where: { id: existing.id } })
	})
	await recompute()
	return { deleted: true }
}

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
	// session to match against, so it never matches. Auto-save still gives it a
	// recording-only session of its own (ADR 0049).
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
				// A recording-only promotion is structureless: mark the Session
				// Source `recorded` (net-new — no path wrote it before this ticket, so
				// promoted recordings silently kept the `authored` default). Structure
				// Detection later flips this to `detected` if it materializes a Workout
				// onto the session (ADR 0032/0033).
				source: 'recorded',
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

	// Auto-import a gate-clearing detection onto the new recording-only session,
	// flipping the Session Source `recorded` → `detected` (ADR 0032/0033). The
	// detection is re-read *after* the promotion commits: a detection written
	// concurrently by the job (which may have read this import before it was
	// promoted, and so skipped materialization) would be missed by a pre-commit
	// snapshot. When the job instead materializes after promotion, the
	// compare-and-swap in `materializeDetectedStructure` keeps this idempotent —
	// either ordering ends with the same single auto-imported structure.
	const detection = await prisma.workoutDetection.findUnique({
		where: { activityImportId: importId },
		select: { structureJson: true },
	})
	if (detection) {
		const structure = parseStoredWorkoutStructure(detection.structureJson)
		if (structure) {
			await materializeDetectedStructure(
				athleteId,
				result.session.id,
				structure,
			)
		}
	}

	await triggerRecomputeForImport(importId)
	return result
}

/**
 * **Auto-save** — the one thing that happens to every Activity Import the moment
 * it lands (ADR 0049). It matches onto a same-day, same-discipline planned
 * Workout Session when exactly one fits, and otherwise stands up a
 * recording-only session of its own. There is no inbox and no confirmation
 * step, so no import is ever left unpromoted and invisible; `'other'` imports
 * (ADR 0015) never match a plan but still get their own session.
 *
 * Every ingest path funnels through here — manual sync, webhook, Backfill
 * Window, file upload, share target — so "what happens to a new activity" has
 * exactly one answer.
 */
export async function autoSaveImport(
	athleteId: string,
	importId: string,
	athleteTimezone: string,
): Promise<{ sessionId: string; matchedPlan: boolean } | null> {
	const matched = await autoMatchImport(athleteId, importId, athleteTimezone)
	if (matched) {
		// autoMatchImport links but leaves the load recompute to its caller.
		await triggerRecomputeForImport(importId)
		return { sessionId: matched.sessionId, matchedPlan: true }
	}

	const promoted = await promoteToNewSession(athleteId, importId).catch(
		() => null,
	)
	if (!promoted) return null
	return { sessionId: promoted.session.id, matchedPlan: false }
}

/**
 * Move a Recording off the planned session it was matched to and onto a
 * recording-only session of its own — the "that wasn't this workout" escape
 * hatch on the Workout Detail View. The plan goes back to unrecorded; the
 * activity keeps a home, because with no inbox an unpromoted import would be
 * invisible (ADR 0049).
 */
export async function detachRecordingFromPlan(
	athleteId: string,
	importId: string,
) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, promotedSessionId: true },
	})
	if (!imported?.promotedSessionId) return null

	const session = await prisma.workoutSession.findUnique({
		where: { id: imported.promotedSessionId },
		select: { id: true, source: true, adoptedAt: true },
	})
	// Already standing alone — nothing to detach from.
	if (!session || isRecordingOnlySource(session)) return null

	await releaseRecording(importId, session.id)
	const promoted = await promoteToNewSession(athleteId, importId)
	return { sessionId: promoted.session.id }
}

/**
 * Re-point a Recording at a different planned Workout Session — the fix for an
 * auto-match that picked the wrong session, or for an activity auto-save had to
 * stand up on its own because no single plan fit. The session it vacates is
 * deleted when it was only ever this Recording's own recording-only session.
 */
export async function relinkRecordingToSession(
	athleteId: string,
	importId: string,
	targetSessionId: string,
) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, promotedSessionId: true },
	})
	if (!imported) throw new Error('Import not found')

	const target = await prisma.workoutSession.findFirst({
		where: { id: targetSessionId, userId: athleteId, recordingId: null },
		select: { id: true },
	})
	if (!target) throw new Error('Session not found')

	if (imported.promotedSessionId) {
		await releaseRecording(importId, imported.promotedSessionId)
	}
	await linkImportToSession(importId, targetSessionId)
	await triggerRecomputeForImport(importId)
	return { sessionId: targetSessionId }
}

/**
 * A session auto-save stood up for a Recording, rather than a plan the athlete
 * (or Plan Generation) authored: `recorded` while structureless, `detected`
 * once Structure Detection materialized a Workout onto it (ADR 0033). Both
 * exist only to carry their Recording, so both go when it moves away — unlike
 * an `authored` / `generated` session, which is a plan and outlives it.
 *
 * **Unless the athlete has adopted it** (#460). Once they have corrected the
 * detected structure, the session is carrying their work as well as the
 * Recording, and deleting it because the Recording moved elsewhere would destroy
 * that work. Adoption used to be invisible here only because it rewrote `source`
 * to `authored`; reading `adoptedAt` keeps the same outcome now that the origin
 * survives.
 */
function isRecordingOnlySource(session: {
	source: string
	adoptedAt: Date | null
}): boolean {
	if (session.adoptedAt != null) return false
	return session.source === 'recorded' || session.source === 'detected'
}

/**
 * Detach an import from the session currently holding it, deleting that session
 * when it was a recording-only shell that existed only to carry this Recording.
 * Leaves the import unpromoted — every caller re-homes it immediately after.
 */
async function releaseRecording(importId: string, sessionId: string) {
	const session = await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: { id: true, workoutId: true, source: true, adoptedAt: true },
	})
	if (!session) return

	await prisma.$transaction(async (tx) => {
		// Clear the import's promoted pointer first to avoid FK issues.
		await tx.activityImport.update({
			where: { id: importId },
			data: { promotedSessionId: null },
		})

		if (isRecordingOnlySource(session)) {
			await tx.workoutSession.delete({ where: { id: session.id } })
			// A `detected` session carries a materialized Workout that nothing else
			// references; it goes with the session rather than lingering orphaned.
			if (session.workoutId) {
				await tx.workout.delete({ where: { id: session.workoutId } })
			}
		} else {
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
