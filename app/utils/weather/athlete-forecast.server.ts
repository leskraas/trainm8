/**
 * An athlete's **Day Forecasts** (ADR 0112 §3): their **Home Place**, each
 * day's **Forecast Hour** from their own sessions and training time, and the
 * weather module's answer for it. The one read both I dag's `/` loader and
 * `get_today` call, so the today card and an Assistant always see the same
 * weather from the same cache.
 *
 * No Home Place: null, and no call to MET at all.
 */
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { trainingTimeOf } from '#app/utils/athlete-schema.ts'
import { prisma } from '#app/utils/db.server.ts'
import { forecastHours } from './forecast-hour.ts'
import { type DayForecastResult, readDayForecasts } from './forecast.server.ts'

export type AthleteForecast = Map<string, DayForecastResult>

export async function readAthleteForecast(
	userId: string,
	{
		dayKeys,
		now,
		timezone,
	}: {
		/** The days asked about, in order, `YYYY-MM-DD` in the Athlete Timezone. */
		dayKeys: readonly string[]
		now: Date
		timezone: string
	},
): Promise<AthleteForecast | null> {
	const first = dayKeys[0]
	const last = dayKeys.at(-1)
	if (!first || !last) return new Map()
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			defaultTrainingTime: true,
			homePlace: { select: { latitude: true, longitude: true } },
		},
	})
	const place = profile?.homePlace
	if (!place) return null
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: {
				gte: dayBoundsUTC(first, timezone).start,
				lte: dayBoundsUTC(last, timezone).end,
			},
		},
		select: { scheduledAt: true, status: true },
	})
	const hours = forecastHours({
		dayKeys,
		sessions,
		trainingTime: trainingTimeOf(profile),
		timezone,
		now,
	})
	return readDayForecasts(place, hours)
}
