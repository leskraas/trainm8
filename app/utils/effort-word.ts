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
 * the hardest step decides. Zones 1–2 read _rolig_, 3–4 _middels_ (tempo and
 * threshold: _jevnt hardt_), 5 _hard_ (the VO₂max and anaerobic end).
 *
 * Null where nothing says: a lift (strength sits on its own axis, ADR 0046), a
 * session with no prescription, or steps whose targets cannot be zoned without
 * thresholds. The surface then leaves the word out rather than guessing one.
 * A Simple Activity's stored Effort Word (#567) is read before all this: the
 * athlete said it, so nothing is derived over it.
 */
import { deriveSessionProfile, type Workout } from './session-profile.ts'

export const EFFORT_WORDS = ['rolig', 'middels', 'hard'] as const
export type EffortWord = (typeof EFFORT_WORDS)[number]

export function isEffortWord(value: unknown): value is EffortWord {
	return (EFFORT_WORDS as readonly unknown[]).includes(value)
}

export function readEffortWord(workout: Workout | null): EffortWord | null {
	if (!workout || workout.discipline === 'strength') return null
	if (isEffortWord(workout.effortWord)) return workout.effortWord
	const zones = deriveSessionProfile(workout)
		.bars.map((bar) => bar.zone)
		.filter((zone): zone is NonNullable<typeof zone> => zone != null)
	if (zones.length === 0) return null
	const hardest = Math.max(...zones)
	return hardest <= 2 ? 'rolig' : hardest <= 4 ? 'middels' : 'hard'
}
