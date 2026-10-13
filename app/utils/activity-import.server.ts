import { z } from 'zod/v3'
import {
	normalizeDeviceName,
	ORIGIN_PLATFORMS,
	originPlatformForTransport,
} from '#app/integrations/shared/origin-platform.ts'
import { dayBoundsUTC, localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { fitsImport, isRecordingOnlySource } from './import-fit.ts'
import { publishActivityImportCreated } from './imports-events.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'
import { triggerRecomputeForSession } from './session-log.server.ts'
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
 * The one load recompute a batch owes after auto-saving its imports with
 * `recomputeLoad: false`: from the oldest saved import's day through today.
 * Fire-and-forget like the per-import recompute it replaces.
 */
export async function recomputeLoadAfterBatch(
	athleteId: string,
	oldestStartedAt: Date | null,
	timezone: string,
): Promise<void> {
	if (oldestStartedAt == null) return
	try {
		await recomputeLoadFrom(athleteId, localDate(oldestStartedAt, timezone))
	} catch {
		// Fire-and-forget: silently skip if the DB is unavailable.
	}
}

/**
 * The provider-neutral shape every import is filed as, validated at the insert
 * boundary. Optional physiological/mechanical metrics are `nullish` — absent
 * whenever the provider didn't report them. Distances are metres, speeds m/s,
 * times seconds. The type is inferred from the schema so the two never drift.
 */
/**
 * The transports an import can come down. The direct vendors are here ahead of
 * their folders (#555) so the shared FIT ingest (`ingestFit`) can file them.
 */
export const IMPORT_TRANSPORTS = [
	'manual',
	'strava',
	'intervalsicu',
	'garmin',
	'polar',
	'coros',
	'suunto',
	'wahoo',
] as const
export type ImportTransport = (typeof IMPORT_TRANSPORTS)[number]

export const ActivityImportInputSchema = z.object({
	externalProvider: z.enum(IMPORT_TRANSPORTS),
	externalId: z.string(),
	/**
	 * Provenance (ADR 0096 §1). `originPlatform` defaults to what the transport
	 * implies on its own (`originPlatformForTransport`); a bridge like
	 * Intervals.icu reads it off the activity and must pass it. `deviceName` is
	 * display text only, and `fitFileKey` the original FIT's identity (#547).
	 */
	originPlatform: z.enum(ORIGIN_PLATFORMS).optional(),
	deviceName: z.string().nullish(),
	fitFileKey: z.string().nullish(),
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
			// Identity, fixed at insert: a mirror update never rewrites where the
			// activity came from (ADR 0096 §6).
			originPlatform:
				data.originPlatform ??
				originPlatformForTransport(data.externalProvider),
			deviceName: normalizeDeviceName(data.deviceName),
			fitFileKey: data.fitFileKey ?? null,
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
	athleteId: string,
	input: ActivityImportInput,
): Promise<{ updated: boolean }> {
	const data = ActivityImportInputSchema.parse(input)
	const existing = await prisma.activityImport.findUnique({
		where: {
			athleteId_externalProvider_externalId: {
				athleteId,
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
 *
 * With aliases (ADR 0096 §7): a delete for a key held as an alias removes that
 * alias only, and a delete for the import's own key keeps the import while any
 * alias remains — another source still vouches for the activity.
 */
export async function deleteImportIfAutoSaveMirror(
	athleteId: string,
	externalProvider: string,
	externalId: string,
): Promise<{ deleted: boolean }> {
	const key = { athleteId, externalProvider, externalId }
	const { count: aliasesRemoved } = await prisma.activityImportAlias.deleteMany(
		{ where: key },
	)
	if (aliasesRemoved > 0) return { deleted: false }

	const existing = await prisma.activityImport.findUnique({
		where: { athleteId_externalProvider_externalId: key },
		select: {
			id: true,
			promotedSessionId: true,
			_count: { select: { aliases: true } },
		},
	})
	if (!existing) return { deleted: false }
	if (existing._count.aliases > 0) return { deleted: false }
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
 * Why a link could not be made: the import or the session is not the
 * athlete's, or the session already holds another Recording. The one error the
 * link paths throw on purpose, so a caller can tell "not found" from a fault.
 */
export class ImportLinkNotFoundError extends Error {
	constructor(what: 'import' | 'session') {
		super(what === 'import' ? 'Import not found' : 'Session not found')
		this.name = 'ImportLinkNotFoundError'
	}
}

/**
 * The planned sessions an import could be, by `fitsImport` (same local day,
 * same sport, a planned session holding no Recording). The one rule
 * auto-save links by, its `unsure` verdict reads, I dag's "hva var dette?"
 * offers by, and a link answer is checked against. Empty for an unknown
 * import and for `'other'` (ADR 0015).
 */
export async function findPlanCandidates(
	athleteId: string,
	importId: string,
	athleteTimezone: string,
): Promise<string[]> {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, startedAt: true, discipline: true },
	})
	if (!imported || imported.discipline === 'other') return []

	const dayKey = localDate(imported.startedAt, athleteTimezone)
	const { start: dayStart, end: dayEnd } = dayBoundsUTC(dayKey, athleteTimezone)

	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId: athleteId,
			scheduledAt: { gte: dayStart, lte: dayEnd },
		},
		orderBy: { scheduledAt: 'asc' },
		select: {
			id: true,
			scheduledAt: true,
			source: true,
			adoptedAt: true,
			recordingId: true,
			workout: { select: { discipline: true } },
		},
	})
	return sessions
		.filter((session) =>
			fitsImport(
				{
					source: session.source,
					adoptedAt: session.adoptedAt,
					hasRecording: session.recordingId != null,
					workoutDiscipline: session.workout?.discipline ?? null,
					dayKey: localDate(session.scheduledAt, athleteTimezone),
				},
				{ discipline: imported.discipline, dayKey },
			),
		)
		.map((session) => session.id)
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
	if (!imported) throw new ImportLinkNotFoundError('import')

	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId: athleteId },
		select: { id: true },
	})
	if (!session) throw new ImportLinkNotFoundError('session')

	await linkImportToSession(importId, sessionId)
	await triggerRecomputeForImport(importId)
}

export async function promoteToNewSession(
	athleteId: string,
	importId: string,
	{ recomputeLoad = true }: LoadRecomputeOption = {},
) {
	const imported = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { id: true, startedAt: true },
	})
	if (!imported) throw new ImportLinkNotFoundError('import')

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

	if (recomputeLoad) await triggerRecomputeForImport(importId)
	return result
}

/**
 * A batch ingest (a Backfill Window, a sync of many activities) passes
 * `recomputeLoad: false` and runs `recomputeLoadFrom` once, from its oldest
 * activity's day, after the whole batch has landed. Recomputing per import
 * rewrites every day from that import to today, so a batch of N recomputes
 * O(N × days) and a 50-activity backfill ran ~30,000 queries; one pass from the
 * oldest day writes the same snapshots.
 */
type LoadRecomputeOption = { recomputeLoad?: boolean }

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
	{ recomputeLoad = true }: LoadRecomputeOption = {},
): Promise<AutoSaveResult | null> {
	const candidates = await findPlanCandidates(
		athleteId,
		importId,
		athleteTimezone,
	)
	if (candidates.length === 1) {
		await linkImportToSession(importId, candidates[0]!)
		if (recomputeLoad) await triggerRecomputeForImport(importId)
		return { sessionId: candidates[0]!, matchedPlan: true, unsure: false }
	}

	const promoted = await promoteToNewSession(athleteId, importId, {
		recomputeLoad,
	}).catch((error: unknown) => {
		if (error instanceof ImportLinkNotFoundError) return null
		throw error
	})
	if (!promoted) return null
	// Several planned sessions fit and the rule will not pick one: the import
	// stands as an _ekstra_ session, and I dag asks "hva var dette?" (#505
	// story 80). One that fits nothing is simply ekstra — nothing to ask.
	return {
		sessionId: promoted.session.id,
		matchedPlan: false,
		unsure: candidates.length > 1,
	}
}

/**
 * What auto-save did with an import: linked it to the one planned session
 * that fit, or stood it up as an _ekstra_ session of its own — `unsure` when
 * more than one planned session could have been it, so the athlete is asked.
 */
export type AutoSaveResult = {
	sessionId: string
	matchedPlan: boolean
	unsure: boolean
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
	if (!imported) throw new ImportLinkNotFoundError('import')

	const target = await prisma.workoutSession.findFirst({
		where: { id: targetSessionId, userId: athleteId, recordingId: null },
		select: { id: true },
	})
	if (!target) throw new ImportLinkNotFoundError('session')

	if (imported.promotedSessionId) {
		await releaseRecording(importId, imported.promotedSessionId)
	}
	await linkImportToSession(importId, targetSessionId)
	await triggerRecomputeForImport(importId)
	return { sessionId: targetSessionId }
}

/**
 * Detach an import from the session currently holding it, deleting that session
 * when it was a recording-only shell that existed only to carry this Recording.
 * Leaves the import unpromoted — every caller re-homes it immediately after.
 */
async function releaseRecording(importId: string, sessionId: string) {
	const session = await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: {
			id: true,
			workoutId: true,
			source: true,
			adoptedAt: true,
			markedDoneAt: true,
			statusBeforeLink: true,
			_count: { select: { setLogs: true } },
		},
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
				data: {
					recordingId: null,
					status: statusWithoutRecording(session),
					statusBeforeLink: null,
					// The TSS was the Recording's. Left behind it would count twice —
					// here and on the session the Recording moves to — so it goes,
					// and the recompute below prices what is left (an RPE, or nothing).
					tssValue: null,
					tssFormula: null,
					tssConfidence: null,
				},
			})
		}
	})
	if (!isRecordingOnlySource(session)) {
		await triggerRecomputeForSession(session.id)
	}
}

/**
 * The status a session goes back to when its Recording leaves. The status it
 * had before the link, when that was kept; done regardless when the athlete
 * said so by hand, lifted sets on it, or adopted it as an ekstra session — the
 * ways a session is done with no Recording (#505 stories 81–82, ADR 0056,
 * #460). Otherwise not done: the Recording was what said it happened.
 */
function statusWithoutRecording(session: {
	source: string
	markedDoneAt: Date | null
	statusBeforeLink: string | null
	_count: { setLogs: number }
}): string {
	if (
		session.markedDoneAt != null ||
		session._count.setLogs > 0 ||
		session.source === 'recorded' ||
		session.source === 'detected'
	) {
		return 'completed'
	}
	return session.statusBeforeLink ?? 'scheduled'
}

/**
 * Put a Recording on a session. A session holding a Recording is done — the
 * activity happened — so the link completes it, which is what moves it from
 * "ikke gjort" to done on I dag and into the week's Actual Volume. Any earlier
 * _Angre kobling_ is forgotten: the import has a session again.
 */
async function linkImportToSession(importId: string, sessionId: string) {
	await prisma.$transaction(async (tx) => {
		const before = await tx.workoutSession.findUniqueOrThrow({
			where: { id: sessionId },
			select: { status: true },
		})
		await tx.workoutSession.update({
			where: { id: sessionId },
			data: {
				recordingId: importId,
				status: 'completed',
				// Kept so _Angre kobling_ can put the session back as it was.
				statusBeforeLink: before.status,
			},
		})
		await tx.activityImport.update({
			where: { id: importId },
			data: { promotedSessionId: sessionId, unlinkedFromSessionId: null },
		})
	})
}
