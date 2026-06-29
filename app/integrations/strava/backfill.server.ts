import {
	autoMatchImport,
	createActivityImport,
	promoteToNewSession,
} from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { StravaConnectionRevokedError } from './client.server.ts'
import {
	enrichRecordingPhaseBars,
	fetchStravaActivitiesAfter,
	ingestActivityStreams,
	mapActivityToImportInput,
} from './ingest.server.ts'
import { STRAVA_PROVIDER } from './types.ts'

/**
 * The Backfill Window (#74). On connect, fetch the past 42 days of Strava
 * activities — sized to match the CTL window so Training Load is meaningful from
 * day one — and file each as an `ActivityImport`.
 *
 * Unlike manual sync, backfill is opinionated about promotion: a modeled-
 * discipline activity with no same-day same-discipline planned session is
 * auto-promoted to a recording-only Workout Session, so the athlete's history is
 * populated without manual triage. `'other'` activities (ADR 0015) are never
 * auto-promoted and wait in the inbox.
 *
 * Idempotent on retry: the unique `(provider, externalId)` guard skips activities
 * already imported, and promotion is re-attempted for any import left unpromoted
 * by an interrupted earlier run.
 */

/** The Backfill Window length, sized to the CTL (chronic load) window. */
export const BACKFILL_WINDOW_DAYS = 42

export type StravaBackfillResult =
	| { ok: true; created: number; promoted: number }
	| { ok: false; reason: 'not-connected' | 'revoked' }

export async function runStravaBackfill(
	athleteId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<StravaBackfillResult> {
	const connection = await prisma.accountConnection.findUnique({
		where: { athleteId_provider: { athleteId, provider: STRAVA_PROVIDER } },
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

	const windowStart = new Date(
		now.getTime() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
	)
	const afterUnixSec = Math.floor(windowStart.getTime() / 1000)

	let activities
	try {
		activities = await fetchStravaActivitiesAfter(connection, afterUnixSec)
	} catch (err) {
		if (err instanceof StravaConnectionRevokedError) {
			return { ok: false, reason: 'revoked' }
		}
		throw err
	}

	let created = 0
	let promoted = 0
	let latestActivityAt: Date | null = null

	for (const activity of activities) {
		const input = mapActivityToImportInput(activity)
		if (latestActivityAt == null || input.startedAt > latestActivityAt) {
			latestActivityAt = input.startedAt
		}

		const { importId, isNew } = await ensureImport(athleteId, input)
		if (isNew) created++

		// 'other' is import-only (ADR 0015): never auto-promoted.
		if (input.discipline === 'other') continue

		if (await ensurePromoted(athleteId, importId, timezone)) promoted++
	}

	// Derive intensity-phase bars from each recording's HR stream (best-effort).
	await enrichRecordingPhaseBars(connection, athleteId, activities)

	// Bring telemetry to backfilled history: ingest each modeled recording's
	// downsampled Activity Stream so the Workout Detail View overlay works for
	// auto-promoted history, not just live activity (#140, best-effort). Scoped to
	// modeled disciplines — which is exactly the set backfill auto-promotes, since
	// 'other' is never promoted (ADR 0015) — and `ingestActivityStreams` skips
	// 'other', imports already carrying a stream (idempotent), and activities with
	// no usable telemetry. Each fetch is paced by the shared Strava rate limiter,
	// so backfilling streams stays within the per-app budget (ADR 0013).
	await ingestActivityStreams(connection, activities)

	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: {
			lastSyncedAt: latestActivityAt ?? connection.lastSyncedAt,
			backfillCompletedAt: now,
		},
	})

	// Recompute Training Load across the whole window so CTL/ATL/TSB reflect the
	// backfilled history (covers both auto-promoted and auto-matched imports).
	const windowStartDateStr = formatDateInTz(windowStart, timezone)
	await recomputeLoadFrom(athleteId, windowStartDateStr)

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
