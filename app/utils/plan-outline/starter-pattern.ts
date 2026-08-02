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

import { type Discipline } from '../workout-schema.ts'
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
	discipline: Discipline
	/**
	 * Sessions a week this track authors, where it says: a strength segment's
	 * **Strength Frequency** (ADR 0047 §4). `null` for an endurance track, which
	 * authors no frequency and takes the athlete's available days instead.
	 */
	sessionsPerWeek: number | null
}

export type StarterProposal = {
	days: StarterDay[]
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
 * A week to start from: one share day per training day on the endurance track,
 * with the last day of the week weighted double as the long one, plus a day per
 * session on any strength track that says how often it lifts.
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
 * would be answering a question the segment already answers.
 *
 * **Strength days sit alongside, never instead.** A lifting day draws from the
 * strength track's own weekly sets, so it neither takes volume from a run day nor
 * funds one (ADR 0046 §1). They are laid on the *earliest* available days, so a
 * lifting session lands away from the long day at the end of the week rather than
 * on top of it.
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

	const longDay = weekdays.at(-1)
	const days: StarterDay[] = []

	// Every available day, on every endurance track. A triathlete gets a swim, a
	// ride and a run on each of their days rather than one discipline chosen for
	// them — each track's week is its own, and dropping two of three would be the
	// app deciding which discipline they train on Tuesday.
	for (const track of endurance) {
		for (const weekday of weekdays) {
			const long = weekday === longDay
			days.push({
				weekday,
				trackId: track.trackId,
				weight: long ? LONG_DAY_WEIGHT : ORDINARY_DAY_WEIGHT,
				role: long ? 'long' : 'ordinary',
			})
		}
	}

	// As many lifting days as the block says, from the front of the week — and
	// never more days than the athlete has.
	for (const track of strength) {
		for (const weekday of weekdays.slice(0, track.sessionsPerWeek ?? 0)) {
			days.push({
				weekday,
				trackId: track.trackId,
				weight: ORDINARY_DAY_WEIGHT,
				role: 'ordinary',
			})
		}
	}

	return days.length === 0 ? null : { days, source }
}
