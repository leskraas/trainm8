import { sumBlockDurationMin } from './dashboard.ts'
import { type AdherenceBand, sessionAdherence } from './load/adherence.ts'

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

export function getStatusLabel(status: string): string {
	return status.charAt(0).toUpperCase() + status.slice(1)
}

export function getDisciplineLabel(discipline: string): string {
	if (discipline === 'bike') return 'Ride'
	return discipline.charAt(0).toUpperCase() + discipline.slice(1)
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
}

export function toSessionLedgerEntry(
	session: {
		id: string
		scheduledAt: Date
		status: string
		tssValue: number | null
		plannedTssValue: number | null
		plannedTssConfidence: string | null
		workout: {
			title: string
			discipline: string
			blocks: Array<{
				repeatCount: number
				steps: Array<{ durationSec: number | null }>
			}>
		} | null
		recording: { discipline: string; durationSec: number | null } | null
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
		title: session.workout?.title ?? null,
		status: deriveLedgerStatus(session, now),
		durationMin: getSessionDurationMin(session),
		load,
		plannedTss,
		adherence,
		rpe: session.sessionLog?.rpe ?? null,
	}
}
