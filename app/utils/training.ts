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

const statusStyles: Record<string, { label: string; className: string }> = {
	scheduled: {
		label: 'Scheduled',
		className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
	},
	completed: {
		label: 'Completed',
		className:
			'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
	},
	skipped: {
		label: 'Skipped',
		className:
			'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
	},
	missed: {
		label: 'Missed',
		className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
	},
}

export function getStatusStyle(status: string): {
	label: string
	className: string
} {
	return (
		statusStyles[status] ?? {
			label: status.charAt(0).toUpperCase() + status.slice(1),
			className:
				'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
		}
	)
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
