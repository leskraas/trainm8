import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import {
	getCtlOnOrBefore,
	getTsbTrust,
} from '#app/utils/load/snapshot.server.ts'
import { type AuthoredSeason } from '#app/utils/training.server.ts'
import { type FitnessAnchor } from './season-chart.ts'
import { readConversionContexts } from './volume-conversion.server.ts'

/**
 * The **season chart**'s server-side inputs (#413), for any surface that
 * mounts it — the plan page, and I dag's large-screen pane beside the list
 * (#505 story 60).
 *
 * Both readings belong to the *athlete*, not to the plan: the per-Discipline
 * conversion context is their zone recipe and thresholds, and the fitness
 * anchor is their measured load history. Handing them over as data keeps every
 * layer the chart draws a pure function the component can recompute as the
 * athlete switches track or currency, with no round trip.
 */
export async function readSeasonChartInputs(
	userId: string,
	season: AuthoredSeason,
) {
	const [conversionContexts, fitnessAnchor] = await Promise.all([
		readConversionContexts(
			userId,
			season.startWeekKey,
			season.tracks.map((track) => track.discipline),
		),
		readFitnessAnchor(userId, season.startWeekKey),
	])
	return { conversionContexts, fitnessAnchor }
}

/**
 * The season's weeks and phases with each one's Monday as the instant of local
 * midnight, so the display layer formats the calendar day the athlete's week
 * actually opens on.
 */
export function withWeekStarts(season: AuthoredSeason) {
	return {
		...season,
		weeks: season.weeks.map((week) => ({
			...week,
			startsAt: dayBoundsUTC(week.weekKey, season.timezone).start,
		})),
		phases: season.phases.map((phase) => ({
			...phase,
			startsAt: dayBoundsUTC(phase.fromWeekKey, season.timezone).start,
		})),
	}
}

/**
 * The measured fitness the season chart's projection opens on, with the trust
 * gate that decides whether it may be used at all (ADR 0008).
 *
 * `null` for an athlete with no load history before their plan starts, and the
 * chart's Fitness layer then declines with that as its reason rather than
 * replaying from a fabricated zero.
 */
export async function readFitnessAnchor(
	userId: string,
	startWeekKey: string,
): Promise<FitnessAnchor | null> {
	const [ctl, trust] = await Promise.all([
		getCtlOnOrBefore(userId, startWeekKey),
		getTsbTrust(userId),
	])
	return ctl == null ? null : { ctl, ...trust }
}
