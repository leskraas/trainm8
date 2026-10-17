/**
 * The words a week carries on I dag (#505 S9, ADR 0082, ADR 0086): its name,
 * its three numbers per Training Track, its load line and what a week past
 * the horizon says about when it is filled — put on
 * the pure week model's numbers and codes (`week-volumes.ts`) here, at the
 * edge, so the model stays free of language (ADR 0081).
 *
 * Kept apart from `presenter.ts`, which decides what a week *is* (its days and
 * its shape); this module only decides what it *says*.
 */
import { addDays, isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import {
	formatLoad,
	formatNbPercent,
	formatNbVolumeFigure,
	formatPace,
	formatTss,
} from '#app/utils/format.ts'
import {
	averagePaceLabel,
	DRIFT_MARK_LABEL,
	easyShareLabel,
	horizonFillLabel,
	missedCountLabel,
	nbTrackName,
	NB_VOLUME_UNITS,
	FAR_WEEK_LABEL,
	NOT_FILLED_LABEL,
	OF_WORD,
	sessionCountLabel,
	sessionsAgainstLabel,
	sessionsDoneLabel,
	sidedUnmeasuredLabel,
	strengthPartialLabel,
	ungradedNoteLabel,
	unmeasuredFigureLabel,
	VOLUME_GRADE_LABELS,
	WEEK_FIGURE_LABELS,
	WEEK_LOAD_LABELS,
	ZONE_INTENT_NOTE,
	zoneSplitLabel,
} from '#app/utils/labels.ts'
import {
	type TrackWeekVolume,
	type ZoneSplit,
} from '#app/utils/plan-outline/week-volumes.ts'

/**
 * One track's week as the header reads it: the pure model's numbers and codes,
 * with the words put on.
 */
export type TimelineTrackWeek = TrackWeekVolume & {
	/**
	 * `planlagt +2 uten km` — sessions with no number beside a planned sum that
	 * exists, said with its side (#505 story 34). Null when every planned
	 * session has a number, or when none has and the figure's place says so
	 * (`figureNotes.planned`).
	 */
	plannedUnmeasuredLabel: string | null
	/** `gjort +1 uten km`, by the same rule over the done sessions. */
	actualUnmeasuredLabel: string | null
	/** `til og med torsdag · resten ikke målt`, or null. */
	partialLabel: string | null
	/** `hensikt, ikke en måling` beside a planned zone split, or null. */
	zoneIntentNote: string | null
	/** `Løping` — the track's sport. */
	name: string
	/** `km`, `t`, `TSS`, `sett` — said once, after the three figures. */
	unit: string
	/**
	 * The three numbers, side by side (#505 story 23): `mål 46 · planlagt 44 ·
	 * gjort 35`, with a decimal comma (`10,4`). A figure the week cannot state
	 * is null, never `0`.
	 */
	figures: {
		target: string | null
		planned: string | null
		done: string | null
	}
	/**
	 * What stands in a figure's place when the side has sessions but not one of
	 * them has a number in the unit — `2 økter uten km` — so the header never
	 * says `planlagt –` (nothing planned) over a week with sessions planned in
	 * it. Null where the figure states a sum, or where there is nothing to say.
	 */
	figureNotes: {
		planned: string | null
		done: string | null
	}
	/** `under`, `i rute`, `over` — the verdict, once a day of the week is past. */
	gradeLabel: string | null
	/**
	 * Why a week that could be graded is not, worded so it agrees with the done
	 * figure beside it (`ungradedNoteLabel`). Said quietly beside the numbers
	 * rather than as a verdict.
	 */
	gradeNote: string | null
	/**
	 * The `≠` mark's meaning when planned is more than 10 % off target — and
	 * only on a week with something in it: a week nothing is written in is not
	 * overplanned or underplanned, it is unwritten.
	 */
	driftLabel: string | null
	/** `1 av 2 økter` on a strength track. */
	sessionsLabel: string | null
	/** `snitt 5:00 /km` on a km track with a pace to state. */
	paceLabel: string | null
	/**
	 * `rolig 78 % · plan 80 %` — the easy share, on an endurance track read in
	 * km or TSS. Null on an hours track, which carries the whole split instead.
	 */
	zoneLabel: string | null
	/**
	 * The whole zone split, on an hours track (#505 story 21 — a skier reads
	 * hours and zones): `gjort Z2 75 % · Z4 25 %` and `plan Z2 86 % · Z4 14 %`,
	 * the planned side always beside {@link zoneIntentNote}. Null elsewhere, or
	 * where neither side has zoned time.
	 */
	zoneSplit: { done: string | null; planned: string | null } | null
	/**
	 * Whether the week has anything to say on this track: a target, something
	 * planned or something done. A track with none of the three is a line of
	 * zeros, so the header leaves it out — the same rule the strip's lifting
	 * dot is drawn by (`trackHasFigures`).
	 */
	hasFigures: boolean
}

/** A target, a plan or a deed above zero — the rule a track is shown by. */
export function trackHasFigures(track: TrackWeekVolume): boolean {
	return (
		(track.target ?? 0) > 0 ||
		(track.planned ?? 0) > 0 ||
		(track.actual ?? 0) > 0
	)
}

/**
 * The track a one-line week, the strip and the season table are read in: the
 * first that is not counted in sets. A season's shape is its endurance volume;
 * a lifting week reads as a dot beside it rather than as a second bar in
 * another unit, which would be an exchange rate between km and sets that does
 * not exist (ADR 0043).
 */
export function leadTrack<T extends { currency: string }>(
	tracks: readonly T[],
): T | null {
	return tracks.find((track) => track.currency !== 'sets') ?? tracks[0] ?? null
}

export { relativeWeekName } from '#app/utils/relative-week.ts'

/**
 * The words a track's week header carries, put on the model's codes.
 *
 * Each track says one consistent thing (#505 S9 review, D7): a side whose
 * sessions all lack a number says so in the figure's place rather than with a
 * dash that reads as "nothing planned"; a side with a sum and some sessions
 * without one says the count with its side named; and the ungraded note names
 * what is missing — the measurement, or the plan's number to hold it against.
 */
export function wordTrackWeek(
	track: TrackWeekVolume,
	{ ahead, hasSessions }: { ahead: boolean; hasSessions: boolean },
): TimelineTrackWeek {
	const figure = (value: number | null) =>
		value == null ? null : formatNbVolumeFigure(value, track.currency)
	const status = track.grade.status
	// A side's unmeasured count goes in the figure's place when there is no sum
	// to put it beside, and beside the sum, its side named, when there is.
	const inPlace = (sum: number | null, count: number) =>
		sum == null && count > 0
			? unmeasuredFigureLabel(count, track.currency)
			: null
	const beside = (
		side: 'planned' | 'done',
		sum: number | null,
		count: number,
	) =>
		sum != null && count > 0
			? sidedUnmeasuredLabel(side, count, track.currency)
			: null
	const zones = track.zones?.done || track.zones?.planned ? track.zones : null
	// A skier reads hours and the zone split (story 21); a km or TSS track keeps
	// the easy share, which says the same thing in a shorter line.
	const wholeSplit = track.currency === 'hours'
	return {
		...track,
		name: nbTrackName(track.discipline),
		unit: NB_VOLUME_UNITS[track.currency],
		figures: {
			target: figure(track.target),
			planned: figure(track.planned),
			// A week wholly ahead has done nothing yet, and "gjort 0" says less
			// than an empty place where the number will be.
			done: ahead ? null : figure(track.actual),
		},
		figureNotes: {
			planned: inPlace(track.planned, track.plannedUnmeasuredCount),
			done: ahead ? null : inPlace(track.actual, track.actualUnmeasuredCount),
		},
		gradeLabel:
			status === 'under' || status === 'on' || status === 'over'
				? VOLUME_GRADE_LABELS[status]
				: null,
		gradeNote:
			status === 'ungraded'
				? ungradedNoteLabel(track.currency, track.actual)
				: null,
		driftLabel:
			hasSessions && track.driftMark === true ? DRIFT_MARK_LABEL : null,
		sessionsLabel:
			track.currency === 'sets' &&
			(track.sessions.target ?? track.sessions.planned) > 0
				? sessionsAgainstLabel(
						track.sessions.done,
						track.sessions.target ?? track.sessions.planned,
					)
				: null,
		paceLabel:
			track.pace?.actualSecPerKm != null
				? averagePaceLabel(formatPace(track.pace.actualSecPerKm))
				: null,
		zoneLabel:
			zones && !wholeSplit
				? easyShareLabel(
						zones.done ? formatNbPercent(zones.done.easyShare) : null,
						zones.planned ? formatNbPercent(zones.planned.easyShare) : null,
					)
				: null,
		zoneSplit:
			zones && wholeSplit
				? {
						done: zones.done
							? zoneSplitLabel('done', zoneShares(zones.done))
							: null,
						planned: zones.planned
							? zoneSplitLabel('planned', zoneShares(zones.planned))
							: null,
					}
				: null,
		plannedUnmeasuredLabel: beside(
			'planned',
			track.planned,
			track.plannedUnmeasuredCount,
		),
		actualUnmeasuredLabel: ahead
			? null
			: beside('done', track.actual, track.actualUnmeasuredCount),
		partialLabel: track.partial
			? strengthPartialLabel(track.partial.measuredThroughWeekday)
			: null,
		zoneIntentNote: track.zones?.planned ? ZONE_INTENT_NOTE : null,
		hasFigures: trackHasFigures(track),
	}
}

/**
 * A zone split's shares in whole percent, zone 1 first, the zones with no time
 * left out. Rounded by largest remainder, so the shares a reader adds up come
 * to 100 rather than 99 or 101.
 */
export function zoneShares(
	split: ZoneSplit,
): Array<{ zone: number; share: string }> {
	const total = split.secondsByZone.reduce((a, b) => a + b, 0)
	if (total <= 0) return []
	const exact = split.secondsByZone.map((seconds) => (seconds / total) * 100)
	const whole = exact.map((value) => Math.floor(value))
	let left = 100 - whole.reduce((a, b) => a + b, 0)
	const byRemainder = exact
		.map((value, index) => ({ index, remainder: value - whole[index]! }))
		.sort((a, b) => b.remainder - a.remainder)
	for (const { index } of byRemainder) {
		if (left <= 0) break
		whole[index] = whole[index]! + 1
		left -= 1
	}
	return whole.flatMap((percent, index) =>
		percent > 0
			? [{ zone: index + 1, share: formatNbPercent(percent / 100) }]
			: [],
	)
}

/**
 * What a week past the Planning Horizon says under its numbers (#505 story
 * 27): when it is filled — `fylles søndag kveld i uke 41`.
 *
 * That is the week change's own rule, stated as a time: a close (Sunday 20:00
 * in the Athlete Timezone) fills the week after next (`horizonWeekKey`), so
 * this week is filled the Sunday evening its week-before-last closes. A plan
 * with no Week Pattern has nothing to fill from, and says so rather than
 * promising; a week past any plan says only the athlete's sessions will be
 * there.
 */
export function beyondWeekNote({
	monday,
	fillsWeeks,
	far = false,
}: {
	monday: string
	fillsWeeks: boolean
	/** Past any plan: nothing will fill it, only what the athlete writes. */
	far?: boolean
}): string {
	return far
		? FAR_WEEK_LABEL
		: fillsWeeks
			? horizonFillLabel(isoWeekNumber(addDays(monday, -14)))
			: NOT_FILLED_LABEL
}

/**
 * The week's sessions and load in the header's Norwegian — what a week with no
 * Training Track to be read in carries as its numbers, and every week's
 * one-sentence summary under its tracks (ADR 0086). Three
 * readings, because a week in the past and a week still to come are not the
 * same question: history counts what was done, the future counts what is
 * asked for, and an imported week counts only sessions, since there was never
 * a plan to count them against.
 */
export function weekLoadLine({
	imported,
	past,
	isNow,
	total,
	done,
	missed,
	doneTss,
	plannedTss,
	unplannedLoad = false,
}: {
	imported: boolean
	past: boolean
	isNow: boolean
	total: number
	done: number
	missed: number
	doneTss: number | null
	plannedTss: number | null
	/**
	 * Some of the done load came from sessions with no Planned TSS, so the
	 * done sum is not a share of the planned one (see `loadClause`).
	 */
	unplannedLoad?: boolean
}): string {
	if (total === 0) {
		if (plannedTss != null) {
			return join(WEEK_LOAD_LABELS.nothingWritten, formatTss(plannedTss))
		}
		return past
			? WEEK_LOAD_LABELS.nothingLogged
			: WEEK_LOAD_LABELS.nothingWritten
	}
	if (imported) {
		return join(
			sessionCountLabel(total),
			doneTss != null ? formatTss(doneTss) : null,
		)
	}
	if (past || isNow) {
		return join(
			sessionsDoneLabel(done, total),
			missed > 0 ? missedCountLabel(missed) : null,
			loadClause(doneTss, plannedTss, unplannedLoad),
		)
	}
	return join(
		`${sessionCountLabel(total)} ${WEEK_FIGURE_LABELS.planned}`,
		loadClause(null, plannedTss),
	)
}

/**
 * `48 av 312 TSS`, or whichever single side exists. Never a zero-filled pair.
 *
 * `av` only where the done load is a share of the planned: when every session
 * that carries done load also carried a Planned TSS. Otherwise the two sides
 * are two different sets of sessions — a run the athlete added, a lifting
 * session with no planned figure, an import — and the line names each side
 * instead (`gjort 176 · planlagt 85 TSS`), the way the track lines above it
 * do, so it never reads as a week done twice over.
 */
function loadClause(
	doneTss: number | null,
	plannedTss: number | null,
	unplannedLoad = false,
): string | null {
	if (doneTss != null && plannedTss != null) {
		return unplannedLoad
			? `${WEEK_FIGURE_LABELS.done} ${formatLoad(doneTss)} · ${WEEK_FIGURE_LABELS.planned} ${formatTss(plannedTss)}`
			: `${formatLoad(doneTss)} ${OF_WORD} ${formatTss(plannedTss)}`
	}
	if (doneTss != null) return formatTss(doneTss)
	if (plannedTss != null) return formatTss(plannedTss)
	return null
}

/** Joins the parts that exist with the house separator. */
export function join(...parts: Array<string | null>): string {
	return parts.filter((part): part is string => !!part).join(' · ')
}
