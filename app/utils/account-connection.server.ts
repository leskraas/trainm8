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

/** The active Account Connection for an athlete/provider, if any. */
export function getAccountConnection(athleteId: string, provider: string) {
	return prisma.accountConnection.findUnique({
		where: { athleteId_provider: { athleteId, provider } },
	})
}

/**
 * Persist a freshly-authorized Account Connection as `active`, stamping
 * `connectedAt = now()`. Re-connecting an existing provider rotates the stored
 * tokens and re-activates the row (idempotent on the athlete/provider pair).
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
	provider: string
	externalAthleteId: string
	accessToken: string
	refreshToken: string
	expiresAt: Date
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
