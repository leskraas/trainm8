// PROTOTYPE, wipe me (#552). One fetch handler: Better Auth at /api/auth plus
// the root /.well-known documents, a dual-era MCP endpoint at /mcp behind
// requireMcpAuth with per-tool step-up, and bare login and consent pages.
import { requireMcpAuth } from '@better-auth/mcp'
import { serve } from '@hono/node-server'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { createInsufficientScopeError } from 'better-auth/oauth2'
import * as z from 'zod/v4'
import { auth, BASE_URL, IS_LOCAL, prisma, RESOURCE } from './auth.mts'
import { epicSessionStorage, getEpicUserId } from './epic-bridge.mts'

const LEGACY = (process.env.LEGACY ?? 'stateless') as 'stateless' | 'reject'
const port = Number(process.env.PORT ?? 3000)
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

const mcpHandler = createMcpHandler(
	({ era, authInfo }) => {
		log(
			`mcp era=${era} sub=${authInfo?.extra?.userId} client=${authInfo?.clientId}`,
		)
		const server = new McpServer({ name: 'trainm8-spike', version: '0.0.0' })
		server.registerTool(
			'get_week',
			{
				description: "Read the athlete's current training week (spike stub).",
				inputSchema: z.object({}),
				annotations: { readOnlyHint: true },
			},
			async (_args, ctx) => {
				const info = ctx.http?.authInfo
				const user = await prisma.user.findUnique({
					where: { id: info?.extra?.userId as string },
				})
				return {
					content: [
						{
							type: 'text',
							text: `week for ${user?.username} (era=${era}, client=${info?.clientId}, scopes=${info?.scopes.join(' ')})`,
						},
					],
				}
			},
		)
		server.registerTool(
			'propose_week_change',
			{
				description:
					'Propose a change to the week (spike stub; needs training:propose).',
				inputSchema: z.object({}),
			},
			async () => ({
				content: [{ type: 'text', text: 'proposal created (stub)' }],
			}),
		)
		return server
	},
	{ legacy: LEGACY, responseMode: 'json' },
)

// Per-tool step-up. A throw inside a tool handler becomes a tool error in the
// SDK, so the 403 is raised before dispatch. Dispatch runs the body's
// `params.name` on both eras, so the gate checks every body call; `Mcp-Name`
// only adds a name when it disagrees (stepup.mts has the bypass cases).
const TOOL_SCOPES: Record<string, string> = {
	propose_week_change: 'training:propose',
}
/** Every tool the request would call: header and body must agree, and a JSON-RPC batch counts each call. */
async function toolNames(request: Request): Promise<string[]> {
	const header = request.headers.get('mcp-name')
	let names: string[] = []
	try {
		const body = await request.clone().json()
		for (const msg of Array.isArray(body) ? body : [body])
			if (msg?.method === 'tools/call' && typeof msg.params?.name === 'string')
				names.push(msg.params.name)
	} catch {
		// not JSON: nothing to dispatch
	}
	// The 2025 era ignores the header, so never let it hide the body's tool.
	if (header && !names.every((n) => n === header)) names = [...names, header]
	return names
}

const protectedMcp = requireMcpAuth(
	auth,
	async (request, claims) => {
		const scopes = String(claims.scope ?? '')
			.split(' ')
			.filter(Boolean)
		for (const name of await toolNames(request)) {
			const needed = TOOL_SCOPES[name]
			if (needed && !scopes.includes(needed))
				throw createInsufficientScopeError(['training:read', needed])
		}
		const authInfo = {
			token: request.headers
				.get('authorization')!
				.replace(/^(Bearer|DPoP) /i, ''),
			clientId: String(claims.azp ?? claims.client_id),
			scopes,
			expiresAt: claims.exp,
			resource: new URL(RESOURCE),
			extra: { userId: claims.sub },
		}
		return mcpHandler.fetch(request, { authInfo })
	},
	{
		resource: RESOURCE,
		requiredScopes: ['training:read'],
		challengeScopes: ['training:read'],
		// The default is `${BASE_URL}/api/auth/jwks`: a fetch to itself through the
		// public URL (tunnel, Fly edge), and a failed fetch turns every call into 500.
		jwksUrl: `http://127.0.0.1:${port}/api/auth/jwks`,
	},
)

const html = (body: string, headers: Record<string, string> = {}) =>
	new Response(
		`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;max-width:40em;margin:2em auto">${body}</body>`,
		{
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'x-frame-options': 'DENY',
				...headers,
			},
		},
	)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

/** Better Auth answers JSON {redirect,url} when it does not see a navigation; make it a 302. */
async function asRedirect(res: Response) {
	if (res.status >= 300 && res.status < 400) return res
	let body: any
	try {
		body = JSON.parse(await res.clone().text())
	} catch {
		return res
	}
	if (!body?.url) return res
	const headers = new Headers({ location: body.url })
	for (const c of res.headers.getSetCookie()) headers.append('set-cookie', c)
	return new Response(null, { status: 302, headers })
}

async function handle(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const path = url.pathname
	log(request.method, path, request.headers.get('mcp-protocol-version') ?? '')

	if (path.startsWith('/api/auth/') || path.startsWith('/.well-known/'))
		return auth.handler(request)
	if (path === '/mcp') return protectedMcp(request)

	// The authorize endpoint redirects here with a signed query; pass it back as oauth_query.
	// `request` must go along: oauth-provider needs ctx.request (else 401 "request not found").
	if (path === '/login') {
		const oauth_query = url.search.slice(1)
		if (request.method === 'GET') {
			if (await getEpicUserId(request.headers.get('cookie'), prisma)) {
				log('login: Epic session found, bridging')
				return asRedirect(
					await auth.api.epicBridgeSignIn({
						body: { oauth_query },
						headers: request.headers,
						request,
						asResponse: true,
					}),
				)
			}
			const bridgeLink = IS_LOCAL
				? `<p><a href="/epic-login?next=${encodeURIComponent(path + url.search)}">or use an Epic session (bridge)</a></p>`
				: ''
			return html(`<h1>trainm8 spike: sign in</h1>
<form method="post"><input name="email" value="athlete@example.com"> <input name="password" type="password" placeholder="password"> <button>Sign in</button></form>${bridgeLink}`)
		}
		const form = await request.formData()
		return asRedirect(
			await auth.api.signInEmail({
				body: {
					email: String(form.get('email')),
					password: String(form.get('password')),
					oauth_query,
				},
				headers: request.headers,
				request,
				asResponse: true,
			}),
		)
	}

	// Stand-in for Epic's own /login: mints an Epic Session row and en_session cookie. Local only.
	if (path === '/epic-login' && IS_LOCAL) {
		const user = await prisma.user.findUniqueOrThrow({
			where: { username: url.searchParams.get('u') ?? 'athlete' },
		})
		const s = await prisma.session.create({
			data: {
				userId: user.id,
				expirationDate: new Date(Date.now() + 30 * 864e5),
			},
		})
		const cookieSession = await epicSessionStorage.getSession()
		cookieSession.set('sessionId', s.id)
		return new Response(null, {
			status: 302,
			headers: {
				location: url.searchParams.get('next') ?? '/',
				'set-cookie': await epicSessionStorage.commitSession(cookieSession),
			},
		})
	}

	if (path === '/consent') {
		const oauth_query = url.search.slice(1)
		if (request.method === 'GET') {
			const clientId = url.searchParams.get('client_id') ?? ''
			const client = await prisma.oauthClient.findUnique({
				where: { clientId },
			})
			const redirect = JSON.parse(client?.redirectUris ?? '[]')[0]
			return html(`<h1>Allow ${esc(client?.name ?? clientId)}?</h1>
<p>Scopes: <code>${esc(url.searchParams.get('scope') ?? '')}</code></p>
<p>Returns to <b>${esc(redirect ? new URL(redirect).host : '?')}</b></p>
<form method="post"><button name="accept" value="true">Allow</button> <button name="accept" value="false">Deny</button></form>`)
		}
		const form = await request.formData()
		return asRedirect(
			await auth.api.oauth2Consent({
				body: { accept: form.get('accept') === 'true', oauth_query },
				headers: request.headers,
				request,
				asResponse: true,
			}),
		)
	}

	if (path === '/')
		return html(
			`<h1>trainm8 MCP spike</h1><p>Connector URL: <code>${RESOURCE}</code></p>`,
		)
	return new Response('not found', { status: 404 })
}

serve({ fetch: handle, port }, () =>
	log(
		`listening on ${port}; BASE_URL=${BASE_URL} RESOURCE=${RESOURCE} legacy=${LEGACY}`,
	),
)
