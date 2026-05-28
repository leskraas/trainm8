import { createId as cuid } from '@paralleldrive/cuid2'
import * as cookie from 'cookie'
import {
	STRAVA_AUTHORIZE_URL,
	STRAVA_SCOPE,
	STRAVA_TOKEN_URL,
	StravaTokenResponseSchema,
	type StravaTokenResponse,
} from './types.ts'

/** httpOnly cookie that carries the CSRF state across the OAuth round-trip. */
export const STRAVA_OAUTH_STATE_COOKIE = 'strava_oauth_state'

/** True when the Strava OAuth app credentials are configured. */
export function isStravaOAuthConfigured() {
	return Boolean(
		process.env.STRAVA_CLIENT_ID &&
			process.env.STRAVA_CLIENT_SECRET &&
			process.env.STRAVA_REDIRECT_URI,
	)
}

/** Thrown when exchanging the authorization code with Strava fails. */
export class StravaTokenExchangeError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message)
		this.name = 'StravaTokenExchangeError'
	}
}

/**
 * Build the Strava authorize URL and the matching state cookie. The caller
 * redirects to `url` after setting `setCookie`; the callback compares the
 * returned `state` query param against this cookie (CSRF protection).
 */
export function buildStravaAuthorization() {
	const state = cuid()
	const params = new URLSearchParams({
		client_id: process.env.STRAVA_CLIENT_ID ?? '',
		redirect_uri: process.env.STRAVA_REDIRECT_URI ?? '',
		response_type: 'code',
		approval_prompt: 'auto',
		scope: STRAVA_SCOPE,
		state,
	})
	const setCookie = cookie.serialize(STRAVA_OAUTH_STATE_COOKIE, state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 10,
		secure: process.env.NODE_ENV === 'production',
	})
	return { url: `${STRAVA_AUTHORIZE_URL}?${params.toString()}`, setCookie, state }
}

/** Read the CSRF state previously stored in the request's cookie. */
export function getStravaOAuthState(request: Request) {
	const header = request.headers.get('cookie')
	if (!header) return null
	return cookie.parse(header)[STRAVA_OAUTH_STATE_COOKIE] ?? null
}

/** Clear the state cookie once the round-trip completes. */
export const destroyStravaOAuthStateCookie = cookie.serialize(
	STRAVA_OAUTH_STATE_COOKIE,
	'',
	{ path: '/', maxAge: -1 },
)

/**
 * Constant-time-ish comparison guarding against an empty/forged state. Both the
 * cookie value and the query value must be present and equal.
 */
export function verifyStravaOAuthState(
	cookieState: string | null,
	queryState: string | null,
): boolean {
	return Boolean(cookieState && queryState && cookieState === queryState)
}

/**
 * Exchange an authorization code for tokens. Strava returns the athlete summary
 * inline, so the callback need not make a follow-up `/athlete` request.
 */
export async function exchangeStravaCode(
	code: string,
): Promise<StravaTokenResponse> {
	const response = await fetch(STRAVA_TOKEN_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
		},
		body: JSON.stringify({
			client_id: process.env.STRAVA_CLIENT_ID,
			client_secret: process.env.STRAVA_CLIENT_SECRET,
			code,
			grant_type: 'authorization_code',
		}),
	})

	if (!response.ok) {
		throw new StravaTokenExchangeError(
			`Strava token exchange failed (${response.status})`,
			response.status,
		)
	}

	return StravaTokenResponseSchema.parse(await response.json())
}

/** Convert Strava's Unix-seconds `expires_at` to a Date. */
export function stravaExpiresAtToDate(expiresAt: number): Date {
	return new Date(expiresAt * 1000)
}
