import {
	downsampleStream,
	isNum,
	parseStoredStream,
	serializeStream,
	type RawStream,
} from './activity-stream.ts'
import { prisma } from './db.server.ts'
import { deriveHrPhaseBars } from './recording-profile.ts'
import { enqueueStructureDetection } from './structure-detection/detect-job.server.ts'
import { isDetectionDiscipline, type Lap } from './structure-detection/types.ts'

/**
 * Provider-neutral Recording telemetry enrichment (#168): turning an already-
 * normalized `RawStream` into the persisted Activity Stream (ADR 0020) and the
 * HR-zone phase bars on an Activity Import. Consistent with ADR 0014, this
 * module knows nothing about provider payloads — Strava adapts its wire streams
 * and file imports (FIT/GPX) their record streams to `RawStream`, then both call
 * the same persistence primitives, so a file-imported Recording earns the same
 * overlay as a Strava one.
 */

/**
 * The athlete's threshold heart rate per Discipline, for normalising recorded
 * HR into zones. Empty when the athlete has no profile / no LTHRs — phase bars
 * then stay absent (an Unavailable Metric, never estimated).
 */
export async function getLthrByDiscipline(
	athleteId: string,
): Promise<Map<string, number>> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: {
			disciplineProfiles: { select: { discipline: true, lthr: true } },
		},
	})
	return new Map(
		(profile?.disciplineProfiles ?? [])
			.filter((d) => d.lthr != null)
			.map((d) => [d.discipline, d.lthr as number]),
	)
}

/**
 * Downsample a raw telemetry stream (ADR 0020) and persist it as the import's
 * Activity Stream — the data the Workout Detail View overlays against the plan.
 * A stream with nothing plottable persists nothing. Returns whether a row was
 * written; throws on a DB failure — callers decide how load-bearing that is.
 *
 * Upsert, not insert: the first import files the snapshot, and a source-side
 * `update` to a still-unpromoted import re-snapshots in place (ADR 0032) — a
 * non-promoted import's telemetry follows the source, replacing the prior
 * stream so a re-computed Structure Detection reads the fresh signal rather
 * than the stale one. A concurrent trigger that already inserted the row is
 * therefore overwritten with identical data instead of colliding.
 */
export async function persistActivityStream(
	activityImportId: string,
	raw: RawStream,
): Promise<boolean> {
	const downsampled = downsampleStream(raw)
	if (!downsampled) return false

	const data = {
		resolutionSec: downsampled.resolutionSec,
		...serializeStream(downsampled),
	}
	await prisma.activityStream.upsert({
		where: { activityImportId },
		create: { activityImportId, ...data },
		update: data,
	})
	return true
}

/**
 * Persist provider lap markers as the import's `lapsJson` (#328/#356) — the
 * ground-truth interval edges the lap-edged detection path prefers over
 * stream-inferred ones (ADR 0033). Laps are a refinement, never load-bearing:
 * an empty set (no per-rep laps, or a single whole-activity lap the provider
 * filtered out upstream) writes nothing and leaves the import stream-only, and
 * every marker is sanity-checked for a positive span.
 *
 * Callers must write laps *before* Structure Detection is enqueued
 * (`enrichImportTelemetry` → `enqueueStructureDetection`) so the lap-edged path
 * is used on the first compute rather than a later re-detection.
 */
export async function persistActivityLaps(
	activityImportId: string,
	laps: Lap[],
): Promise<boolean> {
	const valid = laps.filter((lap) => lap.endSec > lap.startSec)
	if (valid.length === 0) return false
	await prisma.activityImport.update({
		where: { id: activityImportId },
		data: { lapsJson: JSON.stringify(valid) },
	})
	return true
}

/**
 * Derive the recording's intensity profile (zone phases) from its HR-over-time
 * against the athlete's threshold HR and store it on the import, so recordings
 * show the same phase bars as planned workouts. No usable HR → nothing written.
 */
export async function persistHrPhaseBars(
	activityImportId: string,
	time: number[],
	heartrate: number[],
	thresholdHr: number,
): Promise<boolean> {
	const bars = deriveHrPhaseBars(time, heartrate, thresholdHr)
	if (bars.length === 0) return false

	await prisma.activityImport.update({
		where: { id: activityImportId },
		data: { phaseBarsJson: JSON.stringify(bars) },
	})
	return true
}

/**
 * Re-derive HR phase bars for every one of the athlete's imports in a
 * discipline that carries a stored HR stream, against the (new) threshold HR.
 * Phase bars are otherwise only derived at ingest, so an athlete who sets
 * their LTHR *after* recordings were imported would never see the recordings'
 * intensity diagram — and a changed LTHR shifts every zone boundary, so
 * existing bars are recomputed too, from the same stored downsampled stream.
 * Best-effort per import; a corrupt stream degrades to "no bars", never throws.
 */
export async function rederiveHrPhaseBarsForDiscipline(
	athleteId: string,
	discipline: string,
	thresholdHr: number,
): Promise<void> {
	const imports = await prisma.activityImport.findMany({
		where: {
			athleteId,
			discipline,
			stream: { heartrate: { not: null } },
		},
		select: { id: true, stream: true },
	})
	for (const imp of imports) {
		try {
			const stream = parseStoredStream(imp.stream)
			if (!stream?.heartrate) continue
			// Align the HR channel with the time axis, dropping gap samples.
			const time: number[] = []
			const heartrate: number[] = []
			for (let i = 0; i < stream.timeSec.length; i++) {
				const hr = stream.heartrate[i]
				if (!isNum(hr)) continue
				time.push(stream.timeSec[i]!)
				heartrate.push(hr)
			}
			if (heartrate.length === 0) continue
			await persistHrPhaseBars(imp.id, time, heartrate, thresholdHr)
		} catch (err) {
			console.error(
				`re-deriving HR phase bars failed for import ${imp.id}`,
				err,
			)
		}
	}
}

/**
 * Best-effort telemetry enrichment for an import: persist the Activity Stream
 * and, when the athlete has a threshold HR for the Discipline, the HR phase bars
 * — both from the same raw stream — then enqueue Structure Detection. Skips
 * `'other'` imports (no overlay, ADR 0015). Never throws — telemetry is an
 * adornment, never load-bearing for the import's success.
 *
 * Serves both the first file and a source-side re-snapshot (ADR 0032): the
 * stream upsert replaces the prior snapshot in place and the detection is
 * re-enqueued, so an unpromoted import's telemetry follows the source. Callers
 * are responsible for the promotion guard — a promoted Recording is frozen (ADR
 * 0012) and must never be re-enriched.
 */
export async function enrichImportTelemetry(
	athleteId: string,
	activityImportId: string,
	discipline: string,
	raw: RawStream,
): Promise<void> {
	if (discipline === 'other') return

	let streamPersisted = false
	try {
		streamPersisted = await persistActivityStream(activityImportId, raw)
	} catch {
		// A stream failing to persist must not lose the phase bars (or vice versa).
	}

	// Kick off Structure Detection right after the Activity Stream lands (ADR
	// 0032): run/bike only (ADR 0015), only when a stream actually persisted (a
	// real signal). Enqueuing is a quick insert — the analysis runs later on the
	// worker, so the import never blocks on it. Best-effort: a failed enqueue
	// must not fail the import (a backfill can still reach it later).
	if (streamPersisted && isDetectionDiscipline(discipline)) {
		try {
			await enqueueStructureDetection(activityImportId)
		} catch {
			// Enqueue is best-effort telemetry plumbing, never load-bearing.
		}
	}

	try {
		const thresholdHr = (await getLthrByDiscipline(athleteId)).get(discipline)
		if (thresholdHr == null) return
		// Align the HR channel with the time axis, dropping gap samples.
		const time: number[] = []
		const heartrate: number[] = []
		for (let i = 0; i < raw.time.length; i++) {
			const hr = raw.heartrate?.[i]
			if (!isNum(hr)) continue
			time.push(raw.time[i]!)
			heartrate.push(hr)
		}
		if (heartrate.length === 0) return
		await persistHrPhaseBars(activityImportId, time, heartrate, thresholdHr)
	} catch {
		// Profile lookup / DB issue — phase bars are best-effort.
	}
}
