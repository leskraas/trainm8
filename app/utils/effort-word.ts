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
	deriveSessionProfile,
	expandWorkoutSteps,
	type TrainingZone,
	type Workout,
} from './session-profile.ts'
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
 * read against the athlete's thresholds. `unknown` when some cardio step's
 * target still cannot be zoned, so a caller can tell "easy" from "cannot say".
 */
export function readHardestZone(
	workout: Workout | null,
	thresholds: DisciplineThresholdMap = {},
): { zone: TrainingZone | null; unknown: boolean } {
	const steps = expandWorkoutSteps(workout)
	let zone: TrainingZone | null = null
	let unknown = false
	deriveSessionProfile(workout).bars.forEach((bar, index) => {
		const read =
			bar.zone ?? thresholdZone(steps[index]?.step, workout, thresholds)
		if (read === 'unknown') unknown = true
		else if (read != null && (zone == null || read > zone)) zone = read
	})
	return { zone, unknown }
}

/** A step's authored target zoned against its discipline's thresholds; null
 * for a step that authors nothing to zone. */
function thresholdZone(
	step: ReturnType<typeof expandWorkoutSteps>[number]['step'] | undefined,
	workout: Workout | null,
	thresholds: DisciplineThresholdMap,
): TrainingZone | 'unknown' | null {
	if (!step || step.kind !== 'cardio') return null
	const target = parseAuthoredIntensity(step.intensity)
	if (!target) return null
	const profile = thresholds[step.discipline ?? workout?.discipline ?? '']
	return zoneEquivalent(target, profile).step ?? 'unknown'
}
