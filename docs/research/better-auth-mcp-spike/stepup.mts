// PROTOTYPE, wipe me (#552). Per-tool step-up on both eras: training:read token calls
// propose_week_change -> 403 insufficient_scope; then a stepped-up token works.
import { createHash, randomBytes } from 'node:crypto'
import {
	Client,
	StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { userAgentAuthorize } from './browser.mts'

const BASE = 'http://localhost:3000'
const MCP = `${BASE}/mcp`
const AS = `${BASE}/api/auth`
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
const out = (label: string, v: unknown) =>
	console.log(`\n### ${label}\n${JSON.stringify(v, null, 2)}`)

const reg = await (
	await fetch(`${AS}/oauth2/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: 'stepup',
			redirect_uris: [REDIRECT],
			token_endpoint_auth_method: 'none',
		}),
	})
).json()

async function tokenFor(scope: string) {
	const verifier = randomBytes(32).toString('base64url')
	const q = new URLSearchParams({
		response_type: 'code',
		client_id: reg.client_id,
		redirect_uri: REDIRECT,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256',
		state: 's',
		scope,
		resource: MCP,
	})
	const { callbackUrl } = await userAgentAuthorize(
		`${AS}/oauth2/authorize?${q}`,
		{ redirectUri: REDIRECT, login: 'password' },
	)
	const r = await fetch(`${AS}/oauth2/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code: callbackUrl.searchParams.get('code')!,
			redirect_uri: REDIRECT,
			client_id: reg.client_id,
			code_verifier: verifier,
			resource: MCP,
		}),
	})
	return (await r.json()).access_token as string
}

async function legacyCall(token: string, name: string) {
	const r = await fetch(MCP, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${token}`,
			'mcp-protocol-version': '2025-06-18',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name, arguments: {} },
		}),
	})
	return {
		status: r.status,
		'www-authenticate': r.headers.get('www-authenticate'),
		body: (await r.text()).slice(0, 160),
	}
}

async function modernCall(token: string, name: string) {
	const seen: { status: number; wwwAuth: string | null }[] = []
	const f: typeof fetch = async (input, init) => {
		const res = await fetch(input, init)
		seen.push({
			status: res.status,
			wwwAuth: res.headers.get('www-authenticate'),
		})
		return res
	}
	const c = new Client({ name: 'm', version: '0' }, {
		versionNegotiation: { mode: { pin: '2026-07-28' } },
	} as any)
	const t = new StreamableHTTPClientTransport(new URL(MCP), {
		fetch: f,
		authProvider: { token: async () => token },
	} as any)
	try {
		await c.connect(t)
		const r = await c.callTool({ name, arguments: {} })
		return { ok: r.content, http: seen.at(-1) }
	} catch (e) {
		return { error: String(e).slice(0, 200), http: seen.at(-1) }
	} finally {
		await c.close().catch(() => {})
	}
}

const readOnly = await tokenFor('training:read offline_access')
out(
	'2025-06-18 propose_week_change with training:read only',
	await legacyCall(readOnly, 'propose_week_change'),
)
out(
	'2026-07-28 propose_week_change with training:read only',
	await modernCall(readOnly, 'propose_week_change'),
)
out(
	'2026-07-28 get_week with training:read only (unaffected)',
	await modernCall(readOnly, 'get_week'),
)
const stepped = await tokenFor('training:read training:propose offline_access')
out(
	'2025-06-18 propose_week_change after step-up',
	await legacyCall(stepped, 'propose_week_change'),
)
out(
	'2026-07-28 propose_week_change after step-up',
	await modernCall(stepped, 'propose_week_change'),
)
