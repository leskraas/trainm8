/**
 * The **Performance Result** writer (#464, ADR 0007 as amended): the athlete's
 * own race and time-trial results, typed on Meg.
 *
 * **A typed result is never `verified`.** The schema reserves `verified` for an
 * effort whose telemetry the app itself read, so a hand-typed figure never
 * masquerades as a measured one; this writer has no telemetry and always
 * writes `false`.
 *
 * **Only the six Race Anchor distances, run only.** A result is the datum a
 * `racePace` target resolves against, and rung 1 matches distance exactly, so
 * the form offers the anchors rather than free metres (a 4.8 km parkrun is not
 * a 5k). Every `racePace` row in the corpus is a run.
 *
 * **One typed result per distance and day** (ADR 0113 §3). A second typed
 * result at the same anchor on the same day is the athlete correcting a typo,
 * so it replaces the first rather than leaving two rows the resolver has to
 * choose between. An Event's result (a row with an `eventId`) is never replaced
 * or deleted here: it is removed on the Event (`event-result.server.ts`), and
 * on the same day the typed one is what the resolver uses.
 *
 * **The athlete's own day.** A result is a calendar day, anchored at UTC
 * midnight as an Event date is, and "in the future" is judged against today in
 * the athlete's timezone — a race finished just after local midnight is not
 * refused because the server is still on yesterday.
 *
 * **A result moves Planned TSS.** A `racePace` step resolves against the newest
 * result at its distance, so adding, replacing or deleting one recomputes the
 * Planned TSS of the athlete's scheduled sessions before it returns (ADR 0019);
 * a session already done keeps the stress it was planned with.
 */
import {
	originPlatformOf,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import { localDate } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { recomputeScheduledPlannedTss } from './load/planned-tss.server.ts'
import {
	isCalendarDay,
	isPlausibleFinishTime,
	type PerformanceSource,
} from './performance-result-entry.ts'
import {
	raceAnchorChoicesForUser,
	raceAnchorForDistance,
} from './performance-result.server.ts'
import { RACE_ANCHOR_DISTANCE_M, type RaceAnchor } from './workout-schema.ts'

export type PerformanceResultInput = {
	anchor: RaceAnchor
	timeSec: number
	/** The day of the result, `YYYY-MM-DD`, in the athlete's calendar. */
	date: string
	source: PerformanceSource
}

export type PerformanceResultRefusal =
	| 'bad-date'
	| 'future'
	| 'implausible'
	| 'no-profile'

export type PerformanceResultRow = {
	id: string
	anchor: RaceAnchor | null
	distanceM: number
	timeSec: number
	occurredAt: Date
	source: string
	verified: boolean
	/** The Event the result was read from, or null for a typed one. */
	event: { id: string; name: string } | null
	/** The credit inputs of the Recording an Event's result came from
	 * (`recordingSource`, ADR 0098 §3); null for a typed result. */
	recording: {
		originPlatform: OriginPlatform
		deviceName: string | null
		aliasOrigins: OriginPlatform[]
	} | null
	/** Whether a `racePace` target at this anchor resolves against this row:
	 * the resolver's own choice, never re-derived here. */
	inUse: boolean
}

/** Every read of the athlete's results goes through this one filter, so the
 * list and the count agree with the resolver: run results only. */
const runResultsOf = (userId: string) => ({
	athleteProfile: { userId },
	discipline: 'run',
})

/** Only rows the athlete typed: what this writer may replace or delete. */
const typedOnly = { eventId: null }

/** The athlete's local calendar day today, `YYYY-MM-DD` (UTC without a
 * profile), for the form's default and limit. */
export async function performanceResultToday(
	userId: string,
	now: Date = new Date(),
): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return localDate(now, profile?.timezone ?? 'UTC')
}

export async function addPerformanceResult(
	userId: string,
	input: PerformanceResultInput,
	now: Date = new Date(),
): Promise<
	| { ok: true; replaced: boolean }
	| { ok: false; reason: PerformanceResultRefusal }
> {
	if (!isCalendarDay(input.date)) return { ok: false, reason: 'bad-date' }
	if (!isPlausibleFinishTime(input.anchor, input.timeSec)) {
		return { ok: false, reason: 'implausible' }
	}
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { id: true, timezone: true },
	})
	if (!profile) return { ok: false, reason: 'no-profile' }
	// Same-shape `YYYY-MM-DD` strings compare as days.
	if (input.date > localDate(now, profile.timezone)) {
		return { ok: false, reason: 'future' }
	}
	const sameDay = {
		athleteProfileId: profile.id,
		discipline: 'run',
		distanceM: RACE_ANCHOR_DISTANCE_M[input.anchor],
		occurredAt: new Date(`${input.date}T00:00:00Z`),
	}
	const [{ count }] = await prisma.$transaction([
		prisma.performanceResult.deleteMany({
			where: { ...sameDay, ...typedOnly },
		}),
		prisma.performanceResult.create({
			data: {
				...sameDay,
				timeSec: input.timeSec,
				source: input.source,
				verified: false,
			},
		}),
	])
	await recomputeScheduledPlannedTss(userId)
	return { ok: true, replaced: count > 0 }
}

/** The athlete's run results, typed and read from Events, newest first (the
 * newest written first on a tie), each saying whether the resolver uses it. */
export async function listPerformanceResults(
	userId: string,
): Promise<PerformanceResultRow[]> {
	const [rows, choices] = await Promise.all([
		prisma.performanceResult.findMany({
			where: runResultsOf(userId),
			orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
			select: {
				id: true,
				distanceM: true,
				timeSec: true,
				occurredAt: true,
				source: true,
				verified: true,
				event: { select: { id: true, name: true } },
				activityImport: {
					select: {
						originPlatform: true,
						deviceName: true,
						aliases: { select: { originPlatform: true } },
					},
				},
			},
		}),
		raceAnchorChoicesForUser(userId, ['run']),
	])
	const chosen = choices.get('run') ?? {}
	return rows.map(({ activityImport, ...row }) => {
		const anchor = raceAnchorForDistance(row.distanceM)
		return {
			...row,
			anchor,
			recording: activityImport
				? {
						originPlatform: originPlatformOf(activityImport.originPlatform),
						deviceName: activityImport.deviceName,
						aliasOrigins: activityImport.aliases.map((alias) =>
							originPlatformOf(alias.originPlatform),
						),
					}
				: null,
			inUse: anchor != null && chosen[anchor]?.id === row.id,
		}
	})
}

/** How many run results the athlete has, for the Meg row. */
export async function countPerformanceResults(userId: string): Promise<number> {
	return prisma.performanceResult.count({ where: runResultsOf(userId) })
}

/** Delete one of the athlete's own typed results; false when it is not
 * theirs, or is an Event's result, which is removed on the Event. */
export async function deletePerformanceResult(
	userId: string,
	id: string,
): Promise<boolean> {
	const { count } = await prisma.performanceResult.deleteMany({
		where: { id, athleteProfile: { userId }, ...typedOnly },
	})
	if (count !== 1) return false
	await recomputeScheduledPlannedTss(userId)
	return true
}
