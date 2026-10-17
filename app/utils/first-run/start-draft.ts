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

import { openEndedRound, type PresetFamily } from '../plan-outline/presets.ts'
import {
	qualitySessionCount,
	type QualityZone,
} from '../plan-outline/quality-mix.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { stampedSessionTitle } from '../session-title.ts'
import { type CardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	draftFirstRunPlan,
	MAX_SESSION_DAYS,
	MIN_SESSION_HOURS,
	patternDaysFor,
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
	/** The main sport (_Hovedidrett_): the first endurance sport picked. */
	discipline: CardioDiscipline
	/**
	 * The other endurance sports picked, beside the main one (#573). Each
	 * gets its own hours track with easy sessions on the days left.
	 */
	otherSports?: readonly CardioDiscipline[]
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

export type StartWeekSession = {
	title: string
	discipline: Discipline
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
	const days = WEEKDAYS.map((weekday) => ({
		weekday,
		sessions: laid
			.filter((session) => session.weekday === weekday)
			.map((session) => ({
				title: stampedSessionTitle({
					discipline: session.discipline,
					role: session.role,
					zone: session.zone,
				}),
				discipline: session.discipline,
				minutes: Math.round((session.volume ?? 0) * 60),
				effort: effortOf(session.zone),
			})),
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
}

/**
 * What the first card may carry: _Passer deg best_ only when a preference
 * gave it a reason, _Anbefalt for nivået ditt_ on a beginner's _Stor base_,
 * or nothing. A badge always has a reason (ADR 0102 §1).
 */
export type StartBadge = 'best-fit' | 'level' | null

export type StartDraft = {
	startWeekKey: string
	discipline: CardioDiscipline
	/** The endurance sports laid, the main sport first. */
	sports: CardioDiscipline[]
	/** Sports picked that no day was left for (never the main sport). */
	sportsLeftOut: CardioDiscipline[]
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
 * The endurance sports picked, the main sport first and each once. The
 * others keep the order they came in.
 */
export function startSports(
	main: CardioDiscipline,
	others: readonly CardioDiscipline[] = [],
): CardioDiscipline[] {
	return [...new Set([main, ...others])]
}

/**
 * How many of `sportCount` sports the week has a day for: the days the plan
 * lays on, across every track, cut to the level's session cap (a total, not
 * per sport) and so that no session falls under {@link MIN_SESSION_HOURS}.
 * Each sport has a long day weighted double, so `days` days over `sports`
 * sports are `days + sports` shares of the hours.
 */
function sessionDaysFor(
	sportCount: number,
	days: readonly PatternWeekday[],
	hours: number,
	sessionCap: number,
): { days: number; sports: number } {
	let count = Math.max(
		1,
		Math.min(new Set(days).size, MAX_SESSION_DAYS, sessionCap),
	)
	while (
		count > 1 &&
		hours / (count + Math.min(sportCount, count)) < MIN_SESSION_HOURS
	) {
		count -= 1
	}
	return { days: count, sports: Math.min(sportCount, count) }
}

/**
 * The tracks for several endurance sports (#573): one hours track per sport
 * (ADR 0044), on days of its own. The main sport takes the long day — the
 * last one — and carries the family's **Quality Session Mix**, so it keeps
 * enough days for the family's hard sessions where the week allows; the other
 * sports share the days left, alternating with it, and have no mix. The
 * hours are shared by the days, each track's long day counting double, so a
 * session is about as long whichever sport it is.
 */
export function sportTracks({
	family,
	sports,
	hours,
	days,
	sessionCap,
}: {
	family: PresetFamily
	/** The main sport first; each one gets at least one day. */
	sports: readonly CardioDiscipline[]
	hours: number
	days: readonly PatternWeekday[]
	sessionCap: number
}): DraftTrack[] {
	const fit = sessionDaysFor(sports.length, days, hours, sessionCap)
	const kept = sports.slice(0, fit.sports)
	const used = patternDaysFor(days, hours, fit.days)
	const others = kept.length - 1
	// The main sport's days: an even share, or more, so that the family's
	// hard sessions have ordinary days to go on, leaving each other sport one.
	const hard = qualitySessionCount(openEndedRound(family).mix)
	const mainDays = Math.min(
		used.length - others,
		Math.max(Math.ceil(used.length / kept.length), hard + 1),
	)
	// The ordinary days each sport gets; the main sport's long day is apart.
	const rest = used.length - mainDays
	const want = kept.map((_, index) =>
		index === 0
			? mainDays - 1
			: Math.floor(rest / others) + (index - 1 < rest % others ? 1 : 0),
	)
	// The ordinary days are dealt out in turn, each to the sport furthest
	// behind its share so far, so every sport's days lie spread through the
	// week (the main sport first on a tie). The long day, the last, is the
	// main sport's.
	const owned: PatternWeekday[][] = kept.map(() => [])
	const ordinary = used.slice(0, -1)
	ordinary.forEach((weekday, at) => {
		let pick = 0
		let behind = -Infinity
		want.forEach((total, index) => {
			const has = owned[index]!.length
			if (has >= total) return
			const lag = (total * (at + 1)) / ordinary.length - has
			if (lag > behind) {
				behind = lag
				pick = index
			}
		})
		owned[pick]!.push(weekday)
	})
	owned[0]!.push(used.at(-1)!)
	// Each track's shares as the starter pattern weighs its days: one a day,
	// and one more for its long day where it has more than one day, so an
	// ordinary session is about as long whichever sport it is. Hours are
	// carried to a tenth (`derive.ts`), so each other sport's hours are
	// rounded to one and the main sport takes the rest: the tracks still add
	// up to the hours given.
	const sharesOf = (own: readonly PatternWeekday[]) =>
		own.length + (own.length > 1 ? 1 : 0)
	const shares = owned.reduce((sum, own) => sum + sharesOf(own), 0)
	const otherHours = owned
		.slice(1)
		.map((own) => Math.round(((hours * sharesOf(own)) / shares) * 10) / 10)
	const mainHours =
		Math.round(
			(hours - otherHours.reduce((sum, value) => sum + value, 0)) * 10,
		) / 10
	return kept.map((discipline, index) => ({
		discipline,
		weeklyHours: index === 0 ? mainHours : otherHours[index - 1]!,
		days: owned[index]!.sort((a, b) => a - b),
		mix: index === 0 ? 'family' : 'none',
	}))
}

/**
 * The ranked, distinct **Start Options** for these answers, or null where no
 * day is picked. Each is one of the level's families laid by
 * `draftFirstRunPlan` with the level's session cap. They are ranked by score
 * (stably, so the level's order breaks ties), and an option whose first week
 * matches one ranked above it is merged into that one.
 */
export function draftStart(answers: StartAnswers): StartDraft | null {
	const { level, discipline, hours, days, startWeekKey } = answers
	if (days.length === 0) return null
	const { sessionCap } = LEVEL_DEFAULTS[level]
	const picked = startSports(discipline, answers.otherSports)
	const sports = picked.slice(
		0,
		sessionDaysFor(picked.length, days, hours, sessionCap).sports,
	)
	const laid: StartOption[] = []
	for (const family of startFamilies(level)) {
		const draft =
			sports.length === 1
				? draftFirstRunPlan({
						family,
						goal: { kind: 'active' },
						startWeekKey,
						discipline,
						weeklyHours: hours,
						days,
						sessionCap,
					})
				: draftFirstRunPlan({
						family,
						goal: { kind: 'active' },
						startWeekKey,
						sessionCap,
						tracks: sportTracks({ family, sports, hours, days, sessionCap }),
					})
		if (!draft) continue
		const week = startWeekOf(draft)
		laid.push({
			family,
			draft,
			week,
			score: 0,
			// Each session is rounded to the minute, so a week may read up to a
			// minute a session off the hours without falling short of them.
			shortOfHours:
				Math.abs(week.minutes - hours * 60) < Math.max(1, week.sessionCount)
					? null
					: week.minutes,
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
	const daysPicked = new Set(days).size
	return {
		startWeekKey,
		discipline,
		sports,
		sportsLeftOut: picked.slice(sports.length),
		options,
		merged: startFamilies(level).length - options.length,
		badge:
			top.score > 0 ? 'best-fit' : top.family === 'big-base' ? 'level' : null,
		daysPicked,
		daysUsed: top.draft.patternDays.length,
		capped: sessionCap < MAX_SESSION_DAYS && daysPicked > sessionCap,
		restDayKept: daysPicked === 7,
	}
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
