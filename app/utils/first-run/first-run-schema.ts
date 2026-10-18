// What the start's plan is made from, and why it may not be made (#566,
// #578). The answers themselves are read from the form and the URL by the
// start's own field schemas (`start-schema.ts`).

import { type PresetFamily } from '../plan-outline/presets.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { type ActivityKind } from '../simple-activity.ts'
import { type CardioDiscipline } from '../workout-schema.ts'
import { type SessionPreference, type TrainingLevel } from './start-draft.ts'

/**
 * Why the start's plan cannot be made: the athlete has one already, the
 * answers lay no session, or the way to train picked is not one of the
 * **Start Options** these answers show (a merged or tampered one).
 */
export const FIRST_RUN_PLAN_REFUSALS = [
	'plan-already-active',
	'nothing-to-lay',
	'option-unavailable',
] as const
export type FirstRunPlanRefusal = (typeof FIRST_RUN_PLAN_REFUSALS)[number]

/** Everything the plan is made from, as the start carries it. */
export type FirstRunAnswers = {
	/** The **Training Level** (#563): it picks the families and caps the sessions. */
	level: TrainingLevel
	/**
	 * The main sport, or none for an athlete who picked Simple Activities
	 * alone (#572).
	 */
	discipline?: CardioDiscipline
	/** The **Simple Activities**, in the order picked (#572). */
	activities?: readonly ActivityKind[]
	hours: number
	days: PatternWeekday[]
	/** The way to train picked (_Velg denne_), or none for the top option. */
	family?: PresetFamily | null
	/**
	 * The strength sessions a week the athlete tapped when they picked
	 * _styrke_ (#574, ADR 0103), or absent where they did not.
	 */
	strength?: number
	/**
	 * The other endurance sports, beside the main one in `discipline` (#573):
	 * each its own track with easy sessions.
	 */
	otherSports?: CardioDiscipline[]
	/**
	 * The **Session Preferences** (#571): they rank the options and may
	 * shorten weekday sessions. Empty where the athlete skipped them.
	 */
	preferences?: readonly SessionPreference[]
}
