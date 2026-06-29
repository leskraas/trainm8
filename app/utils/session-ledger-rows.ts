import {
	deriveSessionProfile,
	parseRecordingPhaseBars,
	type ProfileBar,
} from './session-profile.ts'
import { type LedgerSession } from './training.server.ts'
import { type SessionLedgerEntry, toSessionLedgerEntry } from './training.ts'

/**
 * The Profile bars for a session: a planned workout's authored structure when it
 * has one, otherwise a recording's HR-derived phases. Both render identically.
 */
function sessionProfileBars(s: LedgerSession): ProfileBar[] {
	const planned = deriveSessionProfile(s.workout).bars
	if (planned.length > 0) return planned
	return parseRecordingPhaseBars(s.recording?.phaseBarsJson)
}

export type SessionRow = {
	kind: 'session'
	id: string
	session: LedgerSession
	entry: SessionLedgerEntry
	bars: ProfileBar[]
	isPast: boolean
}

export type NowRow = { kind: 'now'; id: '__now__' }

export type LedgerRow = SessionRow | NowRow

/**
 * Flatten the chronological session list into renderable rows, inserting a
 * single "now" divider at the past/planned boundary (the first session not yet
 * in the past, or at the end when every session is in the past).
 */
export function buildLedgerRows(
	sessions: LedgerSession[],
	now: Date = new Date(),
): LedgerRow[] {
	const nowMs = now.getTime()
	const rows: LedgerRow[] = []
	let nowInserted = false
	for (const s of sessions) {
		const isPast = new Date(s.scheduledAt).getTime() < nowMs
		if (!isPast && !nowInserted) {
			rows.push({ kind: 'now', id: '__now__' })
			nowInserted = true
		}
		rows.push({
			kind: 'session',
			id: s.id,
			session: s,
			entry: toSessionLedgerEntry(s, now),
			bars: sessionProfileBars(s),
			isPast,
		})
	}
	if (!nowInserted) rows.push({ kind: 'now', id: '__now__' })
	return rows
}
