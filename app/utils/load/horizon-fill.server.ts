/**
 * Laying the active plan's weeks onto the calendar, as the week change does
 * (#505 S4): the horizon week at each close, and — when an open-ended plan's
 * next round is appended (S6) — the weeks between the round's start and the
 * horizon, which the closes before the append found past the plan's end.
 * Either way through the ordinary stamp, as `generated` sessions, and never
 * into a week the plan has laid already.
 */

import { addDays, localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { stampWeekPattern } from '#app/utils/plan-outline/stamp.server.ts'
import {
	countPlanLaidSessions,
	readWeekOccupancy,
} from '#app/utils/plan-outline/week-sessions.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { horizonWeekKey, lastClosedWeekKey } from './week-change.ts'

/**
 * Lay the active plan's Week Pattern into one week, as `generated`
 * sessions, unless the plan has laid that week already. Returns how many
 * sessions were laid (0 when there was nothing to lay).
 *
 * The first pattern of the outline is the plan's week: an outline may hold
 * more than one, and the athlete stamps the others by hand.
 */
export async function fillPlanWeek(
	userId: string,
	weekKey: string,
	timezone: string,
	now: Date,
): Promise<{ weekKey: string; sessions: number }> {
	const nothing = { weekKey, sessions: 0 }
	const active = await findActiveOutline(userId, now)
	if (!active) return nothing
	const pattern = await prisma.weekPattern.findFirst({
		where: { outlineId: active.outline.id, days: { some: {} } },
		orderBy: { orderIndex: 'asc' },
		select: { id: true },
	})
	if (!pattern) return nothing

	// Already laid — by the athlete's own stamp of many weeks, or a copy: the
	// plan's sessions there are the plan's week, and laying it again would
	// replace them for nothing, or (when the athlete adopted every one of them)
	// lay the week a second time beside them. Sessions the athlete wrote
	// themselves do not count as laid.
	const [occupancy, laid] = await Promise.all([
		readWeekOccupancy(userId, active.outline.id, weekKey, timezone),
		countPlanLaidSessions(userId, active.outline.id, weekKey, timezone),
	])
	if (occupancy.replacing > 0 || laid > 0) return nothing

	// `replace` because the athlete's own sessions in the week would otherwise
	// stop the stamp at its confirmation gate. The stamp's clearing only ever
	// removes the machine's untrained sessions, and there are none here.
	//
	// The same for an open-ended plan (ADR 0079): it has no end date, so "past
	// the plan's end" means past its last phase, and the stamp refuses a week
	// there (`week-outside-plan`) until the next round is appended — whose apply
	// then lays those weeks (`fillPlanWeeksToHorizon`).
	const stamped = await stampWeekPattern(
		userId,
		{ patternId: pattern.id, weekKeys: [weekKey], replace: true },
		now,
	)
	return stamped.ok ? { weekKey, sessions: stamped.report.sessions } : nothing
}

/**
 * Lay every week from `fromWeekKey` through the current Planning Horizon (the
 * last closed week's horizon week) that the plan has not laid yet — what an
 * appended round needs, since the closes before it found those weeks past the
 * plan's end. The current week is laid only on its Monday: later in the week
 * its first days are behind the athlete, and laying sessions there would read
 * as _ikke gjort_ on days nobody planned. Returns the sessions laid per week.
 */
export async function fillPlanWeeksToHorizon(
	userId: string,
	fromWeekKey: string,
	timezone: string,
	now: Date,
): Promise<Array<{ weekKey: string; sessions: number }>> {
	const thisMonday = weekMonday(now, timezone)
	const first =
		localDate(now, timezone) === thisMonday
			? thisMonday
			: addDays(thisMonday, 7)
	const horizon = horizonWeekKey(lastClosedWeekKey(now, timezone))
	const filled = []
	for (
		let weekKey = fromWeekKey > first ? fromWeekKey : first;
		weekKey <= horizon;
		weekKey = addDays(weekKey, 7)
	) {
		filled.push(await fillPlanWeek(userId, weekKey, timezone, now))
	}
	return filled
}
