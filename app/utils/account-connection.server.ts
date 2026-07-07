import { type AccountConnection } from '@prisma/client'
import { prisma } from './db.server.ts'

/**
 * The canonical Account Connection status state machine (CONTEXT.md, ADR 0014).
 * The `AccountConnection.status` column is constrained to these values both at
 * the database level (CHECK constraint) and here.
 *
 *  - `active`  — authorized and syncable.
 *  - `expired` — access token lapsed; self-heals via background refresh and is
 *                not surfaced to the athlete.
 *  - `revoked` — source provider invalidated the authorization; needs the
 *                athlete to re-authorize.
 *  - `error`   — unexpected source-side failure requiring triage.
 *
 * Operational sync state (idle / actively fetching) is NOT a status value — it
 * is derived from the job queue.
 */
export const ACCOUNT_CONNECTION_STATUSES = [
	'active',
	'expired',
	'revoked',
	'error',
] as const

export type AccountConnectionStatus =
	(typeof ACCOUNT_CONNECTION_STATUSES)[number]

export function isAccountConnectionStatus(
	value: string,
): value is AccountConnectionStatus {
	return (ACCOUNT_CONNECTION_STATUSES as readonly string[]).includes(value)
}

/**
 * External services trainm8 can hold an Account Connection for. The
 * `AccountConnection.provider` column is a plain string in the schema (ADR
 * 0014), but every code path that addresses a connection goes through this
 * union so a typo fails at compile time rather than silently no-op'ing.
 *
 * Note this is narrower than `ActivityImport.externalProvider`, which also
 * includes `'manual'` (file uploads) — those imports have no Account
 * Connection behind them.
 */
export type Provider = 'strava' | 'intervalsicu' | 'garmin' | 'polar'

/**
 * How long after connect we keep showing the Backfill Window as "in progress"
 * before assuming the job stalled (#74). The banner clears either when
 * `backfillCompletedAt` is stamped or once the connection ages past this.
 */
export const BACKFILL_EXPECTED_DURATION_MS = 10 * 60 * 1000

/**
 * Whether the initial 42-day Backfill Window is still running for a connection.
 * True only for an active connection that hasn't recorded `backfillCompletedAt`
 * and is younger than {@link BACKFILL_EXPECTED_DURATION_MS} — so a crashed or
 * never-run backfill doesn't leave the banner up forever.
 */
export function isBackfillInProgress(
	connection: Pick<
		AccountConnection,
		'status' | 'backfillCompletedAt' | 'connectedAt'
	> | null,
	now: Date = new Date(),
): boolean {
	if (!connection || connection.status !== 'active') return false
	if (connection.backfillCompletedAt != null) return false
	return (
		now.getTime() - connection.connectedAt.getTime() <
		BACKFILL_EXPECTED_DURATION_MS
	)
}

/** The active Account Connection for an athlete/provider, if any. */
export function getAccountConnection(athleteId: string, provider: Provider) {
	return prisma.accountConnection.findUnique({
		where: { athleteId_provider: { athleteId, provider } },
	})
}

/**
 * Persist a freshly-authorized Account Connection as `active`, stamping
 * `connectedAt = now()`. Re-connecting an existing provider rotates the stored
 * tokens and re-activates the row (idempotent on the athlete/provider pair).
 *
 * Key-based providers (ADR 0026) store the API key in `accessToken` and pass
 * `refreshToken: null` / `expiresAt: null` — keys neither rotate nor expire.
 */
export function connectAccountConnection({
	athleteId,
	provider,
	externalAthleteId,
	accessToken,
	refreshToken,
	expiresAt,
}: {
	athleteId: string
	provider: Provider
	externalAthleteId: string
	accessToken: string
	refreshToken: string | null
	expiresAt: Date | null
}) {
	const now = new Date()
	const tokens = {
		externalAthleteId,
		accessToken,
		refreshToken,
		expiresAt,
		status: 'active' satisfies AccountConnectionStatus,
		connectedAt: now,
	}
	return prisma.accountConnection.upsert({
		where: { athleteId_provider: { athleteId, provider } },
		create: { athleteId, provider, ...tokens },
		update: tokens,
	})
}

/**
 * Athlete-initiated disconnect of an Account Connection (ADR 0012). In a single
 * transaction this:
 *
 *  - hard-deletes the athlete's *non-promoted* Activity Imports for this
 *    provider — inbox items that are no longer a viable promotion target once
 *    the connection is gone — and
 *  - removes the Account Connection row.
 *
 * Promoted imports (those carrying a `promotedSessionId`) survive untouched, so
 * the Recordings attached to Workout Sessions — and their TSS contributions to
 * Training Load — remain intact. Load Snapshots are deliberately NOT recomputed:
 * the athlete's training history is treated as truthful and immutable to
 * source-side changes.
 *
 * This is distinct from a source-initiated `status: 'revoked'`, which leaves
 * non-promoted imports in place so the athlete can re-authorize. Only explicit
 * disconnect triggers inbox cleanup.
 */
export function disconnectAccountConnection({
	athleteId,
	provider,
}: {
	athleteId: string
	provider: Provider
}) {
	return prisma.$transaction(async (tx) => {
		const { count: removedImports } = await tx.activityImport.deleteMany({
			where: {
				athleteId,
				externalProvider: provider,
				promotedSessionId: null,
			},
		})
		const { count: removedConnections } = await tx.accountConnection.deleteMany(
			{
				where: { athleteId, provider },
			},
		)
		return { removedImports, disconnected: removedConnections > 0 }
	})
}
