// The server reader for the three week numbers (#505): one Training Week's
// ledger rows and the active plan's targets, through the same pure model home
// reads (`week-volumes.ts`). For a surface that needs a week on its own — the
// Ukeskiftet card's "the week that went", the writing line's week sum —
// without loading home's half-year ledger.

import { localDate, weekMonday } from '../athlete-calendar.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { getActivePlan, getLedgerWeek } from '../training.server.ts'
import { deriveLedgerStatus } from '../training.ts'
import {
	buildWeekVolumes,
	volumeSessionOf,
	type WeekVolumes,
} from './week-volumes.ts'

/**
 * The three numbers per track for the Training Week holding `weekKey` (its
 * Monday), or this week when none is given. Days are graded against `now`.
 */
export async function getWeekVolumes(
	userId: string,
	{ weekKey, now = new Date() }: { weekKey?: string; now?: Date } = {},
): Promise<WeekVolumes> {
	const timezone = await getAthleteTimezone(userId)
	const monday = weekKey ?? weekMonday(now, timezone)
	const [plan, sessions] = await Promise.all([
		getActivePlan(userId, now),
		getLedgerWeek(userId, monday, timezone),
	])
	return buildWeekVolumes({
		weekKey: monday,
		todayKey: localDate(now, timezone),
		planStartWeekKey: plan ? weekMonday(plan.planStart, timezone) : null,
		tracks: plan?.tracks ?? [],
		sessions: sessions.map((session) =>
			volumeSessionOf(session, {
				dayKey: localDate(session.scheduledAt, timezone),
				status: deriveLedgerStatus(session, now),
			}),
		),
	})
}
