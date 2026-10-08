/**
 * The season strip's model (#505 stories 17–18, 26; ADR 0082 §5): every week
 * of the season as one bar, read in the **lead track**'s own unit — the first
 * track not counted in sets — or in load where there is no plan to read one in.
 *
 * Derived from the same `TimelineWeek[]` the stream renders, so the strip and
 * the list cannot disagree about a week (ADR 0065, consequences).
 */
import { formatLoad, formatVolumeFigure } from '#app/utils/format.ts'
import {
	NB_VOLUME_UNITS,
	SEASON_STRIP_LABELS,
	stripTssLabel,
} from '#app/utils/labels.ts'
import { type WeekRole } from '#app/utils/plan-outline/derive.ts'
import { type TimelineWeek } from './presenter.ts'
import { trackHasFigures } from './week-words.ts'

export type TimelineStrip = {
	/** `km`, `t`, `TSS`. */
	unit: string
	weeks: TimelineStripWeek[]
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
): TimelineStrip {
	const read = (week: TimelineWeek) => {
		const track = leadTrackId
			? week.tracks.find((t) => t.trackId === leadTrackId)
			: undefined
		if (track) {
			return {
				value: track.stripValue,
				done: track.actual,
				figure: (n: number) => formatVolumeFigure(n, track.currency),
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
	return {
		unit: readings[0]?.unit ?? NB_VOLUME_UNITS.tss,
		weeks: weeks.map((week, index) => {
			const { value, done, figure, unit } = readings[index]!
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
				label: [week.relativeName, week.rangeLabel, week.kindLabel, reading]
					.filter((part): part is string => !!part)
					.join(', '),
			}
		}),
	}
}
