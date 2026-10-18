// _Bytt treningsform_ (#581, ADR 0101 §2): the **Start Options** again, for a
// plan that already exists. Not a second generator: the answers the start
// would have taken are read back off what the athlete keeps — their
// **Training Level**, **Session Preferences** and days, and the plan's own
// tracks and hours — and handed to `draftStart`, the very draft the start's
// cards are. Pure, so the reading is tested without a database.

import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { type ActivityKind } from '../simple-activity.ts'
import { CARDIO_DISCIPLINES, type CardioDiscipline } from '../workout-schema.ts'
import {
	MAX_START_HOURS,
	MIN_START_HOURS,
	type SessionPreference,
	type StartAnswers,
	type StartStrength,
	type TrainingLevel,
} from './start-draft.ts'

/**
 * The level read where the athlete never said one (a plan from before the
 * simple start): _Mosjonist_. Every level above _Nybegynner_ is offered the
 * same three families with the same session cap, so this names no cap or
 * family the athlete did not already have; only a beginner differs, and that
 * is never guessed.
 */
export const UNSAID_TRAINING_LEVEL: TrainingLevel = 'recreational'

/** A stored discipline that is an endurance sport the start lays. */
function isCardio(discipline: string): discipline is CardioDiscipline {
	return (CARDIO_DISCIPLINES as readonly string[]).includes(discipline)
}

/** A week of the plan as this reading needs it: its role and its targets. */
export type PlanHoursWeek = {
	weekKey: string
	role: string
	targets: ReadonlyArray<{
		discipline: string
		currency: string
		value: number | null
	}>
}

/**
 * The week whose hours the options are laid for: the first ordinary (hard)
 * week from the week the switch begins in, since an easy week or a taper
 * would lay every option short. The first week from there where none is
 * ordinary, and the plan's last week where the plan has run out.
 */
export function hoursWeekOf(
	weeks: readonly PlanHoursWeek[],
	fromWeekKey: string,
): PlanHoursWeek | null {
	const ahead = weeks.filter((week) => week.weekKey >= fromWeekKey)
	return (
		ahead.find((week) => week.role === 'loading') ??
		ahead[0] ??
		weeks.at(-1) ??
		null
	)
}

/** The endurance hours a week asks for, across its hours tracks. */
function enduranceHoursOf(week: PlanHoursWeek | null): number {
	if (!week) return 0
	return week.targets.reduce(
		(sum, target) =>
			target.currency === 'hours' && isCardio(target.discipline)
				? sum + (target.value ?? 0)
				: sum,
		0,
	)
}

export type PlanStartInputs = {
	/** Null where the athlete never said one. */
	level: TrainingLevel | null
	preferences: readonly SessionPreference[]
	/** The plan's tracks, in the order they were written: the main sport first. */
	tracks: ReadonlyArray<{ discipline: string; currency: string }>
	weeks: readonly PlanHoursWeek[]
	/** The first week not yet begun: where a switch begins (ADR 0079). */
	fromWeekKey: string
	/**
	 * The days the athlete said they train on, Monday first; empty where they
	 * never said, and then the days the plan's Week Pattern lays on.
	 */
	days: readonly PatternWeekday[]
	patternDays: readonly PatternWeekday[]
	/** The plan's **Simple Activities**, each once, with its minutes. */
	activities: ReadonlyArray<{ kind: ActivityKind; minutes: number }>
	/** Lifting, where the athlete answered a frequency and the plan lifts. */
	strength: StartStrength | null
	/** The hours to fall back on where no week of the plan reads any. */
	capacityHours: number | null
}

/**
 * The start's answers for a plan that exists, or null where there is nothing
 * the start could lay: no endurance sport and no Simple Activity, or no day.
 *
 * The hours are week 1's, as the start's are (ADR 0102 §4): the endurance
 * hours of the plan's ordinary week from the switch on ({@link hoursWeekOf}),
 * plus the time of its Simple Activities, which share the same total in the
 * start. Held to the start's own range and to a tenth.
 */
export function planStartAnswers(input: PlanStartInputs): StartAnswers | null {
	const sports = [
		...new Set(
			input.tracks
				.filter((track) => track.currency === 'hours')
				.map((track) => track.discipline)
				.filter(isCardio),
		),
	]
	const activities = [
		...new Map(input.activities.map((one) => [one.kind, one])).values(),
	]
	if (sports.length === 0 && activities.length === 0) return null
	const days = input.days.length > 0 ? input.days : input.patternDays
	if (days.length === 0) return null

	const week = hoursWeekOf(input.weeks, input.fromWeekKey)
	const activityHours =
		activities.reduce((sum, one) => sum + one.minutes, 0) / 60
	const read = enduranceHoursOf(week) + activityHours
	const given = read > 0 ? read : (input.capacityHours ?? 0)
	const hours = Math.min(
		MAX_START_HOURS,
		Math.max(MIN_START_HOURS, Math.round(given * 10) / 10),
	)

	const [discipline, ...otherSports] = sports
	return {
		level: input.level ?? UNSAID_TRAINING_LEVEL,
		discipline: discipline ?? null,
		otherSports,
		activities: activities.map((one) => one.kind),
		hours,
		days: [...new Set(days)].sort((a, b) => a - b),
		startWeekKey: input.fromWeekKey,
		strength: input.strength,
		preferences: input.preferences,
	}
}
