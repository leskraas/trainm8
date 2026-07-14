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
import { StravaConnectionRevokedError } from './client.server.ts'
import {
	enrichRecordingPhaseBars,
	fetchStravaActivitiesAfter,
	ingestActivityStreams,
	mapActivityToImportInput,
} from './ingest.server.ts'
import { STRAVA_PROVIDER } from './types.ts'

/**
 * The Backfill Window (#74, amended #151). On connect, reach back through the
 * athlete's Strava history and file each activity as an `ActivityImport`, so
 * Trainm8 has a real picture of how they train from day one.
 *
 * The reach is **count-based, not purely time-based**: we go back far enough to
 * collect at least `BACKFILL_TARGET_SESSIONS` modeled-discipline workouts — so an
 * infrequent athlete still gets a meaningful history instead of the handful a
 * fixed recent window would yield — bounded by two guards:
 *   - a `BACKFILL_MIN_DAYS` floor (the CTL window) so Training Load is always
 *     seeded, even for someone who only just started training; and
 *   - a `BACKFILL_MAX_DAYS` age cap so we never drag in stale years that
 *     misrepresent current training (and so eager per-activity enrichment stays
 *     bounded — see below).
 *
 * Unlike manual sync, backfill is opinionated about promotion: a modeled-
 * discipline activity with no same-day same-discipline planned session is
 * auto-promoted to a recording-only Workout Session, so the athlete's history is
 * populated without manual triage. `'other'` activities (ADR 0015) are never
 * auto-promoted and wait in the inbox.
 *
 * Eager enrichment (phase bars + Activity Streams) is scoped to the *kept* set,
 * so its Strava-request cost scales with the count target, not with how far back
 * the window happens to reach — a backfill stays inside the per-app rate budget
 * (ADR 0013) without having to defer telemetry to read time.
 *
 * Idempotent on retry: the unique `(provider, externalId)` guard skips activities
 * already imported, and promotion is re-attempted for any import left unpromoted
 * by an interrupted earlier run.
 */

// The window constants live in `#app/integrations/backfill-window.ts` (#204):
// every provider's backfill shares the same reach rules. Re-exported for
// existing call sites.
export { BACKFILL_TARGET_SESSIONS, BACKFILL_MIN_DAYS, BACKFILL_MAX_DAYS }

export type StravaBackfillResult =
	| { ok: true; created: number; promoted: number }
	| { ok: false; reason: 'not-connected' | 'revoked' }

export async function runStravaBackfill(
	athleteId: string,
	{
		now = new Date(),
		targetSessions = BACKFILL_TARGET_SESSIONS,
	}: { now?: Date; targetSessions?: number } = {},
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

	const dayMs = 24 * 60 * 60 * 1000
	const nowMs = now.getTime()
	const minCutoffMs = nowMs - BACKFILL_MIN_DAYS * dayMs
	const maxCutoffMs = nowMs - BACKFILL_MAX_DAYS * dayMs

	// Fetch the whole age-capped window from Strava (list pagination is cheap and
	// bounded by the fetcher's page cap); the count target then bounds the kept
	// set below, which is what the expensive per-activity enrichment iterates.
	let fetched
	try {
		fetched = await fetchStravaActivitiesAfter(
			connection,
			Math.floor(maxCutoffMs / 1000),
		)
	} catch (err) {
		if (err instanceof StravaConnectionRevokedError) {
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
		modeled.length >= targetSessions
			? modeled[targetSessions - 1]!.input.startedAt.getTime()
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

	// The raw Strava bodies for the kept set, for the enrichment passes below.
	const keptActivities = activities.map((m) => m.activity)

	// Derive intensity-phase bars from each recording's HR stream (best-effort).
	await enrichRecordingPhaseBars(connection, athleteId, keptActivities)

	// Bring telemetry to backfilled history: ingest each modeled recording's
	// downsampled Activity Stream so the Workout Detail View overlay works for
	// auto-promoted history, not just live activity (#140, best-effort). Scoped to
	// modeled disciplines — which is exactly the set backfill auto-promotes, since
	// 'other' is never promoted (ADR 0015) — and `ingestActivityStreams` skips
	// 'other', imports already carrying a stream (idempotent), and activities with
	// no usable telemetry. Each fetch is paced by the shared Strava rate limiter,
	// so backfilling streams stays within the per-app budget (ADR 0013).
	await ingestActivityStreams(connection, keptActivities)

	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: {
			lastSyncedAt: latestActivityAt ?? connection.lastSyncedAt,
			backfillCompletedAt: now,
		},
	})

	// Recompute Training Load across the CTL window (BACKFILL_MIN_DAYS) so
	// CTL/ATL/TSB reflect the backfilled history (covers both auto-promoted and
	// auto-matched imports). Deliberately scoped to the recent window, not the
	// full import reach: current fitness only depends on the last ~42 days, so
	// recomputing further back would be wasted work that can't change today's
	// numbers.
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
