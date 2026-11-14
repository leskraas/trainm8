import { type DisciplineThresholdMap } from './intensity-target.ts'
import {
	deriveSessionProfile,
	parseRecordingPhaseBars,
	type ProfileBar,
	type ProfileBarGroup,
} from './session-profile.ts'
import { type LedgerSession } from './training.server.ts'
import { type SessionLedgerEntry, toSessionLedgerEntry } from './training.ts'

/**
 * The Profile bars (and any repeat-group brackets) for a session: a planned
 * workout's authored structure when it has one, otherwise a recording's
 * HR-derived phases. Both render identically; recordings carry no groups.
 */
export function sessionProfile(s: LedgerSession): {
	bars: ProfileBar[]
	groups: ProfileBarGroup[]
} {
	const planned = deriveSessionProfile(s.workout)
	if (planned.bars.length > 0) return planned
	return {
		bars: parseRecordingPhaseBars(s.recording?.phaseBarsJson),
		groups: [],
	}
}

/**
 * A session's row: what it is (status, load, band) and nothing that is only
 * drawn. The home timeline reads every session's row to build its week
 * skeleton, and only a mounted row's Profile bars, so it derives those
 * (`sessionProfile`) when it builds the row (ADR 0121 §2).
 */
export type SessionRow = {
	kind: 'session'
	id: string
	session: LedgerSession
	entry: SessionLedgerEntry
	isPast: boolean
}

/** Every session's row, in the order given, without its Profile bars. */
export function buildSessionRows(
	sessions: LedgerSession[],
	now: Date = new Date(),
	/** The Athlete Timezone: today's sessions stay planned (`deriveLedgerStatus`). */
	timezone?: string,
	/** What a distance step's duration is timed against (#615). */
	thresholds: DisciplineThresholdMap = {},
): SessionRow[] {
	const nowMs = now.getTime()
	return sessions.map((s) => ({
		kind: 'session',
		id: s.id,
		session: s,
		entry: toSessionLedgerEntry(s, now, timezone, thresholds),
		isPast: new Date(s.scheduledAt).getTime() < nowMs,
	}))
}
