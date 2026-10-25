// PROTOTYPE, wipe me (#552). Walks the OAuth flow the way Claude's documented client
// does (claude.com/docs/connectors/building/authentication), printing every
// response, then calls /mcp on both protocol eras with the token.
//
//   CLIENT=claude-web   CIMD client_id https://claude.ai/oauth/mcp-oauth-client-metadata,
//                       redirect https://claude.ai/api/mcp/auth_callback (we stop at the redirect)
//   CLIENT=claude-code  CIMD client_id https://claude.ai/oauth/claude-code-client-metadata,
//                       loopback redirect on a random port
//   CLIENT=dcr          Claude's DCR fallback (what it does when CIMD is not advertised)
//   LOGIN=password|epic  SCOPE=…  RESOURCE_PARAM=…  SKIP_REFRESH=1  SKIP_REFRESH_WAIT=1
//   MCP_URL=https://<tunnel host>/mcp to smoke-test the tunnel before the click
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { decodeJwt, userAgentAuthorize } from './browser.mts'

const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3000/mcp'
const CLIENT = process.env.CLIENT ?? 'claude-web'
const LOGIN = (process.env.LOGIN ?? 'password') as 'password' | 'epic'
const out = (label: string, v: unknown) =>
	console.log(
		`\n### ${label}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`,
	)
const t0 = () => performance.now()
const ms = (s: number) => `${Math.round(performance.now() - s)} ms`

// 1. Unauthenticated call -> 401 + WWW-Authenticate
let s = t0()
const r401 = await fetch(MCP_URL, {
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		accept: 'application/json, text/event-stream',
		'mcp-protocol-version': '2025-06-18',
	},
	body: JSON.stringify({
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'sim', version: '0' },
		},
	}),
})
const wwwAuth = r401.headers.get('www-authenticate') ?? ''
out(
	`1. POST /mcp without token (${ms(s)})`,
	`${r401.status}\nWWW-Authenticate: ${wwwAuth}`,
)
const prmUrl = /resource_metadata="([^"]+)"/.exec(wwwAuth)?.[1]!
const challengeScope = /scope="([^"]+)"/.exec(wwwAuth)?.[1]

// 2. PRM
s = t0()
const prm = await (await fetch(prmUrl)).json()
out(`2. GET ${prmUrl} (${ms(s)})`, prm)
console.log(`resource === MCP_URL: ${prm.resource === MCP_URL}`)
const issuer = prm.authorization_servers[0]

// 3. AS metadata, RFC 8414 path insertion
const iu = new URL(issuer)
const asUrl = `${iu.origin}/.well-known/oauth-authorization-server${iu.pathname.replace(/\/$/, '')}`
s = t0()
const as = await (await fetch(asUrl)).json()
out(`3. GET ${asUrl} (${ms(s)})`, {
	issuer: as.issuer,
	issuer_matches: as.issuer === issuer,
	client_id_metadata_document_supported:
		as.client_id_metadata_document_supported,
	token_endpoint_auth_methods_supported:
		as.token_endpoint_auth_methods_supported,
	code_challenge_methods_supported: as.code_challenge_methods_supported,
	registration_endpoint: as.registration_endpoint,
	scopes_supported: as.scopes_supported,
	authorization_response_iss_parameter_supported:
		as.authorization_response_iss_parameter_supported,
})

// 4. Registration: Claude's rule is CIMD iff both flags, else DCR.
const cimdOk =
	as.client_id_metadata_document_supported === true &&
	as.token_endpoint_auth_methods_supported?.includes('none')
let clientId: string
let redirectUri: string
if (CLIENT === 'claude-web' && cimdOk) {
	clientId = 'https://claude.ai/oauth/mcp-oauth-client-metadata'
	redirectUri = 'https://claude.ai/api/mcp/auth_callback'
} else if (CLIENT === 'claude-code' && cimdOk) {
	clientId = 'https://claude.ai/oauth/claude-code-client-metadata'
	redirectUri = `http://${process.env.LOOPBACK_HOST ?? 'localhost'}:${30000 + Math.floor(Math.random() * 20000)}/callback`
} else {
	redirectUri =
		CLIENT === 'claude-code'
			? `http://localhost:${30000 + Math.floor(Math.random() * 20000)}/callback`
			: 'https://claude.ai/api/mcp/auth_callback'
	s = t0()
	const reg = await fetch(as.registration_endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: 'Claude',
			redirect_uris: [redirectUri],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
		}),
	})
	const regBody = await reg.json()
	out(`4. DCR POST ${as.registration_endpoint} (${ms(s)})`, {
		status: reg.status,
		...regBody,
	})
	clientId = regBody.client_id
}
out('4. client', { CLIENT, cimdOk, clientId, redirectUri })

// 5. Authorize with PKCE S256 + resource
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const state = randomBytes(16).toString('base64url')
const scope =
	process.env.SCOPE ??
	[
		challengeScope ?? prm.scopes_supported?.join(' '),
		as.scopes_supported?.includes('offline_access') ? 'offline_access' : '',
	]
		.filter(Boolean)
		.join(' ')
const resourceParam = process.env.RESOURCE_PARAM ?? MCP_URL
const authUrl = new URL(as.authorization_endpoint)
authUrl.search = new URLSearchParams({
	response_type: 'code',
	client_id: clientId,
	redirect_uri: redirectUri,
	code_challenge: challenge,
	code_challenge_method: 'S256',
	state,
	scope,
	resource: resourceParam,
}).toString()
out('5. authorize request', { scope, resource: resourceParam })
s = t0()
let callbackUrl: URL
try {
	const r = await userAgentAuthorize(authUrl.toString(), {
		redirectUri,
		login: LOGIN,
	})
	out(`5. user-agent trace (${ms(s)})`, r.trace)
	callbackUrl = r.callbackUrl
} catch (e) {
	out('5. authorize FAILED', String(e))
	process.exit(1)
}
const cb = Object.fromEntries(callbackUrl.searchParams)
out('6. callback', {
	...cb,
	code: cb.code ? `${cb.code.slice(0, 6)}…` : undefined,
	state_ok: cb.state === state,
	iss_ok: cb.iss === issuer,
})
if (!cb.code) process.exit(1)

// 7. Token exchange, form-urlencoded
const tokenReq = (params: Record<string, string>) =>
	fetch(as.token_endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'application/json',
		},
		body: new URLSearchParams(params),
	})
s = t0()
const tr = await tokenReq({
	grant_type: 'authorization_code',
	code: cb.code,
	redirect_uri: redirectUri,
	client_id: clientId,
	code_verifier: verifier,
	resource: resourceParam,
})
const tokens = await tr.json()
out(`7. token exchange (${ms(s)})`, {
	status: tr.status,
	token_type: tokens.token_type,
	expires_in: tokens.expires_in,
	scope: tokens.scope,
	has_refresh_token: !!tokens.refresh_token,
	has_id_token: !!tokens.id_token,
	error: tokens.error,
	error_description: tokens.error_description,
})
if (!tokens.access_token) process.exit(1)
if (process.env.TOKEN_FILE)
	(await import('node:fs')).writeFileSync(
		process.env.TOKEN_FILE,
		tokens.access_token,
	)
const jwt = decodeJwt(tokens.access_token)
out('7. access token JWT', {
	header: jwt.header,
	payload: { ...jwt.payload, lifetime_s: jwt.payload.exp - jwt.payload.iat },
})

// 8a. 2025-era raw JSON-RPC (what Claude's documented-2025 client sends)
const legacyPost = async (body: unknown, version: string) => {
	const res = await fetch(MCP_URL, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${tokens.access_token}`,
			'mcp-protocol-version': version,
		},
		body: JSON.stringify(body),
	})
	const text = await res.text()
	return {
		status: res.status,
		sessionId: res.headers.get('mcp-session-id'),
		body: text.slice(0, 300),
	}
}
for (const v of ['2025-06-18', '2025-11-25']) {
	out(
		`8a. ${v} initialize`,
		await legacyPost(
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: v,
					capabilities: {},
					clientInfo: { name: 'sim', version: '0' },
				},
			},
			v,
		),
	)
	out(
		`8a. ${v} tools/call get_week`,
		await legacyPost(
			{
				jsonrpc: '2.0',
				id: 2,
				method: 'tools/call',
				params: { name: 'get_week', arguments: {} },
			},
			v,
		),
	)
}
const legacyGet = await fetch(MCP_URL, {
	headers: {
		authorization: `Bearer ${tokens.access_token}`,
		accept: 'text/event-stream',
		'mcp-protocol-version': '2025-06-18',
	},
})
out('8a. 2025-era GET /mcp (SSE stream open)', {
	status: legacyGet.status,
	body: (await legacyGet.text()).slice(0, 200),
})

// 8b. 2026-07-28 via the v2 SDK client, pinned
const modern = new Client({ name: 'sim-2026', version: '0' }, {
	versionNegotiation: { mode: { pin: '2026-07-28' } },
} as any)
const authProvider = {
	token: async () => tokens.access_token,
	onUnauthorized: async () => {
		throw new Error('401 on modern')
	},
}
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
	authProvider,
} as any)
try {
	await modern.connect(transport)
	const tools = await modern.listTools()
	const call = await modern.callTool({ name: 'get_week', arguments: {} })
	out('8b. 2026-07-28 (v2 client pinned)', {
		negotiated: (transport as any).protocolVersion,
		tools: tools.tools.map((t) => t.name),
		call: call.content,
	})
} catch (e) {
	out('8b. 2026-07-28 FAILED', String(e))
}
await modern.close().catch(() => {})

if (process.env.SKIP_REFRESH) process.exit(0)

// 9. Refresh rotation and replay
s = t0()
const r1 = await tokenReq({
	grant_type: 'refresh_token',
	refresh_token: tokens.refresh_token,
	client_id: clientId,
	resource: resourceParam,
})
const t1 = await r1.json()
out(`9. refresh #1 (${ms(s)})`, {
	status: r1.status,
	rotated: !!t1.refresh_token && t1.refresh_token !== tokens.refresh_token,
	aud: t1.access_token && decodeJwt(t1.access_token).payload.aud,
	error: t1.error,
})
const rReplayFast = await tokenReq({
	grant_type: 'refresh_token',
	refresh_token: tokens.refresh_token,
	client_id: clientId,
	resource: resourceParam,
})
const tReplayFast = await rReplayFast.json()
out('9. replay old refresh token inside the 30 s reuse window', {
	status: rReplayFast.status,
	same_response: tReplayFast.refresh_token === t1.refresh_token,
	error: tReplayFast.error,
})
if (!process.env.SKIP_REFRESH_WAIT) {
	await new Promise((r) => setTimeout(r, 31_000))
	const rReplay = await tokenReq({
		grant_type: 'refresh_token',
		refresh_token: tokens.refresh_token,
		client_id: clientId,
		resource: resourceParam,
	})
	out('9. replay old refresh token after 31 s', {
		status: rReplay.status,
		...(await rReplay.json()),
	})
	const rNew = await tokenReq({
		grant_type: 'refresh_token',
		refresh_token: t1.refresh_token,
		client_id: clientId,
		resource: resourceParam,
	})
	out(
		'9. the rotated (newest) refresh token after the replay (family revoked?)',
		{ status: rNew.status, ...(await rNew.json()) },
	)
}
