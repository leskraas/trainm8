// An open-ended plan's next rounds, before they exist (#558, #570): the rounds
// the Week Change would append if every week of the plan were done to plan.
//
// The same move `appendOpenEndedRound` writes, done on the rows in memory, so
// the derivation (`resolvedTracks`) prices the projected weeks exactly as it
// will price them once appended: a new phase repeating the last one's length
// and rhythm, each endurance segment carried on from the last phase's (its
// ramp, its cuts, its Quality Session Mix) with the round's factor as the
// Block Boundary Step, and a lifting block that ran to the plan's end
// extended to the new end. Pure: nothing here is stored, and nothing promises
// more than the rule would lay.

import {
	isSimpleActivityTrack,
	type OutlineRows,
	type SegmentRow,
	SIMPLE_ACTIVITY_SEGMENT,
} from './from-rows.ts'
import { weekIndexOf, weekKeyAt } from './week-keys.ts'

/**
 * The plan's rows with `rounds` more rounds after its last phase, each opening
 * with `boundaryStep` against the round before (`roundBoundaryStep` of the
 * factor a round done to plan earns). The rows as they were when the plan has
 * no phase to repeat.
 */
export function withProjectedRounds(
	rows: OutlineRows,
	{ rounds, boundaryStep }: { rounds: number; boundaryStep: number | null },
): OutlineRows {
	const phases = [...rows.phases].sort((a, b) => a.orderIndex - b.orderIndex)
	const last = phases.at(-1)
	if (!last || rounds <= 0) return rows

	const planWeeks = phases.reduce((sum, phase) => sum + phase.weeks, 0)
	const end = weekKeyAt(rows.startWeekKey, planWeeks)
	const newEnd = weekKeyAt(rows.startWeekKey, planWeeks + rounds * last.weeks)
	const added = Array.from({ length: rounds }, (_, index) => ({
		...last,
		id: `${last.id}-projected-${index + 1}`,
		orderIndex: last.orderIndex + index + 1,
		tapers: false,
		recoveryWeekIndex: null,
	}))

	return {
		...rows,
		phases: [...phases, ...added],
		tracks: rows.tracks.map((track) => ({
			...track,
			segments: [
				...track.segments.map((segment) =>
					runsToEnd(segment, end)
						? {
								...segment,
								weeks: weekIndexOf(segment.startWeekKey!, newEnd),
							}
						: segment,
				),
				...track.segments
					.filter(
						(segment) =>
							segment.kind === 'endurance' && segment.phaseId === last.id,
					)
					.flatMap((segment) =>
						added.map(
							(phase): SegmentRow => ({
								...segment,
								id: `${segment.id}-projected-${phase.orderIndex}`,
								phaseId: phase.id,
								// The Simple Activities' fixed days do not step up (#572).
								boundaryStep: isSimpleActivityTrack(track.discipline)
									? SIMPLE_ACTIVITY_SEGMENT.boundaryStep
									: boundaryStep,
								mix: segment.mix.map((entry) => ({ ...entry })),
							}),
						),
					),
			],
		})),
	}
}

/** A dated lifting block whose last week is the plan's last. */
function runsToEnd(segment: SegmentRow, end: string): boolean {
	return (
		segment.kind === 'strength' &&
		segment.startWeekKey != null &&
		segment.weeks != null &&
		weekKeyAt(segment.startWeekKey, segment.weeks) === end
	)
}
