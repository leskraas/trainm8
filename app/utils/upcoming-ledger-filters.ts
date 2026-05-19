import { getSessionDiscipline } from './training.ts'
import { type UpcomingSession } from './training.server.ts'

/** Query key for the Discipline Query. */
export const DISCIPLINE_QUERY_PARAM = 'discipline'

export type DisciplineFilter = 'run' | 'bike' | 'swim' | 'strength'

const KNOWN_DISCIPLINES = new Set<DisciplineFilter>([
	'run',
	'bike',
	'swim',
	'strength',
])

/** Canonical order for filter tabs. */
export const DISCIPLINE_FILTER_ORDER: readonly DisciplineFilter[] = [
	'run',
	'bike',
	'swim',
	'strength',
]

export function parseDisciplineQueryParam(
	raw: string | null,
): DisciplineFilter | null {
	if (!raw) return null
	const normalized = raw.toLowerCase()
	if (KNOWN_DISCIPLINES.has(normalized as DisciplineFilter)) {
		return normalized as DisciplineFilter
	}
	return null
}

export function filterSessionsByDiscipline(
	sessions: UpcomingSession[],
	discipline: DisciplineFilter | null,
): UpcomingSession[] {
	if (!discipline) return sessions
	return sessions.filter((s) => getSessionDiscipline(s) === discipline)
}
