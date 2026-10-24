/**
 * Binding sets by day (ADR 0098 §1) for reads that state a number per day or
 * per week: the Origin Platforms, aliases included, of every completed
 * session's Recording, keyed by the session's day in the Athlete Timezone.
 * One query for the whole window, so a season's weeks each get their own
 * set — one Strava run closes only its own week, not the season.
 */

import {
	originPlatformOf,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'

export type PlatformsByDay = Map<string, Set<OriginPlatform>>

export async function readRecordedPlatformsByDay(
	userId: string,
	window: { from: Date; to: Date },
	timezone: string,
): Promise<PlatformsByDay> {
	const rows = await prisma.workoutSession.findMany({
		where: {
			userId,
			status: 'completed',
			recordingId: { not: null },
			scheduledAt: { gte: window.from, lte: window.to },
		},
		select: {
			scheduledAt: true,
			recording: {
				select: {
					originPlatform: true,
					aliases: { select: { originPlatform: true } },
				},
			},
		},
	})
	const byDay: PlatformsByDay = new Map()
	for (const row of rows) {
		if (!row.recording) continue
		const day = localDate(row.scheduledAt, timezone)
		const set = byDay.get(day) ?? new Set<OriginPlatform>()
		set.add(originPlatformOf(row.recording.originPlatform))
		for (const alias of row.recording.aliases) {
			set.add(originPlatformOf(alias.originPlatform))
		}
		byDay.set(day, set)
	}
	return byDay
}

/** The binding set of the days `from` … `from + days - 1`. */
export function platformsOver(
	byDay: PlatformsByDay,
	from: string,
	days: number,
): OriginPlatform[] {
	const all = new Set<OriginPlatform>()
	for (let i = 0; i < days; i++) {
		for (const platform of byDay.get(addDays(from, i)) ?? []) all.add(platform)
	}
	return [...all]
}
