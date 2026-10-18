// A **Week Pattern** to start from, proposed rather than authored blank.
//
// The pattern is the step between a season's weekly targets and days an athlete
// can train: without one, "55 km this week" is a number and not a week. Authoring
// it from scratch means adding a day at a time, each with a weekday, a track and a
// relative weight — five decisions per session for an athlete who has never been
// asked to weight a training day in their life. This proposes the whole week in
// one act, from what the app already knows about them, and every day of it is
// editable, movable and removable afterwards through the ordinary controls.
//
// **It carries no volume, and cannot.** Every day it proposes is a `share` — a
// relative weight that absorbs its part of whatever the week's derived target
// turns out to be (ADR 0044 §7). So a starter week is honest at 40 km and at 90
// km, and nothing here needs to know which the athlete is at. There is no volume
// field in this module for the same reason there is none in the editor.
//
// **What it reads.** The athlete's own **Training Availability** where they set it
// — those are the days they said they can train, and proposing a Wednesday to
// somebody who cannot train on Wednesdays is worse than proposing nothing. Where
// they never set it, the module falls back to a stated default and the surface
// says so: a fallback named as a fallback is a starting point, and one presented
// as a reading of the athlete would be a fabrication.
//
// Pure: availability and tracks in, days out. The service writes them.

import { type PlannedDiscipline } from '../planned-discipline.ts'
import { weekdayGap } from './day-rule.ts'
import {
	calendarWeekdayOf,
	PATTERN_WEEKDAYS,
	type PatternWeekday,
} from './week-pattern.ts'

/** One proposed day, in the shape `addWeekPatternDay` takes. */
export type StarterDay = {
	weekday: PatternWeekday
	trackId: string
	/** Always a share: a starter week asserts proportions and never quantities. */
	weight: number
	/** Why this day is heavier, where it is — for the sentence the surface says. */
	role: 'long' | 'ordinary'
}

export type StarterTrack = {
	trackId: string
	/** The track's Discipline, or `other` for a Simple Activity's days. */
	discipline: PlannedDiscipline
	/**
	 * Sessions a week this track authors, where it says: a strength segment's
	 * **Strength Frequency** (ADR 0047 §4). `null` for an endurance track, which
	 * authors no frequency and takes the athlete's available days instead.
	 */
	sessionsPerWeek: number | null
	/**
	 * The days this track lays on, where it keeps to some of the athlete's
	 * days rather than all of them: the first run's second endurance sport
	 * takes the days the main sport leaves (#558). Days outside the athlete's
	 * availability are never laid; the last of the track's own days is its
	 * long one. Absent, the track lays every available day, as it always has.
	 */
	weekdays?: readonly PatternWeekday[]
	/**
	 * Each day's weight where the first run shaped the week (_Korte økter_,
	 * #571); a day it does not name keeps the long-day-double rule.
	 */
	dayWeights?: Partial<Record<PatternWeekday, number>>
	/**
	 * The most hard sessions a week its **Quality Session Mix** asks for. More
	 * than none is a track carrying the family's mix, and the one carrying the
	 * most is the main track: it keeps the long day and a day for each hard
	 * session plus one (ADR 0104 §5). Absent or 0, the track has no mix.
	 */
	hardSessions?: number
	/**
	 * How big the track's week is beside the others', for picking the main
	 * track where none carries a mix: the largest is the main one. Compared
	 * only between tracks of one Volume Currency (ADR 0046), so a caller whose
	 * tracks count in different currencies leaves it out, and the first track
	 * is the main one.
	 */
	weeklyShare?: number
}

/**
 * One **lifting slot** (ADR 0104 §3): a lift a week on a strength track, on
 * no weekday. The stamp lays each week's slots after that week's endurance
 * mix, away from its hard days, so the starter week lifts by the same rule as
 * the first run's.
 */
export type StarterLiftingSlot = { trackId: string }

export type StarterProposal = {
	days: StarterDay[]
	/** The strength tracks' lifts a week, one slot per lift. */
	lifting: StarterLiftingSlot[]
	/**
	 * A strength track's **Pinned days** (ADR 0104 §4), where it names its
	 * own: one lift on each, on the day the athlete chose, in place of slots
	 * (#598). Written as `fixed` strength days, which the stamp lays first.
	 */
	pinnedLifting: Array<{ trackId: string; weekday: PatternWeekday }>
	/** The days the week was built from, Monday first. */
	weekdays: PatternWeekday[]
	/** Whether the weekdays came from the athlete's own availability or the default. */
	source: 'availability' | 'default'
}

/**
 * The default training days, for an athlete who has never set their
 * **Training Availability**: four days, with the long one on Sunday.
 *
 * A **stated convention** and not a recommendation — four sessions a week is the
 * middle of what the planning platforms in the #374 survey assume, and no source
 * here supports calling it right for anybody in particular. The surface names it
 * as a starting point, exactly as it names the ramp's +5% as a convention, and the
 * athlete moves any day the moment it lands.
 */
export const DEFAULT_TRAINING_WEEKDAYS: PatternWeekday[] = [1, 3, 5, 6]

/** The heavier day's weight against an ordinary day's. */
const LONG_DAY_WEIGHT = 2
const ORDINARY_DAY_WEIGHT = 1

/**
 * A week to start from: the training days dealt across the endurance tracks,
 * one endurance session a day, each track's long day weighted double and on a
 * day of its own ({@link enduranceDays}), plus a lifting slot per session on
 * any strength track that says how often it lifts.
 *
 * `null` where there is nothing to propose — no track at all, or an athlete whose
 * availability says they train on no days. Both are refusals to invent: a pattern
 * of nothing is not a starting point, and overruling an explicit empty
 * availability would be the app disagreeing with something the athlete stated.
 *
 * **Where the weights come from.** One long day and the rest even. That is the
 * shape every endurance week in the #363 survey has, it is the only proportion an
 * app can propose without knowing the athlete's event, and it is legible at a
 * glance in the preview — the long day is the one that reads twice the others.
 * Nothing here proposes intensity: which day is a quality session is the **Quality
 * Session Mix**'s to say, and a starter pattern that pinned zones to weekdays
 * would be answering a question the segment already answers. It only makes
 * room for it: the track carrying the mix gets a day for each hard session.
 *
 * **Lifting sits alongside, never instead.** A lift draws from the strength
 * track's own weekly sets, so it neither takes volume from a run day nor funds
 * one (ADR 0046 §1). It is proposed as a **lifting slot** on no weekday, never
 * a day picked here: which days are hard is the week's mix's to say, so the
 * stamp lays each week's lifts against that week's hard days by the one day
 * rule (ADR 0104 §3, §5) — not on a hard day, then not the day before one,
 * then not the long day, then as far apart as the week allows.
 */
export function proposeStarterPattern({
	trainableWeekdays,
	tracks,
}: {
	/**
	 * The athlete's **Training Availability** as stored — Sunday-first calendar
	 * indices (ADR 0005) — or `null` where they never set it, which is distinct
	 * from an explicit empty list and is what the default answers.
	 */
	trainableWeekdays: number[] | null
	tracks: readonly StarterTrack[]
}): StarterProposal | null {
	const source = trainableWeekdays == null ? 'default' : 'availability'
	const weekdays =
		trainableWeekdays == null
			? DEFAULT_TRAINING_WEEKDAYS
			: // Crossed into the Training Week's Monday-first order through the one
				// function that crosses it, and sorted, so "the last day" below is the
				// last day of the *week* rather than of the athlete's list.
				PATTERN_WEEKDAYS.filter((weekday) =>
					trainableWeekdays.includes(calendarWeekdayOf(weekday)),
				)
	if (weekdays.length === 0) return null

	const endurance = tracks.filter((track) => track.sessionsPerWeek == null)
	const strength = tracks.filter((track) => track.sessionsPerWeek != null)
	if (endurance.length === 0 && strength.length === 0) return null

	const days: StarterDay[] = []

	for (const { track, days: trackDays, longDay } of enduranceDays(
		weekdays,
		endurance,
	)) {
		for (const weekday of trackDays) {
			const long = weekday === longDay
			days.push({
				weekday,
				trackId: track.trackId,
				weight:
					track.dayWeights?.[weekday] ??
					(long ? LONG_DAY_WEIGHT : ORDINARY_DAY_WEIGHT),
				role: long ? 'long' : 'ordinary',
			})
		}
	}

	// As many lifts as the block says, and never more than the athlete has
	// days: slots the stamp lays per week (ADR 0104 §3).
	// A strength track on its Pinned days lifts on them instead (#598).
	const lifting: StarterLiftingSlot[] = strength.flatMap((track) =>
		track.weekdays
			? []
			: Array.from(
					{ length: Math.min(track.sessionsPerWeek ?? 0, weekdays.length) },
					() => ({ trackId: track.trackId }),
				),
	)
	const pinnedLifting = strength.flatMap((track) => {
		const own = track.weekdays
		if (!own) return []
		return weekdays
			.filter((weekday) => own.includes(weekday))
			.map((weekday) => ({ trackId: track.trackId, weekday }))
	})

	return days.length === 0 && lifting.length === 0 && pinnedLifting.length === 0
		? null
		: { days, lifting, pinnedLifting, weekdays: [...weekdays], source }
}

/**
 * Each endurance track's days in week order, and its long day (ADR 0104 §5).
 *
 * A track that names its own days keeps to those, its long day the last of
 * them, as the first run lays a second sport (#558). The others are dealt the
 * days left as the first run deals sports (`sportTracks`), never two endurance
 * sessions on one day — a run and a ride are a week an athlete can train, a
 * run and a ride every day are not:
 *
 * - The main track ({@link mainTrack}) takes the last day as its long one, and
 *   an even share of the days or its hard sessions plus one, whichever is
 *   more, leaving each other track a day.
 * - Each other track's long day is the day furthest round the wheel from the
 *   long days already laid, the earlier on a tie, so no day carries two.
 * - The ordinary days are dealt in turn, each to the track furthest behind its
 *   share so far, the main track first on a tie.
 *
 * Only where the named days take every day are the others dealt all the
 * athlete's days again: stacking a session beats dropping a track they have.
 * A track left without a day, where there are more tracks than days, lays
 * none.
 */
function enduranceDays(
	weekdays: readonly PatternWeekday[],
	endurance: readonly StarterTrack[],
): Array<{
	track: StarterTrack
	days: PatternWeekday[]
	longDay: PatternWeekday | undefined
}> {
	const laid = new Map<
		StarterTrack,
		{ days: PatternWeekday[]; longDay: PatternWeekday | undefined }
	>()
	for (const track of endurance) {
		const own = track.weekdays
		if (!own) continue
		const days = weekdays.filter((day) => own.includes(day))
		// The last of its days that no earlier track has as its long day, so
		// two tracks naming the same last day do not stack two long sessions.
		const taken = [...laid.values()].map(({ longDay }) => longDay)
		const longDay =
			[...days].reverse().find((day) => !taken.includes(day)) ?? days.at(-1)
		laid.set(track, { days, longDay })
	}
	const named = new Set([...laid.values()].flatMap(({ days }) => days))
	const left = weekdays.filter((day) => !named.has(day))
	const free = left.length > 0 ? left : [...weekdays]

	const unnamed = endurance.filter((track) => !track.weekdays)
	const main = mainTrack(unnamed)
	const dealt = main
		? [main, ...unnamed.filter((track) => track !== main)].slice(0, free.length)
		: []

	if (dealt.length > 0) {
		const others = dealt.length - 1
		const mainCount = Math.min(
			free.length - others,
			Math.max(
				Math.ceil(free.length / dealt.length),
				(dealt[0]!.hardSessions ?? 0) + 1,
			),
		)
		const rest = free.length - mainCount
		const want = dealt.map((_, index) =>
			index === 0
				? mainCount
				: Math.floor(rest / others) + (index - 1 < rest % others ? 1 : 0),
		)

		// The long days first, so each is apart from the others; the named
		// tracks' long days count too.
		const longDays: PatternWeekday[] = [...laid.values()].flatMap(
			({ longDay }) => (longDay == null ? [] : [longDay]),
		)
		const dealtLong: PatternWeekday[] = []
		for (const [index] of dealt.entries()) {
			const last = free.at(-1)!
			const open = free.filter(
				(day) => !longDays.includes(day) && !dealtLong.includes(day),
			)
			const long =
				index === 0 && open.includes(last)
					? last
					: farthestFrom(open.length > 0 ? open : free, [
							...longDays,
							...dealtLong,
						])
			dealtLong.push(long)
		}

		const ordinaryDays: PatternWeekday[][] = dealt.map(() => [])
		const ordinary = free.filter((day) => !dealtLong.includes(day))
		ordinary.forEach((weekday, at) => {
			let pick = 0
			let behind = -Infinity
			want.forEach((total, index) => {
				const share = total - 1
				const has = ordinaryDays[index]!.length
				if (has >= share) return
				const lag = (share * (at + 1)) / ordinary.length - has
				if (lag > behind) {
					behind = lag
					pick = index
				}
			})
			ordinaryDays[pick]!.push(weekday)
		})
		dealt.forEach((track, index) => {
			const longDay = dealtLong[index]!
			laid.set(track, {
				days: [...ordinaryDays[index]!, longDay].sort((a, b) => a - b),
				longDay,
			})
		})
	}

	return endurance.flatMap((track) => {
		const own = laid.get(track)
		return own ? [{ track, ...own }] : []
	})
}

/**
 * The track the week is built around (ADR 0104 §5): the one carrying the most
 * hard sessions, then the largest weekly share, then the first.
 */
function mainTrack(tracks: readonly StarterTrack[]): StarterTrack | undefined {
	let best: StarterTrack | undefined
	for (const track of tracks) {
		if (!best) {
			best = track
			continue
		}
		const hard = (track.hardSessions ?? 0) - (best.hardSessions ?? 0)
		const share = (track.weeklyShare ?? 0) - (best.weeklyShare ?? 0)
		if (hard > 0 || (hard === 0 && share > 0)) best = track
	}
	return best
}

/**
 * The day of `days` furthest round the week's wheel from all of `from`, the
 * earliest on a tie.
 */
function farthestFrom(
	days: readonly PatternWeekday[],
	from: readonly PatternWeekday[],
): PatternWeekday {
	let best = days[0]!
	let bestGap = -1
	for (const day of days) {
		const gap = Math.min(7, ...from.map((other) => weekdayGap(day, other)))
		if (gap > bestGap) {
			best = day
			bestGap = gap
		}
	}
	return best
}
