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
import { openEndedRound, type PresetFamily } from '../plan-outline/presets.ts'
import {
	qualitySessionCount,
	type QualityZone,
} from '../plan-outline/quality-mix.ts'
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
	/**
	 * The main sport (_Hovedidrett_): the first endurance sport picked. None
	 * where the athlete picked only Simple Activities (#572).
	 */
	discipline?: CardioDiscipline | null
	/** The **Simple Activities** picked, in the order they were picked (#572). */
	activities?: readonly ActivityKind[]
	/**
	 * The other endurance sports picked, beside the main one (#573). Each
	 * gets its own hours track with easy sessions on the days left.
	 */
	otherSports?: readonly CardioDiscipline[]
	hours: number
	days: readonly PatternWeekday[]
	/** The Plan Start Week: the first week not yet begun (ADR 0079). */
	startWeekKey: string
	/**
	 * _Styrke_, where it was picked: the strength sessions a week the athlete
	 * tapped (their **Strength Frequency** answer, ADR 0103) and the session
	 * each lifting day copies. Absent or null: no lifting.
	 */
	strength?: StartStrength | null
	/** The **Session Preferences**, none where the athlete skipped them. */
	preferences?: readonly SessionPreference[]
}

/** The strength sessions a week the start's one tap offers: _1_, _2_ or _3_. */
export const STRENGTH_PER_WEEK_CHOICES = [1, 2, 3] as const
export type StrengthPerWeek = (typeof STRENGTH_PER_WEEK_CHOICES)[number]

/**
 * What the tap is pre-set to (ADR 0103): the lifting history's sessions a
 * week where there is a history (the strength offer's reading), held to the
 * tap's 1–3, or else the **Training Level**'s default.
 */
export function startStrengthPerWeek(
	level: TrainingLevel,
	fromHistory: number | null,
): StrengthPerWeek {
	const value =
		fromHistory == null
			? LEVEL_DEFAULTS[level].strengthPerWeek
			: Math.round(fromHistory)
	return Math.min(3, Math.max(1, value)) as StrengthPerWeek
}

/**
 * A lifting day as the start shows it: the title of the session it copies
 * (the athlete's most recent strength session, or the Catalogue's full-body
 * **Stock Workout**) and its lifts (`Knebøy 3×12`) — never minutes.
 */
export type StartStrengthSession = {
	title: string
	lifts: readonly string[]
}

export type StartStrength = {
	perWeek: number
	session: StartStrengthSession
}

/**
 * The **Session Preferences** the start asks for (_Hva slags økter liker
 * du?_), several at once or none: _Lange, rolige turer_; _Korte, harde
 * intervaller_; _Jevnt hardt_; _Korte økter_; _Overrask meg_.
 */
export const SESSION_PREFERENCES = [
	'long',
	'intervals',
	'threshold',
	'short',
	'surprise',
] as const
export type SessionPreference = (typeof SESSION_PREFERENCES)[number]

/**
 * How well a family suits the preferences (ADR 0102 §1, the spec's prototype
 * A scoring): intervals and _jevnt hardt_ weigh two for the family built on
 * them, _overrask meg_ two for _Klassisk 3:1_'s variety, long easy sessions one
 * for the families that are mostly easy, and short sessions one for
 * _Terskelfokus_, which does most in little time.
 */
export function preferenceScore(
	family: PresetFamily,
	preferences: readonly SessionPreference[],
): number {
	const picked = new Set(preferences)
	return (
		(picked.has('intervals') && family === 'polarized' ? 2 : 0) +
		(picked.has('threshold') && family === 'threshold' ? 2 : 0) +
		(picked.has('long') && (family === 'polarized' || family === 'big-base')
			? 1
			: 0) +
		(picked.has('surprise') && family === 'classic' ? 2 : 0) +
		(picked.has('short') && family === 'threshold' ? 1 : 0)
	)
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
	/**
	 * The day's strength session, where it is a lifting day (#574): shown by
	 * its lifts, never in minutes, and outside every figure in hours.
	 */
	lifting: StartStrengthSession[]
}

/**
 * A first week as the athlete reads it: seven days, Monday first, each with
 * its sessions (none is _fri_), and what the week adds up to — its minutes,
 * the minutes at each effort, and how many sessions are _hard_. The strength
 * sessions are counted apart (_+1 styrkeøkt_), as Planned Volume counts what
 * hours do not measure.
 */
export type StartWeek = {
	days: StartWeekDay[]
	sessionCount: number
	minutes: number
	minutesByEffort: Record<Effort, number>
	hardSessions: number
	strengthSessions: number
}

const WEEKDAYS: PatternWeekday[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * A draft's first week, as the stamp lays it and titled as the stamp will
 * title it, or seven free days where there is none — with the lifting days,
 * where there are any.
 */
export function startWeekOf(
	draft: FirstRunDraft | null,
	lifting: {
		days: readonly PatternWeekday[]
		session: StartStrengthSession
	} | null = null,
): StartWeek {
	const laid = draft?.weeks[0]?.sessions ?? []
	const activities = new Map(
		(draft?.simpleActivities ?? []).map((activity) => [
			activity.workoutId,
			activity,
		]),
	)
	const days = WEEKDAYS.map((weekday) => ({
		weekday,
		lifting: lifting && lifting.days.includes(weekday) ? [lifting.session] : [],
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
		strengthSessions: days.reduce((sum, day) => sum + day.lifting.length, 0),
	}
}

/** Days apart on the week's wheel: Sunday and Monday are neighbours. */
function weekdayGap(a: number, b: number): number {
	const apart = Math.abs(a - b)
	return Math.min(apart, 7 - apart)
}

/** Every way to pick `count` of the days, in week order. */
function combinations<T>(items: readonly T[], count: number): T[][] {
	if (count === 0) return [[]]
	return items.flatMap((item, index) =>
		combinations(items.slice(index + 1), count - 1).map((rest) => [
			item,
			...rest,
		]),
	)
}

/**
 * The lifting days (#574, ADR 0103): `perWeek` of the athlete's days, placed
 * away from the hard endurance days. Of every way to pick them, the one with
 * the fewest lifts on a day with a hard or middling session, then on the day
 * before one (legs fresh for the intervals), then on the long day, then the
 * lifts furthest apart, then the earliest. One lift a day at most, so fewer
 * days than lifts lifts once on each.
 */
export function strengthDaysFor(
	days: readonly PatternWeekday[],
	week: StartWeek,
	perWeek: number,
	longDay: PatternWeekday | null = null,
): PatternWeekday[] {
	const candidates = [...new Set(days)].sort((a, b) => a - b)
	const count = Math.min(Math.max(0, perWeek), candidates.length)
	if (count === 0) return []
	const quality = new Set(
		week.days
			.filter((day) => day.sessions.some((s) => s.effort !== 'easy'))
			.map((day) => day.weekday),
	)
	const scoreOf = (picked: readonly PatternWeekday[]): number[] => {
		const gaps =
			picked.length < 2
				? [7]
				: picked.map((day, at) =>
						weekdayGap(day, picked[(at + 1) % picked.length]!),
					)
		return [
			picked.filter((day) => quality.has(day)).length,
			picked.filter((day) => quality.has(((day + 1) % 7) as PatternWeekday))
				.length,
			picked.filter((day) => day === longDay).length,
			-Math.min(...gaps),
			picked.reduce<number>((sum, day) => sum + day, 0),
		]
	}
	let best: PatternWeekday[] = []
	let bestScore: number[] | null = null
	for (const picked of combinations(candidates, count)) {
		const score = scoreOf(picked)
		if (bestScore == null || lexicallyBefore(score, bestScore)) {
			best = picked
			bestScore = score
		}
	}
	return best
}

/** Whether `a` comes before `b`, compared entry by entry. */
function lexicallyBefore(a: readonly number[], b: readonly number[]): boolean {
	for (let at = 0; at < a.length; at++) {
		if (a[at] !== b[at]) return a[at]! < b[at]!
	}
	return false
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
	 * How well the family fits the athlete's **Session Preferences**
	 * (`preferenceScore`); the options are ranked by it, highest first, and
	 * with none every option scores 0 and the level's order stands.
	 */
	score: number
	/**
	 * The minutes week 1 comes to where it does not add up to the hours given
	 * (ADR 0102 §4), so the card can say so; null where it does.
	 */
	shortOfHours: number | null
	/**
	 * The lifting days (#574): Monday-first, as many as the athlete tapped
	 * where their days allow, away from the hard endurance days
	 * ({@link strengthDaysFor}). Empty without _styrke_.
	 */
	strengthDays: PatternWeekday[]
	/**
	 * _Korte økter_ kept the weekday sessions to 45 minutes and took hours
	 * off week 1 doing so: the reason the week is short, where it is.
	 */
	shortByPreference: boolean
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
	/**
	 * The lifts took endurance days (#574): a _Nybegynner_'s session cap is the
	 * week's, so endurance lays on fewer of the picked days than it could.
	 * The endurance sessions it was left, or null where lifting cut nothing.
	 */
	strengthCapped: number | null
}

/**
 * Whether two first weeks are the same week to the athlete: day for day the
 * same sessions, by title, activity, effort and minutes (ADR 0102 §2).
 */
function sameWeek(a: StartWeek, b: StartWeek): boolean {
	return a.days.every((day, index) => {
		const other = b.days[index]!.sessions
		return (
			day.lifting.length === b.days[index]!.lifting.length &&
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
	const { level, hours, days, startWeekKey, strength } = answers
	const discipline = answers.discipline ?? null
	const activities = answers.activities ?? []
	if (days.length === 0) return null
	if (!discipline && activities.length === 0) return null
	const { sessionCap } = LEVEL_DEFAULTS[level]
	const daysPicked = new Set(days).size
	// A _Nybegynner_'s session cap is the whole week's — lifts, Simple
	// Activities and sports together — and leaves the rest one session at
	// least; above it, the lifts come on top of the cap. One lift a day at most.
	const liftsInCap = level === 'beginner'
	const lifts = strength
		? Math.max(
				0,
				Math.min(
					strength.perWeek,
					daysPicked,
					liftsInCap ? sessionCap - 1 : Infinity,
				),
			)
		: 0
	const enduranceCap = liftsInCap ? sessionCap - lifts : sessionCap
	const preferences = answers.preferences ?? []
	const shortWeekdays = preferences.includes('short')
		? { longMayBeLong: preferences.includes('long') }
		: undefined
	const picked = discipline ? startSports(discipline, answers.otherSports) : []
	// With no endurance sport there is no family to tell apart: one way.
	const families = discipline
		? startFamilies(level)
		: startFamilies(level).slice(0, 1)
	const laid: StartOption[] = []
	let sports: CardioDiscipline[] = []
	for (const family of families) {
		// The Simple Activities and the sports share what the lifts leave.
		const layout = layStartWeek({
			family,
			sports: picked,
			activities,
			hours,
			days,
			sessionCap: enduranceCap,
		})
		sports = layout.sports
		const draft =
			layout.activities.length === 0 && sports.length === 1
				? draftFirstRunPlan({
						family,
						goal: { kind: 'active' },
						startWeekKey,
						discipline: sports[0]!,
						weeklyHours: hours,
						days,
						sessionCap: enduranceCap,
						shortWeekdays,
					})
				: draftFirstRunPlan({
						family,
						goal: { kind: 'active' },
						startWeekKey,
						sessionCap: enduranceCap,
						shortWeekdays,
						tracks: layout.tracks,
						simpleActivities: layout.activities,
					})
		if (!draft) continue
		const endurance = startWeekOf(draft)
		const strengthDays = strength
			? strengthDaysFor(
					days,
					endurance,
					lifts,
					draft.patternDays.at(-1) ?? null,
				)
			: []
		const week = strength
			? startWeekOf(draft, { days: strengthDays, session: strength.session })
			: endurance
		laid.push({
			family,
			draft,
			week,
			score: preferenceScore(family, preferences),
			// The cap reshaped a track's days, and the week came out under the
			// hours: nothing else in the draft lowers a track's hours.
			shortByPreference:
				draft.tracks.some((track) => track.dayWeights != null) &&
				draft.anchor < hours,
			// Each session is rounded to the minute, so a week may read up to a
			// minute a session off the hours without falling short of them.
			shortOfHours:
				Math.abs(week.minutes - hours * 60) < Math.max(1, week.sessionCount)
					? null
					: week.minutes,
			strengthDays,
			notFitted: layout.notFitted,
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
	return {
		startWeekKey,
		discipline,
		simpleOnly: discipline == null,
		sports,
		sportsLeftOut: picked.slice(sports.length),
		options,
		merged: families.length - options.length,
		badge:
			top.score > 0 ? 'best-fit' : top.family === 'big-base' ? 'level' : null,
		daysPicked,
		daysUsed: top.draft.patternDays.length,
		capped: sessionCap < MAX_SESSION_DAYS && daysPicked + lifts > sessionCap,
		restDayKept: daysPicked === 7,
		strengthCapped:
			liftsInCap &&
			lifts > 0 &&
			top.draft.patternDays.length >= enduranceCap &&
			Math.min(daysPicked, MAX_SESSION_DAYS) > enduranceCap
				? enduranceCap
				: null,
	}
}

/**
 * How the start shares the week between the endurance sports and the
 * **Simple Activities** (#572):
 *
 * - The days the plan lays on are one total across every track: the days
 *   picked, cut to {@link MAX_SESSION_DAYS} and the level's session cap.
 * - Each Simple Activity takes a day of its own from that total, in the order
 *   picked. The sports keep two of the days (or one a sport, if more; one,
 *   with one day), so a sport stays a sport and not a single session.
 * - Its time is its default ({@link SIMPLE_ACTIVITY_DEFAULTS}), and it counts
 *   in the hours: the sports take what is left (`sportTracks`), never less
 *   than an hour, so a short week leaves out the activity rather than the
 *   sport. With no sport, the activities share all of the hours in proportion
 *   to their defaults, in five-minute steps, spread over the week.
 * - One that finds no day, or no time, did not fit, and the cards name it.
 */
function layStartWeek({
	family,
	sports,
	activities,
	hours,
	days,
	sessionCap,
}: {
	family: PresetFamily
	/** The endurance sports picked, the main sport first; none at all. */
	sports: readonly CardioDiscipline[]
	activities: readonly ActivityKind[]
	hours: number
	days: readonly PatternWeekday[]
	sessionCap: number
}): {
	tracks: DraftTrack[]
	/** The sports laid, the main sport first. */
	sports: CardioDiscipline[]
	activities: DraftSimpleActivity[]
	notFitted: NotFitted | null
} {
	const picked = [...new Set(days)].sort((a, b) => a - b)
	const budget = Math.min(picked.length, MAX_SESSION_DAYS, sessionCap)
	const wanted = [...new Set(activities)]
	const defaults = (kind: ActivityKind) => SIMPLE_ACTIVITY_DEFAULTS[kind]
	if (sports.length === 0) {
		const fitted = wanted.slice(0, budget)
		const weekdays = spreadDays(picked, fitted.length)
		const minutes = shareMinutes(
			fitted.map((kind) => defaults(kind).minutes),
			hours * 60,
		)
		return {
			tracks: [],
			sports: [],
			activities: fitted.map((kind, index) => ({
				kind,
				effortWord: defaults(kind).effortWord,
				minutes: minutes[index]!,
				weekday: weekdays[index]!,
			})),
			notFitted: notFittedOf(wanted.slice(budget), 'days'),
		}
	}
	const room = budget - Math.min(budget, Math.max(2, sports.length))
	const fitted = wanted.slice(0, room)
	const dayless = wanted.slice(room)
	const minutesOf = (kinds: readonly ActivityKind[]) =>
		kinds.reduce((sum, kind) => sum + defaults(kind).minutes, 0)
	// The sports keep an hour at least: two half-hour sessions.
	const floor = 2 * MIN_SESSION_HOURS * 60
	const timeless: ActivityKind[] = []
	while (fitted.length > 0 && hours * 60 - minutesOf(fitted) < floor) {
		timeless.unshift(fitted.pop()!)
	}
	const notFitted = notFittedOf(
		[...timeless, ...dayless],
		dayless.length > 0 ? 'days' : 'hours',
	)
	// The sports lay on what the activities leave of the total.
	const sportHours = hours - minutesOf(fitted) / 60
	const sportCap = budget - fitted.length
	const kept = sports.slice(
		0,
		sessionDaysFor(sports.length, picked, sportHours, sportCap).sports,
	)
	const tracks: DraftTrack[] =
		kept.length === 1
			? [
					{
						discipline: kept[0]!,
						weeklyHours: sportHours,
						days: patternDaysFor(picked, sportHours, sportCap),
						mix: 'family',
					},
				]
			: sportTracks({
					family,
					sports: kept,
					hours: sportHours,
					days: picked,
					sessionCap: sportCap,
				})
	const taken = new Set(tracks.flatMap((track) => track.days))
	const free = picked.filter((day) => !taken.has(day))
	return {
		tracks,
		sports: kept,
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
