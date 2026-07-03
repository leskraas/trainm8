import { type AccountConnection } from '@prisma/client'
import { prisma } from '#app/utils/db.server.ts'
import { StravaTokenExchangeError } from './oauth.server.ts'
import {
	STRAVA_API_BASE,
	STRAVA_TOKEN_URL,
	StravaTokenResponseSchema,
	type StravaTokenResponse,
} from './types.ts'

/**
 * Strava API client with token refresh. Strava access tokens last ~6 hours and
 * refresh tokens rotate on each refresh (ADR 0013), so the rotated refresh
 * token must be persisted back onto the Account Connection.
 *
 * V1 surface is intentionally small — `stravaApiGet` plus the refresh
 * primitive, used by the OAuth callback and the manual sync (#72).
 */

/** A 60s safety margin so we refresh slightly before the real expiry. */
const EXPIRY_SKEW_MS = 60 * 1000

/** The subset of an Account Connection the client needs to make API calls. */
type ConnectionRef = Pick<
	AccountConnection,
	'id' | 'accessToken' | 'refreshToken' | 'expiresAt'
>

/**
 * Thrown when Strava permanently rejects the connection's credentials (a 4xx on
 * refresh). The Account Connection is moved to `revoked`; the athlete must
 * re-authorize. Callers surface this as a "reconnect" prompt rather than a
 * transient error.
 */
export class StravaConnectionRevokedError extends Error {
	constructor(message = 'Strava authorization was revoked') {
		super(message)
		this.name = 'StravaConnectionRevokedError'
	}
}

/**
 * Thrown on a `403` from the Strava API: the token is valid but lacks the scope
 * the endpoint requires (e.g. `/athlete/activities` needs `activity:read`). This
 * is permanent for the current grant — refreshing the token won't add the scope,
 * so callers surface it as a "reconnect and grant activity access" prompt rather
 * than a transient failure. Distinct from `StravaConnectionRevokedError`, which
 * is the grant being pulled entirely.
 */
export class StravaInsufficientScopeError extends Error {
	constructor(message = 'Strava token is missing a required scope') {
		super(message)
		this.name = 'StravaInsufficientScopeError'
	}
}

/**
 * Thrown on a `403` whose body says the *application* itself is disabled
 * (`{"errors":[{"resource":"Application","field":"Status","code":"Inactive"}]}`).
 * This is not a per-athlete authorization problem — the whole Strava API app is
 * turned off at the source, so it affects every athlete and every endpoint, and
 * reconnecting can't fix it. Only the app owner can, by activating the app in
 * Strava's developer settings (or via developers@strava.com).
 */
export class StravaAppInactiveError extends Error {
	constructor(message = 'Strava application is inactive') {
		super(message)
		this.name = 'StravaAppInactiveError'
	}
}

/**
 * Distinguish an "application inactive" 403 from an ordinary missing-scope 403 by
 * inspecting Strava's error body. Tolerant of a non-JSON body (returns false).
 */
function stravaBodyIndicatesInactiveApp(body: string): boolean {
	try {
		const parsed = JSON.parse(body) as {
			errors?: Array<{ resource?: string; code?: string }>
		}
		return (parsed.errors ?? []).some(
			(e) => e.resource === 'Application' && e.code === 'Inactive',
		)
	} catch {
		return false
	}
}

/** Best-effort move to `revoked`; tolerant of a non-persisted connection ref. */
async function markConnectionRevoked(id: string): Promise<void> {
	await prisma.accountConnection
		.update({ where: { id }, data: { status: 'revoked' } })
		.catch(() => {})
}

/**
 * Refresh the access token and persist the rotated refresh token. A 4xx on
 * refresh is permanent (the grant was revoked at the source): the connection
 * moves to `revoked` and we throw `StravaConnectionRevokedError`. Other failures
 * (5xx, network) propagate so the caller can retry later.
 */
async function refreshAndPersist(connection: ConnectionRef): Promise<string> {
	let refreshed: StravaTokenResponse
	try {
		refreshed = await refreshStravaToken(connection.refreshToken)
	} catch (err) {
		if (
			err instanceof StravaTokenExchangeError &&
			err.status != null &&
			err.status >= 400 &&
			err.status < 500
		) {
			await markConnectionRevoked(connection.id)
			throw new StravaConnectionRevokedError()
		}
		throw err
	}
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: {
			accessToken: refreshed.access_token,
			refreshToken: refreshed.refresh_token,
			expiresAt: new Date(refreshed.expires_at * 1000),
			status: 'active',
		},
	})
	return refreshed.access_token
}

/** Exchange a refresh token for a fresh access token (rotates the refresh token). */
export async function refreshStravaToken(
	refreshToken: string,
): Promise<StravaTokenResponse> {
	const response = await fetch(STRAVA_TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({
			client_id: process.env.STRAVA_CLIENT_ID,
			client_secret: process.env.STRAVA_CLIENT_SECRET,
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		}),
	})
	if (!response.ok) {
		throw new StravaTokenExchangeError(
			`Strava token refresh failed (${response.status})`,
			response.status,
		)
	}
	return StravaTokenResponseSchema.parse(await response.json())
}

/**
 * Return a valid access token for the connection, refreshing and persisting
 * rotated tokens when the current one is at/near expiry.
 */
export async function getValidAccessToken(
	connection: ConnectionRef,
): Promise<string> {
	const isExpiring =
		connection.expiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now()
	if (!isExpiring) return connection.accessToken
	return refreshAndPersist(connection)
}

/**
 * Authenticated GET against the Strava API. Refreshes proactively when the
 * stored token is near expiry, and reactively retries once on a 401 (the token
 * was rejected despite looking valid). A permanent refresh failure surfaces as
 * `StravaConnectionRevokedError`.
 */
export async function stravaApiGet<T>(
	connection: ConnectionRef,
	path: string,
): Promise<T> {
	const url = `${STRAVA_API_BASE}${path}`
	const accessToken = await getValidAccessToken(connection)
	let response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	})

	if (response.status === 401) {
		const refreshedToken = await refreshAndPersist(connection)
		response = await fetch(url, {
			headers: { Authorization: `Bearer ${refreshedToken}` },
		})
	}

	// A 403 is permanent (refreshing the token won't help), but the fix depends on
	// the cause: an inactive *application* is on Strava's side and reconnecting is
	// useless, whereas a missing *scope* is fixed by re-authorizing. Read the body
	// to tell them apart and throw the matching typed error.
	if (response.status === 403) {
		const body = await response.text()
		if (stravaBodyIndicatesInactiveApp(body)) {
			throw new StravaAppInactiveError(
				`Strava API GET ${path} forbidden (403) — application inactive`,
			)
		}
		throw new StravaInsufficientScopeError(
			`Strava API GET ${path} forbidden (403) — missing scope`,
		)
	}

	if (!response.ok) {
		throw new Error(`Strava API GET ${path} failed (${response.status})`)
	}
	return (await response.json()) as T
}
