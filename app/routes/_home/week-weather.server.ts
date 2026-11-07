/**
 * I dag's weather (#433, ADR 0112 §3 and §6): the **Day Forecast** for today
 * and each of this week's days still ahead, read only by the `/` loader.
 * `readHomeTimeline` stays weather-free, so _Se hele sesongen_ never waits on
 * MET.
 *
 * Only forecasts that exist cross to the screen: on I dag a day with none
 * (beyond the forecast's reach, MET silent with nothing cached) is an
 * absence, never a reason (ADR 0112 §4). Null means no **Home Place**, and
 * then MET is never asked and I dag is exactly ADR 0101 §3's.
 */
import { addDays, localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { readAthleteForecast } from '#app/utils/weather/athlete-forecast.server.ts'
import { type DayForecast } from '#app/utils/weather/day-forecast.ts'

export type WeekWeather = Record<string, DayForecast>

export async function readWeekWeather(
	userId: string,
	now: Date,
): Promise<WeekWeather | null> {
	const timezone = await getAthleteTimezone(userId)
	const todayKey = localDate(now, timezone)
	const monday = weekMonday(now, timezone)
	const dayKeys = Array.from({ length: 7 }, (_, index) =>
		addDays(monday, index),
	).filter((dayKey) => dayKey >= todayKey)
	const forecast = await readAthleteForecast(userId, {
		dayKeys,
		now,
		timezone,
	})
	if (!forecast) return null
	const days: WeekWeather = {}
	for (const [dayKey, result] of forecast) {
		if (!('reason' in result)) days[dayKey] = result
	}
	return days
}
