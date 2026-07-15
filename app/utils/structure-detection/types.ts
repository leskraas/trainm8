import { type ActivityStream } from '../activity-stream.ts'
import { type WorkoutStructure } from '../workout-schema.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'

/**
 * Structure Detection engine — the dependency-free heart of Workout
 * auto-analysis (map #326, ADR 0032/0033/0035). This is the single home of the
 * #327/#330 pipeline: a pure `analyze(input) → DetectedStructure | null` with no
 * DB access and no clock. It reconstructs a run/bike **Activity Stream** into the
 * **Workout → Block → Step** vocabulary, or honestly returns `null` when there is
 * no genuine structure to find (ADR 0008).
 */

/** Detection runs for run and bike only (swim/strength never reach the engine). */
export type DetectionDiscipline = 'run' | 'bike'

/**
 * Whether a discipline is one Structure Detection runs for (run/bike, ADR 0015).
 * Pure and dependency-free so both server (enqueue, job handler) and client (the
 * Workout Detail View's "no structure detected" gate) share one predicate.
 */
export function isDetectionDiscipline(
	discipline: string,
): discipline is DetectionDiscipline {
	return discipline === 'run' || discipline === 'bike'
}

/**
 * Detection Confidence grade (ADR 0033) — the same honesty vocabulary the rest
 * of the app speaks (`Load Confidence`). Never a bespoke 0–1 scale. The engine
 * returns a grade only when the honesty gate is cleared; below it the result is
 * `null` (an **Unavailable Metric**, "no structure detected").
 */
export type DetectionGrade = 'high' | 'medium' | 'low'

/**
 * A provider lap marker: an elapsed-second interval `[startSec, endSec)` on the
 * same axis as the stream's `timeSec`. Laps *enable* detection (they rescue the
 * short / in-zone reps a stream-only detector is blind to, #328/#330) but never
 * raise the grade ceiling (ADR 0033).
 */
export type Lap = { startSec: number; endSec: number }

/**
 * The engine's whole input: the **Activity Stream** channels, optional provider
 * laps, and the athlete's `DisciplineProfile` recipe + thresholds (the
 * `DisciplineProfileForResolver` shape reused from the intensity resolver). No
 * DB row, no ids — a pure value.
 */
export type DetectionInput = {
	stream: ActivityStream
	discipline: DetectionDiscipline
	profile: DisciplineProfileForResolver
	laps?: Lap[]
}

/**
 * The engine's output: a structure in the `WorkoutStructureSchema` shape (ready
 * to materialize into a real **Workout** with no translation) plus its graded
 * **Detection Confidence**. `analyze` returns this or `null` — there is no
 * "candidate list"; only the single winning hypothesis is ever returned.
 */
export type DetectedStructure = {
	structure: WorkoutStructure
	confidence: DetectionGrade
}
