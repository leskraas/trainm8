// The **cross-track day rule** (#589, ADR 0104): one reading of a laid week
// across every Training Track and Simple Activity, and the one answer to "does
// this day clash, and why". The stamp, the lifting-day search, the
// availability fit check, _Bytt dag_ and Week Replan all ask it, so the places
// that lay or move a session cannot drift apart.
//
// Pure. Weekdays are the Week Pattern's, **Monday first** (`PatternWeekday`);
// Training Availability's Sunday-first days convert at the profile edge, never
// here. The week is a wheel: Sunday is the day before Monday.
//
// It reads days, never load: no figure spans tracks (ADR 0046 stands).

import { type EffortWord } from '../effort-word.ts'
import { PATTERN_WEEKDAYS, type PatternWeekday } from './week-pattern.ts'

/**
 * A session laid on a day of the week, as the rule reads it. A `session` is
 * any session read by its **Effort Word**: a track's stamped session (its
 * zone's word) or a Simple Activity (its own word); `long` marks the track's
 * long day. A `lifting` session is a strength session, which carries no
 * Effort Word here. An `effort` of null is a session whose word cannot be read
 * (#617): not known to be _rolig_, so it is read as not easy — a Hard day.
 */
export type PlacedSession =
	| {
			weekday: PatternWeekday
			kind: 'session'
			effort: EffortWord | null
			long?: boolean
	  }
	| { weekday: PatternWeekday; kind: 'lifting' }

/** A {@link PlacedSession} before it has a day: what is placed, not where. */
export type PlacedSessionShape = WithoutWeekday<PlacedSession>
type WithoutWeekday<S> = S extends unknown ? Omit<S, 'weekday'> : never

/**
 * Why a day clashes. A closed set: every caller words each one.
 *
 * `easy-before-hard-day` (spec #588 story 28, for _Bytt dag_ and Week Replan)
 * is a **placing** reason only: a _rolig_ session moved to the day before a
 * Hard day. Every laid week has easy days before its hard ones by design, so
 * {@link clashesIn} never lists it; {@link placingClashes} does, so a move
 * keeps the day before the key session free.
 */
export const CLASH_REASONS = [
	'lifting-on-hard-day',
	'lifting-before-hard-day',
	'lifting-on-long-day',
	'hard-days-in-a-row',
	'two-hard-sessions',
	'two-long-sessions',
	'easy-before-hard-day',
] as const
export type ClashReason = (typeof CLASH_REASONS)[number]

/**
 * One clash. `weekday` is the day it is on; a reason that spans two days
 * (the day before, in a row) names the first, and the second is the day after
 * it on the wheel.
 */
export type Clash = { reason: ClashReason; weekday: PatternWeekday }

/** What a day of the laid week is. */
export type DayReading = {
	weekday: PatternWeekday
	/** The hardest Effort Word of its sessions; null with none read. */
	effort: EffortWord | null
	/** A **Hard day**: a session on it is not _rolig_ (`middels`, `hard`, or
	 * one whose word cannot be read). */
	hard: boolean
	/** A **Long day**: it carries a track's long session. */
	long: boolean
	/** A **Lifting day**: it carries a strength session. */
	lifting: boolean
}

const EFFORT_RANK: Record<EffortWord, number> = {
	rolig: 0,
	middels: 1,
	hard: 2,
}

/** The seven days of the laid week, Monday first. */
export function readDays(week: readonly PlacedSession[]): DayReading[] {
	return PATTERN_WEEKDAYS.map((weekday) => {
		let effort: EffortWord | null = null
		let hard = false
		let long = false
		let lifting = false
		for (const session of week) {
			if (session.weekday !== weekday) continue
			if (session.kind === 'lifting') {
				lifting = true
				continue
			}
			if (isHard(session)) hard = true
			if (
				session.effort != null &&
				(effort == null || EFFORT_RANK[session.effort] > EFFORT_RANK[effort])
			) {
				effort = session.effort
			}
			if (session.long) long = true
		}
		return {
			weekday,
			effort,
			hard,
			long,
			lifting,
		}
	})
}

/** The day after `weekday` on the week's wheel: Monday follows Sunday. */
function dayAfter(weekday: PatternWeekday): PatternWeekday {
	return ((weekday + 1) % 7) as PatternWeekday
}

function isHard(session: PlacedSession): boolean {
	return session.kind === 'session' && session.effort !== 'rolig'
}

function isLong(session: PlacedSession): boolean {
	return session.kind === 'session' && session.long === true
}

function isEasy(session: PlacedSession): boolean {
	return session.kind === 'session' && session.effort === 'rolig'
}

/**
 * Every clash in the laid week, Monday first and in {@link CLASH_REASONS}'
 * order within a day. Each is named once, however many sessions make it.
 * The placing reason `easy-before-hard-day` is not a clash of a laid week.
 */
export function clashesIn(week: readonly PlacedSession[]): Clash[] {
	return clashesOf(week, { placing: false })
}

function clashesOf(
	week: readonly PlacedSession[],
	{ placing }: { placing: boolean },
): Clash[] {
	const days = readDays(week)
	const clashes: Clash[] = []
	for (const day of days) {
		const next = days[dayAfter(day.weekday)]!
		const on = week.filter((session) => session.weekday === day.weekday)
		const found: Record<ClashReason, boolean> = {
			'lifting-on-hard-day': day.lifting && day.hard,
			'lifting-before-hard-day': day.lifting && next.hard,
			'lifting-on-long-day': day.lifting && day.long,
			'hard-days-in-a-row': day.hard && next.hard,
			'two-hard-sessions': on.filter(isHard).length > 1,
			'two-long-sessions': on.filter(isLong).length > 1,
			'easy-before-hard-day': placing && next.hard && on.some(isEasy),
		}
		for (const reason of CLASH_REASONS) {
			if (found[reason]) clashes.push({ reason, weekday: day.weekday })
		}
	}
	return clashes
}

/**
 * Whether `session` takes part in `clash`: it is on a day the clash reads, in
 * the role the reason names. A _rolig_ session takes part only in being the
 * day before a Hard day; the hard session after it never does.
 */
function takesPart(session: PlacedSession, clash: Clash): boolean {
	const on = session.weekday === clash.weekday
	const onNext = session.weekday === dayAfter(clash.weekday)
	const lifts = session.kind === 'lifting'
	switch (clash.reason) {
		case 'lifting-on-hard-day':
			return on && (lifts || isHard(session))
		case 'lifting-before-hard-day':
			return (on && lifts) || (onNext && isHard(session))
		case 'lifting-on-long-day':
			return on && (lifts || isLong(session))
		case 'hard-days-in-a-row':
			return (on || onNext) && isHard(session)
		case 'two-hard-sessions':
			return on && isHard(session)
		case 'two-long-sessions':
			return on && isLong(session)
		case 'easy-before-hard-day':
			return on && isEasy(session)
	}
}

/**
 * Whether placing `session` on its day clashes with the laid week, and why:
 * every clash of the week with it placed that it takes part in. Empty where
 * it fits. A clash the week already has without it is not the session's,
 * unless the session adds to it (a third hard session on a day of two). A
 * _rolig_ session clashes only the day before a Hard day
 * (`easy-before-hard-day`).
 */
export function placingClashes(
	week: readonly PlacedSession[],
	session: PlacedSession,
): Clash[] {
	return clashesOf([...week, session], { placing: true }).filter((clash) =>
		takesPart(session, clash),
	)
}

/**
 * The **Lifting days** for a week (ADR 0103 §2, kept by ADR 0104): `perWeek`
 * of the `days` given, placed against the laid week. Of every way to pick
 * them, the fewest lifts on a **Hard day** (a `middels` or `hard` session),
 * then on the day before one, then on the **Long day**, then the lifts
 * furthest apart on the wheel, then the earliest. One lift a day at most: a
 * day the week already lifts on is not picked, and fewer days than lifts
 * lift once on each. Deterministic, so a re-lay lands where the stamp did.
 */
export function liftingDaysFor(
	days: readonly PatternWeekday[],
	week: readonly PlacedSession[],
	perWeek: number,
): PatternWeekday[] {
	const read = readDays(week)
	const candidates = [...new Set(days)]
		.filter((day) => !read[day]!.lifting)
		.sort((a, b) => a - b)
	const count = Math.min(Math.max(0, perWeek), candidates.length)
	if (count === 0) return []
	const scoreOf = (picked: readonly PatternWeekday[]): number[] => {
		const gaps =
			picked.length < 2
				? [7]
				: picked.map((day, at) =>
						weekdayGap(day, picked[(at + 1) % picked.length]!),
					)
		return [
			picked.filter((day) => read[day]!.hard).length,
			picked.filter((day) => read[dayAfter(day)]!.hard).length,
			picked.filter((day) => read[day]!.long).length,
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

/** Days apart on the week's wheel: Sunday and Monday are neighbours. */
export function weekdayGap(a: number, b: number): number {
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

/** Whether `a` comes before `b`, compared entry by entry. */
function lexicallyBefore(a: readonly number[], b: readonly number[]): boolean {
	for (let at = 0; at < a.length; at++) {
		if (a[at] !== b[at]) return a[at]! < b[at]!
	}
	return false
}
