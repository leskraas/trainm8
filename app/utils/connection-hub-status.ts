/**
 * An Account Connection as the athlete reads it (ADR 0026 #1): connected,
 * importing its history (backfilling, #204), or needing to be connected again
 * (revoked). `expired` self-heals through a background token refresh and is
 * never shown; `error` reads as revoked, because reconnecting is the only
 * remedy the athlete has.
 *
 * Client-safe: the derivation from a connection row is
 * `connectionHubStatus` in `account-connection.server.ts`, and the words are
 * `labels.ts`'s. The integrations page and Meg (ADR 0083) both read it.
 */
export const CONNECTION_HUB_STATUSES = [
	'disconnected',
	'connected',
	'backfilling',
	'revoked',
] as const
export type ConnectionHubStatus = (typeof CONNECTION_HUB_STATUSES)[number]
