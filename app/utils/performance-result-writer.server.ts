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
 */
import { prisma } from './db.server.ts'
import { raceAnchorForDistance } from './performance-result.server.ts'
import { RACE_ANCHOR_DISTANCE_M, type RaceAnchor } from './workout-schema.ts'

export const PERFORMANCE_SOURCES = ['race', 'timeTrial'] as const
export type PerformanceSource = (typeof PERFORMANCE_SOURCES)[number]

export type PerformanceResultInput = {
	anchor: RaceAnchor
	timeSec: number
	occurredAt: Date
	source: PerformanceSource
}

export type PerformanceResultRow = {
	id: string
	anchor: RaceAnchor | null
	distanceM: number
	timeSec: number
	occurredAt: Date
	source: string
	verified: boolean
}

/** A finish time as a race clock writes it — `41:30` or `1:32:00` — in
 * seconds, or null. A bare number is refused: `41` could be minutes or
 * seconds, and guessing would put a pace nobody ran behind a target. */
export function parseFinishTime(input: string): number | null {
	const match = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(input.trim())
	if (!match) return null
	const hours = Number(match[1] ?? 0)
	const minutes = Number(match[2])
	if (match[1] != null && minutes > 59) return null
	const total = hours * 3600 + minutes * 60 + Number(match[3])
	return total > 0 ? total : null
}

export async function addPerformanceResult(
	userId: string,
	input: PerformanceResultInput,
	now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'future' | 'no-profile' }> {
	if (input.occurredAt.getTime() > now.getTime()) {
		return { ok: false, reason: 'future' }
	}
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { id: true },
	})
	if (!profile) return { ok: false, reason: 'no-profile' }
	await prisma.performanceResult.create({
		data: {
			athleteProfileId: profile.id,
			discipline: 'run',
			distanceM: RACE_ANCHOR_DISTANCE_M[input.anchor],
			timeSec: input.timeSec,
			occurredAt: input.occurredAt,
			source: input.source,
			verified: false,
		},
	})
	return { ok: true }
}

/** The athlete's results, newest first. */
export async function listPerformanceResults(
	userId: string,
): Promise<PerformanceResultRow[]> {
	const rows = await prisma.performanceResult.findMany({
		where: { athleteProfile: { userId } },
		orderBy: { occurredAt: 'desc' },
		select: {
			id: true,
			distanceM: true,
			timeSec: true,
			occurredAt: true,
			source: true,
			verified: true,
		},
	})
	return rows.map((row) => ({
		...row,
		anchor: raceAnchorForDistance(row.distanceM),
	}))
}

/** Delete one of the athlete's own results; false when it is not theirs. */
export async function deletePerformanceResult(
	userId: string,
	id: string,
): Promise<boolean> {
	const { count } = await prisma.performanceResult.deleteMany({
		where: { id, athleteProfile: { userId } },
	})
	return count === 1
}
