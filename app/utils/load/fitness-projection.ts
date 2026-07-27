// The Fitness Projection: extend the CTL ("fitness") curve forward from today to
// the Target Event by replaying the active Plan Outline's per-week load through
// the same CTL EWMA the measured curve uses (ADR 0008).
//
// Per-week load arrives already derived — from the Season Anchor, the ramps and
// the week roles (ADR 0040 §3) — because no phase carries load any more
// (ADR 0041 §1) and nothing stores a week's number.
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

/**
 * A week's derived volume, in a **Training Track**'s **Volume Currency**, turned
 * into projectable TSS — or null where no honest conversion exists.
 *
 * - `tss` needs none: the track authors the projection's own unit.
 * - `hours` uses the one documented assumption above.
 * - `km` and `sets` return **null**, an Unavailable Metric rather than a guess.
 *   Distance→TSS would go through the retired `KM_PER_HOUR` (ADR 0043 §10), and
 *   sets are a different quantity from endurance load, not a lossy version of it
 *   (ADR 0041). Their successor must be **mix-aware** — a function of volume *and*
 *   the Quality Session Mix (ADR 0043 §8) — and is #385's.
 */
export function plannedWeeklyTss(
	currency: 'km' | 'hours' | 'tss' | 'sets',
	volume: number | null,
): number | null {
	if (volume == null) return null
	if (currency === 'tss') return volume
	if (currency === 'hours') return volume * TSS_PER_PLANNED_HOUR
	return null
}

/** One projected day: a UTC day key (YYYY-MM-DD) and its projected CTL. */
export type FitnessProjectionPoint = { date: string; ctl: number }

/** YYYY-MM-DD for a millisecond instant, in UTC so day stepping never drifts. */
function utcDayKey(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10)
}

/** The weekly TSS active on `dayMs`, by the plan calendar. */
function weeklyTssOn(
	dayMs: number,
	weeklyTss: number[],
	planStartMs: number,
): number {
	const weekIndex = Math.floor((dayMs - planStartMs) / WEEK_MS)
	// Days before the plan starts take its first week; days past its end hold at
	// its last, so a plan that finishes before the Event still projects to race day.
	if (weekIndex < 0) return weeklyTss[0]!
	return weeklyTss[Math.min(weekIndex, weeklyTss.length - 1)]!
}

/**
 * Project daily CTL from `anchorDate` (the most recent measured Load Snapshot)
 * to `eventDate`, replaying the Plan Outline's per-week load through the CTL EWMA.
 * The series opens with the anchor day itself so a renderer can join the dashed
 * projection seamlessly onto the solid measured curve, then steps one whole UTC
 * day at a time through the race day — UTC keeps the keys aligned with the Load
 * Snapshot series, which a renderer also plots by parsed day key.
 *
 * `planStart` is the plan's **authored** first Training Week (ADR 0044 §3), not a
 * count back from the Event: a plan may end before or after its Event, and the
 * curve should show that rather than silently stretch to fit.
 *
 * Honesty over guessing (Unavailable Metric principle, ADR 0008): returns null
 * rather than a fabricated curve when the load can't be resolved — no weeks, any
 * week whose load is unknown, or no future days between the anchor and the race.
 * Trust gating of the CTL anchor itself is the caller's concern.
 */
export function projectFitnessToRace(opts: {
	/** Per plan week, earliest first: the week's projectable TSS, or null. */
	weeklyTss: Array<number | null>
	planStart: Date
	anchorCtl: number
	anchorDate: Date
	eventDate: Date
}): FitnessProjectionPoint[] | null {
	const { weeklyTss, planStart, anchorCtl, anchorDate, eventDate } = opts

	if (weeklyTss.length === 0) return null
	// The whole plan must resolve; a single unknown week would force a guess for
	// part of the curve, so the projection degrades to Unavailable.
	if (weeklyTss.some((tss) => tss == null)) return null
	const resolved = weeklyTss as number[]
	const planStartMs = Date.parse(utcDayKey(planStart.getTime()))

	// Anchor and race snapped to their UTC day so stepping lands on day keys that
	// line up with the measured Load Snapshot series.
	const anchorMs = Date.parse(utcDayKey(anchorDate.getTime()))
	const eventMs = Date.parse(utcDayKey(eventDate.getTime()))

	const points: FitnessProjectionPoint[] = [
		{ date: utcDayKey(anchorMs), ctl: anchorCtl },
	]
	let prevCtl = anchorCtl
	for (let dayMs = anchorMs + DAY_MS; dayMs <= eventMs; dayMs += DAY_MS) {
		const dailyTss = weeklyTssOn(dayMs, resolved, planStartMs) / 7
		prevCtl = prevCtl + (dailyTss - prevCtl) / CTL_DAYS
		points.push({ date: utcDayKey(dayMs), ctl: prevCtl })
	}

	// Only the anchor itself — the race is on or before today, nothing to project.
	if (points.length < 2) return null
	return points
}
