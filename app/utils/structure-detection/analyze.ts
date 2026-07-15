import { type WorkoutStructure } from '../workout-schema.ts'
import { type Classifier, resolveClassifier } from './classify.ts'
import { gradeConfidence } from './grade.ts'
import { type BlockPlan, mineStructure } from './mine.ts'
import { buildSegments } from './segments.ts'
import {
	type DetectedStructure,
	type DetectionDiscipline,
	type DetectionInput,
} from './types.ts'

/**
 * The dependency-free heart of Workout auto-analysis (map #326): the single
 * `analyze(input) → DetectedStructure | null`, home of the #327/#330 pipeline.
 *
 * Pure — no DB, no clock, no IO. It splits the stream at `null` pauses (never
 * interpolating, ADR 0020), edges from the discipline's anchor channel (bike →
 * power, run → median-filtered pace; HR never sets edges) or from provider laps,
 * classifies each segment on the anchor channel (HR only as a fallback, capping
 * the grade; ADR 0035), and mines the winning hypothesis behind a
 * band-separation honesty gate (ADR 0033). Returns the structure in the
 * `WorkoutStructureSchema` shape plus a graded `confidence`, or `null` for an
 * honest no-detection — steady/formless activity, or a missing anchor threshold
 * with no HR fallback (never a guessed or population-default zone).
 */
export function analyze(input: DetectionInput): DetectedStructure | null {
	const { stream, discipline, profile, laps } = input

	// Classification is the gatekeeper: without a resolvable threshold on the
	// anchor channel or a HR fallback, there is nothing honest to classify (ADR
	// 0035) — no detection, never a guessed zone.
	const classifier = resolveClassifier(discipline, profile, stream)
	if (!classifier) return null

	const segmentation = buildSegments(stream, discipline, classifier, laps)
	if (!segmentation) return null

	const hypothesis = mineStructure(segmentation, classifier)
	if (!hypothesis) return null

	return {
		structure: toStructure(discipline, hypothesis.blocks, classifier),
		confidence: gradeConfidence(hypothesis.score, classifier.hrCapped),
	}
}

/**
 * Materialize a mined block layout into the `WorkoutStructureSchema` shape. Every
 * detected step carries its **Intensity Target as the concrete measured metric**
 * (absolute pace / power / hrBpm); the zone label is display-time derived through
 * the athlete's current recipe, never persisted (ADR 0035).
 */
function toStructure(
	discipline: DetectionDiscipline,
	blocks: BlockPlan[],
	classifier: Classifier,
): WorkoutStructure {
	return {
		discipline,
		blocks: blocks.map((block) => ({
			repeatCount: block.repeat,
			steps: block.steps.map((step) => ({
				kind: 'cardio' as const,
				discipline,
				durationSec: Math.max(1, Math.round(step.durationSec)),
				intensity: classifier.measuredTarget(step.value),
			})),
		})),
	}
}
