/**
 * **Rest is prescribed data, not a UI preference.**
 *
 * The third thing the session runner writes, alongside the load and the rep
 * target: how long to wait before the next set. Which is why it lives here, as a
 * rule with citations, rather than as a number a component picked — an athlete
 * who is told to rest five minutes after a missed set and three after a made one
 * is being coached, and an athlete whose timer always says three minutes is
 * being decorated.
 *
 * Every duration below is quoted from the reference product's own published
 * mechanics (`docs/wayfinder/out-of-the-box/strength-module-brief.md` §A.1.6,
 * §A.2.2). Nothing here is a number that felt about right.
 *
 * Pure: no clock (the deadline is the *caller's* arithmetic on `sec`), no random
 * source, no `prisma`, and nothing is mutated.
 */
import { type SetRole } from '../strength-log.ts'

/**
 * _"3 minutes … if you completed all your reps"_ (brief §A.1.6) — and
 * liftosaur's `timers.workout = 180 s` default agrees (brief §B.6).
 */
export const REST_AFTER_MADE_SET_SEC = 180

/**
 * _"5 minutes … if you failed to complete all your reps"_ (brief §A.1.6). The
 * whole point of the timer being outcome-aware: a longer rest after a miss is
 * the program's instruction, not a nicety.
 */
export const REST_AFTER_MISSED_SET_SEC = 300

/**
 * _"no rest between warm-up sets … except 3 minutes before the last one"_
 * (brief §A.1.6, §A.2.2). The ramp is meant to be walked up briskly; the one
 * pause is the one that matters.
 */
export const REST_BEFORE_LAST_WARMUP_SEC = 180

/** How much the ± control moves the deadline in one tap (brief §B.6.5). */
export const REST_ADJUST_STEP_SEC = 15

/**
 * Why this rest is this long — so the bar can say it in one phrase instead of
 * showing a number nobody can account for.
 */
export const REST_REASONS = [
	'made-the-target',
	'missed-the-target',
	'between-warmup-sets',
	'before-the-last-warmup-set',
] as const
export type RestReason = (typeof REST_REASONS)[number]

/** `sec: null` is a real answer — a warm-up set that is not the last one gets no
 * timer at all, and starting a zero-second one would be a bar that flashes. */
export type RestPrescription = { sec: number | null; reason: RestReason }

export type RestInput = {
	role: SetRole
	/** Whether this set came up short of its prescribed reps — {@link
	 * isMissedSet}'s answer, passed in rather than re-derived, because *missed* is
	 * one definition and it lives with the log. */
	missed: boolean
	/** The last rung of the warm-up ramp, which is the one that gets a pause. */
	isLastWarmupSet?: boolean
	/** `WorkoutStep.restBetweenSetsSec` — a coach's own number for this exercise,
	 * where one was authored. */
	prescribedSec?: number | null
}

/**
 * How long to rest after the set that was just logged.
 *
 * The two rules that could have been fudged and are not:
 *
 * - **A prescribed rest governs a made set, and a missed set takes the longer of
 *   the two.** The published rule is five minutes after a miss; where a coach
 *   asked for *more* than that, their number wins, because a prescription is a
 *   statement about this session and 300 s is a default. What is deliberately
 *   *not* done is scaling the prescribed rest by the published 5:3 ratio — that
 *   ratio is an artefact of two absolute figures, and treating it as a
 *   coefficient would invent a number for every session that authored one.
 * - **Warm-up rests are the ramp's, never the exercise's.** A prescribed
 *   `restBetweenSetsSec` describes the work sets; applying it to the ramp would
 *   put three minutes between two empty-bar fives.
 */
export function restAfterSet(input: RestInput): RestPrescription {
	if (input.role === 'warmup') {
		return input.isLastWarmupSet
			? {
					sec: REST_BEFORE_LAST_WARMUP_SEC,
					reason: 'before-the-last-warmup-set',
				}
			: { sec: null, reason: 'between-warmup-sets' }
	}
	const prescribed = input.prescribedSec ?? null
	if (input.missed) {
		return {
			sec: Math.max(REST_AFTER_MISSED_SET_SEC, prescribed ?? 0),
			reason: 'missed-the-target',
		}
	}
	return {
		sec: prescribed ?? REST_AFTER_MADE_SET_SEC,
		reason: 'made-the-target',
	}
}

const REASON_TEXT: Record<RestReason, string> = {
	'made-the-target': 'rest',
	'missed-the-target': 'longer rest after a missed set',
	'between-warmup-sets': 'no rest between warm-up sets',
	'before-the-last-warmup-set': 'rest before your last warm-up set',
}

/** The reason as the bar says it — a phrase, never a sentence. */
export function restReasonText(reason: RestReason): string {
	return REASON_TEXT[reason]
}
