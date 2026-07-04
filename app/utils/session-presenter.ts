import { useDisplayTimeZone } from '#app/utils/client-hints.tsx'
import {
	formatLongDate,
	formatShortDate,
	formatTime,
} from '#app/utils/format.ts'
import { type UpcomingSession } from './training.server.ts'

/**
 * The display locale is fixed by the shared formatting layer (#172), so the
 * viewer context is just the timezone — the one axis server and client must
 * agree on (they do: it comes from the `timeZone` client-hint cookie).
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
		longDate: formatLongDate(date, ctx.timeZone),
		shortDate: formatShortDate(date, ctx.timeZone),
	}
}

export function groupByDay(
	sessions: UpcomingSession[],
	ctx: ViewerContext,
): SessionGroup[] {
	const groups = new Map<string, UpcomingSession[]>()
	for (const session of sessions) {
		const key = formatLongDate(new Date(session.scheduledAt), ctx.timeZone)
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
	const ctx: ViewerContext = { timeZone: useDisplayTimeZone() }
	return {
		presentSession: (session: UpcomingSession) => presentSession(session, ctx),
		groupByDay: (sessions: UpcomingSession[]) => groupByDay(sessions, ctx),
		formatDayLabel: (date: Date) => formatLongDate(date, ctx.timeZone),
	}
}
