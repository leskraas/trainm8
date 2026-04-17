import type { UpcomingSession } from './training.server.ts'

export type SessionGroup = {
	dateLabel: string
	sessions: UpcomingSession[]
}

export function groupSessionsByDay(
	sessions: UpcomingSession[],
	timeZone?: string,
): SessionGroup[] {
	const formatter = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone,
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

export function formatSessionTime(
	scheduledAt: Date | string,
	timeZone?: string,
): string {
	return new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone,
	}).format(new Date(scheduledAt))
}
