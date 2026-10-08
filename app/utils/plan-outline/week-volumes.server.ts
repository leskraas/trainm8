// The server reader for the three week numbers (#505): one Training Week's
// ledger rows and the active plan's targets, through the same pure model home
// reads (`week-volumes.ts`). For a surface that needs a week on its own — the
// Ukeskiftet card's "the week that went", the writing line's week sum —
// without loading home's half-year ledger.

import { localDate, weekMonday } from '../athlete-calendar.ts'
import { getAthleteTimezone } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import { lastClosedWeekKey } from '../load/week-change.ts'
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
		// From Sunday 20:00 local the week has closed (the Week Replan's own
		// clock), so the Ukeskiftet review grades it through Sunday.
		closed: monday <= lastClosedWeekKey(now, timezone),
		planStartWeekKey: plan ? weekMonday(plan.planStart, timezone) : null,
		tracks: plan?.tracks ?? [],
		sessions: sessions.map((session) =>
			volumeSessionOf(session, {
				dayKey: localDate(session.scheduledAt, timezone),
				status: deriveLedgerStatus(session, now, timezone),
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

export type CountsInNoTrackResult =
	| { ok: true }
	| { ok: false; reason: 'session-not-found' }

/**
 * Put one of the athlete's sessions in **Annet**, or take it back into its
 * track (#505 story 33): a bike commute on a plan with a ride track, say. It
 * moves no track's Planned or Actual Volume while it is there; its TSS still
 * feeds Training Load.
 *
 * Owner-scoped: another athlete's session is not found. Written without
 * touching `updatedAt`, because the Week Replan reads `updatedAt` as "the
 * athlete changed this session since the proposal" (the stale guard in
 * `week-replan-proposals.server.ts`), and choosing which track a session counts
 * in changes nothing a proposal was written against. It neither adopts nor
 * releases the session for the same reason.
 */
export async function setCountsInNoTrack(
	userId: string,
	sessionId: string,
	countsInNoTrack: boolean,
): Promise<CountsInNoTrackResult> {
	const updated = await prisma.$executeRaw`
		UPDATE "WorkoutSession"
		SET "countsInNoTrack" = ${countsInNoTrack}
		WHERE "id" = ${sessionId} AND "userId" = ${userId}`
	return updated === 0
		? { ok: false, reason: 'session-not-found' }
		: { ok: true }
}
