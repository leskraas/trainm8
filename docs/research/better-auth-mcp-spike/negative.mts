// PROTOTYPE, wipe me (#552). The checks that should fail, and the revocation gaps.
import { createHash, randomBytes } from 'node:crypto'
import { decodeJwt, Jar, userAgentAuthorize } from './browser.mts'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const MCP = `${BASE}/mcp`
const AS = `${BASE}/api/auth`
const out = (label: string, v: unknown) =>
	console.log(
		`\n### ${label}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`,
	)
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

async function register(redirect_uris = [REDIRECT]) {
	const r = await fetch(`${AS}/oauth2/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: 'neg',
			redirect_uris,
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
		}),
	})
	return { status: r.status, body: await r.json() }
}

async function authorize(
	clientId: string,
	params: Record<string, string | undefined>,
	jar = new Jar(),
) {
	const verifier = randomBytes(32).toString('base64url')
	const q = new URLSearchParams()
	const all: Record<string, string | undefined> = {
		response_type: 'code',
		client_id: clientId,
		redirect_uri: REDIRECT,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256',
		state: 's',
		scope: 'training:read offline_access',
		resource: MCP,
		...params,
	}
	for (const [k, v] of Object.entries(all)) if (v !== undefined) q.set(k, v)
	try {
		const r = await userAgentAuthorize(`${AS}/oauth2/authorize?${q}`, {
			redirectUri: all.redirect_uri!,
			login: 'password',
			jar,
		})
		return {
			callback: Object.fromEntries(r.callbackUrl.searchParams),
			verifier,
			jar,
			redirect_uri: all.redirect_uri!,
			resource: all.resource,
		}
	} catch (e) {
		return { error: String(e).slice(0, 400), verifier, jar }
	}
}

const token = async (params: Record<string, string>) => {
	const r = await fetch(`${AS}/oauth2/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(params),
	})
	return { status: r.status, body: await r.json() }
}

async function getTokens(
	clientId: string,
	params: Record<string, string | undefined> = {},
	jar?: Jar,
) {
	const a = await authorize(clientId, params, jar)
	if (!('callback' in a) || !a.callback?.code) return { authorize: a }
	const t = await token({
		grant_type: 'authorization_code',
		code: a.callback.code,
		redirect_uri: a.redirect_uri,
		client_id: clientId,
		code_verifier: a.verifier,
		...(a.resource ? { resource: a.resource } : {}),
	})
	return { ...t, jar: a.jar }
}

const callMcp = async (bearer: string) => {
	const r = await fetch(MCP, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${bearer}`,
			'mcp-protocol-version': '2025-06-18',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'get_week', arguments: {} },
		}),
	})
	return {
		status: r.status,
		'www-authenticate': r.headers.get('www-authenticate'),
		body: (await r.text()).slice(0, 200),
	}
}

const { body: client } = await register()
const cid = client.client_id

// A. Resource indicator variants
for (const resource of [
	`${MCP}/`,
	MCP.replace('localhost', 'LOCALHOST'),
	`${BASE}/other`,
	undefined,
]) {
	const t = await getTokens(cid, { resource })
	const at0 =
		'body' in t ? (t.body.access_token as string | undefined) : undefined
	const aud = at0
		? at0.split('.').length === 3
			? decodeJwt(at0).payload.aud
			: `(opaque token, ${at0.length} chars)`
		: undefined
	out(`A. authorize+token with resource=${resource ?? '(none)'}`, {
		authorize_error:
			'authorize' in t
				? ((t.authorize as any).error ?? (t.authorize as any).callback)
				: undefined,
		token_status: 'status' in t ? t.status : undefined,
		token_error:
			'body' in t ? (t.body.error_description ?? t.body.error) : undefined,
		aud,
		mcp:
			'body' in t && t.body.access_token
				? await callMcp(t.body.access_token)
				: undefined,
	})
}

// B. Step-up: a token without training:read
{
	const t = await getTokens(cid, { scope: 'training:propose offline_access' })
	out(
		'B. token scope=training:propose -> POST /mcp (requiredScopes training:read)',
		{
			scope: (t as any).body?.scope,
			mcp: await callMcp((t as any).body.access_token),
		},
	)
}

// C. Tokens that are not ours
{
	const t = await getTokens(cid, {
		scope: 'openid training:read offline_access',
	})
	const idt = (t as any).body.id_token
	out('C1. id_token (aud=client_id) presented as bearer', {
		id_token_aud: idt && decodeJwt(idt).payload.aud,
		mcp: idt ? await callMcp(idt) : 'no id_token',
	})
	const at = (t as any).body.access_token as string
	const [h, p, sig] = at.split('.')
	const forged = [
		h,
		Buffer.from(
			JSON.stringify({ ...decodeJwt(at).payload, aud: `${BASE}/other` }),
		).toString('base64url'),
		sig,
	].join('.')
	out('C2. access token with aud edited (bad signature)', await callMcp(forged))
	out('C3. garbage bearer', await callMcp('not-a-token'))
}

// D. Authorization request hygiene
out(
	'D1. redirect_uri not registered',
	await authorize(cid, { redirect_uri: 'https://evil.example/cb' }),
)
out(
	'D2. no PKCE',
	await authorize(cid, {
		code_challenge: undefined,
		code_challenge_method: undefined,
	}),
)
out('D3. PKCE plain', await authorize(cid, { code_challenge_method: 'plain' }))
out(
	'D4. DCR with javascript: redirect',
	await register(['javascript:alert(1)']),
)
out(
	'D5. CIMD client_id on a host that serves no document',
	await authorize('https://example.com/oauth/not-a-client', {}),
)

// E. Revocation
{
	const t = (await getTokens(cid)) as any
	const rt = t.body.refresh_token
	const at = t.body.access_token
	const rev = await fetch(`${AS}/oauth2/revoke`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			token: rt,
			token_type_hint: 'refresh_token',
			client_id: cid,
		}),
	})
	out('E1. RFC 7009 revoke refresh token', { status: rev.status })
	out(
		'E1. refresh with the revoked token',
		await token({
			grant_type: 'refresh_token',
			refresh_token: rt,
			client_id: cid,
			resource: MCP,
		}),
	)
	out(
		'E1. access token (JWT) after its refresh token was revoked',
		await callMcp(at),
	)
}
{
	const jar = new Jar()
	const c2 = (await register()).body.client_id
	const t = (await getTokens(c2, {}, jar)) as any
	const consents = await (
		await fetch(`${AS}/oauth2/get-consents`, {
			headers: { cookie: jar.header() },
		})
	).json()
	const mine = consents.find((c: any) => c.clientId === c2)
	const del = await fetch(`${AS}/oauth2/delete-consent`, {
		method: 'POST',
		headers: {
			cookie: jar.header(),
			'content-type': 'application/json',
			origin: BASE,
		},
		body: JSON.stringify({ id: mine.id }),
	})
	out('E2. user deletes consent ("disconnect Claude")', {
		status: del.status,
		consentsBefore: consents.length,
	})
	out(
		'E2. refresh after consent deleted (expect invalid_grant; Better Auth?)',
		await token({
			grant_type: 'refresh_token',
			refresh_token: t.body.refresh_token,
			client_id: c2,
			resource: MCP,
		}),
	)
	out(
		'E2. old access token after consent deleted',
		await callMcp(t.body.access_token),
	)
}

// F. DCR flood: 40 unauthenticated registrations
{
	const statuses: Record<number, number> = {}
	for (let i = 0; i < 40; i++) {
		const r = await register()
		statuses[r.status] = (statuses[r.status] ?? 0) + 1
	}
	out('F. 40 anonymous DCR registrations in a row (NODE_ENV unset)', statuses)
}
