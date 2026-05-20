import { IntensityTargetSchema } from './workout-schema.ts'
import { type UpcomingSession } from './training.server.ts'

type Workout = NonNullable<UpcomingSession['workout']>
type WorkoutStep = Workout['blocks'][number]['steps'][number]

export type WorkoutShapeTone =
	| 'easy'
	| 'moderate'
	| 'hard'
	| 'max'
	| 'rest'
	| 'strength'
	| 'unknown'

export type WorkoutShapeSegment = {
	id: string
	label: string
	intensity: string | null
	tone: WorkoutShapeTone
	durationSec: number
}

export type WorkoutShape = {
	segments: WorkoutShapeSegment[]
}

// Parse JSON-structured intensity and return a human-readable label, or fall
// back to returning the raw value for legacy plain-string formats.
function extractIntensityLabel(raw: string | null): string | null {
	if (!raw) return null
	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(raw))
		if (!parsed.success) return raw // legacy string — pass through as-is
		const t = parsed.data
		switch (t.kind) {
			case 'zoneLabel':
				return t.label
			case 'rpe':
				return t.max != null ? `RPE ${t.min}–${t.max}` : `RPE ${t.min}`
			case 'hrBpm':
				return t.max != null ? `${t.min}–${t.max} bpm` : `${t.min}+ bpm`
			case 'hrPct':
				return t.maxPct != null
					? `${t.minPct}–${t.maxPct}% ${t.ref === 'max' ? 'MaxHR' : 'LTHR'}`
					: `${t.minPct}%+ ${t.ref === 'max' ? 'MaxHR' : 'LTHR'}`
			case 'power':
				return t.maxW != null ? `${t.minW}–${t.maxW} W` : `${t.minW}+ W`
			case 'powerPct':
				return t.maxPct != null
					? `${t.minPct}–${t.maxPct}% FTP`
					: `${t.minPct}%+ FTP`
			case 'pace': {
				const fmt = (s: number) =>
					`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
				return t.maxSecPerKm != null
					? `${fmt(t.minSecPerKm)}–${fmt(t.maxSecPerKm)} /km`
					: `${fmt(t.minSecPerKm)}+ /km`
			}
		}
	} catch {
		return raw
	}
}

function zoneLabelToTone(label: string): WorkoutShapeTone {
	switch (label) {
		case 'Z1':
		case 'Z2':
		case 'easy':
		case 'zone2':
			return 'easy'
		case 'Z3':
		case 'moderate':
			return 'moderate'
		case 'Z4':
		case 'Z5':
		case 'threshold':
		case 'tempo':
			return 'hard'
		case 'Z6':
		case 'Z7':
		case 'max':
			return 'max'
		default:
			return 'unknown'
	}
}

export function deriveWorkoutShape(workout: Workout | null): WorkoutShape {
	if (!workout) return { segments: [] }
	const segments = workout.blocks
		.slice()
		.sort((a, b) => a.orderIndex - b.orderIndex)
		.flatMap((block) => {
			const sortedSteps = block.steps
				.slice()
				.sort((a, b) => a.orderIndex - b.orderIndex)

			return Array.from({ length: block.repeatCount }, (_, repeatIndex) =>
				sortedSteps.map((step) => ({
					id: block.repeatCount > 1 ? `${step.id}-r${repeatIndex}` : step.id,
					label: getStepLabel(step),
					intensity: extractIntensityLabel(step.intensity),
					tone: getSegmentTone(step),
					durationSec: getStepDurationSec(step),
				})),
			).flat()
		})

	return { segments }
}

function getStepLabel(step: WorkoutStep): string {
	if (step.kind === 'strength' && step.exercise) {
		return step.exercise.name
	}
	return step.notes ?? ''
}

function getStepDurationSec(step: WorkoutStep): number {
	if (step.kind === 'strength') {
		// ADR 0002: strength contribution = restBetweenSetsSec * (sets-1) + sum(timed set durations)
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

function getSegmentTone(step: WorkoutStep): WorkoutShapeTone {
	if (step.kind === 'rest') return 'rest'
	if (step.kind === 'strength') return 'strength'

	if (!step.intensity) return 'unknown'

	// Try structured JSON first
	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(step.intensity))
		if (parsed.success) {
			const t = parsed.data
			if (t.kind === 'zoneLabel') return zoneLabelToTone(t.label)
			if (t.kind === 'rpe') {
				if (t.min <= 4) return 'easy'
				if (t.min <= 6) return 'moderate'
				if (t.min <= 8) return 'hard'
				return 'max'
			}
			return 'unknown'
		}
	} catch {
		// fall through to legacy matching
	}

	// Legacy plain-string fallback (pre-migration data)
	switch (step.intensity) {
		case 'easy':
		case 'zone2':
			return 'easy'
		case 'moderate':
			return 'moderate'
		case 'threshold':
			return 'hard'
		case 'max':
			return 'max'
		default:
			return 'unknown'
	}
}
