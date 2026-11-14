/**
 * Whether a strength session's row on I dag carries the quick log (#505
 * stories 83–84), and in which words. Pure: a ledger row in, the offer out —
 * the Seam 2 half of the quick log, whose server half is
 * `strength-quick-log.server.ts`. The rule itself is `canQuickLogStrength`,
 * the one the server checks a post against.
 */

import { addDays, localDate } from '#app/utils/athlete-calendar.ts'
import { readPlannedSets } from '#app/utils/dashboard.ts'
import { QUICK_LOG_LABELS } from '#app/utils/labels.ts'
import { type SessionRow } from '#app/utils/session-ledger-rows.ts'
import {
	canQuickLogStrength,
	QUICK_LOG_REACH_DAYS,
} from '#app/utils/strength-quick-log.ts'

/** The quick log's words on a row that takes it. */
export type TimelineStrengthLog = {
	heading: string
	/** The group's accessible name: which session it logs. */
	label: string
	/** _Som planlagt_'s accessible name. */
	asPlannedLabel: string
}

export function strengthLogOf(
	row: SessionRow,
	{ timezone, todayKey }: { timezone: string; todayKey: string },
): TimelineStrengthLog | null {
	const { session, entry } = row
	const offered = canQuickLogStrength(
		{
			workoutDiscipline: session.workout?.discipline ?? null,
			plannedSets: readPlannedSets(session.workout?.blocks ?? []).total,
			loggedWorkingSets: session.setLogs.length,
			dayKey: localDate(new Date(session.scheduledAt), timezone),
		},
		{ todayKey, reachFromKey: addDays(todayKey, -QUICK_LOG_REACH_DAYS) },
	)
	if (!offered) return null
	const title = entry.title ?? ''
	return {
		heading: QUICK_LOG_LABELS.heading,
		label: QUICK_LOG_LABELS.headingFor(title),
		asPlannedLabel: QUICK_LOG_LABELS.asPlannedFor(title),
	}
}
