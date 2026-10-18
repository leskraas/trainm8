// The athlete's history from the database (#505 stories 61–62), which the
// start's first screen pre-fills from (#578): their last four complete weeks
// — the Season Anchor pre-fill's own window (`readAnchorContext`) — plus the
// weekdays they trained on and how far the intervals.icu link has got. What
// it all says is `first-run.ts`'s.

import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import { type OriginPlatform } from '#app/integrations/shared/origin-platform.ts'
import {
	isBackfillInProgress,
	getAccountConnection,
} from '../account-connection.server.ts'
import {
	addDays,
	dayBoundsUTC,
	localDate,
	weekdayIndex,
	weekMonday,
} from '../athlete-calendar.ts'
import { prisma } from '../db.server.ts'
import { readAnchorContext } from '../plan-outline/history.server.ts'
import { ANCHOR_WINDOW_WEEKS } from '../plan-outline/proposal.ts'
import { isPatternWeekday } from '../plan-outline/week-pattern.ts'
import { readRecordedBindingSet } from '../source-terms.server.ts'
import {
	buildFindings,
	type FirstRunConnection,
	type FirstRunFindings,
	type SessionDay,
} from './first-run.ts'

export type FirstRunReading = {
	timezone: string
	connection: FirstRunConnection
	findings: FirstRunFindings
	/**
	 * The Origin Platforms behind the findings (ADR 0098 §1): the recorded
	 * sessions in the same four weeks, for the credits their terms ask of
	 * anything derived from them.
	 */
	bindingSet: OriginPlatform[]
}

export async function readFirstRunFindings(
	userId: string,
	now: Date = new Date(),
): Promise<FirstRunReading> {
	const [context, link] = await Promise.all([
		readAnchorContext(userId, now),
		getAccountConnection(userId, INTERVALSICU_PROVIDER),
	])
	const connection: FirstRunConnection =
		link == null || link.status !== 'active'
			? 'none'
			: isBackfillInProgress(link, now)
				? 'importing'
				: 'ready'

	// The same window `readAnchorContext` sums: the four complete Training Weeks
	// before this one, in the Athlete Timezone.
	const { timezone } = context
	const currentWeekKey = weekMonday(now, timezone)
	const firstWeekKey = addDays(currentWeekKey, -7 * ANCHOR_WINDOW_WEEKS)
	const window = {
		from: dayBoundsUTC(firstWeekKey, timezone).start,
		to: dayBoundsUTC(addDays(currentWeekKey, -1), timezone).end,
	}
	const [sessions, bindingSet] = await Promise.all([
		prisma.workoutSession.findMany({
			where: {
				userId,
				status: 'completed',
				scheduledAt: { gte: window.from, lte: window.to },
			},
			select: { scheduledAt: true },
		}),
		readRecordedBindingSet(userId, window),
	])
	const sessionDays: SessionDay[] = sessions.flatMap((session) => {
		const day = localDate(session.scheduledAt, timezone)
		const weekday = weekdayIndex(day)
		return isPatternWeekday(weekday)
			? [{ weekKey: weekMonday(session.scheduledAt, timezone), weekday }]
			: []
	})

	return {
		timezone,
		connection,
		findings: buildFindings({
			connection,
			volumes: context.volumes,
			weeksTrained: new Set(sessionDays.map((day) => day.weekKey)).size,
			sessionDays,
		}),
		bindingSet,
	}
}
