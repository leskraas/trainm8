/**
 * The window of days I dag reads and lets the athlete write into (ADR 0082,
 * "As built (#505 S11)").
 *
 * One window for both, so a session can only be written where it can be read
 * back and taken away again (ADR 0076). Behind today it is half a year; ahead
 * it is half a year **or the end of the active plan, whichever is later** —
 * so every week the season shows, a collapsed week months out included, can
 * take a session the athlete writes (#505 story 40). The Planning Horizon
 * limits what the app lays, never what the athlete writes.
 */
import {
	addDays,
	daysBetween,
	localDate,
	weekMonday,
} from './athlete-calendar.ts'

/**
 * How far back the timeline reaches. The presenter's start cap states this
 * bound, and no day behind it is built (ADR 0075 §2 and §3).
 */
export const TIMELINE_TRAILING_DAYS = 182

/** How far forward the timeline reaches at the least. */
export const TIMELINE_HORIZON_DAYS = 182

/** The plan as the window reads it: where it starts, how long it runs, its race. */
export type WindowPlan = {
	planStart: Date | string
	phases: ReadonlyArray<{ weeks: number }>
	eventDate: Date | string | null
}

export type TimelineWindow = {
	todayKey: string
	/** The first and last day, `YYYY-MM-DD` in the Athlete Timezone. */
	firstDayKey: string
	lastDayKey: string
	/** Days from today to `lastDayKey` — the ledger query's `horizonDays`. */
	horizonDays: number
}

/** The window for `now`, reaching to the end of `plan` where that is later. */
export function timelineWindow({
	now,
	timezone,
	plan,
}: {
	now: Date
	timezone: string
	plan: WindowPlan | null
}): TimelineWindow {
	const todayKey = localDate(now, timezone)
	let lastDayKey = addDays(todayKey, TIMELINE_HORIZON_DAYS)
	if (plan) {
		const weeks = plan.phases.reduce((sum, phase) => sum + phase.weeks, 0)
		if (weeks > 0) {
			// The Sunday closing the plan's last week.
			const planEnd = addDays(
				weekMonday(new Date(plan.planStart), timezone),
				7 * weeks - 1,
			)
			if (planEnd > lastDayKey) lastDayKey = planEnd
		}
		if (plan.eventDate) {
			const race = localDate(new Date(plan.eventDate), timezone)
			if (race > lastDayKey) lastDayKey = race
		}
	}
	return {
		todayKey,
		firstDayKey: addDays(todayKey, -TIMELINE_TRAILING_DAYS),
		lastDayKey,
		horizonDays: daysBetween(todayKey, lastDayKey),
	}
}

/** Whether a day is inside the window. */
export function isInWindow(dayKey: string, window: TimelineWindow): boolean {
	return dayKey >= window.firstDayKey && dayKey <= window.lastDayKey
}
