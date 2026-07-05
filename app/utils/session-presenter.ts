import {
	formatDayDate,
	formatDayDateLong,
	formatTime,
} from '#app/utils/format.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type UpcomingSession } from './training.server.ts'

/**
 * Session date/time presentation. Locale is fixed by the shared formatting
 * layer (#172); the only viewer input is the Athlete Timezone, so server and
 * client always render identical markup.
 */
type ViewerContext = {
	timeZone: string
}

export type SessionPresentation = {
	timeOfDay: string
	longDate: string
	shortDate: string
}

export type SessionGroup = {
	dateLabel: string
	sessions: UpcomingSession[]
}

export function presentSession(
	session: UpcomingSession,
	ctx: ViewerContext,
): SessionPresentation {
	const date = new Date(session.scheduledAt)
	return {
		timeOfDay: formatTime(date, ctx.timeZone),
		longDate: formatDayDateLong(date, ctx.timeZone),
		shortDate: formatDayDate(date, ctx.timeZone),
	}
}

export function groupByDay(
	sessions: UpcomingSession[],
	ctx: ViewerContext,
): SessionGroup[] {
	const groups = new Map<string, UpcomingSession[]>()
	for (const session of sessions) {
		const key = formatDayDateLong(new Date(session.scheduledAt), ctx.timeZone)
		const existing = groups.get(key)
		if (existing) {
			existing.push(session)
		} else {
			groups.set(key, [session])
		}
	}
	return Array.from(groups.entries()).map(([dateLabel, sessions]) => ({
		dateLabel,
		sessions,
	}))
}

export function useSessionPresenter() {
	const timeZone = useAthleteTimezone()
	const ctx: ViewerContext = { timeZone }
	return {
		presentSession: (session: UpcomingSession) => presentSession(session, ctx),
		groupByDay: (sessions: UpcomingSession[]) => groupByDay(sessions, ctx),
		formatDayLabel: (date: Date) => formatDayDateLong(date, timeZone),
	}
}
