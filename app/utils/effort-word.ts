/**
 * The **Effort Word** (spec #558, GLOSSARY): how hard a session is, said the
 * way an athlete says it — _rolig_, _middels_ or _hard_ — and never a Training
 * Zone. I dag's today card and its week rows carry one beside the duration
 * (ADR 0101 §3).
 *
 * For a planned cardio session it is **read** from the prescription: the
 * hardest zone its steps ask for (`deriveSessionProfile`, which falls back to
 * the Workout's intent where a step states no intensity). A warm-up does not
 * make an interval session rolig, and a cool-down does not make it hard, so
 * the hardest step decides, read by `effortWordOfZone`. A target written as
 * an absolute pace, watts or heart rate is zoned against the athlete's own
 * thresholds (`zoneEquivalent`, the reading the editor's chip makes), so
 * `6 × 1000 m @ 3:40/km` at T-pace 3:40 is _hard_ (#617).
 *
 * Null where nothing says: a lift (strength sits on its own axis, ADR 0046), a
 * session with no prescription, or a step whose target cannot be zoned — no
 * threshold to read it by — unless another step is already _hard_. That null is
 * **unknown**, not _rolig_: the surface leaves the word out rather than
 * guessing one, and the day rule places it as not easy (`readPlacement`).
 * A stored Effort Word is read before all this: a Simple Activity's own
 * (#567), and the _rolig_ a _For sliten i dag_ gives a lift (#575). It was
 * said on purpose, so nothing is derived over it.
 */
import {
	parseAuthoredIntensity,
	type DisciplineThresholdMap,
} from './intensity-target.ts'
import {
	intensityTargetToZone,
	intentToZone,
	type TrainingZone,
	type Workout,
} from './session-profile.ts'
import { classifyingRecipe } from './structure-detection/classify.ts'
import { type ClassifyChannel } from './structure-detection/constants.ts'
import { type IntensityTarget } from './workout-schema.ts'
import { zoneEquivalent } from './zone-equivalent.ts'

export const EFFORT_WORDS = ['rolig', 'middels', 'hard'] as const
export type EffortWord = (typeof EFFORT_WORDS)[number]

export function isEffortWord(value: unknown): value is EffortWord {
	return (EFFORT_WORDS as readonly unknown[]).includes(value)
}

/**
 * The one reading of a Training Zone as an Effort Word, for I dag and the
 * Start Option cards alike: zones 1–2 read _rolig_, 3 (tempo) _middels_, 4–5
 * (threshold up to VO₂max and the anaerobic end) _hard_ — a threshold session
 * is _jevnt hardt_, still hard. It is a word for the surface; nothing turns an
 * Effort Word back into a zone.
 */
export function effortWordOfZone(zone: number): EffortWord {
	return zone <= 2 ? 'rolig' : zone === 3 ? 'middels' : 'hard'
}

export function readEffortWord(
	workout: Workout | null,
	thresholds: DisciplineThresholdMap = {},
): EffortWord | null {
	if (!workout) return null
	if (isEffortWord(workout.effortWord)) return workout.effortWord
	if (workout.discipline === 'strength') return null
	const { zone, unknown } = readHardestZone(workout, thresholds)
	if (zone == null) return null
	const word = effortWordOfZone(zone)
	// An unzoned step could be harder than every step that zoned — unless one is
	// already as hard as a word can say.
	return unknown && word !== 'hard' ? null : word
}

/**
 * The hardest Training Zone a workout's steps ask for, each read the way the
 * Workout Shape reads it (its intent where a step states no intensity), and a
 * target the shape leaves unzoned — an absolute pace, watts or heart rate —
 * read against the athlete's thresholds (`readTargetZone`). `unknown` when some
 * cardio step's target still cannot be zoned, so a caller can tell "easy" from
 * "cannot say".
 *
 * Read over the distinct steps the workout authors, not the reps it expands
 * into: a repeat changes how often a step is done, never how hard it is, so a
 * block repeated a million times costs what one written once does (#638).
 */
export function readHardestZone(
	workout: Workout | null,
	thresholds: DisciplineThresholdMap = {},
): { zone: TrainingZone | null; unknown: boolean } {
	if (!workout) return { zone: null, unknown: false }
	const fallback = intentToZone(workout.intent)
	// Every block is done at least once (`blockRepeatTotal`), so its steps are
	// exactly the distinct steps the expansion repeats.
	const steps = workout.blocks.flatMap((block) => block.steps)
	// A step-less workout is its intent, as its one Workout Shape bar is.
	if (steps.length === 0) return { zone: fallback, unknown: false }
	let zone: TrainingZone | null = null
	let unknown = false
	for (const step of steps) {
		const read = stepZone(step, workout, fallback, thresholds)
		if (read === 'unknown') unknown = true
		else if (read != null && (zone == null || read > zone)) zone = read
	}
	return { zone, unknown }
}

type WorkoutStep = Workout['blocks'][number]['steps'][number]

/** One step's zone: the Workout Shape's reading first (the workout's intent
 * when the step states nothing), then its authored target zoned against the
 * thresholds. Null for a step that authors nothing to zone. */
function stepZone(
	step: WorkoutStep,
	workout: Workout,
	fallback: TrainingZone | null,
	thresholds: DisciplineThresholdMap,
): TrainingZone | 'unknown' | null {
	if (step.kind !== 'cardio') return null
	if (!step.intensity) return fallback
	const target = parseAuthoredIntensity(step.intensity)
	if (!target) return null
	return (
		readTargetZone(target, step.discipline ?? workout.discipline, thresholds) ??
		'unknown'
	)
}

/** The detection channel each measured target kind is classified on. */
const MEASURED_CHANNEL: Partial<
	Record<IntensityTarget['kind'], ClassifyChannel>
> = { power: 'power', pace: 'pace', hrBpm: 'heartrate' }

/**
 * The one reading of an authored target as a Training Zone against the
 * athlete's thresholds, for I dag's Effort Word and a detected session's
 * intent alike (#638), so the two cannot disagree. Null when nothing zones it.
 *
 * A target that names its zone (a zone label, RPE, a percentage) reads as the
 * Workout Shape reads it. A measured target (watts, pace, bpm) on a run or ride is zoned on the recipe
 * Structure Detection classifies that channel against (`classifyingRecipe`),
 * not blindly on the athlete's own: a Daniels runner with a critical-power
 * threshold is classified on Stryd power bands, and the pace recipe cannot
 * place watts at all (#617).
 */
export function readTargetZone(
	target: IntensityTarget,
	discipline: string,
	thresholds: DisciplineThresholdMap,
): TrainingZone | null {
	const named = intensityTargetToZone(target)
	if (named != null) return named
	const profile = thresholds[discipline]
	const channel = MEASURED_CHANNEL[target.kind]
	const recipe =
		profile &&
		channel &&
		(discipline === 'run' || discipline === 'bike') &&
		classifyingRecipe(discipline, profile, channel)
	return zoneEquivalent(
		target,
		recipe ? { ...profile, zoneSystem: recipe.id } : profile,
	).step
}
