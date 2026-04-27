import { type UpcomingSession } from './training.server.ts'

/** Query key for the Activity Query (UBIQUITOUS_LANGUAGE.md). */
export const ACTIVITY_QUERY_PARAM = 'activity'

export type ActivityTypeFilter = 'run' | 'bike' | 'swim' | 'strength'

const KNOWN_ACTIVITY_TYPES = new Set<ActivityTypeFilter>([
	'run',
	'bike',
	'swim',
	'strength',
])

/** Canonical order for filter tabs. */
export const ACTIVITY_FILTER_ORDER: readonly ActivityTypeFilter[] = [
	'run',
	'bike',
	'swim',
	'strength',
]

export function parseActivityQueryParam(
	raw: string | null,
): ActivityTypeFilter | null {
	if (!raw) return null
	const normalized = raw.toLowerCase()
	if (KNOWN_ACTIVITY_TYPES.has(normalized as ActivityTypeFilter)) {
		return normalized as ActivityTypeFilter
	}
	return null
}

export function filterSessionsByActivityType(
	sessions: UpcomingSession[],
	activity: ActivityTypeFilter | null,
): UpcomingSession[] {
	if (!activity) return sessions
	return sessions.filter((s) => s.workout.activityType === activity)
}

export function activityFilterLabel(type: ActivityTypeFilter): string {
	if (type === 'bike') return 'Ride'
	return type.charAt(0).toUpperCase() + type.slice(1)
}
