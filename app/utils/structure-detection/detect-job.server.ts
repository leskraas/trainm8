import { z } from 'zod'
import { parseStoredStream } from '../activity-stream.ts'
import { prisma } from '../db.server.ts'
import { enqueueJob } from '../jobs/queue.server.ts'
import { materializeDetectedStructure } from '../workout.server.ts'
import { type DisciplineProfileForResolver } from '../zones/index.ts'
import { analyze } from './analyze.ts'
import { isDetectionDiscipline, type Lap } from './types.ts'

/**
 * The auto-import orchestration for Structure Detection (map #326, ADR
 * 0032/0033/0034): the Job Queue side of the pure `analyze` engine. On every
 * run/bike **Activity Import** that carries a real signal, a background
 * `structure-detection` job loads the stored **Activity Stream** + provider laps
 * + the athlete's Discipline Profile, runs `analyze`, and — above the honesty
 * gate — stores a **Structure Detection** and materializes its structure onto
 * the recording-only session as a `detected` **Workout**. Below the gate it
 * writes nothing (the recording stays structureless, an Unavailable Metric).
 *
 * The enqueue side is per-import (not the one-shot `ensure*` idempotent pattern
 * the backfill jobs use) — it fires from `enrichImportTelemetry` right after the
 * stream is persisted, so it never blocks the import.
 */
export const STRUCTURE_DETECTION_JOB_KIND = 'structure-detection'

/**
 * The engine version stamped on each `WorkoutDetection` at write time, so a
 * future re-detection trigger (threshold move, engine bump — out of scope here)
 * can tell a stale detection from a current one (ADR 0032). Bump when the
 * `analyze` pipeline changes in a way that would alter stored structures.
 */
export const STRUCTURE_DETECTION_ENGINE_VERSION = '1'

/**
 * Enqueue a structure-detection job for one import. Called from the telemetry
 * enrichment path once a run/bike Activity Stream is persisted. A quick insert
 * that returns immediately — the analysis runs later on the worker, so the
 * import never waits on detection.
 */
export async function enqueueStructureDetection(
	activityImportId: string,
): Promise<void> {
	await enqueueJob({
		kind: STRUCTURE_DETECTION_JOB_KIND,
		payload: { activityImportId },
	})
}

const LapArraySchema = z.array(
	z.object({ startSec: z.number(), endSec: z.number() }),
)

/**
 * Parse the import's `lapsJson` into the engine's `Lap[]` shape. Laps are an
 * optional refinement (#328) — a missing, empty, or malformed column degrades to
 * "no laps" (detection stays stream-first), never throws.
 */
function parseLaps(lapsJson: string | null): Lap[] | undefined {
	if (!lapsJson) return undefined
	try {
		const parsed = LapArraySchema.safeParse(JSON.parse(lapsJson))
		return parsed.success && parsed.data.length > 0 ? parsed.data : undefined
	} catch {
		return undefined
	}
}

/**
 * Load the athlete's Discipline Profile in the `analyze` resolver shape. A
 * missing profile collapses every threshold to `null`, which makes `analyze`
 * honestly return `null` (no resolvable zones → no guessed structure, ADR 0035).
 */
async function loadResolverProfile(
	athleteId: string,
	discipline: string,
): Promise<DisciplineProfileForResolver> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: {
			disciplineProfiles: {
				where: { discipline },
				take: 1,
				select: {
					lthr: true,
					maxHr: true,
					ftp: true,
					runPowerThresholdW: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					zoneSystem: true,
					zoneOverrides: true,
				},
			},
		},
	})
	const dp = profile?.disciplineProfiles[0]
	return {
		lthr: dp?.lthr ?? null,
		maxHr: dp?.maxHr ?? null,
		ftp: dp?.ftp ?? null,
		runPowerThresholdW: dp?.runPowerThresholdW ?? null,
		thresholdPaceSecPerKm: dp?.thresholdPaceSecPerKm ?? null,
		cssSecPer100m: dp?.cssSecPer100m ?? null,
		zoneSystem: dp?.zoneSystem ?? null,
		zoneOverrides: dp?.zoneOverrides ?? null,
	}
}

/**
 * Run structure detection for one Activity Import (the `structure-detection` job
 * body). Loads the import's stream + laps + profile, calls the pure `analyze`,
 * and:
 *   - on `null` (steady/formless, or missing thresholds) writes nothing — the
 *     recording stays structureless (`recorded`, an Unavailable Metric);
 *   - on a result upserts the `WorkoutDetection` row and, when the import is
 *     already promoted to a recording-only session, materializes the structure
 *     as that session's `Workout` with Session Source `detected`.
 *
 * Idempotent: the upsert and the materialize step both tolerate a re-run (job
 * retry), so a transient DB failure is safe to retry with backoff. A run/bike
 * guard and a stream guard make the handler a no-op for disciplines the engine
 * never touches or imports that carry no signal.
 */
export async function runStructureDetection(
	payload: Record<string, unknown>,
): Promise<void> {
	const activityImportId = payload.activityImportId
	if (typeof activityImportId !== 'string') {
		throw new Error(
			'structure-detection job requires a string activityImportId payload',
		)
	}

	const imp = await prisma.activityImport.findUnique({
		where: { id: activityImportId },
		select: {
			id: true,
			athleteId: true,
			discipline: true,
			lapsJson: true,
			stream: {
				select: {
					resolutionSec: true,
					timeSec: true,
					power: true,
					heartrate: true,
					pace: true,
				},
			},
		},
	})
	// The import may have been discarded between enqueue and processing.
	if (!imp) return

	if (!isDetectionDiscipline(imp.discipline)) return
	const discipline = imp.discipline

	const stream = parseStoredStream(imp.stream)
	if (!stream) return

	const profile = await loadResolverProfile(imp.athleteId, discipline)
	const laps = parseLaps(imp.lapsJson)

	const detected = analyze({ stream, discipline, profile, laps })
	// Below the honesty gate: no structure (ADR 0033). On the initial compute this
	// is a no-op write; on a re-snapshot recompute (ADR 0032) it must also *clear*
	// any prior WorkoutDetection, so a detection never outlives the signal that
	// justified it — a re-snapshot that now reads formless leaves the recording
	// honestly structureless (an Unavailable Metric), not stuck with stale
	// structure. The clear is guarded on the import being still unpromoted (read
	// fresh, not from the pre-`analyze` snapshot): a promoted Recording is frozen
	// (ADR 0012), so should the import have raced to promotion after the recompute
	// was enqueued, its detection is left untouched rather than silently dropped.
	if (!detected) {
		const current = await prisma.activityImport.findUnique({
			where: { id: imp.id },
			select: { promotedSessionId: true },
		})
		if (!current?.promotedSessionId) {
			await prisma.workoutDetection.deleteMany({
				where: { activityImportId: imp.id },
			})
		}
		return
	}

	const structureJson = JSON.stringify(detected.structure)
	const stamp = {
		structureJson,
		confidence: detected.confidence,
		engineVersion: STRUCTURE_DETECTION_ENGINE_VERSION,
		computedAt: new Date(),
	}
	await prisma.workoutDetection.upsert({
		where: { activityImportId: imp.id },
		create: { activityImportId: imp.id, ...stamp },
		update: stamp,
	})

	// Auto-import: when the import is already a recording-only session, the
	// detected structure becomes that session's Workout (source `detected`). A
	// still-unpromoted import just carries the detection until it is promoted.
	// Re-read the promotion state fresh (not the pre-`analyze` snapshot): the
	// import may have been promoted while `analyze` ran, and the promotion path
	// only materializes a detection it can already see — so a stale snapshot here
	// could drop the auto-import on both sides. `materializeDetectedStructure` is
	// a compare-and-swap, so a promotion that also materializes stays idempotent.
	const promoted = await prisma.activityImport.findUnique({
		where: { id: imp.id },
		select: { promotedSession: { select: { id: true, workoutId: true } } },
	})
	if (
		promoted?.promotedSession &&
		promoted.promotedSession.workoutId === null
	) {
		await materializeDetectedStructure(
			imp.athleteId,
			promoted.promotedSession.id,
			detected.structure,
		)
	}
}
