/**
 * The words a week carries on I dag (#505 S9, ADR 0082): its name, its three
 * numbers per Training Track, its one-line folds and its load line — put on
 * the pure week model's numbers and codes (`week-volumes.ts`) here, at the
 * edge, so the model stays free of language (ADR 0081).
 *
 * Kept apart from `presenter.ts`, which decides what a week *is* (its days, its
 * shape, its bands); this module only decides what it *says*.
 */
import { addDays, isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import {
	formatLoad,
	formatPace,
	formatPercent,
	formatTss,
	formatVolumeFigure,
} from '#app/utils/format.ts'
import {
	averagePaceLabel,
	DRIFT_MARK_LABEL,
	easyShareLabel,
	foldedTrackLabel,
	horizonFillLabel,
	missedCountLabel,
	NB_DISCIPLINE_LABELS,
	NB_VOLUME_UNITS,
	NOT_FILLED_LABEL,
	OF_WORD,
	RELATIVE_WEEK_LABELS,
	sessionCountLabel,
	sessionsAgainstLabel,
	sessionsDoneLabel,
	strengthPartialLabel,
	unmeasuredCountLabel,
	VOLUME_GRADE_LABELS,
	WEEK_FIGURE_LABELS,
	WEEK_LOAD_LABELS,
	weekNumberLabel,
	ZONE_INTENT_NOTE,
} from '#app/utils/labels.ts'
import { type TrackWeekVolume } from '#app/utils/plan-outline/week-volumes.ts'

/**
 * One track's week as the header reads it: the pure model's numbers and codes,
 * with the words put on.
 */
export type TimelineTrackWeek = TrackWeekVolume & {
	/** `+2 uten km`, or null when every planned session has a number. */
	plannedUnmeasuredLabel: string | null
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
	 * gjort 35`. A figure the week cannot state is null, never `0`.
	 */
	figures: {
		target: string | null
		planned: string | null
		done: string | null
	}
	/** `under`, `i rute`, `over` — the verdict, once a day of the week is past. */
	gradeLabel: string | null
	/**
	 * `ikke målt · ingen tall å holde opp mot` — why a week that could be graded
	 * is not. Said quietly beside the numbers rather than as a verdict.
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
	/** `rolig 78 % · plan 80 %` on an endurance track with a zone split. */
	zoneLabel: string | null
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

/** `Forrige uke`, `Denne uka`, `Neste uke`, otherwise `Uke 41`. */
export function relativeWeekName(monday: string, nowMonday: string): string {
	if (monday === nowMonday) return RELATIVE_WEEK_LABELS.current
	if (monday === addDays(nowMonday, -7)) return RELATIVE_WEEK_LABELS.previous
	if (monday === addDays(nowMonday, 7)) return RELATIVE_WEEK_LABELS.next
	return weekNumberLabel(isoWeekNumber(monday))
}

/** The words a track's week header carries, put on the model's codes. */
export function wordTrackWeek(
	track: TrackWeekVolume,
	{ ahead, hasSessions }: { ahead: boolean; hasSessions: boolean },
): TimelineTrackWeek {
	const figure = (value: number | null) =>
		value == null ? null : formatVolumeFigure(value, track.currency)
	const status = track.grade.status
	return {
		...track,
		name: NB_DISCIPLINE_LABELS[track.discipline],
		unit: NB_VOLUME_UNITS[track.currency],
		figures: {
			target: figure(track.target),
			planned: figure(track.planned),
			// A week wholly ahead has done nothing yet, and "gjort 0" says less
			// than an empty place where the number will be.
			done: ahead ? null : figure(track.actual),
		},
		gradeLabel:
			status === 'under' || status === 'on' || status === 'over'
				? VOLUME_GRADE_LABELS[status]
				: null,
		gradeNote: status === 'ungraded' ? VOLUME_GRADE_LABELS.ungraded : null,
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
			track.zones && (track.zones.done || track.zones.planned)
				? easyShareLabel(
						track.zones.done ? formatPercent(track.zones.done.easyShare) : null,
						track.zones.planned
							? formatPercent(track.zones.planned.easyShare)
							: null,
					)
				: null,
		plannedUnmeasuredLabel:
			track.plannedUnmeasuredCount > 0
				? unmeasuredCountLabel(track.plannedUnmeasuredCount, track.currency)
				: null,
		actualUnmeasuredLabel:
			track.actualUnmeasuredCount > 0
				? unmeasuredCountLabel(track.actualUnmeasuredCount, track.currency)
				: null,
		partialLabel: track.partial
			? strengthPartialLabel(track.partial.measuredThroughWeekday)
			: null,
		zoneIntentNote: track.zones?.planned ? ZONE_INTENT_NOTE : null,
		hasFigures: trackHasFigures(track),
	}
}

/** A figure worth holding done against: a `0` is no reference. */
function reference(figure: string | null): string | null {
	return figure == null || Number(figure) === 0 ? null : figure
}

/**
 * A closed week as one line (#505 story 31): `35 av 46 km · under`, read in
 * the lead track. What was done is held against the target, or the plan where
 * the week had no target; a week with neither above zero states only what was
 * done — never `x av 0 km`.
 */
export function foldedTrackLine(lead: TimelineTrackWeek): string {
	const status = lead.grade.status
	return foldedTrackLabel({
		done: lead.figures.done,
		of: reference(lead.figures.target) ?? reference(lead.figures.planned),
		unit: lead.unit,
		grade:
			status === 'under' || status === 'on' || status === 'over'
				? VOLUME_GRADE_LABELS[status]
				: null,
	})
}

/**
 * A plan week past the Planning Horizon as one line (#505 story 27): `Uke 43 ·
 * Oppbygging · mål 58 km · fylles søndag kveld i uke 41`.
 *
 * The last clause is the week change's own rule, stated as a time: a close
 * (Sunday 20:00 in the Athlete Timezone) fills the week after next
 * (`horizonWeekKey`), so this week is filled the Sunday evening its
 * week-before-last closes. A plan with no Week Pattern has nothing to fill
 * from, and says so rather than promising.
 */
export function collapsedWeekLine({
	monday,
	relativeName,
	phaseName,
	lead,
	fillsWeeks,
}: {
	monday: string
	relativeName: string
	phaseName: string | null
	lead: TimelineTrackWeek | null
	fillsWeeks: boolean
}): string {
	const target = reference(lead?.figures.target ?? null)
	return [
		relativeName,
		phaseName,
		target != null && lead
			? `${WEEK_FIGURE_LABELS.target} ${target} ${lead.unit}`
			: null,
		fillsWeeks
			? horizonFillLabel(isoWeekNumber(addDays(monday, -14)))
			: NOT_FILLED_LABEL,
	]
		.filter((part): part is string => part != null)
		.join(' · ')
}

/**
 * The week's sessions and load in the header's Norwegian — what a week with no
 * Training Track to be read in carries, and the hero's week pane. Three
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
}: {
	imported: boolean
	past: boolean
	isNow: boolean
	total: number
	done: number
	missed: number
	doneTss: number | null
	plannedTss: number | null
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
			loadClause(doneTss, plannedTss),
		)
	}
	return join(
		`${sessionCountLabel(total)} ${WEEK_FIGURE_LABELS.planned}`,
		loadClause(null, plannedTss),
	)
}

/** `48 av 312 TSS`, or whichever single side exists. Never a zero-filled pair. */
function loadClause(
	doneTss: number | null,
	plannedTss: number | null,
): string | null {
	if (doneTss != null && plannedTss != null) {
		return `${formatLoad(doneTss)} ${OF_WORD} ${formatTss(plannedTss)}`
	}
	if (doneTss != null) return formatTss(doneTss)
	if (plannedTss != null) return formatTss(plannedTss)
	return null
}

/** Joins the parts that exist with the house separator. */
export function join(...parts: Array<string | null>): string {
	return parts.filter((part): part is string => !!part).join(' · ')
}
