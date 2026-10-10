/**
 * The large-screen season pane's model (#505 story 60, ADR 0087, Arket
 * variant Q): the **season table** — one row per plan week, `mål · gjort` per
 * Training Track — and the **compact curve** under it — the lead track's
 * target as a line, what was done as bars, today, the Planning Horizon, the
 * phases as a colour strip and the race's flag.
 *
 * Both are read off the same `TimelineSeason` the list and the strip render,
 * so a row, the bar above it and the week header it jumps to cannot disagree
 * about a week (ADR 0065, consequences). Pure, so the pane's tests can hand it
 * a season and read the answer.
 */
import { addDays, isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { formatLoad, formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	DRIFT_MARK_LABEL,
	NB_VOLUME_UNITS,
	SEASON_PANE_LABELS,
	weekNumberLabel,
} from '#app/utils/labels.ts'
import { type VolumeGrade } from '#app/utils/plan-outline/week-volumes.ts'
import {
	type PhaseTone,
	type TimelineSeason,
	type TimelineTrackWeek,
	type TimelineWeek,
} from './presenter.ts'

/** One column of the table: a track, or the week's load where there is none. */
export type SeasonTableColumn = {
	/** The track's id, or `load` for a season with no plan. */
	id: string
	/** `Løping`, `Styrke`, `TSS`. */
	name: string
	/** `km`, `t`, `økter` (a sets track is read in sessions here), `TSS`. */
	unit: string
	/** Read in sessions: one-digit figures, so the column can be narrow. */
	narrow: boolean
}

export type SeasonTableCell = {
	/** `46`, `2` — the target; null where the week has none. */
	target: string | null
	/** `35,2` — what was done; null before anything is. */
	done: string | null
	/** The verdict the done figure is coloured by, once there is one. */
	grade: VolumeGrade | null
	/** Planned more than 10 % off the target (the `≠` mark), said in words. */
	drift: string | null
	/** The cell, said whole for a screen reader. */
	name: string
}

export type SeasonTableRow = {
	key: string
	/** `38` — the ISO week number, as every other week number on I dag. */
	weekNumber: number
	/** `Uke 38, 14.–20. sep` — what the row's button jumps to. */
	name: string
	isNow: boolean
	phaseName: string | null
	phaseTone: PhaseTone | null
	/** `hard uke`, `lett uke`, `nedtrapping`. */
	roleLabel: string | null
	/** A lighter week in its phase's rhythm: the row is tinted, as in Q. */
	easy: boolean
	/** The Planning Horizon stands above this row (once in a season). */
	opensHorizon: boolean
	cells: SeasonTableCell[]
}

export type SeasonTable = {
	columns: SeasonTableColumn[]
	rows: SeasonTableRow[]
}

/**
 * The weeks the pane reads: the plan's. History from before the plan has no
 * target to stand beside, and the list already shows it above today. With no
 * plan at all, every week is the athlete's own and all of them are read.
 */
export function paneWeeks(weeks: readonly TimelineWeek[]): TimelineWeek[] {
	return weeks.filter((week) => !week.imported)
}

const LOAD_COLUMN: SeasonTableColumn = {
	id: 'load',
	name: SEASON_PANE_LABELS.load,
	unit: NB_VOLUME_UNITS.tss,
	narrow: false,
}

export function buildSeasonTable(
	weeks: readonly TimelineWeek[],
	leadTrackId: string | null,
): SeasonTable {
	const rows = paneWeeks(weeks)
	const columns = trackColumns(rows, leadTrackId)
	return {
		columns,
		rows: rows.map((week) => ({
			key: week.key,
			weekNumber: isoWeekNumber(week.key),
			name: `${weekNumberLabel(isoWeekNumber(week.key))}, ${week.rangeLabel}`,
			isNow: week.isNow,
			phaseName: week.phaseName,
			phaseTone: week.phaseTone ?? null,
			roleLabel: week.roleLabel,
			easy: week.role === 'recovery',
			// Only the plan's horizon: a season with no plan has nothing to fill a
			// week from, so there is no line for the table to draw.
			opensHorizon: week.opensHorizon && week.phaseName != null,
			cells: columns.map((column) =>
				column === LOAD_COLUMN ? loadCell(week) : trackCell(week, column),
			),
		})),
	}
}

/**
 * Every track the plan's weeks carry, the lead track first, in the order
 * they first appear. A season with no track at all reads its load instead.
 */
function trackColumns(
	weeks: readonly TimelineWeek[],
	leadTrackId: string | null,
): SeasonTableColumn[] {
	const seen = new Map<string, SeasonTableColumn>()
	for (const week of weeks) {
		for (const track of week.tracks) {
			if (seen.has(track.trackId)) continue
			seen.set(track.trackId, {
				id: track.trackId,
				name: track.name,
				unit:
					track.currency === 'sets' ? SEASON_PANE_LABELS.sessions : track.unit,
				narrow: track.currency === 'sets',
			})
		}
	}
	const columns = [...seen.values()]
	if (columns.length === 0) return [LOAD_COLUMN]
	const lead = columns.findIndex((column) => column.id === leadTrackId)
	if (lead > 0) columns.unshift(...columns.splice(lead, 1))
	return columns
}

function trackCell(
	week: TimelineWeek,
	column: SeasonTableColumn,
): SeasonTableCell {
	const track = week.tracks.find((t) => t.trackId === column.id)
	if (!track) return cell(column, null, null, null, null)
	// A sets track is read in sessions here, as Q reads it: `2 · 1` is a
	// week's gym visits, which a 300px column can hold; sets are in the header.
	if (track.currency === 'sets') {
		const { target, done } = track.sessions
		const started = done > 0 || week.shape === 'past'
		return cell(
			column,
			target == null ? null : String(target),
			started ? String(done) : null,
			gradeOf(track),
			null,
		)
	}
	return cell(
		column,
		track.figures.target,
		track.figures.done,
		gradeOf(track),
		track.driftLabel ? DRIFT_MARK_LABEL : null,
	)
}

/** The colour the done figure takes: the verdict's, once there is one. */
function gradeOf(track: TimelineTrackWeek): VolumeGrade | null {
	const status = track.grade.status
	return status === 'under' || status === 'on' || status === 'over'
		? status
		: null
}

function loadCell(week: TimelineWeek): SeasonTableCell {
	return cell(
		LOAD_COLUMN,
		week.plannedTss == null ? null : formatLoad(week.plannedTss),
		week.doneTss == null ? null : formatLoad(week.doneTss),
		null,
		null,
	)
}

function cell(
	column: SeasonTableColumn,
	target: string | null,
	done: string | null,
	grade: VolumeGrade | null,
	drift: string | null,
): SeasonTableCell {
	const name = SEASON_PANE_LABELS.cellName(
		column.name,
		target == null ? '–' : `${target} ${column.unit}`,
		done ?? '–',
	)
	return {
		target,
		done,
		grade,
		drift,
		name: drift ? `${name}, ${drift}` : name,
	}
}

// ---------------------------------------------------------------------------
// The compact curve
// ---------------------------------------------------------------------------

export type SeasonCurvePoint = {
	key: string
	weekNumber: number
	/** The lead track's Week Target (or the planned load with no plan). */
	target: number | null
	/** What was done, in the same unit. */
	done: number | null
	phaseTone: PhaseTone | null
	/** In a phase at all — a named phase draws a neutral stripe. */
	inPhase: boolean
	isNow: boolean
}

export type SeasonCurve = {
	/** `Løping`, or `TSS` with no plan. */
	trackName: string
	unit: string
	/** The lead track's sport, whose colour the done bars take; null with none. */
	discipline: string | null
	points: SeasonCurvePoint[]
	/** The top of the value scale, before the chart rounds it up. */
	max: number
	/**
	 * Where today stands, as a fractional point index: the current week's
	 * index plus how far through it today is (mid-day). Null when the season
	 * the pane reads holds no current week.
	 */
	todayAt: number | null
	/** The index of the first point past the Planning Horizon, or null. */
	horizonAt: number | null
	/** The index of race week, where the flag stands, or null. */
	eventAt: number | null
	/** Each point's figures as strings, for the chart's data table. */
	figure: (value: number) => string
}

export function buildSeasonCurve(season: TimelineSeason): SeasonCurve {
	const weeks = paneWeeks(season.weeks)
	const lead = season.leadTrackId
	const leadTrack = weeks
		.flatMap((week) => week.tracks)
		.find((track) => track.trackId === lead)
	const read = (
		week: TimelineWeek,
	): { target: number | null; done: number | null } => {
		if (leadTrack) {
			const track = week.tracks.find((t) => t.trackId === lead)
			return { target: track?.target ?? null, done: track?.actual ?? null }
		}
		return { target: week.plannedTss, done: week.doneTss }
	}
	const events = new Set(
		season.strip.weeks.filter((week) => week.event).map((week) => week.key),
	)
	const points = weeks.map((week) => ({
		key: week.key,
		weekNumber: isoWeekNumber(week.key),
		...read(week),
		phaseTone: week.phaseTone ?? null,
		inPhase: week.phaseName != null,
		isNow: week.isNow,
	}))
	const now = points.findIndex((point) => point.isNow)
	const horizon = weeks.findIndex(
		(week) => week.opensHorizon && week.phaseName != null,
	)
	const event = points.findIndex((point) => events.has(point.key))
	return {
		trackName: leadTrack?.name ?? SEASON_PANE_LABELS.load,
		unit: leadTrack?.unit ?? NB_VOLUME_UNITS.tss,
		discipline: leadTrack?.discipline ?? null,
		points,
		max: Math.max(
			0,
			...points.flatMap((point) => [point.target ?? 0, point.done ?? 0]),
		),
		todayAt:
			now < 0
				? null
				: now + (daysInto(points[now]!.key, season.todayKey) + 0.5) / 7,
		horizonAt: horizon < 0 ? null : horizon,
		eventAt: event < 0 ? null : event,
		figure: leadTrack
			? (value) => formatNbVolumeFigure(value, leadTrack.currency)
			: formatLoad,
	}
}

/** Whole days from a week's Monday to a day in it, 0–6. */
function daysInto(monday: string, day: string): number {
	for (let offset = 0; offset < 7; offset++) {
		if (addDays(monday, offset) === day) return offset
	}
	return 0
}
