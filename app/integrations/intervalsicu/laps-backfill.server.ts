import { persistActivityLaps } from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { runStructureDetection } from '#app/utils/structure-detection/detect-job.server.ts'
import { DETECTION_DISCIPLINES } from '#app/utils/structure-detection/types.ts'
import { IntervalsIcuKeyRejectedError } from './client.server.ts'
import {
	fetchIntervalsIcuActivityIntervals,
	intervalsIcuIntervalsToMarkers,
} from './ingest.server.ts'
import { INTERVALSICU_PROVIDER } from './types.ts'

/**
 * One-shot lap heal (#356, ADR 0033): the Intervals.icu sweep used to file
 * imports without their interval breakdown, so a run/bike import's Structure
 * Detection was computed stream-only. This backfill fetches each lap-less
 * import's `icu_intervals` — Intervals.icu's own detected/lap-derived edges, the
 * highest-trust external structure signal — and re-runs detection so the
 * lap-edged path supersedes the stream-only one.
 *
 * Frozen Recordings are immutable (ADR 0012/0032), so only **unpromoted** imports
 * are healed. Trigger mirrors the telemetry heal: server boot enqueues the job
 * exactly once (the job row is the marker) and each fetch is paced by the shared
 * courtesy pacer — one call per activity, comfortable against the 5,000/day
 * budget.
 */
export const INTERVALSICU_LAPS_BACKFILL_JOB_KIND = 'intervalsicu-laps-backfill'

/**
 * Enqueue the one-shot lap heal if it has never been enqueued. Any existing job
 * of this kind — pending, running, completed, or dead-lettered — means boot does
 * not enqueue another.
 */
export async function ensureIntervalsIcuLapsBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: INTERVALSICU_LAPS_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: INTERVALSICU_LAPS_BACKFILL_JOB_KIND })
}

/**
 * For every active Intervals.icu connection, fetch the interval breakdown for
 * each unpromoted run/bike import that carries a stream but no laps yet, persist
 * the edges, and re-run detection. An activity with no breakdown persists nothing
 * and keeps its stream-only detection. A key rejection flips the connection to
 * `revoked` (ADR 0026) and moves on to the next athlete; a single activity's
 * failure never aborts the rest.
 */
export async function runIntervalsIcuLapsBackfill(): Promise<void> {
	const connections = await prisma.accountConnection.findMany({
		where: { provider: INTERVALSICU_PROVIDER, status: 'active' },
		select: { id: true, athleteId: true, accessToken: true },
	})

	for (const connection of connections) {
		const imports = await prisma.activityImport.findMany({
			where: {
				athleteId: connection.athleteId,
				externalProvider: INTERVALSICU_PROVIDER,
				discipline: { in: [...DETECTION_DISCIPLINES] },
				promotedSessionId: null,
				lapsJson: null,
				stream: { isNot: null },
			},
			select: { id: true, externalId: true },
		})
		if (imports.length === 0) continue

		for (const imp of imports) {
			try {
				const intervals = await fetchIntervalsIcuActivityIntervals(
					connection.accessToken,
					imp.externalId,
				)
				if (!intervals) continue
				const markers = intervalsIcuIntervalsToMarkers(intervals)
				if (!(await persistActivityLaps(imp.id, markers))) continue
				// Re-run detection against the fresh laps (idempotent upsert): an
				// unpromoted import's detection re-computes with the lap-edged path.
				await runStructureDetection({ activityImportId: imp.id })
			} catch (err) {
				if (err instanceof IntervalsIcuKeyRejectedError) {
					// A regenerated or deleted key never recovers on its own: record the
					// truth on the row and stop fetching for this athlete.
					await prisma.accountConnection.update({
						where: { id: connection.id },
						data: { status: 'revoked' },
					})
					break
				}
				console.error(
					`Intervals.icu laps backfill failed for activity ${imp.externalId}`,
					err,
				)
			}
		}
	}
}
