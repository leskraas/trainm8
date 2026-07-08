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
function sessionProfile(s: LedgerSession): {
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

export type SessionRow = {
	kind: 'session'
	id: string
	session: LedgerSession
	entry: SessionLedgerEntry
	bars: ProfileBar[]
	groups: ProfileBarGroup[]
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
		const profile = sessionProfile(s)
		rows.push({
			kind: 'session',
			id: s.id,
			session: s,
			entry: toSessionLedgerEntry(s, now),
			bars: profile.bars,
			groups: profile.groups,
			isPast,
		})
	}
	if (!nowInserted) rows.push({ kind: 'now', id: '__now__' })
	return rows
}
