// **Stamping** a Week Pattern: turning the microcycle the athlete authored once
// into real Workout Sessions across the weeks they chose (#412, ADR 0044 §6–§7).
//
// This module is the pure half — what each chosen week *comes out as*, and what
// the app has to say about it. It writes nothing. `stamp.server.ts` takes this
// plan and copies Workouts against it, so the preview the athlete reads before
// committing and the sessions they get afterwards are the same arithmetic run
// twice rather than two arithmetics that agree by inspection.
//
// Five properties this module exists to hold:
//
// - **Every week is resolved on its own, against its own derived target.** The
//   same pattern stamped into a 50 km week and a 65 km week produces different
//   sessions, because a pattern holds no absolute quantity (ADR 0040 §1). So the
//   resolution is `resolveWeekPattern` — the *same* function the Pattern Preview
//   calls — run once per chosen week rather than once for the whole stamp.
// - **Fixed volume is subtracted before the shares divide the remainder, and a
//   fixed day that overshoots the week is never shortened.** The overshoot
//   travels out as `resolveWeekPattern`'s own warning and the fixed session is
//   planned exactly as authored; the share days are then reported as having
//   nothing left rather than written as zero-volume sessions (ADR 0044 §7, ADR
//   0042 §9).
// - **A day the app cannot honestly turn into a session is *reported*, never
//   guessed at.** Four distinct reasons ({@link STAMP_SKIP_REASONS}), each an
//   Unavailable Metric with its cause, and none of them a fabricated volume
//   (ADR 0008).
// - **A strength session carries no Planned TSS, and that is stated rather than
//   shown as a zero.** `carriesTss` is read off the day's own track, so the
//   surface can say "no TSS" where a `0` would read as "an easy session".
// - **How many weeks are stamped is the athlete's choice.** Nothing here caps
//   the list, and nothing here reads it back: every guideline-level figure is
//   derived from the anchor and the ramps regardless of how far materialization
//   reaches (ADR 0040 §1).
//
// Warnings carry numbers and no wording, exactly as `ramp-guard.ts` and
// `week-pattern.ts` do; the surface words them.

import { z } from 'zod/v3'
import { effortWordOfZone, type EffortWord } from '../effort-word.ts'
import { type TrainingZone } from '../session-profile.ts'
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import { liftingDaysFor, readDays, type PlacedSession } from './day-rule.ts'
import { type VolumeCurrency } from './derive.ts'
import {
	isQualityZone,
	QUALITY_ZONES,
	type QualitySessionMixEntry,
	type QualityZone,
} from './quality-mix.ts'
import { DEFAULT_TRAINING_WEEKDAYS } from './starter-pattern.ts'
import {
	PATTERN_WEEKDAYS,
	resolveWeekPattern,
	type PatternDayKind,
	type PatternDaySpec,
	type PatternTrackReading,
	type PatternTrackSpec,
	type PatternWeekday,
} from './week-pattern.ts'

/**
 * Why a pattern day produced no session this week. Four distinct absences, and
 * they must not read alike — the surface words each one, and none of them is a
 * refusal: the rest of the week is stamped regardless.
 *
 * - `no-prescription` — a fixed day whose Workout is gone (`onDelete: SetNull`),
 *   so there is nothing to copy.
 * - `volume-unavailable` — a share day in a week with no derived target for its
 *   track, so there is nothing for it to take a part of.
 * - `no-volume-left` — a share day in a week the fixed sessions already spend.
 *   The consequence of an overshoot, stated as a fact; the fixed sessions stand.
 * - `not-prescribable` — a **bare** share day whose quantity cannot be written
 *   as a prescription at all: "3.4 sets" names no exercise and "40 TSS" names no
 *   effort, and neither does a duration on a strength track. A fixed day on the
 *   same track stamps perfectly well because its Workout says what to do, and so
 *   does a share day carrying a *shape*.
 */
export const STAMP_SKIP_REASONS = [
	'no-prescription',
	'volume-unavailable',
	'no-volume-left',
	'not-prescribable',
] as const
export type StampSkipReason = (typeof STAMP_SKIP_REASONS)[number]

/**
 * The currencies a bare share of a week can be written into a prescription as:
 * `km` becomes a distance and `hours` becomes a duration, which are the two
 * quantities a `WorkoutStep` carries (ADR 0002).
 */
export function isStampableCurrency(
	currency: VolumeCurrency,
): currency is 'km' | 'hours' {
	return currency === 'km' || currency === 'hours'
}

/**
 * One pattern day as the stamp reads it: the spec the resolution already takes,
 * plus the two things copying needs — which Workout to copy, and (for a share
 * day carrying a *shape*) what that shape prices at in the track's own currency,
 * so the shape can be scaled to the share this day actually takes.
 *
 * `shapeVolume` is `null` where the shape cannot be priced at all, which is a
 * real state rather than an error: the shape is then carried across **as
 * authored** and the session says so, because scaling by a guessed ratio would
 * put a number in the athlete's prescription that nothing derived.
 */
export type StampDay = PatternDaySpec & {
	/** A fixed day's prescription, or a share day's optional shape. */
	workoutId: string | null
	/** A share day's shape, priced in the track's currency; `null` = unpriceable. */
	shapeVolume: number | null
	/**
	 * The zone the day's own Workout prescribes (its hardest), where it has one
	 * — read off the content, as `readStampedMixWarnings` reads it. A fixed
	 * threshold session already *is* one of the week's quality sessions, so the
	 * mix asks the share days for one fewer. Absent or `null` for a bare share.
	 */
	zone?: TrainingZone | null
	/**
	 * A **Simple Activity**'s own **Effort Word**, said on its Workout. A
	 * `middels` or `hard` one is a **Hard day** every track's mix is laid
	 * around (ADR 0104 §2). Absent or `null` on every other day.
	 */
	effort?: EffortWord | null
}

/** A Training Track the pattern draws from, in its own Volume Currency. */
export type StampTrack = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
}

/**
 * A **lifting slot** (ADR 0104 §3): one strength session a week a strength
 * track lifts, on no weekday anyone chose. The stamp places each week's slots
 * after that week's endurance mix is laid, away from its hard days
 * (`liftingDaysFor`), so a phase that moves the hard days moves the lifting.
 * `workoutId` is the session each lift copies; `null` where it is gone.
 */
export type StampLiftingSlot = {
	dayId: string
	trackId: string
	workoutId: string | null
	/** The slot's stored position, which orders the slots among themselves. */
	orderInDay?: number
}

/** A stamped session's kind: a pattern day's, or a lifting slot's. */
export type StampSessionKind = PatternDayKind | 'lifting'

/** One chosen week, with the derived target the plan already read for it. */
export type StampWeekInput = {
	weekKey: string
	weekInPlan: number
	/** `null` is an Unavailable Metric — no anchor in force, or an unpriceable rule. */
	targets: ReadonlyArray<{ trackId: string; value: number | null }>
	/**
	 * Each endurance track's **Quality Session Mix** for this week's segment —
	 * what the week's hard sessions are. A track with none (or a week passed
	 * without `mixes`) lays every bare share day easy, as stamps always did.
	 */
	mixes?: ReadonlyArray<{
		trackId: string
		mix: readonly QualitySessionMixEntry[]
	}>
}

/**
 * One session the stamp will write. Carries no dates: a weekday plus the week's
 * Monday is the whole position, and the crossing into a UTC instant needs the
 * **Athlete Timezone**, which is the server's to know (ADR 0019, ADR 0023).
 */
export type StampSession = {
	dayId: string
	weekKey: string
	weekday: PatternWeekday
	orderInDay: number
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	/** The pattern day's kind, or `lifting` for a lifting slot the stamp laid. */
	kind: StampSessionKind
	/**
	 * What this day comes out as in the track's currency — `null` on a fixed day
	 * the currency cannot read, which does not stop it being stamped: the Workout
	 * *is* the prescription, and its price is a reading of it rather than its
	 * content.
	 */
	volume: number | null
	/** The Workout to copy, or `null` to write the volume as a bare prescription. */
	sourceWorkoutId: string | null
	/** What to multiply the copied shape by; `1` means "as authored". */
	scale: number
	/** A shape carried across without being scaled, because it could not be priced. */
	shapeUnscaled: boolean
	/**
	 * Whether the session this stamps can carry **Planned TSS** at all. A strength
	 * session cannot (ADR 0008: no resolvable cardio intensity), and the surface
	 * must say that rather than render a `0` that reads as an easy session.
	 */
	carriesTss: boolean
	/**
	 * `long` where this is a share day weighted heavier than another share day
	 * of its track (the starter pattern's long day, ADR 0044 §7); `ordinary`
	 * otherwise. Structural, so the title can say _Langtur_.
	 */
	role: 'long' | 'ordinary'
	/**
	 * The quality zone the stamp gave this **bare share day** from the week's
	 * mix (3 tempo, 4 threshold, 5 VO₂ max), or `null` for an easy day — and
	 * always `null` on a fixed day or a shape, whose Workout says what it is.
	 */
	zone: QualityZone | null
}

/** A day that produced no session this week, and why. */
export type StampSkip = {
	dayId: string
	weekKey: string
	weekday: PatternWeekday
	trackId: string
	reason: StampSkipReason
}

/** One chosen week, planned. */
export type StampWeekPlan = {
	weekKey: string
	weekInPlan: number
	sessions: StampSession[]
	skipped: StampSkip[]
	/**
	 * The per-track arithmetic behind the figures — target, fixed, remainder — and
	 * the pattern's own warnings, `fixed-exceeds-target` among them. Passed through
	 * rather than re-derived so the stamp cannot disagree with the Pattern Preview.
	 */
	tracks: PatternTrackReading[]
}

/**
 * What each chosen week comes out as, in the order the weeks were chosen.
 *
 * One resolution per week and never one for the whole stamp: the week's target is
 * the input the shares divide, and it changes week to week. A stamp computed off a
 * representative week would write the same session into a 50 km week and a 65 km
 * one, which is the exact failure a pattern holding no absolute quantity exists to
 * prevent (ADR 0044 §7).
 *
 * Each week is laid in one order: the pattern's days, every track's long day,
 * each track's mix around the rest, and last the **lifting slots** (ADR 0104
 * §3), placed against that week's hard, long and lifting days on the
 * `liftingDays` — the athlete's **Training Availability**, Monday first, or
 * where none is given the pattern's own days ({@link fallbackLiftingDays}).
 */
export function planStamp({
	days,
	tracks,
	weeks,
	lifting = [],
	liftingDays,
}: {
	days: readonly StampDay[]
	tracks: readonly StampTrack[]
	weeks: readonly StampWeekInput[]
	/** The strength tracks' lifting slots, laid per week after the mix. */
	lifting?: readonly StampLiftingSlot[]
	/** The days a lift may go on, Monday first. */
	liftingDays?: readonly PatternWeekday[]
}): StampWeekPlan[] {
	const used = new Set(days.map((day) => day.trackId))
	const trackById = new Map(tracks.map((track) => [track.trackId, track]))
	const dayById = new Map(days.map((day) => [day.dayId, day]))
	const liftOn: readonly PatternWeekday[] =
		liftingDays ?? fallbackLiftingDays(days, lifting)

	return weeks.map((week) => {
		const specs: PatternTrackSpec[] = tracks
			.filter((track) => used.has(track.trackId))
			.map((track) => ({
				trackId: track.trackId,
				currency: track.currency,
				// The week's *real* derived figure, or `null`. Never averaged and never
				// substituted: a stamp that wrote a target nothing derived would put
				// volume in the calendar the plan never asked for.
				target:
					week.targets.find((target) => target.trackId === track.trackId)
						?.value ?? null,
			}))

		const readings = resolveWeekPattern({ days, tracks: specs })
		const sessions: StampSession[] = []
		const skipped: StampSkip[] = []

		for (const reading of readings) {
			const track = trackById.get(reading.trackId)
			if (!track) continue
			for (const dayReading of reading.days) {
				const day = dayById.get(dayReading.dayId)
				if (!day) continue
				const position = {
					dayId: day.dayId,
					weekKey: week.weekKey,
					weekday: day.weekday,
					trackId: day.trackId,
				}
				const skip = skipReasonFor(day, dayReading.value, track)
				if (skip) {
					skipped.push({ ...position, reason: skip })
					continue
				}
				sessions.push({
					...position,
					orderInDay: day.orderInDay,
					discipline: track.discipline,
					currency: track.currency,
					kind: day.kind,
					volume: dayReading.value,
					sourceWorkoutId: day.workoutId,
					scale: scaleFor(day, dayReading.value),
					shapeUnscaled:
						day.kind === 'share' &&
						day.workoutId != null &&
						!(day.shapeVolume != null && day.shapeVolume > 0),
					// Read off the track's own Discipline rather than off the copied
					// prescription: the honest statement is about what kind of training
					// this is, and it holds before a single row has been written.
					carriesTss: isCardioDiscipline(track.discipline),
					role: 'ordinary',
					zone: null,
				})
			}
		}

		const ownOf = (trackId: string) =>
			sessions.filter((session) => session.trackId === trackId)
		// Every track's long day first, so each mix is laid around them all.
		for (const track of tracks) markLongDays(ownOf(track.trackId), dayById)
		// Then each mix in turn, around the week as laid so far: a track laid
		// later steps around the hard days of the tracks laid before it.
		for (const track of tracks) {
			if (!isCardioDiscipline(track.discipline)) continue
			const mix =
				week.mixes?.find((entry) => entry.trackId === track.trackId)?.mix ?? []
			const others = sessions.filter(
				(session) => session.trackId !== track.trackId,
			)
			layMix(
				ownOf(track.trackId),
				mix,
				dayById,
				anchorDaysOf(others, dayById, trackById),
			)
		}
		// Last, the lifting slots, against the week as laid (ADR 0104 §3).
		for (const track of tracks) {
			const slots = lifting.filter((slot) => slot.trackId === track.trackId)
			if (slots.length === 0) continue
			layLifting(slots, liftOn, track, week.weekKey, {
				sessions,
				skipped,
				dayById,
				trackById,
			})
		}

		return {
			weekKey: week.weekKey,
			weekInPlan: week.weekInPlan,
			// Back into the week's own order after the per-track walk: a Tuesday swim
			// and a Tuesday run belong beside each other on the reading, not in two
			// columns the athlete has to interleave.
			sessions: sessions.sort(
				(a, b) => a.weekday - b.weekday || a.orderInDay - b.orderInDay,
			),
			skipped: skipped.sort((a, b) => a.weekday - b.weekday),
			tracks: readings,
		}
	})
}

/**
 * The long day of a track's week: every share session whose day weighs the
 * most, where that is more than some other share day weighs. One weight for
 * all (or a single share day) has no long day — a week of equal days has no
 * _Langtur_ to name.
 */
function markLongDays(
	sessions: StampSession[],
	dayById: ReadonlyMap<string, StampDay>,
) {
	const weights = sessions.flatMap((session) => {
		const day = dayById.get(session.dayId)
		return day?.kind === 'share' ? [{ session, weight: day.weight }] : []
	})
	if (weights.length < 2) return
	const heaviest = Math.max(...weights.map((entry) => entry.weight))
	const lightest = Math.min(...weights.map((entry) => entry.weight))
	if (heaviest <= lightest) return
	for (const entry of weights) {
		if (entry.weight === heaviest) entry.session.role = 'long'
	}
}

/**
 * One stamped session as the cross-track day rule reads it (ADR 0104 §1): a
 * strength session as lifting, a track's session by its zone's Effort Word
 * (no zone is _rolig_), a Simple Activity by its own, and the long role as
 * long. The stamp's anchors and the availability fit check read it alike.
 */
export function placedSessionOf(
	session: StampSession,
	day: StampDay | undefined,
	discipline: Discipline | undefined,
): PlacedSession {
	if (discipline === 'strength') {
		return { weekday: session.weekday, kind: 'lifting' }
	}
	const zone = session.zone ?? day?.zone ?? null
	const effort =
		discipline != null && isCardioDiscipline(discipline)
			? zone != null
				? effortWordOfZone(zone)
				: 'rolig'
			: (day?.effort ?? 'rolig')
	return {
		weekday: session.weekday,
		kind: 'session',
		effort,
		long: session.role === 'long',
	}
}

/**
 * The days another track's sessions hold a mix away from (ADR 0104 §2): every
 * **Hard day**, **Long day** and **Lifting day** of theirs, read by the one
 * cross-track day rule.
 */
function anchorDaysOf(
	sessions: readonly StampSession[],
	dayById: ReadonlyMap<string, StampDay>,
	trackById: ReadonlyMap<string, StampTrack>,
): PatternWeekday[] {
	return readDays(placedWeekOf(sessions, dayById, trackById))
		.filter((day) => day.hard || day.long || day.lifting)
		.map((day) => day.weekday)
}

/**
 * The week's sessions as the cross-track day rule reads them: a stamped
 * session by its zone's Effort Word (no zone is _rolig_), a Simple Activity
 * by its own, a strength session as lifting, and a long session as long.
 */
function placedWeekOf(
	sessions: readonly StampSession[],
	dayById: ReadonlyMap<string, StampDay>,
	trackById: ReadonlyMap<string, StampTrack>,
): PlacedSession[] {
	return sessions.map((session) =>
		placedSessionOf(
			session,
			dayById.get(session.dayId),
			trackById.get(session.trackId)?.discipline,
		),
	)
}

/**
 * The days a lift may go on where the athlete never stated their **Training
 * Availability**: the days the pattern already trains on, and where those are
 * fewer than a track's lifts, the starter pattern's stated default week
 * ({@link DEFAULT_TRAINING_WEEKDAYS}) as well — so an athlete who lifts twice
 * a week on a one-run pattern lifts twice, not once. A pattern of no days
 * lifts on any day.
 */
function fallbackLiftingDays(
	days: readonly StampDay[],
	lifting: readonly StampLiftingSlot[],
): PatternWeekday[] {
	if (days.length === 0) return [...PATTERN_WEEKDAYS]
	const own = new Set(days.map((day) => day.weekday))
	const perTrack = new Map<string, number>()
	for (const slot of lifting) {
		perTrack.set(slot.trackId, (perTrack.get(slot.trackId) ?? 0) + 1)
	}
	const most = Math.max(0, ...perTrack.values())
	const pool =
		own.size >= most ? own : new Set([...own, ...DEFAULT_TRAINING_WEEKDAYS])
	return [...pool].sort((a, b) => a - b)
}

/**
 * Lay one strength track's **lifting slots** into the week as laid so far
 * (ADR 0104 §3): on the days `liftingDaysFor` picks by ADR 0103 §2's order —
 * the fewest on a Hard day, then the day before one, then the Long day, then
 * the furthest apart, then the earliest. A day that already lifts (a Pinned
 * lifting day) is not picked again, and fewer days than slots lifts once on
 * each. Each lift comes after the day's endurance session. A slot whose
 * session is gone is reported on its day as `no-prescription`, as a fixed day
 * with no Workout is. Deterministic, so a re-lay lands where the stamp did.
 */
function layLifting(
	slots: readonly StampLiftingSlot[],
	liftOn: readonly PatternWeekday[],
	track: StampTrack,
	weekKey: string,
	{
		sessions,
		skipped,
		dayById,
		trackById,
	}: {
		sessions: StampSession[]
		skipped: StampSkip[]
		dayById: ReadonlyMap<string, StampDay>
		trackById: ReadonlyMap<string, StampTrack>
	},
) {
	const ordered = [...slots].sort(
		(a, b) =>
			(a.orderInDay ?? 0) - (b.orderInDay ?? 0) ||
			a.dayId.localeCompare(b.dayId),
	)
	const picked = liftingDaysFor(
		liftOn,
		placedWeekOf(sessions, dayById, trackById),
		ordered.length,
	)
	picked.forEach((weekday, index) => {
		const slot = ordered[index]!
		const position = {
			dayId: slot.dayId,
			weekKey,
			weekday,
			trackId: track.trackId,
		}
		if (slot.workoutId == null) {
			skipped.push({ ...position, reason: 'no-prescription' })
			return
		}
		const sameDay = sessions.filter((session) => session.weekday === weekday)
		sessions.push({
			...position,
			// After whatever the day already holds.
			orderInDay:
				sameDay.length === 0
					? 0
					: Math.max(...sameDay.map((session) => session.orderInDay)) + 1,
			discipline: track.discipline,
			currency: track.currency,
			kind: 'lifting',
			// A strength session's sets are its Workout's; the `sets` currency
			// prices no prescription (`fixedDayVolume`).
			volume: null,
			sourceWorkoutId: slot.workoutId,
			scale: 1,
			shapeUnscaled: false,
			carriesTss: isCardioDiscipline(track.discipline),
			role: 'ordinary',
			zone: null,
		})
	})
}

/** Days apart on the week's wheel: Sunday and Monday are neighbours. */
function weekdayGap(a: number, b: number): number {
	const apart = Math.abs(a - b)
	return Math.min(apart, 7 - apart)
}

/**
 * Lay the week's **Quality Session Mix** on a track's bare share days.
 *
 * - **What is asked:** the mix, less every fixed or shaped session already in
 *   one of its zones — a fixed threshold session *is* the week's threshold
 *   session, so a share day is not made a second one.
 * - **Where:** ordinary bare share days only, never the long day, and never
 *   more hard days than there are ordinary ones (the rest of the mix is left
 *   to `mixDisagreements` to say, softly, as before). Picked one at a time,
 *   each as far as the week allows from the long day, the fixed quality days,
 *   the days already picked and the `outside` days (every other track's hard,
 *   long and lifting days, ADR 0104 §2), the earlier day on a tie: hard days
 *   apart, with easy days between them. A week with no room still lays the
 *   whole mix, on the days nearest to that.
 * - **Which zone:** hardest first, in the week's order — the earliest hard day
 *   carries the hardest session, and the week eases toward the long day.
 *
 * Nothing moves: a hard day keeps the share it had, so the week still adds up
 * to its target. Deterministic, so a re-lay lands where the stamp did.
 */
function layMix(
	sessions: StampSession[],
	mix: readonly QualitySessionMixEntry[],
	dayById: ReadonlyMap<string, StampDay>,
	outside: readonly PatternWeekday[],
) {
	const asked = new Map<QualityZone, number>()
	for (const entry of mix) {
		if (entry.sessionsPerWeek > 0) {
			asked.set(
				entry.zone,
				(asked.get(entry.zone) ?? 0) + entry.sessionsPerWeek,
			)
		}
	}
	const anchors: number[] = [...outside]
	for (const session of sessions) {
		const day = dayById.get(session.dayId)
		if (session.role === 'long') anchors.push(session.weekday)
		const zone = day?.zone
		if (zone == null || (day?.kind === 'share' && day.workoutId == null))
			continue
		if (!isQualityZone(zone)) continue
		const left = asked.get(zone) ?? 0
		if (left > 0) asked.set(zone, left - 1)
		anchors.push(session.weekday)
	}
	const zones = [...asked]
		.flatMap(([zone, count]) => Array.from({ length: count }, () => zone))
		.sort((a, b) => b - a)
	if (zones.length === 0) return

	const candidates = sessions
		.filter((session) => {
			const day = dayById.get(session.dayId)
			return (
				session.role === 'ordinary' &&
				day?.kind === 'share' &&
				day.workoutId == null
			)
		})
		// In the week's order, so a tie goes to the earlier day.
		.sort((a, b) => a.weekday - b.weekday || a.orderInDay - b.orderInDay)
	const picked: StampSession[] = []
	while (picked.length < zones.length && picked.length < candidates.length) {
		const taken = [...anchors, ...picked.map((session) => session.weekday)]
		let best: StampSession | null = null
		let bestGap = -1
		for (const candidate of candidates) {
			if (picked.includes(candidate)) continue
			const gap =
				taken.length === 0
					? 7
					: Math.min(...taken.map((day) => weekdayGap(day, candidate.weekday)))
			if (gap > bestGap) {
				best = candidate
				bestGap = gap
			}
		}
		if (!best) break
		picked.push(best)
	}
	picked
		.sort((a, b) => a.weekday - b.weekday || a.orderInDay - b.orderInDay)
		.forEach((session, index) => {
			session.zone = zones[index] ?? null
		})
}

/** Why this day writes nothing this week, or `null` when it writes a session. */
function skipReasonFor(
	day: StampDay,
	value: number | null,
	track: StampTrack,
): StampSkipReason | null {
	if (day.kind === 'fixed') {
		// A fixed day is its Workout. An unreadable price is a reading of the
		// prescription and never a reason not to stamp it.
		return day.workoutId == null ? 'no-prescription' : null
	}
	if (value == null) return 'volume-unavailable'
	// A real, derived zero — the week is already spent by the fixed sessions. Said
	// as its own reason, because "your long run has no distance" is not a session
	// and silently writing one would look like the app shrank something.
	if (value <= 0) return 'no-volume-left'
	// A shape is a session already, so it stamps whatever the currency is — it is
	// simply carried across unscaled where the currency cannot price it.
	if (day.workoutId != null) return null
	return isStampableCurrency(track.currency) &&
		isCardioDiscipline(track.discipline)
		? null
		: 'not-prescribable'
}

/**
 * How much of the shape this day takes. `1` for anything that is copied as
 * authored — a fixed day always, and a share day whose shape could not be priced.
 */
function scaleFor(day: StampDay, value: number | null): number {
	if (day.kind !== 'share' || day.workoutId == null) return 1
	if (day.shapeVolume == null || day.shapeVolume <= 0 || value == null) return 1
	return value / day.shapeVolume
}

/**
 * Where a stamped week's actual sessions disagree with its segment's **Quality
 * Session Mix** — one entry per zone the two sides state differently, ascending.
 *
 * Soft by construction: this returns *numbers* and no verdict, because the
 * disagreement is not an error. The mix is authored **intent** and the sessions
 * are the plan's final truth, so deliberately swapping a VO₂ max session for an
 * easy run in a tired week is a valid plan (ADR 0042 §9). Nothing here corrects
 * anything and nothing downstream may.
 *
 * The week's side is read from the **sessions' own content** rather than from a
 * claim a pattern day made about itself: a pattern day carries no zone at all
 * (ADR 0044 §7), so the zone comes off the prescription through
 * `session-profile.ts`. A session whose intensity cannot be truthfully zoned is
 * `null` and counts toward nothing — an unzoned session is not evidence that a
 * zone is missing.
 */
export type MixDisagreement = {
	zone: QualityZone
	/** What the segment's mix asks for. */
	authored: number
	/** How many of the week's sessions read as that zone. */
	stamped: number
}

export function mixDisagreements(
	mix: readonly QualitySessionMixEntry[],
	zones: ReadonlyArray<TrainingZone | null>,
): MixDisagreement[] {
	return QUALITY_ZONES.flatMap((zone) => {
		const authored = mix
			.filter((entry) => entry.zone === zone)
			.reduce((total, entry) => total + entry.sessionsPerWeek, 0)
		const stamped = zones.filter((candidate) => candidate === zone).length
		return authored === stamped ? [] : [{ zone, authored, stamped }]
	})
}

/**
 * What a stamp submits: which pattern, which weeks, and whether the athlete has
 * already been told what would be replaced.
 *
 * Deliberately **not** in `authoring-schema.ts`. Every schema there writes the
 * Plan Outline; this one writes **Workout Sessions**, which are ordinary sessions
 * with no live link back to the pattern (ADR 0044 §6). Keeping it out is what
 * stops a stamp being mistaken for an Outline edit — and it keeps it out of
 * `PlanOutlineUpdateInput`, whose whole job is to enumerate the Outline's writes.
 *
 * `weekKeys` carries no maximum. How many weeks are materialized is the athlete's
 * choice and not a policy the app enforces, so a bound here would be the app
 * quietly having an opinion. Duplicates are collapsed rather than refused: a
 * doubled checkbox is not a different request.
 */
export const WeekPatternStampSchema = z
	.object({
		patternId: z.string().min(1),
		weekKeys: z
			.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
			.min(1, 'Choose at least one week to stamp')
			.transform((keys) => [...new Set(keys)].sort()),
		/**
		 * The athlete has read what would be replaced and said yes. `false` is the
		 * safe default: a body that forgets the field asks for the confirmation
		 * rather than skipping it.
		 */
		replace: z.boolean().default(false),
	})
	.strict()

export type WeekPatternStampInput = z.infer<typeof WeekPatternStampSchema>
