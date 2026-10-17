// The **planned discipline**: the Discipline a planned session may be on (spec
// #558, ticket #561). It is the Discipline set plus `other`, where a **Simple
// Activity** lives (a climb, a hike, yoga; ADR 0015 §A, `simple-activity.ts`),
// carrying time and hardness only.
//
// The Discipline set itself (`DISCIPLINES`) is deliberately **not** widened:
// dozens of switches on it — zones, thresholds, TSS formulas, PRs, structure
// detection, authoring — would each need a branch for `other` at once. Instead
// this wider form sits beside it, and every path a planned session travels
// (session detail, week rows, Planned Volume, Planned TSS, Training Load
// contribution) asks `readPlannedMetric` first. That one call decides, per
// planned discipline and per metric, whether the number may be measured at all;
// where it may not, the path gets an **Unavailable Metric** with its reason
// instead of a guessed number, and the path's own measuring is never run.
//
// The decision is an exhaustive switch over `PlannedDiscipline` and a complete
// table over `PlannedSessionMetric`, so adding a value to either fails type
// checking until every path has said what it does with it.
import { DISCIPLINES } from './workout-schema.ts'

export const PLANNED_DISCIPLINES = [...DISCIPLINES, 'other'] as const
export type PlannedDiscipline = (typeof PLANNED_DISCIPLINES)[number]

/**
 * The stored Discipline string as a planned discipline, or null for a value
 * outside it. Unknown values keep the behaviour each path already had.
 */
export function readPlannedDiscipline(value: string): PlannedDiscipline | null {
	return (PLANNED_DISCIPLINES as readonly string[]).includes(value)
		? (value as PlannedDiscipline)
		: null
}

/** The numbers a planned session's paths read. */
export const PLANNED_SESSION_METRICS = [
	/** The session's Planned TSS (ADR 0019): stored, on week rows and in detail. */
	'planned-tss',
	/** What the session contributes to the day's load (ADR 0008, 0046 §2). */
	'training-load',
	/**
	 * The session's figures in a track's Volume Currency other than hours (km,
	 * TSS, sets; week volumes). Hours are the planned time, `planned-time`.
	 */
	'planned-volume',
	/** The prescribed distance on session detail. */
	'planned-distance',
	/** The prescribed time: on session detail, and as hours in week volumes. */
	'planned-time',
	/** The prescription's Training Zones (session profile, zone split). */
	'planned-zones',
] as const
export type PlannedSessionMetric = (typeof PLANNED_SESSION_METRICS)[number]

/**
 * Why a number is withheld:
 * - `simple-activity` — the session is on `other`, which carries time and
 *   hardness only (spec #558); shown as _ikke målt_ once a surface shows it.
 * - `not-resolved` — the discipline is measured, but this session's own
 *   measuring found nothing (no threshold, no quantity).
 */
export const UNAVAILABLE_METRIC_REASONS = [
	'simple-activity',
	'not-resolved',
] as const
export type UnavailableMetricReason =
	(typeof UNAVAILABLE_METRIC_REASONS)[number]

/** A training metric the model cannot truthfully give, and why (GLOSSARY). */
export type UnavailableMetric = {
	status: 'unavailable'
	reason: UnavailableMetricReason
}

export type PlannedMetric<T> =
	| { status: 'available'; value: T }
	| UnavailableMetric

/**
 * What `other` withholds, per metric — time is the one number it carries. A
 * complete table, so a new metric has to decide.
 */
const SIMPLE_ACTIVITY_WITHHOLDS: Record<PlannedSessionMetric, boolean> = {
	'planned-tss': true,
	'training-load': true,
	'planned-volume': true,
	'planned-distance': true,
	'planned-time': false,
	'planned-zones': true,
}

function withheldOn(
	discipline: PlannedDiscipline,
	metric: PlannedSessionMetric,
): UnavailableMetricReason | null {
	switch (discipline) {
		case 'run':
		case 'bike':
		case 'swim':
		case 'strength':
			return null
		case 'other':
			return SIMPLE_ACTIVITY_WITHHOLDS[metric] ? 'simple-activity' : null
		default: {
			const unhandled: never = discipline
			return unhandled
		}
	}
}

/**
 * Read one metric of a planned session on `discipline`. `measure` is the
 * path's own measuring, run only where the planned discipline allows the
 * metric; its null becomes `not-resolved`.
 */
export function readPlannedMetric<T>(
	discipline: string,
	metric: PlannedSessionMetric,
	measure: () => T | null,
): PlannedMetric<T> {
	const planned = readPlannedDiscipline(discipline)
	const withheld = planned ? withheldOn(planned, metric) : null
	if (withheld) return { status: 'unavailable', reason: withheld }
	const value = measure()
	return value == null
		? { status: 'unavailable', reason: 'not-resolved' }
		: { status: 'available', value }
}

/** The number, or null where it is unavailable — for paths that store null. */
export function plannedMetricValue<T>(metric: PlannedMetric<T>): T | null {
	return metric.status === 'available' ? metric.value : null
}
