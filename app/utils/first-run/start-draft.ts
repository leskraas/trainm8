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

import { type PresetFamily } from '../plan-outline/presets.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { stampedSessionTitle } from '../session-title.ts'
import { type CardioDiscipline } from '../workout-schema.ts'
import {
	draftFirstRunPlan,
	MAX_SESSION_DAYS,
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
	discipline: CardioDiscipline
	hours: number
	days: readonly PatternWeekday[]
	/** The Plan Start Week: the first week not yet begun (ADR 0079). */
	startWeekKey: string
}

/** One family's first week laid for the answers. A reading; never stored. */
export type StartOption = { family: PresetFamily; draft: FirstRunDraft }

export type StartDraft = {
	startWeekKey: string
	discipline: CardioDiscipline
	options: StartOption[]
	/** More days were picked than the level's session cap lays (a beginner). */
	capped: boolean
	/** All seven days were picked, and the plan keeps one of them _fri_. */
	restDayKept: boolean
}

/** The Start Options for these answers, or null where no day is picked. */
export function draftStart(answers: StartAnswers): StartDraft | null {
	const { level, discipline, hours, days, startWeekKey } = answers
	if (days.length === 0) return null
	const { sessionCap } = LEVEL_DEFAULTS[level]
	const options: StartOption[] = []
	for (const family of startFamilies(level)) {
		const draft = draftFirstRunPlan({
			family,
			goal: { kind: 'active' },
			startWeekKey,
			discipline,
			weeklyHours: hours,
			days,
			sessionCap,
		})
		if (draft) options.push({ family, draft })
	}
	if (options.length === 0) return null
	const picked = new Set(days).size
	return {
		startWeekKey,
		discipline,
		options,
		capped: sessionCap < MAX_SESSION_DAYS && picked > sessionCap,
		restDayKept: picked === 7,
	}
}

export type WeekSketchSession = {
	title: string
	minutes: number
	hard: boolean
}

export type WeekSketchDay = {
	weekday: PatternWeekday
	sessions: WeekSketchSession[]
}

/** _Uka di_: seven days, Monday first, with what each holds. */
export type WeekSketch = {
	days: WeekSketchDay[]
	sessionCount: number
	minutes: number
}

const WEEKDAYS: PatternWeekday[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * The Week Sketch: the top Start Option's first week, as the stamp lays it
 * and titled as the stamp will title it — or seven free days before there is
 * anything to lay.
 */
export function weekSketch(start: StartDraft | null): WeekSketch {
	const week = start?.options[0]?.draft.weeks[0]
	const days = WEEKDAYS.map((weekday) => ({
		weekday,
		sessions: (week?.sessions ?? [])
			.filter((session) => session.weekday === weekday)
			.map((session) => ({
				title: stampedSessionTitle({
					discipline: start!.discipline,
					role: session.role,
					zone: session.zone,
				}),
				minutes: Math.round((session.volume ?? 0) * 60),
				hard: session.zone != null,
			})),
	}))
	const sessions = days.flatMap((day) => day.sessions)
	return {
		days,
		sessionCount: sessions.length,
		minutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
	}
}
