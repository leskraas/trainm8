/**
 * Laying the active plan's weeks onto the calendar, as the week change does
 * (#505 S4): the horizon week at each close, and — when an open-ended plan's
 * next round is appended or the plan gains an Event (S6) — every week not yet
 * begun up to the horizon that the plan has not laid.
 * Either way through the ordinary stamp, as `generated` sessions, and never
 * into a week the plan has laid already.
 */

import { addDays } from '#app/utils/athlete-calendar.ts'
import { layGeneratedWeek } from '#app/utils/plan-generation/relay.server.ts'
import { stampWeekPattern } from '#app/utils/plan-outline/stamp.server.ts'
import {
	countPlanLaidSessions,
	readWeekOccupancy,
} from '#app/utils/plan-outline/week-sessions.server.ts'
import { readPlanWeekSource } from '#app/utils/plan-outline/week-source.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { readFirstUnbegunWeekKey } from './week-begun.server.ts'
import {
	horizonWeekKey,
	lastClosedWeekKey,
	type UnlaidReason,
} from './week-change.ts'

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
	const { sessions } = await layPlanWeek(userId, weekKey, timezone, now)
	return { weekKey, sessions }
}

/**
 * {@link fillPlanWeek}, also saying why a week it did not lay was not laid
 * (`unlaid`): null when it laid the week, the plan had laid it already, or
 * nobody expected anything laid there.
 */
export async function layPlanWeek(
	userId: string,
	weekKey: string,
	timezone: string,
	now: Date,
): Promise<{ weekKey: string; sessions: number; unlaid: UnlaidReason | null }> {
	const nothing = (unlaid: UnlaidReason | null = null) => ({
		weekKey,
		sessions: 0,
		unlaid,
	})
	const active = await findActiveOutline(userId, now)
	if (!active) return nothing()
	const source = await readPlanWeekSource(active.outline.id)
	if (source.kind === 'none') return nothing('no-pattern')

	// Already laid — by the athlete's own stamp of many weeks, or a copy: the
	// plan's sessions there are the plan's week, and laying it again would
	// replace them for nothing, or (when the athlete adopted every one of them)
	// lay the week a second time beside them. Sessions the athlete wrote
	// themselves do not count as laid.
	const [occupancy, laid] = await Promise.all([
		readWeekOccupancy(userId, active.outline.id, weekKey, timezone),
		countPlanLaidSessions(userId, active.outline.id, weekKey, timezone),
	])
	if (occupancy.replacing > 0 || laid > 0) return nothing()

	// A generated plan's unlaid week is laid by its generator, on the days
	// stored at approval (ADR 0113 §3).
	if (source.kind === 'generated') {
		if (weekKey < active.outline.startWeekKey) return nothing()
		const generated = await layGeneratedWeek(
			userId,
			active.outline.id,
			weekKey,
			timezone,
		)
		if (!generated) return nothing('no-pattern')
		if (generated.outside) return nothing('past-plan-end')
		return {
			weekKey,
			sessions: generated.sessions,
			unlaid: generated.sessions > 0 ? null : 'nothing-to-lay',
		}
	}

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
		{ patternId: source.patternId, weekKeys: [weekKey], replace: true },
		now,
	)
	if (stamped.ok) {
		return { weekKey, sessions: stamped.report.sessions, unlaid: null }
	}
	switch (stamped.reason) {
		case 'pattern-gone':
		case 'pattern-empty':
			return nothing('no-pattern')
		case 'week-outside-plan':
			// A week before the plan starts is one nobody expected laid.
			return nothing(
				weekKey < active.outline.startWeekKey ? null : 'past-plan-end',
			)
		case 'nothing-to-stamp':
			return nothing('nothing-to-lay')
		default:
			// A plan resting behind a race lays nothing here, by design.
			return nothing()
	}
}

/**
 * Lay every week from the first one not yet begun through the current Planning
 * Horizon (the last closed week's horizon week) that the plan has not laid
 * yet — what an appended round, or a plan that just gained an Event, needs:
 * the closes before found those weeks past the plan's end. A week already
 * begun is left alone, since laying sessions on days behind the athlete would
 * read as _ikke gjort_ on days nobody planned. Returns the sessions laid per
 * week.
 */
export async function fillPlanWeeksToHorizon(
	userId: string,
	timezone: string,
	now: Date,
): Promise<Array<{ weekKey: string; sessions: number }>> {
	const horizon = horizonWeekKey(lastClosedWeekKey(now, timezone))
	const filled = []
	for (
		let weekKey = await readFirstUnbegunWeekKey(userId, now, timezone);
		weekKey <= horizon;
		weekKey = addDays(weekKey, 7)
	) {
		filled.push(await fillPlanWeek(userId, weekKey, timezone, now))
	}
	return filled
}
