/**
 * The boundary where a reader turns its credential into an `ActionCtx` (ADR
 * 0092 §3). The caller comes from which credential authenticated the request
 * — the cookie session is `web`, the bearer at `/mcp` is `mcp` — never from
 * anything the client sends. The `web` caller also needs the request to carry
 * no `Authorization` header.
 */

import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { type ActionCtx } from './define.ts'
import { type Caller, type Scope } from './vocabulary.ts'

export async function actionCtx(
	request: Request,
	{
		userId,
		caller,
		scopes,
		now = new Date(),
	}: {
		userId: string
		caller: Caller
		scopes?: readonly Scope[]
		now?: Date
	},
): Promise<ActionCtx> {
	// `web` is the cookie session on a request with no `Authorization` header
	// (ADR 0092 §3): a request that also carries a bearer is not the athlete's
	// own tap, so it never answers for them (ADR 0093 §3).
	if (caller === 'web' && request.headers.has('authorization')) {
		throw new Response('A web request carries no Authorization header.', {
			status: 400,
		})
	}
	return {
		userId,
		caller,
		now,
		timezone: await getAthleteTimezone(userId),
		origin: new URL(request.url).origin,
		...(scopes ? { scopes } : {}),
	}
}
