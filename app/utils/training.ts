import type { UpcomingSession } from './training.server.ts'

export type SessionGroup = {
	dateLabel: string
	sessions: UpcomingSession[]
}

type FormatOptions = {
	locale?: Intl.LocalesArgument
	timeZone?: string
}

export function groupSessionsByDay(
	sessions: UpcomingSession[],
	options: FormatOptions = {},
): SessionGroup[] {
	const formatter = new Intl.DateTimeFormat(options.locale, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: options.timeZone,
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

export type StatusBadgeVariant =
	| 'default'
	| 'secondary'
	| 'destructive'
	| 'outline'
	| 'ghost'

export function getStatusVariant(status: string): StatusBadgeVariant {
	switch (status) {
		case 'scheduled':
			return 'secondary'
		case 'completed':
			return 'default'
		case 'skipped':
			return 'outline'
		case 'missed':
			return 'destructive'
		default:
			return 'ghost'
	}
}

export function getStatusLabel(status: string): string {
	return status.charAt(0).toUpperCase() + status.slice(1)
}

export function getActivityLabel(activityType: string): string {
	if (activityType === 'bike') return 'Ride'
	return activityType.charAt(0).toUpperCase() + activityType.slice(1)
}

export function formatSessionTime(
	scheduledAt: Date | string,
	options: FormatOptions = {},
): string {
	return new Intl.DateTimeFormat(options.locale, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: options.timeZone,
	}).format(new Date(scheduledAt))
}
