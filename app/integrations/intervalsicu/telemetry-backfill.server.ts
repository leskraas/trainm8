import { enrichImportTelemetry } from '#app/utils/activity-telemetry.server.ts'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { IntervalsIcuKeyRejectedError } from './client.server.ts'
import { fetchIntervalsIcuActivityStreams } from './ingest.server.ts'
import { INTERVALSICU_PROVIDER } from './types.ts'

/**
 * One-shot data correction: the daily reconciliation sweep — this provider's
 * primary ingest path (no webhook, ADR 0026) — used to file imports without
 * ever fetching their per-sample streams, so every activity it brought in
 * reads "Telemetry not available" and its TSS never saw the power stream.
 * The sweep now ingests telemetry going forward; this backfill heals the
 * imports already filed without a stream, then recomputes Training Load so
 * NP-based TSS (ADR 0024) reflects the recovered streams.
 *
 * Trigger mirrors the NP recompute backfill (#174): server boot enqueues the
 * job exactly once — the job row itself is the "already ran" marker — and the
 * work flows through the existing telemetry-enrichment and recompute paths.
 * Imports that genuinely have no streams at the source (manual entries) fetch
 * once, persist nothing, and stay honestly Unavailable.
 */
export const INTERVALSICU_TELEMETRY_BACKFILL_JOB_KIND =
	'intervalsicu-telemetry-backfill'

/**
 * Enqueue the one-shot telemetry heal if it has never been enqueued. Any
 * existing job of this kind — pending, running, completed, or dead-lettered —
 * means boot does not enqueue another.
 */
export async function ensureIntervalsIcuTelemetryBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: INTERVALSICU_TELEMETRY_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: INTERVALSICU_TELEMETRY_BACKFILL_JOB_KIND })
}

/**
 * For every active Intervals.icu connection, fetch streams for each modeled
 * import that has none, persist the Activity Stream + HR phase bars, and —
 * when anything landed — recompute Training Load from the earliest healed
 * import. A key rejection flips the connection to `revoked` (ADR 0026) and
 * moves on to the next athlete; a single activity's failure never aborts the
 * rest.
 */
export async function runIntervalsIcuTelemetryBackfill(): Promise<void> {
	const connections = await prisma.accountConnection.findMany({
		where: { provider: INTERVALSICU_PROVIDER, status: 'active' },
		select: { id: true, athleteId: true, accessToken: true },
	})

	for (const connection of connections) {
		const imports = await prisma.activityImport.findMany({
			where: {
				athleteId: connection.athleteId,
				externalProvider: INTERVALSICU_PROVIDER,
				discipline: { not: 'other' },
				stream: null,
			},
			select: { id: true, externalId: true, discipline: true, startedAt: true },
		})
		if (imports.length === 0) continue

		let earliestHealedAt: Date | null = null
		let keyRejected = false
		for (const imp of imports) {
			try {
				const raw = await fetchIntervalsIcuActivityStreams(
					connection.accessToken,
					imp.externalId,
				)
				if (!raw) continue
				await enrichImportTelemetry(
					connection.athleteId,
					imp.id,
					imp.discipline,
					raw,
				)
				if (earliestHealedAt == null || imp.startedAt < earliestHealedAt) {
					earliestHealedAt = imp.startedAt
				}
			} catch (err) {
				if (err instanceof IntervalsIcuKeyRejectedError) {
					// A regenerated or deleted key never recovers on its own: record
					// the truth on the row and stop fetching for this athlete.
					await prisma.accountConnection.update({
						where: { id: connection.id },
						data: { status: 'revoked' },
					})
					keyRejected = true
					break
				}
				console.error(
					`Intervals.icu telemetry backfill failed for activity ${imp.externalId}`,
					err,
				)
			}
		}
		if (keyRejected || earliestHealedAt == null) continue

		const timezone =
			(
				await prisma.athleteProfile.findUnique({
					where: { userId: connection.athleteId },
					select: { timezone: true },
				})
			)?.timezone ?? 'UTC'
		await recomputeLoadFrom(
			connection.athleteId,
			localDate(earliestHealedAt, timezone),
		)
	}
}
