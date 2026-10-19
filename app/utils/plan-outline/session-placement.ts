// A stored session as the cross-track day rule reads it (#596, ADR 0104 §1):
// the {@link PlacedSession} without its weekday, read off the session's
// Workout. Week Replan reads the calendar's sessions this way, so a session
// already on the calendar is one the rule can place a move around.
//
// Pure. The weekday is the caller's: it knows the session's day.
//
// The stamp reads the week it lays through `placedSessionOf` (`stamp.ts`),
// off the zone and role it gives each session; this reads the same session
// back off the Workout the stamp wrote (its intent's zone, its _Langtur_
// title). The two must agree, and `stamp.server.test.ts` holds them to it.

import { readEffortWord } from '../effort-word.ts'
import { STAMPED_SESSION_LABELS } from '../labels.ts'
import { type Workout } from '../session-profile.ts'
import { type PlacedSession, type PlacedSessionShape } from './day-rule.ts'
import { type PatternWeekday } from './week-pattern.ts'

export type { PlacedSessionShape }

/**
 * The statuses of a session that will be (or was) trained — the only ones the
 * day rule places around. Skipped and missed sessions were not trained, so
 * they make no day hard: _Bytt dag_, the stamp and Week Replan all read the
 * calendar through this filter.
 */
export const TRAINED_SESSION_STATUSES = ['scheduled', 'completed'] as const

/** Whether a stored session's status is one the day rule places around. */
export function isTrainedStatus(status: string): boolean {
	return (TRAINED_SESSION_STATUSES as readonly string[]).includes(status)
}

/**
 * What a stored session is to the day rule: a lift for a strength session,
 * else a session by its Effort Word (none read is _rolig_), long when it is a
 * long session — a _Langtur_ the stamp laid, or a Workout whose Session
 * Archetype says long. Null with no Workout: a recording planned nothing.
 */
export function readPlacement(
	workout: Workout | null | undefined,
): PlacedSessionShape | null {
	if (!workout) return null
	if (workout.discipline === 'strength') return { kind: 'lifting' }
	const long =
		workout.archetype === 'long' ||
		workout.title.startsWith(STAMPED_SESSION_LABELS.long) ||
		workout.title.startsWith(STAMPED_SESSION_LABELS.longSwim)
	return {
		kind: 'session',
		effort: readEffortWord(workout) ?? 'rolig',
		...(long ? { long: true } : {}),
	}
}

/** A shape laid on a weekday. */
export function placedOn(
	shape: PlacedSessionShape,
	weekday: PatternWeekday,
): PlacedSession {
	return { ...shape, weekday }
}
