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
 * the hardest step decides, read by `effortWordOfZone`.
 *
 * Null where nothing says: a lift (strength sits on its own axis, ADR 0046), a
 * session with no prescription, or steps whose targets cannot be zoned without
 * thresholds. The surface then leaves the word out rather than guessing one.
 * A stored Effort Word is read before all this: a Simple Activity's own
 * (#567), and the _rolig_ a _For sliten i dag_ gives a lift (#575). It was
 * said on purpose, so nothing is derived over it.
 */
import { deriveSessionProfile, type Workout } from './session-profile.ts'

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

export function readEffortWord(workout: Workout | null): EffortWord | null {
	if (!workout) return null
	if (isEffortWord(workout.effortWord)) return workout.effortWord
	if (workout.discipline === 'strength') return null
	const zones = deriveSessionProfile(workout)
		.bars.map((bar) => bar.zone)
		.filter((zone): zone is NonNullable<typeof zone> => zone != null)
	if (zones.length === 0) return null
	return effortWordOfZone(Math.max(...zones))
}
