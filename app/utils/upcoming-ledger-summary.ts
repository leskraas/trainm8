import { type UpcomingSession } from './training.server.ts'
import { activityFilterLabel } from './upcoming-ledger-filters.ts'

export const UPCOMING_LEDGER_HORIZON_DAYS = 14

export type ActivityAllocation = {
	activityType: string
	label: string
	count: number
	percentage: number
}

export type UpcomingLedgerSummary = {
	horizonDays: number
	totalSessions: number
	statusCounts: Record<string, number>
	activityAllocation: ActivityAllocation[]
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
	const activityCounts = new Map<string, number>()

	for (const session of sessions) {
		statusCounts[session.status] = (statusCounts[session.status] ?? 0) + 1
		activityCounts.set(
			session.workout.activityType,
			(activityCounts.get(session.workout.activityType) ?? 0) + 1,
		)
	}

	const activityAllocation = Array.from(activityCounts.entries()).map(
		([activityType, count]) => ({
			activityType,
			label: getActivityLabel(activityType),
			count,
			percentage:
				sessions.length === 0 ? 0 : Math.round((count / sessions.length) * 100),
		}),
	)

	return {
		horizonDays: UPCOMING_LEDGER_HORIZON_DAYS,
		totalSessions: sessions.length,
		statusCounts,
		activityAllocation,
		unavailableMetrics: UNAVAILABLE_METRICS,
	}
}

function getActivityLabel(activityType: string): string {
	if (
		activityType === 'run' ||
		activityType === 'bike' ||
		activityType === 'swim' ||
		activityType === 'strength'
	) {
		return activityFilterLabel(activityType)
	}
	return activityType.charAt(0).toUpperCase() + activityType.slice(1)
}
