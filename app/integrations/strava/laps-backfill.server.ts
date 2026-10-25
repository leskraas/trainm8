import { persistActivityLaps } from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { bestEffort, enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { runStructureDetection } from '#app/utils/structure-detection/detect-job.server.ts'
import { DETECTION_DISCIPLINES } from '#app/utils/structure-detection/types.ts'
import {
	StravaAppInactiveError,
	StravaConnectionRevokedError,
	StravaInsufficientScopeError,
} from './client.server.ts'
import {
	fetchStravaActivityLaps,
	stravaLapsToMarkers,
} from './ingest.server.ts'
import { STRAVA_PROVIDER } from './types.ts'

/**
 * One-shot lap heal (#356, ADR 0033): the Strava sync/backfill path used to file
 * imports without their provider laps, so a run/bike import's Structure
 * Detection was computed stream-only — blind to the short reps and HR-lagged
 * edges that per-rep laps rescue. This backfill fetches laps for each lap-less
 * import and re-runs detection so the lap-edged path supersedes the stream-only
 * one.
 *
 * Frozen Recordings are immutable (ADR 0012/0032), so only **unpromoted** imports
 * are healed — a promoted Recording's detection never silently re-runs. Trigger
 * mirrors the Intervals.icu telemetry heal: server boot enqueues the job exactly
 * once (the job row is the "already ran" marker) and each per-activity fetch is
 * paced by the shared Strava rate limiter, so the heal stays within the per-app
 * budget (ADR 0013) even across a large history.
 */
export const STRAVA_LAPS_BACKFILL_JOB_KIND = 'strava-laps-backfill'

/**
 * Enqueue the one-shot lap heal if it has never been enqueued. Any existing job
 * of this kind — pending, running, completed, or dead-lettered — means boot does
 * not enqueue another.
 */
export async function ensureStravaLapsBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: STRAVA_LAPS_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: STRAVA_LAPS_BACKFILL_JOB_KIND })
}

/**
 * For every active Strava connection, fetch laps for each unpromoted run/bike
 * import that carries a stream but no laps yet, persist them, and re-run
 * detection. Laps are mapped against each import's wall-clock start (the raw
 * stream isn't re-fetched); an activity with no per-rep laps persists nothing and
 * keeps its stream-only detection. A revoked/inactive grant stops fetching for
 * that athlete and moves on; a single activity's failure never aborts the rest.
 */
export async function runStravaLapsBackfill(): Promise<void> {
	const connections = await prisma.accountConnection.findMany({
		where: { provider: STRAVA_PROVIDER, status: 'active' },
		select: {
			id: true,
			athleteId: true,
			accessToken: true,
			refreshToken: true,
			expiresAt: true,
		},
	})

	// Whether this run settled any import, so a deferral says it made progress
	// and the queue's deferral cap doesn't dead-letter a long heal (#638).
	let progressed = false

	for (const connection of connections) {
		const imports = await prisma.activityImport.findMany({
			where: {
				athleteId: connection.athleteId,
				externalProvider: STRAVA_PROVIDER,
				discipline: { in: [...DETECTION_DISCIPLINES] },
				promotedSessionId: null,
				lapsJson: null,
				stream: { isNot: null },
			},
			select: { id: true, externalId: true, startedAt: true },
		})
		if (imports.length === 0) continue

		for (const imp of imports) {
			// A single activity's failure never aborts the rest; a spent Strava
			// budget defers the backfill, and the queue resumes it later (#637).
			const result = await bestEffort(() => healImportLaps(connection, imp), {
				progressed,
			})
			if (result.ok) {
				progressed = true
				continue
			}
			const err = result.error
			if (
				err instanceof StravaConnectionRevokedError ||
				err instanceof StravaInsufficientScopeError ||
				err instanceof StravaAppInactiveError
			) {
				// The connection can't be fetched against until re-authorized (or the
				// app is reactivated): stop this athlete and move to the next.
				if (err instanceof StravaConnectionRevokedError) {
					await prisma.accountConnection.update({
						where: { id: connection.id },
						data: { status: 'revoked' },
					})
				}
				break
			}
			console.error(
				`Strava laps backfill failed for activity ${imp.externalId}`,
				err,
			)
		}
	}
}

/**
 * Fetch one import's laps and persist them, re-running its detection; or,
 * when Strava has no interior laps for it, mark it settled. A body that
 * doesn't parse throws, leaving the import for a later run to ask again
 * (#638).
 */
async function healImportLaps(
	connection: Parameters<typeof fetchStravaActivityLaps>[0],
	imp: { id: string; externalId: string; startedAt: Date },
): Promise<void> {
	const laps = await fetchStravaActivityLaps(connection, imp.externalId)
	const markers = stravaLapsToMarkers(laps, {
		activityStartMs: imp.startedAt.getTime(),
	})
	if (!(await persistActivityLaps(imp.id, markers))) {
		// Asked, and Strava has no interior laps for it. Mark it so a deferred
		// run (#637), which starts over, doesn't spend the budget on it again;
		// detection reads `[]` as no laps.
		await prisma.activityImport.update({
			where: { id: imp.id },
			data: { lapsJson: '[]' },
		})
		return
	}
	// Re-run detection against the fresh laps (idempotent upsert): an
	// unpromoted import's detection re-computes with the lap-edged path.
	await runStructureDetection({ activityImportId: imp.id })
}
