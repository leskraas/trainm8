/**
 * **An Event's result**, kept true (ADR 0113 §2). An Event's result is a
 * `PerformanceResult` row carrying its provenance (`eventId`,
 * `activityImportId`), and this module is the only code that creates,
 * rewrites or deletes one. It reads the Event, its result session and that
 * session's Recording, asks the pure rule (`eventResultFrom`) whether they
 * make a result, and makes the row match.
 *
 * Every path that changes one of those inputs runs its change inside
 * {@link keepEventResultsInStep}: linking, unlinking, cancelling, editing and
 * deleting an Event; setting its distance; linking, moving or lifting a
 * Recording; a source refreshing or removing it; deleting a session. The
 * wrapper notes the Events the change can reach and their rows before it
 * runs, reconciles each after, and recomputes the Planned TSS of the
 * athlete's `scheduled` sessions only when a row changed (ADR 0019): a
 * session already done keeps the stress it was planned with. The database
 * cascades are a backstop for deletes that bypass these paths (account
 * deletion), not the mechanism.
 */
import { type Prisma } from '@prisma/client'
import {
	originPlatformOf,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import { prisma } from './db.server.ts'
import { eventResultFrom, type EventResultVerdict } from './event-result.ts'
import { recomputeScheduledPlannedTss } from './load/planned-tss.server.ts'
import {
	raceAnchorChoicesForUser,
	raceAnchorForDistance,
} from './performance-result.server.ts'
import { type RaceAnchor } from './workout-schema.ts'

const eventInputsSelect = {
	id: true,
	athleteId: true,
	kind: true,
	status: true,
	disciplines: true,
	distanceM: true,
	resultSessionId: true,
	resultSession: {
		select: {
			scheduledAt: true,
			recording: {
				select: {
					id: true,
					discipline: true,
					distanceM: true,
					startedAt: true,
					endedAt: true,
				},
			},
		},
	},
} satisfies Prisma.EventSelect

type EventInputs = Prisma.EventGetPayload<{ select: typeof eventInputsSelect }>

const resultRowSelect = {
	id: true,
	distanceM: true,
	timeSec: true,
	occurredAt: true,
	source: true,
	verified: true,
	activityImportId: true,
} satisfies Prisma.PerformanceResultSelect

type StoredRow = Prisma.PerformanceResultGetPayload<{
	select: typeof resultRowSelect
}>

/** What a stored row says, so "did the row change" is one comparison. */
function fingerprint(row: StoredRow | null): string | null {
	if (!row) return null
	return [
		row.distanceM,
		row.timeSec,
		row.occurredAt.toISOString(),
		row.source,
		row.verified,
		row.activityImportId,
	].join('|')
}

async function timezoneOf(userId: string): Promise<string> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return profile?.timezone ?? 'UTC'
}

/** The rule's verdict for one Event as it stands. */
export function verdictFor(
	event: EventInputs,
	timezone: string,
): EventResultVerdict {
	return eventResultFrom(
		event,
		event.resultSession,
		event.resultSession?.recording ?? null,
		timezone,
	)
}

/**
 * Make one Event's row match the rule: create, rewrite or delete it.
 * Idempotent. Returns the row's fingerprint after, or null when it has none.
 */
async function writeEventResult(eventId: string): Promise<string | null> {
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: eventInputsSelect,
	})
	const stored = await prisma.performanceResult.findUnique({
		where: { eventId },
		select: resultRowSelect,
	})
	// A deleted Event's row went with it (cascade); nothing is left to write.
	if (!event) return null
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: event.athleteId },
		select: { id: true, timezone: true },
	})
	const verdict = profile ? verdictFor(event, profile.timezone) : null
	if (!profile || verdict?.kind !== 'result') {
		if (stored) {
			await prisma.performanceResult.deleteMany({ where: { eventId } })
		}
		return null
	}
	const { result } = verdict
	const data = {
		discipline: result.discipline,
		distanceM: result.distanceM,
		timeSec: result.timeSec,
		occurredAt: new Date(`${result.day}T00:00:00Z`),
		source: result.source,
		verified: result.verified,
		activityImportId: result.activityImportId,
	}
	const written = await prisma.performanceResult.upsert({
		where: { eventId },
		create: { ...data, eventId, athleteProfileId: profile.id },
		update: data,
		select: resultRowSelect,
	})
	return fingerprint(written)
}

/** What a change may reach: Events by id, and the Events whose result session
 * is one of these sessions. */
export type EventResultScope = {
	eventIds?: readonly string[]
	sessionIds?: readonly (string | null | undefined)[]
}

async function eventsIn(
	scope: EventResultScope,
): Promise<Array<{ id: string; athleteId: string }>> {
	const eventIds = [...new Set(scope.eventIds ?? [])]
	const sessionIds = [
		...new Set(
			(scope.sessionIds ?? []).filter((id): id is string => Boolean(id)),
		),
	]
	if (eventIds.length === 0 && sessionIds.length === 0) return []
	return prisma.event.findMany({
		where: {
			OR: [
				...(eventIds.length ? [{ id: { in: eventIds } }] : []),
				...(sessionIds.length ? [{ resultSessionId: { in: sessionIds } }] : []),
			],
		},
		select: { id: true, athleteId: true },
	})
}

/**
 * Run `change`, then bring every Event it can reach back in step (ADR 0113
 * §2). The Events and their rows are read **before** the change, so a delete
 * that takes the Event, the session or the Recording with it still counts as
 * a row that changed, and the Planned TSS it moved is recomputed.
 */
export async function keepEventResultsInStep<T>(
	scope: EventResultScope,
	change: () => Promise<T>,
): Promise<T> {
	const events = await eventsIn(scope)
	const before = new Map<string, string | null>()
	for (const event of events) {
		before.set(
			event.id,
			fingerprint(
				await prisma.performanceResult.findUnique({
					where: { eventId: event.id },
					select: resultRowSelect,
				}),
			),
		)
	}
	const outcome = await change()
	const moved = new Set<string>()
	for (const event of events) {
		const after = await writeEventResult(event.id)
		if (after !== before.get(event.id)) moved.add(event.athleteId)
	}
	for (const userId of moved) await recomputeScheduledPlannedTss(userId)
	return outcome
}

/** Reconcile one Event as it stands now: what a path with nothing else to
 * change calls (`keepEventResultsInStep` with a no-op change). */
export async function reconcileEventResult(eventId: string): Promise<void> {
	await keepEventResultsInStep({ eventIds: [eventId] }, async () => {})
}

/** The rule's verdict for one of the athlete's Events, for the Event page. */
export async function readEventResultVerdict(
	userId: string,
	eventId: string,
): Promise<EventResultVerdict | null> {
	const event = await prisma.event.findFirst({
		where: { id: eventId, athleteId: userId },
		select: eventInputsSelect,
	})
	if (!event) return null
	return verdictFor(event, await timezoneOf(userId))
}

/** How the Event's result sits with the resolver, read off its choice
 * (ADR 0113 §3), never re-derived. */
export type EventResultUse =
	| 'in-use'
	| 'typed-same-day'
	| 'newer'
	| 'not-anchor'

export type EventResultView = {
	verdict: EventResultVerdict
	stored: {
		id: string
		distanceM: number
		timeSec: number
		anchor: RaceAnchor | null
		use: EventResultUse
		recording: {
			originPlatform: OriginPlatform
			deviceName: string | null
			aliasOrigins: OriginPlatform[]
		} | null
	} | null
}

/** What the Event page's result section shows: the rule's verdict, and the
 * stored row with its credit inputs and how the resolver uses it. */
export async function readEventResultView(
	userId: string,
	eventId: string,
): Promise<EventResultView | null> {
	const verdict = await readEventResultVerdict(userId, eventId)
	if (!verdict) return null
	const row = await prisma.performanceResult.findUnique({
		where: { eventId },
		select: {
			id: true,
			distanceM: true,
			timeSec: true,
			occurredAt: true,
			activityImport: {
				select: {
					originPlatform: true,
					deviceName: true,
					aliases: { select: { originPlatform: true } },
				},
			},
		},
	})
	if (!row) return { verdict, stored: null }
	const anchor = raceAnchorForDistance(row.distanceM)
	let use: EventResultUse = 'not-anchor'
	if (anchor) {
		const chosen = (await raceAnchorChoicesForUser(userId, ['run'])).get(
			'run',
		)?.[anchor]
		if (!chosen || chosen.id === row.id) use = 'in-use'
		else {
			const other = await prisma.performanceResult.findUnique({
				where: { id: chosen.id },
				select: { occurredAt: true, eventId: true },
			})
			use =
				other?.eventId == null &&
				other?.occurredAt.getTime() === row.occurredAt.getTime()
					? 'typed-same-day'
					: 'newer'
		}
	}
	const { activityImport } = row
	return {
		verdict,
		stored: {
			id: row.id,
			distanceM: row.distanceM,
			timeSec: row.timeSec,
			anchor,
			use,
			recording: activityImport
				? {
						originPlatform: originPlatformOf(activityImport.originPlatform),
						deviceName: activityImport.deviceName,
						aliasOrigins: activityImport.aliases.map((alias) =>
							originPlatformOf(alias.originPlatform),
						),
					}
				: null,
		},
	}
}
