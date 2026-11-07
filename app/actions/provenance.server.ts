/**
 * Binding sets by day (ADR 0098 §1) for reads that state a number per day or
 * per week: the Origin Platforms, aliases included, of every completed
 * session's Recording, keyed by the session's day in the Athlete Timezone.
 * One query for the whole window, so a season's weeks each get their own
 * set — one Strava run closes only its own week, not the season.
 *
 * `detected` is the same, for the sessions whose Workout was detected from
 * their Recording: their prescribed figures are that Recording's data, so a
 * week's Planned Volume binds to them (`workoutBindingSet`).
 *
 * `plannedTss` is the binding set each session's Planned TSS was computed with
 * (ADR 0113 §4), so a week's Planned TSS takes the union.
 */

import {
	originPlatformOf,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { plannedTssOriginsOf } from '#app/utils/load/planned-tss.ts'

export type PlatformsByDay = Map<string, Set<OriginPlatform>>

export type RecordedPlatforms = {
	/** Every completed session's Recording: what Actual Volume reads. */
	recorded: PlatformsByDay
	/** Only the detected sessions': what their Planned Volume reads. */
	detected: PlatformsByDay
	/** The results each session's Planned TSS read (`plannedTssOrigins`, ADR
	 * 0113 §4): what a week's Planned TSS reads, as the union. */
	plannedTss: PlatformsByDay
}

export async function readRecordedPlatformsByDay(
	userId: string,
	window: { from: Date; to: Date },
	timezone: string,
): Promise<RecordedPlatforms> {
	const inWindow = { gte: window.from, lte: window.to }
	const [rows, planned] = await Promise.all([
		prisma.workoutSession.findMany({
			where: {
				userId,
				status: 'completed',
				recordingId: { not: null },
				scheduledAt: inWindow,
			},
			select: {
				scheduledAt: true,
				source: true,
				recording: {
					select: {
						originPlatform: true,
						aliases: { select: { originPlatform: true } },
					},
				},
			},
		}),
		prisma.workoutSession.findMany({
			where: {
				userId,
				plannedTssValue: { gt: 0 },
				plannedTssOrigins: { not: null },
				scheduledAt: inWindow,
			},
			select: { scheduledAt: true, plannedTssOrigins: true },
		}),
	])
	const recorded: PlatformsByDay = new Map()
	const detected: PlatformsByDay = new Map()
	const plannedTss: PlatformsByDay = new Map()
	const add = (byDay: PlatformsByDay, day: string, platforms: string[]) => {
		const set = byDay.get(day) ?? new Set<OriginPlatform>()
		for (const platform of platforms) set.add(originPlatformOf(platform))
		byDay.set(day, set)
	}
	for (const row of rows) {
		if (!row.recording) continue
		const day = localDate(row.scheduledAt, timezone)
		const platforms = [
			row.recording.originPlatform,
			...row.recording.aliases.map((alias) => alias.originPlatform),
		]
		add(recorded, day, platforms)
		if (row.source === 'detected') add(detected, day, platforms)
	}
	for (const row of planned) {
		add(
			plannedTss,
			localDate(row.scheduledAt, timezone),
			plannedTssOriginsOf(row.plannedTssOrigins),
		)
	}
	return { recorded, detected, plannedTss }
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
