// The simple start's draft (#558, _Levende start_): the first run's draft
// widened with the **Training Level**. Answers in — the level, the hours a
// week, the main sport and the days — and out come the **Start Options** (one
// per family the level offers, each its first week as the stamp lays it) and
// the **Week Sketch** (_Uka di_), which is the top option's first week.
//
// Not a second generator: every option is `draftFirstRunPlan`, the same draft
// the plan screens show and `createFirstRunPlan` makes, with the level's
// session cap passed in. Pure, so the question screens can run it in the
// browser as the athlete answers.

import { type EffortWord } from '../effort-word.ts'
import { SIMPLE_ACTIVITY_LABELS } from '../labels.ts'
import { type PresetFamily } from '../plan-outline/presets.ts'
import { type QualityZone } from '../plan-outline/quality-mix.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { stampedSessionTitle } from '../session-title.ts'
import { type ActivityKind } from '../simple-activity.ts'
import { type CardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	draftFirstRunPlan,
	MAX_SESSION_DAYS,
	MIN_SESSION_HOURS,
	patternDaysFor,
	spreadDays,
	type DraftSimpleActivity,
	type DraftTrack,
	type FirstRunDraft,
} from './draft.ts'

/** _Nybegynner_, _Mosjonist_, _Erfaren_, _Konkurranse_ — easiest first. */
export const TRAINING_LEVELS = [
	'beginner',
	'recreational',
	'experienced',
	'competitive',
] as const
export type TrainingLevel = (typeof TRAINING_LEVELS)[number]

/** The fewest and most hours a week the start asks for, and its step. */
export const MIN_START_HOURS = 1
export const MAX_START_HOURS = 20
export const START_HOURS_STEP = 0.5

export type LevelDefaults = {
	/** Hours a week, pre-filled until the athlete changes them. */
	hours: number
	/** Monday-first days, pre-filled until the athlete picks their own. */
	days: PatternWeekday[]
	/** The most sessions a week the level is given. */
	sessionCap: number
	/** Strength sessions a week, where the athlete picks _styrke_. */
	strengthPerWeek: number
}

/** The spec's level table (#558, "Level defaults"). */
const LEVEL_DEFAULTS: Record<TrainingLevel, LevelDefaults> = {
	beginner: { hours: 3, days: [0, 2, 4], sessionCap: 4, strengthPerWeek: 1 },
	recreational: {
		hours: 5,
		days: [0, 2, 4, 5],
		sessionCap: MAX_SESSION_DAYS,
		strengthPerWeek: 1,
	},
	experienced: {
		hours: 7,
		days: [0, 1, 3, 4, 6],
		sessionCap: MAX_SESSION_DAYS,
		strengthPerWeek: 2,
	},
	competitive: {
		hours: 10,
		days: [0, 1, 2, 3, 5, 6],
		sessionCap: MAX_SESSION_DAYS,
		strengthPerWeek: 2,
	},
}

export function levelDefaults(level: TrainingLevel): LevelDefaults {
	const defaults = LEVEL_DEFAULTS[level]
	return { ...defaults, days: [...defaults.days] }
}

/**
 * The three Periodization Preset families the start offers a level, in the
 * order shown before any Session Preference ranks them. _Stor base_ takes
 * _Terskelfokus_' place for a beginner; _Masters 2:1_ is never offered here
 * (it stays in Sesong).
 */
export function startFamilies(level: TrainingLevel): PresetFamily[] {
	return level === 'beginner'
		? ['big-base', 'polarized', 'classic']
		: ['polarized', 'threshold', 'classic']
}

export type StartAnswers = {
	level: TrainingLevel
	/** The main sport, or none: an athlete who picked only Simple Activities. */
	discipline?: CardioDiscipline | null
	/** The **Simple Activities** picked, in the order they were picked (#572). */
	activities?: readonly ActivityKind[]
	hours: number
	days: readonly PatternWeekday[]
	/** The Plan Start Week: the first week not yet begun (ADR 0079). */
	startWeekKey: string
}

/**
 * How hard a session in a Start Option is, in the words the cards say it
 * (_rolig_, _middels_, _hard_): an easy day is _rolig_, a tempo session
 * _middels_, a threshold or VO₂ max session _hard_. Read off the zone the
 * stamp gave the day; it is a word for the card, never a **Training Zone**.
 */
export const EFFORTS = ['easy', 'moderate', 'hard'] as const
export type Effort = (typeof EFFORTS)[number]

export function effortOf(zone: QualityZone | null): Effort {
	if (zone == null) return 'easy'
	return zone === 3 ? 'moderate' : 'hard'
}

/**
 * A Simple Activity's own **Effort Word** as the cards say it: the same three
 * words (_rolig_, _middels_, _hard_), carried straight from the activity and
 * never read off a zone.
 */
const EFFORT_OF_WORD: Record<EffortWord, Effort> = {
	rolig: 'easy',
	middels: 'moderate',
	hard: 'hard',
}

/**
 * What a **Simple Activity** is in the start before the athlete says more:
 * its time and its Effort Word (#572). A _fjelltur_ is a long one in hours, a
 * climb a session of middling effort, yoga short and _rolig_ (spec #558
 * stories 59–61). The athlete changes each later, as any session.
 */
export const SIMPLE_ACTIVITY_DEFAULTS: Record<
	ActivityKind,
	{ minutes: number; effortWord: EffortWord }
> = {
	'cross-country-ski': { minutes: 60, effortWord: 'rolig' },
	hike: { minutes: 120, effortWord: 'rolig' },
	climb: { minutes: 90, effortWord: 'middels' },
	'yoga-mobility': { minutes: 30, effortWord: 'rolig' },
}

export type StartWeekSession = {
	title: string
	discipline: Discipline | 'other'
	minutes: number
	effort: Effort
}

export type StartWeekDay = {
	weekday: PatternWeekday
	sessions: StartWeekSession[]
}

/**
 * A first week as the athlete reads it: seven days, Monday first, each with
 * its sessions (none is _fri_), and what the week adds up to — its minutes,
 * the minutes at each effort, and how many sessions are _hard_.
 */
export type StartWeek = {
	days: StartWeekDay[]
	sessionCount: number
	minutes: number
	minutesByEffort: Record<Effort, number>
	hardSessions: number
}

const WEEKDAYS: PatternWeekday[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * A draft's first week, as the stamp lays it and titled as the stamp will
 * title it, or seven free days where there is none.
 */
export function startWeekOf(draft: FirstRunDraft | null): StartWeek {
	const laid = draft?.weeks[0]?.sessions ?? []
	const activities = new Map(
		(draft?.simpleActivities ?? []).map((activity) => [
			activity.workoutId,
			activity,
		]),
	)
	const days = WEEKDAYS.map((weekday) => ({
		weekday,
		sessions: laid
			.filter((session) => session.weekday === weekday)
			.map((session): StartWeekSession => {
				// A Simple Activity is titled by its Activity Kind, as its Workout
				// is (`createSimpleActivityWorkout`), and keeps its own Effort Word.
				const activity = session.sourceWorkoutId
					? activities.get(session.sourceWorkoutId)
					: undefined
				if (activity) {
					return {
						title: SIMPLE_ACTIVITY_LABELS.kind[activity.kind],
						discipline: 'other',
						minutes: activity.minutes,
						effort: EFFORT_OF_WORD[activity.effortWord],
					}
				}
				return {
					title: stampedSessionTitle({
						discipline: session.discipline,
						role: session.role,
						zone: session.zone,
					}),
					discipline: session.discipline,
					minutes: Math.round((session.volume ?? 0) * 60),
					effort: effortOf(session.zone),
				}
			}),
	}))
	const sessions = days.flatMap((day) => day.sessions)
	const minutesByEffort: Record<Effort, number> = {
		easy: 0,
		moderate: 0,
		hard: 0,
	}
	for (const session of sessions) {
		minutesByEffort[session.effort] += session.minutes
	}
	return {
		days,
		sessionCount: sessions.length,
		minutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
		minutesByEffort,
		hardSessions: sessions.filter((session) => session.effort === 'hard')
			.length,
	}
}

/**
 * One family's first week laid for the answers (ADR 0102 §1). A reading;
 * never stored. `draft` is what the plan writer makes when the athlete picks
 * it (`createFirstRunPlan`), `week` what the card shows of it.
 */
export type StartOption = {
	family: PresetFamily
	draft: FirstRunDraft
	week: StartWeek
	/**
	 * How well the family fits the athlete's **Session Preferences**; the
	 * options are ranked by it, highest first. No preference is asked yet, so
	 * every option scores 0 and the level's order stands (#571 scores them).
	 */
	score: number
	/**
	 * The minutes week 1 comes to where it does not add up to the hours given
	 * (ADR 0102 §4), so the card can say so; null where it does.
	 */
	shortOfHours: number | null
	/**
	 * The Simple Activities that did not fit week 1 (_Fikk ikke plass denne
	 * uka_), and what would make room: another day, or more time. Null where
	 * every one fits.
	 */
	notFitted: NotFitted | null
}

export type NotFitted = {
	kinds: ActivityKind[]
	room: 'days' | 'hours'
}

/**
 * What the first card may carry: _Passer deg best_ only when a preference
 * gave it a reason, _Anbefalt for nivået ditt_ on a beginner's _Stor base_,
 * or nothing. A badge always has a reason (ADR 0102 §1).
 */
export type StartBadge = 'best-fit' | 'level' | null

export type StartDraft = {
	startWeekKey: string
	discipline: CardioDiscipline | null
	/**
	 * No modelled endurance sport was picked: one simple week of the Simple
	 * Activities spread out, and one option (#572).
	 */
	simpleOnly: boolean
	/** Ranked, and distinct: no two lay the same first week. */
	options: StartOption[]
	/** How many of the level's families laid a week already shown, and went. */
	merged: number
	badge: StartBadge
	/** The days the athlete picked, and how many of them the plan lays on. */
	daysPicked: number
	daysUsed: number
	/** More days were picked than the level's session cap lays (a beginner). */
	capped: boolean
	/** All seven days were picked, and the plan keeps one of them _fri_. */
	restDayKept: boolean
}

/**
 * Whether two first weeks are the same week to the athlete: day for day the
 * same sessions, by title, activity, effort and minutes (ADR 0102 §2).
 */
function sameWeek(a: StartWeek, b: StartWeek): boolean {
	return a.days.every((day, index) => {
		const other = b.days[index]!.sessions
		return (
			day.sessions.length === other.length &&
			day.sessions.every(
				(session, at) =>
					session.title === other[at]!.title &&
					session.discipline === other[at]!.discipline &&
					session.effort === other[at]!.effort &&
					session.minutes === other[at]!.minutes,
			)
		)
	})
}

/**
 * The ranked, distinct **Start Options** for these answers, or null where no
 * day is picked. Each is one of the level's families laid by
 * `draftFirstRunPlan` with the level's session cap. They are ranked by score
 * (stably, so the level's order breaks ties), and an option whose first week
 * matches one ranked above it is merged into that one.
 */
export function draftStart(answers: StartAnswers): StartDraft | null {
	const { level, hours, days, startWeekKey } = answers
	const discipline = answers.discipline ?? null
	const activities = answers.activities ?? []
	if (days.length === 0) return null
	if (!discipline && activities.length === 0) return null
	const { sessionCap } = LEVEL_DEFAULTS[level]
	const week = layStartWeek({
		discipline,
		activities,
		hours,
		days,
		sessionCap,
	})
	// With no endurance sport there is no family to tell apart: one way.
	const families = discipline
		? startFamilies(level)
		: startFamilies(level).slice(0, 1)
	const laid: StartOption[] = []
	for (const family of families) {
		const draft = draftFirstRunPlan({
			family,
			goal: { kind: 'active' },
			startWeekKey,
			tracks: week.tracks,
			simpleActivities: week.activities,
			sessionCap,
		})
		if (!draft) continue
		const firstWeek = startWeekOf(draft)
		laid.push({
			family,
			draft,
			week: firstWeek,
			score: 0,
			// Each session is rounded to the minute, so a week may read up to a
			// minute a session off the hours without falling short of them.
			shortOfHours:
				Math.abs(firstWeek.minutes - hours * 60) <
				Math.max(1, firstWeek.sessionCount)
					? null
					: firstWeek.minutes,
			notFitted: week.notFitted,
		})
	}
	if (laid.length === 0) return null
	const ranked = laid
		.map((option, index) => ({ option, index }))
		.sort((a, b) => b.option.score - a.option.score || a.index - b.index)
		.map(({ option }) => option)
	const options: StartOption[] = []
	for (const option of ranked) {
		if (!options.some((kept) => sameWeek(kept.week, option.week))) {
			options.push(option)
		}
	}
	const top = options[0]!
	const picked = new Set(days).size
	return {
		startWeekKey,
		discipline,
		simpleOnly: discipline == null,
		options,
		merged: families.length - options.length,
		badge:
			top.score > 0 ? 'best-fit' : top.family === 'big-base' ? 'level' : null,
		daysPicked: picked,
		daysUsed: top.draft.patternDays.length,
		capped: sessionCap < MAX_SESSION_DAYS && picked > sessionCap,
		restDayKept: picked === 7,
	}
}

/**
 * How the start shares the week between the main sport and the **Simple
 * Activities** (#572), the same for every family:
 *
 * - Each Simple Activity takes a day of its own, in the order picked, from
 *   the days the level's session cap and {@link MAX_SESSION_DAYS} leave: a
 *   total across the tracks. The main sport keeps two of them (one, with one
 *   day), so it stays a sport and not a single session.
 * - Its time is its default ({@link SIMPLE_ACTIVITY_DEFAULTS}), and it counts
 *   in the hours: the main sport takes what is left, never less than an hour,
 *   so a short week leaves out the activity rather than the sport. With no
 *   main sport, the activities share all of the hours in proportion to their
 *   defaults, in five-minute steps, spread over the week.
 * - One that finds no day, or no time, did not fit, and the cards name it.
 */
function layStartWeek({
	discipline,
	activities,
	hours,
	days,
	sessionCap,
}: {
	discipline: CardioDiscipline | null
	activities: readonly ActivityKind[]
	hours: number
	days: readonly PatternWeekday[]
	sessionCap: number
}): {
	tracks: DraftTrack[]
	activities: DraftSimpleActivity[]
	notFitted: NotFitted | null
} {
	const picked = [...new Set(days)].sort((a, b) => a - b)
	const budget = Math.min(picked.length, MAX_SESSION_DAYS, sessionCap)
	const wanted = [...new Set(activities)]
	const defaults = (kind: ActivityKind) => SIMPLE_ACTIVITY_DEFAULTS[kind]
	if (!discipline) {
		const fitted = wanted.slice(0, budget)
		const weekdays = spreadDays(picked, fitted.length)
		const minutes = shareMinutes(
			fitted.map((kind) => defaults(kind).minutes),
			hours * 60,
		)
		return {
			tracks: [],
			activities: fitted.map((kind, index) => ({
				kind,
				effortWord: defaults(kind).effortWord,
				minutes: minutes[index]!,
				weekday: weekdays[index]!,
			})),
			notFitted: notFittedOf(wanted.slice(budget), 'days'),
		}
	}
	const room = budget - Math.min(2, budget)
	const fitted = wanted.slice(0, room)
	const dayless = wanted.slice(room)
	const minutesOf = (kinds: readonly ActivityKind[]) =>
		kinds.reduce((sum, kind) => sum + defaults(kind).minutes, 0)
	// The main sport keeps an hour at least: two half-hour sessions.
	const floor = 2 * MIN_SESSION_HOURS * 60
	const timeless: ActivityKind[] = []
	while (fitted.length > 0 && hours * 60 - minutesOf(fitted) < floor) {
		timeless.unshift(fitted.pop()!)
	}
	const notFitted = notFittedOf(
		[...timeless, ...dayless],
		dayless.length > 0 ? 'days' : 'hours',
	)
	if (fitted.length === 0) {
		return {
			tracks: [{ discipline, weeklyHours: hours, days: picked, mix: 'family' }],
			activities: [],
			notFitted,
		}
	}
	const sportHours = hours - minutesOf(fitted) / 60
	const sportDays = patternDaysFor(picked, sportHours, budget - fitted.length)
	const free = picked.filter((day) => !sportDays.includes(day))
	return {
		tracks: [
			{ discipline, weeklyHours: sportHours, days: sportDays, mix: 'family' },
		],
		activities: fitted.map((kind, index) => ({
			kind,
			effortWord: defaults(kind).effortWord,
			minutes: defaults(kind).minutes,
			weekday: free[index]!,
		})),
		notFitted,
	}
}

function notFittedOf(
	kinds: ActivityKind[],
	room: NotFitted['room'],
): NotFitted | null {
	return kinds.length === 0 ? null : { kinds, room }
}

/** The steps a Simple Activity's share of the hours is laid in, and its bounds. */
const SHARE_STEP_MINUTES = 5
const MIN_SHARE_MINUTES = 10
const MAX_SHARE_MINUTES = 600

/**
 * `total` minutes shared in proportion to `weights`, in five-minute steps that
 * add up to the total exactly (largest remainder), each kept between ten
 * minutes and ten hours. Where that clamps, the week falls short and says so.
 */
function shareMinutes(weights: readonly number[], total: number): number[] {
	const steps = Math.round(total / SHARE_STEP_MINUTES)
	const sum = weights.reduce((all, weight) => all + weight, 0)
	if (sum === 0) return weights.map(() => 0)
	const exact = weights.map((weight) => (weight / sum) * steps)
	const whole = exact.map((value) => Math.floor(value))
	let left = steps - whole.reduce((all, value) => all + value, 0)
	const order = exact
		.map((value, index) => ({ index, rest: value - Math.floor(value) }))
		.sort((a, b) => b.rest - a.rest || a.index - b.index)
	for (const { index } of order) {
		if (left <= 0) break
		whole[index] = whole[index]! + 1
		left -= 1
	}
	return whole.map((count) =>
		Math.min(
			MAX_SHARE_MINUTES,
			Math.max(MIN_SHARE_MINUTES, count * SHARE_STEP_MINUTES),
		),
	)
}

/** _Uka di_: the top Start Option's first week. */
export type WeekSketch = StartWeek

/**
 * The **Week Sketch**: the top Start Option's first week — the same reading
 * its card shows — or seven free days before there is anything to lay.
 */
export function weekSketch(start: StartDraft | null): WeekSketch {
	return start?.options[0]?.week ?? startWeekOf(null)
}
