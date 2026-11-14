/**
 * **A generated week's Planned Volume, read as _Sesong_ will read it** (#472,
 * ADR 0124).
 *
 * A placed session is placed as its source published it (ADR 0053 §6), so a
 * generated week's **Week Target** and the sum of its sessions are two numbers.
 * This is where the second one is read for the generate preview: outside the
 * `SeasonGenerator` seam, on the server side of `previewSeason`, through the same
 * week model _Sesong_ and _I dag_ read (`buildWeekVolumes`). The generator never
 * states a sum about its own sessions.
 *
 * Pure. The caller reads the rows (the Stock Workouts approval copies, and the
 * athlete's sessions already in the season's weeks) and hands them in as
 * {@link VolumeSession}s; this only lays the season's targets out as the week
 * model's tracks and groups the sessions by the week they fall in. It returns
 * numbers and codes. The words go on at the edge (`wordTrackWeek`).
 */
import { mondayOfDay } from '../athlete-calendar.ts'
import {
	buildWeekVolumes,
	type PlanTrackTargets,
	type VolumeSession,
	type WeekVolumes,
} from '../plan-outline/week-volumes.ts'
import { type GeneratedSeason } from './season.ts'

/** One preview week's three numbers per track, and what its card says beside them. */
export type PreviewWeekVolumes = {
	weekKey: string
	volumes: WeekVolumes
	/**
	 * Whether the week holds any session at all, placed or already there. The
	 * `≠` mark is gated on it, per week and not per track, as on _Sesong_: a week
	 * nothing is written in is unwritten, not underplanned.
	 */
	hasSessions: boolean
	/**
	 * How many of the week's sessions the athlete already had that a track's
	 * planned figure counts: approval deletes none of them (ADR 0124 §4), and the
	 * card says so, or the figure would be larger than the rows under it. A
	 * session in Annet, on no season track, or with no prescription is not one.
	 */
	existingSessions: number
}

/**
 * The generated season's tracks as the week model reads a plan's: one per track,
 * its Week Target per season week. A generated season sets no **Week Volume
 * Override** and no strength track (`GENERATION_UNAVAILABLE_READINGS`).
 */
export function seasonTrackTargets(
	season: GeneratedSeason,
): PlanTrackTargets[] {
	return season.tracks.map((track) => ({
		trackId: `generated-${track.discipline}`,
		discipline: track.discipline,
		currency: track.currency,
		targets: season.weeks.map(
			(week) =>
				week.targets.find((target) => target.discipline === track.discipline)
					?.value ?? null,
		),
		overridden: season.weeks.map(() => false),
		sessionTargets: null,
	}))
}

/**
 * Every season week's numbers, over the week as approval would leave it: the
 * sessions the generator placed and the athlete's own already in that week.
 */
export function previewWeekVolumes({
	season,
	placed,
	existing,
	todayKey,
}: {
	season: GeneratedSeason
	/** The placed sessions, each read off the Stock Workout approval copies. */
	placed: readonly VolumeSession[]
	/** The athlete's sessions already in the season's weeks, as _Sesong_ reads them. */
	existing: readonly VolumeSession[]
	/** Today in the Athlete Timezone: which days are past. */
	todayKey: string
}): PreviewWeekVolumes[] {
	const tracks = seasonTrackTargets(season)
	const byWeek = (sessions: readonly VolumeSession[]) => {
		const weeks = new Map<string, VolumeSession[]>()
		for (const session of sessions) {
			const monday = mondayOfDay(session.dayKey)
			weeks.set(monday, [...(weeks.get(monday) ?? []), session])
		}
		return weeks
	}
	const placedByWeek = byWeek(placed)
	const existingByWeek = byWeek(existing)
	return season.weeks.map((week) => {
		const theirs = existingByWeek.get(week.weekKey) ?? []
		const sessions = [...(placedByWeek.get(week.weekKey) ?? []), ...theirs]
		const volumesOf = (over: readonly VolumeSession[]) =>
			buildWeekVolumes({
				weekKey: week.weekKey,
				todayKey,
				planStartWeekKey: season.startWeekKey,
				tracks,
				sessions: over,
			})
		// The athlete's sessions a track's planned figure reads, counted by the
		// week model itself (each track's `sessions.planned`), so the card's
		// "already in this week" line follows the model's rule for which sessions
		// `planlagt` counts, and never a copy of it.
		const existingSessions =
			theirs.length === 0
				? 0
				: volumesOf(theirs).tracks.reduce(
						(n, track) => n + track.sessions.planned,
						0,
					)
		return {
			weekKey: week.weekKey,
			volumes: volumesOf(sessions),
			hasSessions: sessions.length > 0,
			existingSessions,
		}
	})
}
