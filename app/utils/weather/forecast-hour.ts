/**
 * **Forecast Hour** (ADR 0112 §3, glossary): the hour a day's **Day Forecast**
 * is for. One pure rule, read by I dag's loader and by `get_today` alike, so
 * the card and an Assistant always ask MET about the same hour.
 *
 * For each day from today on: the start of the day's first session not yet
 * done, else the athlete's default training time (`trainingTimeOf`, which
 * already falls back to 07:00). Today, once that time has passed, the coming
 * hour instead: a passed hour has no forecast left, and the next one is what
 * the athlete would meet if they went now. Past days get no hour at all.
 *
 * Everything is a UTC instant built from the Athlete Timezone, floored to the
 * whole UTC hour MET's steps start on (a session at 17:30 reads the 17:00
 * step, which covers it).
 */
import { localDate, localTimeUTC } from '#app/utils/athlete-calendar.ts'

const HOUR_MS = 60 * 60 * 1000

export type ForecastHourSession = {
	scheduledAt: Date | string
	/** `WorkoutSession.status`: a `completed` session is done and passed over. */
	status: string
}

export function forecastHours({
	dayKeys,
	sessions,
	trainingTime,
	timezone,
	now,
}: {
	/** The days to give an hour, `YYYY-MM-DD` in the Athlete Timezone. */
	dayKeys: readonly string[]
	sessions: readonly ForecastHourSession[]
	/** `trainingTimeOf(profile)`: `HH:MM`, local. */
	trainingTime: string
	timezone: string
	now: Date
}): Map<string, Date> {
	const todayKey = localDate(now, timezone)
	const firstOpen = new Map<string, Date>()
	for (const session of sessions) {
		if (session.status === 'completed') continue
		const at = new Date(session.scheduledAt)
		const key = localDate(at, timezone)
		const earlier = firstOpen.get(key)
		if (!earlier || at < earlier) firstOpen.set(key, at)
	}
	const hours = new Map<string, Date>()
	for (const dayKey of dayKeys) {
		if (dayKey < todayKey) continue
		const at =
			firstOpen.get(dayKey) ?? localTimeUTC(dayKey, trainingTime, timezone)
		hours.set(
			dayKey,
			dayKey === todayKey && at < now ? comingHour(now) : floorHour(at),
		)
	}
	return hours
}

function floorHour(at: Date): Date {
	return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS)
}

/** The next whole hour from `now` (now itself when it is on the hour). */
function comingHour(now: Date): Date {
	return new Date(Math.ceil(now.getTime() / HOUR_MS) * HOUR_MS)
}
