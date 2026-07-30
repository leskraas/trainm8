// Where the authored season ends relative to the Event it builds toward.
//
// The **Plan Start Week** is authored and the phases lay forward from it
// (ADR 0044 §3), so the plan's end is a *consequence* and may fall short of or
// past the Event. Neither is a defect and neither is corrected: the surface says
// which it is and by how much, and the athlete decides whether to add weeks
// (spec #399, story 4). Nothing here stretches anything.

import { weekIndexOf } from './week-keys.ts'

/**
 * How the plan's final Training Week sits against the Event's own week.
 *
 * `weeks` is always positive — the kind carries the direction — so a caller
 * cannot render "−2 weeks before" by forgetting a sign.
 */
export type EventFit =
	| { kind: 'ends-on-event-week' }
	| { kind: 'ends-before'; weeks: number }
	| { kind: 'runs-past'; weeks: number }

/**
 * Compare the season's last week with the Event's week, both keyed by their
 * Monday. An Event before the plan opens comes out as `runs-past`, which is what
 * it is: every authored week falls after the Event.
 */
export function eventFit(
	startWeekKey: string,
	totalWeeks: number,
	eventWeekKey: string,
): EventFit {
	const lastWeekIndex = totalWeeks - 1
	const eventWeekIndex = weekIndexOf(startWeekKey, eventWeekKey)
	const gap = eventWeekIndex - lastWeekIndex

	if (gap === 0) return { kind: 'ends-on-event-week' }
	return gap > 0
		? { kind: 'ends-before', weeks: gap }
		: { kind: 'runs-past', weeks: -gap }
}
