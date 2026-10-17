// The first run's plan before it exists (#505 stories 66–68): its phases, its
// weekly targets, and its first two weeks, day by day.
//
// Read through the **same machinery that creates the plan**, so what the
// athlete is shown is what they get: the family's phases (`openEndedRound` /
// `familySeason` fitted by `fitRunUp`), the derivation over stored-shaped rows
// (`resolvedTracks`), the starter Week Pattern on the chosen days
// (`proposeStarterPattern`), and the stamp's own planner (`planStamp`), which
// is what lays the sessions when the plan is created. Pure; ids are
// placeholders that never reach a database.

import { openEndedRoundName } from '../labels.ts'
import {
	availabilityFitWarnings,
	type AvailabilityFitWarning,
} from '../plan-outline/availability-fit.ts'
import {
	phaseIndexForWeek,
	totalWeeks,
	weekRole,
	type WeekRole,
} from '../plan-outline/derive.ts'
import { fitRunUp } from '../plan-outline/fit-proposal.ts'
import {
	phaseSpecs,
	resolvedTracks,
	type OutlineRows,
} from '../plan-outline/from-rows.ts'
import {
	familySeason,
	openEndedRound,
	type PresetFamily,
	type PresetPhase,
} from '../plan-outline/presets.ts'
import {
	qualitySessionCount,
	type QualitySessionMixEntry,
} from '../plan-outline/quality-mix.ts'
import {
	planStamp,
	type StampDay,
	type StampWeekPlan,
} from '../plan-outline/stamp.ts'
import {
	proposeStarterPattern,
	type StarterDay,
} from '../plan-outline/starter-pattern.ts'
import { weekKeyAt } from '../plan-outline/week-keys.ts'
import {
	calendarWeekdaysOf,
	type PatternWeekday,
} from '../plan-outline/week-pattern.ts'
import { type CardioDiscipline } from '../workout-schema.ts'

/** What the plan is toward: nothing (rounds), or a race this many weeks out. */
export type DraftGoal = { kind: 'active' } | { kind: 'event'; weeks: number }

/**
 * The phases the first run lays for a family: one round of it for _Hold meg
 * aktiv_, or its season fitted to the weeks up to and including the race
 * week. Null where no week is left to lay toward the race.
 */
export function firstRunPhases(
	family: PresetFamily,
	goal: DraftGoal,
): PresetPhase[] | null {
	if (goal.kind === 'active') {
		const round = openEndedRound(family)
		return [{ name: openEndedRoundName(1), tapers: false, ...round }]
	}
	return fitRunUp(familySeason(family), goal.weeks)
}

/**
 * One **Training Track** the first run lays: an endurance Discipline in
 * hours, the hours a week the athlete trains it **now** (its **Season
 * Anchor**, owner decision 15, round 2), the days it may lay on, and whether
 * it carries the family's **Quality Session Mix** or none at all (easy
 * sessions only: a second endurance sport beside the main one, #558).
 */
export type DraftTrack = {
	discipline: CardioDiscipline
	weeklyHours: number
	/** Monday-first weekdays this track may lay on. */
	days: readonly PatternWeekday[]
	mix: 'family' | 'none'
}

/** A track as the draft laid it, in the shape the plan writer takes it. */
export type DraftedTrack = {
	/** A placeholder id, the one the draft's rows, pattern and weeks use. */
	trackId: string
	discipline: CardioDiscipline
	currency: 'hours'
	/** The track's first week, in hours: the hours given for it. */
	anchor: number
	mix: 'family' | 'none'
	/**
	 * The days the track lays sessions on: its days, cut to what its hours can
	 * fill without a session under half an hour, and to six
	 * ({@link patternDaysFor}).
	 */
	patternDays: PatternWeekday[]
	/** Every plan week's target for this track in hours, earliest first. */
	targets: Array<number | null>
}

/** The placeholder id of the draft's first Training Track. */
export const DRAFT_TRACK_ID = 'first-run-track'

function draftTrackId(index: number): string {
	return index === 0 ? DRAFT_TRACK_ID : `${DRAFT_TRACK_ID}-${index}`
}

/**
 * The stored rows the plan will have, in the shape the derivation reads:
 * the phases once, and every track over them, each segment carrying the
 * phase's climb and, on a track that carries the family's mix, its mix.
 */
export function draftRows({
	phases,
	startWeekKey,
	tracks,
}: {
	phases: readonly PresetPhase[]
	startWeekKey: string
	tracks: ReadonlyArray<
		Pick<DraftedTrack, 'trackId' | 'discipline' | 'anchor' | 'mix'>
	>
}): OutlineRows {
	return {
		startWeekKey,
		phases: phases.map((phase, orderIndex) => ({
			id: `phase-${orderIndex}`,
			orderIndex,
			name: phase.name,
			weeks: phase.weeks,
			rhythm: phase.rhythm,
			tapers: phase.tapers,
		})),
		tracks: tracks.map((track) => ({
			id: track.trackId,
			discipline: track.discipline,
			currency: 'hours',
			anchors: [{ fromWeekKey: startWeekKey, value: track.anchor }],
			segments: phases.map((phase, index) => ({
				id: `${track.trackId}-segment-${index}`,
				kind: 'endurance',
				phaseId: `phase-${index}`,
				ramp: phase.ramp,
				boundaryStep: phase.boundaryStep,
				recoveryCut: null,
				taperCut: null,
				startWeekKey: null,
				weeks: null,
				goal: null,
				sessionsPerWeek: null,
				deloadCut: null,
				deloadWeeks: null,
				mix:
					track.mix === 'family'
						? phase.mix.map((entry) => ({ ...entry }))
						: [],
			})),
			overrides: [],
		})),
	}
}

export type DraftWeek = StampWeekPlan & {
	role: WeekRole
	/** The week's target in hours, or null where the derivation cannot price it. */
	target: number | null
	/** What the week's sessions add up to, in hours. */
	planned: number
}

export type FirstRunDraft = {
	/**
	 * The plan's phases. Their mix is the one every track that carries the
	 * family's mix lays: cut to the days of the first such track.
	 */
	phases: PresetPhase[]
	rows: OutlineRows
	/** Every track the plan will have, in the order they were given. */
	tracks: DraftedTrack[]
	/**
	 * The first week's target in hours across the tracks. Each track's
	 * **Season Anchor** is the hours the athlete trains it now (owner decision
	 * 15, round 2); the family's climb starts from them, so later weeks ask
	 * for more.
	 */
	anchor: number
	/** Every plan week's target in hours across the tracks, earliest first. */
	targets: Array<number | null>
	/**
	 * The days the plan lays sessions on, across the tracks: each track's
	 * days, cut to what its hours can fill without a session under half an
	 * hour, and to six ({@link patternDaysFor}). The chosen days stay the
	 * athlete's availability.
	 */
	patternDays: PatternWeekday[]
	/** The starter pattern's days: each track's days, its last one long. */
	pattern: StarterDay[]
	/** The plan's first two weeks, as the stamp lays them. */
	weeks: DraftWeek[]
	/**
	 * Where the plan's hard sessions outnumber the chosen days. Empty by
	 * construction (`mixWithinDays`); read back so tests can hold it to that.
	 */
	dayWarnings: AvailabilityFitWarning[]
}

/** How many weeks the first run shows and lays at once (story 68). */
export const FIRST_RUN_WEEKS = 2

/**
 * A phase's **Quality Session Mix** cut to fit the athlete's days: one hard
 * session fewer at a time, taken from the zone that asks for the most (the
 * harder zone on a tie), until the week asks for no more hard sessions than
 * there are days — equality is a plan, not a warning (ADR 0047 §4). A mix
 * that fits comes back as it is.
 */
export function mixWithinDays(
	mix: readonly QualitySessionMixEntry[],
	days: number,
): QualitySessionMixEntry[] {
	const fitted = mix.map((entry) => ({ ...entry }))
	while (fitted.length > 0 && qualitySessionCount(fitted) > days) {
		const most = fitted.reduce((top, entry) =>
			entry.sessionsPerWeek > top.sessionsPerWeek ||
			(entry.sessionsPerWeek === top.sessionsPerWeek && entry.zone > top.zone)
				? entry
				: top,
		)
		most.sessionsPerWeek -= 1
		if (most.sessionsPerWeek === 0) fitted.splice(fitted.indexOf(most), 1)
	}
	return fitted
}

/** The heaviest week's target, or null where no week is priced. */
export function peakOf(targets: ReadonlyArray<number | null>): number | null {
	const priced = targets.filter((value): value is number => value != null)
	return priced.length === 0 ? null : Math.max(...priced)
}

/**
 * The shortest session the first run lays: half an hour. Below it a session
 * is not training anyone would put on a calendar ("Langtur · 6 min" at 0,5 t
 * spread over four days, round-2 break-ui).
 */
export const MIN_SESSION_HOURS = 0.5

/**
 * The most days a week the first run lays sessions on: six. Seven chosen days
 * still leave one to rest — the day after the long one — because a plan with
 * no easy day at all is not one the app should propose (round-2 break-ui).
 * The athlete can add the seventh in Sesong; their availability keeps all of
 * the days they chose.
 */
export const MAX_SESSION_DAYS = 6

/**
 * How many sessions `hours` can be spread over with no session under
 * {@link MIN_SESSION_HOURS}: the starter pattern weighs the long day double
 * (`proposeStarterPattern`), so `n` days are `n + 1` shares, and the shortest
 * is `hours / (n + 1)` — one day is the whole week.
 */
function sessionsFor(hours: number): number {
	let count = 1
	while (hours / (count + 2) >= MIN_SESSION_HOURS) count += 1
	return count
}

/** Days apart on the week's wheel: Sunday and Monday are neighbours. */
function weekdayGap(a: number, b: number): number {
	const apart = Math.abs(a - b)
	return Math.min(apart, 7 - apart)
}

/** The gaps between neighbouring days, round the week. */
function gapsOf(days: readonly number[]): number[] {
	if (days.length < 2) return [7]
	return days.map((day, index) =>
		weekdayGap(day, days[(index + 1) % days.length]!),
	)
}

/**
 * How evenly apart a set of days is, higher is better: the smallest gap
 * first, then how few neighbours sit that close — so four days out of seven
 * are Tuesday, Thursday, Saturday and Sunday rather than four in a row.
 */
function spreadScore(days: readonly number[]): [number, number] {
	const gaps = gapsOf(days)
	const tightest = Math.min(...gaps)
	return [tightest, -gaps.filter((gap) => gap === tightest).length]
}

/**
 * The days the plan lays sessions on: the chosen days, cut to what the hours
 * can fill ({@link sessionsFor}), to {@link MAX_SESSION_DAYS} and to the
 * level's session cap where there is one (a _Nybegynner_ gets four). The last
 * chosen day — the long one — always stays; the others go one at a time, each
 * time the one whose going leaves the remaining days most evenly apart
 * ({@link spreadScore}), the earliest on a tie (so seven days lose Monday, the
 * day after Sunday's long run). Monday-first and sorted, as the days came in.
 */
export function patternDaysFor(
	days: readonly PatternWeekday[],
	hours: number,
	sessionCap: number = MAX_SESSION_DAYS,
): PatternWeekday[] {
	const sorted = [...new Set(days)].sort((a, b) => a - b)
	const keep = Math.max(
		1,
		Math.min(sorted.length, MAX_SESSION_DAYS, sessionCap, sessionsFor(hours)),
	)
	const long = sorted.at(-1)
	const kept = [...sorted]
	while (kept.length > keep) {
		let drop: PatternWeekday | null = null
		let best: [number, number] | null = null
		for (const day of kept) {
			if (day === long) continue
			const score = spreadScore(kept.filter((other) => other !== day))
			if (
				best == null ||
				score[0] > best[0] ||
				(score[0] === best[0] && score[1] > best[1])
			) {
				best = score
				drop = day
			}
		}
		if (drop == null) break
		kept.splice(kept.indexOf(drop), 1)
	}
	return kept
}

/** The one-track answers: a Discipline, its hours and the days. */
type OneTrackAnswers = {
	discipline: CardioDiscipline
	/**
	 * The hours a week the athlete trains **now** (owner decision 15, round
	 * 2): the plan's first week, and where the family's climb starts. It was
	 * a ceiling once, which started a 4 t runner on 2,5 t.
	 */
	weeklyHours: number
	/** Monday-first weekdays the athlete can train. */
	days: readonly PatternWeekday[]
}

/**
 * The whole draft, or null where there is nothing to lay: no phase toward a
 * race this close, no track, or a track with no day.
 *
 * Takes the tracks the plan will have, or, as the first run reads today, one
 * Discipline with its hours and days: one track carrying the family's mix.
 * Every track goes through the same machinery: its days cut to its hours,
 * the starter pattern on those days with its long day last, and the stamp
 * laying each week's targets and mixes.
 */
export function draftFirstRunPlan(
	input: {
		family: PresetFamily
		goal: DraftGoal
		startWeekKey: string
		/**
		 * The most sessions a week the athlete's **Training Level** allows
		 * (`levelDefaults`), or none beyond {@link MAX_SESSION_DAYS}. Each
		 * track's days are cut to it.
		 */
		sessionCap?: number
	} & (OneTrackAnswers | { tracks: readonly DraftTrack[] }),
): FirstRunDraft | null {
	const { family, goal, startWeekKey, sessionCap } = input
	const given: readonly DraftTrack[] =
		'tracks' in input
			? input.tracks
			: [
					{
						discipline: input.discipline,
						weeklyHours: input.weeklyHours,
						days: input.days,
						mix: 'family',
					},
				]
	const familyPhases = firstRunPhases(family, goal)
	if (!familyPhases || given.length === 0) return null
	if (given.some((track) => track.days.length === 0)) return null

	const laid = given.map((track, index) => ({
		trackId: draftTrackId(index),
		discipline: track.discipline,
		currency: 'hours' as const,
		anchor: track.weeklyHours,
		mix: track.mix,
		patternDays: patternDaysFor(track.days, track.weeklyHours, sessionCap),
	}))
	// Hard sessions go on ordinary days, never the long one (`planStamp`), so
	// the mix is cut to the pattern's days less the long day: the days of the
	// first track that carries it, since the phases hold one mix.
	const mixDays =
		laid.find((track) => track.mix === 'family')?.patternDays.length ?? 0
	const hardDays = mixDays > 1 ? mixDays - 1 : 0
	const phases = familyPhases.map((phase) => ({
		...phase,
		mix: mixWithinDays(phase.mix, hardDays),
	}))
	const rows = draftRows({ phases, startWeekKey, tracks: laid })
	const resolved = resolvedTracks(rows)
	const readingOf = (trackId: string) =>
		resolved.find((reading) => reading.trackId === trackId)
	const tracks: DraftedTrack[] = laid.map((track) => ({
		...track,
		targets:
			readingOf(track.trackId)?.targets.map((target) => target.value) ?? [],
	}))
	if (tracks.some((track) => track.targets.length === 0)) return null
	const targets = tracks[0]!.targets.map((_, week) =>
		sumOrNull(tracks.map((track) => track.targets[week] ?? null)),
	)
	const patternDays = [
		...new Set(tracks.flatMap((track) => track.patternDays)),
	].sort((a, b) => a - b)

	const starter = proposeStarterPattern({
		trainableWeekdays: calendarWeekdaysOf(patternDays),
		tracks: tracks.map((track) => ({
			trackId: track.trackId,
			discipline: track.discipline,
			sessionsPerWeek: null,
			weekdays: track.patternDays,
		})),
	})
	if (!starter) return null

	// Numbered per weekday as `createStarterWeekPattern` writes them.
	const placed = new Map<number, number>()
	const stampDays: StampDay[] = starter.days.map((day, index) => {
		const orderInDay = placed.get(day.weekday) ?? 0
		placed.set(day.weekday, orderInDay + 1)
		return {
			dayId: `day-${index}`,
			weekday: day.weekday,
			orderInDay,
			trackId: day.trackId,
			kind: 'share',
			weight: day.weight,
			workoutId: null,
			shapeVolume: null,
		}
	})

	const specs = phaseSpecs(rows)
	const shown = Math.min(FIRST_RUN_WEEKS, totalWeeks(specs))
	const planned = planStamp({
		days: stampDays,
		tracks: tracks.map((track) => ({
			trackId: track.trackId,
			discipline: track.discipline,
			currency: track.currency,
		})),
		weeks: Array.from({ length: shown }, (_, index) => ({
			weekKey: weekKeyAt(startWeekKey, index),
			weekInPlan: index + 1,
			targets: tracks.map((track) => ({
				trackId: track.trackId,
				value: track.targets[index] ?? null,
			})),
			// The week's segment's mix, read as the stamp reads it, so the hard
			// sessions shown are the hard sessions laid.
			mixes: tracks.map((track) => ({
				trackId: track.trackId,
				mix:
					readingOf(track.trackId)?.segments.find(
						(segment) => segment.phaseIndex === phaseIndexForWeek(specs, index),
					)?.mix ?? [],
			})),
		})),
	})

	return {
		phases,
		rows,
		tracks,
		anchor: tracks.reduce((sum, track) => sum + track.anchor, 0),
		targets,
		patternDays,
		pattern: starter.days,
		weeks: planned.map((week, index) => ({
			...week,
			role: weekRole(specs, index),
			target: targets[index] ?? null,
			planned: week.sessions.reduce(
				(sum, session) => sum + (session.volume ?? 0),
				0,
			),
		})),
		dayWarnings: availabilityFitWarnings(
			specs,
			resolved.flatMap((reading) =>
				reading.segments.map((segment) => ({
					kind: 'endurance' as const,
					phaseIndex: segment.phaseIndex,
					mix: segment.mix,
				})),
			),
			new Set(given.flatMap((track) => track.days)).size,
		),
	}
}

/** The sum, or null where any part is unpriced. */
function sumOrNull(values: ReadonlyArray<number | null>): number | null {
	let sum = 0
	for (const value of values) {
		if (value == null) return null
		sum += value
	}
	return sum
}
