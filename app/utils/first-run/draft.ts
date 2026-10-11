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

/** The one Training Track the first run authors: endurance, in hours. */
export const DRAFT_TRACK_ID = 'first-run-track'

/** The stored rows the plan will have, in the shape the derivation reads. */
export function draftRows({
	phases,
	startWeekKey,
	discipline,
	weeklyHours,
}: {
	phases: readonly PresetPhase[]
	startWeekKey: string
	discipline: CardioDiscipline
	weeklyHours: number
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
		tracks: [
			{
				id: DRAFT_TRACK_ID,
				discipline,
				currency: 'hours',
				anchors: [{ fromWeekKey: startWeekKey, value: weeklyHours }],
				segments: phases.map((phase, index) => ({
					id: `segment-${index}`,
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
					mix: phase.mix.map((entry) => ({ ...entry })),
				})),
				overrides: [],
			},
		],
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
	phases: PresetPhase[]
	rows: OutlineRows
	/**
	 * The first week's target in hours — the track's **Season Anchor**: the
	 * hours the athlete trains now (owner decision 15, round 2). The family's
	 * climb starts from it, so later weeks ask for more.
	 */
	anchor: number
	/** Every plan week's target in hours, earliest first. */
	targets: Array<number | null>
	/**
	 * The days the plan lays sessions on: the chosen days, cut to what the
	 * hours can fill without a session under half an hour, and to six
	 * ({@link patternDaysFor}). The chosen days stay the athlete's availability.
	 */
	patternDays: PatternWeekday[]
	/** The starter pattern's days: the pattern days, the last one long. */
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

/** The smallest gap between neighbouring days, round the week. */
function tightestGap(days: readonly number[]): number {
	if (days.length < 2) return 7
	return Math.min(
		...days.map((day, index) =>
			weekdayGap(day, days[(index + 1) % days.length]!),
		),
	)
}

/**
 * The days the plan lays sessions on: the chosen days, cut to what the hours
 * can fill ({@link sessionsFor}) and to {@link MAX_SESSION_DAYS}. The last
 * chosen day — the long one — always stays; the others go one at a time, each
 * time the one whose going leaves the remaining days most evenly apart, the
 * earliest on a tie (so seven days lose Monday, the day after Sunday's long
 * run). Monday-first and sorted, as the days came in.
 */
export function patternDaysFor(
	days: readonly PatternWeekday[],
	hours: number,
): PatternWeekday[] {
	const sorted = [...new Set(days)].sort((a, b) => a - b)
	const keep = Math.max(
		1,
		Math.min(sorted.length, MAX_SESSION_DAYS, sessionsFor(hours)),
	)
	const long = sorted.at(-1)
	const kept = [...sorted]
	while (kept.length > keep) {
		let drop: PatternWeekday | null = null
		let best = -1
		for (const day of kept) {
			if (day === long) continue
			const gap = tightestGap(kept.filter((other) => other !== day))
			if (gap > best) {
				best = gap
				drop = day
			}
		}
		if (drop == null) break
		kept.splice(kept.indexOf(drop), 1)
	}
	return kept
}

/**
 * The whole draft, or null where there is nothing to lay: no phase toward a
 * race this close, or no day chosen.
 */
export function draftFirstRunPlan({
	family,
	goal,
	startWeekKey,
	discipline,
	weeklyHours,
	days,
}: {
	family: PresetFamily
	goal: DraftGoal
	startWeekKey: string
	discipline: CardioDiscipline
	/**
	 * The hours a week the athlete trains **now** (owner decision 15, round
	 * 2): the plan's first week, and where the family's climb starts. It was
	 * a ceiling once, which started a 4 t runner on 2,5 t.
	 */
	weeklyHours: number
	/** Monday-first weekdays the athlete can train. */
	days: readonly PatternWeekday[]
}): FirstRunDraft | null {
	const familyPhases = firstRunPhases(family, goal)
	if (!familyPhases || days.length === 0) return null
	const patternDays = patternDaysFor(days, weeklyHours)
	// Hard sessions go on ordinary days, never the long one (`planStamp`), so
	// the mix is cut to the pattern's days less the long day.
	const hardDays = patternDays.length > 1 ? patternDays.length - 1 : 0
	const phases = familyPhases.map((phase) => ({
		...phase,
		mix: mixWithinDays(phase.mix, hardDays),
	}))
	const anchor = weeklyHours
	const rows = draftRows({
		phases,
		startWeekKey,
		discipline,
		weeklyHours: anchor,
	})
	const [track] = resolvedTracks(rows)
	if (!track) return null
	const targets = track.targets.map((target) => target.value)

	const starter = proposeStarterPattern({
		trainableWeekdays: calendarWeekdaysOf(patternDays),
		tracks: [{ trackId: DRAFT_TRACK_ID, discipline, sessionsPerWeek: null }],
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
		tracks: [{ trackId: DRAFT_TRACK_ID, discipline, currency: 'hours' }],
		weeks: Array.from({ length: shown }, (_, index) => ({
			weekKey: weekKeyAt(startWeekKey, index),
			weekInPlan: index + 1,
			targets: [{ trackId: DRAFT_TRACK_ID, value: targets[index] ?? null }],
			// The week's segment's mix, read as the stamp reads it, so the hard
			// sessions shown are the hard sessions laid.
			mixes: [
				{
					trackId: DRAFT_TRACK_ID,
					mix:
						track.segments.find(
							(segment) =>
								segment.phaseIndex === phaseIndexForWeek(specs, index),
						)?.mix ?? [],
				},
			],
		})),
	})

	return {
		phases,
		rows,
		anchor,
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
			track.segments.map((segment) => ({
				kind: 'endurance' as const,
				phaseIndex: segment.phaseIndex,
				mix: segment.mix,
			})),
			days.length,
		),
	}
}
