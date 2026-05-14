import { useOptionalHints } from '#app/utils/client-hints.tsx'
import { useOptionalRequestInfo } from '#app/utils/request-info.ts'
import type { UpcomingSession } from './training.server.ts'

type ViewerContext = {
	locale: string
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
	const timeOfDay = new Intl.DateTimeFormat(ctx.locale, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: ctx.timeZone,
	}).format(date)
	const longDate = new Intl.DateTimeFormat(ctx.locale, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: ctx.timeZone,
	}).format(date)
	const shortDate = new Intl.DateTimeFormat(ctx.locale, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: ctx.timeZone,
	}).format(date)
	return { timeOfDay, longDate, shortDate }
}

export function groupByDay(
	sessions: UpcomingSession[],
	ctx: ViewerContext,
): SessionGroup[] {
	const formatter = new Intl.DateTimeFormat(ctx.locale, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: ctx.timeZone,
	})
	const groups = new Map<string, UpcomingSession[]>()
	for (const session of sessions) {
		const key = formatter.format(new Date(session.scheduledAt))
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
	const hints = useOptionalHints()
	const requestInfo = useOptionalRequestInfo()
	const ctx: ViewerContext = {
		timeZone: hints?.timeZone ?? 'UTC',
		locale: requestInfo?.locale ?? 'en-US',
	}
	return {
		presentSession: (session: UpcomingSession) => presentSession(session, ctx),
		groupByDay: (sessions: UpcomingSession[]) => groupByDay(sessions, ctx),
	}
}
