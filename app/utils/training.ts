import { sumBlockDurationMin } from './dashboard.ts'
// Enum display labels live in the shared label seam (#281); re-exported here so
// existing importers of these helpers are unchanged.
export { getDisciplineLabel, getStatusLabel } from './labels.ts'
import { type AdherenceBand, sessionAdherence } from './load/adherence.ts'
import { deriveRecordingTitle } from './session-title.ts'

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

/**
 * The three states the session ledger distinguishes so it can split past from
 * future and render the right status. The stored `skipped` status and any
 * past-but-still-scheduled session both read as `missed` (it wasn't done).
 */
export type LedgerStatus = 'completed' | 'planned' | 'missed'

export function deriveLedgerStatus(
	session: { status: string; scheduledAt: Date },
	now: Date = new Date(),
): LedgerStatus {
	if (session.status === 'completed') return 'completed'
	if (session.status === 'missed' || session.status === 'skipped') {
		return 'missed'
	}
	return session.scheduledAt.getTime() >= now.getTime() ? 'planned' : 'missed'
}

/** Actual duration (from the recording) when present, else the planned duration derived from the workout steps. */
export function getSessionDurationMin(session: {
	recording: { durationSec: number | null } | null
	workout: {
		blocks: Array<{
			repeatCount: number
			steps: Array<{ durationSec: number | null }>
		}>
	} | null
}): number | null {
	if (session.recording?.durationSec != null) {
		return Math.round(session.recording.durationSec / 60)
	}
	if (session.workout) {
		return sumBlockDurationMin(session.workout.blocks)
	}
	return null
}

/** The normalized shape each ledger row carries: date, discipline, title, duration, load, status, and RPE. */
export type SessionLedgerEntry = {
	id: string
	scheduledAt: Date
	discipline: string
	title: string | null
	status: LedgerStatus
	durationMin: number | null
	load: number | null
	/** Planned TSS the prescription implies (ADR 0019); null when unavailable. */
	plannedTss: number | null
	/**
	 * Plan Adherence band from actual / planned TSS — null unless *both* are
	 * present (and planned is positive). Rendered as "—" otherwise, never a
	 * fabricated 100%.
	 */
	adherence: AdherenceBand | null
	rpe: number | null
	/**
	 * The Replan Note (ADR 0025) attached when a Week Replan softened this
	 * session's volume — null when the session was never softened (or a later
	 * prescription rewrite cleared it). Drives the ledger's "adjusted" adornment.
	 */
	replanReason: string | null
}

export function toSessionLedgerEntry(
	session: {
		id: string
		scheduledAt: Date
		status: string
		tssValue: number | null
		plannedTssValue: number | null
		plannedTssConfidence: string | null
		replanReason: string | null
		workout: {
			title: string
			discipline: string
			blocks: Array<{
				repeatCount: number
				steps: Array<{ durationSec: number | null }>
			}>
		} | null
		recording: {
			discipline: string
			durationSec: number | null
			distanceM?: number | null
		} | null
		sessionLog: { rpe: number | null } | null
	},
	now: Date = new Date(),
): SessionLedgerEntry {
	const load = session.tssValue ?? null
	const plannedTss = session.plannedTssValue ?? null
	// The gate (both sides present, planned positive) and the band rule live in
	// `sessionAdherence` so the ledger and Weekly Plan Adherence never drift.
	const adherence = sessionAdherence(load, plannedTss)?.band ?? null
	return {
		id: session.id,
		scheduledAt: session.scheduledAt,
		discipline: getSessionDiscipline(session),
		// A titleless session is named from its structure via its Workout's
		// derived title (persisted at materialize time), or — for a structureless
		// recording — from the recording itself ("45 min run"), so the same
		// session reads alike here, on the ledger, and on the Workout Detail View.
		title:
			session.workout?.title ??
			(session.recording
				? deriveRecordingTitle({
						discipline: session.recording.discipline,
						durationSec: session.recording.durationSec,
						distanceM: session.recording.distanceM ?? null,
					})
				: null),
		status: deriveLedgerStatus(session, now),
		durationMin: getSessionDurationMin(session),
		load,
		plannedTss,
		adherence,
		rpe: session.sessionLog?.rpe ?? null,
		replanReason: session.replanReason,
	}
}
