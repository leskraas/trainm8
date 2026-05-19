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

export function getDisciplineLabel(discipline: string): string {
	if (discipline === 'bike') return 'Ride'
	return discipline.charAt(0).toUpperCase() + discipline.slice(1)
}

/** Returns discipline from workout if present, falls back to recording discipline. */
export function getSessionDiscipline(session: {
	workout: { discipline: string } | null
	recording: { discipline: string } | null
}): string {
	return session.workout?.discipline ?? session.recording?.discipline ?? 'run'
}

/** True when the session has no linked workout (was created from a recording only). */
export function isRecordingOnly(session: { workout: unknown | null }): boolean {
	return session.workout === null
}
