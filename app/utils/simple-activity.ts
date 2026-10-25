// A **Simple Activity** (UI word _enkel aktivitet_; ADR 0015 §A, spec #558,
// ticket #567): a planned Workout Session on Discipline `other` — a climb, a
// _langrenn_ session, a _fjelltur_, yoga — that carries an **Activity Kind**, an
// **Effort Word** and a duration, and nothing else.
//
// This module is the one place that knows its shape. A Workout is a Simple
// Activity when `readSimpleActivity` says so: Discipline `other`, a known Activity
// Kind and Effort Word, and exactly one step of time with no Intensity Target.
// Anything else on `other` is not one, and reads as null.
//
// The Effort Word is deliberately its own vocabulary, disjoint from the zone
// labels (`easy`, `zone2`, …) and from RPE, and nothing here maps it to either:
// a hard climb is not a zone-5 run. The Workout's intent is
// {@link SIMPLE_ACTIVITY_INTENT}, which is outside `WORKOUT_INTENTS` and maps to
// no zone (`intentToZone` returns null), so no zone comes in through the intent.
// Every number other than time is an Unavailable Metric, decided once in
// `planned-discipline.ts`.
//
// Pure: no database. Writes go through `simple-activity.server.ts`.
import { z } from 'zod/v3'
import { EFFORT_WORDS, type EffortWord, isEffortWord } from './effort-words.ts'

/** The Discipline a Simple Activity is on (ADR 0015). */
export const SIMPLE_ACTIVITY_DISCIPLINE = 'other'

/**
 * The Workout intent every Simple Activity carries. Not a `WorkoutIntent`: it
 * is never offered in the authoring form, and it maps to no Training Zone.
 */
export const SIMPLE_ACTIVITY_INTENT = 'simple-activity'

/** What a Simple Activity is. Open for more; labels name each one. */
export const ACTIVITY_KINDS = [
	'cross-country-ski',
	'hike',
	'climb',
	'yoga-mobility',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/** The shortest and longest Simple Activity the app will write, in minutes. */
export const SIMPLE_ACTIVITY_MIN_MINUTES = 10
export const SIMPLE_ACTIVITY_MAX_MINUTES = 600

export type SimpleActivity = {
	kind: ActivityKind
	effortWord: EffortWord
	/** The planned time, whole minutes. */
	durationMin: number
}

/** What a caller writes: the three facts, checked. */
export const SimpleActivitySchema = z.object({
	kind: z.enum(ACTIVITY_KINDS),
	effortWord: z.enum(EFFORT_WORDS),
	durationMin: z
		.number()
		.int()
		.min(SIMPLE_ACTIVITY_MIN_MINUTES)
		.max(SIMPLE_ACTIVITY_MAX_MINUTES),
})

export function isActivityKind(value: unknown): value is ActivityKind {
	return (ACTIVITY_KINDS as readonly unknown[]).includes(value)
}

/** The stored Workout fields a Simple Activity is read from. */
export type SimpleActivityWorkout = {
	discipline: string
	activityKind?: string | null
	effortWord?: string | null
	blocks: ReadonlyArray<{
		repeatCount: number
		seriesRepeatCount?: number | null
		steps: ReadonlyArray<{
			kind?: string | null
			durationSec: number | null
			distanceM?: number | null
			intensity?: string | null
		}>
	}>
}

/**
 * The Simple Activity a Workout is, or null when it is not one: not on
 * `other`, an unknown Activity Kind or Effort Word, or a structure other than
 * one step of time with no Intensity Target.
 */
export function readSimpleActivity(
	workout: SimpleActivityWorkout | null | undefined,
): SimpleActivity | null {
	if (!workout || workout.discipline !== SIMPLE_ACTIVITY_DISCIPLINE) return null
	const { activityKind, effortWord } = workout
	if (!isActivityKind(activityKind) || !isEffortWord(effortWord)) return null
	if (workout.blocks.length !== 1) return null
	const block = workout.blocks[0]!
	if (block.repeatCount !== 1 || (block.seriesRepeatCount ?? 1) !== 1) {
		return null
	}
	if (block.steps.length !== 1) return null
	const step = block.steps[0]!
	if (step.kind != null && step.kind !== 'cardio') return null
	if (step.intensity != null || step.distanceM != null) return null
	if (step.durationSec == null || step.durationSec <= 0) return null
	return {
		kind: activityKind,
		effortWord,
		durationMin: Math.round(step.durationSec / 60),
	}
}

/** Whether a Workout is a Simple Activity. */
export function isSimpleActivity(
	workout: SimpleActivityWorkout | null | undefined,
): boolean {
	return readSimpleActivity(workout) != null
}

/**
 * The stored rows a Simple Activity is written as: the Workout's own fields
 * and its one block of one timed step, on `other`, with no Intensity Target.
 */
export function simpleActivityWorkoutData(activity: SimpleActivity) {
	return {
		discipline: SIMPLE_ACTIVITY_DISCIPLINE,
		intent: SIMPLE_ACTIVITY_INTENT,
		activityKind: activity.kind,
		effortWord: activity.effortWord,
		block: {
			orderIndex: 0,
			repeatCount: 1,
			seriesRepeatCount: 1,
			step: {
				kind: 'cardio',
				orderIndex: 0,
				discipline: SIMPLE_ACTIVITY_DISCIPLINE,
				durationSec: activity.durationMin * 60,
			},
		},
	} as const
}
