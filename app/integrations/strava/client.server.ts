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
 * V1 surface is intentionally small — `getAthlete` plus the refresh primitive.
 * Activity fetching lands with the ingest pipeline (#72/#73).
 */

/** A 60s safety margin so we refresh slightly before the real expiry. */
const EXPIRY_SKEW_MS = 60 * 1000

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
	connection: Pick<
		AccountConnection,
		'id' | 'accessToken' | 'refreshToken' | 'expiresAt'
	>,
): Promise<string> {
	const isExpiring =
		connection.expiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now()
	if (!isExpiring) return connection.accessToken

	const refreshed = await refreshStravaToken(connection.refreshToken)
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

/** Authenticated GET against the Strava API, refreshing the token as needed. */
export async function stravaApiGet<T>(
	connection: Pick<
		AccountConnection,
		'id' | 'accessToken' | 'refreshToken' | 'expiresAt'
	>,
	path: string,
): Promise<T> {
	const accessToken = await getValidAccessToken(connection)
	const response = await fetch(`${STRAVA_API_BASE}${path}`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	})
	if (!response.ok) {
		throw new Error(`Strava API GET ${path} failed (${response.status})`)
	}
	return (await response.json()) as T
}
