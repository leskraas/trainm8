/**
 * The season strip's model (#505 stories 17–18, 26; ADR 0082 §5, ADR 0086):
 * every week of the season as one bar, read in the **lead track**'s own unit —
 * the first track not counted in sets — or in load where there is no plan to
 * read one in. Under the bars, the plan's phases as a coloured band; a dashed
 * line where the Planning Horizon ends and dashed bars past it; a flag on the
 * race week.
 *
 * Derived from the same `TimelineWeek[]` the stream renders, so the strip and
 * the list cannot disagree about a week (ADR 0065, consequences).
 *
 * Also here, pure: {@link stripWindow}, which decides how much of a long
 * season a narrow strip shows at once (S10).
 */
import { formatLoad, formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	NB_VOLUME_UNITS,
	SEASON_STRIP_LABELS,
	stripTssLabel,
} from '#app/utils/labels.ts'
import { type WeekRole } from '#app/utils/plan-outline/derive.ts'
import { type PhaseTone, type TimelineWeek } from './presenter.ts'
import { trackHasFigures } from './week-words.ts'

export type TimelineStrip = {
	/** `km`, `t`, `TSS`. */
	unit: string
	weeks: TimelineStripWeek[]
	/**
	 * The plan's phases as runs of consecutive weeks — the band under the bars,
	 * in the phase colours, named where the name fits. Empty without a plan.
	 */
	phases: TimelineStripPhase[]
	/**
	 * Index of the first week past the Planning Horizon — where the dashed line
	 * stands — or null when every week is filled or there is no plan.
	 */
	horizonIndex: number | null
}

export type TimelineStripPhase = {
	name: string
	tone: PhaseTone | null
	/** First and last week index the phase covers, inclusive. */
	from: number
	to: number
}

export type TimelineStripWeek = {
	key: string
	/** `max(target, planned)` (S8's `stripValue`), so overplanning shows. */
	value: number | null
	/** What was done, in the same unit. */
	done: number | null
	/**
	 * `value` over the season's scale, exactly — a bar is as tall as its value
	 * and never floored (ADR 0066 §3). Null where the week has no figure.
	 */
	height: number | null
	/**
	 * `done` on the same scale. The scale is the largest of every week's value
	 * *and* done, so this never exceeds 1 — but it may stand taller than its own
	 * bar when more was done than was asked for, which is the overshoot showing.
	 */
	doneHeight: number | null
	role: WeekRole | null
	isNow: boolean
	/** A sets track has something to say this week: a dot under the bar. */
	strength: boolean
	/**
	 * A plan week past the Planning Horizon that nothing has filled yet: its bar
	 * is the target alone, drawn dashed (variant P).
	 */
	unfilled: boolean
	/** The race week: a flag over the bar. */
	event: boolean
	phaseTone: PhaseTone | null
	/** The week, its rhythm and its figures, as one accessible name. */
	label: string
}

/**
 * One bar per week, each against the season's scale so the bars compare weeks
 * to the season and not each to itself. A week with no figure draws no bar
 * and its name says so.
 */
export function buildStrip(
	weeks: readonly TimelineWeek[],
	leadTrackId: string | null,
	{
		horizonWeekKey = null,
		eventWeekKey = null,
		eventName = null,
	}: {
		/** The last week the Planning Horizon reaches; null without a plan. */
		horizonWeekKey?: string | null
		/** The Monday of race week; null without a race. */
		eventWeekKey?: string | null
		eventName?: string | null
	} = {},
): TimelineStrip {
	const read = (week: TimelineWeek) => {
		const track = leadTrackId
			? week.tracks.find((t) => t.trackId === leadTrackId)
			: undefined
		if (track) {
			return {
				value: track.stripValue,
				done: track.actual,
				figure: (n: number) => formatNbVolumeFigure(n, track.currency),
				unit: NB_VOLUME_UNITS[track.currency],
			}
		}
		// No plan to read a track in: the week's load, as the strip always read it.
		return {
			value: week.plannedTss ?? week.doneTss,
			done: week.doneTss,
			figure: formatLoad,
			unit: NB_VOLUME_UNITS.tss,
		}
	}
	const readings = weeks.map(read)
	const scale = Math.max(
		0,
		...readings.flatMap((r) => [r.value ?? 0, r.done ?? 0]),
	)
	const horizonIndex =
		horizonWeekKey == null
			? null
			: weeks.findIndex(
					(week) => week.key > horizonWeekKey && week.shape === 'beyond',
				)
	return {
		unit: readings[0]?.unit ?? NB_VOLUME_UNITS.tss,
		weeks: weeks.map((week, index) => {
			const { value, done, figure, unit } = readings[index]!
			const unfilled = week.shape === 'beyond' && week.phaseName != null
			const event = eventWeekKey != null && week.key === eventWeekKey
			const reading =
				value == null
					? SEASON_STRIP_LABELS.noFigure
					: leadTrackId
						? `${figure(value)} ${unit}`
						: stripTssLabel(figure(value))
			return {
				key: week.key,
				value,
				done,
				height: value == null ? null : scale > 0 ? value / scale : 0,
				doneHeight: done == null ? null : scale > 0 ? done / scale : 0,
				role: week.role,
				isNow: week.isNow,
				strength: week.tracks.some(
					(track) => track.currency === 'sets' && trackHasFigures(track),
				),
				unfilled,
				event,
				phaseTone: week.phaseTone ?? null,
				label: [
					week.relativeName,
					week.rangeLabel,
					week.kindLabel,
					reading,
					unfilled ? SEASON_STRIP_LABELS.unfilled : null,
					event && eventName ? SEASON_STRIP_LABELS.event(eventName) : null,
				]
					.filter((part): part is string => !!part)
					.join(', '),
			}
		}),
		phases: phaseRuns(weeks),
		horizonIndex:
			horizonIndex != null && horizonIndex > 0 ? horizonIndex : null,
	}
}

/** Consecutive weeks of one phase (by position, never by name) as one run. */
function phaseRuns(weeks: readonly TimelineWeek[]): TimelineStripPhase[] {
	const runs: TimelineStripPhase[] = []
	weeks.forEach((week, index) => {
		if (week.phaseIndex == null || week.phaseName == null) return
		const last = runs[runs.length - 1]
		if (
			last &&
			last.to === index - 1 &&
			phaseIndexAt(weeks, last.from) === week.phaseIndex
		) {
			last.to = index
			return
		}
		runs.push({
			name: week.phaseName,
			tone: week.phaseTone ?? null,
			from: index,
			to: index,
		})
	})
	return runs
}

function phaseIndexAt(weeks: readonly TimelineWeek[], index: number) {
	return weeks[index]?.phaseIndex ?? null
}

/**
 * The narrowest a bar may be before the strip stops showing the whole season
 * at once (S10). Under ~5px a bar is a hairline nobody can read a week off,
 * and a thumb's x lands on a different week every pixel.
 */
export const MIN_BAR_PX = 6

/** How close the frame may come to the window's edge before the window moves. */
export const WINDOW_MARGIN = 2

/** The weeks the strip shows: `[start, end]`, inclusive. */
export type StripWindow = { start: number; end: number }

/**
 * Which part of the season the strip shows (S10, ADR 0086).
 *
 * The whole season whenever it fits at {@link MIN_BAR_PX} or more per bar —
 * the overview is the point (ADR 0082 §5). Past that, a **window** as wide as
 * fits, placed so the weeks the reader is looking at sit inside it: it starts
 * centred on the frame and then moves only when the frame comes within
 * {@link WINDOW_MARGIN} weeks of an edge, so it does not slide under a finger
 * that is scrubbing it, and the rest of the season is one tap away on the
 * edge buttons (or a scroll of the list, which the window follows).
 *
 * `current` is the window shown now, or null to place it fresh.
 */
export function stripWindow({
	count,
	width,
	frame,
	current,
	edges = 0,
}: {
	count: number
	/** The strip's width in px; 0 before anything is measured. */
	width: number
	/** What the two edge buttons take from the bars once there is a window. */
	edges?: number
	/** The frame's first and last week index. */
	frame: { from: number; to: number }
	current: StripWindow | null
}): StripWindow {
	const all = { start: 0, end: Math.max(0, count - 1) }
	if (count === 0 || width <= 0) return all
	const fits = Math.max(1, Math.floor(width / MIN_BAR_PX))
	if (count <= fits) return all
	const span = Math.max(1, Math.floor((width - edges) / MIN_BAR_PX))
	const clampStart = (start: number) =>
		Math.min(Math.max(0, start), count - span)
	if (current && current.end - current.start + 1 === span) {
		const inside =
			frame.from >= current.start + Math.min(WINDOW_MARGIN, current.start) &&
			frame.to <= current.end - Math.min(WINDOW_MARGIN, count - 1 - current.end)
		if (inside) return current
		// Move just far enough to bring the frame back inside the margin.
		const start =
			frame.from < current.start + WINDOW_MARGIN
				? clampStart(frame.from - WINDOW_MARGIN)
				: clampStart(frame.to + WINDOW_MARGIN - span + 1)
		return { start, end: start + span - 1 }
	}
	const middle = Math.round((frame.from + frame.to) / 2)
	const start = clampStart(middle - Math.floor(span / 2))
	return { start, end: start + span - 1 }
}
