import {
	BACKFILL_MAX_DAYS,
	BACKFILL_MIN_DAYS,
	BACKFILL_TARGET_SESSIONS,
} from '#app/integrations/backfill-window.ts'
import {
	autoMatchImport,
	createActivityImport,
	promoteToNewSession,
} from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { IntervalsIcuKeyRejectedError } from './client.server.ts'
import {
	fetchIntervalsIcuActivitiesBetween,
	ingestActivityTelemetry,
	mapActivityToImportInput,
} from './ingest.server.ts'
import { INTERVALSICU_PROVIDER } from './types.ts'

/**
 * The count-based Backfill Window job kind for Intervals.icu (ADR 0013 #151,
 * ADR 0026 #3). The connect flow (#203) enqueues it; the handler runs
 * `runIntervalsIcuBackfill` (#204).
 */
export const INTERVALSICU_BACKFILL_JOB_KIND = 'intervalsicu-backfill'

/**
 * The Intervals.icu Backfill Window (#204): on connect, reach back through the
 * athlete's history and file each activity as an `ActivityImport`, applying
 * the same count-based window rules as Strava's backfill (shared constants in
 * `#app/integrations/backfill-window.ts`, ADR 0013):
 *
 *  - reach back to at least `BACKFILL_TARGET_SESSIONS` modeled-discipline
 *    workouts, floored at `BACKFILL_MIN_DAYS` (the CTL window) and capped at
 *    `BACKFILL_MAX_DAYS`;
 *  - auto-promote modeled activities with no same-day same-discipline planned
 *    session to recording-only Workout Sessions; auto-match the rest;
 *  - `'other'` activities (ADR 0015) ride along inside the window but never
 *    extend it, never auto-promote, and never feed load;
 *  - eagerly ingest each kept modeled recording's downsampled Activity Stream
 *    (ADR 0020) + HR phase bars from one streams fetch, so the Telemetry
 *    Overlay and NP-based TSS (ADR 0024) work on backfilled history;
 *  - stamp `lastSyncedAt` / `backfillCompletedAt` (the hub card's "importing
 *    history" state clears on the latter) and recompute Training Load across
 *    the CTL window.
 *
 * Idempotent on retry: the unique `(provider, externalId)` guard skips
 * activities already imported, promotion is re-attempted only for imports left
 * unpromoted, and stream ingestion skips imports already carrying a stream.
 *
 * A key rejection (401/403) flips the connection to `revoked` — regenerated
 * keys never come back on their own (ADR 0026); the athlete pastes a new one.
 */

export type IntervalsIcuBackfillResult =
	| { ok: true; created: number; promoted: number }
	| { ok: false; reason: 'not-connected' | 'revoked' }

export async function runIntervalsIcuBackfill(
	athleteId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<IntervalsIcuBackfillResult> {
	const connection = await prisma.accountConnection.findUnique({
		where: {
			athleteId_provider: { athleteId, provider: INTERVALSICU_PROVIDER },
		},
	})
	if (!connection) return { ok: false, reason: 'not-connected' }
	if (connection.status === 'revoked') return { ok: false, reason: 'revoked' }

	const timezone =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId: athleteId },
				select: { timezone: true },
			})
		)?.timezone ?? 'UTC'

	const dayMs = 24 * 60 * 60 * 1000
	const nowMs = now.getTime()
	const minCutoffMs = nowMs - BACKFILL_MIN_DAYS * dayMs
	const maxCutoffMs = nowMs - BACKFILL_MAX_DAYS * dayMs

	// Fetch the whole age-capped window in one list call (`oldest`/`newest` —
	// no cursor pagination at Intervals.icu); the count target then bounds the
	// kept set below, which is what per-activity telemetry iterates.
	let fetched
	try {
		fetched = await fetchIntervalsIcuActivitiesBetween(connection, {
			oldest: new Date(maxCutoffMs),
			newest: now,
			timezone,
		})
	} catch (err) {
		if (err instanceof IntervalsIcuKeyRejectedError) {
			// The stored key is dead (regenerated or deleted at the source); only a
			// fresh key revives the connection, so record the truth on the row.
			await prisma.accountConnection.update({
				where: { id: connection.id },
				data: { status: 'revoked' },
			})
			return { ok: false, reason: 'revoked' }
		}
		throw err
	}

	// Map each activity once, newest first, then pick the reach: far enough back
	// for BACKFILL_TARGET_SESSIONS modeled workouts *and* the BACKFILL_MIN_DAYS
	// floor (whichever reaches further), but never past the age cap. Only modeled
	// disciplines count toward the target — 'other' activities (ADR 0015) ride
	// along when they fall inside the chosen window but never extend it.
	const mapped = fetched
		.map((activity) => ({
			activity,
			input: mapActivityToImportInput(activity),
		}))
		.sort((a, b) => b.input.startedAt.getTime() - a.input.startedAt.getTime())
	const modeled = mapped.filter((m) => m.input.discipline !== 'other')
	const targetCutoffMs =
		modeled.length >= BACKFILL_TARGET_SESSIONS
			? modeled[BACKFILL_TARGET_SESSIONS - 1]!.input.startedAt.getTime()
			: -Infinity
	const cutoffMs = Math.max(maxCutoffMs, Math.min(targetCutoffMs, minCutoffMs))
	const activities = mapped.filter(
		(m) => m.input.startedAt.getTime() >= cutoffMs,
	)

	let created = 0
	let promoted = 0
	let latestActivityAt: Date | null = null

	for (const { input } of activities) {
		if (latestActivityAt == null || input.startedAt > latestActivityAt) {
			latestActivityAt = input.startedAt
		}

		const { importId, isNew } = await ensureImport(athleteId, input)
		if (isNew) created++

		// 'other' is import-only (ADR 0015): never auto-promoted.
		if (input.discipline === 'other') continue

		if (await ensurePromoted(athleteId, importId, timezone)) promoted++
	}

	// Bring telemetry to the backfilled history: one streams fetch per kept
	// modeled recording feeds both the downsampled Activity Stream (ADR 0020 —
	// Telemetry Overlay + NP-based TSS, ADR 0024) and the HR phase bars.
	// Best-effort and paced by the courtesy pacer; absent streams simply leave
	// the recording's telemetry Unavailable.
	await ingestActivityTelemetry(
		{ athleteId, accessToken: connection.accessToken },
		activities.map((m) => m.activity),
	)

	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: {
			lastSyncedAt: latestActivityAt ?? connection.lastSyncedAt,
			backfillCompletedAt: now,
		},
	})

	// Recompute Training Load across the CTL window (BACKFILL_MIN_DAYS) so
	// CTL/ATL/TSB reflect the backfilled history — earned from the imported
	// activities' own data, never Intervals.icu's computed CTL/ATL.
	const loadWindowStartStr = formatDateInTz(new Date(minCutoffMs), timezone)
	await recomputeLoadFrom(athleteId, loadWindowStartStr)

	return { ok: true, created, promoted }
}

/**
 * Create the import, or report the pre-existing one on a unique-constraint hit
 * so retries are idempotent.
 */
async function ensureImport(
	athleteId: string,
	input: ReturnType<typeof mapActivityToImportInput>,
): Promise<{ importId: string; isNew: boolean }> {
	try {
		const created = await createActivityImport(athleteId, input)
		return { importId: created.id, isNew: true }
	} catch (err) {
		if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
			const existing = await prisma.activityImport.findUnique({
				where: {
					externalProvider_externalId: {
						externalProvider: input.externalProvider,
						externalId: input.externalId,
					},
				},
				select: { id: true },
			})
			if (existing) return { importId: existing.id, isNew: false }
		}
		throw err
	}
}

/**
 * Ensure a modeled-discipline import is promoted: link it to a single matching
 * planned session if one exists, otherwise create a recording-only session.
 * No-ops (returns false) when the import is already promoted.
 */
async function ensurePromoted(
	athleteId: string,
	importId: string,
	timezone: string,
): Promise<boolean> {
	const imp = await prisma.activityImport.findFirst({
		where: { id: importId, athleteId },
		select: { promotedSessionId: true },
	})
	if (!imp || imp.promotedSessionId != null) return false

	const matched = await autoMatchImport(athleteId, importId, timezone)
	if (!matched) await promoteToNewSession(athleteId, importId)
	return true
}

function formatDateInTz(date: Date, timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(date)
}
