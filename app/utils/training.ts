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
