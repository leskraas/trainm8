import { SESSION_ARCHETYPES, type SessionArchetype } from '../catalogue.ts'
import { type DetectionGrade } from '../structure-detection/types.ts'
import {
	type CardioDiscipline,
	isCardioDiscipline,
	type Discipline,
} from '../workout-schema.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import { classifyArchetype } from './classify.ts'
import { readMainSet, type ReadableWorkout } from './read-structure.ts'
import {
	type ArchetypeRefusal,
	type DisciplineSegment,
	type ArchetypeReading,
} from './types.ts'

/**
 * One session's **Session Archetype**, resolved the way ADR 0055 decided it: the
 * athlete's own statement where there is one, a **reading** where there is not,
 * and a named refusal where the reading could not be made.
 *
 * Pure — the caller supplies the 28-day median rather than this querying for it,
 * so the whole path from a loader row to a rendered word is testable without a
 * database.
 */
export type SessionArchetypeView =
	/** Authored: on this Workout, or inherited from the Catalogue row it copies. */
	| { kind: 'stated'; archetype: SessionArchetype }
	/** Derived at read time and **never stored** — see ADR 0055 §3. */
	| { kind: 'read'; reading: Extract<ArchetypeReading, { kind: 'archetype' }> }
	/** Read, and honestly refused. An absence stays visible (#437). */
	| { kind: 'unread'; refusal: ArchetypeRefusal; reasons: string[] }

export type ReadSessionInput = {
	workout: (ReadableWorkout & { archetype: string | null }) | null
	recording: { discipline: string; durationSec: number | null } | null
	/** The **Detection Confidence** of the structure, where one was detected. */
	detectionGrade: DetectionGrade | null
	/** The athlete's thresholds for this session's discipline, if any. */
	profile: DisciplineProfileForResolver | undefined
	/** From `getMedianSessionDurationSec`. Null is a real answer. */
	medianSessionSec28d: number | null
}

/**
 * Resolve what to show for this session, or `null` when there is nothing to say
 * at all — a session with neither a prescription nor a recording has no session
 * to name.
 *
 * **An authored archetype short-circuits the reader entirely.** That is §8.2's
 * branch 0 discharged at the call site rather than inside the classifier: the
 * athlete's statement wins outright, and classification is for orphan recordings
 * rather than for overruling a plan. The consequence is deliberate — the app
 * never says "you planned a threshold session and did an easy one." Judging the
 * execution against the prescription is **Structure Adherence**, which already
 * exists and is already the right home for it.
 */
export function readSessionArchetype(
	input: ReadSessionInput,
): SessionArchetypeView | null {
	const stated = asArchetype(input.workout?.archetype)
	if (stated) return { kind: 'stated', archetype: stated }

	if (!input.workout && !input.recording) return null

	// Strength is deliberately never classified: ADR 0046/0047 put it on its own
	// axis with a **Strength Goal**, and detection never runs for it either.
	const discipline = input.workout?.discipline ?? input.recording?.discipline
	if (!discipline || !isCardioDiscipline(discipline as Discipline)) return null

	const structure = input.workout
		? readMainSet(input.workout, input.profile, input.detectionGrade ?? 'low')
		: null

	const reading = classifyArchetype({
		movingSec: input.recording?.durationSec ?? 0,
		channel: structure?.channel ?? 'power',
		structure,
		// Neither a session **Intensity Factor** nor a three-zone time split is
		// stored anywhere yet, so the reader's duration-and-intensity branches
		// cannot fire from this surface and say so rather than approximating. What
		// *is* readable today is rep geometry, which is the interesting half.
		intensityFactor: null,
		timeInZone: null,
		disciplineSegments: prescribedSegments(input.workout, discipline),
		context: { medianSessionSec28d: input.medianSessionSec28d },
	})

	return reading.kind === 'archetype'
		? { kind: 'read', reading }
		: { kind: 'unread', refusal: reading.refusal, reasons: reading.reasons }
}

/**
 * The disciplines the session moves through, laid out on the **prescription's**
 * timeline rather than the recording's. That is enough to recognise a brick —
 * two disciplines with no real break between them — and it is honest about its
 * source: a planned changeover, not a measured one.
 */
function prescribedSegments(
	workout: ReadableWorkout | null,
	fallback: string,
): DisciplineSegment[] {
	if (!workout) {
		return [
			{
				discipline: fallback as CardioDiscipline,
				startSec: 0,
				endSec: 0,
			},
		]
	}

	const segments: DisciplineSegment[] = []
	let cursor = 0
	for (const block of [...workout.blocks].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	)) {
		const steps = [...block.steps].sort((a, b) => a.orderIndex - b.orderIndex)
		for (let repeat = 0; repeat < Math.max(1, block.repeatCount); repeat++) {
			for (const step of steps) {
				const duration = step.durationSec ?? 0
				// The step's own Discipline where it has one (ADR 0007), else the
				// Workout's — a single-discipline session states it only once.
				const discipline = (step.discipline ??
					workout.discipline) as CardioDiscipline
				const previous = segments.at(-1)
				if (previous && previous.discipline === discipline) {
					previous.endSec = cursor + duration
				} else {
					segments.push({
						discipline,
						startSec: cursor,
						endSec: cursor + duration,
					})
				}
				cursor += duration
			}
		}
	}

	return segments.length > 0
		? segments
		: [{ discipline: fallback as CardioDiscipline, startSec: 0, endSec: 0 }]
}

/** Narrow a stored string to the vocabulary, so a stale value renders nothing
 * rather than a raw slug. */
function asArchetype(
	value: string | null | undefined,
): SessionArchetype | null {
	return value != null &&
		(SESSION_ARCHETYPES as readonly string[]).includes(value)
		? (value as SessionArchetype)
		: null
}
