import { z } from 'zod'
import { enrichImportTelemetry } from './activity-telemetry.server.ts'
import { localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { enqueueJob } from './jobs/queue.server.ts'
import { recomputeLoadFrom } from './load/snapshot.server.ts'
import { parseTcx } from './tcx-parser.server.ts'

/**
 * One-shot data heal (ADR 0036): TCX used to be the only import format that
 * ingested no Activity Stream — the ingest dispatch hard-coded `stream: null`
 * — so every historical TCX run/bike carries no Telemetry Overlay and no
 * stream-derived Normalized Power. The forward path now parses trackpoints into
 * a stream; this backfill heals the imports already filed without one.
 *
 * TCX `rawJson` stores the entire XML verbatim (`activity-file-ingest`), so the
 * stream is fully re-derivable from stored bytes — no re-upload, no network.
 * Each affected import is re-parsed into a `RawStream`, enriched through the
 * shared `enrichImportTelemetry`, and its lap markers backfilled; Training Load
 * is then recomputed so NP-based Coggan TSS (ADR 0024) reflects the recovered
 * power channel.
 *
 * Trigger mirrors the NP recompute backfill (#174) and the Intervals.icu
 * telemetry heal: server boot enqueues the job exactly once — the job row
 * itself is the "already ran" marker, persisted across restarts and retried
 * with backoff for free.
 */
export const TCX_STREAM_BACKFILL_JOB_KIND = 'tcx-stream-backfill'

/**
 * Enqueue the one-shot TCX stream heal if it has never been enqueued. Any
 * existing job of this kind — pending, running, completed, or dead-lettered
 * after exhausting retries — means boot does not enqueue another.
 */
export async function ensureTcxStreamBackfillEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: TCX_STREAM_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: TCX_STREAM_BACKFILL_JOB_KIND })
}

/** The `{ fileName, fileContent }` snapshot the file-upload ingest stores in
 * `rawJson` — GPX shares the shape, so the `.tcx` filename gate separates them. */
const FileSnapshotSchema = z.object({
	fileName: z.string(),
	fileContent: z.string(),
})

/** The verbatim TCX XML from an import's `rawJson`, or `null` when the row is
 * not a TCX file upload (a provider payload, a GPX snapshot, or malformed). */
function tcxContentFromRawJson(rawJson: string): string | null {
	try {
		const snapshot = FileSnapshotSchema.safeParse(JSON.parse(rawJson))
		if (
			snapshot.success &&
			snapshot.data.fileName.toLowerCase().endsWith('.tcx')
		) {
			return snapshot.data.fileContent
		}
	} catch {
		// Not a JSON snapshot (e.g. a provider payload) — not a TCX file upload.
	}
	return null
}

/**
 * Re-parse every stream-less, modeled-discipline manual import whose `rawJson`
 * holds a TCX file, persist its recovered Activity Stream + lap markers, and —
 * when anything landed — recompute Training Load from the earliest healed
 * import so NP-based TSS reflects the recovered power channel. `other`-sport
 * TCX is excluded (no stream, no load; ADR 0015); a single import's failure
 * never aborts the rest.
 */
export async function runTcxStreamBackfill(): Promise<void> {
	// Manual file uploads are the only source that stores TCX; GPX also uses the
	// `{ fileName, fileContent }` shape, so the `.tcx` filename gate (and the
	// parser itself) separates the two.
	const imports = await prisma.activityImport.findMany({
		where: {
			externalProvider: 'manual',
			discipline: { not: 'other' },
			stream: null,
		},
		select: {
			id: true,
			athleteId: true,
			discipline: true,
			startedAt: true,
			rawJson: true,
		},
	})

	const earliestByAthlete = new Map<string, Date>()
	const consider = (athleteId: string, at: Date) => {
		const current = earliestByAthlete.get(athleteId)
		if (!current || at < current) earliestByAthlete.set(athleteId, at)
	}

	for (const imp of imports) {
		const fileContent = tcxContentFromRawJson(imp.rawJson)
		if (fileContent == null) continue

		let stream
		let lapsJson: string | null
		try {
			const parsed = parseTcx(fileContent)
			stream = parsed.stream
			lapsJson = parsed.activity.lapsJson ?? null
		} catch {
			// A non-TCX or garbled payload that slipped the filename gate: skip.
			continue
		}

		// Heal lap markers even when the stream is unplottable — they are an
		// independent refinement signal (#328).
		if (lapsJson != null) {
			try {
				await prisma.activityImport.update({
					where: { id: imp.id },
					data: { lapsJson },
				})
			} catch {
				// Best-effort; a lap-marker write must not lose the stream heal.
			}
		}

		if (!stream) continue
		await enrichImportTelemetry(imp.athleteId, imp.id, imp.discipline, stream)
		consider(imp.athleteId, imp.startedAt)
	}

	for (const [athleteId, earliest] of earliestByAthlete) {
		const profile = await prisma.athleteProfile.findUnique({
			where: { userId: athleteId },
			select: { timezone: true },
		})
		// No Athlete Profile → no thresholds → recomputeLoadFrom is a no-op.
		if (!profile) continue
		await recomputeLoadFrom(athleteId, localDate(earliest, profile.timezone))
	}
}
