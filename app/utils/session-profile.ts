import { type LedgerSession } from './training.server.ts'
import { IntensityTargetSchema } from './workout-schema.ts'

type Workout = NonNullable<LedgerSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

/** A normalized training zone, 1 (easiest) through 5 (hardest). */
export type TrainingZone = 1 | 2 | 3 | 4 | 5

export type ProfileBar = {
	id: string
	/** The derived training zone, or null when the step's intensity can't be truthfully mapped to a zone. */
	zone: TrainingZone | null
	/** Relative weight for bar width — the step's planned duration in seconds (0 when unquantified). */
	durationSec: number
}

export type SessionProfile = {
	bars: ProfileBar[]
}

function clampZone(n: number): TrainingZone {
	if (n <= 1) return 1
	if (n >= 5) return 5
	return n as TrainingZone
}

function zoneLabelToZone(label: string): TrainingZone | null {
	const normalized = label.trim().toLowerCase()
	const zMatch = /^z\s*([1-7])$/.exec(normalized)
	if (zMatch) return clampZone(Number(zMatch[1]))
	switch (normalized) {
		case 'recovery':
		case 'easy':
			return 1
		case 'zone2':
		case 'endurance':
			return 2
		case 'moderate':
		case 'tempo':
			return 3
		case 'threshold':
			return 4
		case 'vo2max':
		case 'anaerobic':
		case 'max':
			return 5
		default:
			return null
	}
}

function rpeToZone(min: number): TrainingZone {
	if (min <= 2) return 1
	if (min <= 4) return 2
	if (min <= 6) return 3
	if (min <= 8) return 4
	return 5
}

// Coggan %FTP zones, normalized to threshold so no athlete-specific data is invented.
function pctToZone(pct: number): TrainingZone {
	if (pct < 55) return 1
	if (pct < 76) return 2
	if (pct < 91) return 3
	if (pct < 106) return 4
	return 5
}

function stepToZone(step: WorkoutStep): TrainingZone | null {
	if (step.kind !== 'cardio') return null
	if (!step.intensity) return null

	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(step.intensity))
		if (parsed.success) {
			const t = parsed.data
			switch (t.kind) {
				case 'zoneLabel':
					return zoneLabelToZone(t.label)
				case 'rpe':
					return rpeToZone(t.min)
				case 'powerPct':
				case 'hrPct':
					return pctToZone(t.minPct)
				// hrBpm, power (W) and pace need athlete thresholds to map to a
				// zone; leaving them unzoned keeps the profile honest.
				default:
					return null
			}
		}
	} catch {
		// fall through to legacy plain-string matching
	}

	return zoneLabelToZone(step.intensity)
}

function stepDurationSec(step: WorkoutStep): number {
	if (step.kind === 'strength') {
		const setsDuration = step.sets.reduce(
			(sum, s) =>
				sum + (s.kind === 'timed' && s.durationSec ? s.durationSec : 0),
			0,
		)
		const restContribution =
			step.restBetweenSetsSec && step.sets.length > 1
				? step.restBetweenSetsSec * (step.sets.length - 1)
				: 0
		return setsDuration + restContribution
	}
	return step.durationSec ?? 0
}

/**
 * Derive the per-session intensity profile from a workout's real steps: one bar
 * per executed step (blocks expanded by repeatCount), colored by training zone
 * and weighted by Step Duration. Steps whose intensity can't be truthfully
 * mapped to a zone carry a null zone.
 */
export function deriveSessionProfile(workout: Workout | null): SessionProfile {
	if (!workout) return { bars: [] }
	const bars = workout.blocks
		.slice()
		.sort((a, b) => a.orderIndex - b.orderIndex)
		.flatMap((block) => {
			const sortedSteps = block.steps
				.slice()
				.sort((a, b) => a.orderIndex - b.orderIndex)
			return Array.from({ length: block.repeatCount }, (_, repeatIndex) =>
				sortedSteps.map((step) => ({
					id:
						block.repeatCount > 1 ? `${step.id}-r${repeatIndex}` : step.id,
					zone: stepToZone(step),
					durationSec: stepDurationSec(step),
				})),
			).flat()
		})
	return { bars }
}
