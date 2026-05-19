import { getDisciplineLabel, getSessionDiscipline } from './training.ts'
import { type UpcomingSession } from './training.server.ts'

export const UPCOMING_LEDGER_HORIZON_DAYS = 14

export type DisciplineAllocation = {
	discipline: string
	label: string
	count: number
	percentage: number
}

export type UpcomingLedgerSummary = {
	horizonDays: number
	totalSessions: number
	statusCounts: Record<string, number>
	disciplineAllocation: DisciplineAllocation[]
	unavailableMetrics: UnavailableMetric[]
}

export type UnavailableMetric = {
	label: string
	value: null
	displayValue: 'Unavailable'
}

const UNAVAILABLE_METRICS: UnavailableMetric[] = [
	{ label: 'Duration', value: null, displayValue: 'Unavailable' },
	{ label: 'Distance', value: null, displayValue: 'Unavailable' },
	{ label: 'TSS', value: null, displayValue: 'Unavailable' },
]

export function summarizeUpcomingLedger(
	sessions: UpcomingSession[],
): UpcomingLedgerSummary {
	const statusCounts: Record<string, number> = {}
	const disciplineCounts = new Map<string, number>()

	for (const session of sessions) {
		statusCounts[session.status] = (statusCounts[session.status] ?? 0) + 1
		const discipline = getSessionDiscipline(session)
		disciplineCounts.set(
			discipline,
			(disciplineCounts.get(discipline) ?? 0) + 1,
		)
	}

	const disciplineAllocation = Array.from(disciplineCounts.entries()).map(
		([discipline, count]) => ({
			discipline,
			label: getDisciplineLabel(discipline),
			count,
			percentage:
				sessions.length === 0 ? 0 : Math.round((count / sessions.length) * 100),
		}),
	)

	return {
		horizonDays: UPCOMING_LEDGER_HORIZON_DAYS,
		totalSessions: sessions.length,
		statusCounts,
		disciplineAllocation,
		unavailableMetrics: UNAVAILABLE_METRICS,
	}
}
