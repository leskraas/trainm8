import { requireUserId } from '#app/utils/auth.server.ts'
import {
	readSeasonChartInputs,
	withWeekStarts,
} from '#app/utils/plan-outline/season-chart.server.ts'
import { getActiveSeason } from '#app/utils/training.server.ts'
import { type Route } from './+types/home-season.ts'

/**
 * The active plan's season, for the curve I dag shows beside its list on a
 * large screen (#505 story 60).
 *
 * Its own resource route rather than more of home's loader, because only the
 * large-screen layout draws the chart: a phone never asks, so a phone never
 * pays for the season read and the conversion contexts on every home load.
 * The same readings the plan page's chart takes (`season-chart.server.ts`), so
 * the two curves cannot disagree.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// A failed read answers as data rather than throwing — the recorded
	// exception, ADR 0082 §11: a fetcher's error would reach home's own error
	// boundary and take the list down with a pane that is only ever extra. The
	// pane says the curve could not load, quietly.
	try {
		const season = await getActiveSeason(userId)
		if (!season) return { season: null, failed: false as const }
		return {
			season: withWeekStarts(season),
			failed: false as const,
			...(await readSeasonChartInputs(userId, season)),
		}
	} catch (error) {
		console.error('[home-season] the season pane could not be read', error)
		return { season: null, failed: true as const }
	}
}
