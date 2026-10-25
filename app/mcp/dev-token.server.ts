/**
 * The Phase 0 way into `/mcp` (ADR 0092 §8): a static, per-user development
 * bearer token, until ADR 0094's OAuth replaces it.
 *
 * `MCP_DEV_TOKENS` is a comma-separated list of `userId:token` entries, with
 * an optional `:scope+scope` (default `training:read`). Tokens are at least 32
 * characters. A token names the user by id, never by username: a username can
 * change hands, so a rename must not move a token to another account (the
 * same holds for OAuth's `sub`, ADR 0094). It is read only when `NODE_ENV` is `development` or `test`; with
 * one configured, production refuses to boot (`env.server.ts`), and the route
 * refuses to serve in production whatever is configured. Deferred hardening:
 * no expiry, rotation or audit — tracked as #639 H6, closed by Phase 2's OAuth.
 */

import { timingSafeEqual } from 'node:crypto'
import { SCOPES, type Scope } from '#app/actions/vocabulary.ts'

export const DEV_TOKEN_MIN_LENGTH = 32

/**
 * The placeholder `.env.example` ships. It is long enough to pass the length
 * check and public, so an uncommented example line must not become a token.
 */
const PUBLISHED_PLACEHOLDER_TOKEN = 'replace-with-openssl-rand-hex-24-output'

export type DevToken = { userId: string; token: string; scopes: Scope[] }

/** Whether this environment may read a dev token at all. */
export function devTokensAllowed(nodeEnv: string | undefined): boolean {
	return nodeEnv === 'development' || nodeEnv === 'test'
}

/**
 * Parse `MCP_DEV_TOKENS`. Throws on a malformed entry, and — #639 H6 — on any
 * token at all in production, so boot fails rather than serving one.
 */
export function parseDevTokens(
	raw: string | undefined,
	nodeEnv: string | undefined,
): DevToken[] {
	if (!raw?.trim()) return []
	if (!devTokensAllowed(nodeEnv)) {
		throw new Error(
			'MCP_DEV_TOKENS is set, but dev tokens are development and test only (#639 H6). Unset it.',
		)
	}
	return raw.split(',').map((entry) => {
		// Scopes have colons of their own: split at the first two only.
		const [userId = '', rest = ''] = splitOnce(entry.trim(), ':')
		const [token, scopeList] = splitOnce(rest, ':')
		if (!userId || !token || token.length < DEV_TOKEN_MIN_LENGTH) {
			throw new Error(
				`MCP_DEV_TOKENS entries are userId:token[:scope+scope], with a token of at least ${DEV_TOKEN_MIN_LENGTH} characters.`,
			)
		}
		if (token === PUBLISHED_PLACEHOLDER_TOKEN) {
			throw new Error(
				'MCP_DEV_TOKENS still holds the placeholder from .env.example: generate a token with `openssl rand -hex 24`.',
			)
		}
		const scopes = scopeList ? scopeList.split('+') : ['training:read']
		for (const scope of scopes) {
			if (!(SCOPES as string[]).includes(scope)) {
				throw new Error(`MCP_DEV_TOKENS names an unknown scope: ${scope}`)
			}
		}
		return { userId, token, scopes: scopes as Scope[] }
	})
}

function splitOnce(value: string, separator: string): [string, string?] {
	const at = value.indexOf(separator)
	return at === -1 ? [value] : [value.slice(0, at), value.slice(at + 1)]
}

function sameToken(a: string, b: string): boolean {
	const left = Buffer.from(a)
	const right = Buffer.from(b)
	return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * The dev token a request's `Authorization: Bearer …` names, or null. Never
 * matches outside development and test (#639 H6), whatever is configured.
 */
export function matchDevToken(
	request: Request,
	env: { NODE_ENV?: string; MCP_DEV_TOKENS?: string } = process.env,
): DevToken | null {
	if (!devTokensAllowed(env.NODE_ENV)) return null
	const header = request.headers.get('authorization') ?? ''
	const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
	if (!match?.[1]) return null
	const presented = match[1]
	const tokens = parseDevTokens(env.MCP_DEV_TOKENS, env.NODE_ENV)
	return tokens.find((t) => sameToken(t.token, presented)) ?? null
}
