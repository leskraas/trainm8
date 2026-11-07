/**
 * **Placed Hours** — how long a generated week's placed sessions take at least,
 * read against the athlete's **Weekly Capacity** (ADR 0110 §4, ADR 0116, #473).
 *
 * `capacity.ts` reads the **Week Target** in hours and lowers the anchor where a
 * week outruns the capacity. The placed sessions are the other half: a Stock
 * Workout is placed as its source published it and never rescaled (ADR 0053
 * §6), so a week can fit on its target and still hold sessions that take longer
 * than the athlete has. This module states that and changes nothing.
 *
 * The figure is a **floor**: every step the shared duration reading can time
 * (`prescribedDuration`, through the athlete's own thresholds), summed. A step
 * it cannot time, such as an open rest, adds nothing and nothing is estimated
 * for it (the **Unavailable Metric** rule). The week is `exact` only when every
 * placed session was timed end to end and no slot went unfilled; otherwise the
 * surface reads it as `minst`. It is deliberately not **Planned Volume**, which
 * drops a whole session for one untimed step.
 *
 * Pure: the corpus blocks and the thresholds arrive as data, so preview and
 * approval read one figure behind the seam. It carries no wording; the surface
 * words it and rounds once.
 */
import { type DisciplineThresholdMap } from '../intensity-target.ts'
import {
	hoursFitWarnings,
	type HoursFitWarning,
} from '../plan-outline/availability-fit.ts'
import {
	prescribedDuration,
	type PrescribedDuration,
} from '../prescribed-duration.ts'
import { type RetrievableEntry } from './retrieval.ts'

/** One week's Placed Hours, unrounded. */
export type PlacedWeek = {
	hours: number
	/** Every placed session timed end to end and no slot unfilled: no `minst`. */
	exact: boolean
	/** Some step was timed through a pace, so the figure reads with `≈`. */
	estimated: boolean
}

/** What the Placed Hours reading found. Carries no wording. */
export type PlacedFit =
	/** No Weekly Capacity authored: nothing is said, which is no pass (ADR 0050). */
	| { kind: 'unset' }
	| {
			kind: 'read'
			weeklyCapacityHours: number
			/** By week index; null where nothing in the week could be timed. */
			weeks: Array<PlacedWeek | null>
			/**
			 * The spans whose Placed Hours outrun the capacity, decided at the
			 * precision the athlete reads (`hoursFitWarnings`), 0-based.
			 */
			breaches: HoursFitWarning[]
	  }

/**
 * How long one retrieved Stock Workout takes as placed, through the athlete's
 * thresholds: the session row's own reading (AC 2), never rescaled.
 */
export function readPlacedDuration(
	entry: Pick<RetrievableEntry, 'blocks' | 'discipline'>,
	thresholds: DisciplineThresholdMap,
): PrescribedDuration | null {
	return prescribedDuration(entry.blocks, {
		thresholds,
		discipline: entry.discipline,
	})
}

/**
 * Each week's Placed Hours and the weeks that breach the capacity.
 *
 * Runs whenever a capacity is set, whatever the Week Target reading did: it
 * needs only the placed sessions and the thresholds, so an `unpriced` target
 * still gets it (ADR 0116 §3).
 */
export function readPlacedHours(input: {
	weekCount: number
	sessions: ReadonlyArray<{
		weekIndex: number
		prescribed: PrescribedDuration | null
	}>
	unfilled: ReadonlyArray<{ weekIndex: number }>
	weeklyCapacityHours: number | null
}): PlacedFit {
	const { weeklyCapacityHours: capacity } = input
	if (capacity == null) return { kind: 'unset' }

	const weeks: Array<PlacedWeek | null> = []
	for (let weekIndex = 0; weekIndex < input.weekCount; weekIndex++) {
		const placed = input.sessions.filter(
			(session) => session.weekIndex === weekIndex,
		)
		const timed = placed.flatMap((session) =>
			session.prescribed == null ? [] : [session.prescribed],
		)
		if (timed.length === 0) {
			weeks.push(null)
			continue
		}
		const unfilled = input.unfilled.some((slot) => slot.weekIndex === weekIndex)
		weeks.push({
			hours:
				timed.reduce((total, reading) => total + reading.seconds, 0) / 3600,
			exact:
				!unfilled &&
				placed.every((session) => session.prescribed?.complete === true),
			estimated: timed.some((reading) => reading.estimated),
		})
	}

	return {
		kind: 'read',
		weeklyCapacityHours: capacity,
		weeks,
		breaches: hoursFitWarnings(
			weeks.map((week) => week?.hours ?? null),
			capacity,
		),
	}
}
