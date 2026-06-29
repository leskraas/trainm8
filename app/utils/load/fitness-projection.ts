// The Fitness Projection: extend the CTL ("fitness") curve forward from today to
// the Target Event by replaying the active Plan Outline's per-phase weekly-load
// pattern through the same CTL EWMA the measured curve uses (ADR 0008).
//
// Pure and display-only: it never produces or mutates Load Snapshots. Only CTL
// is projected — a flat daily-average TSS makes ATL/TSB (which depend on the
// intra-week distribution we deliberately don't model here) meaningless, so the
// projection speaks only to fitness, the one signal a weekly load can honestly
// imply.
import { CTL_DAYS } from './ewma.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * Training Stress assumed per prescribed training hour when turning a Plan
 * Outline's weekly-load pattern (hours/week) into projectable daily TSS.
 *
 * The TSS convention (ADR 0008) anchors 100 TSS to one hour at threshold
 * (intensity factor 1.0), and every Load Formula has the shape
 * `hours × IF² × 100`. A periodized endurance week is mostly sub-threshold
 * aerobic work, so its hours average well below threshold: 60 TSS/hour ≈ IF 0.77
 * (0.77² × 100 ≈ 60), a standard planning figure for mixed endurance training.
 * This is the single documented assumption that makes prescribed hours
 * projectable; it is a planning estimate and is never recorded as actual load.
 */
export const TSS_PER_PLANNED_HOUR = 60

/** One phase of the weekly-load pattern, earliest first (Plan Outline order). */
export type ProjectionPhase = {
	/** Weeks this phase spans. */
	weeks: number
	/** Prescribed weekly training hours; null when the Outline omits the pattern. */
	weeklyLoadHours: number | null
}

/** One projected day: a UTC day key (YYYY-MM-DD) and its projected CTL. */
export type FitnessProjectionPoint = { date: string; ctl: number }

/** YYYY-MM-DD for a millisecond instant, in UTC so day stepping never drifts. */
function utcDayKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10)
}

/** The weekly hours active on `dayMs`, by the plan calendar (phases end on race). */
function weeklyHoursOn(
	dayMs: number,
	phases: Array<{ weeks: number; weeklyLoadHours: number }>,
	planStartMs: number,
): number {
	const weekIndex = Math.floor((dayMs - planStartMs) / WEEK_MS)
	let cumulative = 0
	for (const phase of phases) {
		// Days before the plan starts fall into the first phase; days at/after the
		// final boundary stay in the last phase (the loop falls through to it).
		if (weekIndex < cumulative + phase.weeks) return phase.weeklyLoadHours
		cumulative += phase.weeks
	}
	return phases[phases.length - 1]!.weeklyLoadHours
}

/**
 * Project daily CTL from `anchorDate` (the most recent measured Load Snapshot)
 * to `eventDate`, replaying the Plan Outline's weekly-load pattern through the
 * CTL EWMA. The series opens with the anchor day itself so a renderer can join
 * the dashed projection seamlessly onto the solid measured curve, then steps one
 * whole UTC day at a time through the race day — UTC keeps the keys aligned with
 * the Load Snapshot series, which a renderer also plots by parsed day key.
 *
 * Honesty over guessing (Unavailable Metric principle, ADR 0008): returns null
 * rather than a fabricated curve when the pattern can't be resolved — no phases,
 * a phase missing its weekly load, or no future days between the anchor and the
 * race. Trust gating of the CTL anchor itself is the caller's concern.
 */
export function projectFitnessToRace(opts: {
	phases: ProjectionPhase[]
	anchorCtl: number
	anchorDate: Date
	eventDate: Date
	tssPerHour?: number
}): FitnessProjectionPoint[] | null {
	const { phases, anchorCtl, anchorDate, eventDate } = opts
	const tssPerHour = opts.tssPerHour ?? TSS_PER_PLANNED_HOUR

	if (phases.length === 0) return null
	// The whole pattern must resolve; a single unknown phase load would force a
	// guess for part of the curve, so the projection degrades to Unavailable.
	if (phases.some((p) => p.weeklyLoadHours == null)) return null
	const loaded = phases as Array<{ weeks: number; weeklyLoadHours: number }>

	const totalWeeks = loaded.reduce((sum, p) => sum + p.weeks, 0)
	const planStartMs = eventDate.getTime() - totalWeeks * WEEK_MS

	// Anchor and race snapped to their UTC day so stepping lands on day keys that
	// line up with the measured Load Snapshot series.
	const anchorMs = Date.parse(utcDayKey(anchorDate.getTime()))
	const eventMs = Date.parse(utcDayKey(eventDate.getTime()))

	const points: FitnessProjectionPoint[] = [
		{ date: utcDayKey(anchorMs), ctl: anchorCtl },
	]
	let prevCtl = anchorCtl
	for (let dayMs = anchorMs + DAY_MS; dayMs <= eventMs; dayMs += DAY_MS) {
		const dailyTss =
			(weeklyHoursOn(dayMs, loaded, planStartMs) * tssPerHour) / 7
		prevCtl = prevCtl + (dailyTss - prevCtl) / CTL_DAYS
		points.push({ date: utcDayKey(dayMs), ctl: prevCtl })
	}

	// Only the anchor itself — the race is on or before today, nothing to project.
	if (points.length < 2) return null
	return points
}
