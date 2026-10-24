// The server reader for the three week numbers (#505): one Training Week's
// ledger rows and the active plan's targets, through the same pure model home
// reads (`week-volumes.ts`). For a surface that needs a week on its own — the
// Ukeskiftet card's "the week that went", the writing line's week sum —
// without loading home's half-year ledger.

import { localDate, weekMonday } from '../athlete-calendar.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { lastClosedWeekKey } from '../load/week-change.ts'
import {
	getActivePlan,
	getDisciplineThresholds,
	getLedgerWeek,
} from '../training.server.ts'
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
	const [plan, sessions, thresholds] = await Promise.all([
		getActivePlan(userId, now),
		getLedgerWeek(userId, monday, timezone),
		getDisciplineThresholds(userId),
	])
	return buildWeekVolumes({
		weekKey: monday,
		todayKey: localDate(now, timezone),
		// From Sunday 20:00 local the week has closed (the Week Replan's own
		// clock), so the Ukeskiftet review grades it through Sunday.
		closed: monday <= lastClosedWeekKey(now, timezone),
		planStartWeekKey: plan ? weekMonday(plan.planStart, timezone) : null,
		tracks: plan?.tracks ?? [],
		sessions: sessions.map((session) =>
			volumeSessionOf(session, {
				dayKey: localDate(session.scheduledAt, timezone),
				status: deriveLedgerStatus(session, now, timezone),
				thresholds,
			}),
		),
	})
}

/**
 * The Actual Volume of one discipline's track in the week holding `weekKey` —
 * what a log just moved — or null where the plan has no track for it. A track
 * with nothing done reads 0 here, the number a "0 → 3 sett" toast starts from.
 */
export async function getWeekTrackActual(
	userId: string,
	{
		weekKey,
		discipline,
		now = new Date(),
	}: { weekKey: string; discipline: string; now?: Date },
): Promise<number | null> {
	const volumes = await getWeekVolumes(userId, { weekKey, now })
	const track = volumes.tracks.find((t) => t.discipline === discipline)
	return track ? (track.actual ?? 0) : null
}
