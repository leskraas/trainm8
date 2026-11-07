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
 * A session's row without its Profile bars: what it is (status, load, band)
 * and nothing that is only drawn. The home timeline reads every session's
 * entry to build its week skeleton, and only a mounted row's bars, so it
 * derives those (`sessionProfile`) when it builds the row (ADR 0113 §2).
 */
export type SessionEntryRow = {
	kind: 'session'
	id: string
	session: LedgerSession
	entry: SessionLedgerEntry
	isPast: boolean
}

export type SessionRow = SessionEntryRow & {
	bars: ProfileBar[]
	groups: ProfileBarGroup[]
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
	/** The Athlete Timezone: today's sessions stay planned (`deriveLedgerStatus`). */
	timezone?: string,
	/** What a distance step's duration is timed against (#615). */
	thresholds: DisciplineThresholdMap = {},
): LedgerRow[] {
	const rows: LedgerRow[] = []
	let nowInserted = false
	for (const row of buildSessionEntryRows(
		sessions,
		now,
		timezone,
		thresholds,
	)) {
		if (!row.isPast && !nowInserted) {
			rows.push({ kind: 'now', id: '__now__' })
			nowInserted = true
		}
		const profile = sessionProfile(row.session)
		rows.push({ ...row, bars: profile.bars, groups: profile.groups })
	}
	if (!nowInserted) rows.push({ kind: 'now', id: '__now__' })
	return rows
}

/** Every session's row in order, without its Profile bars or a `now` divider. */
export function buildSessionEntryRows(
	sessions: LedgerSession[],
	now: Date = new Date(),
	timezone?: string,
	thresholds: DisciplineThresholdMap = {},
): SessionEntryRow[] {
	const nowMs = now.getTime()
	return sessions.map((s) => ({
		kind: 'session',
		id: s.id,
		session: s,
		entry: toSessionLedgerEntry(s, now, timezone, thresholds),
		isPast: new Date(s.scheduledAt).getTime() < nowMs,
	}))
}
