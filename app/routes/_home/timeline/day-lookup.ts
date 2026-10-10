/**
 * A day of the season by its key, and its name — read by the day pane, the
 * Sheet and the composer, so the three name a day the same way.
 */
import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { dayPaneTitle } from '#app/utils/labels.ts'
import {
	type TimelineDay,
	type TimelineSession,
	type TimelineWeek,
} from './presenter.ts'

/** The day `key` and the week it sits in, or null where the season has none. */
export function findDay(
	weeks: readonly TimelineWeek[],
	key: string,
): { week: TimelineWeek; day: TimelineDay } | null {
	for (const week of weeks) {
		if (key < week.key) continue
		const day = week.rows.find((row) => row.key === key)
		if (day) return { week, day }
	}
	return null
}

/** A session of the season by its id and its day, or null. */
export function findSession(
	weeks: readonly TimelineWeek[],
	dayKey: string,
	sessionId: string,
): { week: TimelineWeek; day: TimelineDay; session: TimelineSession } | null {
	const found = findDay(weeks, dayKey)
	const session = found?.day.sessions.find((s) => s.id === sessionId)
	return found && session ? { ...found, session } : null
}

/** `torsdag 17. sep`, from the day's own key. */
export function dayTitle(key: string): string {
	return dayPaneTitle(
		weekdayIndex(key),
		Number(key.slice(8, 10)),
		Number(key.slice(5, 7)) - 1,
	)
}
