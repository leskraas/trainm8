import { localDate } from './athlete-calendar.ts'
import { type PlannedMinutes, plannedMinutes } from './dashboard.ts'
import { type DisciplineThresholdMap } from './intensity-target.ts'
// Enum display labels live in the shared label seam (#281); re-exported here so
// existing importers of these helpers are unchanged.
export { getDisciplineLabel, getStatusLabel } from './labels.ts'
import { type AdherenceBand, sessionAdherence } from './load/adherence.ts'
import {
	type PlannedMetric,
	plannedMetricValue,
	readPlannedMetric,
} from './planned-discipline.ts'
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
	/**
	 * The Athlete Timezone, where the reader thinks in days: a session still
	 * scheduled on **today** is then planned until the day is over — I dag
	 * never grades a day before it has passed (#505 story 24), and a gym
	 * session at 07:00 is not "ikke gjort" at 09:00. Without it the instant
	 * decides, as it always has.
	 */
	timezone?: string,
): LedgerStatus {
	if (session.status === 'completed') return 'completed'
	if (session.status === 'missed' || session.status === 'skipped') {
		return 'missed'
	}
	if (session.scheduledAt.getTime() >= now.getTime()) return 'planned'
	if (
		timezone != null &&
		localDate(session.scheduledAt, timezone) >= localDate(now, timezone)
	) {
		return 'planned'
	}
	return 'missed'
}

type DurationSession = {
	recording: { durationSec: number | null } | null
	workout: {
		/** Times a step that names no Discipline of its own. */
		discipline?: string
		blocks: Parameters<typeof plannedMinutes>[0]
	} | null
}

/**
 * Actual duration (from the recording) when present, else the planned duration
 * derived from the workout steps — null when a step cannot be timed, rather
 * than a short total shown as the session's (#638). A recorded duration is
 * never `estimated`; a planned one is where a distance was timed by its pace.
 */
export function getSessionDuration(
	session: DurationSession,
	/** What a distance step's pace resolves against (#615). */
	thresholds: DisciplineThresholdMap = {},
): PlannedMinutes | null {
	if (session.recording?.durationSec != null) {
		return {
			minutes: Math.round(session.recording.durationSec / 60),
			estimated: false,
		}
	}
	if (session.workout) {
		return plannedMinutes(session.workout.blocks, {
			thresholds,
			discipline: session.workout.discipline,
		})
	}
	return null
}

/** {@link getSessionDuration}'s minutes alone. */
export function getSessionDurationMin(
	session: DurationSession,
	thresholds: DisciplineThresholdMap = {},
): number | null {
	return getSessionDuration(session, thresholds)?.minutes ?? null
}

/** The normalized shape each ledger row carries: date, discipline, title, duration, load, status, and RPE. */
export type SessionLedgerEntry = {
	id: string
	scheduledAt: Date
	discipline: string
	title: string | null
	status: LedgerStatus
	durationMin: number | null
	/** `durationMin` was timed through a pace: it reads with `≈` (#638). */
	durationEstimated: boolean
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

/**
 * A week row's Planned TSS, read through the planned discipline
 * (`planned-discipline.ts`): a planned Simple Activity on `other` is an
 * Unavailable Metric (`simple-activity`) even if a figure was stored.
 */
export function readLedgerPlannedTss(session: {
	plannedTssValue: number | null
	workout: { discipline: string } | null
	recording: { discipline: string } | null
}): PlannedMetric<number> {
	return readPlannedMetric(
		getSessionDiscipline(session),
		'planned-tss',
		() => session.plannedTssValue,
	)
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
			blocks: Parameters<typeof plannedMinutes>[0]
		} | null
		recording: {
			discipline: string
			durationSec: number | null
			distanceM?: number | null
		} | null
		sessionLog: { rpe: number | null } | null
	},
	now: Date = new Date(),
	/** Passed on to `deriveLedgerStatus`: today's sessions stay planned. */
	timezone?: string,
	/** Passed on to `getSessionDurationMin`: a distance step's pace (#615). */
	thresholds: DisciplineThresholdMap = {},
): SessionLedgerEntry {
	const load = session.tssValue ?? null
	const plannedTss = plannedMetricValue(readLedgerPlannedTss(session))
	// The gate (both sides present, planned positive) and the band rule live in
	// `sessionAdherence` so the ledger and Weekly Plan Adherence never drift.
	const adherence = sessionAdherence(load, plannedTss)?.band ?? null
	const duration = getSessionDuration(session, thresholds)
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
		status: deriveLedgerStatus(session, now, timezone),
		durationMin: duration?.minutes ?? null,
		durationEstimated: duration?.estimated ?? false,
		load,
		plannedTss,
		adherence,
		rpe: session.sessionLog?.rpe ?? null,
		replanReason: session.replanReason,
	}
}
