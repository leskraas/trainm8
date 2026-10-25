/**
 * **Structure Adherence** for one session (ADR 0034, #345), lifted out of the
 * Workout Detail View's route (ADR 0092, "The first slice") so the route and
 * `get_session_vs_plan` read the same verdict. Pure: it reads the stored
 * prescription and the stored detected structure, nothing else.
 */

import { parseAuthoredIntensity } from './intensity-target.ts'
import {
	type StructureAdherenceVerdict,
	structureAdherence,
} from './structure-adherence.ts'
import { isDetectionDiscipline } from './structure-detection/types.ts'
import {
	type WorkoutStructure,
	WorkoutStructureSchema,
} from './workout-schema.ts'

/** The prescription's rows the comparator reads. */
type PrescribedWorkout = {
	discipline: string
	blocks: Array<{
		repeatCount: number | null
		/** The series level of `3 × (13 × 30/15)` (#634), if any. */
		seriesRepeatCount: number | null
		steps: Array<{
			kind: string
			discipline: string | null
			intensity: string | null
			durationSec: number | null
			distanceM: number | null
		}>
	}>
}

/** What the verdict reads of a session. */
export type StructureAdherenceSession = {
	adoptedAt: Date | string | null
	source: string
	workout: PrescribedWorkout | null
	recording: {
		detection: { structureJson: string | null } | null
	} | null
}

// ── Structure Adherence (ADR 0034, #345) ─────────────────────────────────────
// The whole-session, display-derived verdict comparing a matched planned
// session's plan-blind detected structure against its prescription. Computed on
// demand from the two stored structures — never stored, and it never reads
// Planned TSS or Training Load (that carve-out is the whole point of ADR 0034).

/** Parse a stored detected structure (WorkoutStructureSchema JSON), or null. */
function parseDetectedStructure(
	json: string | null | undefined,
): WorkoutStructure | null {
	if (!json) return null
	try {
		const parsed = WorkoutStructureSchema.safeParse(JSON.parse(json))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * Rebuild a WorkoutStructure from the session's prescribed Workout rows — the
 * Block → Step → Intensity Target core the comparator reads, with the authoring
 * envelope dropped. Strength steps (never part of a run/bike interval plan) are
 * skipped, and the result is validated so a malformed prescription degrades to
 * null (no verdict) rather than a fabricated one.
 */
function plannedStructureFromWorkout(
	workout: PrescribedWorkout,
): WorkoutStructure | null {
	const candidate = {
		discipline: workout.discipline,
		blocks: workout.blocks
			.map((block) => ({
				// The comparator has one repeat level, so `3 × (13 × 30/15)` reaches
				// it as 39 reps (#634); the series rests do not enter its count.
				repeatCount: (block.repeatCount ?? 1) * (block.seriesRepeatCount ?? 1),
				steps: block.steps.flatMap((step) => {
					if (step.kind === 'rest') {
						return step.durationSec != null
							? [{ kind: 'rest', durationSec: step.durationSec }]
							: [{ kind: 'rest' }]
					}
					if (step.kind !== 'cardio') return []
					const intensity = parseAuthoredIntensity(step.intensity)
					return [
						{
							kind: 'cardio',
							discipline: step.discipline ?? workout.discipline,
							...(intensity ? { intensity } : {}),
							...(step.durationSec != null
								? { durationSec: step.durationSec }
								: step.distanceM != null
									? { distanceM: step.distanceM }
									: {}),
						},
					]
				}),
			}))
			.filter((b) => b.steps.length > 0),
	}
	const parsed = WorkoutStructureSchema.safeParse(candidate)
	return parsed.success ? parsed.data : null
}

/**
 * The Structure Adherence verdict for a session, or null when the slot has no
 * business rendering (ADR 0034): only a matched planned run/bike session with a
 * genuine prescription qualifies. With a gate-clearing detection it compares the
 * two structures; with a *structured* prescription but no confident detection it
 * degrades to the honest Unavailable state; otherwise it stays absent.
 *
 * **This gate inverts, and the inversion is the point.** Every other `detected`
 * read asks "is this still the machine's?"; this one asks the opposite — is there
 * a prescription worth comparing the detection *against*. An untouched `detected`
 * session is excluded because grading the engine's structure against itself is a
 * guaranteed `as-prescribed`; the moment the athlete corrects it, the two sides
 * genuinely differ and the comparison becomes the most useful thing on the
 * screen. That is why an adopted `detected` session belongs here.
 *
 * Before #460 that worked only by accident: adoption rewrote `source` to
 * `authored`, and this read picked it up as a side effect of the overload. With
 * origin and adoption split, the condition has to say what it always meant —
 * `authored`, `generated`, **or adopted** — because an adopted session now keeps
 * reading `detected` forever. Dropping `authored` or `generated` here would take
 * the verdict away from every hand-authored session in the app.
 */
export function resolveStructureAdherence(
	session: StructureAdherenceSession,
): StructureAdherenceVerdict | null {
	const hasGenuinePrescription =
		session.adoptedAt != null ||
		session.source === 'authored' ||
		session.source === 'generated'
	if (!hasGenuinePrescription) return null
	const { workout, recording } = session
	if (!workout || !recording) return null
	if (!isDetectionDiscipline(workout.discipline)) return null
	const planned = plannedStructureFromWorkout(workout)
	if (!planned) return null
	const detected = parseDetectedStructure(recording.detection?.structureJson)
	if (detected) return structureAdherence(detected, planned)
	// No gate-clearing detection: only speak up for a structured prescription,
	// where the absence of confirmable structure is itself worth stating.
	return planned.blocks.some((b) => b.repeatCount >= 2)
		? 'not-verifiable'
		: null
}
